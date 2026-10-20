"""Native Microsoft Lists approvals and guarded Outlook delivery.

An editable 'approver' field is never identity evidence. Approval identity comes
only from Microsoft Graph's server-generated lastModifiedBy.user.id.
"""

import json
import re
import urllib.parse
from datetime import datetime, timezone

from advisory_graph import GraphRequestError


GUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
DISPATCH_PROPERTY = "String {fb186bf9-5b9a-4b9b-bf3a-b5eef9ba9ef5} Name CSCTAdvisoryDispatch"
EMAIL = re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$")
REVIEW_FIELDS = (
    "DraftId", "Revision", "PayloadDigest", "RecipientsJson", "MessageSubject",
    "MessageBody", "ApprovalStatus", "ExpiresAt", "CustomerName", "SourceCustomerText", "ScopeJson",
)


def item_id(value):
    value = str(value)
    if not re.fullmatch(r"[1-9]\d{0,15}", value):
        raise GraphRequestError("Invalid Microsoft Lists item ID.")
    return value


def encoded(value):
    return urllib.parse.quote(str(value), safe="")


def review_fields(envelope):
    """Only the exact customer-send payload; never original mail or inner notes."""
    required = {"id", "revision", "digest", "to", "cc", "subject", "body", "customerName",
                "expiresAt", "sourceCustomerText", "scope"}
    if not isinstance(envelope, dict) or not required <= set(envelope):
        raise GraphRequestError("A complete review envelope is required.")
    if envelope.get("contentVerified") is not True:
        raise GraphRequestError("Customer-safe content must be explicitly reviewed before sharing.")
    if not re.fullmatch(r"[a-zA-Z0-9_-]{8,128}", envelope["id"]):
        raise GraphRequestError("Invalid draft identity.")
    if type(envelope["revision"]) is not int or envelope["revision"] < 1:
        raise GraphRequestError("Invalid draft revision.")
    if not re.fullmatch(r"[0-9a-f]{64}", envelope["digest"]):
        raise GraphRequestError("Invalid approval digest.")
    if not isinstance(envelope["to"], list) or not envelope["to"] or not isinstance(envelope["cc"], list):
        raise GraphRequestError("Verified recipient lists are required.")
    if len(envelope["to"]) + len(envelope["cc"]) > 20:
        raise GraphRequestError("Review batches are limited to twenty recipients.")
    addresses = envelope["to"] + envelope["cc"]
    if (any(not isinstance(address, str) or not EMAIL.fullmatch(address) for address in addresses)
            or len({address.lower() for address in addresses}) != len(addresses)):
        raise GraphRequestError("Invalid or duplicate exact recipients.")
    for field, maximum in (("subject", 240), ("body", 18000), ("customerName", 200)):
        if not isinstance(envelope[field], str) or not envelope[field].strip() or len(envelope[field]) > maximum:
            raise GraphRequestError("Invalid review field: " + field)
    if "\r" in envelope["subject"] or "\n" in envelope["subject"]:
        raise GraphRequestError("Subject must not contain mail headers.")
    if not isinstance(envelope["scope"], dict) or not envelope["scope"].get("environmentIds"):
        raise GraphRequestError("A verified exact scope must be visible to the approver.")
    if not isinstance(envelope["sourceCustomerText"], str) or not envelope["sourceCustomerText"].strip():
        raise GraphRequestError("The original customer-safe source must be visible to the approver.")
    from advisory_workflow import safe_content
    if safe_content(envelope["sourceCustomerText"]) != envelope["sourceCustomerText"]:
        raise GraphRequestError("Source customer text is not canonical customer-safe content.")
    if safe_content(envelope["body"]) != envelope["body"]:
        raise GraphRequestError("The outgoing customer message is not canonical safe content.")
    try:
        expires = datetime.fromisoformat(envelope["expiresAt"].replace("Z", "+00:00"))
    except (AttributeError, ValueError) as error:
        raise GraphRequestError("A valid approval expiry is required.") from error
    if expires.tzinfo is None:
        raise GraphRequestError("Approval expiry requires a time zone.")
    return {
        "Title": envelope["subject"], "DraftId": envelope["id"],
        "Revision": envelope["revision"], "PayloadDigest": envelope["digest"],
        "RecipientsJson": json.dumps({"to": envelope["to"], "cc": envelope["cc"]}, separators=(",", ":")),
        "MessageSubject": envelope["subject"], "MessageBody": envelope["body"],
        "ApprovalStatus": "Awaiting review", "ExpiresAt": envelope["expiresAt"],
        "CustomerName": envelope["customerName"],
        "SourceCustomerText": envelope["sourceCustomerText"],
        "ScopeJson": json.dumps(envelope["scope"], sort_keys=True, separators=(",", ":")),
    }


