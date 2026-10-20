import json
import copy
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

from advisory_policy import load_policy, workflow_policy
from advisory_protected_store import MemoryStore, ProtectedStore
from advisory_graph import DeliveryUnknown, GraphRequestError
from advisory_m365 import review_fields
from advisory_review import ReviewApp, initial_state, make_server
from advisory_sources import normalise_message
from advisory_workflow import ConflictError, WorkflowError


SETTINGS = Path(__file__).with_name("advisory-settings.example.json")


class ReviewIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.app = ReviewApp(load_policy(SETTINGS, demo=True))

    def ready(self):
        return next(d for d in self.app.model()["drafts"] if d["publishable"])

    def request_for(self, draft):
        return {key: draft[key] for key in ("id", "revision", "digest")}

    def test_seed_has_safe_ready_and_blocked_examples(self):
        model = self.app.model()
        self.assertTrue(model["demo"])
        self.assertFalse(model["liveEnabled"])
        self.assertEqual(3, len(model["drafts"]))
        self.assertEqual(1, sum(d["publishable"] for d in model["drafts"]))
        self.assertNotIn("Internal-only operational context", json.dumps(model))
        self.assertNotIn("private.sharepoint.com", json.dumps(model))

    def test_manager_demo_approval_has_one_fictional_receipt(self):
        draft = self.ready()
        self.app.publish(self.request_for(draft))
        self.app.demo_approve(self.request_for(draft))
        actual = next(d for d in self.app.model()["drafts"] if d["id"] == draft["id"])
        self.assertEqual("sent", actual["status"])
        with self.assertRaises(WorkflowError):
            self.app.demo_approve(self.request_for(draft))
        state = self.app.store.read()
        self.assertEqual([], state["workflow"]["drafts"][draft["id"]]["previousAttempts"])
        self.assertIsNone(self.app.graph)

    def test_edit_after_publish_invalidates_shared_version(self):
        draft = self.ready()
        self.app.publish(self.request_for(draft))
        self.app.edit({
            "id": draft["id"], "revision": draft["revision"],
            "subject": draft["subject"], "body": draft["body"] + "\nReviewed change.",
            "contentVerified": True,
        })
        with self.assertRaises(ConflictError):
            self.app.demo_approve(self.request_for(draft))
        new = next(d for d in self.app.model()["drafts"] if d["id"] == draft["id"])
        self.assertEqual("ready_for_approval", new["status"])
        self.assertNotEqual(draft["digest"], new["digest"])

    def test_publish_reuses_exact_version_without_resetting_approval(self):
        draft = self.ready()
        request = self.request_for(draft)
        self.app.publish(request)
        first = self.app.store.read()["remote"][draft["id"]]
        self.app.publish(request)
        self.assertEqual(first, self.app.store.read()["remote"][draft["id"]])

    def test_internal_link_edit_is_refused(self):
        draft = self.ready()
        with self.assertRaises(WorkflowError):
            self.app.edit({
                "id": draft["id"], "revision": draft["revision"], "subject": draft["subject"],
                "body": "Internal link https://eng.ms/private", "contentVerified": True,
            })
        self.assertEqual(draft["digest"], self.ready()["digest"])

    def test_alias_only_notice_needs_explicit_scope(self):
        notice = next(d for d in self.app.model()["drafts"] if d.get("resolvable"))
        self.assertFalse(notice["publishable"])
        self.app.resolve({
            "noticeId": notice["noticeId"], "sourceHash": notice["sourceHash"],
            "environmentIds": [{"type": "subscription", "id": "44444444-4444-4444-8444-444444444444"}],
            "evidence": "Fictional complete scope confirmation", "verified": True,
        })
        self.assertEqual(2, len(self.app.store.read()["workflow"]["drafts"]))

    def test_changed_scope_snapshot_is_rejected(self):
        notice = next(d for d in self.app.model()["drafts"] if d.get("resolvable"))
        with self.assertRaises(ConflictError):
            self.app.resolve({
                "noticeId": notice["noticeId"], "sourceHash": "outdated",
                "environmentIds": [], "evidence": "Fictional proof", "verified": True,
            })

    def test_live_policy_rejects_memory_only_store(self):
        with self.assertRaises(ValueError):
            ReviewApp(load_policy(SETTINGS), store=MemoryStore(initial_state))

    def test_unconfigured_provider_prepares_but_cannot_publish(self):
        policy = load_policy(SETTINGS)
        self.assertFalse(policy["publishEnabled"])
        self.assertFalse(policy["liveEnabled"])
        self.assertEqual("unconfigured", workflow_policy(policy)["approvalProvider"]["siteId"])


