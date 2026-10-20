import os
import tempfile
import unittest
import copy
from datetime import datetime, timedelta, timezone
from pathlib import Path

from advisory_graph import DeliveryUnknown, GraphRequestError, relative_path, response_data
from advisory_protected_store import MemoryStore, ProtectedStore, StoreError
from advisory_m365 import SharePointApprovals, OutlookOutbox, review_fields, DISPATCH_PROPERTY


class GraphResponseTests(unittest.TestCase):
    def reply(self, status, data=None):
        return {"result": {"isError": False, "structuredContent": {
            "results": [{"statusCode": status, "data": data}],
        }}}

    def test_structured_read(self):
        self.assertEqual(response_data(self.reply(200, {"id": "fictional"})), {"id": "fictional"})

    def test_no_content_write(self):
        self.assertIsNone(response_data(self.reply(202), write=True))

    def test_known_rejection_is_not_success(self):
        with self.assertRaises(GraphRequestError):
            response_data(self.reply(403), write=True)

    def test_unrecognized_write_must_not_retry(self):
        with self.assertRaises(DeliveryUnknown):
            response_data({"result": {"content": []}}, write=True)

    def test_missing_http_status_is_not_success(self):
        with self.assertRaises(GraphRequestError):
            response_data({"result": {"structuredContent": {"results": [{"data": {}}]}}})

    def test_external_paths_are_refused(self):
        for path in ("https://example.com/private", "//example.com/private", "/me\r\nbad", "/me#fragment"):
            with self.subTest(path=path), self.assertRaises(GraphRequestError):
                relative_path(path)

    def test_graph_paging_path_is_normalized(self):
        self.assertEqual(relative_path("https://graph.microsoft.com/v1.0/me/messages?$skip=3"),
                         "/me/messages?$skip=3")


class MemoryStoreTests(unittest.TestCase):
    def test_demo_does_not_persist(self):
        store = MemoryStore(lambda: {"count": 0})
        self.assertFalse(store.persistent)
        store.mutate(lambda state: state.update(count=1))
        self.assertEqual(store.read()["count"], 1)

    def test_failed_mutation_rolls_back(self):
        store = MemoryStore(lambda: {"count": 0})

        def fail(state):
            state["count"] = 1
            raise ValueError("Synthetic validation failure")

        with self.assertRaises(ValueError):
            store.mutate(fail)
        self.assertEqual(store.read()["count"], 0)


class FakeGraph:
    def __init__(self, me):
        self.me = me
        self.item = None
        self.created = []
        self.sent = []
        self.messages = []

    def get(self, path):
        if path.startswith("/me?"):
            return self.me
        if "/items/" in path:
            return self.item
        raise AssertionError("Unexpected fake Graph path: " + path)

    def all(self, path, max_pages=20):
        if "/columns?" in path:
            from advisory_m365 import REVIEW_FIELDS
            return [{"name": key} for key in REVIEW_FIELDS]
        if "/items?" in path:
            return [] if self.item is None else [self.item]
        if "/sentitems/" in path:
            return self.messages
        raise AssertionError("Unexpected fake collection: " + path)

    def create(self, path, body):
        self.created.append((path, copy.deepcopy(body)))
        return {"id": "42", "webUrl": "https://microsoft.sharepoint.com/fictional"}

    def update(self, path, body, etag):
        self.item["fields"] = copy.deepcopy(body)

    def action(self, path, body=None):
        self.sent.append(path)


