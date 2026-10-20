"""Bounded, read-only mailbox source. Display aliases never become customer IDs."""

import re
import urllib.parse
from html.parser import HTMLParser
from datetime import datetime, timedelta, timezone

from advisory_graph import GraphRequestError
from advisory_m365 import SharePointApprovals


SELECT = "id,subject,from,receivedDateTime,body"
EVENT_ID = re.compile(r"^[A-Za-z0-9]{2,24}-[A-Za-z0-9]{2,24}$")


class SourceUnavailable(GraphRequestError):
    pass


class _MailText(HTMLParser):
    """Retain forwarded sections and links; do not truncate like case threads."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.ignored = 0
        self.anchor = None

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "head"):
            self.ignored += 1
        if self.ignored:
            return
        if tag in ("br", "p", "div", "tr", "li", "h1", "h2", "h3"):
            self.parts.append("\n")
        if tag == "a":
            self.anchor = dict(attrs).get("href")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "head") and self.ignored:
            self.ignored -= 1
            return
        if self.ignored:
            return
        if tag == "a" and self.anchor:
            self.parts.append(" <" + self.anchor + ">")
            self.anchor = None
        if tag in ("p", "div", "tr", "li", "h1", "h2", "h3"):
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.ignored:
            self.parts.append(data)

    def text(self):
        lines = []
        for raw in "".join(self.parts).replace("\xa0", " ").replace("\u200b", "").splitlines():
            line = re.sub(r"[ \t\f\v]+", " ", raw).strip()
            if line:
                lines.append(line)
        return "\n".join(lines)


def normalise_message(message):
    if not isinstance(message, dict):
        raise SourceUnavailable("Invalid Microsoft Graph message.")
    body = message.get("body")
    if not isinstance(body, dict) or not isinstance(body.get("content"), str):
        raise SourceUnavailable("Source message body is unavailable or protected by usage rights.")
    if str(body.get("contentType", "")).lower() == "html":
        parser = _MailText()
        parser.feed(body["content"])
        parser.close()
        text = parser.text()
    elif str(body.get("contentType", "")).lower() == "text":
        text = body["content"]
    else:
        raise SourceUnavailable("Unknown source message body format.")
    if not text.strip() or len(text) > 150000:
        raise SourceUnavailable("Source text is empty or exceeds its bounded size.")
    prefix = re.split(r"Current Message for Customers", text, maxsplit=1, flags=re.I)[0]
    explicit_action = bool(re.search(r"\baction[\s-]+required\b", str(message.get("subject", "")), re.I)
                           or re.search(r"^\s*(?:Action Required (?:Update )?Alert|(?:Classification|Event Type)\s*:\s*Action Required)\s*$",
                                        prefix, re.I | re.M))
    return {
        "id": message.get("id"), "subject": message.get("subject"),
        "from": message.get("from"), "receivedDateTime": message.get("receivedDateTime"),
        "body": {"contentType": "text", "content": text},
        "metadata": {"actionRequired": explicit_action},
    }


class MailboxNotices:
    def __init__(self, graph, policy):
        self.graph = graph
        self.policy = policy
        self.trusted = {address.lower() for address in policy["trustedAlertSenders"]} | {
            address.lower() for address in policy["trustedForwarders"]
        }

    def _trusted(self, message):
        sender = (((message.get("from") or {}).get("emailAddress") or {}).get("address") or "").lower()
        return sender in self.trusted

    def _fetch(self, parameters):
        SharePointApprovals(self.graph, self.policy).assert_sender()
        path = "/me/messages?" + urllib.parse.urlencode(dict(parameters, **{"$select": SELECT, "$top": 50}))
        messages = self.graph.all(path, max_pages=8)
        result = []
        for message in messages:
            if not self._trusted(message):
                continue
            try:
                result.append(normalise_message(message))
            except SourceUnavailable:
                # A trusted address also sends mail unrelated to Advisory (long threads, forwards, etc.);
                # one message that cannot be safely normalised must not hide every other real notice.
                continue
        return result

    def recent(self, days=14):
        if type(days) is not int or not 1 <= days <= 30:
            raise SourceUnavailable("Mailbox scan is limited to one through thirty days.")
        start = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
        senders = " or ".join("from/emailAddress/address eq '%s'" % address for address in sorted(self.trusted))
        messages = self._fetch({"$filter": "(%s) and receivedDateTime ge %s" % (senders, start)})
        return [message for message in messages if message["metadata"]["actionRequired"]
                and ("advisory" in str(message.get("subject", "")).lower()
                     or "advisory" in message["body"]["content"].lower())]

    def event(self, event_id):
        if not isinstance(event_id, str) or not EVENT_ID.fullmatch(event_id):
            raise SourceUnavailable("A verified event tracking ID is required.")
        messages = self._fetch({"$search": '"subject:%s"' % event_id})
        if not messages:
            raise SourceUnavailable("No trusted source message was found for this event.")
        return messages

    def message(self, message_id):
        if not isinstance(message_id, str) or not message_id or len(message_id) > 1024:
            raise SourceUnavailable("A source message ID is required.")
        SharePointApprovals(self.graph, self.policy).assert_sender()
        message = self.graph.get("/me/messages/" + urllib.parse.quote(message_id, safe="") +
                                 "?" + urllib.parse.urlencode({"$select": SELECT}))
        if not self._trusted(message):
            raise SourceUnavailable("Current source sender is not trusted.")
        return normalise_message(message)
