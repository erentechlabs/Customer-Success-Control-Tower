"""Customer-safe advisory preparation; no network, authentication, storage, or sending.

All inputs, state, and results are JSON-serializable dictionaries (UTC ISO timestamps).
The host must authenticate Graph retrieval, seal/persist transactions atomically, and
never accept approval receipts from a browser. This module validates evidence, not
the provenance of a Python dictionary. A receipt is trusted ONLY when fetched by
the host's configured SharePoint provider.

Policy shape::

    {
      "senderEmail": "sender@example.com", "senderId": "<AAD GUID>",
      "tenantId": "<AAD GUID>", "approverIds": ["<AAD GUID>", ...],
      "trustedAlertSenders": ["alerts@example.com"],
      "trustedInternalForwarders": ["forwarder@example.com"],  # optional
      "approvalProvider": {"siteId": "...", "listId": "..."},
      "maxEvidenceAgeHours": {"mapping": 24, "contact": 24},
      "maxSourceAgeMinutes": 15, "approvalLifetimeHours": 24,
      "demo": False
    }

Mapping shape (disjoint service routes may share an environment)::

    {"environments": [{
      "type": "tenant" or "subscription", "id": "<GUID>",
      "customerId": "...", "customerName": "...", "teamId": "...",
      "services": ["<exact service name>", ...],
      "allowedDomains": ["customer.example"], "to": ["a@customer.example"],
      "cc": [],
      "verification": {"source": "...", "verifiedAt": "...", "expiresAt": "..."},
      "contactVerification": {
          "source": "...", "verifiedAt": "...", "expiresAt": "..."
      }
    }]}

Graph message shape: id, subject, from.emailAddress.address, receivedDateTime,
body.{contentType: "text", content}. Optional metadata.{eventId, service, eventStatus,
actionRequired, environmentIds} contains authenticated host-extracted metadata.
Environment IDs ALWAYS have shape {"type": "tenant"|"subscription", "id": "<GUID>"}.
Without metadata, Event ID / Tracking Id / Service / Service(s) Affected labels
are read inline or from the next nonblank line (at most two intervening blanks).
An optional <https://...> tracking annotation is metadata-only and never retained.
Tenant ID / Subscription ID lines provide exact scope. An explicit partial-list
warning requires set_environments with complete verified scope evidence.
displayAliases contains normalized tenantNames/subscriptionNames and bounded
affectedCustomers/affectedSubscriptions display rows. These are source-hash
evidence ONLY, never GUID/customer/workload/recipient routing authority.
Optional Status / Event Status labels bind normalized eventStatus in the hash;
None means no status was declared. Resolved/Closed/Canceled/Cancelled explicitly
block Action Required readiness, including after manual scope attestation.

Approval/rejection receipt shape::

    {
      "provider": "graph-sharepoint", "siteId": "...", "listId": "...",
      "draftId": "...", "revision": 1, "digest": "<SHA-256>",
      "actorId": "<Graph lastModifiedBy.user.id>",
      "approvedAt": "<Graph lastModifiedDateTime>"
    }

The trusted transport must fill actorId and approvedAt from Graph server metadata,
NOT editable columns, and call approve/reject only after checking ApprovalStatus.
An optional decision ("Approve"/"Reject") is checked if supplied. Optional receiptId
and eTag are retained for audit, but do not authenticate the receipt. The transport
maps DraftId/Revision/PayloadDigest to draftId/revision/digest and verifies the
published RecipientJson/MessageSubject/MessageBody were not changed.
For synthetic demonstrations only, policy.demo=True permits provider="demo".

edit_draft accepts a patch containing ONLY subject, body, and contentVerified.
An initial draft is NOT verified. Subject/body edits reset verification unless the
same patch explicitly verifies the new text. mark_ready/verify_content perform
the verification transition; approve requires contentVerified=True, which is
included in the canonical digest. No translation is invented or inferred.

State keys: schemaVersion, dataRevision, mappingRevision, mapping, notices, events,
drafts. Each draft exposes id, revision, digest, status, reviewReasons, actual
sender/to/cc/subject/body, customer/team/environment scope, source and mapping
evidence, approval, and attempt. Returned objects are copies, not state references.

reconcile(draft_id, attempt_id, message_id) is a HOST-ONLY delivery-fact operation.
The host must authenticate an Outlook Sent Items receipt and match it to the
claimed sender/recipients/content before calling; a message ID is NOT proof of
delivery by itself. Browser values must never reach this method. Reconciliation
never authorizes a send, creates an attempt, or permits replay of an old attempt.
"""

import copy
import hashlib
import html
import json
import math
import re
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import parse_qs, unquote, urlsplit, urlunsplit


class WorkflowError(ValueError):
    """Explicit failure with a stable machine-readable ``code``."""

    code = "workflow_error"


class ParseError(WorkflowError):
    code = "invalid_notice"


class ContentError(WorkflowError):
    code = "unsafe_content"


class MappingError(WorkflowError):
    code = "invalid_mapping"


class EvidenceError(WorkflowError):
    code = "invalid_evidence"


class ApprovalError(WorkflowError):
    code = "invalid_approval"


class ConflictError(WorkflowError):
    code = "revision_conflict"


class StateError(WorkflowError):
    code = "invalid_state"


UTC = timezone.utc
PUBLIC_HOSTS = frozenset({
    "learn.microsoft.com", "docs.microsoft.com", "azure.microsoft.com",
    "status.azure.com", "azure.status.microsoft", "health.azure.com",
    "servicehealth.azure.com",
})
# Public redirect targets verified without source-mail tracking parameters.
PUBLIC_SHORT_LINKS = {
    "azureservicehealthadvisories": "https://portal.azure.com/#view/Microsoft_Azure_Health/AzureHealthBrowseBlade/~/otherAnnouncements",
    "servicesretirementworkbook": "https://portal.azure.com/#view/AppInsightsExtension/UsageNotebookBlade/ComponentId/Azure%20Advisor/ConfigurationId/community-Workbooks%2FAzure%20Advisor%2FAzureServiceRetirement/Type/workbook/WorkbookTemplateName/Service%20Retirement",
    "azureretirementimpactedresourceschannels": "https://learn.microsoft.com/en-us/azure/advisor/advisor-how-to-use-service-upgrade-retirement-recommendations?tabs=portal%2Cservice-retire-2024#access-recommendations-through-multiple-channels",
    "azureqa": "https://learn.microsoft.com/answers/products/133/azure/",
}
PUBLIC_PORTAL_LINKS = frozenset(url for url in PUBLIC_SHORT_LINKS.values() if url.startswith("https://portal.azure.com/"))
GUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
    r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
