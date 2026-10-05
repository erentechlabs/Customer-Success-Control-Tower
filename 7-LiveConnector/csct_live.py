#!/usr/bin/env python3
r"""Customer Success Control Tower - live connector.

Reads Unified support case e-mail from the signed-in user's Outlook mailbox through the WorkIQ CLI
(Microsoft Graph with the user's own delegated permissions), turns every message into a normalised
case event and serves the dashboard plus a JSON snapshot on http://127.0.0.1:<port>/.

Sources
  * notifications@techsupport.microsoft.com  - case created, ownership, severity change, closed
  * TrackingID# threads                        - engineer, customer and account-team correspondence
  * Critical Situation mails                   - CritSit engaged / disengaged
  * Calendar                                   - last and next customer meeting per account

Privacy: case data is held in memory only and the server answers only requests addressed to
127.0.0.1 / localhost on this machine. The one deliberate exception is the shared snapshot: every
10 minutes from 09:00 to 18:00 on business days (settings.publish.everyMinutes / from / to, Istanbul time;
a missed update is published as soon as the connector runs again) a read-only copy of the dashboard is written to
settings.publish.folder (default ..\8-SharedDashboard, synced by OneDrive) for the people that
folder is shared with. Any link to that file (OneDrive, Teams, e-mail) shows the latest copy.
That copy never has mailbox links; e-mail text only if publish.includeEmailText is true, and the sender addresses of
engineers and customer contacts only if publish.includeContactEmails is true.

Usage: Start-ControlTower.cmd / Stop-ControlTower.cmd   start (opens the dashboard) / stop
       Auto-start: "Customer Success Control Tower" shortcut in the Windows Startup folder (shell:startup)
       runs this file at sign-in without opening a browser; disable it in Task Manager > Startup apps.
       Only one connector runs per user; a second launch exits (with --open it just opens the dashboard).
       pythonw csct_live.py [--open]      run the connector (and open the dashboard)
       python  csct_live.py --once        one sync, print a summary, exit
       python  csct_live.py --publish     one sync, publish the shared snapshot now, exit
       POST /api/publish (header X-CSCT: publish) publishes from the running connector.
Settings and the account map (aliases, domains, MIRP status, contract end, CSM concern) are in
csct-live-config.json next to this file; changes apply on the next sync.
"""
import html
import json
import os
import re
import subprocess
import sys
import threading
import time
import traceback
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = "1.4.0"
HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "csct-live-config.json")
TEMPLATE_PATH = os.path.join(HERE, "snapshot-template.html")
SNAP_PLACEHOLDER = "/*@@SNAPSHOT@@*/null"
LOG_DIR = os.path.join(os.environ.get("LOCALAPPDATA") or HERE, "CSCT")
NO_WINDOW = 0x08000000 if os.name == "nt" else 0
GRAPH = "https://graph.microsoft.com/v1.0"
NOTIF = "notifications@techsupport.microsoft.com"
SELECT = "id,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,bodyPreview,uniqueBody,webLink"
DEFAULT_PUBLISH = {
    "enabled": True, "everyMinutes": 10, "from": "09:00", "to": "18:00", "tzOffsetHours": 3, "folder": "..\\8-SharedDashboard",
    "fileName": "Customer-Success-Control-Tower-Daily.html", "includeEmailText": False, "includeContactEmails": False,
}
DEFAULT_SETTINGS = {
    "port": 8787, "pollSeconds": 60, "fullSyncMinutes": 60, "lookbackDays": 120,
    "calendarPastDays": 120, "calendarFutureDays": 60, "staleCaseDays": 21,
    "dashboard": "customer-success-control-tower.html", "accountTeam": [],
    "publish": DEFAULT_PUBLISH,
}


# ----------------------------------------------------------------------------- utilities
def now_utc():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(msg):
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        path = os.path.join(LOG_DIR, "connector.log")
        if os.path.exists(path) and os.path.getsize(path) > 1_000_000:
            os.replace(path, path + ".1")
        with open(path, "a", encoding="utf-8") as f:
            f.write(now_utc().strftime("%Y-%m-%d %H:%M:%SZ") + "  " + msg + "\n")
    except OSError:
        pass


def load_config():
    try:
        with open(CONFIG_PATH, encoding="utf-8-sig") as f:
            cfg = json.load(f)
    except (OSError, ValueError) as err:
        log("config not loaded: %s" % err)
        cfg = {}
    settings = dict(DEFAULT_SETTINGS)
    settings.update(cfg.get("settings") or {})
    settings["publish"] = dict(DEFAULT_PUBLISH, **((cfg.get("settings") or {}).get("publish") or {}))
    return settings, [a for a in (cfg.get("accounts") or []) if a.get("Title")]


def addr_of(recipient):
    return (((recipient or {}).get("emailAddress") or {}).get("address") or "").strip().lower()


def name_of(recipient):
    return (((recipient or {}).get("emailAddress") or {}).get("name") or "").strip()


def domain_of(addr):
    return addr.rsplit("@", 1)[-1] if "@" in addr else ""


def is_ms_domain(d):
    return d == "microsoft.com" or d.endswith(".microsoft.com") or d.endswith("microsoftsupport.com")


def fold_tr(s):
    return s.translate(str.maketrans("çğıöşüâîûÇĞİÖŞÜÂÎÛ", "cgiosuaiuCGIOSUAIU"))


def norm(s):
    return re.sub(r"[^a-z0-9]", "", fold_tr((s or "").lower()))


def person(name):
    name = re.sub(r"\s*\([^)]*\)\s*", " ", name or "").strip()
    return re.sub(r"\s+", " ", name)


# Engineers often write through a shared support mailbox; their own address is in the signature of the new part
# of the message, e.g. "Jane Doe (v-janedoe@microsoft.com)".
SHARED_MAILBOX_RX = re.compile(r"^supportmail@", re.I)
QUOTE_SPLIT_RX = re.compile(r"\n\s*(?:From|Sent|Gönderen|Kimden|Von|De)\s*:|\n\s*-{2,}\s*Original Message|\nOn .{5,120} wrote:", re.I)
MS_MAIL = r"[\w.+-]+@microsoft\.com"


