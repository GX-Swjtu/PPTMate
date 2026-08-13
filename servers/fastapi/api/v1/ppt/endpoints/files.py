import os
from typing import Annotated, List, Optional
from fastapi import APIRouter, Body, File, HTTPException, UploadFile

from constants.documents import UPLOAD_ACCEPTED_FILE_TYPES
from models.decomposed_file_info import DecomposedFileInfo
from services.temp_file_service import TEMP_FILE_SERVICE
from services.documents_loader import DocumentsLoader
import uuid
from utils.validators import validate_files
from api.v1.auth.oidc import is_platform_mode

FILES_ROUTER = APIRouter(prefix="/files", tags=["Files"])
MAX_UPLOAD_FILES = 8
MAX_UPLOAD_BYTES = 100 * 1024 * 1024
UPLOAD_CHUNK_BYTES = 1024 * 1024


async def _stream_upload_to_path(file: UploadFile, target: str) -> None:
    written = 0
    try:
        with open(target, "xb") as handle:
            while chunk := await file.read(UPLOAD_CHUNK_BYTES):
                written += len(chunk)
                if written > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File '{file.filename}' exceeded max upload size of 100 MB",
                    )
                handle.write(chunk)
    except Exception:
        try:
            os.remove(target)
        except FileNotFoundError:
            pass
        raise


@FILES_ROUTER.post("/upload", response_model=List[str])
async def upload_files(files: Optional[List[UploadFile]]):
    if not files:
        raise HTTPException(400, "Documents are required")
    if len(files) > MAX_UPLOAD_FILES:
        raise HTTPException(
            status_code=413 if is_platform_mode() else 400,
            detail=f"A maximum of {MAX_UPLOAD_FILES} documents may be uploaded",
        )
    if is_platform_mode() and any(
        (file.size or 0) > MAX_UPLOAD_BYTES for file in files
    ):
        raise HTTPException(status_code=413, detail="A document exceeded 100 MB")

    temp_dir = TEMP_FILE_SERVICE.create_temp_dir(str(uuid.uuid4()))

    validate_files(files, True, True, 100, UPLOAD_ACCEPTED_FILE_TYPES)

    temp_files: List[str] = []
    try:
        if files:
            for each_file in files:
                file_dir = TEMP_FILE_SERVICE.create_dir_in_dir(
                    temp_dir, str(uuid.uuid4())
                )
                temp_path = TEMP_FILE_SERVICE.create_temp_file_path(
                    each_file.filename, file_dir
                )
                await _stream_upload_to_path(each_file, temp_path)
                temp_files.append(temp_path)
    except Exception:
        TEMP_FILE_SERVICE.cleanup_temp_dir(temp_dir)
        raise

    return temp_files


@FILES_ROUTER.post("/decompose", response_model=List[DecomposedFileInfo])
async def decompose_files(
    file_paths: Annotated[List[str], Body(embed=True)],
    language: Annotated[Optional[str], Body()] = None,
):
    working_dir = TEMP_FILE_SERVICE.create_temp_dir(str(uuid.uuid4()))
    output_dir = TEMP_FILE_SERVICE.create_temp_dir(str(uuid.uuid4()))
    resolved_file_paths = TEMP_FILE_SERVICE.resolve_existing_temp_paths(file_paths)

    txt_files = []
    other_files = []
    for file_path in resolved_file_paths:
        if file_path.endswith(".txt"):
            txt_files.append(file_path)
        else:
            other_files.append(file_path)

    response = []
    try:
        documents_loader = DocumentsLoader(
            file_paths=other_files, presentation_language=language
        )
        await documents_loader.load_documents(working_dir)
        parsed_items = [
            (os.path.basename(other_files[index]), parsed_doc)
            for index, parsed_doc in enumerate(documents_loader.documents)
        ]
        parsed_items.extend(
            (
                os.path.basename(each_file),
                str(TEMP_FILE_SERVICE.read_temp_file(each_file, binary=False)),
            )
            for each_file in txt_files
        )
        for original_name, parsed_doc in parsed_items:
            file_path = TEMP_FILE_SERVICE.create_temp_file_path(
                f"{uuid.uuid4()}-{os.path.splitext(original_name)[0]}.txt",
                output_dir,
            )
            parsed_doc = parsed_doc.replace("<br>", "\n")
            with open(file_path, "w", encoding="utf-8") as text_file:
                text_file.write(parsed_doc)
            response.append(
                DecomposedFileInfo(name=original_name, file_path=file_path)
            )
    except Exception:
        TEMP_FILE_SERVICE.cleanup_temp_dir(output_dir)
        raise
    finally:
        TEMP_FILE_SERVICE.cleanup_temp_dir(working_dir)
        # Originals are request-scoped. Only normalized text survives until
        # deck creation promotes it to owner-confined persistent storage.
        for each_file in resolved_file_paths:
            try:
                TEMP_FILE_SERVICE.cleanup_temp_file(each_file)
            except (HTTPException, OSError):
                pass

    return response


@FILES_ROUTER.post("/update")
async def update_files(
    file_path: Annotated[str, Body()],
    file: Annotated[UploadFile, File()],
):
    if is_platform_mode() and (file.size or 0) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="A document exceeded 100 MB")
    validate_files(file, False, False, 100, UPLOAD_ACCEPTED_FILE_TYPES)
    await TEMP_FILE_SERVICE.update_temp_file_from_upload(file_path, file)

    return {"message": "File updated successfully"}
