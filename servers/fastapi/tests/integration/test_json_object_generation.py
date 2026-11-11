"""Exercise real llmai/OpenAI serialization with both structured output modes."""

import asyncio
import json
import uuid
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import HTTPException
from llmai import LiteLLMClient
from llmai.shared import JSONSchemaResponse, LiteLLMClientConfig, SystemMessage, UserMessage
from llmai.shared.errors import LLMError
from models.presentation_outline_model import PresentationOutlineModel, SlideOutlineModel
from models.sql.slide import SlideModel
from openai import OpenAI
from templates.presentation_layout import PresentationLayoutModel, SlideLayoutModel
from utils import llm_utils
from utils.llm_calls import (
    edit_slide,
    generate_presentation_outlines,
    generate_presentation_structure,
    generate_slide_content,
    generate_web_search_query,
    select_slide_type_on_edit,
)
from utils.structured_output import SCHEMA_PROMPT_PREFIX, serialize_schema_for_prompt

SCHEMA = {
    "type": "object",
    "properties": {"result": {"type": "string"}},
    "required": ["result"],
    "additionalProperties": False,
}


@pytest.fixture
def json_api(monkeypatch, request):
    monkeypatch.setenv("LLM", "litellm")
    monkeypatch.setenv("DISABLE_THINKING", "true")
    monkeypatch.setenv("WEB_GROUNDING", "false")
    configured_format = getattr(request, "param", None)
    if configured_format:
        monkeypatch.setenv("LLM_STRUCTURED_OUTPUT_FORMAT", configured_format)
    else:
        monkeypatch.delenv("LLM_STRUCTURED_OUTPUT_FORMAT", raising=False)
    api_format = configured_format or "json_object"
    replies, requests = [], []

    def handle(request):
        payload = json.loads(request.content)
        requests.append(payload)
        if payload.get("response_format", {}).get("type") != api_format:
            return httpx.Response(
                400,
                json={
                    "error": {
                        "message": "This response_format type is unavailable now",
                        "type": "invalid_request_error",
                    }
                },
            )
        assert request.url.path == "/v1/chat/completions"
        if api_format == "json_object":
            assert "json" in json.dumps(payload["messages"]).lower()
            assert payload["response_format"] == {"type": "json_object"}
        else:
            assert payload["response_format"]["json_schema"]["schema"]["type"] == "object"
        reply = replies.pop(0)
        if isinstance(reply, int):
            return httpx.Response(reply, json={"error": {"message": "Provider error"}})
        content = reply if isinstance(reply, str) else json.dumps(reply)
        if not payload.get("stream"):
            return httpx.Response(
                200,
                json={
                    "id": "test",
                    "object": "chat.completion",
                    "created": 1,
                    "model": "deepseek-flash",
                    "choices": [
                        {
                            "index": 0,
                            "message": {"role": "assistant", "content": content},
                            "finish_reason": "stop",
                        }
                    ],
                },
            )
        chunks = [
            {"index": 0, "delta": {"role": "assistant", "content": content}, "finish_reason": None},
            {"index": 0, "delta": {}, "finish_reason": "stop"},
        ]
        body = (
            "".join(
                "data: "
                + json.dumps(
                    {
                        "id": "test",
                        "object": "chat.completion.chunk",
                        "created": 1,
                        "model": "deepseek-flash",
                        "choices": [chunk],
                    }
                )
                + "\n\n"
                for chunk in chunks
            )
            + "data: [DONE]\n\n"
        )
        return httpx.Response(200, text=body, headers={"content-type": "text/event-stream"})

    sdk = OpenAI(
        base_url="http://json-api.test/v1",
        api_key="test-only",
        max_retries=0,
        http_client=httpx.Client(transport=httpx.MockTransport(handle), trust_env=False),
    )
    monkeypatch.setattr("llmai.litellm.client.OpenAI", lambda **_: sdk)
    client = LiteLLMClient(
        config=LiteLLMClientConfig(
            base_url="http://json-api.test/v1",
            api_key="test-only",
        )
    )
    try:
        yield client, replies, requests
    finally:
        sdk.close()


