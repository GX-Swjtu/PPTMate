from __future__ import annotations

import asyncio
import os
from collections import OrderedDict

import numpy as np
from openai import AsyncOpenAI
from utils.asset_directory_utils import absolute_fastapi_asset_url
from utils.icon_weights import (
    ALLOWED_ICON_WEIGHTS,
    DEFAULT_ICON_WEIGHT,
    normalize_icon_weight,
)
from utils.path_helpers import get_resource_path, get_writable_path

from services.icon_embedding_index import (
    DEFAULT_OPENAI_ICON_INDEX_FILENAME,
    IconEmbeddingIndex,
    load_icon_documents,
    load_icon_embedding_index,
)

LOCAL_ICON_EMBEDDER = "fastembed"
OPENAI_ICON_EMBEDDER = "openai"
DEFAULT_ICON_EMBEDDING_MODEL = "pptmate-embedding"
DEFAULT_ICON_EMBEDDING_DIMENSIONS = 1024
DEFAULT_ICON_QUERY_CACHE_SIZE = 256


def _icon_fastembed_cache_directory() -> str:
    """Return the local ONNX cache used by the upstream FastEmbed fallback."""
    override = (os.getenv("PRESENTON_FASTEMBED_ICON_CACHE_DIR") or "").strip()
    if override:
        path = os.path.abspath(override)
        os.makedirs(path, exist_ok=True)
        return path
    return get_writable_path("fastembed_cache")


def _positive_integer_environment(name: str, default: int) -> int:
    raw = (os.getenv(name) or str(default)).strip()
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


