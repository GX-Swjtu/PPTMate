from __future__ import annotations

import os
import shutil
import uuid
from collections.abc import Iterable
from pathlib import Path

from fastapi import HTTPException

from api.v1.auth.context import get_current_owner_id
from services.temp_file_service import TEMP_FILE_SERVICE
from utils.get_env import get_app_data_directory_env


class SourceDocumentService:
    """Owner-confined durable text sources attached to one presentation."""

    @property
    def base_dir(self) -> str:
        return os.path.realpath(
            os.path.join(get_app_data_directory_env(), "source-documents", "users")
        )

    def _owner_id(self) -> uuid.UUID:
        owner_id = get_current_owner_id()
        if owner_id is None:
            raise HTTPException(status_code=401, detail="Authenticated owner required")
        return owner_id

    def _owner_root(self) -> str:
        root = os.path.realpath(os.path.join(self.base_dir, str(self._owner_id())))
        if not root.startswith(f"{self.base_dir}{os.sep}"):
            raise HTTPException(status_code=400, detail="Invalid source document owner")
        os.makedirs(root, mode=0o700, exist_ok=True)
        return root

    @staticmethod
    def _is_within(path: str, root: str) -> bool:
        return path == root or path.startswith(f"{root}{os.sep}")

    def presentation_dir(self, presentation_id: uuid.UUID) -> str:
        owner_root = self._owner_root()
        path = os.path.realpath(os.path.join(owner_root, str(presentation_id)))
        if not self._is_within(path, owner_root):
            raise HTTPException(
                status_code=400, detail="Invalid presentation source path"
            )
        return path

    def resolve_source_path(self, file_path: str, *, must_exist: bool = False) -> str:
        if not isinstance(file_path, str) or not file_path.strip():
            raise HTTPException(status_code=400, detail="Invalid source document path")
        owner_root = self._owner_root()
        absolute = os.path.abspath(file_path)
        if not self._is_within(absolute, owner_root):
            raise HTTPException(status_code=404, detail="Source document not found")
        relative_lexical = Path(absolute).relative_to(owner_root)
        cursor = Path(owner_root)
        for part in relative_lexical.parts:
            cursor /= part
            if cursor.is_symlink():
                raise HTTPException(status_code=404, detail="Source document not found")
        resolved = os.path.realpath(absolute)
        if not self._is_within(resolved, owner_root):
            raise HTTPException(status_code=404, detail="Source document not found")
        relative = Path(resolved).relative_to(owner_root)
        if len(relative.parts) < 2 or relative.parts[0].startswith("."):
            raise HTTPException(status_code=404, detail="Source document not found")
        if must_exist and not os.path.isfile(resolved):
            raise HTTPException(status_code=404, detail="Source document not found")
        return resolved

    def resolve_document_path(self, file_path: str, *, must_exist: bool = False) -> str:
        try:
            return TEMP_FILE_SERVICE.resolve_temp_path(file_path, must_exist=must_exist)
        except HTTPException:
            return self.resolve_source_path(file_path, must_exist=must_exist)

    def resolve_document_paths(self, file_paths: Iterable[str]) -> list[str]:
        return [
            self.resolve_document_path(path, must_exist=True) for path in file_paths
        ]

    def promote_temp_documents(
        self, presentation_id: uuid.UUID, file_paths: Iterable[str]
    ) -> list[str]:
        resolved = [
            TEMP_FILE_SERVICE.resolve_temp_path(path, must_exist=True)
            for path in file_paths
        ]
        if not resolved:
            return []
        owner_root = self._owner_root()
        destination = self.presentation_dir(presentation_id)
        if os.path.exists(destination):
            raise HTTPException(
                status_code=409, detail="Presentation source directory exists"
            )
        staging = os.path.realpath(
            os.path.join(owner_root, f".staging-{presentation_id}-{uuid.uuid4()}")
        )
        if not self._is_within(staging, owner_root):
            raise HTTPException(status_code=400, detail="Invalid source staging path")
        os.makedirs(staging, mode=0o700)
        promoted: list[str] = []
        try:
            for source in resolved:
                if Path(source).suffix.lower() != ".txt":
                    raise HTTPException(
                        status_code=400,
                        detail="Documents must be decomposed before presentation creation",
                    )
                safe_stem = TEMP_FILE_SERVICE.sanitize_upload_filename(
                    Path(source).stem
                )[:120]
                target = os.path.join(staging, f"{uuid.uuid4()}-{safe_stem}.txt")
                shutil.copyfile(source, target, follow_symlinks=False)
                os.chmod(target, 0o600)
                promoted.append(target)
            os.replace(staging, destination)
            promoted = [
                os.path.join(destination, os.path.basename(path)) for path in promoted
            ]
        except Exception:
            shutil.rmtree(staging, ignore_errors=True)
            raise
        for source in resolved:
            try:
                TEMP_FILE_SERVICE.cleanup_temp_file(source)
                self._remove_empty_temp_parents(os.path.dirname(source))
            except (HTTPException, OSError):
                # Durable promotion has already completed atomically. Temp
                # cleanup is best-effort and must not orphan the new deck.
                continue
        return promoted

    def append_text_documents(
        self,
        presentation_id: uuid.UUID,
        documents: Iterable[tuple[str, str]],
    ) -> list[str]:
        destination = self.presentation_dir(presentation_id)
        os.makedirs(destination, mode=0o700, exist_ok=True)
        created: list[str] = []
        temporary: str | None = None
        try:
            for display_name, content in documents:
                safe_stem = TEMP_FILE_SERVICE.sanitize_upload_filename(
                    Path(display_name).stem or "document"
                )[:120]
                target = os.path.join(destination, f"{uuid.uuid4()}-{safe_stem}.txt")
                temporary = f"{target}.tmp"
                with open(temporary, "w", encoding="utf-8") as handle:
                    handle.write(content)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.chmod(temporary, 0o600)
                os.replace(temporary, target)
                temporary = None
                created.append(target)
        except Exception:
            if temporary:
                try:
                    os.remove(temporary)
                except FileNotFoundError:
                    pass
            for path in created:
                try:
                    os.remove(path)
                except FileNotFoundError:
                    pass
            raise
        return created

    def duplicate_presentation(
        self,
        source_id: uuid.UUID,
        destination_id: uuid.UUID,
        source_paths: Iterable[str],
    ) -> list[str]:
        source_dir = self.presentation_dir(source_id)
        if not os.path.isdir(source_dir):
            return []
        resolved_sources: list[str] = []
        for source_path in source_paths:
            source = self.resolve_source_path(source_path, must_exist=True)
            if os.path.dirname(source) != source_dir or os.path.islink(source):
                raise HTTPException(status_code=404, detail="Source document not found")
            resolved_sources.append(source)
        if not resolved_sources:
            return []

        owner_root = self._owner_root()
        destination_dir = self.presentation_dir(destination_id)
        if os.path.exists(destination_dir):
            raise HTTPException(
                status_code=409, detail="Presentation source directory exists"
            )
        staging = os.path.join(owner_root, f".staging-{destination_id}-{uuid.uuid4()}")
        os.makedirs(staging, mode=0o700)
        try:
            copied_names: list[str] = []
            for source in resolved_sources:
                filename = os.path.basename(source)
                target = os.path.join(staging, filename)
                shutil.copyfile(source, target, follow_symlinks=False)
                os.chmod(target, 0o600)
                copied_names.append(filename)
            os.replace(staging, destination_dir)
        except Exception:
            shutil.rmtree(staging, ignore_errors=True)
            raise
        return [os.path.join(destination_dir, name) for name in copied_names]

    def remove_documents(self, file_paths: Iterable[str]) -> None:
        for file_path in file_paths:
            resolved = self.resolve_source_path(file_path)
            try:
                if os.path.islink(resolved):
                    raise HTTPException(
                        status_code=400,
                        detail="Symbolic links are not allowed in source documents",
                    )
                os.remove(resolved)
            except FileNotFoundError:
                continue

    def stage_delete(self, presentation_id: uuid.UUID) -> str | None:
        source_dir = self.presentation_dir(presentation_id)
        if not os.path.isdir(source_dir):
            return None
        owner_root = self._owner_root()
        trash = os.path.join(owner_root, f".trash-{presentation_id}-{uuid.uuid4()}")
        os.replace(source_dir, trash)
        return trash

    def restore_staged_delete(
        self, presentation_id: uuid.UUID, trash: str | None
    ) -> None:
        if not trash or not os.path.exists(trash):
            return
        os.replace(trash, self.presentation_dir(presentation_id))

    def purge_staged_delete(self, trash: str | None) -> None:
        if not trash:
            return
        owner_root = self._owner_root()
        resolved = os.path.realpath(trash)
        if not self._is_within(resolved, owner_root) or not os.path.basename(
            resolved
        ).startswith(".trash-"):
            raise HTTPException(status_code=400, detail="Invalid source trash path")
        shutil.rmtree(resolved, ignore_errors=True)

    def _remove_empty_temp_parents(self, directory: str) -> None:
        owner_root = TEMP_FILE_SERVICE._owner_base_dir_realpath()
        current = os.path.realpath(directory)
        while current != owner_root and self._is_within(current, owner_root):
            try:
                os.rmdir(current)
            except OSError:
                break
            current = os.path.dirname(current)


SOURCE_DOCUMENT_SERVICE = SourceDocumentService()