class SharePointApprovals:
    def __init__(self, graph, policy):
        self.graph = graph
        self.policy = policy
        self.provider = policy.get("approvalProvider") or {}

    def _base(self):
        site = self.provider.get("siteId", "")
        parts = site.split(",")
        if len(parts) != 3 or parts[0] != "microsoft.sharepoint.com" or not all(GUID.fullmatch(p) for p in parts[1:]):
            raise GraphRequestError("A verified Microsoft internal SharePoint site ID is required.")
        list_id = self.provider.get("listId", "")
        if not GUID.fullmatch(list_id):
            raise GraphRequestError("A verified Microsoft Lists approval list ID is required.")
        return "/sites/%s/lists/%s" % (encoded(site), encoded(list_id))

    def assert_sender(self):
        me = self.graph.get("/me?$select=id,mail,userPrincipalName")
        if (not isinstance(me, dict) or me.get("id") != self.policy["senderId"]
                or self.policy["senderEmail"].lower() not in
                {str(me.get("mail", "")).lower(), str(me.get("userPrincipalName", "")).lower()}):
            raise GraphRequestError("Signed-in mailbox does not match the configured sender.")
        return me

    def assert_publish_ready(self):
        self._base()
        if self.policy.get("publishEnabled") is not True:
            raise GraphRequestError("Sharing approval drafts has not been enabled.")
        if self.provider.get("restrictedAccessConfirmed") is not True:
            raise GraphRequestError("Confirm restricted list access and corporate classification before publishing.")
        if self.provider.get("privacyReviewConfirmed") is not True:
            raise GraphRequestError("Customer-safe publication and confidentiality review is required.")
        self.assert_sender()
        schema = self.graph.all(self._base() + "/columns?$select=name")
        names = {column.get("name") for column in schema}
        if not set(REVIEW_FIELDS) <= names:
            raise GraphRequestError("Approval list schema is incomplete.")

    def publish(self, envelope):
        self.assert_publish_ready()
        fields = review_fields(envelope)
        query = urllib.parse.urlencode({
            "$filter": "fields/DraftId eq '%s'" % envelope["id"], "$expand": "fields", "$top": 2,
        })
        existing = self.graph.all(self._base() + "/items?" + query, max_pages=2)
        if len(existing) > 1:
            raise GraphRequestError("Duplicate approval items exist; repair the list before sending.")
        if existing:
            item = existing[0]
            old = item.get("fields") or {}
            same = all(old.get(key) == value for key, value in fields.items() if key != "ApprovalStatus")
            if same:
                return {"itemId": item_id(item["id"]), "webUrl": item.get("webUrl"), "reused": True}
            etag = item.get("eTag") or item.get("@odata.etag")
            self.graph.update(self._base() + "/items/" + item_id(item["id"]) + "/fields", fields, etag)
            return {"itemId": item_id(item["id"]), "webUrl": item.get("webUrl"), "reused": False}
        created = self.graph.create(self._base() + "/items", {"fields": fields})
        if not isinstance(created, dict) or "id" not in created:
            raise GraphRequestError("Microsoft Lists did not return an approval item ID.")
        return {"itemId": item_id(created["id"]), "webUrl": created.get("webUrl"), "reused": False}

    def receipt(self, envelope, remote_id):
        item = self.graph.get(self._base() + "/items/" + item_id(remote_id) + "?$expand=fields")
        fields = item.get("fields") if isinstance(item, dict) else None
        if not isinstance(fields, dict):
            raise GraphRequestError("Missing authenticated approval item.")
        expected = review_fields(envelope)
        if any(fields.get(key) != value for key, value in expected.items()
               if key not in ("ApprovalStatus", "ExpiresAt")):
            raise GraphRequestError("Recipients, text, scope or revision changed after publication; approval is invalid.")
        try:
            actual_expiry = datetime.fromisoformat(fields["ExpiresAt"].replace("Z", "+00:00"))
            expected_expiry = datetime.fromisoformat(expected["ExpiresAt"].replace("Z", "+00:00"))
        except (KeyError, AttributeError, ValueError) as error:
            raise GraphRequestError("Approval expiry has changed or is missing.") from error
        if actual_expiry != expected_expiry:
            raise GraphRequestError("Approval expiry changed after publication.")
        if expected_expiry <= datetime.now(timezone.utc):
            raise GraphRequestError("The published review snapshot has expired; publish a fresh version.")
        status = fields.get("ApprovalStatus")
        if status not in ("Approved", "Rejected"):
            return {"status": status or "Awaiting review", "receipt": None}
        actor = ((item.get("lastModifiedBy") or {}).get("user") or {}).get("id")
        if actor not in self.policy["approverIds"]:
            raise GraphRequestError("Approval was not made by an authorized Microsoft 365 identity.")
        stamp = item.get("lastModifiedDateTime")
        try:
            changed = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        except (AttributeError, ValueError) as error:
            raise GraphRequestError("Missing server-generated approval time.") from error
        if changed.tzinfo is None:
            raise GraphRequestError("Approval time has no time zone.")
        etag = item.get("eTag") or item.get("@odata.etag")
        if not isinstance(etag, str) or not etag:
            raise GraphRequestError("Missing server ETag; the approved version cannot be claimed safely.")
        return {
            "status": status,
            "receipt": {
                "provider": "graph-sharepoint", "siteId": self.provider["siteId"],
                "listId": self.provider["listId"], "draftId": envelope["id"],
                "revision": envelope["revision"], "digest": envelope["digest"],
                "actorId": actor, "approvedAt": changed.astimezone(timezone.utc).isoformat(),
                "eTag": etag,
            },
        }

    def claim_approved_item(self, remote_id, receipt):
        if self.policy.get("liveEnabled") is not True:
            raise GraphRequestError("Live approval claiming is disabled.")
        etag = receipt.get("eTag")
        if not isinstance(etag, str) or not etag:
            raise GraphRequestError("A current server ETag is required to claim the approved version.")
        self.graph.update(
            self._base() + "/items/" + item_id(remote_id) + "/fields",
            {"ApprovalStatus": "Dispatching"}, etag,
        )