def signature_mail(text, name):
    top = QUOTE_SPLIT_RX.split(text or "", 1)[0]
    parts = person(name).split()
    first = next((p for p in parts if len(p) >= 3), max(parts, key=len) if parts else "")
    if len(first) < 2:
        return ""
    m = re.search(re.escape(first) + r"[^\n()<>\[\]@]{0,40}[(<\[]\s*(?:mailto:)?(" + MS_MAIL + r")\s*[)>\]]", top, re.I)
    if m:
        return m.group(1).lower()
    lines = top.split("\n")
    at = [k for k, line in enumerate(lines) if first.lower() in line.lower()]
    for k in range(at[-1], min(at[-1] + 3, len(lines))) if at else ():
        if k > at[-1] and re.search(r"manager|lead|supervisor|escalat|backup|advisor|\bTA\b|\bcc\b", lines[k], re.I):
            break
        m = re.search(MS_MAIL, lines[k], re.I)
        if m:
            return m.group(0).lower()
    return ""


# ----------------------------------------------------------------------------- Graph via WorkIQ CLI
class GraphError(Exception):
    pass


def workiq_exe():
    override = os.environ.get("CSCT_WORKIQ_EXE")
    if override and os.path.exists(override):
        return override
    cmd = os.path.join(os.path.expanduser("~"), ".scout", "bin", "workiq.cmd")
    try:
        with open(cmd, encoding="utf-8", errors="replace") as f:
            m = re.search(r'"([^"]*workiq\.exe)"', f.read())
    except OSError:
        m = None
    if m and os.path.exists(m.group(1)):
        return m.group(1)
    raise GraphError("WorkIQ CLI not found. Open Microsoft Scout and sign in to Microsoft 365, then retry.")


def graph_get(path):
    try:
        p = subprocess.run([workiq_exe(), "fetch", "-u", path], capture_output=True, timeout=180, creationflags=NO_WINDOW)
    except subprocess.TimeoutExpired:
        raise GraphError("Microsoft Graph request timed out")
    out = p.stdout.decode("utf-8", "replace")
    i = out.find("{")
    if i < 0:
        lines = (p.stderr.decode("utf-8", "replace") or out).strip().splitlines()
        raise GraphError((lines[-1] if lines else "WorkIQ CLI returned no data (exit %d)" % p.returncode)[:300])
    try:
        data, _ = json.JSONDecoder().raw_decode(out[i:])
    except ValueError:
        raise GraphError("Could not read the Microsoft Graph response")
    if isinstance(data, dict) and data.get("error"):
        e = data["error"]
        raise GraphError(((e.get("code") or "Error") + ": " + (e.get("message") or ""))[:300])
    return data


def graph_all(path, max_pages=20):
    items, pages = [], 0
    while path and pages < max_pages:
        data = graph_get(path)
        pages += 1
        items += data.get("value") or []
        nxt = data.get("@odata.nextLink")
        path = nxt.replace(GRAPH, "") if nxt else None
    return items


# ----------------------------------------------------------------------------- message parsing
# Patterns below match both English and Turkish wording, because customer and support e-mail arrives in both languages.
TRACK_RX = re.compile(r"TrackingID#\s*(\d{16})(\d{3})?(?!\d)", re.I)
CASE_RX = re.compile(r"\bcase(?:\s+number)?\s*[:#]?\s*(\d{16})(\d{3})?(?!\d)", re.I)
BARE_RX = re.compile(r"(?<!\d)(2[4-9](?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{10})(\d{3})?(?!\d)")
BANNER_RX = re.compile(
    r"^(hizmete özel|genel|kişisel veri|kişisel|internal|public|general|confidential|dahili|\[external\]|\[dış\])$"
    r"|bu iletiyi alan bazı kullanıcılar|some people who received this message don'?t often get email"
    r"|learn why this is important|bunun neden önemli olduğunu öğrenin|caution: this (e-?mail|message) originated", re.I)
CUT_RX = re.compile(r"^(from|kimden|gönderen)\s*:|^-{2,}\s*original message|^_{8,}|^on .{6,120} wrote:$|^.{6,120} tarihinde .{0,80} şunu yazdı:$", re.I)
SUBMIT_RX = re.compile(r"successfully submitted to Microsoft Support|your (question|request) (was|has been) (successfully )?(submitted|received)", re.I)
CRIT_ANY_RX = re.compile(r"Critical Situation|CritSit", re.I)
CRIT_END_RX = re.compile(r"Severity Reduc|no longer actively|has now disengaged|disengag", re.I)
ARCHIVE_RX = re.compile(r"\b(temporary\s+)?archiv(al|ed)\b", re.I)
CLOSURE_RX = re.compile(
    r"was (my|our|a) (great |sincere |real )?pleasure (to |of )?(assist|work|help|support)|pleasure (working|assisting) (with )?you"
    r"|proceed(ing)? with (the )?(case )?(closure|closing|archiv)|will now be (archived|closed)|(is|has been) now (archived|closed)"
    r"|(we|i) (will|can|shall) (now |go ahead and )?(close|archive) (this|the|your) (case|support request|service request|ticket|request|incident)"
    r"|closure (summary|email|confirmation)|\[closure\]|kapat(ıyorum|ıyoruz|ılmıştır|abiliriz)", re.I)
INTRO_RX = re.compile(r"my name is|scope agreement|thank you for contacting|i am the support (engineer|professional)|i will be (working|assisting)", re.I)
MS_WORKING_RX = re.compile(
    r"\b(we are|we're|i am|i'm) (currently |still |now )?(working|testing|investigating|reviewing|checking|analy[sz]ing|reproducing|conducting|consulting|collaborating|engaging)"
    r"|\b(will|shall) (share|send|provide|get back|follow up|update you)|\b(engaged|consulted|reached out to) (the )?(product group|product team|PG|escalation|backend|senior)", re.I)
MS_PG_RX = re.compile(r"\b(awaiting|waiting (for|on)) (an? )?(update|response|feedback|fix|confirmation) from (the )?(product group|product team|PG|backend|engineering)\b|\bwith (the )?product group\b", re.I)
MS_ASK_RX = re.compile(
    r"\b(please|kindly|could you|can you|would you)\b[^.?!\n]{0,40}\b(share|provide|send|confirm|let (me|us) know|run|collect|upload|check|test|try|apply|update (me|us))\b"
    r"|\b(waiting|await(ing)?) (for )?your (response|reply|confirmation|update|feedback|logs|availability)\b|\b(have not|haven't) heard (back )?from you\b"
    r"|\bbased on (your|the) availability\b", re.I)