URL_RE = re.compile(r"https?://[^\s<>\"']+", re.I)
# The mailbox normaliser renders a preserved link as "label <https://...>" (see parse_notice's
# docstring), and flattened forwarded headers render recipients as "Name <addr@domain>"; these
# are the two bracketed forms safe_content must tolerate before its generic HTML-tag rejection.
# Neither is executable HTML (an HTML tag name cannot contain "://" or "@"), and the matching
# URL_RE.sub() below still fully validates/unwraps any URL that was bracketed this way.
BRACKETED_URL_RE = re.compile(r"<https?://[^\s<>\"']+>", re.I)
BRACKETED_EMAIL_RE = re.compile(r"<[^\s<>@]+@[^\s<>]+>")
INTERNAL_RE = re.compile(
    r"\badvisory\b|\bicm\b|\beng\.ms\b|"
    r"\binternal[\s-]+only\b|\bmicrosoft[\s-]+internal\b|"
    r"\bconfidential\b|\bservice incident playbook\b|"
    r"\bdo not (?:forward|share)\b", re.I
)
HEADER_RE = re.compile(
    r"^[ \t]*Current Message for Customers[ \t]*"
    r"\[Updated at[ \t]+([^\]\r\n]+)\][ \t]*:[ \t]*$", re.I | re.M
)
FOOTER_RE = re.compile(
    r"^[ \t]*(?:You received this email based on your alert preferences|"
    r"Service Incident Playbook|Current Message for Microsoft|"
    r"Message for Internal Use)(?:[ \t:.\r\n]|$)", re.I | re.M
)
EVENT_LABEL_RE = re.compile(
    r"^[ \t]*(?:Event|Tracking|Incident)[ \t]*Id[ \t]*:[ \t]*(.*?)[ \t]*$", re.I
)
SERVICE_LABEL_RE = re.compile(
    r"^[ \t]*Service(?:s|\(s\))?(?:[ \t]+Affected)?[ \t]*:[ \t]*(.*?)[ \t]*$", re.I
)
STATUS_LABEL_RE = re.compile(
    r"^[ \t]*(?:Event[ \t]+)?Status[ \t]*:[ \t]*(.*?)[ \t]*$", re.I
)
METADATA_BOUNDARY_RE = re.compile(
    r"^[ \t]*(?:(?:Event|Tracking|Incident)[ \t]*Id|"
    r"Service(?:s|\(s\))?(?:[ \t]+Affected)?|"
    r"(?:Tenant|Subscription)(?:s|[ \t]+(?:Ids?|Guids?|Name))?|"
    r"Classification|Event[ \t]+Type|(?:Event[ \t]+)?Status)[ \t]*:", re.I
)
PARTIAL_SCOPE_RE = re.compile(
    r"\bthis\s+is\s+a\s+partial\s+list\s+of\s+impacted\s+customers\b", re.I
)
AFFECTED_LIST_RE = re.compile(
    r"^[ \t]*(?:Your[ \t]+)?(Customers?|Subscriptions?)[ \t]+Affected"
    r"[ \t]*:[ \t]*(.*?)[ \t]*$", re.I
)
NAME_LABELS = {
    kind: re.compile(rf"^[ \t]*{kind}[ \t]+Name[ \t]*:[ \t]*(.*?)[ \t]*$", re.I)
    for kind in ("tenant", "subscription")
}
LOCKED = frozenset({"dispatching", "submitted", "sent", "delivery_unknown", "delivery_rejected"})
DIGEST_FIELDS = (
    "id", "eventId", "customerId", "customerName", "teamId", "service",
    "environmentIds", "senderEmail", "senderId", "tenantId", "to", "cc",
    "subject", "body", "revision", "sourceMessageId", "sourceHash",
    "sourceUpdatedAt", "sourceEvidence", "scopeEvidence", "mappingRevision",
    "mappingEvidence", "contentVerified",
)
PAYLOAD_FIELDS = ("senderEmail", "senderId", "tenantId", "to", "cc", "subject", "body")


def empty_state():
    """Return a new JSON state. Persist ``dataRevision`` with compare-and-swap."""
    return {
        "schemaVersion": 1, "dataRevision": 0, "mappingRevision": 0,
        "mapping": {"environments": []}, "notices": {}, "events": {}, "drafts": {},
    }


def _canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _hash(value):
    return hashlib.sha256(_canonical(value).encode("utf-8")).hexdigest()


def _date(value):
    result = None
    if isinstance(value, datetime):
        result = value
    elif isinstance(value, str):
        try:
            result = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except (ValueError, OverflowError):
            try:
                result = parsedate_to_datetime(value)
            except (TypeError, ValueError, OverflowError):
                result = None
            if result is None:
                for fmt in (
                    "%m/%d/%Y %I:%M:%S %p UTC", "%m/%d/%Y %I:%M %p UTC",
                    "%Y-%m-%d %H:%M:%S UTC",
                ):
                    try:
                        result = datetime.strptime(value, fmt).replace(tzinfo=UTC)
                        break
                    except ValueError:
                        pass
    else:
        result = None
    if result is None or result.tzinfo is None:
        raise EvidenceError("A timezone-qualified timestamp is required.")
    return result.astimezone(UTC)


def _iso(value):
    return _date(value).isoformat().replace("+00:00", "Z")


def _label(value, name, limit=512):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise WorkflowError(f"{name} must be a nonempty string.")
    if any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise WorkflowError(f"{name} contains control characters.")
    return value.strip()


def _bounded_metadata_values(text, label_pattern):
    """Read one value line per exact label without searching into later sections."""
    lines = text.splitlines()
    values = []
    for index, line in enumerate(lines):
        match = label_pattern.fullmatch(line)
        if not match:
            continue
        value = match.group(1).strip()
        if not value:
            for next_index in range(index + 1, min(len(lines), index + 4)):
                value = lines[next_index].strip()
                if not value:
                    continue
                if (
                    METADATA_BOUNDARY_RE.match(value) or HEADER_RE.fullmatch(value)
                    or FOOTER_RE.match(value) or re.fullmatch(r"[^:]{1,80}:[ \t]*", value)
                ):
                    raise ParseError("A metadata label is missing its adjacent value.")
                break
            else:
                raise ParseError("A metadata value must occur within three following lines.")
        values.append(value)
    return values


def _tracking_id(value):
    value = _label(value, "eventId", 4096)
    match = re.fullmatch(
        r"([a-zA-Z0-9][a-zA-Z0-9._:/-]{0,255})"
        r"(?:[ \t]*<https://[^\s<>]+>)?", value, re.I,
    )
    if not match:
        raise ParseError("Event ID must be an exact identifier with at most one tracking annotation.")
    return match.group(1)


def _event_status(value):
    value = _label(value, "Event status", 64)
    return " ".join(unicodedata.normalize("NFKC", value).split()).casefold()


def _terminal_status(value):
    return isinstance(value, str) and bool(re.match(r"^(?:resolved|closed|cancell?ed)\b", value))


def _display_alias(value):
    if not isinstance(value, str) or len(value) > 8192:
        raise ParseError("A bounded display alias is required.")
    # Anchor annotations in metadata are not public links and are never outbound.
    value = re.sub(r"[ \t]*<https?://[^\s<>]+>", "", value, flags=re.I)
    value = re.sub(r"^[ \t]*(?:[-*•]|\d+[.)])[ \t]+", "", value)
    value = " ".join(unicodedata.normalize("NFC", value).split())
    return _label(value, "Display alias", 1024)


def _affected_display_lists(text):
    """Bounded metadata rows; no interpretation as identities or environment IDs."""
    lines = text.splitlines()
    result = {"affectedCustomers": [], "affectedSubscriptions": []}
    sections = set()
    for index, line in enumerate(lines):
        heading = AFFECTED_LIST_RE.fullmatch(line)
        if not heading:
            continue
        kind = "affectedCustomers" if heading.group(1).lower().startswith("customer") else "affectedSubscriptions"
        if kind in sections:
            raise ParseError("Repeated affected-name sections are ambiguous.")
        sections.add(kind)
        values = [heading.group(2)] if heading.group(2).strip() else []
        characters = len(line)
        for offset, following in enumerate(lines[index + 1:], 1):
            value = following.strip()
            name_row = re.match(r"^(?:Customer|Tenant|Subscription)[ \t]+Name[ \t]*:", value, re.I)
            if (
                HEADER_RE.fullmatch(value) or FOOTER_RE.match(value)
                or AFFECTED_LIST_RE.fullmatch(value)
                or (
                    METADATA_BOUNDARY_RE.match(value)
                    and not name_row
                )
                or (
                    re.match(r"^[A-Za-z][A-Za-z0-9 ()/_.-]{0,79}:[ \t]*", value)
                    and not name_row
                )
            ):
                break
            characters += len(following)
            if offset > 64 or characters > 8192:
                raise ParseError("Affected-name metadata exceeds the bounded section limit.")
            if not value or PARTIAL_SCOPE_RE.search(value):
                continue
            values.append(value)
        result[kind] = sorted({_display_alias(v) for v in values})
    return result