class OutlookOutbox:
    def __init__(self, graph, policy):
        self.graph = graph
        self.policy = policy

    def _enabled(self):
        if self.policy.get("liveEnabled") is not True or self.policy.get("outboundConsentRecorded") is not True:
            raise GraphRequestError("Live customer sending is disabled.")
        SharePointApprovals(self.graph, self.policy).assert_sender()

    def create_draft(self, envelope, attempt_id):
        self._enabled()
        review_fields(envelope)
        if not GUID.fullmatch(attempt_id):
            raise GraphRequestError("A unique dispatch attempt ID is required.")
        message = {
            "subject": envelope["subject"],
            "body": {"contentType": "text", "content": envelope["body"]},
            "toRecipients": [{"emailAddress": {"address": address}} for address in envelope["to"]],
            "ccRecipients": [{"emailAddress": {"address": address}} for address in envelope["cc"]],
            "singleValueExtendedProperties": [{"id": DISPATCH_PROPERTY, "value": attempt_id}],
        }
        created = self.graph.create("/me/messages", message)
        if not isinstance(created, dict) or not isinstance(created.get("id"), str):
            raise GraphRequestError("Outlook did not return a draft ID.")
        return created["id"]

    def send_draft(self, draft_id, envelope):
        self._enabled()
        actual = self.graph.get("/me/messages/" + encoded(draft_id) +
                                "?$select=id,isDraft,subject,body,toRecipients,ccRecipients,bccRecipients")
        recipients = lambda key: [row["emailAddress"]["address"].lower() for row in actual.get(key, [])]
        body = (actual.get("body") or {}).get("content", "")
        if (actual.get("isDraft") is not True or actual.get("subject") != envelope["subject"]
                or body.replace("\r\n", "\n") != envelope["body"].replace("\r\n", "\n")
                or recipients("toRecipients") != [address.lower() for address in envelope["to"]]
                or recipients("ccRecipients") != [address.lower() for address in envelope["cc"]]
                or actual.get("bccRecipients")):
            raise GraphRequestError("Outlook draft differs from the approved exact message.")
        self.graph.action("/me/messages/" + encoded(draft_id) + "/send")

    def sent_receipt(self, attempt_id):
        self._enabled()
        if not GUID.fullmatch(attempt_id):
            raise GraphRequestError("Invalid dispatch identifier.")
        query = urllib.parse.urlencode({
            "$filter": "singleValueExtendedProperties/any(ep: ep/id eq '%s' and ep/value eq '%s')" %
                       (DISPATCH_PROPERTY, attempt_id),
            "$select": "id,sentDateTime,isDraft", "$top": 2,
        })
        messages = self.graph.all("/me/mailFolders/sentitems/messages?" + query, max_pages=2)
        if len(messages) > 1:
            raise GraphRequestError("Multiple sent receipts exist; reconciliation is required.")
        if not messages:
            return None
        message = messages[0]
        if message.get("isDraft") is not False or not message.get("sentDateTime"):
            raise GraphRequestError("Outlook receipt does not confirm a sent message.")
        return message["id"]
