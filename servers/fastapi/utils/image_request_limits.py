"""Shared quotas for the single-worker image generation service."""

import asyncio
import math
import os
import time
from collections import deque
from contextlib import asynccontextmanager
from email.utils import parsedate_to_datetime


def image_retry_delay(headers) -> float:
    headers = {str(key).lower(): value for key, value in (headers or {}).items()}
    raw = headers.get("retry-after", "60")
    try:
        delay = float(raw)
    except (ValueError, TypeError):
        try:
            delay = parsedate_to_datetime(raw).timestamp() - time.time()
        except (ValueError, TypeError, OverflowError):
            delay = 60.0
    return max(60.0, delay) if math.isfinite(delay) else 60.0


class ImageRequestLimiter:
    def __init__(self, concurrency: int, requests_per_minute: int, *, window_seconds=60):
        self._semaphore = asyncio.Semaphore(concurrency)
        self._lock = asyncio.Lock()
        self._starts = deque()
        self._limit = requests_per_minute
        self._window = window_seconds
        self._not_before = 0.0

    @asynccontextmanager
    async def request(self):
        async with self._semaphore:
            while True:
                async with self._lock:
                    now = asyncio.get_running_loop().time()
                    while self._starts and self._starts[0] <= now - self._window:
                        self._starts.popleft()
                    delay = self._not_before - now
                    if len(self._starts) >= self._limit:
                        delay = max(delay, self._starts[0] + self._window - now)
                    if delay <= 0:
                        self._starts.append(now)
                        break
                await asyncio.sleep(delay)
            yield

    def defer(self, seconds: float):
        # Called on the owner loop, with no await between read and write.
        self._not_before = max(
            self._not_before, asyncio.get_running_loop().time() + seconds
        )


def get_image_request_limiter() -> ImageRequestLimiter | None:
    platform = os.getenv("PLATFORM_MODE", "").lower() in {"1", "true", "yes", "on"}
    if not platform and not any(os.getenv(key) for key in (
        "IMAGE_GENERATION_MAX_CONCURRENT", "IMAGE_GENERATION_REQUESTS_PER_MINUTE"
    )):
        return None
    loop = asyncio.get_running_loop()
    # Keep the limiter with its loop. A global weak-key map whose semaphore
    # holds the same loop would keep closed loops alive after contention.
    limiter = getattr(loop, "_presenton_image_request_limiter", None)
    if limiter is None:
        concurrency = int(os.getenv("IMAGE_GENERATION_MAX_CONCURRENT", "2"))
        requests = int(os.getenv("IMAGE_GENERATION_REQUESTS_PER_MINUTE", "10"))
        if concurrency < 1 or requests < 1:
            raise ValueError("Image generation limits must be positive integers")
        limiter = ImageRequestLimiter(concurrency, requests)
        loop._presenton_image_request_limiter = limiter
    return limiter
