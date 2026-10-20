"""Private Advisory review sidecar. Production sharing and sending are off by default."""

import argparse
import copy
import json
import os
import secrets
import threading
import urllib.parse
import webbrowser
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from advisory_graph import GraphRequestError, WorkIQGraph
from advisory_m365 import OutlookOutbox, SharePointApprovals
from advisory_policy import PolicyError, deployment_blockers, in_sending_hours, load_policy, workflow_policy
from advisory_protected_store import MemoryStore, ProtectedStore, StoreError
from advisory_sources import MailboxNotices
from advisory_workflow import ConflictError, Workflow, WorkflowError, empty_state


HERE = Path(__file__).resolve().parent
UTC = timezone.utc
LOCKED = {"dispatching", "submitted", "sent", "delivery_unknown", "delivery_rejected"}


def stamp(value=None):
    return (value or datetime.now(UTC)).astimezone(UTC).isoformat()


def initial_state():
    return {"version": 1, "workflow": empty_state(), "remote": {}, "delivery": {}, "errors": [], "workerError": None}


def reason_text(value):
    if isinstance(value, dict):
        return str(value.get("message") or value.get("code") or "Review required")
    return {
        "translation_or_manual_review_required": "The customer text and its translation must be verified by a human.",
        "human_rejected": "The designated reviewer rejected this version.",
        "source_changed": "The source was updated; the new version needs approval.",
        "mapping_changed": "The environment or contact mapping changed; approval must be renewed.",
    }.get(value, str(value))


def safe_approval_url(value):
    if not isinstance(value, str):
        return None
    parsed = urllib.parse.urlsplit(value)
    return value if parsed.scheme == "https" and parsed.hostname == "microsoft.sharepoint.com" else None


# Operator-only routing confidence: derived entirely from signals the engine has already verified
# (exact GUID scope, verified mapping, human content check, approval state). Never sent to the
# customer or any third party; shown only inside Control Tower to help the operator/approver triage
# the queue.
_STATUS_CONFIDENCE = {
    "sent": ("high", "Message was sent and verified in Sent Items."),
    "submitted": ("high", "Submitted to Outlook; awaiting the definitive delivery record."),
    "approved": ("high", "Approved; the send operation is queued."),
    "dispatching": ("high", "Approved; the send is currently in progress."),
    "delivery_unknown": ("medium", "Send was attempted but the result could not be verified; manual reconciliation required."),
    "delivery_rejected": ("low", "Send was definitively rejected by the email infrastructure."),
    "rejected": ("low", "The designated reviewer rejected this version; it needs to be revised."),
}


def routing_assessment(dto):
    """Return (confidence, reason, decision) for one draft/notice row.

    confidence: "high" | "medium" | "low". decision mirrors the three requested categories
    (suitable for automatic routing / manual review required / does not affect the customer), plus
    "Already routed" once a draft has already passed the routing decision point (approved or
    further). "Automatic routing" here always still means the human Microsoft Lists approval
    gate, never an unattended customer send.
    """
    status = dto["status"]
    blockers = dto.get("blockers") or []
    if any("terminal" in str(b).lower() for b in blockers):
        return ("low",
                "The source event's status is no longer Action Required (resolved/closed/cancelled); "
                "no new notice is needed for the customer.",
                "Does not affect the customer")
    if status in _STATUS_CONFIDENCE:
        label, reason = _STATUS_CONFIDENCE[status]
        return label, reason, "Already routed"
    if status == "needs_customer_content":
        return ("low",
                "No recognizable event/environment identity in the source; the customer could not "
                "be determined automatically.",
                "Manual review required")
    if status == "needs_mapping":
        if (dto.get("evidence") or {}).get("environmentIds"):
            return ("medium",
                    "The affected customer/environment was verified by exact GUID; the responsible "
                    "technical team and recipient contacts are not yet mapped.",
                    "Manual review required")
        return ("low",
                "An event identity was found but the full tenant/subscription GUID scope is not yet verified.",
                "Manual review required")
    if status == "needs_review":
        if dto.get("customerName"):
            return ("medium",
                    "Customer and team matched, draft created; the text/translation is awaiting human approval.",
                    "Manual review required")
        return ("low",
                "The source changed or the scope/mapping is in conflict; it needs to be reviewed again.",
                "Manual review required")
    if status in ("ready_for_approval", "awaiting_approval"):
        return ("high",
                "Customer, team, exact scope and customer-facing text are all verified; ready to be "
                "submitted to the approval queue.",
                "Suitable for automatic routing")
    return "medium", "Status not recognized; review manually.", "Manual review required"


