"""Explicit deployment gates; missing settings never enable a sender."""

import copy
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from advisory_m365 import EMAIL, GUID


class PolicyError(ValueError):
    pass


def load_policy(path, demo=False):
    with Path(path).open(encoding="utf-8-sig") as stream:
        policy = json.load(stream)
    if not isinstance(policy, dict) or policy.get("version") != 1:
        raise PolicyError("Unsupported Advisory policy format.")
    for key in ("demo", "publishEnabled", "liveEnabled", "outboundConsentRecorded"):
        if type(policy.get(key)) is not bool:
            raise PolicyError("Explicit Boolean deployment setting required: " + key)
    if not isinstance(policy.get("senderEmail"), str) or not EMAIL.fullmatch(policy["senderEmail"]):
        raise PolicyError("A valid exact sender address is required.")
    if not GUID.fullmatch(str(policy.get("senderId", ""))) or not GUID.fullmatch(str(policy.get("tenantId", ""))):
        raise PolicyError("Verified sender and tenant identities are required.")
    actors = policy.get("approverIds")
    if not isinstance(actors, list) or not actors or any(not GUID.fullmatch(str(actor)) for actor in actors):
        raise PolicyError("Verified Entra approver object IDs are required.")
    if len(actors) != len(set(actors)):
        raise PolicyError("Duplicate approval identities are not permitted.")
    if type(policy.get("port")) is not int or not 1024 <= policy["port"] <= 65535:
        raise PolicyError("A valid private listener port is required.")
    for key, maximum in (("maxSourceAgeMinutes", 60), ("approvalLifetimeHours", 72)):
        value = policy.get(key)
        if type(value) not in (int, float) or not 0 < value <= maximum:
            raise PolicyError("Invalid freshness bound: " + key)
    ages = policy.get("maxEvidenceAgeHours")
    if not isinstance(ages, dict) or set(ages) != {"mapping", "contact"}:
        raise PolicyError("Separate mapping/contact freshness bounds are required.")
    if any(type(age) not in (int, float) or not 0 < age <= 8760 for age in ages.values()):
        raise PolicyError("Invalid mapping/contact freshness bound.")
    provider = policy.get("approvalProvider")
    if not isinstance(provider, dict):
        raise PolicyError("Approval provider settings are required.")
    for key in ("restrictedAccessConfirmed", "privacyReviewConfirmed"):
        if type(provider.get(key)) is not bool:
            raise PolicyError("Explicit deployment review required: " + key)
    forwarders = policy.get("trustedForwarders")
    if not isinstance(forwarders, list) or any(not EMAIL.fullmatch(str(value)) for value in forwarders):
        raise PolicyError("Invalid trusted internal forwarders.")
    sources = policy.get("trustedAlertSenders")
    if not isinstance(sources, list) or not sources or any(not EMAIL.fullmatch(str(value)) for value in sources):
        raise PolicyError("Explicit trusted Advisory sender addresses are required.")
    policy = copy.deepcopy(policy)
    policy["trustedInternalForwarders"] = list(forwarders)
    if demo:
        policy.update(
            demo=True, publishEnabled=False, liveEnabled=False, outboundConsentRecorded=False,
            senderId="11111111-1111-4111-8111-111111111111",
            senderEmail="demo-owner@example.com",
            approverIds=["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
            tenantId="33333333-3333-4333-8333-333333333333",
            trustedForwarders=[],
            trustedInternalForwarders=[],
            trustedAlertSenders=["advisoryalerts@example.com"],
        )
        policy["approvalProvider"] = {"siteId": "demo", "listId": "demo"}
    elif policy["demo"]:
        raise PolicyError("Use the explicit --demo switch; demo must not be enabled by editing live policy.")
    if policy["liveEnabled"] and deployment_blockers(policy):
        raise PolicyError("Live sending requested before all deployment gates are satisfied.")
    return policy


def workflow_policy(policy):
    prepared = copy.deepcopy(policy)
    provider = prepared["approvalProvider"]
    if not provider.get("siteId") or not provider.get("listId"):
        if prepared["publishEnabled"] or prepared["liveEnabled"]:
            raise PolicyError("A real approval provider is required before enabling publication.")
        # Preparation can run without a deployed list; no provider can issue this receipt.
        provider.update(siteId="unconfigured", listId="unconfigured")
    return prepared


def deployment_blockers(policy):
    if policy.get("demo"):
        return ["Fictional demo: real Microsoft 365 approval and customer sending are not active."]
    provider = policy["approvalProvider"]
    reasons = []
    if not provider.get("siteId") or not provider.get("listId"):
        reasons.append("The site/list identifiers for the access-restricted Microsoft Lists approval item are not configured.")
    if not provider.get("restrictedAccessConfirmed"):
        reasons.append("It has not yet been verified that only authorized people can access the list.")
    if not provider.get("privacyReviewConfirmed"):
        reasons.append("The corporate confidentiality, classification and customer-text sharing review has not been completed.")
    if not policy.get("publishEnabled"):
        reasons.append("Publishing drafts for approval is turned off.")
    if not policy.get("outboundConsentRecorded"):
        reasons.append("Activation consent for real customer sending after approval has not been recorded.")
    return reasons


def in_sending_hours(now=None):
    now = now or datetime.now(timezone.utc)
    local = now.astimezone(timezone(timedelta(hours=3)))
    return local.weekday() < 5 and 9 <= local.hour < 18
