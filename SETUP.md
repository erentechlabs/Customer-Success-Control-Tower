# Setup guide

This guide sets up the Customer Success Control Tower on your own Windows PC for your own Unified support accounts. It is written for people and for **Microsoft Scout**. Every step lists what to run, how to check that it worked, and which decisions are yours.

- **Time:** about 30 minutes, plus 3 to 5 minutes for the first mailbox sync.
- **Result:** a live dashboard at `http://127.0.0.1:8787/` that starts with Windows. Optionally, you also get:
  - a read-only copy for your manager, refreshed every 10 minutes on business days;
  - a weekly MIRP status check;
  - an end-of-day review in Scout.

## Set it up with Scout

Paste this into Microsoft Scout:

```text
Set up the Customer Success Control Tower for me. Follow SETUP.md in
https://github.com/erentechlabs/Customer-Success-Control-Tower step by step.
Tell me what each step does before you run it, and ask me before you install
software, share anything or create automations.
```

> **Scout:** read `https://raw.githubusercontent.com/erentechlabs/Customer-Success-Control-Tower/main/SETUP.md` and follow the steps in order. Every PowerShell block is self-contained. Replace the placeholders before you run a block. Do not continue past a failed check: fix the problem or ask the user. Follow the ground rules below at all times.

## Ground rules for Scout

1. **Case data stays on the user's PC.** Never upload, commit, paste or attach any of the following anywhere, including this GitHub repository:
   - `csct-live-config.json`
   - `mirp-latest.json`
   - the published snapshot
   - logs
   - e-mail content
2. **Ask first.** Get the user's approval before you:
   - install software;
   - share a file or folder;
   - send an e-mail or Teams message;
   - create or change a Scout automation.

   Before you share anything, show the user who will get access and what they will see.
3. **Never type passwords.** If a sign-in prompt appears, the user completes it.
4. **Never print, save or reuse access tokens or request headers.**
5. **Do not change the code.** Only two things are meant to change:
   - `7-LiveConnector/csct-live-config.json`;
   - for region settings, the `CSCT_SPEC` block in two HTML files (Step 3.2).

## Placeholders

| Placeholder | Meaning |
| --- | --- |
| `<CSCT>` | Full path of the Control Tower folder created in Step 2. |
| `<PORT>` | `settings.port` in the configuration file. The default is `8787`. |
| `<LANGUAGE>` | The language the user wants Scout's messages in. |

The Python snippets call `python`. If only the Python launcher is installed, use `py -3` instead. If Python was installed during this setup and Scout still cannot find it, restart Scout so it picks up the new PATH.

## What you need

| Requirement | Why | Checked in |
| --- | --- | --- |
| Windows 10 or 11 | The connector, start and stop scripts and auto-start are built for Windows. | — |
| Microsoft Scout, signed in to Microsoft 365 | Scout installs the WorkIQ CLI. The connector uses it to read your mail and calendar with your own permissions. | Step 1 |
| Python 3.10 or later | Runs the connector. It uses only the standard library, so nothing else needs to be installed. | Step 1 |
| Unified case e-mail in your mailbox | The dashboard is built from two sources: the case notifications from `notifications@techsupport.microsoft.com`, and the TrackingID case threads you are copied on. | Step 1 |
| OneDrive for Business (optional) | Needed only to share a read-only copy. | Step 7 |
| Engage Center access (optional) | Needed only to track MIRP confirmations. | Step 8 |

## Step 1: Check the prerequisites

