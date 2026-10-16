"""Tiny in-process failure limiter (sliding window).

Good enough for a single uvicorn worker (the supported topology, see backend Dockerfile).
With several workers/replicas the limit applies per process; move the counters to Redis then.
"""
import time
from collections import defaultdict, deque
from typing import Deque, Dict


class FailureLimiter:
    def __init__(self, max_failures: int, window_seconds: int, max_keys: int = 10_000):
        self.max_failures = max_failures
        self.window = window_seconds
        self.max_keys = max_keys
        self._failures: Dict[str, Deque[float]] = defaultdict(deque)

    def _prune(self, key: str, now: float) -> Deque[float]:
        q = self._failures[key]
        while q and now - q[0] > self.window:
            q.popleft()
        if not q:
            self._failures.pop(key, None)
            return deque()
        return q

    def retry_after(self, key: str) -> int:
        """Seconds until `key` may try again; 0 when it is not blocked."""
        now = time.monotonic()
        q = self._prune(key, now)
        if len(q) < self.max_failures:
            return 0
        return max(1, int(self.window - (now - q[0])) + 1)

    def record_failure(self, key: str) -> None:
        if len(self._failures) >= self.max_keys and key not in self._failures:
            # bound memory under a distributed spray: forget the oldest-touched key
            self._failures.pop(next(iter(self._failures)))
        self._failures[key].append(time.monotonic())

    def reset(self, key: str) -> None:
        self._failures.pop(key, None)