class SourceNormalisationTests(unittest.TestCase):
    def test_forwarded_source_and_customer_links_are_retained(self):
        message = normalise_message({
            "id": "fictional", "subject": "FW: [Advisory] Action Required DEMO-001",
            "from": {"emailAddress": {"address": "forwarder@example.com"}},
            "receivedDateTime": "2030-01-01T00:00:00Z",
            "body": {"contentType": "html", "content":
                     "<p>From: original alert</p><p>Action Required Update Alert</p>"
                     "<p>Current Message for Customers [Updated at 2030-01-01T00:00:00Z]:</p>"
                     "<p>Read <a href='https://learn.microsoft.com/azure'>guidance</a></p>"
                     "<script>never execute this</script>"},
        })
        self.assertIn("From: original alert", message["body"]["content"])
        self.assertIn("https://learn.microsoft.com/azure", message["body"]["content"])
        self.assertNotIn("never execute", message["body"]["content"])
        self.assertTrue(message["metadata"]["actionRequired"])


class FakeDeliveryGraph:
    def __init__(self, policy, item, source):
        self.policy = policy
        self.item = copy.deepcopy(item)
        self.source = source
        self.outlook = None
        self.send_calls = 0
        self.sent = []
        self.fail_claim = False
        self.lose_send_response = False

    def get(self, path):
        if path.startswith("/me?"):
            return {"id": self.policy["senderId"], "mail": self.policy["senderEmail"]}
        if "/items/" in path:
            return copy.deepcopy(self.item)
        if "/me/messages/fictional-ready?" in path:
            return copy.deepcopy(self.source)
        if "/me/messages/outlook-fictional?" in path:
            return copy.deepcopy(self.outlook)
        raise AssertionError("Unexpected fake path: " + path)

    def all(self, path, max_pages=20):
        if "/mailFolders/sentitems/" in path:
            return copy.deepcopy(self.sent)
        if path.startswith("/me/messages?"):
            return [copy.deepcopy(self.source)]
        raise AssertionError("Unexpected fake collection: " + path)

    def update(self, path, body, etag):
        if self.fail_claim or etag != self.item["eTag"]:
            raise GraphRequestError("Synthetic approval version conflict")
        self.item["fields"].update(copy.deepcopy(body))
        self.item["eTag"] = '"fictional-claimed"'

    def create(self, path, body):
        self.outlook = {"id": "outlook-fictional", "isDraft": True, **copy.deepcopy(body), "bccRecipients": []}
        return self.outlook

    def action(self, path, body=None):
        self.send_calls += 1
        if self.lose_send_response:
            raise DeliveryUnknown("Synthetic lost response")
        self.sent = [{"id": "sent-fictional", "isDraft": False, "sentDateTime": "2030-01-01T00:00:00Z"}]