```powershell
# Python: one of these must report 3.10 or later
py -3 --version
python --version

# WorkIQ CLI (installed with Microsoft Scout) and the Microsoft 365 sign-in
$wq = Join-Path $env:USERPROFILE ".scout\bin\workiq.cmd"
Test-Path $wq
& $wq fetch -u '/me?$select=displayName,mail'

# Unified case notifications in the mailbox
& $wq fetch -u "/me/messages?`$filter=from/emailAddress/address eq 'notifications@techsupport.microsoft.com'&`$select=subject,receivedDateTime&`$top=5"
```

**Checks**

- **Python 3.10 or later is found.** If not, ask the user, then install it for the current user with `winget install -e --id Python.Python.3.12 --scope user`. Open a new PowerShell window afterwards.
- **`Test-Path` prints `True` and the `/me` call returns JSON with the user's `displayName`.**
  - If the WorkIQ terms are not accepted, Scout shows its WorkIQ terms consent card. The user decides whether to accept.
  - If you get a sign-in or consent error, run `& $wq auth login` and let the user complete the sign-in.
- **The last call returns at least one message.** If it returns none, the dashboard will stay empty. Tell the user they need to receive the Unified case notifications for their accounts.

## Step 2: Download

Install the folder into Scout's working folder, which is normally `OneDrive - Microsoft\Documents\Microsoft Scout`. This matters for two reasons:

- OneDrive syncs the read-only copy you share.
- Scout's browser tools can save files only inside the working folder, and the MIRP step needs that.

```powershell
$parent = Join-Path $env:OneDriveCommercial "Documents\Microsoft Scout"   # Scout's working folder
$csct = Join-Path $parent "Customer-Success-Control-Tower"
if (Test-Path $csct) { throw "$csct already exists. Choose another folder name, or see 'Updating'." }
$zip = Join-Path $env:TEMP "csct-main.zip"
Invoke-WebRequest "https://github.com/erentechlabs/Customer-Success-Control-Tower/archive/refs/heads/main.zip" -OutFile $zip -UseBasicParsing
Expand-Archive $zip -DestinationPath $parent
Rename-Item (Join-Path $parent "Customer-Success-Control-Tower-main") "Customer-Success-Control-Tower"
Get-ChildItem $csct -Recurse -File | Unblock-File
Remove-Item $zip
Get-ChildItem $csct -Name
```

If Scout uses a different working folder, set `$parent` to that folder.

**Check:** the folder contains `1-SharePoint` through `8-SharedDashboard`, `README.md` and `SETUP.md`. Use this path as `<CSCT>` from now on.

## Step 3: Configure

All settings live in `<CSCT>\7-LiveConnector\csct-live-config.json`. The connector picks up changes within a minute, so you do not need to restart it.

Keep the file's layout as it is:

- two-space indentation;
- `settings` first and `accounts` last;
- one account per line.

The snippets below write it that way, and `mirp_apply.py` relies on it.

### 3.1 Remove the fictional sample data

The repository ships with a fictional account map (Contoso, Fabrikam and others) and example output files. Remove them so nothing fictional is shown or shared:

```powershell
$csct = "<CSCT>"
@'
import io, json, sys
p = sys.argv[1]
cfg = json.load(io.open(p, encoding="utf-8-sig"))
cfg["settings"].setdefault("mirp", {})["ignoreWorkspaces"] = []
settings = json.dumps(cfg["settings"], ensure_ascii=False, indent=2).replace("\n", "\n  ")
io.open(p, "w", encoding="utf-8", newline="\n").write('{\n  "settings": ' + settings + ',\n  "accounts": [\n  ]\n}\n')
print("sample accounts removed")
'@ | python - "$csct\7-LiveConnector\csct-live-config.json"
Remove-Item "$csct\7-LiveConnector\mirp-latest.json", "$csct\8-SharedDashboard\Customer-Success-Control-Tower-Daily.html" -ErrorAction SilentlyContinue
```

### 3.2 Region: time zone, working hours and holidays

The defaults are for Türkiye:

- UTC+3;
- business day from 09:00 to 18:00;
- Turkish fixed-date public holidays for 2026 and 2027.

The holiday list does not include religious holidays, so add them if you need them. The risk engine uses these values to count business days for stall, SLA and age. Skip this step if the defaults fit.

Otherwise, ask the user for:

- **UTC offset, in whole hours.** The engine uses a fixed offset and does not switch for daylight saving.
- **Business day start and end hours.**
- **Public holidays for the next 12 months.**

Then update the two dashboard files the connector serves and publishes:

```powershell
$csct = "<CSCT>"
@'
import io, json, re, sys
TZ, START, END = 1, 9, 17                  # UTC offset in hours, business day start and end (local hours)
HOLIDAYS = ["2026-12-25", "2027-01-01"]    # public holidays, YYYY-MM-DD
for name in ("customer-success-control-tower.html", "snapshot-template.html"):
    path = sys.argv[1] + "\\" + name
    s = io.open(path, encoding="utf-8", newline="").read()
    m = re.search(r"const CSCT_SPEC = (\{.*?\});\r?\n</script>", s, re.S)
    spec = json.loads(m.group(1))
    values = {"TZ_OffsetHours": TZ, "BusinessHours_Start": START, "BusinessHours_End": END}
    for c in spec["config"]:
        if c["Title"] in values:
            c["Value"] = values[c["Title"]]
    spec["holidays"] = sorted(set(HOLIDAYS))
    s = s[:m.start(1)] + json.dumps(spec, ensure_ascii=False, separators=(",", ":")) + s[m.end(1):]
    io.open(path, "w", encoding="utf-8", newline="").write(s)
    print(name, "updated")