def _guid(value):
    if not isinstance(value, str) or not GUID_RE.fullmatch(value):
        raise MappingError("Environment and authenticated identity IDs must be GUIDs.")
    return str(uuid.UUID(value))


def _email(value):
    try:
        value = _label(value, "Email", 254).lower()
    except WorkflowError as exc:
        raise MappingError("Email header injection or a missing exact address.") from exc
    if not re.fullmatch(r"[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}", value):
        raise MappingError("An exact email address, not a display name, is required.")
    domain = value.rsplit("@", 1)[1]
    if ".." in value or domain.startswith((".", "-")) or domain.endswith((".", "-")):
        raise MappingError("Invalid email address.")
    return value


def _domain(value):
    value = _label(value, "Customer domain", 253).lower()
    if not re.fullmatch(r"(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}", value):
        raise MappingError("An exact customer domain without wildcards is required.")
    return value


def _environments(values):
    if not isinstance(values, list):
        raise MappingError("Environment IDs must be a list of typed GUID objects.")
    result = {}
    for value in values:
        if not isinstance(value, dict) or value.get("type") not in ("tenant", "subscription"):
            raise MappingError("Every GUID requires tenant or subscription type.")
        item = {"type": value["type"], "id": _guid(value.get("id"))}
        result[(item["type"], item["id"])] = item
    return [result[key] for key in sorted(result)]


def _unwrap_url(raw):
    url = html.unescape(raw)
    for depth in range(4):
        try:
            parts = urlsplit(url)
            host = (parts.hostname or "").lower()
            port = parts.port
        except ValueError as exc:
            raise ContentError("Malformed URL requires review.") from exc
        if parts.scheme.lower() != "https" or parts.username or parts.password:
            raise ContentError("Only public HTTPS URLs without credentials are allowed.")
        if port not in (None, 443) or not host or not host.isascii() or "\\" in url:
            raise ContentError("Noncanonical URL requires review.")
        wrapper = (
            host == "safelinks.protection.outlook.com"
            or host.endswith(".safelinks.protection.outlook.com")
            or host == "nam.safelink.emails.azure.net"
        )
        if wrapper:
            query = parse_qs(parts.query, keep_blank_values=True)
            targets = query.get("url", [])
            destination = query.get("destination", []) if host == "nam.safelink.emails.azure.net" else []
            if targets and destination:
                raise ContentError("A tracking wrapper contains conflicting destinations.")
            if destination:
                targets = destination
            if depth == 3 or len(targets) != 1 or not targets[0]:
                raise ContentError("Safe Links target is absent, ambiguous, or too deeply nested.")
            url = targets[0]
            for _ in range(2):
                if url.startswith("https://"):
                    break
                decoded = unquote(url)
                if decoded == url:
                    break
                url = decoded
            continue
        if host == "aka.ms":
            target = PUBLIC_SHORT_LINKS.get(parts.path.strip("/").casefold())
            if target is None or parts.query or parts.fragment:
                raise ContentError("An unverified short link requires explicit review.")
            url = target
            continue
        if host == "portal.azure.com":
            canonical = urlunsplit(("https", host, parts.path or "/", parts.query, parts.fragment))
            if canonical not in PUBLIC_PORTAL_LINKS:
                raise ContentError("Only verified generic customer Service Health portal links are allowed.")
            return canonical
        if host not in PUBLIC_HOSTS:
            raise ContentError("A non-public or unapproved link requires explicit review.")
        query = parse_qs(parts.query, keep_blank_values=True)
        private = {
            "token", "access_token", "auth", "authorization", "sig", "signature",
            "sdata", "data", "tenant", "tenantid", "subscriptionid", "code",
            "url", "redirect", "redirect_uri", "redirecturl", "returnurl", "target",
        }
        if any(key.lower() in private for key in query):
            raise ContentError("A public URL contains private authentication or wrapper parameters.")
        if INTERNAL_RE.search(unquote(parts.path + "?" + parts.query + "#" + parts.fragment)):
            raise ContentError("A URL references internal-only material.")
        if any(ord(c) < 32 or ord(c) == 127 for c in unquote(url)):
            raise ContentError("URL control characters are prohibited.")
        return urlunsplit(("https", host, parts.path or "/", parts.query, parts.fragment))
    raise ContentError("Safe Links nesting limit exceeded.")


def safe_content(text, *, subject=False):
    """Validate outbound text and replace ONLY approved wrappers with public URLs.

    Prohibited content raises ContentError; it is never silently removed.
    """
    if not isinstance(text, str) or not text.strip():
        raise ContentError("Customer-facing content cannot be empty.")
    if len(text) > (998 if subject else 100000):
        raise ContentError("Customer-facing content exceeds the allowed size.")
    if any((ord(c) < 32 and c not in "\n\r\t") or ord(c) == 127 for c in text):
        raise ContentError("Customer-facing content contains control characters.")
    if subject and any(c in text for c in "\r\n\u2028\u2029"):
        raise ContentError("Subject header injection is prohibited.")
    residual = BRACKETED_EMAIL_RE.sub("", BRACKETED_URL_RE.sub("", text))
    if re.search(r"<\s*/?\s*[a-z][^>]*>", residual, re.I):
        raise ContentError("HTML must be normalized to plain text by the host.")
    if re.search(r"(?:javascript|file|ftp|data):", text, re.I):
        raise ContentError("An unsupported link scheme requires review.")
    # Check non-URL prose separately: a Safe Links wrapper may contain internal
    # tracking words, but they must disappear with the wrapper, never with prose.
    prose = URL_RE.sub("", text)
    if INTERNAL_RE.search(prose):
        raise ContentError("Internal-only material is present in customer-facing text.")

    def replace(match):
        raw = match.group(0)
        suffix = ""
        while raw and raw[-1] in ".,;!":
            suffix = raw[-1] + suffix
            raw = raw[:-1]
        while raw.endswith(")") and raw.count(")") > raw.count("("):
            suffix = ")" + suffix
            raw = raw[:-1]
        return _unwrap_url(raw) + suffix

    return URL_RE.sub(replace, text.strip()).replace("\r\n", "\n")