EXEC_RX = re.compile(r"\b(CIO|CEO|CTO|CISO|COO|CFO|board of directors|executive management|genel müdür\w*|yönetim kurulu|üst yönetim\w*)\b")
CUST_CLOSE_RX = re.compile(
    r"\b(you can|you may|please|feel free to|we agree to|ok to|okay to|fine to)\b[^.!?\n]{0,25}\b(close|closing|archive|archiving)\b"
    r"|\b(you can|you may|please) proceed (with|to) (the )?(clos|archiv)\w*|kapatabilirsiniz|kapatılabilir|arşivleyebilirsiniz", re.I)
ANGRY_RX = re.compile(r"\b(unacceptable|not acceptable|immediately|extremely (disappointed|frustrated)|legal action|terminate)\b|kabul edilemez|derhal|hukuki", re.I)
# Automated Microsoft senders (ITSM/ServiceNow, no-reply) are system notices, not engineer updates.
SYSTEM_SENDER_RX = re.compile(r"^(snwprod|noreply|no-reply|donotreply|do-not-reply|mailer-daemon|postmaster)@|@(itsm|servicenow)\.", re.I)
# Teams chat items synced into the mailbox (sender 19:...@thread.v2, usually as the display name) are internal chat, not case correspondence.
CHAT_SENDER_RX = re.compile(r"@thread\.(v2|skype)$|^19:", re.I)


def is_chat_item(m):
    frm = m.get("from") or {}
    return bool(CHAT_SENDER_RX.search(addr_of(frm)) or CHAT_SENDER_RX.search(name_of(frm)))
SIGNAL_RULES = [
    ("Escalation Request", "Escalation", "Asked to escalate",
     r"\b(please|kindly|we (would like|want|need|have) to|i (would like|want|need) to|can (you|we)|could you)\b[^.!?\n]{0,60}\bescalat(e|ion|ing)\b"
     r"|\bescalate (this|the|our|my) (case|issue|ticket|request|problem)\b|\beskale\s+(ed|et)\w*"
     r"|üst\s+(yönetim|yönetime|seviyeye)\w*\s+(ilet|taşı|aktar|bildir)\w*|(yöneticiniz|müdürünüz)\w*\s+(ile\s+)?(görüş|konuş|ilet)\w*"),
    ("Complaint", "Response time", "Waiting for a response",
     r"\bstill waiting (for|on) (your|a|an|any|the)? ?(response|reply|update|feedback|answer|solution|resolution|fix|news)\b|\bstill waiting (for|on) (you|microsoft)\b"
     r"|\bstill waiting\s*[.!]|\bwaiting since (last|\d)|\bwaiting for (a|one|two|three|\d+) (week|day)s?\b|\bno (meaningful |further |any )?(update|response|reply|feedback) (yet|since|for)\b"
     r"|\bhave ?n[o']t (heard|received) (back|any)\b|\bno ?one (has )?(responded|replied|contacted)\b|\bnobody (has )?(responded|replied|contacted)\b"
     r"|h[aâ]l[aâ] bekl\w*|(yanıt|cevap|dönüş)\s+(alamadık|alamıyoruz|verilmedi|gelmedi)"),
    ("Complaint", "Resolution quality", "Not satisfied with progress",
     r"\b(not acceptable|unacceptable|very disappointed|disappointed|poor (support|service|quality)|very (poor|bad|slow)|(issue|problem) (still )?persists"
     r"|still (not )?(resolved|fixed|working)|not (resolved|fixed) yet)\b|kabul edilemez|memnun değil\w*|h[aâ]l[aâ] (çözülmedi|çözülemedi)|sorun devam ediyor"),
    ("Complaint", "Engineer handling", "Engineer handling",
     r"\b(explain(ed)? (it |this )?again|keeps? changing (the )?engineer|new engineer (again|every)|every time the case (moves|is transferred))\b"
     r"|tekrar tekrar anlat\w*|mühendis (sürekli )?değiş\w*"),
    ("Additional Request", "RCA / post-incident report", "RCA requested",
     r"\bRCA\b|\broot[- ]cause (analysis|report|document)\b|\bpost[- ]incident (report|review)\b|\bpreventive action\b|kök neden"),
    ("Additional Request", "Call / meeting with SME", "Call with an expert requested",
     r"\b(meeting|call|session|bridge) with (an? |the )?(SME|expert|specialist|product (group|team)|escalation engineer)\b|\bsubject[- ]matter expert\b"
     r"|uzman\w*\s+(ile\s+)?(görüşme|toplantı)\w*"),
    ("Additional Request", "Action plan / documentation", "Action plan or document requested",
     r"\b(written action plan|action plan|official (statement|document|letter)|written (summary|confirmation|report))\b|aksiyon planı|resmi (yazı|doküman|belge)"),
    ("Additional Request", "Workshop / session", "Workshop requested",
     r"\b(workshop|training session|knowledge transfer|enablement session)\b|eğitim (talebi|oturumu)|bilgi transferi"),
]
SIGNAL_RULES = [(t, c, lbl, re.compile(rx, re.I)) for t, c, lbl, rx in SIGNAL_RULES]


def html_to_text(h):
    h = re.sub(r"(?is)<(script|style|head)\b.*?</\1>", " ", h or "")
    h = re.sub(r"(?i)<br\s*/?>|</(p|div|li|tr|h\d)>", "\n", h)
    h = re.sub(r"(?s)<[^>]+>", " ", h)
    h = html.unescape(h).replace("\xa0", " ").replace("\u200b", "").replace("\r", "")
    out = []
    for line in h.split("\n"):
        line = re.sub(r"[ \t\f\v]+", " ", line).strip()
        if not line or BANNER_RX.search(line):
            continue
        if CUT_RX.search(line) and out:
            break
        out.append(line)
    return "\n".join(out)


def case_link(h):
    for href in re.findall(r'href="([^"]+)"', h or ""):
        href = html.unescape(href)
        if "safelinks.protection.outlook.com" in href:
            href = (urllib.parse.parse_qs(urllib.parse.urlparse(href).query).get("url") or [""])[0]
        if "crm.dynamics.com" in href and "incident" in href:
            return href
    return None