'@ | python - "$csct\7-LiveConnector"
```

Then set `settings.publish.tzOffsetHours` in the configuration file to the same offset. Downloading a new version (see Updating) replaces these files, so apply this step again after each update.

### 3.3 Sharing and other settings

Ask the user these questions and set the matching values under `settings`:

| Question | Setting |
| --- | --- |
| Share a read-only copy with your manager? | `publish.enabled`: `true` or `false`. |
| How often should the copy update? | `publish.everyMinutes`, `publish.from`, `publish.to`. The default is every 10 minutes from 09:00 to 18:00, Monday to Friday. |
| Where should the copy be saved? | `publish.folder`. The default `..\8-SharedDashboard` is inside `<CSCT>`, so OneDrive syncs it. If `<CSCT>` is outside OneDrive, use an absolute path to a OneDrive folder. |
| Show engineer and customer e-mail addresses in the copy? | `publish.includeContactEmails`. The default is `false`. Keep `publish.includeEmailText` set to `false`. |
| Should colleagues' replies count as account-team updates? | `accountTeam`: a list of e-mail addresses. Microsoft people who receive the case notifications are added automatically. |
| Is port 8787 already in use? | `port`. Change it only if 8787 is taken. |

## Step 4: First start

```powershell
$csct = "<CSCT>"; $port = <PORT>
Start-Process "$csct\7-LiveConnector\Start-ControlTower.cmd"
$deadline = (Get-Date).AddMinutes(8)
do {
  Start-Sleep -Seconds 10
  try { $ping = Invoke-RestMethod "http://127.0.0.1:$port/api/ping" -TimeoutSec 5 } catch { $ping = $null }
} until (($ping -and $ping.state -in "ok", "error") -or (Get-Date) -gt $deadline)
(Invoke-RestMethod "http://127.0.0.1:$port/api/snapshot" -TimeoutSec 60).sync |
  Select-Object state, phase, messages, cases, lastSuccess, error
```

The first sync reads about four months of mail and takes 2 to 5 minutes. The dashboard opens in the browser when the connector starts.

**Check:** `state` is `ok` and `cases` is more than 0. If `state` is `error`, read `error` and see Troubleshooting. The log file is `%LOCALAPPDATA%\CSCT\connector.log`.

## Step 5: Build the account map

With an empty map, each case shows up under the customer name from its notification. Turn that list into an account map.

**5.1 List what the connector found**

```powershell
$port = <PORT>
@'
import json, sys, urllib.request
from collections import defaultdict
sys.stdout.reconfigure(encoding="utf-8")
s = json.load(urllib.request.urlopen("http://127.0.0.1:%s/api/snapshot" % sys.argv[1], timeout=60))
if "cases" not in s:
    sys.exit("The first sync has not finished yet: %s" % s.get("sync", {}).get("phase"))
mapped = {a["Title"] for a in s["accounts"] if a.get("Source") == "Account map"}
cases, names, domains = defaultdict(set), defaultdict(set), defaultdict(set)
for cid, meta in s["cases"].items():
    acct, src = meta["account"], meta.get("accountSource") or ""
    cases[acct].add(cid)
    if "case notification" in src and ": " in src:
        names[acct].add(src.split(": ", 1)[1].strip())
for e in s["events"]:
    if e.get("role") == "customer":
        domains[s["cases"][e["caseId"]]["account"]].update(e.get("domains") or [])
for acct in sorted(cases, key=lambda a: (-len(cases[a]), a)):
    print("%s | %s | %d case(s) | names: %s | domains: %s" % (
        acct, "in map" if acct in mapped else "NOT IN MAP", len(cases[acct]),
        "; ".join(sorted(names[acct])) or "-", ", ".join(sorted(domains[acct])) or "-"))
