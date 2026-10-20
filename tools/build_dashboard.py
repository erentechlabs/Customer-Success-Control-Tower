"""Build the public dashboards from code and independently invented sample events."""
import copy
import json
import re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
UI = ROOT / "tools" / "ui"


def read(path):
    return path.read_text(encoding="utf-8-sig")


def script(code):
    return "<script>\n" + code.strip() + "\n</script>"


def json_script(name, value):
    data = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    data = data.replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    return script("const " + name + " = " + data + ";")


def main():
    spec = json.loads(read(ROOT / "tools" / "spec.json"))
    icons = json.loads(read(ROOT / "tools" / "icons.json"))
    sample = json.loads(read(ROOT / "6-SampleData" / "mailbox.sample.json"))
    config = json.loads(read(ROOT / "7-LiveConnector" / "csct-live-config.example.json"))
    port = int(config["settings"]["port"])
    head = read(UI / "head.html").replace("@@STYLE@@", read(UI / "design.css"))
    pages = ["app2-pages.js", "app4-closed.js", "app3-pages.js"]
    shared = ["app1-core.js", "app1b-fold.js", "app1d-attention.js", "app1e-advisory.js"]
    live = "".join(read(UI / name) for name in shared + ["app1c-live.js"] + pages)
    static = "".join(read(UI / name) for name in shared + ["app1c-snapshot.js"] + pages)
    used = sorted(set(re.findall(r'"([a-z0-9_]+_(?:regular|filled))"', live + static)))
    missing = set(used) - set(icons)
    if missing:
        raise ValueError("Missing icons: " + ", ".join(sorted(missing)))
    icon_json = json.dumps({name: icons[name] for name in used}, separators=(",", ":"))
    live = live.replace("/*@@ICONS@@*/{}", icon_json).replace("/*@@PORT@@*/8787", str(port))
    static = static.replace("/*@@ICONS@@*/{}", icon_json)

    def data_uri(svg):
        return "data:image/svg+xml," + quote(svg, safe="=:/ ,'")

    chevron = icons["chevron_down_regular"]
    svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='%s'><path fill='%%s' d='%s'/></svg>" % tuple(chevron)
    check = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M2.25 6.4l2.4 2.35 5.1-5.5' fill='none' stroke='%s' stroke-width='1.5'/></svg>"
    favicon = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect x='3' y='4' width='18' height='13' rx='2' fill='#005fb8'/><path d='M8 21h8M12 17v4' stroke='#005fb8' stroke-width='2'/></svg>"
    for name, value in {
        "@@CHEV_LIGHT@@": data_uri(svg % "#606060"),
        "@@CHEV_DARK@@": data_uri(svg % "#c5c5c5"),
        "@@CHECK_LIGHT@@": data_uri(check % "#ffffff"),
        "@@CHECK_DARK@@": data_uri(check % "#16212a"),
        "@@FAVICON@@": data_uri(favicon),
    }.items():
        head = head.replace(name, value)
    if "@@" in head + live + static:
        raise ValueError("Unreplaced build placeholder")

    engine = script(read(ROOT / "tools" / "engine.js"))
    attention = script(read(ROOT / "7-LiveConnector" / "attention_rules.js"))
    spec_block = json_script("CSCT_SPEC", spec)
    forbidden = re.compile(
        r"\bfetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB"
        r"|document\.cookie|window\.open|location\.(replace|assign)\(|location\.href\s*=|new (Shared)?Worker"
        r"|serviceWorker|<iframe|<object|<embed|<base\b|http-equiv|<script src|rel=\"stylesheet\"|@import|url\(https?:|\bimport\(")
    for name, code in [("head", head), ("engine", engine), ("attention", attention), ("static", static)]:
        found = forbidden.search(code)
        if found:
            raise ValueError(name + " is not sandbox-safe: " + found.group())
    if any(ord(ch) >= 0x1F000 for ch in head + live + static):
        raise ValueError("Emoji glyph in the UI")

    # Build the sharing example only from the invented fixture, never the running connector.
    snapshot = copy.deepcopy(sample)
    for key in ("me", "accountTeamSize"):
        snapshot.pop(key, None)
    snapshot.update(publishedAt=sample["sampleAsOf"], publishedBy="Demo CSAM",
                    emailTextIncluded=False, contactEmailsIncluded=False)
    for account in snapshot["accounts"]:
        for key in ("Aliases", "Domains"):
            account.pop(key, None)
    for event in snapshot["events"]:
        for key in ("link", "domains", "preview", "actorMail"):
            event.pop(key, None)
        event.get("fields", {}).pop("caseLink", None)
        for signal in event.get("signals", []):
            signal.pop("quote", None)
    common = head.rstrip() + "\n" + engine + "\n" + spec_block + "\n" + attention + "\n"
    tail = "\n</body>\n</html>\n"
    outputs = {
        "7-LiveConnector/customer-success-control-tower.html": common + script(live) + tail,
        "7-LiveConnector/snapshot-template.html": common + script("const CSCT_SNAPSHOT = /*@@SNAPSHOT@@*/null;") + "\n" + script(static) + tail,
        "6-SampleData/customer-success-control-tower-demo.html": common + json_script("CSCT_DEMO", sample) + "\n" + script(static) + tail,
        "8-SharedDashboard/Customer-Success-Control-Tower-Example.html": common + json_script("CSCT_SNAPSHOT", snapshot) + "\n" + script(static) + tail,
    }
    for relative, content in outputs.items():
        path = ROOT / relative
        path.write_text(content, encoding="utf-8", newline="\n")
        print(relative, len(content), "characters")


if __name__ == "__main__":
    main()