def clean_subject(s):
    s = re.sub(r"\s*[-|]?\s*TrackingID#\s*\d+\s*$", "", s or "")
    s = re.sub(r"^(\s*(re|fw|fwd|ynt|ilt|aw|sv|antw)\s*:\s*|\s*\[(external|dış|dis|closure|ext)\]\s*)+", "", s, flags=re.I)
    return s.strip(" -|\u00a0")


def find_case(subject, text, known):
    for rx in (TRACK_RX, CASE_RX, BARE_RX):
        m = rx.search(subject or "")
        if m:
            return m.group(1), bool(m.group(2))
    m = TRACK_RX.search((text or "")[:6000])
    if m:
        return m.group(1), bool(m.group(2))
    for m in BARE_RX.finditer((text or "")[:6000]):
        if m.group(1) in known:
            return m.group(1), bool(m.group(2))
    return None, False


def sentence_at(text, pos):
    start = max(text.rfind(ch, 0, pos) for ch in ".!?\n") + 1
    ends = [i for i in (text.find(ch, pos) for ch in ".!?\n") if i >= 0]
    end = min(ends) + 1 if ends else len(text)
    s = re.sub(r"\s+", " ", text[start:end]).strip()
    return s if len(s) <= 260 else s[:257].rstrip() + "..."


def detect_signals(text):
    body = text[:3000]
    found, seen = [], set()
    for stype, cat, label, rx in SIGNAL_RULES:
        if stype in seen:
            continue
        m = rx.search(body)
        if m:
            seen.add(stype)
            found.append({"type": stype, "category": cat, "label": label, "phrase": m.group(0).strip()[:60], "quote": sentence_at(body, m.start())})
    return found


def notification_event(subject, text, ev):
    if re.search(r"created with severity", subject, re.I):
        m = re.search(r"created with severity\s*:?\s*(\w)", subject, re.I)
        ev.update(kind="created", sev=m.group(1).upper() if m else None)
    elif re.search(r"Ownership accepted", subject, re.I):
        m = re.search(r"Ownership accepted\s*:\s*(.*?)\s*took ownership.*?severity\s*(\w)", subject, re.I)
        ev.update(kind="ownership", engineer=person(m.group(1)) if m else "", sev=m.group(2).upper() if m else None)
    elif re.search(r"Severity Change", subject, re.I):
        m = re.search(r"from\s+(\w)\s+to\s+(\w)", subject, re.I)
        ev.update(kind="severity", sevFrom=m.group(1).upper() if m else None, sevTo=m.group(2).upper() if m else None)
    elif re.search(r"re-?opened", subject, re.I):
        ev.update(kind="reopened")
    elif re.search(r"closed", subject, re.I):
        m = re.search(r"closed as\s+([^\n]+)", text, re.I)
        ev.update(kind="closed", resolution=m.group(1).strip().rstrip(".") if m else "Closed")
    elif ARCHIVE_RX.search(subject):
        ev.update(kind="archived", resolution="Archived")
    else:
        ev.update(kind="notification")
    fields = {}
    for key, name in (("Case Title", "caseTitle"), ("Support Area Path", "areaPath"), ("Customer Name", "customerName"), ("Service Name", "serviceName")):
        m = re.search(r"(?:^|\n)\s*\*?\s*" + key + r"\s*:\s*([^\n]+)", text)
        if m:
            fields[name] = m.group(1).strip()
    return fields


def classify(m, text, raw_html, case_id, crit, team, me):
    subject = m.get("subject") or ""
    frm = m.get("from") or {}
    addr, name = addr_of(frm), name_of(frm)
    recips = [addr_of(r) for r in (m.get("toRecipients") or []) + (m.get("ccRecipients") or [])]
    ev = {
        "caseId": case_id, "t": m.get("receivedDateTime") or m.get("sentDateTime"),
        "title": clean_subject(subject), "link": m.get("webLink"),
        "domains": sorted({d for d in (domain_of(a) for a in [addr] + recips) if d and not is_ms_domain(d)}),
    }
    if addr == NOTIF:
        ev["role"], ev["actor"] = "system", "Support notification"
        fields = notification_event(subject, text, ev)
        link = case_link(raw_html)
        if link:
            fields["caseLink"] = link
        ev["fields"] = fields
        return ev
    ev["preview"] = re.sub(r"\s+", " ", text).strip()[:280]
    if is_ms_domain(domain_of(addr)):
        if addr in team:
            ev.update(role="account_team", kind="account_team", actor="You" if addr == me else person(name))
        elif SUBMIT_RX.search(subject + " " + text[:400]):
            ev.update(role="system", kind="submitted", actor="Microsoft Support")
        elif crit or CRIT_ANY_RX.search(subject):
            ended = CRIT_END_RX.search(subject) or CRIT_END_RX.search(text[:600])
            ev.update(role="system", kind="critsit_end" if ended else "critsit_start", actor="Critical Situation Management")
        elif ARCHIVE_RX.search(subject):
            ev.update(role="system", kind="archived", actor="Microsoft Support", resolution="Archived")
        elif person(name).lower() in ("microsoft support", "microsoft", "") or SYSTEM_SENDER_RX.search(addr):
            ev.update(role="system", kind="notification", actor="Microsoft Support")
        else:
            ev.update(role="engineer", kind="ms_update", actor=person(name) or addr, actorMail=addr)
            sig = signature_mail(text, name)
            if sig:
                ev["sigMail"] = sig
            head = text[:1500]
            if (CLOSURE_RX.search(subject + "\n" + head) and not INTRO_RX.search(text[:600])) or re.search(r"\[closure\]", subject, re.I):
                ev["closure"] = True
            elif MS_PG_RX.search(head):
                ev["ball"] = "Product Group"
            elif MS_ASK_RX.search(head):
                ev["ball"] = "Customer"
            elif MS_WORKING_RX.search(head):
                ev["ball"] = "Microsoft"
        return ev
    ev.update(role="customer", kind="customer_update", actor=person(name) or addr, actorMail=addr)
    sigs = detect_signals(text)
    if sigs:
        ev["signals"] = sigs
    if EXEC_RX.search(text[:3000]):
        ev["exec"] = True
    if CUST_CLOSE_RX.search(text[:1200]):
        ev["closure"] = True
    voice = [s for s in sigs if s["type"] != "Additional Request"]
    if voice and (ANGRY_RX.search(text[:3000]) or len(voice) > 1):
        ev["sentiment"] = "Angry"
    elif voice:
        ev["sentiment"] = "Frustrated"
    return ev