'@ | python - $port
```

**5.2 Propose an account list**

Propose one entry per customer account to the user, in this format:

```json
[
  { "Title": "Contoso", "Group": "Contoso Group", "Aliases": ["Contoso Holding", "Contoso Retail"], "Domains": ["contoso.com"], "Industry": "Retail", "ContractType": "Unified Enterprise" }
]
```

- `Title`: the short name the user wants to see.
- `Aliases`: distinctive parts of the customer names in the `names:` column. A case maps to an account when one of its aliases appears in the case's customer name.
- `Domains`: the customer's own e-mail domains from the `domains:` column. Leave out partners, vendors and public mail services.
- Optional fields:

  | Field | Value |
  | --- | --- |
  | `Group` | Group or holding name |
  | `Segment`, `Industry`, `StrategicTier`, `ContractType` | Free text |
  | `ContractEnd` | `YYYY-MM-DD` |
  | `CSMConcern` | `None`, `Watch`, `Concern` or `Critical` |
  | `CSMConcernNote` | Free text |
  | `CustomerExecSponsor` | Free text |

  [Configuration reference](#configuration-reference) describes them.
- Accounts with no open cases can be added too. They then appear in Account 360.

**5.3 Save the confirmed list**

After the user confirms the list, save it to `%TEMP%\csct-accounts.json` as a JSON array and write it into the configuration file:

```powershell
$csct = "<CSCT>"; $list = Join-Path $env:TEMP "csct-accounts.json"
@'
import io, json, sys
cfg_path, list_path = sys.argv[1], sys.argv[2]
cfg = json.load(io.open(cfg_path, encoding="utf-8-sig"))
accounts = json.load(io.open(list_path, encoding="utf-8-sig"))
assert isinstance(accounts, list) and all(isinstance(a, dict) and a.get("Title") for a in accounts), "need a JSON list of objects with a Title"
settings = json.dumps(cfg["settings"], ensure_ascii=False, indent=2).replace("\n", "\n  ")
rows = ",\n".join("    { " + ", ".join(json.dumps(k) + ": " + json.dumps(v, ensure_ascii=False) for k, v in a.items()) + " }" for a in accounts)
text = '{\n  "settings": ' + settings + ',\n  "accounts": [\n' + rows + ("\n" if rows else "") + "  ]\n}\n"
json.loads(text)
io.open(cfg_path, "w", encoding="utf-8", newline="\n").write(text)
print("saved %d account(s)" % len(accounts))
'@ | python - "$csct\7-LiveConnector\csct-live-config.json" $list
Remove-Item $list
```

**5.4 Check**

Wait one minute and run the listing from 5.1 again. Every line should say `in map`, apart from cases the user chose not to map.

## Step 6: Start automatically at sign-in

```powershell
$csct = "<CSCT>"
$script = Join-Path $csct "7-LiveConnector\csct_live.py"
# Python may have just been installed, so look in the default install folders as well as on PATH
$py = @((Get-Command pyw -ErrorAction SilentlyContinue).Source, "$env:LOCALAPPDATA\Programs\Python\Launcher\pyw.exe", "$env:WINDIR\pyw.exe") |
  Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
$argLine = "-3 `"$script`""
if (-not $py) {
  $py = @((Get-Command pythonw -ErrorAction SilentlyContinue).Source) + @(Get-ChildItem "$env:LOCALAPPDATA\Programs\Python\Python3*\pythonw.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | ForEach-Object FullName) | Where-Object { $_ } | Select-Object -First 1
  $argLine = "`"$script`""
}
if (-not $py) { throw "Neither pyw.exe nor pythonw.exe was found; install Python first (Step 1)." }
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) "Customer Success Control Tower.lnk"
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$s.TargetPath = $py; $s.Arguments = $argLine; $s.WorkingDirectory = Split-Path $script
$s.Description = "Starts the Customer Success Control Tower connector in the background."
$s.Save()
Test-Path $lnk
```

The shortcut starts the connector in the background at sign-in, without opening a browser. Only one connector runs per user, so extra starts exit on their own. Turn the shortcut off in Task Manager under **Startup apps**.

**Check:** `Test-Path` prints `True`. Run `Stop-ControlTower.cmd`, then start the shortcut with `Start-Process $lnk`. Within about 4 minutes, `/api/ping` should report `state: ok` again.

## Step 7: Share a read-only copy (optional)

Do this step only with the user's explicit approval.

The copy contains:

- customer names, case titles and numbers;
- engineer and contact names;
- risk scores and recommended actions;
- e-mail addresses, only if `includeContactEmails` is `true`.

It never contains e-mail text or mailbox links. Treat it as confidential and share it only inside Microsoft.

1. **Publish once** with `Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:<PORT>/api/publish" -Headers @{ 'X-CSCT' = 'publish' }`. The response shows the file path and `publishedAt` (UTC).
2. **Wait for OneDrive to finish syncing.**
3. **Share only the `8-SharedDashboard` folder, with view access.** Either the user shares it in OneDrive (right-click, **Share**, **Can view**), or Scout shares it with the OneDrive sharing tools. If Scout does it, first preview the recipients, show them to the user, and grant **read** access only after confirmation.
4. **Give the recipient the link to `Customer-Success-Control-Tower-Daily.html`.**
   - It opens in the OneDrive or SharePoint preview and always shows the latest published copy.
   - An open page does not refresh by itself; reload it to see a newer copy.
   - Nothing is published while the PC is off. The page then shows "Not updated recently".