@unittest.skipUnless(os.name == "nt", "Production-like tests require protected Windows storage")
class WorkerDeliveryTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        demo = ReviewApp(load_policy(SETTINGS, demo=True))
        state = demo.store.read()
        draft = next(iter(state["workflow"]["drafts"].values()))
        self.identifier = draft["id"]
        self.policy = copy.deepcopy(demo.policy)
        self.policy.update(demo=False, liveEnabled=True, publishEnabled=True, outboundConsentRecorded=True)
        self.policy["approvalProvider"] = {
            "siteId": "microsoft.sharepoint.com,33333333-3333-4333-8333-333333333333,44444444-4444-4444-8444-444444444444",
            "listId": "55555555-5555-4555-8555-555555555555",
            "restrictedAccessConfirmed": True, "privacyReviewConfirmed": True,
        }
        self.store = ProtectedStore(Path(self.folder.name) / "worker.dpapi", lambda: copy.deepcopy(state))
        app = ReviewApp(self.policy, store=self.store)
        envelope = app._envelope(draft, state)
        fields = review_fields(envelope)
        fields["ApprovalStatus"] = "Approved"
        from advisory_review import stamp
        item = {
            "id": "42", "fields": fields, "eTag": '"fictional-approved"',
            "lastModifiedBy": {"user": {"id": self.policy["approverIds"][-1]}},
            "lastModifiedDateTime": stamp(),
        }
        notice = state["workflow"]["notices"][draft["noticeId"]]
        source = {
            "id": draft["sourceMessageId"], "subject": "Action Required DEMO-001",
            "from": {"emailAddress": {"address": "advisoryalerts@example.com"}},
            "receivedDateTime": notice["receivedAt"],
            "body": {"contentType": "text", "content":
                     "Event ID: DEMO-001\nService: Azure Document Intelligence\n"
                     "Classification: Action Required\n"
                     "Subscription ID: 44444444-4444-4444-8444-444444444444\n"
                     "Current Message for Customers [Updated at " + notice["updatedAt"] + "]:\n"
                     + notice["customerText"] + "\nYou received this email based on your alert preferences."},
        }
        self.graph = FakeDeliveryGraph(self.policy, item, source)
        self.app = ReviewApp(self.policy, store=self.store, graph=self.graph)
        self.store.mutate(lambda value: value["remote"].update({
            self.identifier: {"state": "published", "revision": draft["revision"],
                              "digest": draft["digest"], "envelope": envelope, "itemId": "42"},
        }))
        self.hours = patch("advisory_review.in_sending_hours", return_value=True)
        self.hours.start()

    def tearDown(self):
        self.hours.stop()
        self.folder.cleanup()

    def status(self):
        return self.store.read()["workflow"]["drafts"][self.identifier]["status"]

    def test_native_manager_receipt_sends_once_and_records_outlook_receipt(self):
        self.app.tick()
        self.assertEqual("sent", self.status())
        self.app.tick()
        self.assertEqual(1, self.graph.send_calls)

    def test_changed_approved_text_never_creates_outlook_message(self):
        self.graph.item["fields"]["MessageBody"] += " Changed after preview"
        with self.assertRaises(GraphRequestError):
            self.app.tick()
        self.assertEqual(0, self.graph.send_calls)
        self.assertIsNone(self.graph.outlook)

    def test_approval_claim_etag_conflict_stops_send(self):
        self.graph.fail_claim = True
        with self.assertRaises(GraphRequestError):
            self.app.tick()
        self.assertEqual("delivery_unknown", self.status())
        self.assertEqual(0, self.graph.send_calls)

    def test_unknown_send_is_reconciled_without_retry(self):
        self.graph.lose_send_response = True
        with self.assertRaises(DeliveryUnknown):
            self.app.tick()
        self.assertEqual("delivery_unknown", self.status())
        self.app.tick()
        self.assertEqual(1, self.graph.send_calls)
        self.graph.sent = [{"id": "verified-fictional-sent", "isDraft": False, "sentDateTime": "2030-01-01T00:00:00Z"}]
        self.app.tick()
        self.assertEqual("sent", self.status())
        self.assertEqual(1, self.graph.send_calls)

    def test_bad_approval_is_visible_and_does_not_poison_future_worker_cycles(self):
        self.graph.item["fields"]["MessageBody"] += " Changed after preview"
        result = self.app.tick(raise_on_error=False)
        self.assertEqual("review_blocked", result["status"])
        self.assertEqual(1, len(result["failures"]))
        model = self.app.model()
        self.assertTrue(model["workerError"])
        self.assertEqual("needs_review", next(d for d in model["drafts"] if d["id"] == self.identifier)["status"])
        self.assertEqual("reviewed", self.app.tick(raise_on_error=False)["status"])
        self.assertEqual(0, self.graph.send_calls)

    def test_source_timestamp_change_cannot_resend_identical_customer_payload(self):
        self.app.tick()
        self.assertEqual(1, self.graph.send_calls)
        from datetime import datetime, timedelta, timezone
        from advisory_review import stamp
        changed = copy.deepcopy(self.graph.source)
        notice = self.store.read()["workflow"]["notices"]["fictional-ready"]
        changed["body"]["content"] = changed["body"]["content"].replace(
            notice["updatedAt"], stamp(datetime.now(timezone.utc) - timedelta(seconds=1)))
        self.graph.source = changed
        self.store.mutate(lambda state: self.app.flow(state).ingest(normalise_message(changed)))
        draft = self.store.read()["workflow"]["drafts"][self.identifier]
        self.store.mutate(lambda state: self.app.flow(state).mark_ready(self.identifier, draft["revision"]))
        current = self.store.read()
        draft = current["workflow"]["drafts"][self.identifier]
        envelope = self.app._envelope(draft, current)
        self.graph.item["fields"] = dict(review_fields(envelope), ApprovalStatus="Approved")
        self.graph.item["lastModifiedDateTime"] = stamp()
        self.graph.item["eTag"] = '"fictional-approved-v2"'
        self.store.mutate(lambda state: state["remote"].update({
            self.identifier: {"state": "published", "revision": draft["revision"],
                              "digest": draft["digest"], "envelope": envelope, "itemId": "42"},
        }))
        with self.assertRaises(ConflictError):
            self.app.tick()
        self.assertEqual(1, self.graph.send_calls)


