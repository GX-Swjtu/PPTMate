"""Prepare icon embeddings on demand, reusing paid work across retries and releases."""

from __future__ import annotations

import json
import logging
import os
import tempfile
import uuid
from pathlib import Path

import numpy as np
from filelock import FileLock
from openai import OpenAI

from services.icon_embedding_index import (
    IconEmbeddingIndex,
    IconEmbeddingIndexError,
    icon_corpus_sha256,
    load_icon_documents,
    normalize_embedding_matrix,
    read_icon_embedding_index,
    save_icon_embedding_index,
)

LOGGER = logging.getLogger(__name__)
MAX_EMBEDDING_BATCH_SIZE = 10


def pending_index_path(output: str | Path) -> Path:
    return Path(str(output) + ".pending.json")


def _read_index(path: Path, model: str, dimensions: int) -> IconEmbeddingIndex | None:
    try:
        index = read_icon_embedding_index(path)
    except IconEmbeddingIndexError:
        return None
    return index if index.model == model and index.dimensions == dimensions else None


def _write_json(path: Path, value: dict) -> None:
    fd, name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def prepare_icon_embedding_index(
    *,
    icons_path: str | Path,
    output_path: str | Path,
    model: str,
    dimensions: int,
    base_url: str,
    api_key: str,
    force: bool = False,
    batch_size: int = MAX_EMBEDDING_BATCH_SIZE,
) -> IconEmbeddingIndex:
    """No API calls for valid indexes; only changed text is embedded by default.

    A forced rebuild starts a new vector space, including when the gateway alias
    stays the same. After interruption, run WITHOUT force to resume that generation.
    The pending marker prevents readers from serving an older vector space while
    a forced rebuild is incomplete. Every successful batch is checkpointed.
    """
    if not model.strip() or dimensions <= 0:
        raise ValueError("An embedding model and positive dimensions are required")
    if not 1 <= batch_size <= MAX_EMBEDDING_BATCH_SIZE:
        raise ValueError(f"Batch size must be between 1 and {MAX_EMBEDDING_BATCH_SIZE}")

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    pending = pending_index_path(output)
    checkpoint = Path(str(output) + ".partial.npz")
    # Multiple requests, workers and manual commands share this persistent lock.
    with FileLock(str(output) + ".lock", timeout=900):
        documents = load_icon_documents(icons_path)
        corpus = icon_corpus_sha256(documents)
        current = _read_index(output, model, dimensions)
        if not force and not pending.exists() and current and current.documents == tuple(documents):
            LOGGER.info("Icon index reused: documents=%s embedded=0", len(documents))
            return current

        previous = {}
        if pending.exists() and not force:
            # A corrupt marker must fail closed; never mix an interrupted forced
            # rebuild with vectors from the previous API model under the same alias.
            previous = json.loads(pending.read_text(encoding="utf-8"))
            if not isinstance(previous, dict) or not isinstance(previous.get("generation"), str):
                raise ValueError("Invalid pending icon index generation; use --force to rebuild")
        compatible = previous.get("model") == model and previous.get("dimensions") == dimensions
        resume = bool(previous) and compatible and not force
        generation = previous["generation"] if resume else uuid.uuid4().hex
        full_rebuild = force or (resume and previous.get("force", False))
        state = {
            "generation": generation,
            "model": model,
            "dimensions": dimensions,
            "corpus_sha256": corpus,
            "force": bool(full_rebuild),
        }

        # Recover a crash between publishing the completed index and clearing state.
        if (
            resume
            and current
            and current.generation == generation
            and current.documents == tuple(documents)
        ):
            pending.unlink(missing_ok=True)
            checkpoint.unlink(missing_ok=True)
            return current

        vectors: dict[str, np.ndarray] = {}
        if current and not full_rebuild:
            vectors.update(zip(current.documents, current.embeddings))
        partial = _read_index(checkpoint, model, dimensions) if resume else None
        if partial and partial.generation == generation:
            vectors.update(zip(partial.documents, partial.embeddings))
        vectors = {doc: vectors[doc] for doc in documents if doc in vectors}
        missing = [doc for doc in documents if doc not in vectors]
        if missing and (
            not api_key.strip() or api_key.strip() == "novalue" or not base_url.strip()
        ):
            raise ValueError("Icon embedding gateway credentials are not configured")

        _write_json(pending, state)
        reused = len(vectors)
        if missing:
            with OpenAI(
                api_key=api_key, base_url=base_url.rstrip("/"), timeout=90.0, max_retries=2
            ) as client:
                for start in range(0, len(missing), batch_size):
                    batch = missing[start : start + batch_size]
                    response = client.embeddings.create(model=model, input=batch)
                    ordered = sorted(response.data, key=lambda item: item.index)
                    if [item.index for item in ordered] != list(range(len(batch))):
                        raise ValueError("Icon embedding batch has missing or duplicate indexes")
                    matrix = np.asarray([item.embedding for item in ordered], dtype=np.float32)
                    if matrix.shape != (len(batch), dimensions):
                        raise ValueError(
                            "Icon embedding batch dimensions do not match configuration"
                        )
                    matrix = normalize_embedding_matrix(matrix)
                    vectors.update(zip(batch, matrix))
                    done = [doc for doc in documents if doc in vectors]
                    save_icon_embedding_index(
                        checkpoint,
                        documents=done,
                        embeddings=np.asarray([vectors[doc] for doc in done]),
                        model=model,
                        generation=generation,
                    )
                    LOGGER.info(
                        "Icon index progress: completed=%s total=%s reused=%s",
                        len(done),
                        len(documents),
                        reused,
                    )

        save_icon_embedding_index(
            output,
            documents=documents,
            embeddings=np.asarray([vectors[doc] for doc in documents]),
            model=model,
            generation=generation,
        )
        pending.unlink(missing_ok=True)
        checkpoint.unlink(missing_ok=True)
        LOGGER.info(
            "Icon index ready: documents=%s embedded=%s reused=%s",
            len(documents),
            len(missing),
            reused,
        )
        return read_icon_embedding_index(output)