## Step 8: Track MIRP confirmations (optional)

This step needs Engage Center access for the user's accounts. Steps 3 and 4 below are read-only in Engage Center.

1. **The user signs in** to `https://engagecenter.microsoft.com` in Scout's browser. Scout opens the page; the user completes the sign-in.
2. **Collect.** Call the Scout browser tool `playwright-browser_run_code_unsafe` with `filename` set to `<CSCT>\7-LiveConnector\mirp_collect.js`, and no code argument.
   - It returns a summary such as `{"ok":true,"workspaces":31,"confirmed":18,"pending":10,...}`.
   - `{"ok":false,"error":"signed-out: ..."}` means item 1 is still needed.
3. **Save.** Straight away, without navigating, call `playwright-browser_evaluate` with:
   - `function`: `() => window.__csctMirp`
   - `filename`: `<CSCT>\7-LiveConnector\mirp-latest.json`
4. **Map the workspaces.** In `<CSCT>\7-LiveConnector`, run `python mirp_apply.py --dry-run`.
   - The **Not in the account map** section lists workspace names, with a possible match where one is found. Propose a mapping to the user.
   - After the user confirms, set `MIRPWorkspace` on each account. Use a workspace name, or a list of names for an account with several workspaces.
   - Add umbrella or group workspaces that are not accounts to `settings.mirp.ignoreWorkspaces`.
5. **Apply.** Run `python mirp_apply.py --publish`. It does three things:
   - writes the status, confirmation date and confirming person into the account map;
   - prints what is pending, what changed and which confirmations expire within 30 days (a confirmation is valid for 180 days);
   - republishes the shared copy.

Some details:

- **Approved exceptions do not appear in Engage Center.** For an account with an approved exception, set these fields by hand:
  - `MIRPStatus`: `"Exception"`
  - `MIRPAsOf`: the approval date
  - `MIRPNote`

  `mirp_apply.py` keeps an exception until every workspace of the account is confirmed.
- **Results older than 36 hours are refused.** Collect again if that happens.

## Step 9: Scout automations (optional)

Create these only after the user approves the schedule and the language. Replace `<CSCT>`, `<PORT>` and `<LANGUAGE>` first.

### End-of-day review

| Setting | Value |
| --- | --- |
| Name | Control Tower: end-of-day review |
| Schedule | every weekday at 5:45pm |
| Browser | headless |
| Teams notification | auto |

```text
End-of-day review for my Customer Success Control Tower (Unified support cases). Work only on this PC. Do NOT send, reply, forward, draft, escalate, share or post anything to anyone other than me, and do not change any files, settings or the account map. Everything you produce is a proposal for me to approve.

Connector URL U = http://127.0.0.1:<PORT>. Folder F = <CSCT>\7-LiveConnector.

1. Make sure the connector is running: Invoke-RestMethod U/api/ping -TimeoutSec 5. If it does not answer, start it without a browser: Start-Process (Join-Path ([Environment]::GetFolderPath('Startup')) 'Customer Success Control Tower.lnk'), then poll U/api/ping every 10 seconds for up to 5 minutes until "state" is "ok". If it still fails, read sync.error from U/api/snapshot and send me one short message saying what failed and that I can run F\Start-ControlTower.cmd.
2. Publish the shared copy: Invoke-RestMethod -Method Post -Uri U/api/publish -Headers @{ 'X-CSCT' = 'publish' }. Keep publishedAt (UTC) for the message. Skip this if the shared copy is not used.
3. Open U/ in the browser, wait until window.csctFindings() returns an object (retry for up to 30 seconds) and read it with a browser evaluate call. It contains summary, cases (risk, newlyRed, trend, stall, sla, triggers, suggestedLevel, playbook, action, drivers, ball, idleBusinessDays, engineer, nextAction), candidates, signals (complaints, escalation requests and additional requests with due and overdue), escalations, accounts, newCases and closedRecently.
4. Include an item when a case is Red, turned Red today, or is Yellow and worsening; a case is stalled or its first-response SLA is breached or at risk; a case is an escalation candidate (give the suggested level and the triggers in plain words); there is an open complaint, escalation request or additional request (flag overdue ones, including requests on closed cases); or an account is Red or worsening. For each item propose ONE concrete next step from its playbook, for example nudge the engineer (PB-05), nudge the customer (PB-06), acknowledge the complaint and agree a recovery plan (PB-07), route the request and confirm an owner and date (PB-08), or prepare an L1 or L2 escalation pack. Prefer steps I can approve with one word. Skip unchanged items unless they are overdue.
5. Write ONE concise message in <LANGUAGE>, without emojis. First line: "Control Tower end of day, <date>: <N> open cases (<Red> Red, <Yellow> Yellow). Shared copy updated <local time>." Then "Actions waiting for your approval:" as a numbered list, most urgent first, at most 7 items, each as: customer · last 6 digits of the case number · one-sentence status and reason · proposed action. Then: "Reply with the numbers you want me to do (for example 1 and 3). Nothing is sent to anyone without your approval." Use case titles and short reasons only; never paste e-mail text.
6. If nothing needs attention, reply with the single line "Control Tower end of day: shared copy updated, nothing needs action." and do not send a Teams notification.
```

