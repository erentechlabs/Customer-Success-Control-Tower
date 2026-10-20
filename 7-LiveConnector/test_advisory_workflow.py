"""Synthetic, offline unittest coverage for the advisory workflow."""

import copy
import json
import unittest
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from advisory_workflow import (
    ApprovalError, ConflictError, ContentError, EvidenceError, MappingError,
    ParseError, StateError, Workflow, WorkflowError, empty_state, safe_content,
)


TENANT_A = "11111111-1111-4111-8111-111111111111"
TENANT_B = "22222222-2222-4222-8222-222222222222"
SUBSCRIPTION_A = "33333333-3333-4333-8333-333333333333"
UNKNOWN = "44444444-4444-4444-8444-444444444444"
SENDER = "55555555-5555-4555-8555-555555555555"
APPROVER_ONE = "66666666-6666-4666-8666-666666666666"
APPROVER_TWO = "77777777-7777-4777-8777-777777777777"
OUTSIDER = "88888888-8888-4888-8888-888888888888"
AUTH_TENANT = "99999999-9999-4999-8999-999999999999"
SERVICE = "Azure Kubernetes Service"
REALISTIC_SERVICE = r"Cognitive Services \ Azure Form Recognizer"
PUBLIC_URL = "https://learn.microsoft.com/en-us/azure/aks/upgrade-cluster"


def stamp(value):
    return value.isoformat().replace("+00:00", "Z")


def env(value=TENANT_A, kind="tenant"):
    return {"type": kind, "id": value}