class MicrosoftApprovalTests(unittest.TestCase):
    def setUp(self):
        self.policy = {
            "senderId": "11111111-1111-4111-8111-111111111111",
            "senderEmail": "fictional-owner@example.com",
            "approverIds": ["22222222-2222-4222-8222-222222222222"],
            "publishEnabled": True, "liveEnabled": False, "outboundConsentRecorded": False,
            "approvalProvider": {
                "siteId": "microsoft.sharepoint.com,33333333-3333-4333-8333-333333333333,44444444-4444-4444-8444-444444444444",
                "listId": "55555555-5555-4555-8555-555555555555",
                "restrictedAccessConfirmed": True, "privacyReviewConfirmed": True,
            },
        }
        self.envelope = {
            "id": "draft_fictional_42", "revision": 1, "digest": "a" * 64,
            "to": ["azure@example.com"], "cc": [], "subject": "Fictional reviewed subject",
            "body": "Fictional customer-safe text", "customerName": "Fictional customer",
            "expiresAt": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            "contentVerified": True,
            "sourceCustomerText": "Fictional source for the customer",
            "scope": {"environmentIds": [{"type": "tenant", "id": "77777777-7777-4777-8777-777777777777"}]},
        }
        self.graph = FakeGraph({"id": self.policy["senderId"], "mail": self.policy["senderEmail"]})
        self.bridge = SharePointApprovals(self.graph, self.policy)

    def approved_item(self, actor=None):
        fields = review_fields(self.envelope)
        fields["ApprovalStatus"] = "Approved"
        return {
            "id": "42", "fields": fields, "eTag": '"fictional-etag-1"',
            "lastModifiedBy": {"user": {"id": actor or self.policy["approverIds"][0]}},
            "lastModifiedDateTime": datetime.now(timezone.utc).isoformat(),
        }

    def test_receipt_uses_server_actor_not_editable_approver_name(self):
        self.graph.item = self.approved_item("99999999-9999-4999-8999-999999999999")
        self.graph.item["fields"]["Approver"] = self.policy["approverIds"][0]
        with self.assertRaises(GraphRequestError):
            self.bridge.receipt(self.envelope, "42")

    def test_exact_snapshot_approval(self):
        self.graph.item = self.approved_item()
        proof = self.bridge.receipt(self.envelope, "42")
        self.assertEqual(proof["receipt"]["actorId"], self.policy["approverIds"][0])
        self.assertEqual(proof["receipt"]["provider"], "graph-sharepoint")

    def test_changed_text_revokes_remote_approval(self):
        self.graph.item = self.approved_item()
        self.graph.item["fields"]["MessageBody"] += " Changed without review"
        with self.assertRaises(GraphRequestError):
            self.bridge.receipt(self.envelope, "42")

    def test_changed_recipients_revoke_remote_approval(self):
        self.graph.item = self.approved_item()
        self.graph.item["fields"]["RecipientsJson"] = '{"to":["other@example.com"],"cc":[]}'
        with self.assertRaises(GraphRequestError):
            self.bridge.receipt(self.envelope, "42")

    def test_pending_item_does_not_authorize_send(self):
        self.graph.item = self.approved_item()
        self.graph.item["fields"]["ApprovalStatus"] = "Awaiting review"
        self.assertIsNone(self.bridge.receipt(self.envelope, "42")["receipt"])

    def test_publish_does_not_include_internal_context(self):
        self.envelope["internalText"] = "Never share this original thread"
        self.bridge.publish(self.envelope)
        serialized = str(self.graph.created)
        self.assertNotIn("Never share", serialized)

    def test_restricted_access_must_be_confirmed(self):
        self.policy["approvalProvider"]["restrictedAccessConfirmed"] = False
        with self.assertRaises(GraphRequestError):
            self.bridge.publish(self.envelope)
        self.assertFalse(self.graph.created)

    def test_wrong_signed_in_mailbox_is_rejected(self):
        self.graph.me = {"id": "other", "mail": "fictional-owner@example.com"}
        with self.assertRaises(GraphRequestError):
            self.bridge.publish(self.envelope)

    def test_production_sender_is_disabled(self):
        outbox = OutlookOutbox(self.graph, self.policy)
        with self.assertRaises(GraphRequestError):
            outbox.create_draft(self.envelope, "66666666-6666-4666-8666-666666666666")
        self.assertFalse(self.graph.created)

    def test_header_injection_is_rejected(self):
        self.envelope["to"] = ["azure@example.com\r\nBcc:bad@example.com"]
        with self.assertRaises(GraphRequestError):
            review_fields(self.envelope)

    def test_unknown_delivery_is_not_assumed_sent(self):
        self.policy.update(liveEnabled=True, outboundConsentRecorded=True)
        self.assertIsNone(OutlookOutbox(self.graph, self.policy).sent_receipt(
            "66666666-6666-4666-8666-666666666666"))

    def test_multiple_receipts_need_manual_reconciliation(self):
        self.policy.update(liveEnabled=True, outboundConsentRecorded=True)
        self.graph.messages = [
            {"id": "1", "isDraft": False, "sentDateTime": "2030-01-01T01:00:00Z"},
            {"id": "2", "isDraft": False, "sentDateTime": "2030-01-01T01:01:00Z"},
        ]
        with self.assertRaises(GraphRequestError):
            OutlookOutbox(self.graph, self.policy).sent_receipt("66666666-6666-4666-8666-666666666666")


@unittest.skipUnless(os.name == "nt", "Live encrypted storage requires Windows DPAPI")
class ProtectedStoreTests(unittest.TestCase):
    def test_encrypted_round_trip_and_no_cleartext_temp(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "fictional.dpapi"
            store = ProtectedStore(path, lambda: {"version": 1})
            store.mutate(lambda state: state.update(body="Fictional customer-safe content"))
            self.assertNotIn(b"Fictional customer-safe content", path.read_bytes())
            self.assertEqual(store.read()["body"], "Fictional customer-safe content")
            self.assertFalse(path.with_suffix(".protected-tmp").exists())

    def test_tamper_is_reported_not_reset(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "fictional.dpapi"
            store = ProtectedStore(path, lambda: {"version": 1})
            store.mutate(lambda state: state.update(count=1))
            raw = bytearray(path.read_bytes())
            raw[-4] ^= 0x7F
            path.write_bytes(raw)
            with self.assertRaises(StoreError):
                store.read()


if __name__ == "__main__":
    unittest.main()
