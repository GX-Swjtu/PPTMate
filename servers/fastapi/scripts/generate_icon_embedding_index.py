"""Generate the versioned icon index through an OpenAI-compatible gateway.

The API key is read from an environment variable or a file and is never accepted
as a command-line value. The platform runs this idempotently in a Kubernetes init
container; Docker builds never call the embedding API.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import numpy as np
from openai import OpenAI
from services.icon_embedding_index import (
    DEFAULT_OPENAI_ICON_INDEX_FILENAME,
    IconEmbeddingIndexError,
    load_icon_documents,
    load_icon_embedding_index,
    save_icon_embedding_index,
)

FASTAPI_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL = "pptmate-embedding"
DEFAULT_DIMENSIONS = 1024
MAX_EMBEDDING_BATCH_SIZE = 10


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--icons",
        type=Path,
        default=FASTAPI_ROOT / "assets" / "icons.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(
            os.getenv("ICON_EMBEDDING_INDEX_PATH")
            or FASTAPI_ROOT / "assets" / DEFAULT_OPENAI_ICON_INDEX_FILENAME
        ),
    )
    parser.add_argument(
        "--base-url",
        default=(
            os.getenv("ICON_EMBEDDING_BASE_URL")
            or os.getenv("OPENAI_BASE_URL")
            or os.getenv("LITELLM_BASE_URL")
            or ""
        ),
    )
    parser.add_argument(
        "--model",
        default=os.getenv("ICON_EMBEDDING_MODEL") or DEFAULT_MODEL,
    )
    parser.add_argument(
        "--dimensions",
        type=int,
        default=int(os.getenv("ICON_EMBEDDING_DIMENSIONS") or DEFAULT_DIMENSIONS),
        help="Expected response dimensions; the value is validated, not sent upstream.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=MAX_EMBEDDING_BATCH_SIZE,
    )
    parser.add_argument(
        "--api-key-file",
        type=Path,
        help="Read the gateway Virtual Key from this file.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate the existing index without making an API request.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate an otherwise valid existing index.",
    )
    return parser.parse_args()


def _read_api_key(api_key_file: Path | None) -> str:
    if api_key_file is not None:
        try:
            lines = api_key_file.read_text(encoding="utf-8").splitlines()
        except OSError as exc:
            raise RuntimeError(f"Unable to read API key file: {api_key_file}") from exc
        if len(lines) != 1 or not lines[0].strip():
            raise RuntimeError("API key file must contain exactly one non-empty line")
        return lines[0].strip()

    return (
        os.getenv("ICON_EMBEDDING_API_KEY")
        or os.getenv("OPENAI_API_KEY")
        or os.getenv("LITELLM_API_KEY")
        or ""
    ).strip()


def _embed_documents(
    client: OpenAI,
    *,
    documents: list[str],
    model: str,
    expected_dimensions: int,
    batch_size: int,
) -> np.ndarray:
    vectors: list[list[float]] = []
    for start in range(0, len(documents), batch_size):
        batch = documents[start : start + batch_size]
        response = client.embeddings.create(model=model, input=batch)
        ordered = sorted(response.data, key=lambda item: item.index)
        if len(ordered) != len(batch):
            raise RuntimeError(
                f"Embedding batch returned {len(ordered)} vectors for {len(batch)} documents"
            )
        for item in ordered:
            if len(item.embedding) != expected_dimensions:
                raise RuntimeError(
                    "Embedding response has "
                    f"{len(item.embedding)} dimensions; expected {expected_dimensions}"
                )
            vectors.append(item.embedding)
        completed = min(start + batch_size, len(documents))
        if completed == len(documents) or completed % 100 == 0:
            print(f"Embedded {completed}/{len(documents)} icons")

    return np.asarray(vectors, dtype=np.float32)


def main() -> int:
    arguments = _arguments()
    model = arguments.model.strip()
    if not model:
        raise RuntimeError("Embedding model must not be empty")
    if arguments.dimensions <= 0:
        raise RuntimeError("Embedding dimensions must be positive")
    if not 1 <= arguments.batch_size <= MAX_EMBEDDING_BATCH_SIZE:
        raise RuntimeError(f"Batch size must be between 1 and {MAX_EMBEDDING_BATCH_SIZE}")

    documents = load_icon_documents(arguments.icons)
    if arguments.check:
        index = load_icon_embedding_index(
            arguments.output,
            expected_model=model,
            expected_dimensions=arguments.dimensions,
            expected_documents=documents,
        )
        print(
            f"Icon index is valid: {len(index.documents)} documents, "
            f"{index.dimensions} dimensions, model {index.model}"
        )
        return 0

    if arguments.output.is_file() and not arguments.force:
        try:
            index = load_icon_embedding_index(
                arguments.output,
                expected_model=model,
                expected_dimensions=arguments.dimensions,
                expected_documents=documents,
            )
        except IconEmbeddingIndexError as exc:
            print(f"Existing icon index is stale and will be regenerated: {exc}")
        else:
            print(
                f"Icon index is already valid: {len(index.documents)} documents, "
                f"{index.dimensions} dimensions, model {index.model}"
            )
            return 0

    base_url = arguments.base_url.strip().rstrip("/")
    api_key = _read_api_key(arguments.api_key_file)
    if not base_url:
        raise RuntimeError("Embedding base URL is required")
    if not api_key:
        raise RuntimeError("Embedding API key is required")

    client = OpenAI(
        api_key=api_key,
        base_url=base_url,
        timeout=90.0,
        max_retries=3,
    )
    embeddings = _embed_documents(
        client,
        documents=documents,
        model=model,
        expected_dimensions=arguments.dimensions,
        batch_size=arguments.batch_size,
    )
    save_icon_embedding_index(
        arguments.output,
        documents=documents,
        embeddings=embeddings,
        model=model,
    )
    print(
        f"Wrote icon index to {arguments.output}: "
        f"{len(documents)} documents, {embeddings.shape[1]} dimensions"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Icon index generation failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        raise SystemExit(1) from None