### Weekly MIRP refresh

This automation needs Step 8 to be set up first.

| Setting | Value |
| --- | --- |
| Name | Control Tower: weekly MIRP refresh |
| Schedule | every Monday at 9am |
| Browser | headless |
| Teams notification | always |

```text
Weekly MIRP refresh for my Customer Success Control Tower. Engage Center is READ-ONLY for this task: never click Confirm, Edit, Delete, Add or any control that changes a MIRP, workspace, user or contact, and never send, draft, share or post anything to anyone other than me. Never print, copy or store access tokens or request headers.

Folder F = <CSCT>\7-LiveConnector.

1. Collect: call playwright-browser_run_code_unsafe with filename = F\mirp_collect.js (no code argument). It returns {ok, workspaces, confirmed, pending, skipped, errors, pendingNames, errorNames} or {ok:false, error}. If ok is false, navigate to https://engagecenter.microsoft.com/, wait 20 seconds and run it once more. Never type credentials. If it still fails, report the error in step 6.
2. Save: right after a successful step 1, without navigating anywhere, call playwright-browser_evaluate with function "() => window.__csctMirp" and filename = F\mirp-latest.json.
3. Apply and publish: run python "F\mirp_apply.py" --publish with the full path. Exit code 2 means nothing was applied; the first output line says why. If the "Shared copy:" line says the connector is not running, start it without a browser with the Startup shortcut 'Customer Success Control Tower.lnk', wait 4 minutes and run the command once more.
4. Never edit csct-live-config.json yourself. If "Not in the account map" lists workspaces, only propose which account each belongs to (or that a new account should be added) and wait for my approval.
5. Clean up: navigate the browser to about:blank. Delete only the *.yml, *.png and console-*.log files created today under %USERPROFILE%\.scout\browser-output; never delete playwright-mcp-config.json.
6. Write ONE concise message in <LANGUAGE>, without emojis. First line: "MIRP weekly update, <date>: <N> accounts, <C> confirmed, <P> pending, <E> exception." using the "Accounts:" line of the script output. Then "Changes this week:" with one line per change (account, who confirmed, date), or "No changes."; then "Still pending:" with the account names on one line. Add only when present: "Review due within 30 days:", "Exceptions:" (only when the review is due within 45 days), "Workspaces not in the account map:" with your proposal, and "Problems:". If accounts are still pending, offer to draft reminder e-mails, but do not draft or send anything without my approval. Last line: "Dashboard and shared copy updated (<local time>)." or what failed.
```

## Final check

| What | How to check |
| --- | --- |
| Connector runs | `Invoke-RestMethod http://127.0.0.1:<PORT>/api/ping` reports `state: ok`. |
| Cases are mapped | The Step 5 listing shows `in map` on every line. |
| Starts with Windows | The Startup shortcut from Step 6 exists. |
| Shared copy (if used) | On a business day, `Customer-Success-Control-Tower-Daily.html` is newer than one schedule interval. |
| Automations (if used) | They appear in Scout's automation list, and **Run now** produces the expected message. |

## Daily use

- **Live dashboard:** `http://127.0.0.1:<PORT>/`. It updates every minute while the connector runs. The pages are Control tower, Action queue, Escalations, Customer voice, Account 360, Manager brief and Risk model.
- **Start:** `Start-ControlTower.cmd`. It opens the dashboard.
- **Stop:** `Stop-ControlTower.cmd`.
- **Publish the shared copy now:** `Invoke-RestMethod -Method Post -Uri http://127.0.0.1:<PORT>/api/publish -Headers @{ 'X-CSCT' = 'publish' }`
- **Configuration changes** apply within a minute. Code updates need a restart.
- **Log file:** `%LOCALAPPDATA%\CSCT\connector.log`
- **Background work:** only one connector runs per user. While it runs, it checks for new e-mail every `pollSeconds`, runs a full sync every `fullSyncMinutes`, and publishes the shared copy on business days according to `settings.publish`.