def generate(client, schema_strict=False, **kwargs):
    return llm_utils.generate_structured_with_schema_retries(
        client,
        "pptmate-chat",
        messages=[UserMessage(content="Return a JSON object with a string result")],
        response_format=JSONSchemaResponse(name="test", json_schema=SCHEMA, strict=schema_strict),
        json_schema=SCHEMA,
        validate_schema=True,
        **kwargs,
    )


@pytest.mark.parametrize("first", ["   ", '{"result":', {"wrong": "value"}])
def test_json_object_retries_blank_malformed_and_schema_invalid_output(
    json_api, monkeypatch, first
):
    client, replies, requests = json_api
    replies.extend([first, {"result": "corrected"}])
    monkeypatch.setattr(llm_utils.asyncio, "sleep", AsyncMock())
    assert asyncio.run(generate(client, include_schema_in_prompt=True)) == {"result": "corrected"}
    assert len(requests) == 2
    for request in requests:
        system_messages = [m for m in request["messages"] if m["role"] == "system"]
        assert system_messages == [
            {
                "role": "system",
                "content": SCHEMA_PROMPT_PREFIX + serialize_schema_for_prompt(SCHEMA),
            }
        ]


def test_invalid_schema_never_returns_success_after_retry_limit(json_api):
    client, replies, requests = json_api
    replies.extend([{"wrong": "value"}] * 2)
    with pytest.raises(HTTPException) as error:
        asyncio.run(generate(client, validate_schema_max_loop_count=2))
    assert error.value.status_code == 502
    assert len(requests) == 2


def test_blank_output_stops_after_three_attempts(json_api, monkeypatch):
    client, replies, requests = json_api
    replies.extend(["   "] * 3)
    monkeypatch.setattr(llm_utils.asyncio, "sleep", AsyncMock())
    with pytest.raises(HTTPException) as error:
        asyncio.run(generate(client))
    assert error.value.status_code == 502
    assert len(requests) == 3


@pytest.mark.parametrize("status", [400, 401, 429])
def test_provider_errors_are_not_misclassified_as_json_parse_errors(json_api, status):
    client, replies, requests = json_api
    replies.append(status)
    with pytest.raises(LLMError) as error:
        asyncio.run(generate(client))
    assert error.value.status_code == status
    assert len(requests) == 1


@pytest.mark.parametrize(
    "provider,configured,expected",
    [
        ("litellm", None, "json_object"),
        ("deepseek", None, "json_object"),
        ("openai", None, "json_schema"),
        ("anthropic", None, "json_schema"),
        ("litellm", "json_schema", "json_schema"),
        ("deepseek", "json_schema", "json_schema"),
        ("openai", "json_object", "json_object"),
    ],
)
def test_format_selection_preserves_caller_messages(monkeypatch, provider, configured, expected):
    monkeypatch.setenv("LLM", provider)
    if configured:
        monkeypatch.setenv("LLM_STRUCTURED_OUTPUT_FORMAT", configured)
    else:
        monkeypatch.delenv("LLM_STRUCTURED_OUTPUT_FORMAT", raising=False)
    messages = [UserMessage(content="Generate")]
    response_format = JSONSchemaResponse(name="test", json_schema=SCHEMA)
    kwargs = llm_utils.get_generate_kwargs("alias", messages, response_format=response_format)
    assert kwargs["response_format"].type == expected
    assert len(messages) == 1
    assert response_format.type == "json_schema"
    if expected == "json_schema":
        assert kwargs["response_format"] is response_format
        assert kwargs["messages"] == messages


@pytest.mark.parametrize("json_api", ["json_schema"], indirect=True)
@pytest.mark.parametrize("strict", [False, True])
def test_schema_mode_preserves_original_schema_name_strict_and_messages(json_api, strict):
    client, replies, requests = json_api
    replies.append({"result": "valid"})
    assert asyncio.run(generate(client, schema_strict=strict)) == {"result": "valid"}
    assert requests[0]["response_format"] == {
        "type": "json_schema",
        "json_schema": {"name": "test", "strict": strict, "schema": SCHEMA},
    }
    assert requests[0]["messages"] == [
        {
            "role": "user",
            "content": [{"type": "text", "text": "Return a JSON object with a string result"}],
        }
    ]


