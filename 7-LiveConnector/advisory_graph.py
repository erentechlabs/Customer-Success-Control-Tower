"""Microsoft Graph through the installed WorkIQ MCP broker, without exposed tokens."""

import json
import queue
import subprocess
import threading
import time
import urllib.parse

from csct_live import NO_WINDOW, workiq_exe


class GraphRequestError(RuntimeError):
    pass


class DeliveryUnknown(GraphRequestError):
    """A write may have reached Microsoft; never retry it automatically."""


def relative_path(path):
    if not isinstance(path, str):
        raise GraphRequestError("A Microsoft Graph path is required.")
    if path.startswith("https://graph.microsoft.com/v1.0/"):
        path = path[len("https://graph.microsoft.com/v1.0"):]
    parsed = urllib.parse.urlsplit(path)
    if not path.startswith("/") or path.startswith("//") or parsed.scheme or parsed.netloc or parsed.fragment:
        raise GraphRequestError("Only relative Microsoft Graph v1.0 paths are accepted.")
    if "\r" in path or "\n" in path:
        raise GraphRequestError("Invalid Graph path.")
    return path


def response_data(reply, write=False):
    exception = DeliveryUnknown if write else GraphRequestError
    if not isinstance(reply, dict):
        raise exception("Unrecognized Microsoft Graph response.")
    if reply.get("error"):
        raise GraphRequestError("The Microsoft 365 broker rejected the request.")
    result = reply.get("result")
    if not isinstance(result, dict):
        raise exception("Missing Microsoft Graph response.")
    structured = result.get("structuredContent")
    if not isinstance(structured, dict):
        if result.get("isError"):
            raise GraphRequestError("Microsoft 365 returned an operation error.")
        raise exception("Microsoft 365 did not return structured operation status.")
    entries = structured.get("results")
    if entries is None and "statusCode" in structured:
        entries = [structured]
    if not isinstance(entries, list) or len(entries) != 1:
        raise exception("Exactly one Graph operation response is required.")
    entry = entries[0]
    status = entry.get("statusCode") if isinstance(entry, dict) else None
    if type(status) is not int:
        raise exception("Missing Microsoft Graph HTTP status.")
    if status >= 400:
        raise GraphRequestError("Microsoft Graph rejected the operation (HTTP %d)." % status)
    if not 200 <= status < 300 or result.get("isError"):
        raise exception("Microsoft Graph operation status is not successful.")
    data = entry.get("data")
    if status not in (202, 204) and not isinstance(data, (dict, list)):
        raise exception("Microsoft Graph did not return expected operation data.")
    return data


class WorkIQGraph:
    def __init__(self, account, timeout=180):
        self.account = account
        self.timeout = timeout
        self.lock = threading.RLock()
        self.messages = queue.Queue()
        self.number = 0
        self.process = None

    def _start(self):
        if self.process and self.process.poll() is None:
            return
        self.messages = queue.Queue()
        self.process = subprocess.Popen(
            [workiq_exe(), "--account", self.account, "mcp"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, encoding="utf-8", creationflags=NO_WINDOW,
        )
        process = self.process
        messages = self.messages

        def read():
            for line in process.stdout:
                try:
                    value = json.loads(line)
                except ValueError:
                    messages.put(GraphRequestError("Invalid Microsoft 365 broker protocol."))
                    return
                messages.put(value)
            messages.put(GraphRequestError("Microsoft 365 broker closed the connection."))

        threading.Thread(target=read, daemon=True).start()
        reply = self._rpc("initialize", {
            "protocolVersion": "2024-11-05", "capabilities": {},
            "clientInfo": {"name": "CSCT-Advisory-Approval", "version": "1.0"},
        })
        if reply.get("error"):
            raise GraphRequestError("Could not initialize the Microsoft 365 broker.")
        self._send({"jsonrpc": "2.0", "method": "notifications/initialized"})

    def _send(self, body):
        try:
            self.process.stdin.write(json.dumps(body, ensure_ascii=False) + "\n")
            self.process.stdin.flush()
        except (BrokenPipeError, OSError) as error:
            raise GraphRequestError("Microsoft 365 broker connection failed.") from error

    def _rpc(self, method, params):
        self.number += 1
        number = self.number
        self._send({"jsonrpc": "2.0", "id": number, "method": method, "params": params})
        deadline = time.monotonic() + self.timeout
        while True:
            try:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise queue.Empty
                reply = self.messages.get(timeout=remaining)
            except queue.Empty as error:
                raise GraphRequestError("Microsoft 365 operation timed out.") from error
            if isinstance(reply, Exception):
                raise reply
            if reply.get("id") == number:
                return reply

    def call(self, tool, arguments, write=False):
        with self.lock:
            self._start()
            try:
                reply = self._rpc("tools/call", {"name": tool, "arguments": arguments})
            except GraphRequestError as error:
                if write:
                    raise DeliveryUnknown("Microsoft 365 write outcome is unknown; reconciliation is required.") from error
                raise
            return response_data(reply, write)

    def get(self, path):
        return self.call("fetch", {"entityUrls": [relative_path(path)]})

    def create(self, path, body):
        return self.call("create_entity", {"parentUrl": relative_path(path), "jsonBody": body}, write=True)

    def update(self, path, body, etag):
        if not isinstance(etag, str) or not etag:
            raise GraphRequestError("An ETag is required for a concurrent SharePoint update.")
        return self.call("update_entity", {
            "entityUrl": relative_path(path), "jsonBody": body, "headers": {"If-Match": etag},
        }, write=True)

    def action(self, path, body=None):
        return self.call("do_action", {"actionUrl": relative_path(path), "jsonBody": body or {}}, write=True)

    def all(self, path, max_pages=20):
        items = []
        for _ in range(max_pages):
            data = self.get(path)
            if not isinstance(data, dict) or not isinstance(data.get("value"), list):
                raise GraphRequestError("Expected a Microsoft Graph collection.")
            items.extend(data["value"])
            path = data.get("@odata.nextLink")
            if not path:
                return items
            path = relative_path(path)
        raise GraphRequestError("Microsoft Graph collection exceeded its bounded page limit.")

    def close(self):
        with self.lock:
            if not self.process:
                return
            process, self.process = self.process, None
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=10)
            for stream in (process.stdin, process.stdout):
                if stream:
                    stream.close()