Command-line options, run from `<CSCT>\7-LiveConnector`:

```text
pythonw csct_live.py [--open]    run the connector (and open the dashboard)
python  csct_live.py --once      one sync, print a per-case summary, exit
python  csct_live.py --publish   one sync, publish the shared copy now, exit
```

## Updating

Your configuration, MIRP results and shared copy are kept:

```powershell
$csct = "<CSCT>"
$new = Join-Path $env:TEMP "csct-update"
Remove-Item $new, "$new.zip" -Recurse -Force -ErrorAction SilentlyContinue
Invoke-WebRequest "https://github.com/erentechlabs/Customer-Success-Control-Tower/archive/refs/heads/main.zip" -OutFile "$new.zip" -UseBasicParsing
Expand-Archive "$new.zip" -DestinationPath $new
& "$csct\7-LiveConnector\Stop-ControlTower.cmd"
robocopy "$new\Customer-Success-Control-Tower-main" $csct /E /XF csct-live-config.json mirp-latest.json Customer-Success-Control-Tower-Daily.html /NFL /NDL /NJH /NJS /NP
if ($LASTEXITCODE -ge 8) { throw "Copying the new version failed (robocopy exit code $LASTEXITCODE)." }
Get-ChildItem $csct -Recurse -File | Unblock-File
Remove-Item $new, "$new.zip" -Recurse -Force
Start-Process (Join-Path ([Environment]::GetFolderPath('Startup')) "Customer Success Control Tower.lnk")
```

