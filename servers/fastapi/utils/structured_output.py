"""Adapt JSON output, supplementing only call sites without a format prompt."""

import copy
import json
from collections.abc import Sequence
from typing import Any

from llmai.shared import (
    JSONObjectResponse,
    JSONSchemaResponse,
    Message,
    ResponseFormat,
    SystemMessage,
)
from llmai.shared.schema import get_schema_as_dict

from utils.llm_config import get_structured_output_format

SCHEMA_PROMPT_PREFIX = "Return only a JSON object matching this schema:\n"
_SCHEMA_MAPS = {"properties", "patternProperties", "$defs", "definitions", "dependentSchemas"}
_SCHEMA_VALUES = {
    "items",
    "additionalItems",
    "contains",
    "additionalProperties",
    "unevaluatedItems",
    "unevaluatedProperties",
    "propertyNames",
    "not",
    "if",
    "then",
    "else",
    "contentSchema",
}
_SCHEMA_ARRAYS = {"allOf", "anyOf", "oneOf", "prefixItems"}


def schema_for_prompt(schema: Any) -> Any:
    """Keep semantics and annotations; omit internal paths only at schema nodes.

    Do not strip identically named business fields or values inside const/enum.
    Keep references intact instead of expanding shared or recursive definitions.
    """
    if not isinstance(schema, dict):
        return copy.deepcopy(schema)
    result = {}
    for key, value in schema.items():
        if key == "x-element-path":
            continue
        if key in _SCHEMA_MAPS or key == "dependencies":
            result[key] = {name: schema_for_prompt(child) for name, child in value.items()}
        elif key in _SCHEMA_VALUES or key in _SCHEMA_ARRAYS:
            result[key] = (
                [schema_for_prompt(child) for child in value]
                if isinstance(value, list)
                else schema_for_prompt(value)
            )
        else:
            result[key] = copy.deepcopy(value)
    return result


def serialize_schema_for_prompt(schema: dict) -> str:
    return json.dumps(
        schema_for_prompt(schema), ensure_ascii=False, separators=(",", ":"), sort_keys=True
    )


def adapt_structured_output(
    messages: Sequence[Message],
    response_format: ResponseFormat | None,
    *,
    include_schema_in_prompt: bool = False,
) -> tuple[list[Message], ResponseFormat | None]:
    request_messages = list(messages)
    if (
        isinstance(response_format, JSONSchemaResponse)
        and get_structured_output_format() == "json_object"
    ):
        if include_schema_in_prompt:
            # A provider may return the entire message history after a tool call.
            # Replace only our own instruction; never rewrite upstream prompts.
            request_messages = [
                message
                for message in request_messages
                if not (
                    isinstance(message, SystemMessage)
                    and message.content.startswith(SCHEMA_PROMPT_PREFIX)
                )
            ]
            schema = serialize_schema_for_prompt(get_schema_as_dict(response_format.json_schema))
            # Keep the original system prefix ahead of the schema and dynamic input.
            index = next(
                (
                    i
                    for i, message in enumerate(request_messages)
                    if not isinstance(message, SystemMessage)
                ),
                len(request_messages),
            )
            request_messages.insert(index, SystemMessage(content=SCHEMA_PROMPT_PREFIX + schema))
        return request_messages, JSONObjectResponse()
    return request_messages, response_format
