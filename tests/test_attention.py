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
            {"revision": 0, "rules": dict(DEFAULT_RULES, standardHours=10**400)},
            {"revision": 0, "rules": dict(DEFAULT_RULES, standardHours=True)},
            {"revision": 0, "caseId": CASE, "record": {}, "rules": DEFAULT_RULES},
            {"revision": 0, "caseId": CASE, "record": {"reviewed": dict(MARKER, level=True)}},
            {"revision": 0, "caseId": CASE, "record": {"snooze": dict(MARKER, until="bad")}},
            {"revision": 0, "caseId": CASE, "record": {"snooze": dict(MARKER, until="2026-10-12T10:00:00")}},
        ]
        for body in bad:
            with self.subTest(body=body), self.assertRaises(ValueError):
                self.store.update(body)
        self.assertEqual(self.store.read()["revision"], 0)

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
        self.assertEqual(self.request({"revision": saved["revision"], "rules": dict(DEFAULT_RULES, standardHours=10**400)}, headers)[0], 400)


if __name__ == "__main__":
    unittest.main()
