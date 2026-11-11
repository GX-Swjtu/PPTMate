"""Only opted-in JSON object calls receive a compact, semantics-preserving schema."""

import copy
import json

import pytest
from jsonschema import Draft202012Validator
from llmai.shared import JSONSchemaResponse, SystemMessage, UserMessage
from utils.structured_output import (
    SCHEMA_PROMPT_PREFIX,
    adapt_structured_output,
    schema_for_prompt,
    serialize_schema_for_prompt,
)


@pytest.mark.parametrize("mode", ["json_object", "json_schema"])
@pytest.mark.parametrize("strict", [False, True])
@pytest.mark.parametrize("supplement", [False, True])
def test_format_switch_selectively_supplements_without_mutating_inputs(
    monkeypatch,
    mode,
    strict,
    supplement,
):
    monkeypatch.setenv("LLM_STRUCTURED_OUTPUT_FORMAT", mode)
    schema = {
        "type": "object",
        "title": "Response",
        "$comment": "Business guidance",
        "x-element-path": "elements.2",
        "properties": {"title": {"type": "string", "default": "Title", "examples": ["Hello"]}},
        "required": ["title"],
    }
    original_schema = copy.deepcopy(schema)
    response_format = JSONSchemaResponse(name="response", json_schema=schema, strict=strict)
    original_format = response_format.model_dump()
    messages = [
        SystemMessage(content="Upstream business instructions"),
        UserMessage(content="Generate"),
    ]
    first, selected = adapt_structured_output(
        messages,
        response_format,
        include_schema_in_prompt=supplement,
    )
    second, _ = adapt_structured_output(
        first,
        response_format,
        include_schema_in_prompt=supplement,
    )
    assert first == second
    assert len(messages) == 2
    assert schema == original_schema and response_format.model_dump() == original_format
    if mode == "json_object" and supplement:
        assert first[0] is messages[0] and first[2] is messages[1]
        assert len(first) == 3
        prompt = first[1].content
        assert prompt.startswith(SCHEMA_PROMPT_PREFIX)
        assert json.loads(prompt.removeprefix(SCHEMA_PROMPT_PREFIX)) == schema_for_prompt(schema)
    else:
        assert first == messages
        assert all(new is old for new, old in zip(first, messages, strict=True))
    if mode == "json_object":
        assert selected.type == "json_object"
    else:
        assert selected is response_format


def test_unstructured_request_is_not_changed_or_given_a_schema(monkeypatch):
    monkeypatch.setenv("LLM_STRUCTURED_OUTPUT_FORMAT", "invalid")
    messages = [UserMessage(content="Answer in plain text")]
    result, response_format = adapt_structured_output(messages, None, include_schema_in_prompt=True)
    assert result == messages
    assert response_format is None


def test_compact_schema_preserves_annotations_fields_literals_and_constraints():
    literal = {"title": "A", "default": "B", "x-element-path": "C"}
    schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "title": "Response",
        "$comment": "Business guidance",
        "x-element-path": "elements.2",
        "x-element-type": "text",
        "x-business-hint": "Keep this",
        "readOnly": False,
        "writeOnly": False,
        "deprecated": False,
        "$defs": {
            "title": {
                "type": "string",
                "title": "标题",
                "description": "客户展示标题",
                "minLength": 2,
                "maxLength": 8,
                "default": "示例",
                "examples": ["标题示例"],
                "$comment": "Keep the title concise",
                "x-element-path": "elements.2.children.0",
            }
        },
        "properties": {
            "title": {"$ref": "#/$defs/title"},
            "description": {"type": "string", "pattern": "^[A-Z]+$"},
            "default": {"const": literal},
            "examples": {"enum": [literal]},
            "x-element-path": {"type": "integer", "minimum": 1, "maximum": 3},
            "items": {"type": "array", "minItems": 1, "maxItems": 2, "items": {"type": "integer"}},
        },
        "required": ["title", "description", "default", "examples", "x-element-path", "items"],
        "additionalProperties": False,
    }
    before = copy.deepcopy(schema)
    expected = copy.deepcopy(schema)
    del expected["x-element-path"]
    del expected["$defs"]["title"]["x-element-path"]
    serialized = serialize_schema_for_prompt(schema)
    assert json.loads(serialized) == expected
    assert schema == before
    assert "客户展示标题" in serialized
    assert "\n" not in serialized and len(serialized) < len(json.dumps(schema, ensure_ascii=False))
    valid = {
        "title": "标题",
        "description": "ABC",
        "default": literal,
        "examples": literal,
        "x-element-path": 2,
        "items": [1],
    }
    candidates = [
        valid,
        {},
        dict(valid, title="x"),
        dict(valid, description="lower"),
        dict(valid, items=[]),
        dict(valid, items=[1, 2, 3]),
        dict(valid, extra=1),
        dict(valid, **{"x-element-path": 9}),
    ]
    original_validator = Draft202012Validator(schema)
    prompt_validator = Draft202012Validator(expected)
    assert original_validator.is_valid(valid)
    assert all(not original_validator.is_valid(c) for c in candidates[1:])
    for candidate in candidates:
        assert original_validator.is_valid(candidate) == prompt_validator.is_valid(candidate)


def test_recursive_schema_references_are_preserved_without_expansion():
    schema = {
        "$defs": {
            "node": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "children": {"type": "array", "items": {"$ref": "#/$defs/node"}},
                },
                "required": ["title"],
                "additionalProperties": False,
            }
        },
        "allOf": [{"$ref": "#/$defs/node"}],
        "if": {"properties": {"title": {"const": "leaf"}}},
        "then": {"properties": {"children": False}},
        "else": True,
    }
    compact = schema_for_prompt(schema)
    assert compact == schema
    Draft202012Validator.check_schema(compact)
    validator = Draft202012Validator(compact)
    assert validator.is_valid({"title": "root", "children": [{"title": "leaf"}]})
    assert not validator.is_valid({"title": "leaf", "children": []})


def test_serialization_is_stable_across_dictionary_insertion_order():
    a = {"type": "object", "properties": {"b": {"type": "string"}, "a": {"type": "number"}}}
    b = {"properties": {"a": {"type": "number"}, "b": {"type": "string"}}, "type": "object"}
    assert serialize_schema_for_prompt(a) == serialize_schema_for_prompt(b)
