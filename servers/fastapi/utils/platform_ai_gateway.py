from __future__ import annotations

import logging
import os
from typing import Any

AI_GATEWAY_KEY_PLACEHOLDER = "novalue"
AI_GATEWAY_KEY_CONFIGURED_METRIC = "ngl_pptmate_ai_gateway_key_configured"

logger = logging.getLogger(__name__)


def is_ai_gateway_key_configured() -> bool:
    """Return whether the platform LiteLLM key is no longer a bootstrap value."""

    api_key = (os.getenv("LITELLM_API_KEY") or "").strip()
    return bool(api_key) and api_key != AI_GATEWAY_KEY_PLACEHOLDER


def install_ai_gateway_configuration_metric(app: Any) -> bool:
    """Publish the static startup state through the platform metrics registry."""

    from prometheus_client import Gauge

    registry = getattr(app.state, "observability_registry", None)
    if registry is None:
        raise RuntimeError("PPTMate observability registry is not installed")

    configured = is_ai_gateway_key_configured()
    metric = getattr(app.state, "pptmate_ai_gateway_key_configured_metric", None)
    if metric is None:
        metric = Gauge(
            AI_GATEWAY_KEY_CONFIGURED_METRIC,
            (
                "Whether the PPTMate LiteLLM virtual key is configured "
                "instead of using the bootstrap placeholder."
            ),
            registry=registry,
        )
        app.state.pptmate_ai_gateway_key_configured_metric = metric
    metric.set(1 if configured else 0)
    return configured


def warn_if_ai_gateway_key_not_configured() -> bool:
    """Emit one bounded warning during each platform process startup."""

    if is_ai_gateway_key_configured():
        return False

    logger.warning(
        "pptmate_ai_gateway_key_not_configured: AI Gateway virtual key is still "
        "the bootstrap placeholder; model operations remain unavailable until an "
        "operator replaces the Secret value and restarts PPTMate"
    )
    return True
