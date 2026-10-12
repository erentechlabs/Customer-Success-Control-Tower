"""Synthetic regressions for official lifecycle notices with generic case subjects."""
import sys
import unittest
from pathlib import Path

CONNECTOR = Path(__file__).resolve().parent.parent / "7-LiveConnector"
sys.path.insert(0, str(CONNECTOR))
import csct_live as live

CASE = "2610100000000001"
SUBJECT = "Case " + CASE + " TrackingID#" + CASE
CLOSED = (
    "Support\nHello,\nThank you for using Microsoft products and services. "
    "This email is to confirm that your support case has been closed, the details follow:\n"
    "Service Request #: " + CASE + "\nService Request Title: Fictional collaboration issue\n"
    "Closed Date: 10/10/2026 9:57:19 AM UTC\nDid we resolve your issue?"
)


def classify(text, address="support@mail.support.microsoft.com", name="Microsoft Support", subject=SUBJECT):
    message = {"id": "fictional-id", "subject": subject, "from": {"emailAddress": {"name": name, "address": address}},
               "receivedDateTime": "2026-10-10T09:57:32Z", "toRecipients": [], "ccRecipients": []}
    return live.classify(message, text, "", CASE, False, set(), "")


class ClosureIngestionTests(unittest.TestCase):
    def test_generic_case_subject_with_official_closure_body(self):
        event = classify(CLOSED)
        self.assertEqual(event["kind"], "closed")
        self.assertEqual(event["role"], "system")
        self.assertEqual(event["resolution"], "Closed")
        self.assertEqual(event["fields"]["caseTitle"], "Fictional collaboration issue")
        self.assertNotIn("closure", event)

    def test_structured_notification_sender_also_uses_body(self):
        event = classify(CLOSED, address=live.NOTIF, name="Support notification")
        self.assertEqual(event["kind"], "closed")
        self.assertEqual(event["fields"]["caseTitle"], "Fictional collaboration issue")

    def test_plain_confirmation_with_newline(self):
        self.assertEqual(classify("Support\nYour support case has been closed.")["kind"], "closed")
        self.assertEqual(classify("We confirm that your service request was closed.")["kind"], "closed")

    def test_official_reopen_and_archive_confirmation(self):
        self.assertEqual(classify(CLOSED.replace("has been closed", "has been re-opened"))["kind"], "reopened")
        self.assertEqual(classify(CLOSED.replace("has been closed", "has been archived"))["kind"], "archived")

    def test_proposals_negative_and_scope_conditions_do_not_close(self):
        for body in [
            "We will consider the case closed if the issue is resolved.",
            "Your support case has not been closed.",
            "Please confirm whether we may close your case.",
            "If your support case is closed, contact us to reopen it.",
            "This email is to confirm that your support case will be closed.",
            "This email is to confirm that your support case has been reopened, not closed.",
        ]:
            with self.subTest(body=body):
                event = classify(body)
                self.assertNotEqual(event["kind"], "closed")
                self.assertNotEqual(event["kind"], "archived")

    def test_engineer_and_customer_messages_not_official_lifecycle(self):
        engineer = classify(CLOSED, address="engineer@microsoft.com", name="Demo Engineer")
        self.assertEqual(engineer["kind"], "ms_update")
        self.assertNotEqual(engineer["role"], "system")
        customer = classify(CLOSED, address="customer@example.org", name="Demo Customer")
        self.assertEqual(customer["kind"], "customer_update")

    def test_quoted_confirmation_does_not_close_current_notice(self):
        raw = "<p>Your case is still being investigated.</p><p>From: Microsoft Support</p><p>" + CLOSED + "</p>"
        cleaned = live.html_to_text(raw)
        self.assertEqual(classify(cleaned)["kind"], "notification")
        self.assertNotIn("has been closed", cleaned)

    def test_existing_subject_notifications_still_work(self):
        subjects = [
            ("Case " + CASE + " created with severity: B", "created"),
            ("Case " + CASE + " re-opened", "reopened"),
            ("Case " + CASE + " closed", "closed"),
            ("Case " + CASE + " archived", "archived"),
        ]
        for subject, kind in subjects:
            with self.subTest(subject=subject):
                self.assertEqual(classify("", address=live.NOTIF, subject=subject)["kind"], kind)


if __name__ == "__main__":
    unittest.main()
