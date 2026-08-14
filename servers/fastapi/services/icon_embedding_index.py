from __future__ import annotations

import hashlib
import json
import os
import tempfile
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

import numpy as np

ICON_EMBEDDING_INDEX_SCHEMA_VERSION = 1
DEFAULT_OPENAI_ICON_INDEX_FILENAME = "icons-vectorstore-openai-v1.npz"


class IconEmbeddingIndexError(ValueError):
    pass


@dataclass(frozen=True)
class IconEmbeddingIndex:
    documents: tuple[str, ...]
    embeddings: np.ndarray
    model: str
    dimensions: int
    corpus_sha256: str


def load_icon_documents(icons_path: str | Path) -> list[str]:
    path = Path(icons_path)
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise IconEmbeddingIndexError(f"Unable to read icon metadata: {path}") from exc

    icons = payload.get("icons") if isinstance(payload, dict) else None
    if not isinstance(icons, list):
        raise IconEmbeddingIndexError("Icon metadata is missing the icons list")

    documents: list[str] = []
    for item in icons:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        tags = item.get("tags")
        if not isinstance(name, str) or not name.endswith("-bold"):
            continue
        if isinstance(tags, list):
            tags = ",".join(str(tag) for tag in tags)
        if not isinstance(tags, str):
            tags = ""
        documents.append(f"{name}||{tags}")

    if not documents:
        raise IconEmbeddingIndexError("Icon metadata contains no bold icon documents")
    if len(documents) != len(set(documents)):
        raise IconEmbeddingIndexError("Icon metadata contains duplicate documents")
    return documents


def icon_corpus_sha256(documents: Sequence[str]) -> str:
    canonical = json.dumps(
        list(documents),
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def normalize_embedding_matrix(embeddings: np.ndarray) -> np.ndarray:
    matrix = np.asarray(embeddings, dtype=np.float32)
    if matrix.ndim != 2 or not matrix.shape[0] or not matrix.shape[1]:
        raise IconEmbeddingIndexError("Embedding matrix must be non-empty and two-dimensional")
    if not np.isfinite(matrix).all():
        raise IconEmbeddingIndexError("Embedding matrix contains non-finite values")
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    if np.any(norms <= 0):
        raise IconEmbeddingIndexError("Embedding matrix contains zero-length vectors")
    return np.ascontiguousarray(matrix / norms, dtype=np.float32)


def save_icon_embedding_index(
    output_path: str | Path,
    *,
    documents: Sequence[str],
    embeddings: np.ndarray,
    model: str,
) -> None:
    output = Path(output_path)
    clean_model = model.strip()
    if not clean_model:
        raise IconEmbeddingIndexError("Embedding model must not be empty")

    document_tuple = tuple(documents)
    matrix = normalize_embedding_matrix(embeddings)
    if matrix.shape[0] != len(document_tuple):
        raise IconEmbeddingIndexError("Embedding row count does not match the icon document count")

    output.parent.mkdir(parents=True, exist_ok=True)
    file_descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{output.name}.",
        suffix=".tmp",
        dir=output.parent,
    )
    try:
        with os.fdopen(file_descriptor, "wb") as temporary_file:
            np.savez_compressed(
                temporary_file,
                schema_version=np.asarray(
                    ICON_EMBEDDING_INDEX_SCHEMA_VERSION,
                    dtype=np.int64,
                ),
                model=np.asarray(clean_model),
                dimensions=np.asarray(matrix.shape[1], dtype=np.int64),
                corpus_sha256=np.asarray(icon_corpus_sha256(document_tuple)),
                documents=np.asarray(document_tuple, dtype=np.str_),
                embeddings=matrix,
            )
        os.chmod(temporary_name, 0o644)
        os.replace(temporary_name, output)
    except Exception:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def _read_scalar(archive: np.lib.npyio.NpzFile, name: str) -> object:
    try:
        value = archive[name]
    except KeyError as exc:
        raise IconEmbeddingIndexError(f"Icon index is missing {name}") from exc
    if value.ndim != 0:
        raise IconEmbeddingIndexError(f"Icon index field {name} must be scalar")
    return value.item()


def load_icon_embedding_index(
    index_path: str | Path,
    *,
    expected_model: str,
    expected_dimensions: int,
    expected_documents: Sequence[str],
) -> IconEmbeddingIndex:
    path = Path(index_path)
    try:
        with np.load(path, allow_pickle=False) as archive:
            schema_version = int(_read_scalar(archive, "schema_version"))
            model = str(_read_scalar(archive, "model"))
            dimensions = int(_read_scalar(archive, "dimensions"))
            corpus_sha256 = str(_read_scalar(archive, "corpus_sha256"))
            documents_array = np.asarray(archive["documents"])
            embeddings = np.asarray(archive["embeddings"], dtype=np.float32)
    except IconEmbeddingIndexError:
        raise
    except (OSError, ValueError, KeyError) as exc:
        raise IconEmbeddingIndexError(f"Unable to load icon index: {path}") from exc

    if schema_version != ICON_EMBEDDING_INDEX_SCHEMA_VERSION:
        raise IconEmbeddingIndexError(f"Unsupported icon index schema version: {schema_version}")
    if model != expected_model:
        raise IconEmbeddingIndexError(f"Icon index model is {model!r}; expected {expected_model!r}")
    if dimensions != expected_dimensions:
        raise IconEmbeddingIndexError(
            f"Icon index has {dimensions} dimensions; expected {expected_dimensions}"
        )
    if documents_array.ndim != 1:
        raise IconEmbeddingIndexError("Icon index documents must be one-dimensional")

    documents = tuple(str(document) for document in documents_array.tolist())
    expected_document_tuple = tuple(expected_documents)
    expected_corpus_sha256 = icon_corpus_sha256(expected_document_tuple)
    if documents != expected_document_tuple or corpus_sha256 != expected_corpus_sha256:
        raise IconEmbeddingIndexError("Icon index corpus does not match the bundled icon metadata")
    if embeddings.shape != (len(documents), dimensions):
        raise IconEmbeddingIndexError("Icon index embedding shape does not match its metadata")

    return IconEmbeddingIndex(
        documents=documents,
        embeddings=normalize_embedding_matrix(embeddings),
        model=model,
        dimensions=dimensions,
        corpus_sha256=corpus_sha256,
    )