class ReviewApp:
    def __init__(self, policy, store=None, graph=None):
        self.policy = policy
        self.core_policy = workflow_policy(policy)
        self.store = store or (
            MemoryStore(initial_state) if policy["demo"] else ProtectedStore(
                Path(os.environ.get("LOCALAPPDATA") or Path.home()) / "CSCT" / "advisory-review.dpapi",
                initial_state,
            )
        )
        if not policy["demo"] and not self.store.persistent:
            raise PolicyError("A live review application requires protected persistent storage.")
        self.graph = graph
        self.operation_lock = threading.RLock()
        self.stop = threading.Event()
        self.csrf = secrets.token_urlsafe(32)
        if policy["demo"] and not self.store.read()["workflow"]["notices"]:
            self._seed_demo()

    def flow(self, state):
        if state.get("version") != 1 or not all(key in state for key in ("workflow", "remote", "delivery", "errors")):
            raise StoreError("Invalid review state; do not silently reset the queue.")
        return Workflow(state["workflow"], self.core_policy)

    def broker(self):
        if self.policy["demo"]:
            raise PolicyError("Demonstration mode cannot access Microsoft 365.")
        if self.graph is None:
            self.graph = WorkIQGraph(self.policy["senderEmail"])
        return self.graph

    def _sender(self):
        return SharePointApprovals(self.broker(), self.policy).assert_sender()

    def _error(self, error):
        def save(state):
            state["errors"] = (state["errors"] + [{"at": stamp(), "error": str(error)}])[-20:]
            state["workerError"] = {"at": stamp(), "error": str(error)}
        self.store.mutate(save)

    def _draft(self, state, identifier, revision=None, digest=None):
        draft = state["workflow"]["drafts"].get(identifier)
        if not draft:
            raise WorkflowError("Draft not found.")
        if revision is not None and draft["revision"] != revision:
            raise ConflictError("The draft was changed by another operation. Refresh and review again.")
        if digest is not None and draft["digest"] != digest:
            raise ConflictError("The displayed text or recipient version is no longer current.")
        return draft

    def _envelope(self, draft, state, expires=None):
        return {
            **{key: copy.deepcopy(draft[key]) for key in ("id", "revision", "digest", "to", "cc", "subject", "body", "customerName", "contentVerified")},
            "expiresAt": expires or stamp(datetime.now(UTC) + timedelta(hours=self.policy["approvalLifetimeHours"])),
            "sourceCustomerText": state["workflow"]["notices"][draft["noticeId"]]["customerText"],
            "scope": {
                "environmentIds": draft["environmentIds"], "eventId": draft["eventId"],
                "service": draft["service"], "customerId": draft["customerId"], "teamId": draft["teamId"],
                "sourceHash": draft["sourceHash"], "sourceUpdatedAt": draft["sourceUpdatedAt"],
                "mappingRevision": draft["mappingRevision"],
            },
        }

    def model(self):
        state = self.store.read()
        flow = self.flow(state)
        drafts = []
        for draft in flow.list_drafts():
            remote = state["remote"].get(draft["id"], {})
            matching = remote.get("digest") == draft["digest"] and remote.get("revision") == draft["revision"]
            approval = draft.get("approval") or {}
            approval_blocked = remote.get("state") == "approval_blocked" and draft["status"] not in LOCKED
            dto = {
                **{key: copy.deepcopy(draft.get(key)) for key in (
                    "id", "revision", "digest", "customerName", "teamId", "service", "eventId",
                    "to", "cc", "subject", "body", "contentVerified",
                )},
                "status": "needs_review" if approval_blocked else "awaiting_approval" if matching and remote.get("state") == "published"
                          and draft["status"] == "ready_for_approval" else draft["status"],
                "blockers": [reason_text(value) for value in draft.get("reviewReasons", [])] +
                            ([remote["error"]] if approval_blocked else []),
                "publishable": draft["status"] == "ready_for_approval" and draft.get("contentVerified") is True,
                "editable": draft["status"] not in LOCKED, "approvedBy": approval.get("actorId"),
                "approvalUrl": safe_approval_url(remote.get("webUrl")) if matching else None,
                "noticeId": draft["noticeId"],
                "previousDeliveries": len(draft.get("previousAttempts", [])),
                "evidence": {
                    "environmentIds": draft["environmentIds"], "mappingRevision": draft["mappingRevision"],
                    "sourceUpdatedAt": draft["sourceUpdatedAt"], "sourceHash": draft["sourceHash"],
                    "scopeVerification": draft["scopeEvidence"],
                    "customerSafeSource": state["workflow"]["notices"][draft["noticeId"]]["customerText"],
                },
            }
            dto["confidence"], dto["confidenceReason"], dto["decision"] = routing_assessment(dto)
            drafts.append(dto)
        referenced = {draft["noticeId"] for draft in state["workflow"]["drafts"].values()}
        active_notices = {value["noticeId"] for value in state["workflow"]["events"].values()}
        for notice in state["workflow"]["notices"].values():
            if notice.get("status") != "needs_review" or notice["id"] in referenced:
                continue
            if notice.get("eventId") and notice["id"] not in active_notices:
                continue
            pseudo = {
                "id": "notice:" + notice["id"], "noticeId": notice["id"], "revision": 0,
                "status": "needs_mapping" if notice.get("eventId") else "needs_customer_content",
                "eventId": notice.get("eventId"), "service": notice.get("service"),
                "customerName": None, "teamId": None, "to": [], "cc": [], "subject": "",
                "body": notice.get("customerText", ""), "contentVerified": False,
                "publishable": False, "editable": False,
                "resolvable": bool(notice.get("eventId")),
                "blockers": [reason_text(value) for value in notice.get("reviewReasons", [])],
                "evidence": {"displayAliases": notice.get("displayAliases"), "environmentIds": notice.get("environmentIds")},
                "sourceHash": notice.get("sourceHash"),
            }
            pseudo["confidence"], pseudo["confidenceReason"], pseudo["decision"] = routing_assessment(pseudo)
            drafts.append(pseudo)
        mappings = [{
            "environmentId": row["id"], "environmentType": row["type"],
            "customerName": row["customerName"], "teamId": row["teamId"], "to": row["to"],
            "evidence": row["verification"]["source"],
        } for row in state["workflow"]["mapping"]["environments"]]
        return {
            "demo": self.policy["demo"], "liveEnabled": self.policy["liveEnabled"],
            "publishEnabled": self.policy["publishEnabled"], "senderEmail": self.policy["senderEmail"],
            "drafts": drafts, "mappings": mappings, "deploymentBlockers": deployment_blockers(self.policy),
            "dataRevision": state["workflow"]["dataRevision"], "errors": state["errors"][-3:],
            "mappingRevision": state["workflow"]["mappingRevision"],
            "workerError": state.get("workerError"),
        }

    def import_mailbox(self):
        with self.operation_lock:
            messages = MailboxNotices(self.broker(), self.policy).recent()
            results = self.store.mutate(lambda state: [self.flow(state).ingest(message) for message in messages])
        return {"message": "%d notices reviewed. Notices with unresolved source or identity were left for review." % len(results)}

    def mapping(self, body):
        if body.get("verified") is not True:
            raise WorkflowError("Identity and responsible-team verification is required.")
        actor = "fictional reviewer" if self.policy["demo"] else self._sender()["id"]
        now = datetime.now(UTC)
        proof = {
            "source": "Verified by " + actor + ": " + str(body.get("evidence", "")),
            "verifiedAt": stamp(now), "expiresAt": stamp(now + timedelta(days=30)),
        }
        route = {
            "id": body.get("environmentId"), "type": body.get("environmentType"),
            "customerId": body.get("customerId"), "customerName": body.get("customerName"),
            "teamId": body.get("teamId"), "services": [body.get("service")],
            "to": body.get("to"), "cc": body.get("cc"), "allowedDomains": body.get("domains"),
            "verification": proof, "contactVerification": dict(proof),
        }

        def save(state):
            flow = self.flow(state)
            rows = [row for row in state["workflow"]["mapping"]["environments"]
                    if not (row["id"] == route["id"] and row["type"] == route["type"]
                            and route["services"][0] in row["services"])]
            if type(body.get("mappingRevision")) is not int:
                raise ConflictError("A mapping version is required. Refresh the screen.")
            flow.set_mapping({"environments": rows + [route]}, body["mappingRevision"])
        self.store.mutate(save)
        return {"message": "Mapping saved. Previous approvals for affected drafts are now invalid."}

    def resolve(self, body):
        if body.get("verified") is not True or not str(body.get("evidence", "")).strip():
            raise WorkflowError("You must verify the full list of environments affected by the event.")
        actor = "fictional reviewer" if self.policy["demo"] else self._sender()["id"]
        now = datetime.now(UTC)
        evidence = {
            "source": "Complete source scope verified by " + actor + ": " + body["evidence"],
            "verifiedAt": stamp(now), "expiresAt": stamp(now + timedelta(hours=24)),
        }
        def resolve(state):
            notice = state["workflow"]["notices"].get(body["noticeId"])
            if not notice or notice.get("sourceHash") != body.get("sourceHash"):
                raise ConflictError("The event source changed; review the scope again.")
            return self.flow(state).set_environments(body["noticeId"], body["environmentIds"], evidence)
        self.store.mutate(resolve)
        return {"message": "Exact environment scope saved; contact and content checks were re-applied."}

    def edit(self, body):
        self.store.mutate(lambda state: self.flow(state).edit_draft(
            body["id"], body["revision"], {
                "subject": body["subject"], "body": body["body"],
                "contentVerified": body.get("contentVerified") is True,
            }))
        return {"message": "New text version saved; the previous approval can no longer be used."}

    def publish(self, body):
        with self.operation_lock:
            current = self.store.read()
            draft = self._draft(current, body["id"], body["revision"], body["digest"])
            old = current["remote"].get(draft["id"])
            if (old and old.get("state") == "published" and old["revision"] == draft["revision"]
                    and old["digest"] == draft["digest"]):
                return {"message": "This exact version is already in the approval area; no duplicate record was created."}
            def prepare(state):
                draft = self._draft(state, body["id"], body["revision"], body["digest"])
                if draft["status"] != "ready_for_approval" or not draft["contentVerified"]:
                    raise WorkflowError("Cannot submit for approval before the customer text is verified.")
                old = state["remote"].get(draft["id"], {})
                if old.get("state") == "publishing":
                    raise ConflictError("Publishing is already in progress for this draft.")
                envelope = self._envelope(draft, state)
                state["remote"][draft["id"]] = {
                    "state": "publishing", "revision": draft["revision"],
                    "digest": draft["digest"], "envelope": envelope,
                }
                return envelope
            envelope = self.store.mutate(prepare)
            try:
                published = {"itemId": "demo", "webUrl": None} if self.policy["demo"] else (
                    SharePointApprovals(self.broker(), self.policy).publish(envelope))
            except GraphRequestError as error:
                self.store.mutate(lambda state: state["remote"][body["id"]].update(
                    state="publication_unknown", error=str(error)))
                raise
            self.store.mutate(lambda state: state["remote"][body["id"]].update(
                state="published", itemId=published["itemId"], webUrl=published.get("webUrl")))
        return {"message": "Fictional approval record ready; no real publication occurred." if self.policy["demo"]
                else "The full recipients and text were submitted to the Microsoft Lists approval item."}

    def demo_approve(self, body):
        if not self.policy["demo"] or self.store.persistent:
            raise PolicyError("Fictional approval is not available on a real system.")
        with self.operation_lock:
            now = datetime.now(UTC)

            def approved(state):
                draft = self._draft(state, body["id"], body["revision"], body["digest"])
                receipt = {
                    "provider": "demo", **self.core_policy["approvalProvider"],
                    "draftId": draft["id"], "revision": draft["revision"], "digest": draft["digest"],
                    "actorId": self.policy["approverIds"][-1], "approvedAt": stamp(now),
                }
                flow = self.flow(state)
                flow.approve(draft["id"], draft["revision"], draft["digest"], receipt)
                return flow.claim(draft["id"], source_hash={
                    "hash": draft["sourceHash"], "messageId": draft["sourceMessageId"], "checkedAt": stamp(now),
                }, sender_id=self.policy["senderId"])
            attempt = self.store.mutate(approved)
            self.store.mutate(lambda state: self.flow(state).finish(
                body["id"], attempt["attemptId"], "sent", "fictional-message-" + attempt["attemptId"]))
        return {"message": "Fictional approval and a single delivery record were created. No real email was sent."}

    def _fresh_source(self, draft):
        mailbox = MailboxNotices(self.broker(), self.policy)
        active = mailbox.message(draft["sourceMessageId"])
        messages = mailbox.event(draft["eventId"])
        # Refresh through the same parser so a newer/malformed source revokes old approval.
        self.store.mutate(lambda state: [self.flow(state).ingest(message) for message in [active] + messages])
        state = self.store.read()
        current = self._draft(state, draft["id"], draft["revision"], draft["digest"])
        return {"hash": current["sourceHash"], "messageId": current["sourceMessageId"], "checkedAt": stamp()}

    def _process_draft(self, draft, snapshot, approval, outbox, sender_id):
        if draft["status"] in {"dispatching", "submitted", "delivery_unknown"}:
            receipt_id = outbox.sent_receipt(draft["attempt"]["attemptId"])
            if receipt_id:
                self.store.mutate(lambda state: self.flow(state).reconcile(
                    draft["id"], draft["attempt"]["attemptId"], receipt_id))
            return
        if draft["status"] in LOCKED:
            return
        remote = snapshot["remote"].get(draft["id"])
        if not remote or remote.get("state") != "published":
            return
        if remote["digest"] != draft["digest"] or remote["revision"] != draft["revision"]:
            return
        envelope = remote["envelope"]
        result = approval.receipt(envelope, remote["itemId"])
        if result["status"] == "Rejected":
            self.store.mutate(lambda state: self.flow(state).reject(
                draft["id"], draft["revision"], draft["digest"], result["receipt"]))
            return
        if result["status"] != "Approved":
            return
        receipt = result["receipt"]
        if not draft.get("approval") or draft["approval"]["approvedAt"] != receipt["approvedAt"].replace("+00:00", "Z"):
            self.store.mutate(lambda state: self.flow(state).approve(
                draft["id"], draft["revision"], draft["digest"], receipt))
        current_source = self._fresh_source(draft)
        latest = approval.receipt(envelope, remote["itemId"])
        if latest["status"] != "Approved" or latest["receipt"] != receipt:
            raise ConflictError("The approval changed during the source recheck; the send was stopped.")
        def claim(state):
            current = self._draft(state, draft["id"], draft["revision"], draft["digest"])
            payload = {key: current[key] for key in ("senderEmail", "senderId", "tenantId", "to", "cc", "subject", "body")}
            for previous in current.get("previousAttempts", []):
                if previous.get("outcome") in ("sent", "submitted", "uncertain") and previous.get("payload") == payload:
                    raise ConflictError("This exact text and recipient list was already sent, or its delivery is uncertain. It will not be sent again.")
            return self.flow(state).claim(draft["id"], source_hash=current_source, sender_id=sender_id)
        attempt = self.store.mutate(claim)
        try:
            approval.claim_approved_item(remote["itemId"], receipt)
            outlook_id = outbox.create_draft(envelope, attempt["attemptId"])
            self.store.mutate(lambda state: state["delivery"].update({
                draft["id"]: {"attemptId": attempt["attemptId"], "outlookDraftId": outlook_id},
            }))
            outbox.send_draft(outlook_id, envelope)
            receipt_id = outbox.sent_receipt(attempt["attemptId"])
        except GraphRequestError:
            self.store.mutate(lambda state: self.flow(state).finish(
                draft["id"], attempt["attemptId"], "uncertain"))
            raise
        self.store.mutate(lambda state: self.flow(state).finish(
            draft["id"], attempt["attemptId"], "sent" if receipt_id else "submitted", receipt_id))

    def tick(self, raise_on_error=True):
        if self.policy["demo"] or not self.policy["liveEnabled"]:
            return {"status": "live-disabled"}
        if not in_sending_hours():
            return {"status": "quiet-hours"}
        with self.operation_lock:
            approval = SharePointApprovals(self.broker(), self.policy)
            outbox = OutlookOutbox(self.broker(), self.policy)
            sender_id = approval.assert_sender()["id"]
            snapshot = self.store.read()
            failures = []
            for draft in self.flow(snapshot).list_drafts():
                try:
                    self._process_draft(draft, snapshot, approval, outbox, sender_id)
                except (WorkflowError, GraphRequestError) as error:
                    def block(state):
                        current = self._draft(state, draft["id"])
                        if current["status"] not in LOCKED and draft["id"] in state["remote"]:
                            state["remote"][draft["id"]].update(state="approval_blocked", error=str(error))
                    self.store.mutate(block)
                    self._error(error)
                    if raise_on_error:
                        raise
                    failures.append({"draftId": draft["id"], "error": str(error)})
        if not failures:
            self.store.mutate(lambda state: state.update(workerError=None))
        return {"status": "review_blocked" if failures else "reviewed", "failures": failures}

    def worker(self):
        while not self.stop.wait(45):
            if self.policy["liveEnabled"]:
                try:
                    self.tick(raise_on_error=False)
                except (WorkflowError, GraphRequestError, StoreError, OSError) as error:
                    self._error(error)

    def _seed_demo(self):
        now = datetime.now(UTC)
        proof = {"source": "Fictional verified directory", "verifiedAt": stamp(now - timedelta(minutes=1)),
                 "expiresAt": stamp(now + timedelta(days=1))}
        route = {
            "type": "subscription", "id": "44444444-4444-4444-8444-444444444444",
            "customerId": "aster-demo", "customerName": "Aster Demo", "teamId": "azure-ocr",
            "services": ["Azure Document Intelligence"], "allowedDomains": ["example.com"],
            "to": ["azure-ocr@example.com"], "cc": [],
            "verification": proof, "contactVerification": dict(proof),
        }

        def message(identifier, event, scope=True, unsafe=False):
            text = (
                "Event ID: " + event + "\nService: Azure Document Intelligence\n"
                "Classification: Action Required\n"
                + ("Subscription ID: " + route["id"] + "\n" if scope else "Subscription Name: SUB_TEST_DWH\n")
                + "Internal-only operational context: do not forward the source thread.\n"
                + "Current Message for Customers [Updated at " + stamp(now - timedelta(seconds=30)) + "]:\n"
                + ("Microsoft internal-only operational details." if unsafe else
                   "Review the sample API migration for this fictional OCR environment before "
                   "December 31, 2030.\n"
                   "Update the sample application, retrain the models, and test before production.\n"
                   "Public product documentation: https://learn.microsoft.com/azure/ai-services/document-intelligence/")
                + "\nYou received this email based on your alert preferences.\n"
                "Advisory internal footer: https://private.sharepoint.com/synthetic"
            )
            return {
                "id": identifier, "subject": "Action Required " + event,
                "from": {"emailAddress": {"address": "advisoryalerts@example.com"}},
                "receivedDateTime": stamp(now - timedelta(seconds=10)),
                "body": {"contentType": "text", "content": text},
            }

        def seed(state):
            flow = self.flow(state)
            flow.set_mapping({"environments": [route]})
            ready = flow.ingest(message("fictional-ready", "DEMO-001"))
            draft_id = ready["draftIds"][0]
            draft = state["workflow"]["drafts"][draft_id]
            flow.edit_draft(draft_id, draft["revision"], {"contentVerified": True})
            flow.ingest(message("fictional-unknown", "DEMO-002", scope=False))
            flow.ingest(message("fictional-internal", "DEMO-003", unsafe=True))
        self.store.mutate(seed)


