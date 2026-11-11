import asyncio
import json
import time
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from unittest.mock import AsyncMock

import numpy as np
import pytest
from services.icon_embedding_index import load_icon_documents, read_icon_embedding_index
from services.icon_finder_service import IconFinderService
from services.icon_index_preparation import pending_index_path, prepare_icon_embedding_index


@pytest.fixture
def setup_index(tmp_path, monkeypatch):
    icons = tmp_path / "icons.json"
    output = tmp_path / "icons.npz"
    state = SimpleNamespace(calls=[], failures=set(), version=1, clients=0, delay=0)

    class Client:
        def __init__(self, **kwargs):
            state.clients += 1
            self.embeddings = self

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def create(self, *, model, input):
            state.calls.append((model, list(input)))
            time.sleep(state.delay)
            if len(state.calls) in state.failures:
                raise RuntimeError("temporary provider failure")
            return SimpleNamespace(
                data=[
                    SimpleNamespace(index=i, embedding=[len(doc), state.version])
                    for i, doc in enumerate(input)
                ]
            )

    monkeypatch.setattr("services.icon_index_preparation.OpenAI", Client)

    def write(tags=("one", "two", "three")):
        icons.write_text(
            json.dumps(
                {"icons": [{"name": f"icon-{i}-bold", "tags": tag} for i, tag in enumerate(tags)]}
            )
        )

    write()
    arguments = dict(
        icons_path=icons,
        output_path=output,
        model="icons",
        dimensions=2,
        base_url="http://gateway/v1",
        api_key="test-key",
        batch_size=2,
    )
    return SimpleNamespace(
        icons=icons, output=output, state=state, write=write, arguments=arguments
    )


def test_valid_index_and_json_formatting_changes_make_no_api_calls(setup_index):
    s = setup_index
    first = prepare_icon_embedding_index(**s.arguments)
    original = s.output.read_bytes()
    s.icons.write_text(json.dumps(json.loads(s.icons.read_text()), indent=4))
    second = prepare_icon_embedding_index(**{**s.arguments, "api_key": "novalue"})
    assert len(s.state.calls) == 2
    assert s.state.clients == 1
    assert s.output.read_bytes() == original
    assert first.generation == second.generation


def test_changed_text_only_embeds_changed_documents_and_removal_is_free(setup_index):
    s = setup_index
    prepare_icon_embedding_index(**s.arguments)
    s.write(("one", "changed", "three", "new"))
    prepare_icon_embedding_index(**s.arguments)
    assert s.state.calls[-1][1] == ["icon-1-bold||changed", "icon-3-bold||new"]
    assert len(s.state.calls) == 3
    s.write(("one", "changed"))
    result = prepare_icon_embedding_index(**s.arguments)
    assert len(s.state.calls) == 3
    assert len(result.documents) == 2


def test_partial_failure_resumes_completed_batches(setup_index):
    s = setup_index
    s.state.failures = {2}
    with pytest.raises(RuntimeError):
        prepare_icon_embedding_index(**s.arguments)
    assert not s.output.exists()
    assert pending_index_path(s.output).exists()
    result = prepare_icon_embedding_index(**s.arguments)
    assert s.state.calls[2][1] == ["icon-2-bold||three"]
    assert len(result.documents) == 3
    assert not pending_index_path(s.output).exists()


def test_forced_rebuild_resumes_without_mixing_old_model_vectors(setup_index):
    s = setup_index
    old = prepare_icon_embedding_index(**s.arguments)
    old_bytes = s.output.read_bytes()
    s.state.version = 100
    s.state.failures = {4}
    with pytest.raises(RuntimeError):
        prepare_icon_embedding_index(**s.arguments, force=True)
    assert s.output.read_bytes() == old_bytes
    new = prepare_icon_embedding_index(**s.arguments)
    assert s.state.calls[-1][1] == ["icon-2-bold||three"]
    assert len(s.state.calls) == 5
    assert old.generation != new.generation
    assert np.all(new.embeddings[:, 1] > 0.9)
    prepare_icon_embedding_index(**s.arguments)
    assert len(s.state.calls) == 5


def test_changed_model_alias_never_reuses_old_vectors(setup_index):
    s = setup_index
    prepare_icon_embedding_index(**s.arguments)
    new = prepare_icon_embedding_index(**{**s.arguments, "model": "other"})
    assert len(s.state.calls) == 4
    assert new.model == "other"


def test_concurrent_preparation_only_pays_once(setup_index):
    s = setup_index
    s.state.delay = 0.05
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(prepare_icon_embedding_index, **s.arguments) for _ in range(2)]
        results = [f.result() for f in futures]
    assert len(s.state.calls) == 2
    assert results[0].generation == results[1].generation


def test_legacy_index_without_generation_is_reused_without_api(setup_index):
    s = setup_index
    prepare_icon_embedding_index(**s.arguments)
    with np.load(s.output, allow_pickle=False) as archive:
        legacy = {key: archive[key] for key in archive.files if key != "generation"}
    np.savez_compressed(s.output, **legacy)
    before = s.output.read_bytes()
    prepare_icon_embedding_index(**s.arguments)
    assert len(s.state.calls) == 2
    assert s.output.read_bytes() == before


@pytest.mark.parametrize("bad", ["duplicate", "dimensions", "nonfinite"])
def test_invalid_provider_batch_never_replaces_previous_index(setup_index, monkeypatch, bad):
    s = setup_index
    prepare_icon_embedding_index(**s.arguments)
    before = s.output.read_bytes()

    class BadClient:
        def __init__(self, **kwargs):
            self.embeddings = self

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def create(self, *, model, input):
            return SimpleNamespace(
                data=[
                    SimpleNamespace(
                        index=0 if bad == "duplicate" else i,
                        embedding=[1.0]
                        if bad == "dimensions"
                        else [1.0, float("nan") if bad == "nonfinite" else 1.0],
                    )
                    for i, _ in enumerate(input)
                ]
            )

    monkeypatch.setattr("services.icon_index_preparation.OpenAI", BadClient)
    with pytest.raises(ValueError):
        prepare_icon_embedding_index(**s.arguments, force=True)
    assert s.output.read_bytes() == before
    assert pending_index_path(s.output).exists()


