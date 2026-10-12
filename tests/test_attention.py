"""Targeted standard-library checks for local follow-up preferences and HTTP routes."""
import importlib.util
import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import ThreadingHTTPServer

CONNECTOR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "7-LiveConnector")
import sys
sys.path.insert(0, CONNECTOR)
from csct_attention import AttentionConflict, AttentionStore, DEFAULT_RULES
import csct_live

CASE = "2610100000000001"
MARKER = {"signature": "reply:2026-10-09T07:00:00.000Z", "level": 1}


class PreferencesTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = AttentionStore(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_persistence_and_no_mail_content(self):
        state = self.store.update({"revision": 0, "caseId": CASE,
                                   "record": {"priority": "Important", "reviewed": MARKER}})
        self.assertEqual(AttentionStore(self.tmp.name).read(), state)
        self.assertEqual(state["revision"], 1)
        self.assertEqual(set(state["cases"][CASE]), {"priority", "reviewed"})
        self.assertFalse(os.path.exists(self.store.path + ".tmp"))

    def test_conflicting_tabs(self):
        self.store.update({"revision": 0, "caseId": CASE, "record": {}})
        with self.assertRaises(AttentionConflict):
            self.store.update({"revision": 0, "caseId": CASE, "record": {}})

    def test_strict_validation(self):
        bad = [
            {"revision": True, "caseId": CASE, "record": {}},
            {"revision": 0, "caseId": "../../other", "record": {}},
            {"revision": 0, "caseId": CASE, "record": {"mail": "private"}},
            {"revision": 0, "caseId": CASE, "record": {"priority": "Unknown"}},
            {"revision": 0, "rules": {"standardHours": 4}},
            {"revision": 0, "rules": dict(DEFAULT_RULES, standardHours=float("nan"))},
            {"revision": 0, "rules": dict(DEFAULT_RULES, standardHours=True)},
            {"revision": 0, "rules": dict(DEFAULT_RULES, standardHours=10**400)},
            {"revision": 0, "rules": dict(DEFAULT_RULES, standardHours=float("inf"))},
            {"revision": 0, "caseId": CASE, "record": {}, "rules": DEFAULT_RULES},
            {"revision": 0, "caseId": CASE, "record": {"reviewed": dict(MARKER, level=True)}},
            {"revision": 0, "caseId": CASE, "record": {"snooze": dict(MARKER, until="bad")}},
            {"revision": 0, "caseId": CASE, "record": {"snooze": dict(MARKER, until="2026-10-12T10:00:00")}},
        ]
        for body in bad:
            with self.subTest(body=body), self.assertRaises(ValueError):
                self.store.update(body)
        self.assertEqual(self.store.read()["revision"], 0)

    def test_manual_case_state_round_trip(self):
        at = datetime.now(timezone.utc).isoformat()
        state = self.store.update({"revision": 0, "caseId": CASE, "record": {"priority": "Important", "manual": {"state": "closed", "at": at}}})
        self.assertEqual(self.store.manual_states(), {CASE: {"state": "closed", "at": at}})
        self.assertEqual(AttentionStore(self.tmp.name).read(), state)
        state = self.store.update({"revision": state["revision"], "caseId": CASE, "record": {"priority": "Important"}})
        self.assertEqual(self.store.manual_states(), {})
        self.assertEqual(state["cases"][CASE], {"priority": "Important"})

    def test_empty_record_removes_the_case_entry(self):
        at = datetime.now(timezone.utc).isoformat()
        state = self.store.update({"revision": 0, "caseId": CASE, "record": {"manual": {"state": "open", "at": at}}})
        self.assertIn(CASE, state["cases"])
        state = self.store.update({"revision": state["revision"], "caseId": CASE, "record": {}})
        self.assertNotIn(CASE, state["cases"])
        self.assertEqual(state["revision"], 2)

    def test_future_timestamps_in_a_stored_file_do_not_make_it_unreadable(self):
        now = datetime.now(timezone.utc)
        os.makedirs(os.path.dirname(self.store.path), exist_ok=True)
        stored = {"revision": 3, "rules": dict(DEFAULT_RULES), "cases": {CASE: {
            "manual": {"state": "closed", "at": (now + timedelta(minutes=20)).isoformat()},
            "snooze": dict(MARKER, until=(now + timedelta(days=9)).isoformat())}}}
        with open(self.store.path, "w", encoding="utf-8") as f:
            json.dump(stored, f)
        self.assertEqual(self.store.read()["revision"], 3)
        self.assertEqual(self.store.manual_states()[CASE]["state"], "closed")
        other = "2610100000000002"
        self.store.update({"revision": 3, "caseId": other, "record": {"priority": "Important"}})
        for record in ({"manual": {"state": "open", "at": (now + timedelta(minutes=20)).isoformat()}},
                       {"snooze": dict(MARKER, until=(now + timedelta(days=9)).isoformat())}):
            with self.subTest(record=record), self.assertRaises(ValueError):
                self.store.update({"revision": 4, "caseId": other, "record": record})

    def test_manual_case_state_validation(self):
        now = datetime.now(timezone.utc)
        good = now.isoformat()
        bad = [
            "closed", {"state": "closed"}, {"at": good}, {"state": "closed", "at": good, "note": "x"},
            {"state": "resolved", "at": good}, {"state": True, "at": good}, {"state": "closed", "at": 5},
            {"state": "closed", "at": "bad"}, {"state": "closed", "at": now.replace(tzinfo=None).isoformat()},
            {"state": "closed", "at": (now + timedelta(minutes=6)).isoformat()},
            {"state": "closed", "at": "2019-12-31T23:59:59+00:00"}, {"state": "closed", "at": "2" * 41},
        ]
        for manual in bad:
            with self.subTest(manual=manual), self.assertRaises(ValueError):
                self.store.update({"revision": 0, "caseId": CASE, "record": {"manual": manual}})
        self.assertEqual(self.store.read()["revision"], 0)
        for accepted in (good, now.strftime("%Y-%m-%dT%H:%M:%S.000Z"), (now + timedelta(minutes=4)).isoformat()):
            self.store.update({"revision": self.store.read()["revision"], "caseId": CASE,
                               "record": {"manual": {"state": "open", "at": accepted}}})

    def test_snooze_and_thresholds(self):
        until = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        state = self.store.update({"revision": 0, "caseId": CASE,
                                  "record": {"snooze": dict(MARKER, until=until)}})
        rules = dict(DEFAULT_RULES, standardHours=6)
        state = self.store.update({"revision": state["revision"], "rules": rules})
        self.assertEqual(state["rules"]["standardHours"], 6)
        self.assertIn("snooze", state["cases"][CASE])

    def test_corruption_is_not_silently_replaced(self):
        os.makedirs(os.path.dirname(self.store.path), exist_ok=True)
        for body in ("broken", '{"revision":0,"rules":null,"cases":{}}'):
            with open(self.store.path, "w", encoding="utf-8") as f:
                f.write(body)
            with self.assertRaises(ValueError):
                self.store.read()
            with open(self.store.path, encoding="utf-8") as f:
                self.assertEqual(f.read(), body)


class RouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.previous = csct_live.ATTENTION
        csct_live.ATTENTION = AttentionStore(cls.tmp.name)
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), csct_live.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = "http://127.0.0.1:%d" % cls.server.server_port

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        csct_live.ATTENTION = cls.previous
        cls.tmp.cleanup()

    def request(self, body=None, headers=None):
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(self.base + "/api/attention", data=data, headers=headers or {})
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as err:
            return err.code, json.load(err)

    def test_routes(self):
        code, initial = self.request()
        self.assertEqual(code, 200)
        body = {"revision": initial["revision"], "caseId": CASE, "record": {"priority": "Important"}}
        self.assertEqual(self.request(body)[0], 403)
        self.assertEqual(self.request(body, {"Origin": "https://other.example", "X-CSCT": "attention"})[0], 403)
        headers = {"Origin": self.base, "X-CSCT": "attention", "Content-Type": "application/json"}
        code, saved = self.request(body, headers)
        self.assertEqual(code, 200)
        self.assertEqual(saved["cases"][CASE]["priority"], "Important")
        self.assertEqual(self.request(body, headers)[0], 409)
        self.assertEqual(self.request({"revision": saved["revision"], "caseId": "wrong", "record": {}}, headers)[0], 400)
        self.assertEqual(self.request({"revision": saved["revision"], "caseId": CASE, "record": {"mail": "not allowed"}}, headers)[0], 400)
        huge = {"revision": saved["revision"], "rules": dict(DEFAULT_RULES, standardHours=10**400)}
        self.assertEqual(self.request(huge, headers)[0], 400)
        stamp = datetime.now(timezone.utc).isoformat()
        manual = {"revision": saved["revision"], "caseId": CASE, "record": {"manual": {"state": "closed", "at": stamp}}}
        code, closed = self.request(manual, headers)
        self.assertEqual(code, 200)
        self.assertEqual(closed["cases"][CASE]["manual"], {"state": "closed", "at": stamp})
        self.assertEqual(self.request({"revision": closed["revision"], "caseId": CASE,
                                       "record": {"manual": {"state": "closed", "at": "2099-01-01T00:00:00Z"}}}, headers)[0], 400)


if __name__ == "__main__":
    unittest.main()