def wrapped(url, host="nam.safelink.emails.azure.net"):
    return f"https://{host}/?url={quote(url, safe='')}&data=private-tracking&sdata=private-signature"


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 15, 12, 0, 0, tzinfo=timezone.utc)
        self.policy = {
            "senderEmail": "sender@staff.example", "senderId": SENDER, "tenantId": AUTH_TENANT,
            "approverIds": [APPROVER_ONE, APPROVER_TWO],
            "trustedAlertSenders": ["advisory-alerts@staff.example"],
            "trustedInternalForwarders": ["forwarder@staff.example"],
            "approvalProvider": {
                "siteId": "synthetic-site", "listId": "synthetic-list",
            },
            "maxEvidenceAgeHours": {"mapping": 24, "contact": 24},
            "maxSourceAgeMinutes": 15, "approvalLifetimeHours": 2,
        }
        self.state = empty_state()
        self.flow = Workflow(self.state, self.policy, now=lambda: self.now)

    def evidence(self, source="synthetic-directory"):
        return {
            "source": source, "verifiedAt": stamp(self.now - timedelta(hours=1)),
            "expiresAt": stamp(self.now + timedelta(hours=23)),
        }

    def route(self, identifier=TENANT_A, kind="tenant", customer="customer-a",
              name="Sample Customer A", team="aks-team", contact="aks@customer-a.example"):
        return {
            "type": kind, "id": identifier, "customerId": customer, "customerName": name,
            "teamId": team, "services": [SERVICE],
            "allowedDomains": [contact.rsplit("@", 1)[1]],
            "to": [contact], "cc": [], "verification": self.evidence(),
            "contactVerification": self.evidence("synthetic-contact-registry"),
        }

    def mapping(self, *routes):
        return {"environments": list(routes or [self.route()])}

    def message(self, *, identifier="message-1", updated=None, scope=None, text=None,
                event="SYNTHETIC-EVENT-1", service=SERVICE, include_ids=True):
        updated = updated or self.now - timedelta(minutes=5)
        scope = [env()] if scope is None else scope
        lines = [f"Event ID: {event}", f"Service: {service}", "Classification: Action Required"]
        if include_ids:
            lines += [f"{v['type'].capitalize()} ID: {v['id']}" for v in scope]
        lines += [
            "Tenant Name: Same Display Name",
            "Internal-only operational preamble: IcM 123456",
            f"Current Message for Customers [Updated at {stamp(updated)}]:",
            text if text is not None else f"Please review the supported upgrade guidance: {PUBLIC_URL}",
            "You received this email based on your alert preferences.",
            "Service Incident Playbook: https://internal.eng.ms/synthetic",
            "Advisory internal footer: https://private.sharepoint.com/synthetic",
        ]
        return {
            "id": identifier, "subject": "Action Required: synthetic maintenance advisory",
            "from": {"emailAddress": {"name": "Advisory Alerts", "address": "advisory-alerts@staff.example"}},
            "receivedDateTime": stamp(self.now - timedelta(minutes=4)),
            "body": {"contentType": "text", "content": "\n".join(lines)},
        }

    def realistic_message(self, *, partial=False, tracking_annotation=True):
        updated = datetime(2026, 10, 6, 21, 41, 57, tzinfo=timezone.utc)
        message = self.message(event="7XQ2-F19", service=REALISTIC_SERVICE, updated=updated)
        annotation = (
            " <" + wrapped("https://internal.eng.ms/synthetic-tracking?id=7XQ2-F19") + ">"
            if tracking_annotation else ""
        )
        text = message["body"]["content"].replace(
            "Event ID: 7XQ2-F19", "Tracking Id:\n7XQ2-F19" + annotation
        ).replace(
            "Service: " + REALISTIC_SERVICE, "Service(s) Affected:\n" + REALISTIC_SERVICE
        ).replace(
            stamp(updated), "10/6/2026 9:41:57 PM UTC"
        )
        if partial:
            text = text.replace(
                "Tenant Name: Same Display Name",
                "Tenant Name: Same Display Name\nThis is a partial list of impacted customers.",
            )
        message["body"]["content"] = text
        return message

    def realistic_mapping(self):
        route = self.route(team="document-intelligence-team")
        route["services"] = [REALISTIC_SERVICE]
        return self.mapping(route)

    def with_affected_lists(self, message, customers=None, subscriptions=None):
        message = copy.deepcopy(message)
        customers = ["- Display Customer A", "Subscription Name: Display Subscription A"] if customers is None else customers
        subscriptions = ["- Display Subscription A"] if subscriptions is None else subscriptions
        sections = (
            "Tenant Name: Same Display Name\nYour Customers Affected:\n"
            + "\n".join(customers) + "\nYour Subscriptions Affected:\n"
            + "\n".join(subscriptions) + "\n"
        )
        message["body"]["content"] = message["body"]["content"].replace(
            "Tenant Name: Same Display Name", sections
        )
        return message

    def with_status(self, message, status, *, inline=False):
        message = copy.deepcopy(message)
        label = "Status: " + status if inline else "Status:\n" + status
        message["body"]["content"] = label + "\n" + message["body"]["content"]
        return message

    def draft(self, message=None, mapping=None):
        self.flow.set_mapping(mapping or self.mapping())
        notice = self.flow.ingest(message or self.message())
        self.assertEqual("ready", notice["status"])
        self.assertEqual(1, len(notice["draftIds"]))
        return self.flow.list_drafts()[0]

    def receipt(self, draft, actor=APPROVER_ONE, decision="Approve"):
        return {
            "provider": "graph-sharepoint", "siteId": "synthetic-site", "listId": "synthetic-list",
            "draftId": draft["id"], "revision": draft["revision"], "digest": draft["digest"],
            "actorId": actor, "approvedAt": stamp(self.now), "decision": decision,
        }

    def ready(self, draft=None):
        draft = draft or self.draft()
        return self.flow.mark_ready(draft["id"], draft["revision"])

    def approve(self, draft=None, actor=APPROVER_ONE):
        draft = draft or self.draft()
        if not draft["contentVerified"]:
            draft = self.ready(draft)
        return self.flow.approve(draft["id"], draft["revision"], draft["digest"], self.receipt(draft, actor))

    def fresh(self, draft, checked=None):
        return {
            "hash": draft["sourceHash"], "messageId": draft["sourceMessageId"],
            "checkedAt": stamp(checked or self.now),
        }

    def claim(self, draft):
        return self.flow.claim(draft["id"], now=self.now, source_hash=self.fresh(draft), sender_id=SENDER)

    def test_empty_state_and_results_are_json_serializable_independent_copies(self):
        other = empty_state()
        self.assertIsNot(self.state["drafts"], other["drafts"])
        draft = self.draft()
        json.loads(json.dumps(self.state))
        draft["to"].append("outsider@bad.example")
        listed = self.flow.list_drafts()
        listed[0]["body"] = "modified local copy"
        self.assertEqual(["aks@customer-a.example"], self.flow.list_drafts()[0]["to"])
        self.assertNotEqual("modified local copy", self.flow.list_drafts()[0]["body"])
        cloned = Workflow(copy.deepcopy(self.state), self.policy, now=self.now)
        self.assertEqual(self.flow.list_drafts(), cloned.list_drafts())

    def test_exact_id_and_service_mapping_not_display_alias(self):
        second = self.route(TENANT_B, customer="customer-b", name="Same Display Name",
                            contact="aks@customer-b.example")
        draft = self.draft(mapping=self.mapping(self.route(name="Same Display Name"), second))
        self.assertEqual("customer-a", draft["customerId"])
        self.assertEqual([env()], draft["environmentIds"])
        self.assertEqual(["aks@customer-a.example"], draft["to"])
        self.assertEqual(["translation_or_manual_review_required"], draft["reviewReasons"])
        self.assertTrue(draft["subject"].startswith("Action required:"))

    def test_names_alone_never_resolve_environment(self):
        self.flow.set_mapping(self.mapping(self.route(name="Same Display Name")))
        result = self.flow.ingest(self.message(include_ids=False))
        self.assertEqual("needs_review", result["status"])
        self.assertEqual([], result["draftIds"])
        self.assertEqual([], self.flow.list_drafts())

    def test_same_guid_with_wrong_environment_type_does_not_resolve(self):
        self.flow.set_mapping(self.mapping(self.route()))
        notice = self.flow.ingest(self.message(scope=[env(TENANT_A, "subscription")]))
        self.assertEqual("needs_review", notice["status"])
        self.assertEqual([], notice["draftIds"])

    def test_non_guid_mapping_and_untyped_ids_are_rejected(self):
        for bad in ("same-display-name", "111", "{"+TENANT_A+"}", TENANT_A+"\n"):
            with self.subTest(bad=bad), self.assertRaises(MappingError):
                self.flow.set_mapping(self.mapping(self.route(bad)))
        notice = self.flow.ingest(self.message(), environment_ids=[TENANT_A])
        self.assertEqual("needs_review", notice["status"])

    def test_ambiguous_environment_or_service_routes_rejected(self):
        for route in (
            self.route(customer="other-customer"),
            self.route(team="other-team"),
            self.route(),
        ):
            with self.subTest(route=route["customerId"]+route["teamId"]), self.assertRaises(MappingError):
                self.flow.set_mapping(self.mapping(self.route(), route))
        self.assertEqual(0, self.state["mappingRevision"])

    def test_one_environment_can_have_disjoint_workload_service_routes(self):
        database = self.route(team="database-team", contact="sql@customer-a.example")
        database["services"] = ["Azure SQL Database"]
        draft = self.draft(mapping=self.mapping(self.route(), database))
        self.assertEqual("aks-team", draft["teamId"])
        self.assertEqual(["aks@customer-a.example"], draft["to"])

    def test_unsupported_service_missing_contacts_or_evidence_needs_review(self):
        cases = []
        unsupported = self.route()
        unsupported["services"] = ["Azure SQL Database"]
        cases.append(unsupported)
        missing_contacts = self.route()
        missing_contacts["to"] = []
        cases.append(missing_contacts)
        for key in ("verification", "contactVerification"):
            missing = self.route()
            del missing[key]
            cases.append(missing)
        for route in cases:
            with self.subTest(route=route):
                state = empty_state()
                flow = Workflow(state, self.policy, now=self.now)
                flow.set_mapping(self.mapping(route))
                notice = flow.ingest(self.message())
                self.assertEqual("needs_review", notice["status"])
                self.assertEqual([], flow.list_drafts())

    def test_unknown_partial_scope_blocks_all_customers(self):
        self.flow.set_mapping(self.mapping())
        notice = self.flow.ingest(self.message(scope=[env(), env(UNKNOWN)]))
        self.assertEqual("needs_review", notice["status"])
        self.assertEqual([], self.flow.list_drafts())
        partial = self.message()
        partial["body"]["content"] = partial["body"]["content"].replace(
            f"Tenant ID: {TENANT_A}", f"Tenant IDs: {TENANT_A}, UNKNOWN-NAME"
        )
        self.assertEqual("needs_review", self.flow.ingest(partial)["status"])

    def test_unresolved_untyped_environment_alongside_guid_requires_review(self):
        self.flow.set_mapping(self.mapping())
        message = self.message()
        message["body"]["content"] = message["body"]["content"].replace(
            "Tenant Name: Same Display Name", "Tenant Name: Same Display Name\nTenant: Unresolved customer alias"
        )
        notice = self.flow.ingest(message)
        self.assertEqual("needs_review", notice["status"])
        self.assertTrue(notice["scopeIncomplete"])
        self.assertEqual([], notice["draftIds"])

    def test_multiple_customers_never_share_one_message(self):
        route_b = self.route(TENANT_B, customer="customer-b", name="Sample Customer B",
                             contact="ops@customer-b.example")
        self.flow.set_mapping(self.mapping(self.route(), route_b))
        notice = self.flow.ingest(self.message(scope=[env(), env(TENANT_B)]))
        self.assertEqual(2, len(notice["draftIds"]))
        drafts = self.flow.list_drafts()
        self.assertEqual(["customer-a", "customer-b"], [d["customerId"] for d in drafts])
        self.assertEqual([["aks@customer-a.example"], ["ops@customer-b.example"]], [d["to"] for d in drafts])
        self.assertEqual([[env()], [env(TENANT_B)]], [d["environmentIds"] for d in drafts])

    def test_same_customer_team_event_merges_tenant_and_subscription(self):
        tenant = self.route()
        tenant["cc"] = ["observer@customer-a.example"]
        subscription = self.route(SUBSCRIPTION_A, "subscription", contact="ops@customer-a.example")
        subscription["cc"] = ["aks@customer-a.example"]
        draft = self.draft(
            self.message(scope=[env(), env(SUBSCRIPTION_A, "subscription")]),
            self.mapping(tenant, subscription),
        )
        self.assertEqual(2, len(draft["environmentIds"]))
        self.assertEqual(["aks@customer-a.example", "ops@customer-a.example"], draft["to"])
        self.assertEqual(["observer@customer-a.example"], draft["cc"])

    def test_same_customer_different_workload_teams_are_separate(self):
        second = self.route(SUBSCRIPTION_A, "subscription", team="aks-regional-team",
                            contact="regional@customer-a.example")
        self.flow.set_mapping(self.mapping(self.route(), second))
        result = self.flow.ingest(self.message(scope=[env(), env(SUBSCRIPTION_A, "subscription")]))
        self.assertEqual(2, len(result["draftIds"]))
        self.assertEqual(2, len({d["teamId"] for d in self.flow.list_drafts()}))

    def test_customer_section_filters_internal_preamble_and_footer(self):
        parsed = self.flow.parse_notice(self.message())
        self.assertEqual(f"Please review the supported upgrade guidance: {PUBLIC_URL}", parsed["customerText"])
        self.assertEqual("SYNTHETIC-EVENT-1", parsed["eventId"])
        self.assertEqual(SERVICE, parsed["service"])
        self.assertEqual(["Same Display Name"], parsed["displayAliases"]["tenantNames"])
        serialized = json.dumps(parsed)
        for secret in ("123456", "private.sharepoint.com", "internal.eng.ms", "operational preamble"):
            self.assertNotIn(secret, serialized)
        draft = self.draft()
        for secret in ("123456", "private.sharepoint.com", "internal.eng.ms"):
            self.assertNotIn(secret, json.dumps(draft))

    def test_realistic_multiline_tracking_plural_service_and_timestamp_seconds(self):
        message = self.realistic_message()
        parsed = self.flow.parse_notice(message)
        self.assertEqual("7XQ2-F19", parsed["eventId"])
        self.assertEqual(REALISTIC_SERVICE, parsed["service"])
        self.assertEqual("2026-10-06T21:41:57Z", parsed["updatedAt"])
        self.assertEqual([env()], parsed["environmentIds"])
        self.assertFalse(parsed["sourceScopeIncomplete"])
        for private in ("safelink", "private-tracking", "internal.eng.ms", "synthetic-tracking"):
            self.assertNotIn(private, json.dumps(parsed))
        draft = self.draft(message, self.realistic_mapping())
        self.assertEqual("document-intelligence-team", draft["teamId"])
        self.assertIn(REALISTIC_SERVICE, draft["subject"])
        self.assertIn(PUBLIC_URL, draft["body"])
        self.assertNotIn("synthetic-tracking", json.dumps(draft))
        approved = self.approve(draft)
        self.assertEqual(approved["digest"], self.claim(approved)["digest"])

    def test_multiline_tracking_without_annotation_and_utc_minutes_remain_supported(self):
        message = self.realistic_message(tracking_annotation=False)
        message["body"]["content"] = message["body"]["content"].replace(
            "10/6/2026 9:41:57 PM UTC", "10/6/2026 9:41 PM UTC"
        )
        parsed = self.flow.parse_notice(message)
        self.assertEqual("7XQ2-F19", parsed["eventId"])
        self.assertEqual("2026-10-06T21:41:00Z", parsed["updatedAt"])

    def test_label_values_are_adjacent_bounded_and_cannot_cross_other_labels(self):
        for blank_count in (0, 1, 2):
            with self.subTest(blank_count=blank_count):
                message = self.realistic_message()
                message["body"]["content"] = message["body"]["content"].replace(
                    "Tracking Id:\n", "Tracking Id:\n" + "\n" * blank_count
                ).replace(
                    "Service(s) Affected:\n", "Service(s) Affected:\n" + "\n" * blank_count
                )
                self.assertEqual("7XQ2-F19", self.flow.parse_notice(message)["eventId"])
        for bad_fragment in (
            "Tracking Id:\n\n\n\n7XQ2-F19",
            "Tracking Id:\nService(s) Affected:\n7XQ2-F19",
            "Tracking Id:\nTenant ID: " + TENANT_A + "\n7XQ2-F19",
        ):
            message = self.realistic_message(tracking_annotation=False)
            message["body"]["content"] = message["body"]["content"].replace(
                "Tracking Id:\n7XQ2-F19", bad_fragment
            )
            with self.subTest(fragment=bad_fragment), self.assertRaises(ParseError):
                self.flow.parse_notice(message)
        message = self.realistic_message()
        message["body"]["content"] = message["body"]["content"].replace(
            "Service(s) Affected:\n" + REALISTIC_SERVICE, "Service(s) Affected:"
        )
        with self.assertRaises(ParseError):
            self.flow.parse_notice(message)

    def test_conflicting_metadata_labels_or_annotations_are_explicit_review_errors(self):
        fragments = (
            "Event ID: OTHER-EVENT",
            "Service: Azure SQL Database",
            "Tracking Id: 7XQ2-F19 <https://one.internal.example> <https://two.internal.example>",
        )
        for fragment in fragments:
            message = self.realistic_message()
            message["body"]["content"] = fragment + "\n" + message["body"]["content"]
            with self.subTest(fragment=fragment):
                with self.assertRaises(ParseError):
                    self.flow.parse_notice(message)
                self.assertEqual("needs_review", self.flow.ingest(message)["status"])

    def test_partial_customer_list_blocks_scope_even_with_valid_or_supplied_guids(self):
        message = self.realistic_message(partial=True)
        self.flow.set_mapping(self.realistic_mapping())
        parsed = self.flow.parse_notice(message)
        self.assertTrue(parsed["sourceScopeIncomplete"])
        self.assertTrue(parsed["scopeIncomplete"])
        notice = self.flow.ingest(message, environment_ids=[env()])
        self.assertEqual("needs_review", notice["status"])
        self.assertEqual([], notice["draftIds"])
        self.assertEqual([], self.flow.list_drafts())
        with self.assertRaises(EvidenceError):
            self.flow.set_environments(notice["id"], [env()], {})

    def test_partial_scope_requires_explicit_complete_attestation_and_preserves_source_binding(self):
        self.flow.set_mapping(self.realistic_mapping())
        message = self.realistic_message(partial=True)
        notice = self.flow.ingest(message)
        original_hash = notice["sourceHash"]
        complete = self.flow.set_environments(
            notice["id"], [env()], self.evidence("synthetic-complete-environment-inventory")
        )
        self.assertEqual("ready", complete["status"])
        self.assertFalse(complete["scopeIncomplete"])
        self.assertTrue(complete["sourceScopeIncomplete"])
        self.assertEqual(original_hash, complete["sourceHash"])
        draft = self.flow.list_drafts()[0]
        self.assertFalse(draft["contentVerified"])
        approved = self.approve(draft)
        before = copy.deepcopy(self.state)
        self.assertEqual("ignored", self.flow.ingest(message)["status"])
        self.assertEqual(before, self.state)
        self.assertEqual(approved["digest"], self.claim(approved)["digest"])

    def test_partial_warning_is_case_insensitive_and_survives_normalized_line_wrapping(self):
        message = self.realistic_message(partial=True)
        message["body"]["content"] = message["body"]["content"].replace(
            "This is a partial list of impacted customers.",
            "THIS IS A PARTIAL LIST\nOF IMPACTED CUSTOMERS.",
        )
        self.assertTrue(self.flow.parse_notice(message)["sourceScopeIncomplete"])

    def test_new_partial_source_revokes_existing_approval(self):
        draft = self.draft(self.realistic_message(), self.realistic_mapping())
        self.approve(draft)
        source = self.realistic_message(partial=True)
        source["id"] = "partial-scope-update"
        source["body"]["content"] = source["body"]["content"].replace(
            "10/6/2026 9:41:57 PM UTC", "10/7/2026 9:41:57 PM UTC"
        )
        notice = self.flow.ingest(source)
        self.assertEqual("needs_review", notice["status"])
        self.assertTrue(notice["sourceScopeIncomplete"])
        current = self.flow.list_drafts()[0]
        self.assertIsNone(current["approval"])
        self.assertEqual("needs_review", current["status"])
        with self.assertRaises(StateError):
            self.claim(current)

    def test_malformed_customer_update_with_multiline_tracking_revokes_old_approval(self):
        self.approve(self.draft(self.realistic_message(), self.realistic_mapping()))
        source = self.realistic_message()
        source["id"] = "unsafe-realistic-layout-update"
        source["body"]["content"] = source["body"]["content"].replace(
            "10/6/2026 9:41:57 PM UTC", "10/7/2026 9:41:57 PM UTC"
        ).replace(
            "Please review the supported upgrade guidance:", "Internal-only instructions:"
        )
        self.assertEqual("needs_review", self.flow.ingest(source)["status"])
        current = self.flow.list_drafts()[0]
        self.assertIsNone(current["approval"])
        self.assertEqual("needs_review", current["status"])

    def test_unknown_aka_ms_redirects_fail_closed_in_outbound_content_not_metadata(self):
        for link in ("https://aka.ms/synthetic-unknown-link", wrapped("https://aka.ms/synthetic-unknown-link")):
            with self.subTest(link=link), self.assertRaises(ContentError):
                safe_content("Review " + link)
        message = self.realistic_message(tracking_annotation=False)
        message["body"]["content"] = message["body"]["content"].replace(
            "Tracking Id:\n7XQ2-F19", "Tracking Id:\n7XQ2-F19 <https://aka.ms/synthetic-internal-tracking>"
        )
        parsed = self.flow.parse_notice(message)
        self.assertEqual("7XQ2-F19", parsed["eventId"])
        self.assertNotIn("aka.ms", json.dumps(parsed))

    def test_display_alias_change_alone_changes_hash_and_revokes_approval(self):
        second = self.route(TENANT_B, customer="customer-b", name="Other Display Customer",
                            contact="ops@customer-b.example")
        second["services"] = [REALISTIC_SERVICE]
        route = self.realistic_mapping()["environments"][0]
        source = self.realistic_message()
        approved = self.approve(self.draft(source, self.mapping(route, second)))
        changed = copy.deepcopy(source)
        changed["id"] = "renamed-alias-forward"
        changed["body"]["content"] = changed["body"]["content"].replace(
            "Tenant Name: Same Display Name", "Tenant Name: Other Display Customer"
        )
        parsed = self.flow.parse_notice(changed)
        original = self.flow.parse_notice(source)
        self.assertEqual(original["customerText"], parsed["customerText"])
        self.assertEqual(original["updatedAt"], parsed["updatedAt"])
        self.assertEqual(original["environmentIds"], parsed["environmentIds"])
        self.assertNotEqual(approved["sourceHash"], parsed["sourceHash"])
        notice = self.flow.ingest(changed)
        self.assertEqual("needs_review", notice["status"])
        self.assertTrue(notice["scopeIncomplete"])
        self.assertFalse(notice["conflictingSource"])
        self.assertIsNone(self.flow.list_drafts()[0]["approval"])
        self.now += timedelta(seconds=1)
        self.flow.set_environments(notice["id"], [env()], self.evidence("synthetic-complete-inventory"))
        current = self.flow.list_drafts()[0]
        self.assertEqual("customer-a", current["customerId"])
        self.assertEqual(["aks@customer-a.example"], current["to"])
        self.assertNotEqual(approved["sourceHash"], current["sourceHash"])
        self.assertEqual("needs_review", current["status"])
        self.assertEqual("approved", self.approve(current)["status"])

    def test_affected_display_lists_are_normalized_bounded_source_evidence_only(self):
        annotation = " <" + wrapped("https://internal.eng.ms/synthetic-customer-evidence") + ">"
        source = self.with_affected_lists(
            self.realistic_message(),
            customers=["- Display\tCustomer A" + annotation, "Subscription Name: Display Subscription A"],
            subscriptions=["1. Display Subscription B", "* Display Subscription A"],
        )
        parsed = self.flow.parse_notice(source)
        self.assertEqual(
            ["Display Customer A", "Subscription Name: Display Subscription A"],
            parsed["displayAliases"]["affectedCustomers"],
        )
        self.assertEqual(
            ["Display Subscription A", "Display Subscription B"],
            parsed["displayAliases"]["affectedSubscriptions"],
        )
        self.assertEqual(["Display Subscription A"], parsed["displayAliases"]["subscriptionNames"])
        for internal in ("safelink", "internal.eng.ms", "synthetic-customer-evidence", "123456", "Please review"):
            self.assertNotIn(internal, json.dumps(parsed["displayAliases"]))
        draft = self.draft(source, self.realistic_mapping())
        self.assertEqual("customer-a", draft["customerId"])
        self.assertEqual([env()], draft["environmentIds"])
        self.assertNotIn("Display Customer A", draft["body"])
        self.assertNotIn("Display Subscription", json.dumps(draft))

    def test_partial_affected_customer_list_mutation_revokes_resolved_scope_approval(self):
        source = self.with_affected_lists(self.realistic_message(partial=True))
        self.flow.set_mapping(self.realistic_mapping())
        notice = self.flow.ingest(source)
        self.flow.set_environments(notice["id"], [env()], self.evidence("synthetic-complete-inventory"))
        approved = self.approve(self.flow.list_drafts()[0])
        changed = copy.deepcopy(source)
        changed["id"] = "changed-partial-customers-forward"
        changed["body"]["content"] = changed["body"]["content"].replace(
            "Display Customer A", "A Different Display Customer"
        )
        fresh = self.flow.parse_notice(changed)
        self.assertEqual(notice["customerText"], fresh["customerText"])
        self.assertEqual(notice["updatedAt"], fresh["updatedAt"])
        self.assertNotEqual(approved["sourceHash"], fresh["sourceHash"])
        updated = self.flow.ingest(changed)
        self.assertEqual("needs_review", updated["status"])
        self.assertTrue(updated["sourceScopeIncomplete"])
        self.assertTrue(updated["scopeIncomplete"])
        self.assertFalse(updated["conflictingSource"])
        self.assertIsNone(self.flow.list_drafts()[0]["approval"])
        with self.assertRaises(StateError):
            self.claim(self.flow.list_drafts()[0])
        self.now += timedelta(seconds=1)
        self.flow.set_environments(updated["id"], [env()], self.evidence("synthetic-new-complete-inventory"))
        current = self.flow.list_drafts()[0]
        self.assertEqual("customer-a", current["customerId"])
        self.assertEqual([env()], current["environmentIds"])
        self.assertEqual(approved["to"], current["to"])
        self.assertEqual("needs_review", current["status"])

    def test_subscription_name_or_affected_subscription_list_changes_source_hash(self):
        source = self.with_affected_lists(self.realistic_message())
        original = self.flow.parse_notice(source)
        for old, new in (
            ("Subscription Name: Display Subscription A", "Subscription Name: Changed Subscription Name"),
            ("Your Subscriptions Affected:\n- Display Subscription A",
             "Your Subscriptions Affected:\n- Display Subscription A\n- Added Subscription"),
        ):
            with self.subTest(old=old):
                changed = copy.deepcopy(source)
                changed["body"]["content"] = changed["body"]["content"].replace(old, new)
                parsed = self.flow.parse_notice(changed)
                self.assertEqual(original["customerText"], parsed["customerText"])
                self.assertEqual(original["eventId"], parsed["eventId"])
                self.assertEqual(original["updatedAt"], parsed["updatedAt"])
                self.assertNotEqual(original["sourceHash"], parsed["sourceHash"])

    def test_alias_normalization_ignores_spacing_unicode_bullets_and_tracking_annotation(self):
        source = self.with_affected_lists(
            self.realistic_message(), customers=["- Cafe\u0301    Customer"], subscriptions=["* Subscription A"]
        )
        source["body"]["content"] = source["body"]["content"].replace(
            "Tenant Name: Same Display Name", "Tenant Name: Cafe\u0301   Tenant"
        )
        equivalent = copy.deepcopy(source)
        equivalent["body"]["content"] = equivalent["body"]["content"].replace(
            "Cafe\u0301    Customer", "Café Customer <https://aka.ms/synthetic-metadata-tracking>"
        ).replace("Cafe\u0301   Tenant", "Café\tTenant").replace(
            "* Subscription A", "1. Subscription A"
        )
        original = self.flow.parse_notice(source)
        parsed = self.flow.parse_notice(equivalent)
        self.assertEqual(original["displayAliases"], parsed["displayAliases"])
        self.assertEqual(original["sourceHash"], parsed["sourceHash"])

    def test_affected_name_sections_reject_unbounded_or_ambiguous_lists(self):
        sources = (
            self.with_affected_lists(self.realistic_message(), customers=["Customer row " + str(i) for i in range(65)]),
            self.with_affected_lists(self.realistic_message(), customers=["Name " + "x" * 1025]),
        )
        for source in sources:
            with self.subTest(length=len(source["body"]["content"])), self.assertRaises(WorkflowError):
                self.flow.parse_notice(source)
        repeated = self.with_affected_lists(self.realistic_message())
        repeated["body"]["content"] = "Your Customers Affected:\nDifferent Customer\n" + repeated["body"]["content"]
        with self.assertRaises(ParseError):
            self.flow.parse_notice(repeated)

    def test_affected_customer_names_alone_never_resolve_routing(self):
        source = self.with_affected_lists(self.message(include_ids=False), customers=["Sample Customer A"])
        self.flow.set_mapping(self.mapping())
        notice = self.flow.ingest(source)
        self.assertEqual(["Sample Customer A"], notice["displayAliases"]["affectedCustomers"])
        self.assertEqual("needs_review", notice["status"])
        self.assertEqual([], notice["draftIds"])
        self.assertEqual([], self.flow.list_drafts())

    def test_optional_event_status_is_normalized_hashed_and_absent_compatible(self):
        source = self.realistic_message()
        absent = self.flow.parse_notice(source)
        self.assertIsNone(absent["eventStatus"])
        active = self.flow.parse_notice(self.with_status(source, "Active"))
        self.assertEqual("active", active["eventStatus"])
        self.assertEqual(absent["customerText"], active["customerText"])
        self.assertEqual(absent["updatedAt"], active["updatedAt"])
        self.assertNotEqual(absent["sourceHash"], active["sourceHash"])
        equivalent = self.flow.parse_notice(self.with_status(source, "  ACTIVE  ", inline=True))
        self.assertEqual(active["sourceHash"], equivalent["sourceHash"])
        self.flow.set_mapping(self.realistic_mapping())
        self.assertEqual("ready", self.flow.ingest(source)["status"])

    def test_terminal_status_mutation_same_time_revokes_unclaimed_approval(self):
        source = self.with_status(self.realistic_message(), "Active")
        approved = self.approve(self.draft(source, self.realistic_mapping()))
        changed = self.with_status(self.realistic_message(), "Resolved")
        changed["id"] = "resolved-status-forward"
        original = self.flow.parse_notice(source)
        terminal = self.flow.parse_notice(changed)
        self.assertEqual(original["customerText"], terminal["customerText"])
        self.assertEqual(original["updatedAt"], terminal["updatedAt"])
        self.assertEqual(original["displayAliases"], terminal["displayAliases"])
        self.assertNotEqual(original["sourceHash"], terminal["sourceHash"])
        notice = self.flow.ingest(changed)
        self.assertEqual("resolved", notice["eventStatus"])
        self.assertEqual("needs_review", notice["status"])
        self.assertEqual([], notice["draftIds"])
        self.assertIn("terminal", notice["reviewReasons"][0]["message"])
        current = self.flow.list_drafts()[0]
        self.assertIsNone(current["approval"])
        self.assertEqual("needs_review", current["status"])
        with self.assertRaises(StateError):
            self.claim(current)
        completed_scope = self.flow.set_environments(
            notice["id"], [env()], self.evidence("synthetic-complete-inventory")
        )
        self.assertEqual("needs_review", completed_scope["status"])
        self.assertEqual([], completed_scope["draftIds"])
        with self.assertRaises(WorkflowError):
            self.flow.approve(approved["id"], approved["revision"], approved["digest"], self.receipt(approved))

    def test_all_declared_terminal_statuses_never_create_ready_draft(self):
        for status in ("Resolved", "Closed", "Canceled", "Cancelled", "RESOLVED", "Closed - final"):
            with self.subTest(status=status):
                state = empty_state()
                flow = Workflow(state, self.policy, now=self.now)
                flow.set_mapping(self.realistic_mapping())
                notice = flow.ingest(self.with_status(self.realistic_message(), status))
                self.assertEqual("needs_review", notice["status"])
                self.assertEqual([], notice["draftIds"])
                self.assertEqual([], flow.list_drafts())

    def test_status_label_is_bounded_optional_but_unambiguous_when_present(self):
        source = self.realistic_message()
        for prefix in (
            "Status:\nTracking Id:\nActive\n",
            "Status:\n\n\n\nActive\n",
            "Status: Active\nEvent Status: Closed\n",
            "Status:\nService(s) Affected:\nActive\n",
        ):
            changed = copy.deepcopy(source)
            changed["body"]["content"] = prefix + changed["body"]["content"]
            with self.subTest(prefix=prefix), self.assertRaises(ParseError):
                self.flow.parse_notice(changed)
        same = self.with_status(source, "Active")
        same["body"]["content"] = "Event Status: ACTIVE\n" + same["body"]["content"]
        self.assertEqual("active", self.flow.parse_notice(same)["eventStatus"])

    def test_explicit_status_metadata_is_bound_and_must_match_body_status(self):
        source = self.realistic_message()
        source["metadata"] = {"eventStatus": "Active"}
        metadata = self.flow.parse_notice(source)
        self.assertEqual("active", metadata["eventStatus"])
        matching = self.with_status(source, "ACTIVE")
        self.assertEqual(metadata["sourceHash"], self.flow.parse_notice(matching)["sourceHash"])
        with self.assertRaises(ParseError):
            self.flow.parse_notice(self.with_status(source, "Resolved"))
        closed = self.realistic_message()
        closed["metadata"] = {"eventStatus": "Closed"}
        self.flow.set_mapping(self.realistic_mapping())
        self.assertEqual("needs_review", self.flow.ingest(closed)["status"])

    def test_terminal_source_update_never_mutates_or_retries_existing_attempt(self):
        source = self.with_status(self.realistic_message(), "Active")
        approved = self.approve(self.draft(source, self.realistic_mapping()))
        attempt = self.claim(approved)
        for outcome, old_status in (
            (None, "dispatching"), ("submitted", "submitted"),
            ("uncertain", "delivery_unknown"), ("sent", "sent"),
        ):
            with self.subTest(status=old_status):
                state = copy.deepcopy(self.state)
                flow = Workflow(state, self.policy, now=self.now)
                if outcome:
                    flow.finish(approved["id"], attempt["attemptId"], outcome,
                                "historical-sent-id" if outcome == "sent" else None)
                old_attempt = copy.deepcopy(flow.list_drafts()[0]["attempt"])
                changed = self.with_status(self.realistic_message(), "Closed")
                changed["id"] = "closed-after-claim"
                notice = flow.ingest(changed)
                self.assertEqual("needs_review", notice["status"])
                self.assertEqual([], notice["draftIds"])
                current = flow.list_drafts()[0]
                self.assertEqual(old_status, current["status"])
                self.assertEqual(old_attempt, current["attempt"])
                with self.assertRaises(StateError):
                    flow.claim(current["id"], now=self.now, source_hash=self.fresh(current), sender_id=SENDER)

    def test_html_normalized_graph_text_supported_raw_html_rejected(self):
        self.assertIn(PUBLIC_URL, self.flow.parse_notice(self.message())["customerText"])
        for message in (self.message(), self.message()):
            if message["body"]["contentType"] == "text":
                message["body"]["contentType"] = "html"
            with self.assertRaises(ParseError):
                self.flow.parse_notice(message)
        message = self.message(text=f'<a href="{PUBLIC_URL}">link</a>')
        with self.assertRaises(ContentError):
            self.flow.parse_notice(message)

    def test_actual_sender_required_forwarded_from_text_cannot_authenticate(self):
        message = self.message()
        message["from"]["emailAddress"]["address"] = "attacker@bad.example"
        message["body"]["content"] = "From: Advisory Alerts <advisory-alerts@staff.example>\n" + message["body"]["content"]
        with self.assertRaises(ParseError):
            self.flow.parse_notice(message)
        message["from"]["emailAddress"]["address"] = "forwarder@staff.example"
        self.assertEqual("SYNTHETIC-EVENT-1", self.flow.parse_notice(message)["eventId"])

    def test_sender_display_name_not_an_identity(self):
        message = self.message()
        del message["from"]["emailAddress"]["address"]
        with self.assertRaises(ParseError):
            self.flow.parse_notice(message)
        message["from"] = None
        with self.assertRaises(ParseError):
            self.flow.parse_notice(message)

    def test_action_required_can_be_authenticated_event_metadata(self):
        message = self.message()
        message["subject"] = "Synthetic informational subject"
        message["body"]["content"] = message["body"]["content"].replace("Classification: Action Required\n", "")
        with self.assertRaises(ParseError):
            self.flow.parse_notice(message)
        message["metadata"] = {"actionRequired": True}
        self.assertEqual(SERVICE, self.flow.parse_notice(message)["service"])

    def test_missing_malformed_or_multiple_customer_sections_rejected(self):
        messages = [
            self.message(text=""),
            self.message(),
            self.message(),
            self.message(),
        ]
        messages[1]["body"]["content"] = messages[1]["body"]["content"].replace(
            "Current Message for Customers", "Current Message for Employees"
        )
        messages[2]["body"]["content"] += (
            f"\nCurrent Message for Customers [Updated at {stamp(self.now)}]:\nSecond section"
        )
        messages[3]["body"]["content"] += "\nCurrent Message for Customers [malformed]: bad"
        for index, message in enumerate(messages):
            with self.subTest(index=index), self.assertRaises(WorkflowError):
                self.flow.parse_notice(message)
        self.flow.set_mapping(self.mapping())
        self.assertEqual("needs_review", self.flow.ingest(messages[1])["status"])
        self.assertEqual([], self.flow.list_drafts())

    def test_malicious_customer_block_never_silently_sanitized(self):
        bodies = (
            "Internal-only operational guidance.",
            "IcM incident details must be sent to the customer.",
            "Advisory routing instructions.",
            "Microsoft confidential details.",
            "Read https://private.sharepoint.com/internal",
            "Read https://portal.microsofticm.com/incident/1",
            "Read https://internal.eng.ms/details",
            "Read http://learn.microsoft.com/en-us/azure",
            "Read javascript:alert(1)",
        )
        for text in bodies:
            with self.subTest(text=text):
                with self.assertRaises(ContentError):
                    self.flow.parse_notice(self.message(text=text))
                result = self.flow.ingest(self.message(text=text))
                self.assertEqual("needs_review", result["status"])
                self.assertEqual([], result["draftIds"])
                self.assertNotIn(text, json.dumps(result))

    def test_service_incident_playbook_is_footer_not_customer_text(self):
        message = self.message()
        message["body"]["content"] = message["body"]["content"].replace(
            "You received this email based on your alert preferences.\n", ""
        )
        self.assertNotIn("Service Incident Playbook", self.flow.parse_notice(message)["customerText"])

    def test_canonical_safe_links_strip_private_wrapper_parameters(self):
        for host in ("nam.safelink.emails.azure.net", "nam01.safelinks.protection.outlook.com"):
            with self.subTest(host=host):
                parsed = self.flow.parse_notice(self.message(text="Guidance: " + wrapped(PUBLIC_URL, host)))
                self.assertEqual("Guidance: " + PUBLIC_URL, parsed["customerText"])
                self.assertNotIn("sdata", parsed["customerText"])
                self.assertNotIn("private-tracking", parsed["customerText"])
        nested = wrapped(wrapped(PUBLIC_URL))
        self.assertEqual("See " + PUBLIC_URL + ".", safe_content("See " + nested + "."))
        self.assertEqual("See " + PUBLIC_URL, safe_content("See " + wrapped(PUBLIC_URL).replace("&", "&amp;")))

    def test_safe_links_depth_target_and_final_host_validation(self):
        too_deep = PUBLIC_URL
        for _ in range(4):
            too_deep = wrapped(too_deep)
        unsafe = (
            too_deep,
            wrapped("https://private.sharepoint.com/secret"),
            wrapped("https://internal.eng.ms/secret"),
            "https://nam.safelink.emails.azure.net/?data=missing-target",
            wrapped(PUBLIC_URL) + "&url=" + quote(PUBLIC_URL),
            "https://learn.microsoft.com.attacker.example/path",
            "https://username:password@learn.microsoft.com/path",
            "https://learn.microsoft.com:8443/path",
            "https://127.0.0.1/path",
            "https://learn.microsoft.com/path?access_token=private",
            "https://learn.microsoft.com/path?redirect=https%3A%2F%2Fattacker.example",
            "https://learn.microsoft.com/path?hint=IcM",
            "https://learn.microsoft.com/path%0D%0ABcc",
            "https://learn.microsoft.com\\@attacker.example/path",
        )
        for link in unsafe:
            with self.subTest(link=link), self.assertRaises(ContentError):
                safe_content("Read " + link)

    def test_manual_edits_receive_the_same_content_and_url_checks(self):
        draft = self.draft()
        for field, value in (
            ("body", "Read https://private.sharepoint.com/secret"),
            ("body", "Internal-only customer routing."),
            ("subject", "Subject\r\nBcc: victim@customer-a.example"),
            ("body", '<script>alert("unsafe")</script>'),
        ):
            with self.subTest(field=field), self.assertRaises(ContentError):
                self.flow.edit_draft(draft["id"], draft["revision"], **{field: value})
        edited = self.flow.edit_draft(draft["id"], draft["revision"], body="Upgrade guide: " + wrapped(PUBLIC_URL))
        self.assertEqual("Upgrade guide: " + PUBLIC_URL, edited["body"])
        self.assertEqual(draft["revision"] + 1, edited["revision"])

    def test_unreviewed_original_language_draft_cannot_be_approved(self):
        draft = self.draft()
        self.assertFalse(draft["contentVerified"])
        self.assertIn("Please review", draft["body"])
        receipt = self.receipt(draft)
        receipt.update(contentVerified=True, fields={"ContentVerified": True})
        before = copy.deepcopy(self.state)
        with self.assertRaisesRegex(ApprovalError, "human verification"):
            self.flow.approve(draft["id"], draft["revision"], draft["digest"], receipt)
        self.assertEqual(before, self.state)

    def test_patch_can_edit_and_explicitly_verify_exact_customer_text(self):
        draft = self.draft()
        ready = self.flow.edit_draft(draft["id"], draft["revision"], {
            "subject": "Verified service notice",
            "body": "Please review the supported upgrade guide: " + wrapped(PUBLIC_URL),
            "contentVerified": True,
        })
        self.assertEqual("ready_for_approval", ready["status"])
        self.assertTrue(ready["contentVerified"])
        self.assertEqual([], ready["reviewReasons"])
        self.assertEqual(draft["revision"] + 1, ready["revision"])
        self.assertNotEqual(draft["digest"], ready["digest"])
        self.assertIn(PUBLIC_URL, ready["body"])
        self.assertNotIn("safelink", ready["body"])
        self.assertEqual("approved", self.approve(ready)["status"])

    def test_text_edits_reset_verification_and_revoke_existing_approval(self):
        for patch in (
            {"subject": "New customer notice"},
            {"body": "New customer text requiring verification"},
            {"body": "New customer text", "contentVerified": False},
        ):
            with self.subTest(patch=patch):
                state = empty_state()
                flow = Workflow(state, self.policy, now=self.now)
                flow.set_mapping(self.mapping())
                flow.ingest(self.message())
                draft = flow.list_drafts()[0]
                ready = flow.mark_ready(draft["id"], draft["revision"])
                approved = flow.approve(ready["id"], ready["revision"], ready["digest"], self.receipt(ready))
                changed = flow.edit_draft(approved["id"], approved["revision"], patch)
                self.assertFalse(changed["contentVerified"])
                self.assertEqual("needs_review", changed["status"])
                self.assertIsNone(changed["approval"])
                with self.assertRaises(ApprovalError):
                    flow.approve(changed["id"], changed["revision"], changed["digest"], self.receipt(changed))

    def test_content_verification_is_boolean_digest_bound_and_revocable(self):
        draft = self.draft()
        ready = self.flow.verify_content(draft["id"], draft["revision"])
        self.assertEqual(draft["body"], ready["body"])
        self.assertNotEqual(draft["digest"], ready["digest"])
        self.assertEqual("ready_for_approval", ready["status"])
        approved = self.approve(ready)
        before = copy.deepcopy(self.state)
        self.assertEqual(approved, self.flow.mark_ready(approved["id"], approved["revision"]))
        self.assertEqual(before, self.state)
        unverified = self.flow.verify_content(approved["id"], approved["revision"], False)
        self.assertFalse(unverified["contentVerified"])
        self.assertIsNone(unverified["approval"])
        self.assertEqual("needs_review", unverified["status"])
        self.assertNotEqual(approved["digest"], unverified["digest"])

    def test_patch_cannot_edit_recipients_identity_or_approval_and_rejects_bad_flags(self):
        draft = self.draft()
        for patch in (
            {}, {"contentVerified": "true"}, {"contentVerified": 1},
            {"contentVerified": None}, {"subject": None}, {"body": None},
            {"to": ["other@customer-a.example"]}, {"cc": []},
            {"actorId": APPROVER_TWO}, {"approval": {"actorId": APPROVER_TWO}},
            {"customerId": "other-customer"}, {"mappingRevision": 99},
        ):
            with self.subTest(patch=patch):
                before = copy.deepcopy(self.state)
                with self.assertRaises(ContentError):
                    self.flow.edit_draft(draft["id"], draft["revision"], patch)
                self.assertEqual(before, self.state)
        with self.assertRaises(ContentError):
            self.flow.edit_draft(draft["id"], draft["revision"], {"contentVerified": True}, body="Mixed edits")

    def test_mark_ready_cannot_bypass_unsafe_content_or_unresolved_scope(self):
        draft = self.draft()
        with self.assertRaises(ContentError):
            self.flow.edit_draft(draft["id"], draft["revision"], {
                "body": "Internal-only details https://private.sharepoint.com/synthetic",
                "contentVerified": True,
            })
        newer = self.message(identifier="new-unresolved-scope", updated=self.now,
                             scope=[env(), env(UNKNOWN)])
        self.assertEqual("needs_review", self.flow.ingest(newer)["status"])
        existing = self.flow.list_drafts()[0]
        with self.assertRaises(EvidenceError):
            self.flow.mark_ready(existing["id"], existing["revision"])
        self.assertNotEqual("ready_for_approval", self.flow.list_drafts()[0]["status"])

    def test_exact_flat_receipt_without_optional_audit_fields_is_supported(self):
        draft = self.ready()
        receipt = {
            "provider": "graph-sharepoint", "siteId": "synthetic-site", "listId": "synthetic-list",
            "draftId": draft["id"], "revision": draft["revision"], "digest": draft["digest"],
            "actorId": APPROVER_TWO, "approvedAt": stamp(self.now),
        }
        approved = self.flow.approve(draft["id"], draft["revision"], draft["digest"], receipt)
        self.assertEqual(APPROVER_TWO, approved["approval"]["actorId"])
        self.assertEqual(draft["id"], approved["approval"]["draftId"])
        self.assertNotIn("eTag", approved["approval"])
        self.assertNotIn("receiptId", approved["approval"])
        self.assertEqual(draft["digest"], self.claim(approved)["digest"])

    def test_flat_receipt_does_not_infer_actor_from_editable_sharepoint_fields(self):
        draft = self.ready()
        receipt = self.receipt(draft)
        del receipt["actorId"]
        receipt["fields"] = {"ActorId": APPROVER_TWO, "Approver": "Approver Two"}
        receipt["lastModifiedBy"] = {"user": {"id": APPROVER_TWO}}
        with self.assertRaisesRegex(ApprovalError, "Server-derived"):
            self.flow.approve(draft["id"], draft["revision"], draft["digest"], receipt)

    def test_recipient_domain_exactness_and_header_injection(self):
        cases = (
            "attacker@bad.example", "aks@sub.customer-a.example",
            "Name <aks@customer-a.example>", "aks@customer-a.example\r\nBcc: attacker@bad.example",
            "aks@customer-a.example,other@customer-a.example",
        )
        for recipient in cases:
            with self.subTest(recipient=recipient):
                route = self.route()
                route["to"] = [recipient]
                with self.assertRaises(MappingError):
                    self.flow.set_mapping(self.mapping(route))
        route = self.route()
        route["cc"] = ["aks@customer-a.example"]
        with self.assertRaises(MappingError):
            self.flow.set_mapping(self.mapping(route))
        route["cc"] = []
        route["allowedDomains"] = ["*.customer-a.example"]
        with self.assertRaises(MappingError):
            self.flow.set_mapping(self.mapping(route))

    def test_evidence_stale_expired_future_or_missing_timestamp_rejected(self):
        for key in ("verification", "contactVerification"):
            for mode in ("stale", "expired", "future", "missing"):
                with self.subTest(key=key, mode=mode):
                    route = self.route()
                    if mode == "stale":
                        route[key]["verifiedAt"] = stamp(self.now - timedelta(hours=25))
                    elif mode == "expired":
                        route[key]["expiresAt"] = stamp(self.now)
                    elif mode == "future":
                        route[key]["verifiedAt"] = stamp(self.now + timedelta(seconds=1))
                    else:
                        del route[key]["verifiedAt"]
                    with self.assertRaises(EvidenceError):
                        self.flow.set_mapping(self.mapping(route))
        self.assertEqual(0, self.state["mappingRevision"])

    def test_time_passing_rechecks_mapping_and_contacts_at_approval(self):
        draft = self.draft()
        self.now += timedelta(hours=24)
        with self.assertRaises(EvidenceError):
            self.approve(draft)

    def test_set_environments_requires_guid_and_fresh_complete_evidence(self):
        self.flow.set_mapping(self.mapping())
        notice = self.flow.ingest(self.message(include_ids=False))
        self.assertEqual("needs_review", notice["status"])
        with self.assertRaises(EvidenceError):
            self.flow.set_environments(notice["id"], [env()], {})
        with self.assertRaises(MappingError):
            self.flow.set_environments(notice["id"], [{"type": "tenant", "id": "Same Display Name"}], self.evidence())
        updated = self.flow.set_environments(notice["id"], [env()], self.evidence("synthetic-guid-inventory"))
        self.assertEqual("ready", updated["status"])
        draft = self.flow.list_drafts()[0]
        self.assertEqual("synthetic-guid-inventory", draft["scopeEvidence"]["source"])
        self.approve(draft)
        before = copy.deepcopy(self.state)
        self.assertEqual("ignored", self.flow.ingest(self.message(include_ids=False))["status"])
        self.assertEqual(before, self.state)

    def test_partial_scope_cannot_be_overridden_to_remove_unknown_guids(self):
        self.flow.set_mapping(self.mapping())
        notice = self.flow.ingest(self.message(scope=[env(), env(UNKNOWN)]))
        with self.assertRaises(MappingError):
            self.flow.set_environments(notice["id"], [env()], self.evidence())
        self.assertEqual("needs_review", self.flow.ingest(
            self.message(scope=[env(), env(UNKNOWN)]), environment_ids=[env()]
        )["status"])

    def test_mapping_update_invalidates_approval_and_preserves_manual_text(self):
        draft = self.draft()
        edited = self.flow.edit_draft(draft["id"], draft["revision"],
                                      subject="Verified customer notice", body="Please review the guide.")
        approved = self.approve(edited)
        mapping = self.mapping(self.route(contact="new@customer-a.example"))
        result = self.flow.set_mapping(mapping, expected_revision=1)
        latest = self.flow.list_drafts()[0]
        self.assertEqual(2, result["mappingRevision"])
        self.assertEqual("needs_review", latest["status"])
        self.assertIsNone(latest["approval"])
        self.assertFalse(latest["contentVerified"])
        self.assertEqual(["new@customer-a.example"], latest["to"])
        self.assertEqual(edited["body"], latest["body"])
        self.assertNotEqual(approved["digest"], latest["digest"])
        with self.assertRaises(StateError):
            self.claim(latest)

    def test_mapping_revision_compare_and_swap_and_noop(self):
        self.flow.set_mapping(self.mapping(), expected_revision=0)
        before = copy.deepcopy(self.state)
        self.flow.set_mapping(self.mapping(), expected_revision=1)
        self.assertEqual(before, self.state)
        with self.assertRaises(ConflictError):
            self.flow.set_mapping(self.mapping(), expected_revision=0)
        self.assertEqual(before, self.state)

    def test_material_source_update_revokes_approval_and_revises_draft(self):
        approved = self.approve()
        self.now += timedelta(seconds=1)
        source = self.message(identifier="message-2", updated=self.now, text="Updated customer action.")
        notice = self.flow.ingest(source)
        revised = self.flow.list_drafts()[0]
        self.assertEqual("ready", notice["status"])
        self.assertEqual(approved["id"], revised["id"])
        self.assertGreater(revised["revision"], approved["revision"])
        self.assertNotEqual(approved["sourceHash"], revised["sourceHash"])
        self.assertEqual("message-2", revised["sourceMessageId"])
        self.assertEqual("needs_review", revised["status"])
        self.assertIsNone(revised["approval"])
        with self.assertRaises(ConflictError):
            self.flow.approve(approved["id"], approved["revision"], approved["digest"], self.receipt(approved))

    def test_edit_invalidates_approval_and_revision_prevents_lost_updates(self):
        approved = self.approve()
        for revision in (None, True, float(approved["revision"]), str(approved["revision"])):
            with self.subTest(revision=revision), self.assertRaises(ConflictError):
                self.flow.edit_draft(approved["id"], revision, body="Missing integer revision")
        self.now += timedelta(seconds=1)
        revised = self.flow.edit_draft(approved["id"], approved["revision"], body="Customer-specific verified text.")
        self.assertIsNone(revised["approval"])
        self.assertNotEqual(approved["digest"], revised["digest"])
        self.assertEqual("needs_review", revised["status"])
        with self.assertRaises(ConflictError):
            self.flow.edit_draft(approved["id"], approved["revision"], body="Concurrent overwrite")
        self.assertEqual("Customer-specific verified text.", self.flow.list_drafts()[0]["body"])

    def test_duplicate_or_older_messages_never_regress_latest_source(self):
        draft = self.approve()
        before = copy.deepcopy(self.state)
        self.assertEqual("ignored", self.flow.ingest(self.message())["status"])
        self.assertEqual(before, self.state)
        duplicate = self.message(identifier="duplicate-id")
        self.assertEqual("ignored", self.flow.ingest(duplicate)["status"])
        self.assertEqual(before, self.state)
        old = self.message(identifier="old-message", updated=self.now - timedelta(days=1), text="Old instructions")
        self.assertEqual("ignored", self.flow.ingest(old)["status"])
        self.assertEqual(before, self.state)
        self.assertEqual(draft["sourceHash"], self.flow.list_drafts()[0]["sourceHash"])

    def test_same_timestamp_conflicting_source_text_requires_review(self):
        self.approve()
        conflicting = self.message(identifier="conflicting-message", text="Different instructions")
        notice = self.flow.ingest(conflicting)
        self.assertEqual("needs_review", notice["status"])
        draft = self.flow.list_drafts()[0]
        self.assertEqual("needs_review", draft["status"])
        self.assertIsNone(draft["approval"])
        with self.assertRaises(EvidenceError):
            self.flow.set_environments(notice["id"], [env()], self.evidence())

    def test_newer_unsafe_or_missing_customer_section_invalidates_existing_approval(self):
        self.approve()
        self.now += timedelta(minutes=1)
        broken = self.message(identifier="broken-update", updated=self.now, text="Internal-only instructions")
        self.assertEqual("needs_review", self.flow.ingest(broken)["status"])
        self.assertIsNone(self.flow.list_drafts()[0]["approval"])
        self.assertEqual("needs_review", self.flow.list_drafts()[0]["status"])
        self.assertEqual("needs_review", self.flow.ingest(self.message(identifier="old-replay"))["status"])
        route = self.route(contact="new@customer-a.example")
        self.flow.set_mapping(self.mapping(route))
        self.assertEqual("needs_review", self.flow.list_drafts()[0]["status"])
        self.now += timedelta(minutes=1)
        self.assertEqual("ready", self.flow.ingest(
            self.message(identifier="safe-new-update", updated=self.now)
        )["status"])

    def test_untrusted_or_older_unsafe_message_cannot_regress_trusted_event(self):
        approved = self.approve()
        unsafe = self.message(identifier="unsafe-old", updated=self.now - timedelta(days=1), text="Internal-only.")
        self.flow.ingest(unsafe)
        self.assertEqual("approved", self.flow.list_drafts()[0]["status"])
        unsafe = self.message(identifier="untrusted-new", updated=self.now, text="Internal-only.")
        unsafe["from"]["emailAddress"]["address"] = "attacker@bad.example"
        self.flow.ingest(unsafe)
        self.assertEqual(approved["digest"], self.flow.list_drafts()[0]["digest"])
        self.assertEqual("approved", self.flow.list_drafts()[0]["status"])

    def test_each_payload_and_binding_field_is_digest_protected(self):
        original = self.ready()
        for key, value in (
            ("subject", "A different subject"), ("body", "A different body"),
            ("to", ["other@customer-a.example"]), ("cc", ["other@customer-a.example"]),
            ("senderEmail", "other@staff.example"), ("senderId", OUTSIDER),
            ("tenantId", OUTSIDER), ("sourceHash", "0" * 64), ("mappingRevision", 999),
            ("environmentIds", [env(TENANT_B)]), ("customerId", "other-customer"),
            ("teamId", "other-team"), ("contentVerified", False),
        ):
            with self.subTest(key=key):
                state = copy.deepcopy(self.state)
                state["drafts"][original["id"]][key] = value
                flow = Workflow(state, self.policy, now=self.now)
                with self.assertRaises(ApprovalError):
                    flow.approve(original["id"], original["revision"], original["digest"], self.receipt(original))

    def test_state_source_body_or_mapping_tamper_detected_before_claim(self):
        approved = self.approve()
        for target in ("source_body", "contacts", "contact_evidence", "display_aliases", "event_status"):
            with self.subTest(target=target):
                state = copy.deepcopy(self.state)
                if target == "source_body":
                    state["notices"]["message-1"]["customerText"] = "Mutated source content."
                elif target == "contacts":
                    state["mapping"]["environments"][0]["to"] = ["other@customer-a.example"]
                elif target == "display_aliases":
                    state["notices"]["message-1"]["displayAliases"]["tenantNames"] = ["A different named tenant"]
                elif target == "event_status":
                    state["notices"]["message-1"]["eventStatus"] = "resolved"
                else:
                    state["mapping"]["environments"][0]["contactVerification"]["source"] = "different registry"
                flow = Workflow(state, self.policy, now=self.now)
                with self.assertRaises(ApprovalError):
                    flow.claim(approved["id"], now=self.now, source_hash=self.fresh(approved), sender_id=SENDER)

    def test_either_approver_can_approve_independently(self):
        draft = self.ready()
        for actor in (APPROVER_ONE, APPROVER_TWO):
            with self.subTest(actor=actor):
                state = copy.deepcopy(self.state)
                flow = Workflow(state, self.policy, now=self.now)
                approved = flow.approve(draft["id"], draft["revision"], draft["digest"], self.receipt(draft, actor))
                self.assertEqual("approved", approved["status"])
                self.assertEqual(actor, approved["approval"]["actorId"])
                self.assertEqual([], approved["reviewReasons"])

    def test_email_name_or_actor_strings_cannot_forge_identity(self):
        draft = self.ready()
        receipts = []
        for identity in (
            {"displayName": "Approver Two", "email": "approver-two@staff.example"},
            OUTSIDER, "approver-two@staff.example", {"id": APPROVER_TWO}, "Approver Two", None,
        ):
            receipt = self.receipt(draft)
            receipt["actorId"] = identity
            receipt["actor"] = "Approver Two"
            receipt["fields"] = {"ActorId": APPROVER_TWO, "Approver": "Approver Two"}
            receipts.append(receipt)
        for receipt in receipts:
            with self.subTest(identity=receipt["actorId"]), self.assertRaises(ApprovalError):
                self.flow.approve(draft["id"], draft["revision"], draft["digest"], receipt)
        self.assertEqual("ready_for_approval", self.flow.list_drafts()[0]["status"])

    def test_wrong_provider_site_list_and_immutable_fields_rejected(self):
        draft = self.ready()
        for key, value in (
            ("provider", "email"), ("siteId", "other-site"), ("listId", "other-list"),
            ("draftId", "other-draft"), ("revision", draft["revision"] + 1),
            ("revision", True), ("revision", str(draft["revision"])),
            ("digest", "0" * 64), ("decision", "Reject"),
        ):
            receipt = self.receipt(draft)
            receipt[key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ApprovalError):
                self.flow.approve(draft["id"], draft["revision"], draft["digest"], receipt)

    def test_approval_requires_fresh_graph_timestamp_and_audit_metadata_is_optional(self):
        draft = self.ready()
        for timestamp in (
            self.now - timedelta(seconds=1),
            self.now + timedelta(seconds=1),
        ):
            receipt = self.receipt(draft)
            receipt["approvedAt"] = stamp(timestamp)
            with self.subTest(timestamp=timestamp), self.assertRaises(ApprovalError):
                self.flow.approve(draft["id"], draft["revision"], draft["digest"], receipt)
        audited = self.receipt(draft)
        audited.update(receiptId="synthetic-list-item", eTag='"synthetic-etag"')
        separate = Workflow(copy.deepcopy(self.state), self.policy, now=self.now)
        approved = separate.approve(draft["id"], draft["revision"], draft["digest"], audited)
        self.assertEqual("synthetic-list-item", approved["approval"]["receiptId"])
        self.assertEqual('"synthetic-etag"', approved["approval"]["eTag"])
        self.now += timedelta(hours=3)
        receipt = self.receipt(draft)
        receipt["approvedAt"] = stamp(self.now - timedelta(hours=3))
        with self.assertRaises(ApprovalError):
            self.flow.approve(draft["id"], draft["revision"], draft["digest"], receipt)

    def test_receipt_replay_and_nonlatest_decisions_rejected(self):
        draft = self.ready()
        receipt = self.receipt(draft)
        self.flow.approve(draft["id"], draft["revision"], draft["digest"], receipt)
        with self.assertRaises(ApprovalError):
            self.flow.approve(draft["id"], draft["revision"], draft["digest"], receipt)
        self.now += timedelta(seconds=1)
        rejection = self.receipt(draft, APPROVER_TWO, "Reject")
        rejected = self.flow.reject(draft["id"], draft["revision"], draft["digest"], rejection)
        self.assertEqual("rejected", rejected["status"])
        self.assertIsNone(rejected["approval"])
        with self.assertRaises(ApprovalError):
            self.flow.approve(draft["id"], draft["revision"], draft["digest"], receipt)
        with self.assertRaises(StateError):
            self.claim(rejected)

    def test_demo_provider_requires_explicit_demo_policy(self):
        draft = self.ready()
        receipt = self.receipt(draft)
        receipt["provider"] = "demo"
        with self.assertRaises(ApprovalError):
            self.flow.approve(draft["id"], draft["revision"], draft["digest"], receipt)
        bad_policy = copy.deepcopy(self.policy)
        bad_policy["approvalProvider"]["type"] = "demo"
        with self.assertRaises(ApprovalError):
            Workflow(copy.deepcopy(self.state), bad_policy, now=self.now)
        demo_policy = copy.deepcopy(bad_policy)
        demo_policy["demo"] = True
        demo_flow = Workflow(copy.deepcopy(self.state), demo_policy, now=self.now)
        self.assertEqual("approved", demo_flow.approve(
            draft["id"], draft["revision"], draft["digest"], receipt
        )["status"])
        demo_policy = copy.deepcopy(self.policy)
        demo_policy["demo"] = True
        demo_flow = Workflow(copy.deepcopy(self.state), demo_policy, now=self.now)
        approved = demo_flow.approve(draft["id"], draft["revision"], draft["digest"], receipt)
        self.assertEqual("demo", approved["approval"]["provider"])
        with self.assertRaises(ApprovalError):
            Workflow(demo_flow.state, self.policy, now=self.now).claim(
                draft["id"], now=self.now, source_hash=self.fresh(draft), sender_id=SENDER
            )

    def test_claim_requires_approval_sender_exact_hash_and_fresh_source_check(self):
        draft = self.draft()
        with self.assertRaises(StateError):
            self.claim(draft)
        approved = self.approve(draft)
        for kwargs in (
            {"sender_id": OUTSIDER, "source_hash": self.fresh(approved)},
            {"sender_id": SENDER, "source_hash": "0" * 64},
            {"sender_id": SENDER, "source_hash": None},
            {"sender_id": SENDER, "source_hash": self.fresh(approved, self.now - timedelta(minutes=15))},
            {"sender_id": SENDER, "source_hash": self.fresh(approved, self.now + timedelta(seconds=1))},
            {"sender_id": SENDER, "source_hash": {**self.fresh(approved), "messageId": "other-message"}},
        ):
            with self.subTest(kwargs=kwargs), self.assertRaises(WorkflowError):
                self.flow.claim(approved["id"], now=self.now, **kwargs)
        self.assertEqual("approved", self.flow.list_drafts()[0]["status"])
        attempt = self.claim(approved)
        self.assertEqual("dispatching", self.flow.list_drafts()[0]["status"])
        self.assertEqual(approved["digest"], attempt["digest"])
        for key in ("to", "cc", "subject", "body", "senderEmail", "senderId", "tenantId"):
            self.assertEqual(approved[key], attempt["payload"][key])

    def test_plain_source_hash_uses_bound_evidence_freshness(self):
        approved = self.approve()
        self.now += timedelta(minutes=15)
        with self.assertRaises(EvidenceError):
            self.flow.claim(approved["id"], now=self.now, source_hash=approved["sourceHash"], sender_id=SENDER)
        self.assertEqual(approved["digest"], self.claim(approved)["digest"])

    def test_plain_hash_can_claim_with_fresh_bound_source_evidence(self):
        approved = self.approve()
        attempt = self.flow.claim(approved["id"], now=self.now,
                                  source_hash=approved["sourceHash"], sender_id=SENDER)
        self.assertEqual(approved["digest"], attempt["digest"])

    def test_claim_rechecks_expired_mapping_and_contact_evidence(self):
        for field in ("verification", "contactVerification"):
            with self.subTest(field=field):
                state = empty_state()
                flow = Workflow(state, self.policy, now=lambda: self.now)
                route = self.route()
                route[field]["expiresAt"] = stamp(self.now + timedelta(minutes=1))
                flow.set_mapping(self.mapping(route))
                flow.ingest(self.message())
                draft = flow.list_drafts()[0]
                draft = flow.mark_ready(draft["id"], draft["revision"])
                flow.approve(draft["id"], draft["revision"], draft["digest"], self.receipt(draft))
                current = self.now + timedelta(minutes=1)
                with self.assertRaises(EvidenceError):
                    flow.claim(draft["id"], now=current, source_hash=self.fresh(draft, current), sender_id=SENDER)
                self.assertEqual("approved", flow.list_drafts()[0]["status"])

    def test_shortened_approval_lifetime_policy_applies_at_claim(self):
        approved = self.approve()
        self.now += timedelta(minutes=30)
        policy = copy.deepcopy(self.policy)
        policy["approvalLifetimeHours"] = 0.25
        other = Workflow(self.state, policy, now=lambda: self.now)
        with self.assertRaises(ApprovalError):
            other.claim(approved["id"], now=self.now, source_hash=self.fresh(approved), sender_id=SENDER)

    def test_invalidated_scope_never_reuses_an_approval(self):
        draft = self.approve()
        self.now += timedelta(seconds=1)
        notice = self.flow.set_environments("message-1", [env()], self.evidence("new-complete-scope-evidence"))
        revised = self.flow.list_drafts()[0]
        self.assertEqual("ready", notice["status"])
        self.assertIsNone(revised["approval"])
        self.assertNotEqual(draft["digest"], revised["digest"])
        self.assertGreater(revised["revision"], draft["revision"])
        with self.assertRaises(StateError):
            self.claim(revised)

    def test_explicit_host_scope_change_invalidates_duplicate_source_approval(self):
        second = self.route(SUBSCRIPTION_A, "subscription", contact="ops@customer-a.example")
        draft = self.draft(mapping=self.mapping(self.route(), second))
        self.approve(draft)
        notice = self.flow.ingest(self.message(), environment_ids=[env(), env(SUBSCRIPTION_A, "subscription")])
        revised = self.flow.list_drafts()[0]
        self.assertEqual("ready", notice["status"])
        self.assertEqual(2, len(revised["environmentIds"]))
        self.assertIsNone(revised["approval"])
        self.assertNotEqual(draft["digest"], revised["digest"])

    def test_expired_approval_or_removed_approver_blocks_claim(self):
        approved = self.approve()
        self.now += timedelta(hours=2)
        with self.assertRaises(ApprovalError):
            self.claim(approved)
        self.now -= timedelta(hours=2)
        policy = copy.deepcopy(self.policy)
        policy["approverIds"] = [APPROVER_TWO]
        other = Workflow(self.state, policy, now=self.now)
        with self.assertRaises(ApprovalError):
            other.claim(approved["id"], now=self.now, source_hash=self.fresh(approved), sender_id=SENDER)

    def test_sender_or_provider_policy_change_blocks_claim(self):
        approved = self.approve()
        for kind in ("sender", "provider"):
            with self.subTest(kind=kind):
                policy = copy.deepcopy(self.policy)
                if kind == "sender":
                    policy["senderEmail"] = "other@staff.example"
                else:
                    policy["approvalProvider"]["listId"] = "different-list"
                other = Workflow(copy.deepcopy(self.state), policy, now=self.now)
                with self.assertRaises(ApprovalError):
                    other.claim(approved["id"], now=self.now, source_hash=self.fresh(approved), sender_id=SENDER)

    def test_second_claim_edit_or_mapping_change_forbidden_during_dispatch(self):
        approved = self.approve()
        attempt = self.claim(approved)
        with self.assertRaises(StateError):
            self.claim(approved)
        with self.assertRaises(StateError):
            self.flow.edit_draft(approved["id"], approved["revision"], body="Changed while dispatching")
        with self.assertRaises(StateError):
            self.flow.set_mapping(self.mapping(self.route(contact="new@customer-a.example")))
        with self.assertRaises(StateError):
            self.flow.ingest(self.message(identifier="new-after-claim", updated=self.now))
        cloned = Workflow(copy.deepcopy(self.state), self.policy, now=self.now)
        with self.assertRaises(StateError):
            cloned.claim(approved["id"], now=self.now, source_hash=self.fresh(approved), sender_id=SENDER)
        self.assertEqual(attempt["attemptId"], cloned.list_drafts()[0]["attempt"]["attemptId"])

    def test_finish_unknown_delivery_never_retries(self):
        approved = self.approve()
        attempt = self.claim(approved)
        finished = self.flow.finish(approved["id"], attempt["attemptId"], "uncertain")
        self.assertEqual("delivery_unknown", finished["status"])
        with self.assertRaises(StateError):
            self.claim(finished)
        with self.assertRaises(StateError):
            self.flow.finish(approved["id"], attempt["attemptId"], "sent", "pretend-id")
        self.now += timedelta(minutes=1)
        with self.assertRaises(StateError):
            self.flow.ingest(self.message(identifier="new-after-unknown", updated=self.now))
        self.flow.set_mapping(self.mapping(self.route(contact="new@customer-a.example")))
        self.assertEqual("delivery_unknown", self.flow.list_drafts()[0]["status"])
        with self.assertRaises(StateError):
            self.claim(self.flow.list_drafts()[0])

    def test_finish_sent_requires_actual_id_and_exact_attempt(self):
        approved = self.approve()
        attempt = self.claim(approved)
        with self.assertRaises(StateError):
            self.flow.finish(approved["id"], "wrong-attempt", "submitted")
        with self.assertRaises(StateError):
            self.flow.finish(approved["id"], attempt["attemptId"], "sent")
        with self.assertRaises(StateError):
            self.flow.finish(approved["id"], attempt["attemptId"], "unrecognized")
        result = self.flow.finish(approved["id"], attempt["attemptId"], "sent", "synthetic-transport-message")
        self.assertEqual("sent", result["status"])
        self.assertEqual("synthetic-transport-message", result["attempt"]["messageId"])
        with self.assertRaises(StateError):
            self.claim(result)
        self.flow.set_mapping(self.mapping(self.route(contact="new@customer-a.example")))
        self.assertEqual("sent", self.flow.list_drafts()[0]["status"])

    def test_reconcile_claimed_submitted_or_unknown_attempt_as_authenticated_sent(self):
        approved = self.approve()
        attempt = self.claim(approved)
        for outcome, source_status in (
            (None, "dispatching"), ("submitted", "submitted"), ("uncertain", "delivery_unknown"),
        ):
            with self.subTest(status=source_status):
                state = copy.deepcopy(self.state)
                flow = Workflow(state, self.policy, now=self.now)
                if outcome:
                    flow.finish(approved["id"], attempt["attemptId"], outcome)
                revision = state["dataRevision"]
                original = copy.deepcopy(flow.list_drafts()[0]["attempt"])
                sent = flow.reconcile(approved["id"], attempt["attemptId"], "synthetic-authenticated-sent-id")
                self.assertEqual("sent", sent["status"])
                self.assertEqual("sent", sent["attempt"]["outcome"])
                self.assertEqual("synthetic-authenticated-sent-id", sent["attempt"]["messageId"])
                self.assertEqual(original["attemptId"], sent["attempt"]["attemptId"])
                self.assertEqual(original["payload"], sent["attempt"]["payload"])
                self.assertEqual(original["digest"], sent["attempt"]["digest"])
                self.assertEqual([], sent["previousAttempts"])
                self.assertEqual(source_status, sent["attempt"]["reconciliation"]["previousStatus"])
                self.assertEqual(original["outcome"], sent["attempt"]["reconciliation"]["previousOutcome"])
                self.assertEqual(revision + 1, state["dataRevision"])
                with self.assertRaises(StateError):
                    flow.claim(approved["id"], now=self.now, source_hash=self.fresh(approved), sender_id=SENDER)

    def test_reconcile_same_sent_receipt_is_idempotent_after_restart(self):
        approved = self.approve()
        attempt = self.claim(approved)
        self.flow.finish(approved["id"], attempt["attemptId"], "uncertain")
        self.now += timedelta(hours=48)
        sent = self.flow.reconcile(approved["id"], attempt["attemptId"], "synthetic-sent-receipt")
        restart_state = json.loads(json.dumps(self.state))
        restarted = Workflow(restart_state, self.policy, now=self.now)
        before = copy.deepcopy(restart_state)
        repeated = restarted.reconcile(approved["id"], attempt["attemptId"], "synthetic-sent-receipt")
        self.assertEqual(sent, repeated)
        self.assertEqual(before, restart_state)
        repeated["attempt"]["payload"]["body"] = "Mutated return copy"
        self.assertEqual(before, restart_state)

    def test_reconcile_existing_finish_sent_receipt_is_also_idempotent(self):
        approved = self.approve()
        attempt = self.claim(approved)
        finished = self.flow.finish(approved["id"], attempt["attemptId"], "sent", "synthetic-sent-receipt")
        before = copy.deepcopy(self.state)
        self.assertEqual(
            finished,
            self.flow.reconcile(approved["id"], attempt["attemptId"], "synthetic-sent-receipt"),
        )
        self.assertEqual(before, self.state)

    def test_reconcile_requires_exact_attempt_and_nonempty_actual_message_id(self):
        approved = self.approve()
        attempt = self.claim(approved)
        for attempt_id, message_id in (
            ("wrong-attempt", "synthetic-sent-id"), (None, "synthetic-sent-id"),
            (attempt["attemptId"], None), (attempt["attemptId"], ""),
            (attempt["attemptId"], "  "), (attempt["attemptId"], 123),
            (attempt["attemptId"], True), (attempt["attemptId"], "message\r\nInjected"),
        ):
            with self.subTest(attempt_id=attempt_id, message_id=message_id):
                before = copy.deepcopy(self.state)
                with self.assertRaises(StateError):
                    self.flow.reconcile(approved["id"], attempt_id, message_id)
                self.assertEqual(before, self.state)
        with self.assertRaises(StateError):
            self.flow.reconcile("unknown-draft", attempt["attemptId"], "synthetic-sent-id")

    def test_reconcile_rejects_conflicting_recorded_message_ids(self):
        approved = self.approve()
        attempt = self.claim(approved)
        for outcome in ("submitted", "uncertain", "sent"):
            with self.subTest(outcome=outcome):
                state = copy.deepcopy(self.state)
                flow = Workflow(state, self.policy, now=self.now)
                flow.finish(approved["id"], attempt["attemptId"], outcome, "original-recorded-message-id")
                before = copy.deepcopy(state)
                with self.assertRaisesRegex(StateError, "conflicts"):
                    flow.reconcile(approved["id"], attempt["attemptId"], "different-receipt-message-id")
                self.assertEqual(before, state)
                sent = flow.reconcile(approved["id"], attempt["attemptId"], "original-recorded-message-id")
                self.assertEqual("sent", sent["status"])

    def test_reconcile_never_creates_attempt_or_overrides_definitive_transport_rejection(self):
        draft = self.draft()
        before = copy.deepcopy(self.state)
        with self.assertRaises(StateError):
            self.flow.reconcile(draft["id"], "invented-attempt", "synthetic-message-id")
        self.assertEqual(before, self.state)
        approved = self.approve(draft)
        attempt = self.claim(approved)
        self.flow.finish(approved["id"], attempt["attemptId"], "rejected")
        before = copy.deepcopy(self.state)
        with self.assertRaises(StateError):
            self.flow.reconcile(approved["id"], attempt["attemptId"], "synthetic-message-id")
        self.assertEqual(before, self.state)
        self.assertEqual("delivery_rejected", self.flow.list_drafts()[0]["status"])

    def test_reconcile_old_attempt_cannot_mark_new_material_revision_sent(self):
        approved = self.approve()
        old_attempt = self.claim(approved)
        self.flow.reconcile(approved["id"], old_attempt["attemptId"], "old-authenticated-message-id")
        self.now += timedelta(minutes=1)
        self.flow.ingest(self.message(identifier="new-material-notice", updated=self.now, text="New required action."))
        current = self.flow.list_drafts()[0]
        before = copy.deepcopy(self.state)
        with self.assertRaises(StateError):
            self.flow.reconcile(current["id"], old_attempt["attemptId"], "old-authenticated-message-id")
        self.assertEqual(before, self.state)
        approved_new = self.approve(current)
        new_attempt = self.claim(approved_new)
        self.assertNotEqual(old_attempt["attemptId"], new_attempt["attemptId"])
        with self.assertRaises(StateError):
            self.flow.reconcile(current["id"], old_attempt["attemptId"], "old-authenticated-message-id")
        self.assertEqual("dispatching", self.flow.list_drafts()[0]["status"])

    def test_submitted_does_not_claim_delivery_and_transport_rejection_is_terminal(self):
        for outcome, status in (("submitted", "submitted"), ("rejected", "delivery_rejected")):
            with self.subTest(outcome=outcome):
                state = empty_state()
                flow = Workflow(state, self.policy, now=self.now)
                flow.set_mapping(self.mapping())
                flow.ingest(self.message())
                draft = flow.list_drafts()[0]
                draft = flow.mark_ready(draft["id"], draft["revision"])
                approved = flow.approve(draft["id"], draft["revision"], draft["digest"], self.receipt(draft))
                attempt = flow.claim(approved["id"], now=self.now, source_hash=self.fresh(approved), sender_id=SENDER)
                result = flow.finish(draft["id"], attempt["attemptId"], outcome)
                self.assertEqual(status, result["status"])
                self.assertIsNone(result["attempt"]["messageId"])
                with self.assertRaises(StateError):
                    flow.claim(draft["id"], now=self.now, source_hash=self.fresh(approved), sender_id=SENDER)

    def test_new_material_source_after_sent_retains_history_and_requires_new_approval(self):
        approved = self.approve()
        attempt = self.claim(approved)
        self.flow.finish(approved["id"], attempt["attemptId"], "sent", "synthetic-sent-id")
        self.now += timedelta(minutes=1)
        self.flow.ingest(self.message(identifier="next-source", updated=self.now, text="New customer action."))
        revised = self.flow.list_drafts()[0]
        self.assertEqual("needs_review", revised["status"])
        self.assertIsNone(revised["attempt"])
        self.assertEqual(attempt["attemptId"], revised["previousAttempts"][0]["attemptId"])
        self.assertGreater(revised["revision"], approved["revision"])
        with self.assertRaises(StateError):
            self.claim(revised)

    def test_data_revision_increments_once_for_each_successful_mutation(self):
        draft = self.draft()
        self.assertEqual(2, self.state["dataRevision"])
        self.approve(draft)
        self.assertEqual(4, self.state["dataRevision"])
        attempt = self.claim(draft)
        self.assertEqual(5, self.state["dataRevision"])
        self.flow.finish(draft["id"], attempt["attemptId"], "uncertain")
        self.assertEqual(6, self.state["dataRevision"])

    def test_invalid_policy_cannot_enable_demo_or_missing_trust(self):
        for change in (
            {"approverIds": []}, {"trustedAlertSenders": []},
            {"senderId": "Approver One"}, {"approvalProvider": None},
            {"maxSourceAgeMinutes": 0}, {"approvalLifetimeHours": float("nan")},
        ):
            with self.subTest(change=change), self.assertRaises(WorkflowError):
                Workflow(empty_state(), {**self.policy, **change}, now=self.now)

    def test_future_or_timezone_missing_source_timestamps_require_review(self):
        for updated in (self.now + timedelta(minutes=1),):
            with self.assertRaises(EvidenceError):
                self.flow.parse_notice(self.message(updated=updated))
        message = self.message()
        message["receivedDateTime"] = "2026-10-15T12:00:00"
        with self.assertRaises(EvidenceError):
            self.flow.parse_notice(message)


if __name__ == "__main__":
    unittest.main()
