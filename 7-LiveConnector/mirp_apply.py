r"""Customer Success Control Tower - apply an Engage Center MIRP check to the account map.

Input is the file written after mirp_collect.js (default: mirp-latest.json next to this script).
For every account in csct-live-config.json whose MIRPWorkspace (a name or a list of names) matches
an Engage Center workspace, it sets MIRPStatus, MIRPAsOf, MIRPConfirmedOn and MIRPConfirmedBy:
  - Confirmed when every workspace of the account is confirmed (the earliest confirmation is kept,
    because it is the first one to need review; a confirmation is valid for 180 days),
  - Pending when any workspace has no confirmation,
  - an approved Exception stays in place until a confirmation appears.
Errors leave the account unchanged. Settings are never modified.

  python mirp_apply.py [results.json] [--dry-run] [--publish] [--force]

--publish asks the running connector to rebuild and then publishes the shared copy.
"""
import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.request
from datetime import date, datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "csct-live-config.json")
DEFAULT_RESULTS = os.path.join(HERE, "mirp-latest.json")
VALID_DAYS = 180
EXCEPTION_DAYS = 182
REVIEW_WARN_DAYS = 30
EXCEPTION_WARN_DAYS = 45
MAX_RESULT_AGE_HOURS = 36
NO_WORKSPACE_NOTE = "No Engage Center workspace for this account among the workspaces you can access."


def norm(text):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", text or "")).strip().casefold()


def clean_person(name):
    name = re.sub(r"\s*\[[^\]]*\]\s*$", "", name or "")
    name = re.sub(r"\s+\d+$", "", name)
    return re.sub(r"\s+", " ", name).strip() or None


def iso_z(value):
    m = re.match(r"^(\d{4}-\d\d-\d\dT\d\d:\d\d)(:\d\d)?", value or "")
    return (m.group(1) + (m.group(2) or ":00") + "Z") if m else None


def day(value):
    return date.fromisoformat(value[:10]) if value else None


def workspaces_of(account):
    ws = account.get("MIRPWorkspace")
    if isinstance(ws, str):
        return [ws] if ws.strip() else []
    return [w for w in (ws or []) if isinstance(w, str) and w.strip()]


def aggregate(results):
    if any(r.get("status") not in ("Confirmed", "Pending") for r in results):
        return None
    if all(r["status"] == "Confirmed" and iso_z(r.get("on")) for r in results):
        first = min(results, key=lambda r: iso_z(r["on"]))
        return {"MIRPStatus": "Confirmed", "MIRPConfirmedOn": iso_z(first["on"]), "MIRPConfirmedBy": clean_person(first.get("by"))}
    return {"MIRPStatus": "Pending"}


def render(raw, accounts):
    head = raw[: raw.index('  "accounts": [')]
    nl = "\r\n" if "\r\n" in raw else "\n"
    lines = ["    { " + ", ".join(json.dumps(k) + ": " + json.dumps(v, ensure_ascii=False) for k, v in a.items()) + " }" for a in accounts]
    return head + '  "accounts": [' + nl + ("," + nl).join(lines) + nl + "  ]" + nl + "}" + nl


