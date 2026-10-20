"""User-bound, encrypted Advisory state. No clear-text files or portable fallback."""

import copy
import ctypes
import json
import os
import threading
from functools import wraps
from pathlib import Path


MAGIC = b"CSCT-ADVISORY-DPAPI-1\0"
ENTROPY = b"CustomerSuccessControlTower.AdvisoryApproval.v1"
_LOCK = threading.Lock()


def serialized(function):
    """Serialize calls to one store instance across threads with an on-disk advisory lock,
    so two concurrent writers never interleave a read-modify-write cycle."""
    @wraps(function)
    def call(self, *args, **kwargs):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with _LOCK, self.path.with_suffix(".lock").open("a+b") as lock:
            lock.seek(0)
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(lock.fileno(), msvcrt.LK_LOCK, 1)
            else:
                import fcntl
                fcntl.flock(lock, fcntl.LOCK_EX)
            try:
                return function(self, *args, **kwargs)
            finally:
                lock.seek(0)
                if os.name == "nt":
                    msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    fcntl.flock(lock, fcntl.LOCK_UN)
    return call


class StoreError(RuntimeError):
    pass


class _Blob(ctypes.Structure):
    _fields_ = [("length", ctypes.c_uint32), ("data", ctypes.POINTER(ctypes.c_ubyte))]


def _blob(data):
    buffer = ctypes.create_string_buffer(data)
    return _Blob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte))), buffer


def _crypt(data, protect):
    if os.name != "nt":
        raise StoreError("Live Advisory state requires Windows user-bound DPAPI protection.")
    source, source_buffer = _blob(data)
    entropy, entropy_buffer = _blob(ENTROPY)
    output = _Blob()
    crypt = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    function = crypt.CryptProtectData if protect else crypt.CryptUnprotectData
    function.argtypes = [
        ctypes.POINTER(_Blob), ctypes.c_void_p, ctypes.POINTER(_Blob),
        ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint32, ctypes.POINTER(_Blob),
    ]
    function.restype = ctypes.c_int
    description = ctypes.c_wchar_p("CSCT Advisory private state") if protect else None
    if not function(ctypes.byref(source), description, ctypes.byref(entropy),
                    None, None, 1, ctypes.byref(output)):
        code = ctypes.get_last_error()
        raise StoreError("DPAPI protection failed (Windows error %d)." % code)
    try:
        return ctypes.string_at(output.data, output.length)
    finally:
        kernel.LocalFree(ctypes.cast(output.data, ctypes.c_void_p))


class ProtectedStore:
    persistent = True

    def __init__(self, path, initial_factory):
        self.path = Path(path)
        self.initial_factory = initial_factory

    def _read(self):
        if not self.path.exists():
            return self.initial_factory()
        raw = self.path.read_bytes()
        if not raw.startswith(MAGIC):
            raise StoreError("Invalid protected state. Do not replace it with an empty queue.")
        try:
            state = json.loads(_crypt(raw[len(MAGIC):], False).decode("utf-8"))
        except (ValueError, UnicodeError) as error:
            raise StoreError("Protected state is damaged.") from error
        if not isinstance(state, dict):
            raise StoreError("Protected state must contain an object.")
        return state

    def _write(self, state):
        clear = json.dumps(state, ensure_ascii=False, allow_nan=False).encode("utf-8")
        encrypted = MAGIC + _crypt(clear, True)
        temporary = self.path.with_suffix(".protected-tmp")
        with temporary.open("wb") as target:
            target.write(encrypted)
            target.flush()
            os.fsync(target.fileno())
        os.replace(temporary, self.path)

    @serialized
    def read(self):
        return self._read()

    @serialized
    def mutate(self, operation):
        state = self._read()
        result = operation(state)
        self._write(state)
        return result


class MemoryStore:
    """Fictional demonstration only; never acceptable to a live sender."""
    persistent = False

    def __init__(self, initial_factory):
        import threading
        self.lock = threading.RLock()
        self.state = initial_factory()

    def read(self):
        with self.lock:
            return copy.deepcopy(self.state)

    def mutate(self, operation):
        with self.lock:
            draft = copy.deepcopy(self.state)
            result = operation(draft)
            self.state = draft
            return result
