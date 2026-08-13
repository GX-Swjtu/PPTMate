import os
import uuid
from pathlib import Path

import pytest
from fastapi import HTTPException

from api.v1.auth.context import reset_current_owner_id, set_current_owner_id
from services.source_document_service import SOURCE_DOCUMENT_SERVICE
from services.temp_file_service import TEMP_FILE_SERVICE


def _configure_storage(monkeypatch, tmp_path, owner_id):
    monkeypatch.setenv("APP_DATA_DIRECTORY", str(tmp_path / "app-data"))
    monkeypatch.setattr(TEMP_FILE_SERVICE, "base_dir", str(tmp_path / "temp"))
    return set_current_owner_id(owner_id)


def test_promote_duplicate_and_delete_sources_are_owner_confined(monkeypatch, tmp_path):
    owner_id = uuid.uuid4()
    owner_token = _configure_storage(monkeypatch, tmp_path, owner_id)
    try:
        upload_dir = TEMP_FILE_SERVICE.create_temp_dir(str(uuid.uuid4()))
        first = TEMP_FILE_SERVICE.create_temp_file(
            "first.txt", "first document", upload_dir
        )
        second = TEMP_FILE_SERVICE.create_temp_file(
            "second.txt", "second document", upload_dir
        )
        source_presentation = uuid.uuid4()

        promoted = SOURCE_DOCUMENT_SERVICE.promote_temp_documents(
            source_presentation, [second, first]
        )

        expected_root = (
            tmp_path
            / "app-data"
            / "source-documents"
            / "users"
            / str(owner_id)
            / str(source_presentation)
        ).resolve()
        assert [Path(path).read_text(encoding="utf-8") for path in promoted] == [
            "second document",
            "first document",
        ]
        assert all(Path(path).resolve().parent == expected_root for path in promoted)
        assert not Path(first).exists()
        assert not Path(second).exists()
        assert all(os.stat(path).st_mode & 0o777 == 0o600 for path in promoted)

        duplicate_id = uuid.uuid4()
        duplicated = SOURCE_DOCUMENT_SERVICE.duplicate_presentation(
            source_presentation, duplicate_id, promoted
        )
        assert [Path(path).read_text(encoding="utf-8") for path in duplicated] == [
            "second document",
            "first document",
        ]
        assert [Path(path).name for path in duplicated] == [
            Path(path).name for path in promoted
        ]

        trash = SOURCE_DOCUMENT_SERVICE.stage_delete(source_presentation)
        assert trash is not None
        assert not expected_root.exists()
        SOURCE_DOCUMENT_SERVICE.purge_staged_delete(trash)
        assert not Path(trash).exists()
    finally:
        reset_current_owner_id(owner_token)


def test_other_owner_and_symbolic_link_cannot_read_source(monkeypatch, tmp_path):
    first_owner = uuid.uuid4()
    owner_token = _configure_storage(monkeypatch, tmp_path, first_owner)
    try:
        presentation_id = uuid.uuid4()
        created = SOURCE_DOCUMENT_SERVICE.append_text_documents(
            presentation_id, [("reference.pdf", "private text")]
        )[0]
        symlink = Path(created).with_name("link.txt")
        symlink.symlink_to(created)
        with pytest.raises(HTTPException) as linked:
            SOURCE_DOCUMENT_SERVICE.resolve_source_path(str(symlink), must_exist=True)
        assert linked.value.status_code == 404
    finally:
        reset_current_owner_id(owner_token)

    other_token = set_current_owner_id(uuid.uuid4())
    try:
        with pytest.raises(HTTPException) as denied:
            SOURCE_DOCUMENT_SERVICE.resolve_source_path(created, must_exist=True)
        assert denied.value.status_code == 404
    finally:
        reset_current_owner_id(other_token)


def test_raw_upload_cannot_bypass_document_decomposition(monkeypatch, tmp_path):
    owner_token = _configure_storage(monkeypatch, tmp_path, uuid.uuid4())
    try:
        upload_dir = TEMP_FILE_SERVICE.create_temp_dir(str(uuid.uuid4()))
        raw_pdf = TEMP_FILE_SERVICE.create_temp_file(
            "source.pdf", b"%PDF-1.7", upload_dir
        )
        with pytest.raises(HTTPException) as invalid:
            SOURCE_DOCUMENT_SERVICE.promote_temp_documents(uuid.uuid4(), [raw_pdf])
        assert invalid.value.status_code == 400
        assert Path(raw_pdf).exists()
    finally:
        reset_current_owner_id(owner_token)