class ReviewHandler(BaseHTTPRequestHandler):
    server_version = "CSCTAdvisory/1.0"

    def log_message(self, *_):
        return

    @property
    def app(self):
        return self.server.app

    def _host(self):
        port = self.server.server_port
        return self.headers.get("Host", "").lower() in ("127.0.0.1:%d" % port, "localhost:%d" % port)

    def _send(self, status, value, content_type="application/json; charset=utf-8"):
        data = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if not self._host():
            return self._send(403, {"error": "Forbidden host."})
        path = urllib.parse.urlsplit(self.path).path
        try:
            if path in ("/", "/index.html"):
                markup = (HERE / "advisory-review.html").read_text(encoding="utf-8").replace("@@ADVISORY_CSRF@@", self.app.csrf)
                return self._send(200, markup.encode("utf-8"), "text/html; charset=utf-8")
            if path == "/api/state":
                return self._send(200, self.app.model())
            if path == "/api/health":
                return self._send(200, {"app": "csct-advisory-review", "demo": self.app.policy["demo"],
                                       "liveEnabled": self.app.policy["liveEnabled"]})
        except (WorkflowError, StoreError, OSError) as error:
            return self._send(500, {"error": str(error)})
        return self._send(404, {"error": "Not found."})

    def do_POST(self):
        origins = {"http://127.0.0.1:%d" % self.server.server_port, "http://localhost:%d" % self.server.server_port}
        if (not self._host() or self.headers.get("Origin") not in origins
                or self.headers.get("X-CSCT-Advisory") != self.app.csrf):
            return self._send(403, {"error": "Authenticated local request required."})
        path = urllib.parse.urlsplit(self.path).path
        operations = {
            "/api/mailbox/import": self.app.import_mailbox,
            "/api/mapping": self.app.mapping, "/api/notice/resolve": self.app.resolve,
            "/api/draft/edit": self.app.edit, "/api/draft/publish": self.app.publish,
        }
        if self.app.policy["demo"]:
            operations["/api/demo/approve"] = self.app.demo_approve
        if path not in operations:
            return self._send(403, {"error": "Browser-supplied production approval or delivery receipts are forbidden."})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 100000:
                raise WorkflowError("Request size is invalid.")
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(body, dict):
                raise WorkflowError("Request must be an object.")
            result = operations[path]() if path == "/api/mailbox/import" else operations[path](body)
        except ConflictError as error:
            return self._send(409, {"error": str(error)})
        except (WorkflowError, PolicyError, GraphRequestError, ValueError, KeyError, TypeError, UnicodeError) as error:
            return self._send(400, {"error": str(error)})
        except (StoreError, OSError) as error:
            return self._send(500, {"error": str(error)})
        return self._send(200, result)