- The update keeps three files: `csct-live-config.json`, `mirp-latest.json` and the published copy.
- Repeat Step 3.2 if you changed the region.
- Compare your file with [Configuration reference](#configuration-reference) to see whether new settings were added.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| `WorkIQ CLI not found` | Open Scout and sign in to Microsoft 365. If WorkIQ is installed somewhere else, set the user environment variable `CSCT_WORKIQ_EXE` to the full path of `workiq.exe`. |
| Sync error about the WorkIQ terms | Accept the terms with Scout's consent card or with `workiq accept-eula`, then select the **Live** button in the dashboard. |
| Sync error about sign-in, consent or `401` | Run `& "$env:USERPROFILE\.scout\bin\workiq.cmd" auth login`. |
| Dashboard is empty, or `cases` is 0 | There are no case notifications in the mailbox for the last `lookbackDays`. Run the Step 1 check. |
| A case appears under a long legal name or as "not in the account map" | Add an alias or a domain to the account (Step 5). |
| A case appears under "Unassigned" | Its e-mails have no customer name or customer domain yet. It maps once a notification arrives or the customer writes. |
| `Port 8787 is in use by another program` | Set `settings.port` to a free port and start again. `Stop-ControlTower.cmd` uses port 8787, so on another port stop the connector with `Invoke-RestMethod -Method Post -Uri http://127.0.0.1:<PORT>/api/shutdown -Headers @{ 'X-CSCT' = 'stop' }`. |
| "Python 3.10 or later is required" | Install Python (Step 1). If it was just installed, restart Scout and run the step again. |
| The shared copy shows "Not updated recently" | The PC or the connector was off. Start it; it publishes the missed update straight away. |
| The shared copy does not change while it is open | The OneDrive preview does not refresh by itself. Reload the page. |
| The MIRP collector returns `signed-out` | Sign in to Engage Center in Scout's browser, then run the collector again. |
| `mirp_apply.py` says the results are too old | Run the collector again. Results older than 36 hours are refused. |

## Good to know

- **Statuses are inferred from e-mail.** Status, ball in court and customer signals all come from the e-mail threads. Confirm in the case record before you act.
- **Customer-voice keywords cover English and Turkish only.**
- **The engine uses a fixed UTC offset** and does not switch for daylight saving.
- **The shared copy is updated only while the PC is on** and the connector is running.
- **The SharePoint, Power Automate and Power BI kit is separate and optional.** See [Microsoft 365 kit](#microsoft-365-kit-optional).

## Configuration reference

`7-LiveConnector/csct-live-config.json` has two parts: `settings` and `accounts`. The connector reads the file again on every sync, so changes apply within a minute. A new `port` applies the next time the connector starts.

**`settings`**

| Setting | Default | Meaning |
| --- | --- | --- |
| `port` | `8787` | Local port of the dashboard and API. |
| `pollSeconds` / `fullSyncMinutes` | `60` / `60` | How often new e-mail is checked, and how often a full re-sync runs. |
| `lookbackDays` | `120` | How far back case e-mail is read. |
| `staleCaseDays` | `21` | A case with no activity for this long is treated as inactive. |
| `calendarPastDays` / `calendarFutureDays` | `120` / `60` | Window for the last and next customer meeting of each account. |
| `dashboard` | `customer-success-control-tower.html` | Dashboard file served at `/`, relative to the connector folder. |
| `accountTeam` | `[]` | Extra account-team addresses whose messages count as account-team updates. |
| `publish.enabled` | `true` | Publish the shared read-only copy. |
| `publish.everyMinutes`, `publish.from`, `publish.to` | `10`, `09:00`, `18:00` | Publish schedule, Monday to Friday. |
| `publish.tzOffsetHours` | `3` | UTC offset of the schedule. Keep it the same as the offset in Step 3.2. |
| `publish.folder`, `publish.fileName` | `..\8-SharedDashboard`, `Customer-Success-Control-Tower-Daily.html` | Where the shared copy is written. The folder is relative to the connector folder. |
| `publish.includeEmailText` | `false` | Include e-mail text in the shared copy. |
| `publish.includeContactEmails` | `false` | Include engineer and customer e-mail addresses in the shared copy. |
| `mirp.ignoreWorkspaces` | `[]` | Engage Center workspaces that are not accounts, for example group-level umbrella workspaces. |

**`accounts`**: one entry per customer account.

| Field | Purpose |
| --- | --- |
| `Title`, `Group` | Account name, and an optional group or holding for roll-ups. |
| `Aliases`, `Domains` | Names and e-mail domains used to map case e-mail to the account. |
| `Segment`, `Industry`, `StrategicTier`, `ContractType` | Profile shown in Account 360. |
| `ContractEnd` | Drives the renewal-window factor (90 days). |
| `CSMConcern`, `CSMConcernNote` | `None`, `Watch`, `Concern` or `Critical`. Adds account risk. |
| `CustomerExecSponsor` | Shown in Account 360. |
| `MIRPStatus`, `MIRPAsOf`, `MIRPConfirmedOn`, `MIRPConfirmedBy`, `MIRPWorkspace`, `MIRPNote` | Engage Center MIRP status, maintained by `mirp_apply.py` (Step 8). A confirmation is valid for 180 days. |

Cases that cannot be mapped are still shown, under the customer name from the notification or the customer's e-mail domain, and flagged as "not in the account map".

## Microsoft 365 kit (optional)

The repository also contains the risk engine as a low-code Microsoft 365 kit for portfolio reporting. It is independent of the live connector and is not needed for Steps 1 to 9.

> **Scout:** set this up only if the user asks for it.

1. **SharePoint lists.** Open the target SharePoint site and press F12 to open the browser console. Then paste `1-SharePoint/Deploy-CSCT-Lists.js` into the console. It creates eight lists with their columns, views and formatting, and skips anything that already exists, so it can be run again. To change its behaviour, set one of these options before you paste the script:
   - `window.CSCT_OPTIONS = { seedDemo: true }` also loads a synthetic demo dataset;
   - `window.CSCT_OPTIONS = { dryRun: true }` only prints what would be created and changes nothing.
2. **Risk engine.** In Excel on the web, open **Automate > New script**, paste `2-PowerAutomate/CSCT-RiskEngine.ts` and save it as `CSCT-RiskEngine`. Call it from a Power Automate flow with **Excel Online (Business) > Run script**, passing the cases, accounts, signals, escalations and configuration as `inputJson`.
3. **Power BI.** In `3-PowerBI`:
   1. Create the `SiteUrl` parameter and the queries from `CSCT-PowerQuery.pq`.
   2. Add the tables from `CSCT-Model-Tables.dax`.
   3. Run `CSCT-Measures.dax` in DAX query view to add the measures.
   4. Import `CSCT-Theme.json`.

## Uninstall

Ask the user before you delete anything:

```powershell
$csct = "<CSCT>"
& "$csct\7-LiveConnector\Stop-ControlTower.cmd"
Remove-Item (Join-Path ([Environment]::GetFolderPath('Startup')) "Customer Success Control Tower.lnk") -ErrorAction SilentlyContinue
Remove-Item (Join-Path $env:LOCALAPPDATA "CSCT") -Recurse -Force -ErrorAction SilentlyContinue
```

Then finish the cleanup:

1. Delete the Scout automations from Step 9.
2. Stop sharing `8-SharedDashboard`.
3. Delete the `<CSCT>` folder.