class IconFinderService:
    def __init__(self):
        self.provider = (os.getenv("ICON_EMBEDDER_PROVIDER") or LOCAL_ICON_EMBEDDER).strip().lower()
        self.embedding_model = (
            os.getenv("ICON_EMBEDDING_MODEL") or DEFAULT_ICON_EMBEDDING_MODEL
        ).strip()
        self.embedding_dimensions = _positive_integer_environment(
            "ICON_EMBEDDING_DIMENSIONS",
            DEFAULT_ICON_EMBEDDING_DIMENSIONS,
        )
        self.query_cache_size = _positive_integer_environment(
            "ICON_EMBEDDING_QUERY_CACHE_SIZE",
            DEFAULT_ICON_QUERY_CACHE_SIZE,
        )
        self.cache_directory = (
            _icon_fastembed_cache_directory() if self.provider == LOCAL_ICON_EMBEDDER else ""
        )
        self.model = None
        self.vectorstore = None
        self.embedding_index: IconEmbeddingIndex | None = None
        self._openai_client: AsyncOpenAI | None = None
        self._query_embedding_cache: OrderedDict[str, np.ndarray] = OrderedDict()
        self._initialized = False
        self._initialization_failed = False

    def _initialize_icons_collection(self) -> None:
        if self._initialized or self._initialization_failed:
            return

        self._initialized = True
        try:
            if self.provider == OPENAI_ICON_EMBEDDER:
                self._initialize_openai_collection()
            elif self.provider == LOCAL_ICON_EMBEDDER:
                self._initialize_fastembed_collection()
            else:
                raise ValueError(f"Unsupported icon embedder provider: {self.provider}")
        except Exception as exc:
            print(f"Warning: Could not initialize icon finder service: {type(exc).__name__}: {exc}")
            print("Icon search will be disabled.")
            self._initialization_failed = True
            self.vectorstore = None
            self.embedding_index = None

    def _initialize_openai_collection(self) -> None:
        icons_path = get_resource_path("assets/icons.json")
        configured_index_path = (os.getenv("ICON_EMBEDDING_INDEX_PATH") or "").strip()
        if configured_index_path:
            index_path = (
                configured_index_path
                if os.path.isabs(configured_index_path)
                else get_resource_path(configured_index_path)
            )
        else:
            index_path = get_resource_path(f"assets/{DEFAULT_OPENAI_ICON_INDEX_FILENAME}")

        documents = load_icon_documents(icons_path)
        self.embedding_index = load_icon_embedding_index(
            index_path,
            expected_model=self.embedding_model,
            expected_dimensions=self.embedding_dimensions,
            expected_documents=documents,
        )
        print(
            "[IconFinder] Loaded OpenAI-compatible icon index "
            f"({len(documents)} documents, {self.embedding_dimensions} dimensions)"
        )

    def _initialize_fastembed_collection(self) -> None:
        # Keep the upstream local provider available for non-platform builds. Imports are
        # lazy so the NGL platform runtime does not load ONNX when cloud embeddings are used.
        from fastembed_vectorstore import (
            FastembedEmbeddingModel,
            FastembedVectorstore,
        )

        self.model = FastembedEmbeddingModel.AllMiniLML6V2
        os.makedirs(self.cache_directory, exist_ok=True)

        bundled_vectorstore_path = get_resource_path("assets/icons-vectorstore.json")
        writable_assets_dir = get_writable_path("assets")
        writable_vectorstore_path = os.path.join(
            writable_assets_dir,
            "icons-vectorstore.json",
        )
        icons_path = get_resource_path("assets/icons.json")

        vectorstore_path = None
        if os.path.isfile(bundled_vectorstore_path):
            vectorstore_path = bundled_vectorstore_path
        elif os.path.isfile(writable_vectorstore_path):
            vectorstore_path = writable_vectorstore_path

        if vectorstore_path:
            self.vectorstore = FastembedVectorstore.load(
                self.model,
                vectorstore_path,
                cache_directory=self.cache_directory,
            )
            print("[IconFinder] Local FastEmbed vector store loaded")
            return

        if not os.path.isfile(icons_path):
            raise FileNotFoundError(f"Icon metadata is unavailable: {icons_path}")

        documents = load_icon_documents(icons_path)
        self.vectorstore = FastembedVectorstore(
            self.model,
            cache_directory=self.cache_directory,
        )
        if not self.vectorstore.embed_documents(documents):
            raise RuntimeError("FastEmbed could not embed the icon documents")
        os.makedirs(os.path.dirname(writable_vectorstore_path), exist_ok=True)
        self.vectorstore.save(writable_vectorstore_path)
        print(f"[IconFinder] Local vector store saved to {writable_vectorstore_path}")

    def ensure_initialized(self) -> bool:
        if not self._initialized and not self._initialization_failed:
            self._initialize_icons_collection()
        if self._initialization_failed:
            return False
        if self.provider == OPENAI_ICON_EMBEDDER:
            return self.embedding_index is not None
        return self.vectorstore is not None

    def _get_openai_client(self) -> AsyncOpenAI:
        if self._openai_client is not None:
            return self._openai_client

        api_key = (
            os.getenv("ICON_EMBEDDING_API_KEY")
            or os.getenv("OPENAI_API_KEY")
            or os.getenv("LITELLM_API_KEY")
            or ""
        ).strip()
        base_url = (
            os.getenv("ICON_EMBEDDING_BASE_URL")
            or os.getenv("OPENAI_BASE_URL")
            or os.getenv("LITELLM_BASE_URL")
            or ""
        ).strip()
        if not api_key:
            raise RuntimeError("Icon embedding API key is unavailable")
        if not base_url:
            raise RuntimeError("Icon embedding base URL is unavailable")

        self._openai_client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url.rstrip("/"),
            timeout=30.0,
            max_retries=2,
        )
        return self._openai_client

    async def _embed_openai_query(self, query: str) -> np.ndarray:
        cached = self._query_embedding_cache.get(query)
        if cached is not None:
            self._query_embedding_cache.move_to_end(query)
            return cached

        response = await self._get_openai_client().embeddings.create(
            model=self.embedding_model,
            input=query,
        )
        if not response.data:
            raise RuntimeError("Icon embedding response contains no vectors")
        vector = np.asarray(response.data[0].embedding, dtype=np.float32)
        if vector.ndim != 1 or vector.shape[0] != self.embedding_dimensions:
            actual_dimensions = vector.shape[0] if vector.ndim == 1 else 0
            raise RuntimeError(
                "Icon query embedding has "
                f"{actual_dimensions} dimensions; expected {self.embedding_dimensions}"
            )
        if not np.isfinite(vector).all():
            raise RuntimeError("Icon query embedding contains non-finite values")
        norm = float(np.linalg.norm(vector))
        if norm <= 0:
            raise RuntimeError("Icon query embedding has zero length")
        normalized = np.ascontiguousarray(vector / norm, dtype=np.float32)

        self._query_embedding_cache[query] = normalized
        self._query_embedding_cache.move_to_end(query)
        while len(self._query_embedding_cache) > self.query_cache_size:
            self._query_embedding_cache.popitem(last=False)
        return normalized

    @staticmethod
    def _base_icon_name(icon_name: str) -> str:
        name = icon_name.split("||")[0]
        for weight in ALLOWED_ICON_WEIGHTS:
            suffix = f"-{weight}"
            if name.endswith(suffix):
                return name[: -len(suffix)]
        return name

    @staticmethod
    def _icon_filename_for_weight(base_name: str, weight: str) -> str:
        if weight == "regular":
            return f"{base_name}.svg"
        return f"{base_name}-{weight}.svg"

    def _icon_url_for_weight(self, icon_name: str, weight: str) -> str:
        normalized_weight = normalize_icon_weight(weight)
        base_name = self._base_icon_name(icon_name)
        filename = self._icon_filename_for_weight(base_name, normalized_weight)
        relative_path = f"static/icons/{normalized_weight}/{filename}"
        if not os.path.isfile(get_resource_path(relative_path)):
            normalized_weight = DEFAULT_ICON_WEIGHT
            filename = self._icon_filename_for_weight(base_name, normalized_weight)

        return absolute_fastapi_asset_url(f"/static/icons/{normalized_weight}/{filename}")

    async def _search_openai(self, query: str, k: int) -> list[str]:
        if self.embedding_index is None:
            return []
        query_embedding = await self._embed_openai_query(query)
        scores = self.embedding_index.embeddings @ query_embedding
        selected = np.argsort(-scores, kind="stable")[:k]
        return [self.embedding_index.documents[int(index)] for index in selected]

    async def search_icons(
        self,
        query: str,
        k: int = 1,
        weight: str | None = None,
    ) -> list[str]:
        normalized_query = " ".join(query.split())
        try:
            requested_results = int(k)
        except TypeError:
            return []
        except ValueError:
            return []
        if requested_results <= 0:
            return []
        if not normalized_query or not self.ensure_initialized():
            return []

        try:
            if self.provider == OPENAI_ICON_EMBEDDER:
                embedding_index = self.embedding_index
                if embedding_index is None:
                    return []
                result_count = min(requested_results, len(embedding_index.documents))
                documents = await self._search_openai(normalized_query, result_count)
            else:
                result = await asyncio.to_thread(
                    self.vectorstore.search,
                    normalized_query,
                    requested_results,
                )
                documents = [item[0] for item in result]

            icon_weight = normalize_icon_weight(weight)
            return [self._icon_url_for_weight(document, icon_weight) for document in documents]
        except Exception as exc:
            print(f"Icon search error: {type(exc).__name__}: {exc}")
            return []


ICON_FINDER_SERVICE = IconFinderService()