def make_server(app, port):
    server = ThreadingHTTPServer(("127.0.0.1", port), ReviewHandler, bind_and_activate=False)
    server.allow_reuse_address = False
    if os.name == "nt":
        server.socket.setsockopt(__import__("socket").SOL_SOCKET, __import__("socket").SO_EXCLUSIVEADDRUSE, 1)
    server.app = app
    try:
        server.server_bind()
        server.server_activate()
    except OSError:
        server.server_close()
        raise
    return server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default=str(HERE / "advisory-settings.json"))
    parser.add_argument("--demo", action="store_true")
    parser.add_argument("--open", action="store_true")
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    policy = load_policy(args.config, args.demo)
    app = ReviewApp(policy)
    if args.once:
        print(json.dumps(app.tick()))
        return
    server = make_server(app, policy["port"])
    threading.Thread(target=app.worker, daemon=True).start()
    if args.open:
        webbrowser.open("http://127.0.0.1:%d/" % policy["port"])
    print(json.dumps({"url": "http://127.0.0.1:%d/" % policy["port"], "demo": policy["demo"],
                      "liveSending": policy["liveEnabled"]}), flush=True)
    try:
        server.serve_forever()
    finally:
        app.stop.set()
        server.server_close()
        if app.graph:
            app.graph.close()


if __name__ == "__main__":
    main()