def http(method, url, headers=None, timeout=10):
    req = urllib.request.Request(url, data=b"" if method == "POST" else None, method=method, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def publish(port, accounts):
    base = "http://127.0.0.1:%d" % port
    try:
        http("GET", base + "/api/ping", timeout=3)
    except OSError:
        return "connector not running: the shared copy updates after the connector starts (it publishes on start)."
    keys = ("MIRPStatus", "MIRPAsOf", "MIRPConfirmedOn", "MIRPConfirmedBy", "MIRPWorkspace", "MIRPNote")
    want = {a["Title"]: tuple(a.get(k) for k in keys) for a in accounts}
    try:
        http("POST", base + "/api/sync", {"Origin": base})
    except OSError:
        pass
    deadline = time.time() + 300
    while time.time() < deadline:
        try:
            snap = http("GET", base + "/api/snapshot", timeout=15)
            have = {a.get("Title"): tuple(a.get(k) for k in keys) for a in (snap.get("accounts") or [])}
            if have and all(have.get(t) == v for t, v in want.items()):
                res = http("POST", base + "/api/publish", {"X-CSCT": "publish"}, timeout=60)
                return "published the shared copy at %s" % res.get("publishedAt")
        except (OSError, ValueError):
            pass
        time.sleep(5)
    return "connector did not pick up the change within 5 minutes: the shared copy updates at the next hourly publish."


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    flags = {a for a in argv if a.startswith("--")}
    path = args[0] if args else DEFAULT_RESULTS
    with io.open(path, encoding="utf-8-sig") as f:
        res = json.load(f)
    if not res.get("ok"):
        print("MIRP CHECK FAILED: %s" % (res.get("error") or "unknown error"))
        return 2
    checked = datetime.strptime(iso_z(res["checkedAtUtc"]), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    age_h = (datetime.now(timezone.utc) - checked).total_seconds() / 3600
    if age_h > MAX_RESULT_AGE_HOURS and "--force" not in flags:
        print("MIRP CHECK FAILED: results are %.0f hours old; collect again (or use --force)." % age_h)
        return 2

    with io.open(CONFIG_PATH, encoding="utf-8-sig", newline="") as f:
        raw = f.read()
    cfg = json.loads(raw)
    settings = cfg.get("settings") or {}
    tz = int(((settings.get("publish") or {}).get("tzOffsetHours")) or 3)
    today = (checked + timedelta(hours=tz)).date()
    ignore = {norm(n) for n in ((settings.get("mirp") or {}).get("ignoreWorkspaces") or [])}

    by_name = {}
    for r in res.get("results") or []:
        if r.get("status") != "Skipped":
            by_name.setdefault(norm(r.get("name")), []).append(r)
    used, changes, missing, untouched, exceptions = set(), [], [], [], []

    for a in cfg.get("accounts") or []:
        names = workspaces_of(a)
        if not names:
            if a.get("MIRPStatus") in (None, "", "Unknown"):
                a["MIRPStatus"], a["MIRPAsOf"], a["MIRPNote"] = "Unknown", today.isoformat(), NO_WORKSPACE_NOTE
            continue
        found = []
        for n in names:
            hits = by_name.get(norm(n))
            if hits:
                found.extend(hits)
                used.add(norm(n))
            else:
                missing.append("%s: workspace '%s' not visible in Engage Center" % (a["Title"], n))
        if len(found) < len(names):
            continue
        new = aggregate(found)
        if new is None:
            untouched.append("%s: Engage Center returned an error, left unchanged" % a["Title"])
            continue
        old = {k: a.get(k) for k in ("MIRPStatus", "MIRPConfirmedOn", "MIRPConfirmedBy")}
        if old["MIRPStatus"] == "Exception" and new["MIRPStatus"] != "Confirmed":
            approved = day(a.get("MIRPAsOf"))
            if approved:
                left = (approved + timedelta(days=EXCEPTION_DAYS) - today).days
                exceptions.append("%s: exception approved %s, review due around %s (%d days)" % (a["Title"], approved.isoformat(), (approved + timedelta(days=EXCEPTION_DAYS)).isoformat(), left))
            continue
        if old["MIRPStatus"] == "Exception":
            a.pop("MIRPNote", None)
        a["MIRPStatus"], a["MIRPAsOf"] = new["MIRPStatus"], today.isoformat()
        for k in ("MIRPConfirmedOn", "MIRPConfirmedBy"):
            if new.get(k):
                a[k] = new[k]
            else:
                a.pop(k, None)
        if old["MIRPStatus"] != new["MIRPStatus"] or old["MIRPConfirmedOn"] != new.get("MIRPConfirmedOn"):
            what = ("confirmed by %s on %s" % (new.get("MIRPConfirmedBy") or "unknown", new["MIRPConfirmedOn"][:10])) if new["MIRPStatus"] == "Confirmed" else "now pending"
            changes.append("%s: %s -> %s (%s)" % (a["Title"], old["MIRPStatus"] or "not set", new["MIRPStatus"], what))

    pending = [a["Title"] for a in cfg["accounts"] if a.get("MIRPStatus") == "Pending"]
    due = []
    for a in cfg["accounts"]:
        on = day(a.get("MIRPConfirmedOn")) if a.get("MIRPStatus") == "Confirmed" else None
        if on:
            left = (on + timedelta(days=VALID_DAYS) - today).days
            if left <= REVIEW_WARN_DAYS:
                due.append("%s: confirmed %s by %s, review %s %s" % (a["Title"], on.isoformat(), a.get("MIRPConfirmedBy") or "unknown",
                           "overdue since" if left < 0 else "due", (on + timedelta(days=VALID_DAYS)).isoformat()))
    mapped_aliases = [(a["Title"], norm(x)) for a in cfg["accounts"] if not workspaces_of(a) for x in ([a["Title"]] + (a.get("Aliases") or []))]
    unmapped = []
    for key, hits in by_name.items():
        if key in used or key in ignore:
            continue
        for r in hits:
            hint = [t for t, al in mapped_aliases if al and al in key]
            unmapped.append("%s (%s)%s" % (r.get("name"), r.get("status"), (" - possible match: " + ", ".join(sorted(set(hint)))) if hint else ""))

    out = render(raw, cfg["accounts"])
    json.loads(out)
    wrote = out != raw
    if wrote and "--dry-run" not in flags:
        tmp = CONFIG_PATH + ".tmp"
        with io.open(tmp, "w", encoding="utf-8", newline="") as f:
            f.write(out)
        os.replace(tmp, CONFIG_PATH)

    counts = {}
    for r in res.get("results") or []:
        counts[r.get("status")] = counts.get(r.get("status"), 0) + 1
    print("MIRP check %s (Engage Center, %d workspaces: %s)" % (today.isoformat(), len(res.get("results") or []),
          ", ".join("%d %s" % (v, k.lower()) for k, v in sorted(counts.items()))))
    by_status = {}
    for a in cfg["accounts"]:
        st = a.get("MIRPStatus") or "Not set"
        by_status[st] = by_status.get(st, 0) + 1
    order = ("Confirmed", "Pending", "Exception", "Unknown", "Not set")
    print("Accounts: %s (%d in the account map)" % (", ".join("%d %s" % (by_status[k], k.lower()) for k in order if by_status.get(k)), len(cfg["accounts"])))
    sections = (("Changes since the last check", changes), ("Still pending", pending), ("Confirmation review due within %d days" % REVIEW_WARN_DAYS, due),
                ("Exceptions", exceptions), ("Not in the account map", unmapped), ("Problems", missing + untouched))
    for title, items in sections:
        print("%s: %s" % (title, "none" if not items else ""))
        for i in items:
            print("  - " + i)
    print("Account map: %s" % (("updated" if wrote else "no change") if "--dry-run" not in flags else "dry run, not written"))
    if "--publish" in flags and "--dry-run" not in flags:
        print("Shared copy: " + publish(int(settings.get("port") or 8787), cfg["accounts"]))
    return 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv[1:]))