class ReviewHttpTests(unittest.TestCase):
    def setUp(self):
        self.app = ReviewApp(load_policy(SETTINGS, demo=True))
        self.server = make_server(self.app, 0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = "http://127.0.0.1:%d" % self.server.server_port

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)

    def post(self, path, body, headers=None):
        req = urllib.request.Request(self.url + path, json.dumps(body).encode(), {
            "Content-Type": "application/json", **(headers or {}),
        })
        return urllib.request.urlopen(req)

    def test_state_has_no_actual_send_capability(self):
        with urllib.request.urlopen(self.url + "/api/state") as response:
            model = json.load(response)
        self.assertFalse(model["liveEnabled"])
        self.assertTrue(model["demo"])

    def test_cross_origin_approval_is_forbidden(self):
        with self.assertRaises(urllib.error.HTTPError) as raised:
            self.post("/api/demo/approve", {}, {
                "Origin": "https://example.com", "X-CSCT-Advisory": self.app.csrf,
            })
        self.assertEqual(403, raised.exception.code)

    def test_no_client_supplied_production_identity_endpoint(self):
        with self.assertRaises(urllib.error.HTTPError) as raised:
            self.post("/api/approve", {"actorId": "pretend-approver"}, {
                "Origin": self.url, "X-CSCT-Advisory": self.app.csrf,
            })
        self.assertEqual(403, raised.exception.code)

    def test_html_and_headers_are_private(self):
        with urllib.request.urlopen(self.url) as response:
            self.assertEqual("no-store", response.headers["Cache-Control"])
            markup = response.read().decode()
        self.assertNotIn("@@ADVISORY_CSRF@@", markup)
        self.assertIn("Advisory approval queue", markup)


if __name__ == "__main__":
    unittest.main()
