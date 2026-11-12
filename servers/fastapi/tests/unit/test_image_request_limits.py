import asyncio
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, Mock

import httpx
import pytest
from models.image_prompt import ImagePrompt
from openai import RateLimitError
from services.image_generation_service import ImageGenerationService
from utils.image_request_limits import (
    ImageRequestLimiter,
    get_image_request_limiter,
    image_retry_delay,
)


@pytest.mark.parametrize("raw,expected", [
    ("75", 75), ("1", 60), ("bad", 60), ("inf", 60),
    ("Thu, 01 Jan 1970 00:01:30 GMT", 90),
])
def test_retry_after_seconds_and_http_date(monkeypatch, raw, expected):
    monkeypatch.setattr("utils.image_request_limits.time.time", lambda: 0)
    assert image_retry_delay(httpx.Headers({"retry-after": raw})) == expected
    assert image_retry_delay({"Retry-After": raw}) == expected


def test_concurrency_and_rolling_window_are_shared_by_service_instances(monkeypatch):
    async def run():
        limiter = ImageRequestLimiter(2, 10, window_seconds=0.1)
        monkeypatch.setattr(
            "services.image_generation_service.get_image_request_limiter", lambda: limiter
        )
        active = peak = 0
        starts = []

        async def provider(*_args):
            nonlocal active, peak
            active += 1
            peak = max(peak, active)
            starts.append(asyncio.get_running_loop().time())
            await asyncio.sleep(0.005)
            active -= 1
            return "https://images.test/generated.png"

        services = []
        for _ in range(14):
            service = object.__new__(ImageGenerationService)
            service.output_directory = "/tmp"
            service.is_image_generation_disabled = False
            service.is_stock_provider_selected = lambda: False
            service.image_gen_func = provider
            services.append(service)
        await asyncio.gather(*(
            service.generate_image(ImagePrompt(prompt="test")) for service in services
        ))
        assert peak == 2
        assert starts[10] - starts[0] >= 0.1

    asyncio.run(run())


def test_cancelling_waiter_releases_concurrency_slot():
    async def run():
        limiter = ImageRequestLimiter(1, 1, window_seconds=0.05)
        async with limiter.request():
            pass

        async def request():
            async with limiter.request():
                return True

        waiting = asyncio.create_task(request())
        await asyncio.sleep(0.005)
        waiting.cancel()
        with pytest.raises(asyncio.CancelledError):
            await waiting
        assert await asyncio.wait_for(request(), 1)

    asyncio.run(run())


@pytest.mark.parametrize("error", [RuntimeError("provider unavailable"), asyncio.CancelledError()])
def test_openai_compatible_client_closes_on_failure_and_cancellation(monkeypatch, error):
    monkeypatch.setenv("OPENAI_COMPAT_IMAGE_BASE_URL", "https://images.test/v1")
    monkeypatch.setenv("OPENAI_COMPAT_IMAGE_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_COMPAT_IMAGE_MODEL", "test-model")
    client = Mock()
    client.close = AsyncMock()
    client.images.generate = AsyncMock(side_effect=error)
    monkeypatch.setattr("services.image_generation_service.AsyncOpenAI", lambda **_: client)
    service = object.__new__(ImageGenerationService)
    with pytest.raises(type(error)):
        asyncio.run(service.generate_image_openai_compatible("test", "/tmp"))
    client.close.assert_awaited_once()


@pytest.mark.parametrize("code,retries", [("Throttling.RateQuota", 3), ("insufficient_quota", 1)])
def test_rate_limit_retry_budget_and_quota_exclusion(monkeypatch, code, retries):
    class RecordingLimiter:
        def __init__(self):
            self.starts = 0
            self.delays = []

        @asynccontextmanager
        async def request(self):
            self.starts += 1
            yield

        def defer(self, seconds):
            self.delays.append(seconds)

    limiter = RecordingLimiter()
    monkeypatch.setattr(
        "services.image_generation_service.get_image_request_limiter", lambda: limiter
    )
    response = httpx.Response(
        429, headers={"retry-after": "75"}, request=httpx.Request("POST", "https://images.test")
    )
    error = RateLimitError("limited", response=response, body={"code": code})
    service = object.__new__(ImageGenerationService)
    service.output_directory = "/tmp"
    service.is_stock_provider_selected = lambda: False
    service.image_gen_func = AsyncMock(side_effect=error)
    with pytest.raises(RateLimitError):
        asyncio.run(service._call_image_provider("test"))
    assert limiter.starts == retries
    assert service.image_gen_func.await_count == retries
    assert limiter.delays == ([75] * retries if retries > 1 else [])


def test_platform_defaults_are_shared(monkeypatch):
    monkeypatch.setenv("PLATFORM_MODE", "true")
    monkeypatch.delenv("IMAGE_GENERATION_MAX_CONCURRENT", raising=False)
    monkeypatch.delenv("IMAGE_GENERATION_REQUESTS_PER_MINUTE", raising=False)

    async def run():
        one = get_image_request_limiter()
        assert one is get_image_request_limiter()
        assert one._limit == 10
        assert one._semaphore._value == 2

    asyncio.run(run())
