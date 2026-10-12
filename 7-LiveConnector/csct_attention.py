"""Local-only follow-up preferences. No mailbox content or outbound notifications."""
import json
import os
import re
import threading
from datetime import datetime, timedelta, timezone

DEFAULT_RULES = {
    "urgentHours": 1, "importantHours": 2, "standardHours": 4,
    "lowHours": 8, "ownerHours": 2, "pgHours": 8,
}
PRIORITIES = ("Standard", "Important", "Critical")


class AttentionConflict(ValueError):
    pass


def validate_marker(value, snooze=False, incoming=True):
    keys = {"signature", "level", "until"} if snooze else {"signature", "level"}
    if not isinstance(value, dict) or set(value) != keys:
        raise ValueError("Invalid follow-up marker")
    if not isinstance(value["signature"], str) or not re.fullmatch(
            r"[a-z0-9:|T.Z+\-]{1,800}", value["signature"]):
        raise ValueError("Invalid follow-up episode")
    if type(value["level"]) is not int or value["level"] not in (1, 2):
        raise ValueError("Invalid follow-up urgency")
    if snooze:
        try:
            until = datetime.fromisoformat(value["until"].replace("Z", "+00:00"))
        except (ValueError, TypeError, AttributeError) as err:
            raise ValueError("Invalid snooze time") from err
        if until.tzinfo is None:
            raise ValueError("Snooze time needs a time zone")
        # Only new input is held to the limit: a stored value must stay readable if the system clock later steps back.
        if incoming and until > datetime.now(timezone.utc) + timedelta(days=8):
            raise ValueError("Snooze is limited to eight days")


def validate_manual(value, incoming=True):
    if not isinstance(value, dict) or set(value) != {"state", "at"}:
        raise ValueError("Invalid case state")
    if value["state"] not in ("closed", "open"):
        raise ValueError("Unknown case state")
    stamp = value["at"]
    if not isinstance(stamp, str) or len(stamp) > 40:
        raise ValueError("Invalid case state time")
    try:
        at = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    except ValueError as err:
        raise ValueError("Invalid case state time") from err
    if at.tzinfo is None:
        raise ValueError("Case state time needs a time zone")
    if incoming and at > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise ValueError("Case state time is in the future")
    if at < datetime(2020, 1, 1, tzinfo=timezone.utc):
        raise ValueError("Case state time is too old")


class AttentionStore:
    def __init__(self, folder):
        self.path = os.path.join(folder, "attention-state.json")
        self.lock = threading.Lock()

    def _read(self):
        if not os.path.exists(self.path):
            return {"revision": 0, "rules": dict(DEFAULT_RULES), "cases": {}}
        with open(self.path, encoding="utf-8") as f:
            try:
                state = json.load(f)
            except ValueError as err:
                raise ValueError("Follow-up preferences are damaged; restore attention-state.json") from err
        if (not isinstance(state, dict) or type(state.get("revision")) is not int or state["revision"] < 0
                or not isinstance(state.get("cases"), dict)
                or not isinstance(state.get("rules"), dict) or set(state["rules"]) != set(DEFAULT_RULES)):
            raise ValueError("Follow-up preferences are damaged; restore attention-state.json")
        self._validate_rules(state["rules"])
        for case_id, record in state["cases"].items():
            self._validate_record(case_id, record, incoming=False)
        return state

    @staticmethod
    def _validate_rules(rules):
        if not isinstance(rules, dict) or set(rules) != set(DEFAULT_RULES):
            raise ValueError("Provide all six follow-up thresholds")
        for value in rules.values():
            if type(value) not in (int, float) or not 0.5 <= value <= 48:
                raise ValueError("Follow-up thresholds must be between 0.5 and 48 hours")

    @staticmethod
    def _validate_record(case_id, record, incoming=True):
        if not isinstance(case_id, str) or not re.fullmatch(r"\d{16}", case_id):
            raise ValueError("A sixteen-digit case number is required")
        if not isinstance(record, dict) or set(record) - {"priority", "reviewed", "snooze", "manual"}:
            raise ValueError("Invalid follow-up preferences")
        if "priority" in record and record["priority"] not in PRIORITIES:
            raise ValueError("Unknown follow-up importance")
        if "reviewed" in record:
            validate_marker(record["reviewed"])
        if "snooze" in record:
            validate_marker(record["snooze"], snooze=True, incoming=incoming)
        if "manual" in record:
            validate_manual(record["manual"], incoming=incoming)

    def read(self):
        with self.lock:
            return self._read()

    def manual_states(self):
        return {case_id: dict(record["manual"]) for case_id, record in self.read()["cases"].items() if "manual" in record}

    def update(self, body):
        if not isinstance(body, dict) or type(body.get("revision")) is not int:
            raise ValueError("A follow-up revision is required")
        if set(body) - {"revision", "caseId", "record", "rules"}:
            raise ValueError("Unknown follow-up fields")
        if ("rules" in body) == ("caseId" in body):
            raise ValueError("Update either the thresholds or one case")
        if "rules" in body:
            if "record" in body:
                raise ValueError("Case preferences are not valid with thresholds")
            self._validate_rules(body["rules"])
        else:
            self._validate_record(body["caseId"], body.get("record"))
        with self.lock:
            state = self._read()
            if state["revision"] != body["revision"]:
                raise AttentionConflict("Preferences changed in another tab. Reload and try again.")
            if "rules" in body:
                state["rules"] = body["rules"]
            elif body["record"]:
                if len(state["cases"]) >= 2000 and body["caseId"] not in state["cases"]:
                    raise ValueError("Follow-up preferences have reached the 2000-case limit")
                state["cases"][body["caseId"]] = body["record"]
            else:
                state["cases"].pop(body["caseId"], None)
            state["revision"] += 1
            folder = os.path.dirname(self.path)
            os.makedirs(folder, exist_ok=True)
            tmp = self.path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(state, f, indent=2, allow_nan=False)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, self.path)
            return state