def test_invalid_format_fails_before_provider_request(json_api, monkeypatch):
    client, _replies, requests = json_api
    monkeypatch.setenv("LLM_STRUCTURED_OUTPUT_FORMAT", "invalid")
    with pytest.raises(HTTPException) as error:
        asyncio.run(generate(client))
    assert error.value.status_code == 400
    assert "LLM_STRUCTURED_OUTPUT_FORMAT" in error.value.detail
    assert requests == []


@pytest.mark.parametrize("json_api", ["json_object", "json_schema"], indirect=True)
def test_outline_structure_content_edit_layout_and_search_use_selected_format(
    json_api, monkeypatch
):
    client, replies, requests = json_api
    note = "This speaker note explains the key message and its practical implications. " * 2
    outline_payload = {"slides": [{"content": "## Introduction\n" + note}]}
    replies.extend(
        [
            outline_payload,
            {"slides": [0]},
            {"title": "Original", "__speaker_note__": note},
            {"title": "Edited", "__speaker_note__": note},
            {"index": 0},
            {"query": "facts"},
        ]
    )
    modules = [
        generate_presentation_outlines,
        generate_presentation_structure,
        generate_slide_content,
        edit_slide,
        select_slide_type_on_edit,
    ]
    for module in modules:
        monkeypatch.setattr(module, "get_client", lambda **_: client)
        monkeypatch.setattr(module, "get_llm_config", lambda **_: {})
        monkeypatch.setattr(module, "get_model", lambda: "pptmate-chat")

    async def run():
        chunks = [
            chunk
            async for chunk in generate_presentation_outlines.generate_ppt_outline(
                "Test deck",
                1,
                "English",
                web_search=False,
            )
        ]
        outline = PresentationOutlineModel.model_validate(json.loads("".join(chunks)))
        layout = PresentationLayoutModel(
            name="test",
            slides=[
                SlideLayoutModel(
                    id="title",
                    json_schema={
                        "title": "InternalSlideContentModel",
                        "type": "object",
                        "properties": {
                            "title": {
                                "type": "string",
                                "title": "UI caption",
                                "description": "Audience-facing title",
                            }
                        },
                        "required": ["title"],
                    },
                )
            ],
        )
        structure = await generate_presentation_structure.generate_presentation_structure(
            outline, layout
        )
        assert structure.slides == [0]
        content = await generate_slide_content.get_slide_content_from_type_and_outline(
            layout.slides[0],
            SlideOutlineModel(content="Intro"),
            "English",
        )
        slide = SlideModel(
            presentation=uuid.uuid4(), index=0, layout_group="test", layout="title", content=content
        )
        edited = await edit_slide.get_edited_slide_content(
            "Improve", slide, "English", layout.slides[0]
        )
        assert edited["title"] == "Edited"
        selected = await select_slide_type_on_edit.get_slide_layout_from_prompt(
            "Keep", layout, slide
        )
        assert selected.id == "title"
        assert (
            await generate_web_search_query.generate_web_search_query(
                client, "pptmate-chat", "Facts"
            )
            == "facts"
        )

    asyncio.run(run())
    assert len(requests) == 6
    assert not replies
    for index, request in enumerate(requests):
        supplement = [
            m
            for m in request["messages"]
            if m["role"] == "system" and m["content"].startswith(SCHEMA_PROMPT_PREFIX)
        ]
        should_supplement = request["response_format"]["type"] == "json_object" and index != 2
        assert len(supplement) == int(should_supplement)
        roles = [message["role"] for message in request["messages"]]
        assert roles == (["system", "system", "user"] if should_supplement else ["system", "user"])
        if should_supplement:
            schema = json.loads(supplement[0]["content"].removeprefix(SCHEMA_PROMPT_PREFIX))
            assert schema["type"] == "object"
            assert (
                schema["required"]
                == [
                    ["slides"],
                    ["slides"],
                    None,
                    ["title", "__speaker_note__"],
                    ["index"],
                    ["query"],
                ][index]
            )
    # The original single-slide prompt already contains its schema. Keep it once.
    slide_prompt = json.dumps(requests[2]["messages"])
    assert slide_prompt.count("InternalSlideContentModel") == 1
    assert "Follow this response schema exactly:" in slide_prompt
    assert "UI caption" in slide_prompt and "Audience-facing title" in slide_prompt


