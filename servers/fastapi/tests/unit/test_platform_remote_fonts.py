import asyncio

import pytest
from fastapi import HTTPException

from templates import font_utils, pptx_font_utils
from templates.fonts_and_slides_preview import _selected_google_font_maps


def test_platform_mode_short_circuits_google_font_network_checks(monkeypatch):
    monkeypatch.setenv("DISABLE_REMOTE_FONTS", "true")

    assert asyncio.run(pptx_font_utils.check_google_font_availability("Inter")) is False
    assert asyncio.run(pptx_font_utils.get_google_font_file_urls("Inter", "key")) == []
    assert asyncio.run(font_utils.check_google_font_availability("Inter")) is False


def test_platform_mode_rejects_client_supplied_remote_font_replacements(monkeypatch):
    monkeypatch.setenv("DISABLE_REMOTE_FONTS", "true")

    with pytest.raises(HTTPException) as rejected:
        _selected_google_font_maps(
            ["Arial"],
            ["Inter"],
            None,
            ["https://fonts.googleapis.com/css2?family=Inter"],
        )

    assert rejected.value.status_code == 400
    assert rejected.value.detail == "Remote fonts are disabled"