# ----------------------------------------------------------------------------- account resolution
def pretty_domain(d):
    return d.split(".")[0].replace("-", " ").title()


def pretty_name(name):
    # Contract-style customer names ("<Group>-UnifiedEnterprise-<Account> 2026-2027") keep only the account part.
    n = re.sub(r"^[^-]+-unif\w*enterprise-", "", name.strip(), flags=re.I)
    n = re.sub(r"[-\s]*\d{4}\s*-\s*\d{4}$", "", n).strip(" -")
    if re.fullmatch(r"[\w.-]+\.[a-z]{2,}", n, re.I):
        return pretty_domain(n)
    return n


def resolve_account(name, doms, text, accounts):
    if name:
        n = norm(name)
        for a in accounts:
            for al in [a["Title"]] + list(a.get("Aliases") or []):
                k = norm(al)
                if len(k) >= 4 and k in n:
                    return a["Title"], "Customer name in the case notification: " + name
    for a in accounts:
        for d in a.get("Domains") or []:
            d = d.lower()
            if any(x == d or x.endswith("." + d) for x in doms):
                return a["Title"], "Customer e-mail domain: " + d
    t = norm(text)
    for a in accounts:
        for al in [a["Title"]] + list(a.get("Aliases") or []):
            k = norm(al)
            if len(k) >= 6 and k in t:
                return a["Title"], "Account named in the case e-mails: " + al
    if name:
        return pretty_name(name), "Customer name in the case notification (not in the account map): " + name
    if doms:
        d = sorted(doms)[0]
        return pretty_domain(d), "Customer e-mail domain (not in the account map): " + d
    return "Unassigned", "No customer name or customer e-mail domain in the visible e-mails"


# ----------------------------------------------------------------------------- state
class State:
    def __init__(self):
        self.lock = threading.RLock()
        self.messages = {}
        self.texts = {}
        self.calendar = []
        self.me = {}
        self.version = 0
        self.snapshot = b""
        self.wake = threading.Event()
        self.status = {"state": "starting", "phase": "Starting", "lastSuccess": None, "lastAttempt": None, "error": None,
                       "messages": 0, "cases": 0, "pollSeconds": DEFAULT_SETTINGS["pollSeconds"], "connector": VERSION}

    def set_status(self, **kw):
        with self.lock:
            self.status.update(kw)

    def add_messages(self, items):
        changed = 0
        with self.lock:
            for m in items:
                mid = m.get("id")
                if not mid:
                    continue
                old = self.messages.get(mid)
                if old is None or old.get("subject") != m.get("subject") or old.get("receivedDateTime") != m.get("receivedDateTime"):
                    self.messages[mid] = m
                    raw = (m.get("uniqueBody") or {}).get("content") or ""
                    text = html_to_text(raw) if raw else (m.get("bodyPreview") or "")
                    self.texts[mid] = (text, raw if addr_of(m.get("from")) == NOTIF else "")
                    changed += 1
        return changed

    def known_cases(self):
        with self.lock:
            return {cid for cid, _ in (find_case(m.get("subject"), self.texts[mid][0], set()) for mid, m in self.messages.items()) if cid}


STATE = State()