class Workflow:
    """Mutate supplied JSON state; the host owns atomic persistence and live gates.

    ``now`` may be a timezone-aware datetime, ISO string, or zero-argument clock.
    Methods return copies. Every successful mutation increments dataRevision once.
    Exceptions never authorize sending. A dispatching state is deliberately
    non-retryable after a crash; the host must persist a claim before sending.
    """

    def __init__(self, state, policy, now=None):
        if not isinstance(state, dict) or state.get("schemaVersion") != 1:
            raise StateError("Unsupported workflow state.")
        for key in empty_state():
            if key not in state:
                raise StateError(f"Missing state key: {key}")
        self.state = state
        self.policy = copy.deepcopy(policy)
        self.clock = now if callable(now) else lambda: now or datetime.now(UTC)
        self.policy["senderEmail"] = _email(policy.get("senderEmail"))
        for key in ("senderId", "tenantId"):
            self.policy[key] = _guid(policy.get(key))
        self.policy["approverIds"] = [_guid(item) for item in policy.get("approverIds", [])]
        if not self.policy["approverIds"]:
            raise ApprovalError("At least one authenticated approver ID is required.")
        for key in ("trustedAlertSenders", "trustedInternalForwarders"):
            self.policy[key] = [_email(item) for item in policy.get(key, [])]
        if not self.policy["trustedAlertSenders"]:
            raise ParseError("Trusted alert addresses must be explicitly configured.")
        for key, default in (("maxSourceAgeMinutes", 15), ("approvalLifetimeHours", 24)):
            self.policy[key] = self._positive(policy.get(key, default), key)
        ages = policy.get("maxEvidenceAgeHours", {"mapping": 24, "contact": 24})
        if not isinstance(ages, dict):
            raise WorkflowError("Evidence age policy must be a mapping/contact dictionary.")
        self.policy["maxEvidenceAgeHours"] = {
            key: self._positive(ages.get(key, 24), key) for key in ("mapping", "contact")
        }
        provider = self.policy.get("approvalProvider")
        if not isinstance(provider, dict):
            raise ApprovalError("An explicit trusted SharePoint approval provider is required.")
        if provider.get("type", "graph-sharepoint") not in ("graph-sharepoint", "demo"):
            raise ApprovalError("Only the trusted SharePoint provider is supported.")
        if provider.get("type") == "demo" and self.policy.get("demo") is not True:
            raise ApprovalError("A demo provider cannot be used under live policy.")
        for key in ("siteId", "listId"):
            _label(provider.get(key), key)

    @staticmethod
    def _positive(value, name):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
            raise WorkflowError(f"{name} must be a positive finite number.")
        return value

    def _now(self, now=None):
        return _date(self.clock() if now is None else now)

    def _touch(self):
        self.state["dataRevision"] += 1

    def _evidence(self, value, kind, now=None):
        if not isinstance(value, dict):
            raise EvidenceError(f"Missing {kind} verification evidence.")
        try:
            source = _label(value.get("source"), "Verification source")
        except WorkflowError as exc:
            raise EvidenceError(f"Missing or invalid {kind} verification source.") from exc
        verified, expires = _date(value.get("verifiedAt")), _date(value.get("expiresAt"))
        current = self._now(now)
        max_age = timedelta(hours=self.policy["maxEvidenceAgeHours"][kind])
        if verified > current or verified + max_age <= current or expires <= current or expires <= verified:
            raise EvidenceError(f"{kind.capitalize()} evidence is stale, expired, or future-dated.")
        return {"source": source, "verifiedAt": _iso(verified), "expiresAt": _iso(expires)}

    def parse_notice(self, message):
        """Return sanitized notice; raise explicit errors on unsafe/malformed input.

        Output includes id/sourceMessageId, eventId, service, updatedAt, receivedAt,
        customerText, sourceHash, environmentIds, displayAliases, scopeIncomplete,
        sourceEvidence. The original internal message is NEVER retained.
        """
        if not isinstance(message, dict):
            raise ParseError("A Graph message dictionary is required.")
        origin = message.get("from")
        address = origin.get("emailAddress") if isinstance(origin, dict) else None
        sender = address.get("address") if isinstance(address, dict) else None
        try:
            sender = _email(sender)
        except WorkflowError as exc:
            raise ParseError("The actual Graph sender address is required.") from exc
        trusted = self.policy["trustedAlertSenders"] + self.policy["trustedInternalForwarders"]
        if sender not in trusted:
            raise ParseError("The actual sender is not a trusted alert address or forwarder.")
        message_id = _label(message.get("id"), "Source message ID")
        subject = _label(message.get("subject"), "Source subject", 2000)
        body = message.get("body", {})
        text = body.get("content") if isinstance(body, dict) else None
        if not isinstance(text, str) or str(body.get("contentType", "text")).lower() != "text":
            raise ParseError("The host must provide HTML-normalized plain body text.")
        if len(text) > 500000:
            raise ParseError("Source message exceeds the size limit.")
        metadata = message.get("metadata", {})
        if not isinstance(metadata, dict):
            raise ParseError("Invalid event metadata.")
        action_required = metadata.get("actionRequired") is True or re.search(
            r"\baction[\s-]+required\b", subject, re.I
        )
        if not action_required:
            action_required = re.search(
                r"^\s*(?:Classification|Event Type)\s*:\s*Action Required\s*$", text, re.I | re.M
            )
        if not action_required:
            raise ParseError("The event is not explicitly classified Action Required.")
        headers = list(HEADER_RE.finditer(text))
        mentions = re.findall(r"Current Message for Customers", text, re.I)
        if len(headers) != 1 or len(mentions) != 1:
            raise ParseError("Exactly one well-formed customer section is required.")
        header = headers[0]
        updated = _date(header.group(1))
        received = _date(message.get("receivedDateTime"))
        if updated > self._now() or received > self._now():
            raise EvidenceError("Source timestamps cannot be in the future.")
        block = text[header.end():]
        footer = FOOTER_RE.search(block)
        if footer:
            block = block[:footer.start()]
        customer_text = safe_content(block)

        def metadata_line(name, pattern):
            values = _bounded_metadata_values(text, pattern)
            explicit = metadata.get(name, message.get(name))
            if explicit is not None:
                values.append(explicit)
            values = {
                _tracking_id(value) if name == "eventId" else _label(value, name, 256)
                for value in values
            }
            if len(values) != 1:
                raise ParseError(f"One unambiguous {name} is required.")
            return values.pop()

        event_id = metadata_line("eventId", EVENT_LABEL_RE)
        service = metadata_line("service", SERVICE_LABEL_RE)
        statuses = _bounded_metadata_values(text, STATUS_LABEL_RE)
        explicit_status = metadata.get("eventStatus", metadata.get("status", message.get("eventStatus")))
        if explicit_status is not None:
            statuses.append(explicit_status)
        statuses = {_event_status(value) for value in statuses}
        if len(statuses) > 1:
            raise ParseError("One unambiguous event status is required when declared.")
        event_status = statuses.pop() if statuses else None
        envs = _environments(metadata.get("environmentIds", message.get("environmentIds", [])))
        incomplete = bool(PARTIAL_SCOPE_RE.search(text))
        for match in re.finditer(
            r"^\s*(?:Affected\s+)?(Tenant|Subscription)(?:s|\s*(?:IDs?|GUIDs?))?\s*:\s*([^\r\n]+)",
            text, re.I | re.M,
        ):
            tokens = [token for token in re.split(r"[,;\s]+", match.group(2).strip()) if token]
            for token in tokens:
                if GUID_RE.fullmatch(token):
                    envs.append({"type": match.group(1).lower(), "id": _guid(token)})
                else:
                    incomplete = True
        if re.search(r"^\s*(?:Affected\s+)?Environments?\s*:", text, re.I | re.M):
            incomplete = True
        envs = _environments(envs)
        aliases = {
            kind + "Names": sorted({
                _display_alias(value) for value in _bounded_metadata_values(text, pattern)
            }) for kind, pattern in NAME_LABELS.items()
        }
        aliases.update(_affected_display_lists(text))
        safe = {
            "eventId": event_id, "service": service, "updatedAt": _iso(updated),
            "customerText": customer_text, "environmentIds": envs,
            "scopeIncomplete": incomplete, "displayAliases": aliases,
            "eventStatus": event_status,
        }
        source_hash = _hash(safe)
        return {
            **safe, "id": message_id, "sourceMessageId": message_id,
            "sourceEnvironmentIds": copy.deepcopy(envs),
            "sourceScopeIncomplete": incomplete,
            "receivedAt": _iso(received), "sourceHash": source_hash,
            "displayAliases": aliases,
            "sourceEvidence": {
                "source": "graph-message", "messageId": message_id,
                "sourceHash": source_hash, "verifiedAt": _iso(self._now()),
                "receivedAt": _iso(received),
            },
        }

    def set_mapping(self, mapping, expected_revision=None):
        """Replace route mapping; expected_revision compares mappingRevision.

        Returns {mappingRevision, dataRevision}. Any change revokes existing
        approvals and rebuilds candidates. Missing contacts/evidence remain
        unusable, explicit-review routes. Supplied stale evidence is rejected.
        """
        if expected_revision is not None and (
            type(expected_revision) is not int or expected_revision != self.state["mappingRevision"]
        ):
            raise ConflictError("The mapping revision changed.")
        if not isinstance(mapping, dict) or not isinstance(mapping.get("environments"), list):
            raise MappingError("Mapping must contain an environments array.")
        routes = []
        for entry in mapping["environments"]:
            if not isinstance(entry, dict):
                raise MappingError("A route must be a dictionary.")
            scope = _environments([entry])[0]
            route = {**scope}
            for key in ("customerId", "customerName", "teamId"):
                route[key] = _label(entry.get(key), key, 256)
            safe_content(route["customerName"], subject=True)
            services = entry.get("services")
            if not isinstance(services, list) or not services:
                raise MappingError("A route needs exact supported service names.")
            route["services"] = sorted({_label(v, "Service", 256) for v in services})
            for service in route["services"]:
                safe_content(service, subject=True)
            domains = entry.get("allowedDomains")
            if not isinstance(domains, list) or not domains:
                raise MappingError("A route needs exact allowed customer domains.")
            route["allowedDomains"] = sorted({_domain(v) for v in domains})
            for key in ("to", "cc"):
                if not isinstance(entry.get(key, []), list):
                    raise MappingError("Recipients must be exact address arrays.")
                route[key] = sorted({_email(v) for v in entry.get(key, [])})
                if any(v.rsplit("@", 1)[1] not in route["allowedDomains"] for v in route[key]):
                    raise MappingError("A recipient is outside the verified customer domain route.")
            if set(route["to"]) & set(route["cc"]):
                raise MappingError("A contact cannot appear in both To and CC.")
            for key, kind in (("verification", "mapping"), ("contactVerification", "contact")):
                value = entry.get(key)
                route[key] = self._evidence(value, kind) if value is not None else None
            routes.append(route)
        routes.sort(key=_canonical)
        owners, selections, names = {}, set(), {}
        for route in routes:
            key = (route["type"], route["id"])
            owner = (route["customerId"], route["customerName"])
            if key in owners and owners[key] != owner:
                raise MappingError("The same environment maps to ambiguous customers.")
            owners[key] = owner
            if route["customerId"] in names and names[route["customerId"]] != route["customerName"]:
                raise MappingError("One customer ID has conflicting customer names.")
            names[route["customerId"]] = route["customerName"]
            for service in route["services"]:
                selection = (*key, service)
                if selection in selections:
                    raise MappingError("The same environment/service maps to ambiguous workload routes.")
                selections.add(selection)
        normalized = {"environments": routes}
        if normalized != self.state["mapping"]:
            if any(d["status"] == "dispatching" for d in self.state["drafts"].values()):
                raise StateError("Mapping cannot change while a dispatch claim is active.")
            self.state["mapping"] = normalized
            self.state["mappingRevision"] += 1
            for event in self.state["events"].values():
                self._build(self.state["notices"][event["noticeId"]], preserve_edits=True)
            self._touch()
        return {key: self.state[key] for key in ("mappingRevision", "dataRevision")}

    def _ensure_unlocked(self, event_id=None):
        if any(d["status"] in {"dispatching", "delivery_unknown"} and (event_id is None or d["eventId"] == event_id)
               for d in self.state["drafts"].values()):
            raise StateError("A dispatch claim or delivery record is immutable; automatic mutation/retry is forbidden.")

    def _event_drafts(self, event_id):
        return [d for d in self.state["drafts"].values() if d["eventId"] == event_id]

    def _invalidate(self, draft, reasons):
        draft["approval"] = None
        if draft["status"] not in LOCKED:
            draft["status"] = "needs_review"
        draft["reviewReasons"] = reasons

    def _block_failed_source(self, message, reason):
        """Fail closed on a newer trusted but unparseable event notification."""
        if not isinstance(message, dict):
            return
        origin = message.get("from")
        address = origin.get("emailAddress") if isinstance(origin, dict) else None
        try:
            sender = _email(address.get("address") if isinstance(address, dict) else None)
        except WorkflowError:
            return
        if sender not in self.policy["trustedAlertSenders"] + self.policy["trustedInternalForwarders"]:
            return
        metadata = message.get("metadata", {})
        metadata = metadata if isinstance(metadata, dict) else {}
        body = message.get("body", {})
        text = body.get("content", "") if isinstance(body, dict) else ""
        text = text if isinstance(text, str) else ""
        try:
            event_ids = [_tracking_id(v) for v in _bounded_metadata_values(text, EVENT_LABEL_RE)]
        except WorkflowError:
            return
        explicit = metadata.get("eventId", message.get("eventId"))
        if isinstance(explicit, str):
            try:
                event_ids.append(_tracking_id(explicit))
            except WorkflowError:
                return
        event_ids = {v.strip() for v in event_ids}
        if len(event_ids) != 1:
            return
        event = self.state["events"].get(event_ids.pop())
        if not event:
            return
        previous = self.state["notices"][event["noticeId"]]
        try:
            headers = list(HEADER_RE.finditer(text))
            updated = _date(headers[0].group(1) if len(headers) == 1 else message.get("receivedDateTime"))
        except WorkflowError:
            updated = self._now()
        if updated < _date(previous["updatedAt"]):
            return
        previous.update(status="needs_review", reviewReasons=reason, blockedSource=True,
                        blockedSourceUpdatedAt=_iso(updated), draftIds=[])
        for draft in self._event_drafts(previous["eventId"]):
            self._invalidate(draft, reason)

    def ingest(self, message, environment_ids=None):
        """Parse and deduplicate a notice, then return notice with status/draftIds.

        Status is ready, needs_review, or ignored. Any unknown part of scope
        prevents ALL event candidates. Optional environment_ids supplies exact
        host-extracted scope and must include every source-detected environment.
        Invalid inputs retain only a safe error record, never the internal body.
        """
        try:
            notice = self.parse_notice(message)
            if environment_ids is not None:
                supplied = _environments(environment_ids)
                known = {(v["type"], v["id"]) for v in notice["environmentIds"]}
                if not known <= {(v["type"], v["id"]) for v in supplied}:
                    raise MappingError("Host scope omits a source-detected environment.")
                notice["environmentIds"] = supplied
        except WorkflowError as exc:
            message_id = message.get("id") if isinstance(message, dict) else None
            try:
                message_id = _label(message_id, "Source message ID")
            except WorkflowError:
                message_id = str(uuid.uuid4())
            failed = {
                "id": message_id, "sourceMessageId": message_id, "status": "needs_review",
                "reviewReasons": [{"code": exc.code, "message": str(exc)}], "draftIds": [],
            }
            self._block_failed_source(message, failed["reviewReasons"])
            # A failed re-read of the active message must invalidate its approval.
            for draft in self.state["drafts"].values():
                if draft["sourceMessageId"] == message_id and draft["status"] not in LOCKED:
                    self._invalidate(draft, failed["reviewReasons"])
            if message_id not in self.state["notices"]:
                self.state["notices"][message_id] = failed
            self._touch()
            return copy.deepcopy(failed)
        event_id = notice["eventId"]
        previous_event = self.state["events"].get(event_id)
        if previous_event:
            previous = self.state["notices"][previous_event["noticeId"]]
            if previous.get("blockedSource") and _date(notice["updatedAt"]) <= _date(previous["blockedSourceUpdatedAt"]):
                return {
                    "id": notice["id"], "status": "needs_review",
                    "reviewReasons": copy.deepcopy(previous["reviewReasons"]), "draftIds": [],
                }
            older = _date(notice["updatedAt"]) < _date(previous["updatedAt"])
            same = notice["sourceHash"] == previous["sourceHash"]
            same_scope = notice["environmentIds"] == previous["environmentIds"]
            if older or (same and (environment_ids is None or same_scope)):
                return {
                    "id": notice["id"], "status": "ignored", "reason": "older_or_duplicate",
                    "latestNoticeId": previous["id"], "draftIds": previous.get("draftIds", [])[:],
                }
            if notice["id"] == previous["id"] and _date(notice["updatedAt"]) < _date(previous["updatedAt"]):
                raise ConflictError("Source timestamp regressed.")
        if not _terminal_status(notice.get("eventStatus")):
            self._ensure_unlocked(event_id)
        notice["scopeEvidence"] = {
            "source": "graph-message", "messageId": notice["id"],
            "sourceHash": notice["sourceHash"], "verifiedAt": _iso(self._now()),
            "expiresAt": _iso(self._now() + timedelta(hours=self.policy["maxEvidenceAgeHours"]["mapping"])),
        }
        if previous_event:
            previous = self.state["notices"][previous_event["noticeId"]]
            if notice["updatedAt"] == previous["updatedAt"] and notice["sourceHash"] != previous["sourceHash"]:
                notice["scopeIncomplete"] = True
                notice["conflictingSource"] = (
                    notice["customerText"] != previous["customerText"]
                    or notice["service"] != previous["service"]
                )
        self.state["notices"][notice["id"]] = notice
        self.state["events"][event_id] = {"noticeId": notice["id"]}
        self._build(notice)
        self._touch()
        return copy.deepcopy(notice)

    def set_environments(self, notice_id, environment_ids, evidence):
        """Resolve manual scope with {source, verifiedAt, expiresAt} evidence.

        Must retain all originally detected GUIDs. This explicitly acknowledges
        a complete manually verified scope; names are never matched.
        """
        notice = self.state["notices"].get(notice_id)
        if not notice or "eventId" not in notice:
            raise StateError("A parsed current notice is required.")
        if self.state["events"][notice["eventId"]]["noticeId"] != notice_id:
            raise ConflictError("Cannot resolve superseded source scope.")
        self._ensure_unlocked(notice["eventId"])
        envs = _environments(environment_ids)
        detected = {(v["type"], v["id"]) for v in notice["environmentIds"]}
        if not envs or not detected <= {(v["type"], v["id"]) for v in envs}:
            raise MappingError("Complete scope must retain all source-detected GUIDs.")
        verified = self._evidence(evidence, "mapping")
        if notice.get("conflictingSource"):
            raise EvidenceError("Conflicting customer source text requires a newer authoritative source.")
        notice["environmentIds"] = envs
        notice["scopeIncomplete"] = False
        notice["scopeEvidence"] = verified
        self._build(notice, preserve_edits=True)
        self._touch()
        return copy.deepcopy(notice)

    def _routes(self, notice, now=None):
        if _terminal_status(notice.get("eventStatus")):
            raise EvidenceError("The source event status is terminal; Action Required dispatch is blocked.")
        if notice.get("blockedSource") or notice.get("scopeIncomplete") or not notice["environmentIds"]:
            raise MappingError("Complete exact tenant/subscription GUID scope is required.")
        self._evidence(notice.get("scopeEvidence"), "mapping", now)
        result = []
        for scope in notice["environmentIds"]:
            matches = [route for route in self.state["mapping"]["environments"]
                       if route["type"] == scope["type"] and route["id"] == scope["id"]
                       and notice["service"] in route["services"]]
            if len(matches) != 1:
                raise MappingError("A scope GUID is unknown, ambiguous, or unsupported for this service.")
            route = matches[0]
            self._evidence(route["verification"], "mapping", now)
            self._evidence(route["contactVerification"], "contact", now)
            if not route["to"]:
                raise MappingError("Verified workload-specific To contacts are missing.")
            for address in route["to"] + route["cc"]:
                if _email(address).rsplit("@", 1)[1] not in route["allowedDomains"]:
                    raise MappingError("A recipient is outside its verified route.")
            result.append(copy.deepcopy(route))
        return result

    def _build(self, notice, preserve_edits=False):
        existing = self._event_drafts(notice["eventId"])
        try:
            routes = self._routes(notice)
        except WorkflowError as exc:
            reason = [{"code": exc.code, "message": str(exc)}]
            notice.update(status="needs_review", reviewReasons=reason, draftIds=[])
            for draft in existing:
                self._invalidate(draft, reason)
            return
        groups = {}
        for route in routes:
            groups.setdefault((route["customerId"], route["teamId"]), []).append(route)
        ids = []
        for (customer_id, team_id), selected in sorted(groups.items()):
            draft_id = str(uuid.uuid5(uuid.NAMESPACE_URL, _canonical(
                ["advisory", notice["eventId"], customer_id, team_id]
            )))
            old = self.state["drafts"].get(draft_id)
            if old and old["status"] in LOCKED and old["sourceHash"] == notice["sourceHash"]:
                self._invalidate(old, ["mapping_changed_after_dispatch"])
                continue
            subject = f"Action required: {notice['service']} – {selected[0]['customerName']}"
            body = (
                "Hello,\n\n"
                f"Below is the customer notice regarding the {notice['service']} service.\n\n"
                f"{notice['customerText']}\n\nBest regards"
            )
            if old and preserve_edits and old["sourceHash"] == notice["sourceHash"]:
                subject, body = old["subject"], old["body"]
            to = sorted({v for r in selected for v in r["to"]})
            cc = sorted({v for r in selected for v in r["cc"]} - set(to))
            draft = {
                "id": draft_id, "noticeId": notice["id"], "eventId": notice["eventId"],
                "customerId": customer_id, "customerName": selected[0]["customerName"],
                "teamId": team_id, "service": notice["service"],
                "environmentIds": _environments(selected),
                **{key: self.policy[key] for key in ("senderEmail", "senderId", "tenantId")},
                "to": to, "cc": cc, "subject": safe_content(subject, subject=True),
                "body": safe_content(body), "revision": old["revision"] + 1 if old else 1,
                "sourceMessageId": notice["sourceMessageId"], "sourceHash": notice["sourceHash"],
                "sourceUpdatedAt": notice["updatedAt"], "sourceEvidence": copy.deepcopy(notice["sourceEvidence"]),
                "scopeEvidence": copy.deepcopy(notice["scopeEvidence"]),
                "mappingRevision": self.state["mappingRevision"], "mappingEvidence": selected,
                "contentVerified": False,
                "status": "needs_review", "reviewReasons": ["translation_or_manual_review_required"],
                "createdAt": old["createdAt"] if old else _iso(self._now()),
                "updatedAt": _iso(self._now()), "approval": None, "attempt": None,
                "lastReceiptAt": old.get("lastReceiptAt") if old else None,
                "previousAttempts": (
                    copy.deepcopy(old.get("previousAttempts", []))
                    + ([copy.deepcopy(old["attempt"])] if old and old.get("attempt") else [])
                ) if old else [],
            }
            draft["digest"] = self._digest(draft)
            self.state["drafts"][draft_id] = draft
            ids.append(draft_id)
        for draft in existing:
            if draft["id"] not in ids:
                self._invalidate(draft, ["scope_or_route_changed"])
        notice.update(status="ready", reviewReasons=[], draftIds=ids)

    @staticmethod
    def _digest(draft):
        try:
            return _hash({key: draft[key] for key in DIGEST_FIELDS})
        except KeyError as exc:
            raise StateError("Incomplete draft binding.") from exc

    def _draft(self, draft_id, revision=None):
        draft = self.state["drafts"].get(draft_id)
        if draft is None:
            raise StateError("Unknown draft ID.")
        if revision is not None and (type(revision) is not int or revision != draft["revision"]):
            raise ConflictError("The draft revision changed.")
        return draft

    def edit_draft(self, draft_id, revision, patch=None, *, subject=None, body=None,
                   contentVerified=None):
        """Edit {subject?, body?, contentVerified?}; return revised draft.

        ``revision`` is mandatory optimistic concurrency. Returns revised draft.
        Recipients are deliberately not browser-editable: change verified mapping.
        Keyword subject/body/contentVerified remain supported; do not mix them
        with a patch. contentVerified must be an actual boolean. Changed text
        resets verification unless that same edit explicitly verifies it.
        """
        if type(revision) is not int:
            raise ConflictError("Editing requires the exact integer draft revision.")
        draft = self._draft(draft_id, revision)
        if draft["status"] in LOCKED:
            raise StateError("A claimed or dispatched draft cannot be edited.")
        if patch is not None:
            if not isinstance(patch, dict) or not patch or set(patch) - {"subject", "body", "contentVerified"}:
                raise ContentError("An edit patch may contain only subject, body, and contentVerified.")
            if any(value is not None for value in (subject, body, contentVerified)):
                raise ContentError("Do not mix a patch with keyword edits.")
            subject, body = patch.get("subject"), patch.get("body")
            contentVerified = patch.get("contentVerified")
            if any(key in patch and patch[key] is None for key in patch):
                raise ContentError("Patch values cannot be null.")
        if subject is None and body is None and contentVerified is None:
            raise ContentError("Supply subject, body, or contentVerified.")
        if contentVerified is not None and type(contentVerified) is not bool:
            raise ContentError("contentVerified must be a boolean.")
        new_subject = safe_content(draft["subject"] if subject is None else subject, subject=True)
        new_body = safe_content(draft["body"] if body is None else body)
        text_changed = new_subject != draft["subject"] or new_body != draft["body"]
        verified = (
            contentVerified if contentVerified is not None
            else False if text_changed else draft.get("contentVerified", False)
        )
        if verified:
            self._check_draft(draft)
        if not text_changed and verified == draft.get("contentVerified", False):
            return copy.deepcopy(draft)
        draft.update(subject=new_subject, body=new_body, revision=draft["revision"] + 1,
                     contentVerified=verified, updatedAt=_iso(self._now()))
        self._invalidate(draft, [] if verified else ["translation_or_manual_review_required"])
        if verified:
            draft["status"] = "ready_for_approval"
        draft["digest"] = self._digest(draft)
        self._touch()
        return copy.deepcopy(draft)

    def verify_content(self, draft_id, revision, content_verified=True):
        """Record explicit human text verification; no authentication/translation.

        True transitions to ready_for_approval; False revokes readiness/approval.
        The subsequent authenticated SharePoint approval binds this exact digest.
        """
        return self.edit_draft(draft_id, revision, {"contentVerified": content_verified})

    def mark_ready(self, draft_id, revision):
        """Verify current subject/body before publishing the immutable review."""
        return self.verify_content(draft_id, revision, True)

    def _check_draft(self, draft, now=None):
        if self._digest(draft) != draft["digest"]:
            raise ApprovalError("The actual payload or its evidence no longer matches the digest.")
        for key in ("senderEmail", "senderId", "tenantId"):
            if draft[key] != self.policy[key]:
                raise ApprovalError("The configured sender binding changed.")
        if safe_content(draft["subject"], subject=True) != draft["subject"] or safe_content(draft["body"]) != draft["body"]:
            raise ContentError("Draft content is no longer canonical customer-safe text.")
        if draft["mappingRevision"] != self.state["mappingRevision"]:
            raise ApprovalError("The mapping revision changed.")
        event = self.state["events"].get(draft["eventId"])
        notice = self.state["notices"].get(event["noticeId"]) if event else None
        if not notice or notice.get("status") != "ready" or draft["id"] not in notice.get("draftIds", []):
            raise EvidenceError("Source or scope currently requires review.")
        if draft["sourceHash"] != notice["sourceHash"] or draft["sourceMessageId"] != notice["sourceMessageId"]:
            raise ApprovalError("The source message changed.")
        source_binding = {
            "eventId": notice["eventId"], "service": notice["service"],
            "updatedAt": notice["updatedAt"], "customerText": notice["customerText"],
            "environmentIds": notice["sourceEnvironmentIds"],
            "scopeIncomplete": notice["sourceScopeIncomplete"],
            "displayAliases": notice["displayAliases"],
            "eventStatus": notice.get("eventStatus"),
        }
        if _hash(source_binding) != notice["sourceHash"]:
            raise ApprovalError("Stored customer source text or metadata changed.")
        if (
            draft["sourceEvidence"] != notice["sourceEvidence"]
            or draft["scopeEvidence"] != notice["scopeEvidence"]
            or draft["sourceUpdatedAt"] != notice["updatedAt"]
            or draft["service"] != notice["service"]
        ):
            raise ApprovalError("Source or scope evidence changed.")
        source = draft["sourceEvidence"]
        if (
            source.get("source") != "graph-message" or source.get("messageId") != notice["id"]
            or source.get("sourceHash") != notice["sourceHash"]
            or _date(source.get("verifiedAt")) > self._now(now)
        ):
            raise EvidenceError("Authenticated source verification evidence is missing or invalid.")
        routes = [route for route in self._routes(notice, now)
                  if route["customerId"] == draft["customerId"] and route["teamId"] == draft["teamId"]]
        to = sorted({v for r in routes for v in r["to"]})
        cc = sorted({v for r in routes for v in r["cc"]} - set(to))
        if (
            routes != draft["mappingEvidence"] or to != draft["to"] or cc != draft["cc"]
            or not routes or any(r["customerName"] != draft["customerName"] for r in routes)
        ):
            raise ApprovalError("Recipients or verified mapping evidence changed.")
        if _environments(routes) != draft["environmentIds"]:
            raise ApprovalError("The environment scope changed.")

    def _receipt(self, draft, revision, digest, receipt, decision):
        self._draft(draft["id"], revision)
        if digest != draft["digest"]:
            raise ApprovalError("Approval digest does not match the current draft.")
        self._check_draft(draft)
        if draft["status"] in LOCKED:
            raise StateError("A claimed or dispatched draft cannot be approved/rejected again.")
        if not isinstance(receipt, dict):
            raise ApprovalError("An authenticated provider receipt is required.")
        provider = self.policy["approvalProvider"]
        if receipt.get("provider") not in ("graph-sharepoint", "demo"):
            raise ApprovalError("Wrong approval provider.")
        if receipt["provider"] == "demo" and self.policy.get("demo") is not True:
            raise ApprovalError("Demo receipts cannot authorize live policy.")
        if any(receipt.get(key) != provider[key] for key in ("siteId", "listId")):
            raise ApprovalError("Approval receipt belongs to a different site/list.")
        if (
            receipt.get("draftId") != draft["id"] or receipt.get("revision") != revision
            or type(receipt.get("revision")) is not int or receipt.get("digest") != digest
        ):
            raise ApprovalError("Receipt draftId, revision, and digest must match exactly.")
        if "decision" in receipt and str(receipt["decision"]).lower() not in (
            decision, {"approve": "approved", "reject": "rejected"}[decision]
        ):
            raise ApprovalError("Receipt decision does not match this operation.")
        if decision == "approve" and draft.get("contentVerified") is not True:
            raise ApprovalError("Explicit human verification of the current customer-facing content is required.")
        try:
            actor_id = _guid(receipt.get("actorId"))
        except WorkflowError as exc:
            raise ApprovalError("Server-derived Graph lastModifiedBy.user.id is required in actorId.") from exc
        if actor_id not in self.policy["approverIds"]:
            raise ApprovalError("The authenticated modifier is not an authorized approver.")
        modified = _date(receipt.get("approvedAt"))
        current = self._now()
        expiry = modified + timedelta(hours=self.policy["approvalLifetimeHours"])
        if modified > current or modified < _date(draft["updatedAt"]) or expiry <= current:
            raise ApprovalError("Approval receipt is old, future-dated, or expired.")
        if draft.get("lastReceiptAt") and modified <= _date(draft["lastReceiptAt"]):
            raise ApprovalError("Approval receipt is not the latest decision.")
        result = {
            "provider": receipt["provider"], "siteId": provider["siteId"], "listId": provider["listId"],
            "draftId": draft["id"],
            "actorId": actor_id, "approvedAt": _iso(modified), "expiresAt": _iso(expiry),
            "revision": revision, "digest": digest, "contentVerified": decision == "approve",
        }
        for key in ("receiptId", "eTag"):
            if key in receipt:
                result[key] = _label(receipt[key], key)
        return result

    def approve(self, draft_id, revision, digest, receipt):
        """Approve verified exact payload using a flat server-issued receipt."""
        draft = self._draft(draft_id, revision)
        approval = self._receipt(draft, revision, digest, receipt, "approve")
        draft.update(approval=approval, status="approved", reviewReasons=[],
                     lastReceiptAt=approval["approvedAt"])
        self._touch()
        return copy.deepcopy(draft)

    def reject(self, draft_id, revision, digest, receipt):
        """Record an authenticated Reject receipt and revoke prior approval."""
        draft = self._draft(draft_id, revision)
        decision = self._receipt(draft, revision, digest, receipt, "reject")
        draft.update(approval=None, status="rejected", reviewReasons=["human_rejected"],
                     lastReceiptAt=decision["approvedAt"], rejection=decision)
        self._touch()
        return copy.deepcopy(draft)

    def claim(self, draft_id, now=None, source_hash=None, sender_id=None):
        """Atomically approved -> dispatching; return attemptId and exact payload.

        source_hash is preferably {hash, messageId, checkedAt}, supplied by the
        host after a fresh authenticated source re-fetch. A plain SHA-256 string
        uses the already-bound sourceEvidence.verifiedAt freshness. sender_id
        must be the currently signed-in Graph identity, NOT a browser value.
        Persist the returned state before any outbound operation.
        """
        draft = self._draft(draft_id)
        if draft["status"] != "approved":
            raise StateError("Only an approved, never-claimed draft can be dispatched.")
        current = self._now(now)
        self._check_draft(draft, current)
        approval = draft.get("approval")
        if (
            not approval or approval["digest"] != draft["digest"]
            or approval["revision"] != draft["revision"]
            or approval.get("contentVerified") is not True or draft.get("contentVerified") is not True
        ):
            raise ApprovalError("Exact current approval is missing.")
        approved_at = _date(approval["approvedAt"])
        policy_expiry = approved_at + timedelta(hours=self.policy["approvalLifetimeHours"])
        if approved_at > current or min(_date(approval["expiresAt"]), policy_expiry) <= current:
            raise ApprovalError("Approval is expired or future-dated under current policy.")
        if approval["actorId"] not in self.policy["approverIds"]:
            raise ApprovalError("The approver is no longer authorized.")
        provider = self.policy["approvalProvider"]
        if (
            any(approval.get(key) != provider.get(key) for key in ("siteId", "listId"))
            or approval["provider"] not in ("graph-sharepoint", "demo")
            or (approval["provider"] == "demo" and self.policy.get("demo") is not True)
        ):
            raise ApprovalError("The trusted approval provider changed.")
        if _guid(sender_id) != self.policy["senderId"]:
            raise ApprovalError("The signed-in sender is not the configured mailbox owner.")
        if isinstance(source_hash, dict):
            fresh_hash = source_hash.get("hash")
            if source_hash.get("messageId") != draft["sourceMessageId"]:
                raise EvidenceError("Fresh source evidence names a different message.")
            checked = _date(source_hash.get("checkedAt"))
        else:
            fresh_hash = source_hash
            checked = _date(draft["sourceEvidence"]["verifiedAt"])
        if fresh_hash != draft["sourceHash"]:
            raise ApprovalError("The currently fetched source hash changed.")
        if checked > current or checked + timedelta(minutes=self.policy["maxSourceAgeMinutes"]) <= current:
            raise EvidenceError("The current source check is missing, stale, or future-dated.")
        attempt_id = str(uuid.uuid4())
        payload = {key: copy.deepcopy(draft[key]) for key in PAYLOAD_FIELDS}
        attempt = {
            "attemptId": attempt_id, "draftId": draft_id, "digest": draft["digest"],
            "claimedAt": _iso(current), "payload": payload, "outcome": None,
        }
        draft.update(status="dispatching", attempt=attempt)
        self._touch()
        return copy.deepcopy(attempt)

    def finish(self, draft_id, attempt_id, outcome, message_id=None):
        """Finalize only a dispatching claim; never automatically retry.

        outcome: submitted (Graph accepted), sent (actual message_id required),
        uncertain -> delivery_unknown, or rejected (transport definitively
        refused) -> delivery_rejected. Every result is terminal for this claim.
        """
        draft = self._draft(draft_id)
        attempt = draft.get("attempt")
        if draft["status"] != "dispatching" or not attempt or attempt["attemptId"] != attempt_id:
            raise StateError("An exact active dispatch attempt is required.")
        statuses = {
            "submitted": "submitted", "sent": "sent", "uncertain": "delivery_unknown",
            "rejected": "delivery_rejected",
        }
        if outcome not in statuses:
            raise StateError("Unknown transport outcome.")
        if outcome == "sent" and not message_id:
            raise StateError("Sent requires an actual transport message ID.")
        if message_id is not None:
            message_id = _label(message_id, "Transport message ID")
        attempt.update(outcome=outcome, finishedAt=_iso(self._now()), messageId=message_id)
        draft["status"] = statuses[outcome]
        self._touch()
        return copy.deepcopy(draft)

    def reconcile(self, draft_id, attempt_id, message_id):
        """Record authenticated Sent Items delivery for an existing exact attempt.

        Host-only: the caller authenticates the Outlook receipt and its match to
        the frozen attempt payload. This module cannot establish receipt
        provenance from a string. Allowed states: dispatching, submitted,
        delivery_unknown; sent is idempotent only for the same message/attempt.
        A conflicting recorded message ID is rejected. No new attempt or retry
        is created. Returns the sent draft; a successful transition increments
        dataRevision once, while an idempotent confirmation does not mutate it.
        """
        draft = self._draft(draft_id)
        attempt = draft.get("attempt")
        if not attempt or attempt.get("attemptId") != attempt_id:
            raise StateError("An exact existing dispatch attempt is required for reconciliation.")
        try:
            actual_id = _label(message_id, "Authenticated Sent Items message ID")
        except WorkflowError as exc:
            raise StateError("A nonempty actual Sent Items message ID without control characters is required.") from exc
        previous_id = attempt.get("messageId")
        if previous_id is not None and previous_id != actual_id:
            raise StateError("The Sent Items receipt conflicts with the recorded message ID.")
        if draft["status"] == "sent":
            if previous_id == actual_id:
                return copy.deepcopy(draft)
            raise StateError("A sent delivery record is missing its original receipt ID.")
        if draft["status"] not in {"dispatching", "submitted", "delivery_unknown"}:
            raise StateError("Only a claimed, submitted, or uncertain dispatch can be reconciled.")
        verified_at = _iso(self._now())
        attempt["reconciliation"] = {
            "messageId": actual_id, "verifiedAt": verified_at,
            "previousStatus": draft["status"], "previousOutcome": attempt.get("outcome"),
        }
        attempt.update(outcome="sent", messageId=actual_id, reconciledAt=verified_at)
        attempt.setdefault("finishedAt", verified_at)
        draft["status"] = "sent"
        self._touch()
        return copy.deepcopy(draft)

    def list_drafts(self):
        """Return independent draft copies sorted by (eventId, customerId, teamId)."""
        return copy.deepcopy(sorted(self.state["drafts"].values(),
                                    key=lambda d: (d["eventId"], d["customerId"], d["teamId"])))
