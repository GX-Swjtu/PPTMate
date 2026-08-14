import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import numpy as np
import pytest
from services.icon_embedding_index import (
    IconEmbeddingIndexError,
    icon_corpus_sha256,
    load_icon_documents,
    load_icon_embedding_index,
    save_icon_embedding_index,
)
from services.icon_finder_service import IconFinderService


def _write_icons(path):
    path.write_text(
        json.dumps(
            {
                "icons": [
                    {"name": "chart-line-bold", "tags": "chart,growth"},
                    {"name": "cloud-rain-bold", "tags": "weather,rain"},
                    {"name": "cloud-rain-thin", "tags": "weather,rain"},
                ]
            }
        ),
        encoding="utf-8",
    )


def test_icon_embedding_index_round_trip_and_normalizes_vectors(tmp_path):
    icons_path = tmp_path / "icons.json"
    index_path = tmp_path / "icons.npz"
    _write_icons(icons_path)
    documents = load_icon_documents(icons_path)

    save_icon_embedding_index(
        index_path,
        documents=documents,
        embeddings=np.asarray([[2.0, 0.0], [0.0, 3.0]], dtype=np.float32),
        model="pptmate-embedding",
    )
    index = load_icon_embedding_index(
        index_path,
        expected_model="pptmate-embedding",
        expected_dimensions=2,
        expected_documents=documents,
    )

    assert index.documents == tuple(documents)
    assert index.corpus_sha256 == icon_corpus_sha256(documents)
    np.testing.assert_allclose(
        index.embeddings,
        np.asarray([[1.0, 0.0], [0.0, 1.0]], dtype=np.float32),
    )


def test_icon_embedding_index_rejects_model_or_corpus_mismatch(tmp_path):
    index_path = tmp_path / "icons.npz"
    documents = ["chart-line-bold||chart,growth"]
    save_icon_embedding_index(
        index_path,
        documents=documents,
        embeddings=np.asarray([[1.0, 0.0]], dtype=np.float32),
        model="pptmate-embedding",
    )

    with pytest.raises(IconEmbeddingIndexError, match="expected 'other-model'"):
        load_icon_embedding_index(
            index_path,
            expected_model="other-model",
            expected_dimensions=2,
            expected_documents=documents,
        )
    with pytest.raises(IconEmbeddingIndexError, match="corpus does not match"):
        load_icon_embedding_index(
            index_path,
            expected_model="pptmate-embedding",
            expected_dimensions=2,
            expected_documents=["cloud-rain-bold||weather,rain"],
        )


def test_openai_icon_finder_uses_cloud_query_in_same_vector_space(
    tmp_path,
    monkeypatch,
):
    icons_path = tmp_path / "icons.json"
    index_path = tmp_path / "icons.npz"
    _write_icons(icons_path)
    documents = load_icon_documents(icons_path)
    save_icon_embedding_index(
        index_path,
        documents=documents,
        embeddings=np.asarray(
            [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
            dtype=np.float32,
        ),
        model="pptmate-embedding",
    )

    monkeypatch.setenv("ICON_EMBEDDER_PROVIDER", "openai")
    monkeypatch.setenv("ICON_EMBEDDING_MODEL", "pptmate-embedding")
    monkeypatch.setenv("ICON_EMBEDDING_DIMENSIONS", "3")
    monkeypatch.setenv("ICON_EMBEDDING_INDEX_PATH", str(index_path))
    monkeypatch.setattr(
        "services.icon_finder_service.get_resource_path",
        lambda path: str(icons_path) if path == "assets/icons.json" else str(tmp_path / path),
    )
    monkeypatch.setattr(
        "services.icon_finder_service.os.path.isfile",
        lambda path: True,
    )

    service = IconFinderService()
    service._embed_openai_query = AsyncMock(
        return_value=np.asarray([0.0, 1.0, 0.0], dtype=np.float32)
    )
    results = asyncio.run(service.search_icons("下雨天气", k=1, weight="regular"))
    empty_results = asyncio.run(service.search_icons("下雨天气", k=0))

    service._embed_openai_query.assert_awaited_once_with("下雨天气")
    assert empty_results == []
    assert len(results) == 1
    assert results[0].endswith("/static/icons/regular/cloud-rain.svg")


def test_openai_query_uses_configured_model_and_bounded_cache(monkeypatch):
    monkeypatch.setenv("ICON_EMBEDDER_PROVIDER", "openai")
    monkeypatch.setenv("ICON_EMBEDDING_MODEL", "pptmate-embedding")
    monkeypatch.setenv("ICON_EMBEDDING_DIMENSIONS", "3")
    service = IconFinderService()
    create = AsyncMock(
        return_value=SimpleNamespace(data=[SimpleNamespace(embedding=[0.0, 4.0, 0.0])])
    )
    service._openai_client = SimpleNamespace(embeddings=SimpleNamespace(create=create))

    first = asyncio.run(service._embed_openai_query("增长趋势"))
    second = asyncio.run(service._embed_openai_query("增长趋势"))

    create.assert_awaited_once_with(
        model="pptmate-embedding",
        input="增长趋势",
    )
    np.testing.assert_allclose(first, np.asarray([0.0, 1.0, 0.0]))
    np.testing.assert_allclose(second, first)