def build_snapshot():
    settings, accounts_cfg = load_config()
    with STATE.lock:
        messages = list(STATE.messages.values())
        texts = dict(STATE.texts)
        me = dict(STATE.me)
        calendar = list(STATE.calendar)
    me_mail = (me.get("mail") or me.get("userPrincipalName") or "").lower()
    team = {a.lower() for a in settings.get("accountTeam") or []}
    if me_mail:
        team.add(me_mail)
    for m in messages:
        if addr_of(m.get("from")) == NOTIF:
            for r in (m.get("toRecipients") or []) + (m.get("ccRecipients") or []):
                a = addr_of(r)
                if is_ms_domain(domain_of(a)) and not a.startswith("notifications@"):
                    team.add(a)
    cutoff = iso(now_utc() - timedelta(days=int(settings["lookbackDays"])))
    first, known = {}, set()
    for m in messages:
        if is_chat_item(m):
            continue
        cid, crit = find_case(m.get("subject"), texts[m["id"]][0], set())
        if cid:
            first[m["id"]] = (cid, crit)
            known.add(cid)
    events = []
    for m in messages:
        if (m.get("receivedDateTime") or m.get("sentDateTime") or "") < cutoff:
            continue
        if is_chat_item(m):
            continue
        text, raw = texts[m["id"]]
        cid, crit = first.get(m["id"]) or find_case(m.get("subject"), text, known)
        if cid:
            events.append(classify(m, text, raw, cid, crit, team, me_mail))
    events.sort(key=lambda e: e["t"])
    # A sender address used by several engineers is a shared support mailbox, not a way to reach one person.
    firsts = {}
    for e in events:
        if e.get("kind") == "ms_update" and e.get("actorMail"):
            firsts.setdefault(e["actorMail"], set()).add((person(e.get("actor")).split() or [""])[0].lower())
    for e in events:
        sig = e.pop("sigMail", None)
        a = e.get("actorMail")
        if e.get("kind") == "ms_update" and a and (SHARED_MAILBOX_RX.search(a) or len(firsts.get(a, ())) > 1):
            e["actorMail"] = sig or ""

    by_case = {}
    for e in events:
        by_case.setdefault(e["caseId"], []).append(e)
    case_meta, discovered = {}, {}
    cfg_titles = {a["Title"] for a in accounts_cfg}
    for cid, evs in by_case.items():
        names = [e["fields"]["customerName"] for e in evs if (e.get("fields") or {}).get("customerName")]
        doms = set()
        for e in evs:
            doms.update(e.get("domains") or [])
        text = " ".join(filter(None, [e.get("title") for e in evs] + [e.get("preview") for e in evs] + [(e.get("fields") or {}).get("caseTitle") for e in evs]))
        acc, src = resolve_account(names[-1] if names else None, doms, text, accounts_cfg)
        case_meta[cid] = {"account": acc, "accountSource": src}
        if acc not in cfg_titles:
            discovered[acc] = src

    now_s = iso(now_utc())
    accounts = []
    for a in accounts_cfg + [{"Title": k, "Source": "Discovered in case e-mails"} for k in sorted(discovered)]:
        doms = [d.lower() for d in a.get("Domains") or []]
        hit = lambda ds: any(x == d or x.endswith("." + d) for x in ds for d in doms)
        past = [t for t, ds in calendar if t <= now_s and hit(ds)]
        future = [t for t, ds in calendar if t > now_s and hit(ds)]
        accounts.append({
            "Title": a["Title"], "Group": a.get("Group"), "AccountId": a.get("AccountId"),
            "Aliases": "; ".join(a.get("Aliases") or []), "Domains": doms,
            "Segment": a.get("Segment"), "Industry": a.get("Industry"), "StrategicTier": a.get("StrategicTier"),
            "ContractType": a.get("ContractType"), "ContractEnd": a.get("ContractEnd"),
            "CSMConcern": a.get("CSMConcern") or "None", "CSMConcernNote": a.get("CSMConcernNote"),
            "MIRPStatus": a.get("MIRPStatus"), "MIRPAsOf": a.get("MIRPAsOf"),
            "MIRPConfirmedOn": a.get("MIRPConfirmedOn"), "MIRPConfirmedBy": a.get("MIRPConfirmedBy"), "MIRPWorkspace": a.get("MIRPWorkspace"),
            "MIRPNote": a.get("MIRPNote"),
            "CustomerExecSponsor": a.get("CustomerExecSponsor"),
            "LastTouchpoint": max(past) if past else None, "NextTouchpoint": min(future) if future else None,
            "AccountRiskScore": None, "Source": a.get("Source") or "Account map",
        })
    snap = {
        "generatedAt": now_s, "me": {"name": me.get("displayName"), "mail": me_mail}, "accountTeamSize": len(team),
        "settings": {"staleCaseDays": int(settings["staleCaseDays"]), "pollSeconds": int(settings["pollSeconds"]),
                     "publishTimes": ["%02d:%02d" % t for t in publish_times(settings["publish"])] if settings["publish"].get("enabled") else []},
        "accounts": accounts, "cases": case_meta, "events": events,
    }
    with STATE.lock:
        STATE.version += 1
        snap["version"] = STATE.version
        STATE.status.update(messages=len(messages), cases=len(by_case), pollSeconds=int(settings["pollSeconds"]))
        STATE.snapshot = json.dumps(snap, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return snap


# ----------------------------------------------------------------------------- daily shared snapshot
def publish_target(p):
    folder = os.path.normpath(os.path.join(HERE, p["folder"]))
    return folder, os.path.join(folder, p["fileName"])


def sanitize(snap, include_text, include_mail=False):
    """Copy of the snapshot for sharing: no mailbox links; e-mail text and sender addresses only if configured."""
    out = {k: v for k, v in snap.items() if k not in ("sync", "me", "accountTeamSize")}
    events = []
    for e in snap.get("events") or []:
        e = {k: v for k, v in e.items() if k not in ("link", "domains")}
        if not include_mail:
            e.pop("actorMail", None)
            if "@" in (e.get("actor") or ""):
                # Sender without a display name: keep the mailbox name, never the address.
                e["actor"] = e["actor"].split("@")[0]
        if e.get("fields"):
            e["fields"] = {k: v for k, v in e["fields"].items() if k != "caseLink"}
        if not include_text:
            e.pop("preview", None)
            if e.get("signals"):
                e["signals"] = [{k: v for k, v in s.items() if k != "quote"} for s in e["signals"]]
        events.append(e)
    out["events"] = events
    out["accounts"] = [{k: v for k, v in a.items() if k not in ("Aliases", "Domains")} for a in snap.get("accounts") or []]
    return out


def publish(reason):
    settings, _ = load_config()
    p = settings["publish"]
    with STATE.lock:
        raw = STATE.snapshot
    if not raw:
        raise RuntimeError("no case data yet; wait for the first sync")
    snap = json.loads(raw.decode("utf-8"))
    body = sanitize(snap, bool(p.get("includeEmailText")), bool(p.get("includeContactEmails")))
    body.update(publishedAt=iso(now_utc()), publishedBy=(snap.get("me") or {}).get("name"),
                emailTextIncluded=bool(p.get("includeEmailText")), contactEmailsIncluded=bool(p.get("includeContactEmails")))
    with open(TEMPLATE_PATH, encoding="utf-8") as f:
        template = f.read()
    if template.count(SNAP_PLACEHOLDER) != 1:
        raise RuntimeError("snapshot-template.html is missing or damaged")
    data = json.dumps(body, ensure_ascii=False, separators=(",", ":"))
    data = data.replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    folder, path = publish_target(p)
    os.makedirs(folder, exist_ok=True)
    # Written in place (not replaced) so OneDrive keeps the same item and any existing share keeps working.
    with open(path, "w", encoding="utf-8-sig", newline="\n") as f:
        f.write(template.replace(SNAP_PLACEHOLDER, data))
    STATE.set_status(lastPublish=body["publishedAt"], publishPath=path, publishError=None)
    log("published %s (%s)" % (path, reason))
    return path, body["publishedAt"]


def _minutes(value, default):
    try:
        hh, mm = (int(x) for x in str(value).split(":"))
    except ValueError:
        return default
    return hh * 60 + mm if 0 <= hh < 24 and 0 <= mm < 60 else default


def publish_times(p):
    """Business-day publish times as sorted (hour, minute) pairs: every `everyMinutes` from `from` to `to`
    (Istanbul time), or the explicit `times` list ("HH:MM") when everyMinutes is 0."""
    try:
        every = int(p.get("everyMinutes") or 0)
    except (TypeError, ValueError):
        every = 0
    if every > 0:
        start, end = _minutes(p.get("from"), 9 * 60), _minutes(p.get("to"), 18 * 60)
        return [divmod(m, 60) for m in range(start, end + 1, every)] or [(17, 30)]
    out = {divmod(m, 60) for m in (_minutes(t, -1) for t in p.get("times") or []) if m >= 0}
    return sorted(out) or [(17, 30)]


def last_slot(p, now):
    """Most recent scheduled publish time at or before `now` (Monday to Friday, local time of tzOffsetHours)."""
    tz = timedelta(hours=float(p.get("tzOffsetHours", 3)))
    local = now + tz
    for back in range(14):
        day = (local - timedelta(days=back)).date()
        if day.weekday() >= 5:
            continue
        for hh, mm in reversed(publish_times(p)):
            slot = datetime(day.year, day.month, day.day, hh, mm, tzinfo=timezone.utc) - tz
            if slot <= now:
                return slot
    return None


def publish_due(p, now):
    """True when the most recent scheduled slot has no snapshot yet; a missed slot is caught up on the next sync."""
    if not p.get("enabled"):
        return False
    _, path = publish_target(p)
    if not os.path.exists(path):
        return True
    slot = last_slot(p, now)
    return slot is not None and datetime.fromtimestamp(os.path.getmtime(path), timezone.utc) < slot


# ----------------------------------------------------------------------------- sync
def coverage_sweep(settings):
    """Catch case mail the TrackingID search misses: scan every subject in the lookback window and pull in
    the full thread (by case number) for any case-numbered message that is not loaded yet."""
    since = iso(now_utc() - timedelta(days=int(settings["lookbackDays"])))
    STATE.set_status(phase="Checking all mail for case numbers")
    heads = graph_all("/me/messages?$filter=receivedDateTime ge %s&$orderby=receivedDateTime desc&$select=id,subject&$top=100" % since, max_pages=80)
    with STATE.lock:
        have = set(STATE.messages)
    todo = sorted({cid for cid, _ in (find_case(m.get("subject"), "", set()) for m in heads if m.get("id") not in have) if cid})
    for i, cid in enumerate(todo[:40]):
        STATE.set_status(phase="Completing case threads (%d of %d)" % (i + 1, min(len(todo), 40)))
        STATE.add_messages(graph_all('/me/messages?$search="%s"&$top=50&$select=%s' % (cid, SELECT), max_pages=2))
    return len(todo)


def full_sync(settings):
    STATE.set_status(state="syncing", phase="Reading support case e-mails", lastAttempt=iso(now_utc()))
    if not STATE.me:
        STATE.me = graph_get("/me?$select=displayName,mail,userPrincipalName")
    STATE.add_messages(graph_all('/me/messages?$search="TrackingID"&$top=100&$select=' + SELECT, max_pages=25))
    coverage_sweep(settings)
    snap = build_snapshot()
    recent = iso(now_utc() - timedelta(days=int(settings["staleCaseDays"])))
    last, done = {}, set()
    for e in snap["events"]:
        last[e["caseId"]] = e["t"]
        if e.get("kind") in ("closed", "archived"):
            done.add(e["caseId"])
    open_recent = sorted(c for c, t in last.items() if t >= recent and c not in done)[:25]
    for i, cid in enumerate(open_recent):
        STATE.set_status(phase="Checking related threads (%d of %d)" % (i + 1, len(open_recent)))
        STATE.add_messages(graph_all('/me/messages?$search="%s"&$top=50&$select=%s' % (cid, SELECT), max_pages=2))
    calendar_sync(settings)
    return build_snapshot()


def incremental_sync(settings):
    with STATE.lock:
        newest = max((m.get("receivedDateTime") or "" for m in STATE.messages.values()), default="")
    since = datetime.strptime(newest, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) if newest else now_utc() - timedelta(days=2)
    since = min(since, now_utc()) - timedelta(minutes=15)
    items = graph_all("/me/messages?$filter=receivedDateTime ge %s&$orderby=receivedDateTime desc&$top=50&$select=%s" % (iso(since), SELECT), max_pages=6)
    known = STATE.known_cases()
    keep = []
    for m in items:
        raw = (m.get("uniqueBody") or {}).get("content") or ""
        cid, _ = find_case(m.get("subject"), html_to_text(raw) if raw else (m.get("bodyPreview") or ""), known)
        if cid:
            keep.append(m)
    return STATE.add_messages(keep)


def calendar_sync(settings):
    STATE.set_status(phase="Reading customer meetings")
    start = iso(now_utc() - timedelta(days=int(settings["calendarPastDays"])))
    end = iso(now_utc() + timedelta(days=int(settings["calendarFutureDays"])))
    items = graph_all("/me/calendarView?startDateTime=%s&endDateTime=%s&$top=250&$select=start,attendees,isCancelled" % (start, end), max_pages=10)
    cal = []
    for ev in items:
        att = ev.get("attendees") or []
        if ev.get("isCancelled") or not att or len(att) > 40:
            continue
        doms = sorted({d for d in (domain_of(addr_of(a)) for a in att) if d and not is_ms_domain(d)})
        start_dt = ((ev.get("start") or {}).get("dateTime") or "")[:19]
        if doms and start_dt:
            cal.append((start_dt + "Z", doms))
    with STATE.lock:
        STATE.calendar = cal


def sync_loop():
    last_full, last_cal, backoff = 0.0, time.time(), 0
    cfg_mtime = os.path.getmtime(CONFIG_PATH) if os.path.exists(CONFIG_PATH) else 0
    while True:
        settings, _ = load_config()
        poll = max(30, int(settings["pollSeconds"]))
        try:
            if not STATE.messages or time.time() - last_full >= int(settings["fullSyncMinutes"]) * 60:
                full_sync(settings)
                last_full = last_cal = time.time()
            else:
                STATE.set_status(state="syncing", phase="Checking for new e-mail", lastAttempt=iso(now_utc()))
                changed = incremental_sync(settings)
                if time.time() - last_cal >= 1800:
                    calendar_sync(settings)
                    last_cal = time.time()
                    changed += 1
                mtime = os.path.getmtime(CONFIG_PATH) if os.path.exists(CONFIG_PATH) else 0
                if mtime != cfg_mtime:
                    cfg_mtime = mtime
                    changed += 1
                if changed:
                    build_snapshot()
            STATE.set_status(state="ok", phase="Up to date", error=None, lastSuccess=iso(now_utc()),
                             nextSyncAt=iso(now_utc() + timedelta(seconds=poll)))
            backoff = 0
            if publish_due(settings["publish"], now_utc()):
                try:
                    publish("scheduled")
                except (OSError, RuntimeError) as err:
                    log("publish failed: %s" % err)
                    STATE.set_status(publishError=str(err))
        except GraphError as err:
            backoff = min(backoff + 1, 5)
            STATE.set_status(state="error", phase="Sync failed", error=str(err))
            log("sync error: %s" % err)
        except Exception as err:
            backoff = min(backoff + 1, 5)
            STATE.set_status(state="error", phase="Sync failed", error="Unexpected error: %s" % err)
            log("unexpected: %s" % traceback.format_exc())
        STATE.wake.wait(poll * (1 + backoff))
        STATE.wake.clear()


# ----------------------------------------------------------------------------- HTTP
class Handler(BaseHTTPRequestHandler):
    server_version = "CSCTLive/" + VERSION

    def log_message(self, *args):
        pass

    def _host_ok(self):
        host = (self.headers.get("Host") or "").lower()
        return host in ("127.0.0.1:%d" % self.server.server_port, "localhost:%d" % self.server.server_port)

    def _send(self, code, body, ctype="application/json; charset=utf-8", extra=None):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self._host_ok():
            return self._send(403, '{"error":"forbidden"}')
        url = urllib.parse.urlparse(self.path)
        if url.path in ("/", "/index.html"):
            settings, _ = load_config()
            path = os.path.normpath(os.path.join(HERE, settings["dashboard"]))
            try:
                with open(path, "rb") as f:
                    return self._send(200, f.read(), "text/html; charset=utf-8", {"Referrer-Policy": "no-referrer"})
            except OSError:
                return self._send(404, "Dashboard file not found: " + path, "text/plain; charset=utf-8")
        if url.path == "/api/ping":
            with STATE.lock:
                body = json.dumps({"app": "csct-live", "connector": VERSION, "state": STATE.status.get("state")})
            return self._send(200, body, extra={"Access-Control-Allow-Origin": "*"})
        if url.path == "/api/snapshot":
            want = (urllib.parse.parse_qs(url.query).get("v") or ["-1"])[0]
            with STATE.lock:
                status = json.dumps(STATE.status).encode("utf-8")
                if not STATE.snapshot:
                    return self._send(200, b'{"version":0,"sync":' + status + b"}")
                if want == str(STATE.version):
                    return self._send(200, b'{"version":%d,"unchanged":true,"sync":' % STATE.version + status + b"}")
                return self._send(200, b'{"sync":' + status + b"," + STATE.snapshot[1:])
        return self._send(404, '{"error":"not found"}')

    def do_POST(self):
        if not self._host_ok():
            return self._send(403, '{"error":"forbidden"}')
        url = urllib.parse.urlparse(self.path)
        origin = (self.headers.get("Origin") or "").lower()
        allowed = ("http://127.0.0.1:%d" % self.server.server_port, "http://localhost:%d" % self.server.server_port)
        if url.path == "/api/sync" and origin in allowed:
            STATE.wake.set()
            return self._send(202, '{"ok":true}')
        if url.path == "/api/publish" and self.headers.get("X-CSCT") == "publish":
            try:
                path, when = publish("on request")
            except (OSError, RuntimeError) as err:
                return self._send(409, json.dumps({"ok": False, "error": str(err)}))
            return self._send(200, json.dumps({"ok": True, "path": path, "publishedAt": when}))
        if url.path == "/api/shutdown" and self.headers.get("X-CSCT") == "stop":
            self._send(200, '{"ok":true}')
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return None
        return self._send(403, '{"error":"forbidden"}')


def running_instance(port):
    try:
        with urllib.request.urlopen("http://127.0.0.1:%d/api/ping" % port, timeout=3) as r:
            return json.loads(r.read().decode("utf-8")).get("app") == "csct-live"
    except Exception:
        return False


def acquire_instance_lock():
    """One connector per user. http.server sets SO_REUSEADDR, which on Windows lets a second process bind
    the same port, so the port alone cannot stop a duplicate; this lock is held for the process lifetime."""
    os.makedirs(LOG_DIR, exist_ok=True)
    f = open(os.path.join(LOG_DIR, "connector.lock"), "a+")
    try:
        f.seek(0)
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        f.close()
        return None
    return f


def print_summary(snap):
    by = {}
    for e in snap["events"]:
        by.setdefault(e["caseId"], []).append(e)
    print("me:", snap["me"], "| account team size:", snap["accountTeamSize"])
    print("events:", len(snap["events"]), "| cases:", len(by), "| accounts:", len(snap["accounts"]))
    for cid, evs in sorted(by.items(), key=lambda kv: kv[1][-1]["t"], reverse=True):
        kinds = {}
        for e in evs:
            kinds[e["kind"]] = kinds.get(e["kind"], 0) + 1
        sigs = [s["type"] + ": " + s["phrase"] for e in evs for s in e.get("signals") or []]
        print(cid, "|", snap["cases"][cid]["account"], "|", evs[-1]["t"][:16], "|", kinds, "|", sigs[:4])
        print("     ", snap["cases"][cid]["accountSource"])


def main():
    settings, _ = load_config()
    port = int(settings["port"])
    if "--once" in sys.argv:
        print_summary(full_sync(settings))
        return
    if "--publish" in sys.argv:
        full_sync(settings)
        print("published %s at %s" % publish("command line"))
        return
    # Already running: hand over (open the dashboard if asked) and exit. A connector that is still shutting
    # down holds the lock for a moment, so wait briefly instead of failing a stop-then-start.
    lock = None
    for _ in range(15):
        if running_instance(port):
            if "--open" in sys.argv:
                webbrowser.open("http://127.0.0.1:%d/" % port)
            return
        lock = acquire_instance_lock()
        if lock:
            break
        time.sleep(1)
    if lock is None:
        log("another connector is still starting or stopping; this launch exits")
        return
    try:
        server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    except OSError:
        if running_instance(port):
            if "--open" in sys.argv:
                webbrowser.open("http://127.0.0.1:%d/" % port)
            return
        log("port %d is in use by another program" % port)
        sys.exit("Port %d is in use by another program. Change settings.port in csct-live-config.json." % port)
    log("connector %s listening on 127.0.0.1:%d" % (VERSION, port))
    threading.Thread(target=sync_loop, daemon=True).start()
    if "--open" in sys.argv:
        threading.Timer(1.0, lambda: webbrowser.open("http://127.0.0.1:%d/" % port)).start()
    try:
        server.serve_forever()
    finally:
        log("connector stopped")


if __name__ == "__main__":
    main()