def test_placeholder_key_never_reaches_provider(setup_index):
    s = setup_index
    with pytest.raises(ValueError, match="not configured"):
        prepare_icon_embedding_index(**{**s.arguments, "api_key": "novalue"})
    assert not s.state.calls
    assert s.state.clients == 0


def test_force_recovers_corrupt_pending_marker(setup_index):
    s = setup_index
    pending_index_path(s.output).write_text("broken")
    with pytest.raises(ValueError):
        prepare_icon_embedding_index(**s.arguments)
    assert not s.state.calls
    prepare_icon_embedding_index(**s.arguments, force=True)
    assert len(s.state.calls) == 2


def _finder(s, monkeypatch):
    monkeypatch.setenv("ICON_EMBEDDER_PROVIDER", "openai")
    monkeypatch.setenv("ICON_EMBEDDING_MODEL", "icons")
    monkeypatch.setenv("ICON_EMBEDDING_DIMENSIONS", "2")
    monkeypatch.setenv("ICON_EMBEDDING_INDEX_PATH", str(s.output))
    monkeypatch.setattr(
        "services.icon_finder_service.get_resource_path",
        lambda p: str(s.icons) if p == "assets/icons.json" else p,
    )
    monkeypatch.setattr(
        IconFinderService,
        "_gateway_credentials",
        staticmethod(lambda: ("test-key", "http://gateway/v1")),
    )
    return IconFinderService()


def test_runtime_initializes_on_demand_and_reloads_manual_rebuild(setup_index, monkeypatch):
    s = setup_index
    finder = _finder(s, monkeypatch)
    assert not s.state.calls  # constructing the app never calls the provider
    finder._embed_openai_query = AsyncMock(return_value=np.asarray([1.0, 0.0]))
    assert asyncio.run(finder.search_icons("sports"))
    assert len(s.state.calls) == 1  # runtime uses one batch for this tiny corpus
    old = finder.embedding_index.generation
    finder._query_embedding_cache["cached"] = np.asarray([1.0, 0.0])
    prepare_icon_embedding_index(**s.arguments, force=True)
    calls = len(s.state.calls)
    assert finder.ensure_initialized()
    assert finder.embedding_index.generation != old
    assert not finder._query_embedding_cache
    assert len(s.state.calls) == calls


def test_runtime_recovers_after_missing_index_is_supplied(setup_index, monkeypatch):
    s = setup_index
    finder = _finder(s, monkeypatch)
    monkeypatch.setattr(finder, "_gateway_credentials", lambda: ("novalue", "http://gateway/v1"))
    assert not finder.ensure_initialized()
    assert not finder.ensure_initialized()
    assert not s.state.calls
    prepare_icon_embedding_index(**s.arguments)
    assert finder.ensure_initialized()  # file change bypasses failure backoff
    assert finder.embedding_index.documents == tuple(load_icon_documents(s.icons))
    assert len(s.state.calls) == 2


def test_runtime_source_change_preserves_unmodified_embeddings(setup_index, monkeypatch):
    s = setup_index
    finder = _finder(s, monkeypatch)
    assert finder.ensure_initialized()
    s.write(("one", "changed", "three"))
    assert finder.ensure_initialized()
    assert s.state.calls[-1][1] == ["icon-1-bold||changed"]
    assert finder.embedding_index.documents == read_icon_embedding_index(s.output).documents


def test_replacement_during_load_is_not_mistaken_for_loaded_version(setup_index, monkeypatch):
    s = setup_index
    prepare_icon_embedding_index(**s.arguments)
    finder = _finder(s, monkeypatch)
    original = finder._initialize_openai_collection

    def load_then_replace():
        original()
        prepare_icon_embedding_index(**s.arguments, force=True)

    monkeypatch.setattr(finder, "_initialize_openai_collection", load_then_replace)
    assert finder.ensure_initialized()
    loaded_generation = finder.embedding_index.generation
    monkeypatch.setattr(finder, "_initialize_openai_collection", original)
    calls = len(s.state.calls)
    assert finder.ensure_initialized()
    assert finder.embedding_index.generation != loaded_generation
    assert len(s.state.calls) == calls


def test_external_rebuild_during_query_reloads_before_scoring(setup_index, monkeypatch):
    s = setup_index
    prepare_icon_embedding_index(**s.arguments)
    finder = _finder(s, monkeypatch)
    assert finder.ensure_initialized()
    old_generation = finder.embedding_index.generation
    query_calls = []

    async def query_embedding(**kwargs):
        query_calls.append(kwargs)
        if len(query_calls) == 1:
            # A separate CLI can replace the on-disk index while the query API
            # request is in flight, without updating this worker's Python object.
            s.state.version = 100
            prepare_icon_embedding_index(**s.arguments, force=True)
        return SimpleNamespace(data=[SimpleNamespace(embedding=[1.0, 100.0])])

    finder._openai_client = SimpleNamespace(
        embeddings=SimpleNamespace(create=AsyncMock(side_effect=query_embedding))
    )
    assert asyncio.run(finder.search_icons("sports"))
    assert finder.embedding_index.generation != old_generation
    assert finder.embedding_index.generation == read_icon_embedding_index(s.output).generation
    assert len(query_calls) == 2
    assert len(s.state.calls) == 4  # initial build + explicit force, no further rebuild
