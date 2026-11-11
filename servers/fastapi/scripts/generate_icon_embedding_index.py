"""Generate the versioned icon index through an OpenAI-compatible gateway.

The API key is read from an environment variable or a file and is never accepted
as a command-line value. Valid indexes are reused without calling the API.
Runtime icon searches prepare missing/stale indexes on demand; Docker builds
and readiness probes never do so.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

from services.icon_embedding_index import (
    DEFAULT_OPENAI_ICON_INDEX_FILENAME,
    load_icon_documents,
    load_icon_embedding_index,
)
from services.icon_index_preparation import (
    MAX_EMBEDDING_BATCH_SIZE,
    pending_index_path,
    prepare_icon_embedding_index,
)

FASTAPI_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL = "pptmate-embedding"
DEFAULT_DIMENSIONS = 1024


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
        help=(
            "Start a fresh full rebuild after an API model change. "
            "Resume interrupted builds WITHOUT --force."
        ),
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
        if pending_index_path(arguments.output).exists():
            raise RuntimeError("Icon index rebuild is incomplete; run without --force to resume")
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

    index = prepare_icon_embedding_index(
        icons_path=arguments.icons,
        output_path=arguments.output,
        model=model,
        dimensions=arguments.dimensions,
        base_url=arguments.base_url.strip(),
        api_key=_read_api_key(arguments.api_key_file),
        force=arguments.force,
        batch_size=arguments.batch_size,
    )
    print(
        f"Icon index is ready: {len(index.documents)} documents, "
        f"{index.dimensions} dimensions, model {index.model}"
    )
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(
            f"Icon index generation failed: {type(exc).__name__}. "
            "Completed batches are retained; retry without --force.",
            file=sys.stderr,
        )
        raise SystemExit(1) from None
