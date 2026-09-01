import logging
import sys
from types import SimpleNamespace

import pytest
from utils.platform_ai_gateway import (
    AI_GATEWAY_KEY_CONFIGURED_METRIC,
    install_ai_gateway_configuration_metric,
    is_ai_gateway_key_configured,
    warn_if_ai_gateway_key_not_configured,
)


@pytest.mark.parametrize("api_key", [None, "", "   ", "novalue", " novalue "])
def test_ai_gateway_placeholder_is_not_configured(monkeypatch, api_key):
    if api_key is None:
        monkeypatch.delenv("LITELLM_API_KEY", raising=False)
    else:
        monkeypatch.setenv("LITELLM_API_KEY", api_key)

    assert is_ai_gateway_key_configured() is False


def test_ai_gateway_real_key_is_configured(monkeypatch):
    monkeypatch.setenv("LITELLM_API_KEY", "sk-pptmate-runtime-key")

    assert is_ai_gateway_key_configured() is True


def test_configuration_metric_uses_private_observability_registry(monkeypatch):
    created_metrics = []

    class FakeGauge:
        def __init__(self, name, description, *, registry):
            self.name = name
            self.description = description
            self.registry = registry
            self.value = None
            created_metrics.append(self)

        def set(self, value):
            self.value = value

    monkeypatch.setitem(sys.modules, "prometheus_client", SimpleNamespace(Gauge=FakeGauge))
    monkeypatch.setenv("LITELLM_API_KEY", "novalue")
    registry = object()
    app = SimpleNamespace(state=SimpleNamespace(observability_registry=registry))

    assert install_ai_gateway_configuration_metric(app) is False
    assert len(created_metrics) == 1
    assert created_metrics[0].name == AI_GATEWAY_KEY_CONFIGURED_METRIC
    assert created_metrics[0].registry is registry
    assert created_metrics[0].value == 0

    monkeypatch.setenv("LITELLM_API_KEY", "sk-pptmate-runtime-key")
    assert install_ai_gateway_configuration_metric(app) is True
    assert len(created_metrics) == 1
    assert created_metrics[0].value == 1


def test_placeholder_logs_one_bounded_startup_warning(monkeypatch, caplog):
    monkeypatch.setenv("LITELLM_API_KEY", "novalue")
    caplog.set_level(logging.WARNING, logger="utils.platform_ai_gateway")

    assert warn_if_ai_gateway_key_not_configured() is True

    assert len(caplog.records) == 1
    assert "pptmate_ai_gateway_key_not_configured" in caplog.text
    assert "Secret value" in caplog.text


def test_configured_key_does_not_log_warning(monkeypatch, caplog):
    monkeypatch.setenv("LITELLM_API_KEY", "sk-do-not-log-this-value")
    caplog.set_level(logging.WARNING, logger="utils.platform_ai_gateway")

    assert warn_if_ai_gateway_key_not_configured() is False

    assert not caplog.records
    assert "sk-do-not-log-this-value" not in caplog.text