@pytest.mark.parametrize("json_api", ["json_object", "json_schema"], indirect=True)
@pytest.mark.parametrize("supplement", [False, True])
def test_template_generation_and_validation_retry_use_selected_format(json_api, supplement):
    from pydantic import BaseModel, Field
    from templates.v2.generation import _generate_with_validation_retries

    class TemplateResponse(BaseModel):
        title: str = Field(min_length=5, description="Visible title")

    client, replies, requests = json_api
    replies.extend([{"title": "x"}, {"title": "Valid title"}])
    result = _generate_with_validation_retries(
        client=client,
        model="pptmate-chat",
        messages=[UserMessage(content="Generate JSON")],
        label="template",
        output_model=TemplateResponse,
        response_name="TemplateResponse",
        validation_retries=1,
        include_schema_in_prompt=supplement,
    )
    assert result["title"] == "Valid title"
    assert len(requests) == 2
    should_supplement = supplement and requests[0]["response_format"]["type"] == "json_object"
    assert len(requests[0]["messages"]) == (2 if should_supplement else 1)
    if should_supplement:
        assert requests[0]["messages"][0]["content"] == (
            SCHEMA_PROMPT_PREFIX + serialize_schema_for_prompt(TemplateResponse.model_json_schema())
        )
    assert not any(m["role"] == "system" for m in requests[1]["messages"])
    # Preserve upstream's schema-based repair prompt, rather than a new system instruction.
    assert "required_json_schema:" in json.dumps(requests[1]["messages"])
    if requests[0]["response_format"]["type"] == "json_schema":
        assert (
            requests[0]["response_format"]["json_schema"]["schema"]
            == TemplateResponse.model_json_schema()
        )


@pytest.mark.parametrize("json_api", ["json_object", "json_schema"], indirect=True)
def test_template_preview_generation_uses_selected_format(json_api):
    from templates.v2.generation import _generate_preview_candidate
    from templates.v2.tools import PreviewSlideTool

    client, replies, requests = json_api
    replies.append({"id": "title_slide", "description": "A reusable title slide", "components": []})
    result = _generate_preview_candidate(
        client=client,
        model="pptmate-chat",
        messages=[SystemMessage(content="Generate a JSON layout")],
        label="template",
        preview_tool=PreviewSlideTool(),
        validation_retries=1,
    )
    assert result.id == "title_slide"
    assert len(requests) == 1
    assert requests[0]["messages"] == [{"role": "system", "content": "Generate a JSON layout"}]
    assert requests[0]["tools"][0]["function"]["name"] == "previewSlide"


@pytest.mark.parametrize("json_api", ["json_object", "json_schema"], indirect=True)
def test_component_clustering_supplements_only_json_object_requests(json_api, monkeypatch):
    from templates.v2 import generation
    from templates.v2.models.layouts import SlideLayouts

    client, replies, requests = json_api
    replies.append({"similar_components": [{"indices": [0, 1]}]})
    monkeypatch.setattr(generation, "get_client", lambda **_: client)
    monkeypatch.setattr(generation, "get_llm_config", lambda: {})
    monkeypatch.setattr(generation, "get_model", lambda: "pptmate-chat")
    layouts = SlideLayouts.model_validate(
        {
            "layouts": [
                {
                    "id": "demo",
                    "description": "Two similar cards",
                    "components": [
                        {
                            "id": f"card_{i}",
                            "description": "A title card",
                            "position": {"x": i * 200, "y": 100},
                            "elements": [
                                {
                                    "type": "text",
                                    "position": {"x": 0, "y": 0},
                                    "size": {"width": 100, "height": 30},
                                    "name": "title",
                                    "decorative": False,
                                    "min_length": 1,
                                    "max_length": 40,
                                    "runs": [{"text": "Example"}],
                                }
                            ],
                        }
                        for i in range(2)
                    ],
                }
            ]
        }
    )
    assert generation.merge_similar_components(layouts).components
    assert len(requests) == 1
    supplement = [
        m
        for m in requests[0]["messages"]
        if m["role"] == "system" and m["content"].startswith(SCHEMA_PROMPT_PREFIX)
    ]
    assert len(supplement) == int(requests[0]["response_format"]["type"] == "json_object")
    if supplement:
        schema = json.loads(supplement[0]["content"].removeprefix(SCHEMA_PROMPT_PREFIX))
        assert schema["required"] == ["similar_components"]
