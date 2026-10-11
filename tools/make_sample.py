"""Generate fictional mailbox-shaped data; this script never reads a real mailbox."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AS_OF = "2026-10-09T12:00:00Z"


def main():
    accounts = [
        {"Title": "Contoso", "Industry": "Retail", "MIRPStatus": "Confirmed", "MIRPConfirmedOn": "2026-09-01T09:00:00Z", "MIRPConfirmedBy": "Demo Administrator"},
        {"Title": "Fabrikam", "Industry": "Manufacturing", "MIRPStatus": "Pending"},
        {"Title": "Woodgrove Bank", "Industry": "Finance", "MIRPStatus": "Confirmed", "MIRPConfirmedOn": "2026-08-10T09:00:00Z"},
        {"Title": "Tailwind Traders", "Industry": "Wholesale", "MIRPStatus": "Confirmed"},
        {"Title": "Northwind", "Industry": "Logistics", "MIRPStatus": "Pending"},
        {"Title": "Adventure Works", "Industry": "Travel", "MIRPStatus": "Unknown"},
    ]
    for account in accounts:
        account.update(Source="Account map", CSMConcern="None", ContractType="Unified Enterprise")
    events, cases = [], {}

    def add_case(index, account, title, sev, created="2026-10-08T06:00:00Z"):
        case_id = "261008999900%04d" % index
        cases[case_id] = {"account": account, "accountSource": "Fictional sample account"}
        events.append({"caseId": case_id, "t": created, "kind": "created", "role": "system", "sev": sev,
                       "fields": {"caseTitle": title, "areaPath": "Microsoft 365 / Collaboration", "serviceName": "Microsoft 365"}})
        return case_id

    def event(case_id, kind, when, **values):
        events.append(dict(caseId=case_id, kind=kind, t=when, **values))

    def owner(case_id):
        event(case_id, "ownership", "2026-10-08T06:15:00Z", role="system", engineer="Alex Morgan")

    def update(case_id, when, **values):
        event(case_id, "ms_update", when, role="ms", actor="Alex Morgan",
              actorMail="engineer@example.com", **values)

    c = add_case(1, "Contoso", "Mailbox migration waiting for an update", "B")
    owner(c)
    update(c, "2026-10-08T07:00:00Z", ball="Customer", preview="Please share the sample migration logs.")
    event(c, "customer_update", "2026-10-08T08:00:00Z", role="customer", actor="Jamie Taylor",
          actorMail="customer@example.org", preview="The sample logs are ready. Could you share documentation and the next step?",
          signals=[{"type": "Additional Request", "category": "Documentation", "label": "Configuration documentation requested",
                    "phrase": "documentation", "quote": "Could you share configuration documentation?"}])
    c = add_case(2, "Fabrikam", "Service restoration: first contact pending", "A")
    owner(c)
    c = add_case(3, "Woodgrove Bank", "Directory synchronisation: owner not visible", "B")
    c = add_case(4, "Tailwind Traders", "Calendar integration: engineering review", "B")
    owner(c)
    update(c, "2026-10-08T06:30:00Z", ball="Product Group", preview="Waiting for the product group; next update is pending.")
    c = add_case(5, "Northwind", "Customer validation of a configuration change", "C")
    owner(c)
    update(c, "2026-10-09T10:00:00Z", ball="Customer", preview="Please validate the sample configuration.")
    c = add_case(6, "Adventure Works", "Reopened collaboration issue", "B")
    owner(c)
    update(c, "2026-10-08T07:00:00Z", ball="Customer")
    event(c, "closed", "2026-10-08T08:00:00Z", role="system", resolution="Validation complete")
    event(c, "reopened", "2026-10-09T06:00:00Z", role="system")
    event(c, "customer_update", "2026-10-09T07:00:00Z", role="customer", actor="Jamie Taylor",
          actorMail="customer@example.org", sentiment="Frustrated", preview="The fictional test is still failing; please review the next action.",
          signals=[{"type": "Complaint", "category": "Response time", "label": "Update cadence concern",
                    "phrase": "still failing", "quote": "Please review the next action."}])

    for i, title in enumerate(["Mail routing configuration verified", "Access policy validation complete",
                                "Meeting integration restored", "Reporting workflow archived"], 7):
        c = add_case(i, accounts[(i - 7) % len(accounts)]["Title"], title, "C")
        owner(c)
        update(c, "2026-10-08T07:00:00Z", ball="Customer", preview="The sample configuration change passed validation.")
        event(c, "customer_update", "2026-10-08T08:00:00Z", role="customer", actor="Jamie Taylor",
              actorMail="customer@example.org", closure=True, preview="The sample test passed. Please close the case.")
        event(c, "archived" if i == 10 else "closed", "2026-10-08T09:00:00Z", role="system",
              resolution="Archived" if i == 10 else "Customer confirmed successful validation")
    c = add_case(11, "Northwind", "Closure confirmation still pending", "C")
    owner(c)
    update(c, "2026-10-08T07:00:00Z", ball="Customer")
    event(c, "customer_update", "2026-10-08T08:00:00Z", role="customer", actor="Jamie Taylor",
          actorMail="customer@example.org", closure=True, preview="The sample issue is resolved; please close.")
    c = add_case(12, "Adventure Works", "Older case without a closure notice", "C", "2026-08-01T06:00:00Z")
    sample = {
        "version": 1, "sampleAsOf": AS_OF, "generatedAt": AS_OF,
        "me": {"name": "Demo CSAM", "email": "csam@example.com"},
        "settings": {"staleCaseDays": 21, "pollSeconds": 60, "publishTimes": []},
        "accounts": accounts, "cases": cases,
        "events": sorted(events, key=lambda e: (e["t"], e["caseId"])),
    }
    (ROOT / "6-SampleData" / "mailbox.sample.json").write_text(
        json.dumps(sample, indent=2) + "\n", encoding="utf-8", newline="\n")
    print("Created 12 independently fictional cases across 6 invented accounts")


if __name__ == "__main__":
    main()
