import asyncio

import pytest
from fastapi import HTTPException
from llmai.shared import ResponseStreamCompletionChunk
from utils.llm_calls.generate_web_search_query import generate_web_search_query


class FakeClient:
    def __init__(self, content):
        self.content = content
        self.calls = []

    def generate(self, **kwargs):
        self.calls.append(kwargs)
        return iter([ResponseStreamCompletionChunk(content=self.content)])


def test_generate_web_search_query_returns_normalized_query(monkeypatch):
    monkeypatch.setenv("LLM", "ollama")
    client = FakeClient({"query": "  latest   Nepal economy statistics 2026  "})

    query = asyncio.run(
        generate_web_search_query(
            client,
            "fake-model",
            "Create a presentation about Nepal's economy",
            "Use current statistics",
        )
    )

    assert query == "latest Nepal economy statistics 2026"
    assert client.calls[0]["response_format"].name == "web_search_query"
    assert "TODAY'S DATE:" in str(client.calls[0]["messages"][1].content)


def test_generate_web_search_query_rejects_schema_invalid_result(monkeypatch):
    monkeypatch.setenv("LLM", "ollama")
    client = FakeClient({"query": None})

    with pytest.raises(HTTPException) as error:
        asyncio.run(
            generate_web_search_query(
                client,
                "fake-model",
                "A complete supplied factual report",
            )
        )
    assert error.value.status_code == 502
    assert len(client.calls) == 4


def test_generate_web_search_query_returns_none_for_empty_string(monkeypatch):
    monkeypatch.setenv("LLM", "ollama")
    client = FakeClient({"query": "   "})
    query = asyncio.run(generate_web_search_query(client, "fake-model", "Report"))
    assert query is None
