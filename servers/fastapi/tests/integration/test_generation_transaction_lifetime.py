"""Slow external work must not keep a database transaction or connection open."""

import asyncio
import os
import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, Mock

import pytest
from api import middlewares
from api.v1.auth.context import get_current_owner_id
from api.v1.auth.principal import AuthPrincipal
from api.v1.ppt.endpoints import outlines
from api.v1.ppt.endpoints import presentation as endpoint
from fastapi import HTTPException
from models.presentation_outline_model import SlideOutlineModel
from models.presentation_structure_model import PresentationStructureModel
from models.sql.presentation import PresentationModel, PresentationVersion
from models.sql.slide import SlideModel
from models.sql.template_v2 import TemplateV2
from models.sql.user import User
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from starlette.requests import Request
from starlette.responses import Response
from templates.presentation_layout import PresentationLayoutModel, SlideLayoutModel


@asynccontextmanager
async def database(tmp_path):
    # PostgreSQL runs use a disposable database; each test owns a random schema.
    url = os.getenv("PPTMATE_TRANSACTION_TEST_DATABASE_URL")
    schema = f"transaction_test_{uuid.uuid4().hex}"
    engine = create_async_engine(url or f"sqlite+aiosqlite:///{tmp_path / 'test.db'}")
    if url:
        engine = engine.execution_options(schema_translate_map={None: schema})
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with engine.begin() as connection:
            if url:
                await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
            for model in (User, PresentationModel, SlideModel, TemplateV2):
                await connection.run_sync(model.__table__.create)
        yield engine, sessions
    finally:
        if url:
            async with engine.begin() as connection:
                await connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        await engine.dispose()


def deck():
    return PresentationModel(
        version=PresentationVersion.V2_STANDARD,
        content="Transaction regression",
        n_slides=1,
        language="English",
        title="Deck",
        outlines={"slides": [{"content": "## Intro"}]},
        structure={"slides": [0]},
        layout={"layouts": [{"id": "hero", "components": []}]},
    )


async def assert_released(engine, session):
    assert not session.in_transaction()
    assert engine.pool.checkedout() == 0
    if engine.dialect.name == "postgresql":
        async with engine.connect() as connection:
            count = await connection.scalar(
                text(
                    "SELECT count(*) FROM pg_stat_activity "
                    "WHERE datname = current_database() AND pid <> pg_backend_pid() "
                    "AND xact_start IS NOT NULL"
                )
            )
            assert count == 0


@pytest.mark.parametrize("outcome", ["success", "http_error", "error", "cancel"])
def test_standard_stream_releases_transaction_and_preserves_saved_slides(
    tmp_path, monkeypatch, outcome
):
    async def run():
        async with database(tmp_path) as (engine, sessions):
            async with sessions() as session:
                presentation = deck()
                old_slide = SlideModel(
                    presentation=presentation.id,
                    index=0,
                    layout_group="old",
                    layout="old",
                    content={"title": "Saved"},
                )
                session.add_all([presentation, old_slide])
                await session.commit()
                presentation_id, old_slide_id = presentation.id, old_slide.id

            async with sessions() as session:
                generated = []

                async def generate(*_args, **_kwargs):
                    await assert_released(engine, session)
                    generated.append(True)
                    if outcome == "http_error":
                        raise HTTPException(400, "No content")
                    if outcome == "error":
                        raise ValueError("Malformed JSON")
                    if outcome == "cancel":
                        raise asyncio.CancelledError()
                    return {"title": "Generated"}

                async def assets(*_args, **_kwargs):
                    await assert_released(engine, session)
                    return []

                monkeypatch.setattr(endpoint, "get_slide_content_from_type_and_outline", generate)
                monkeypatch.setattr(endpoint, "process_slide_and_fetch_assets", assets)
                monkeypatch.setattr(endpoint, "ImageGenerationService", Mock())
                monkeypatch.setattr(endpoint, "get_images_directory", lambda: str(tmp_path))
                response = await endpoint.stream_presentation(presentation_id, session)
                chunks = [chunk async for chunk in response.body_iterator]
                assert generated == [True]
                await assert_released(engine, session)
            async with sessions() as session:
                slides = list(await session.scalars(select(SlideModel)))
                assert len(slides) == 1
                if outcome == "success":
                    assert slides[0].content == {"title": "Generated"}
                    assert any('"presentation"' in chunk for chunk in chunks)
                else:
                    assert slides[0].id == old_slide_id
                    if outcome != "cancel":
                        assert any('"error"' in chunk for chunk in chunks)

    asyncio.run(run())


def test_outline_stream_releases_transaction_before_memory_and_model(tmp_path, monkeypatch):
    async def run():
        async with database(tmp_path) as (engine, sessions):
            async with sessions() as session:
                presentation = deck()
                session.add(presentation)
                await session.commit()
                presentation_id = presentation.id
            async with sessions() as session:

                async def external(*_args, **_kwargs):
                    await assert_released(engine, session)

                async def generate(*_args, **_kwargs):
                    await assert_released(engine, session)
                    yield '{"slides":[{"content":"## Generated"}]}'

                for method in ("store_generation_context", "store_generated_outlines"):
                    monkeypatch.setattr(outlines.MEM0_PRESENTATION_MEMORY_SERVICE, method, external)
                monkeypatch.setattr(outlines, "generate_ppt_outline", generate)
                request = Mock(is_disconnected=AsyncMock(return_value=False))
                response = await outlines.stream_outlines(presentation_id, request, session)
                chunks = [chunk async for chunk in response.body_iterator]
                assert any('"presentation"' in chunk for chunk in chunks)
            async with sessions() as session:
                saved = await session.get(PresentationModel, presentation_id)
                assert saved.outlines["slides"][0]["content"] == "## Generated"

    asyncio.run(run())


def test_prepare_releases_transaction_before_structure_model(tmp_path, monkeypatch):
    async def run():
        async with database(tmp_path) as (engine, sessions):
            async with sessions() as session:
                presentation = deck()
                session.add(presentation)
                await session.commit()
                presentation_id = presentation.id
            async with sessions() as session:

                async def generate(**_kwargs):
                    await assert_released(engine, session)
                    return PresentationStructureModel(slides=[0])

                layout = PresentationLayoutModel(
                    name="test", slides=[SlideLayoutModel(id="hero", json_schema={})]
                )
                monkeypatch.setattr(
                    endpoint,
                    "_resolve_prepare_layout",
                    AsyncMock(return_value=(deck().layout, layout, {})),
                )
                monkeypatch.setattr(endpoint, "generate_presentation_structure", generate)
                monkeypatch.setattr(
                    endpoint.MEM0_PRESENTATION_MEMORY_SERVICE,
                    "store_generated_outlines",
                    AsyncMock(),
                )
                await endpoint.prepare_presentation(
                    presentation_id,
                    [SlideOutlineModel(content="## Reviewed")],
                    "test",
                    "Reviewed",
                    session,
                )
                await assert_released(engine, session)
            async with sessions() as session:
                saved = await session.get(PresentationModel, presentation_id)
                assert saved.title == "Reviewed"
                assert saved.structure == {"slides": [0]}

    asyncio.run(run())


def test_auth_releases_connection_before_handler_and_keeps_user_context(tmp_path, monkeypatch):
    async def run():
        async with database(tmp_path) as (engine, sessions):
            async with sessions() as session:
                user = User(username="owner", hashed_password="unused", is_active=True)
                session.add(user)
                await session.commit()
                user_id = user.id
            auth_sessions = []

            async def authenticate(_request, session):
                auth_sessions.append(session)
                user = await session.get(User, user_id)
                return AuthPrincipal(user.id, user.username, False, "oidc"), user

            async def handler(request):
                await assert_released(engine, auth_sessions[0])
                assert request.state.current_user.username == "owner"
                assert get_current_owner_id() == user_id
                return Response("ok")

            monkeypatch.setattr(middlewares, "async_session_maker", sessions)
            monkeypatch.setattr(middlewares, "is_disable_auth_enabled", lambda: False)
            monkeypatch.setattr(middlewares, "is_oidc_auth_mode", lambda: True)
            monkeypatch.setattr(middlewares, "resolve_request_principal", authenticate)
            monkeypatch.setattr(middlewares, "validate_oidc_request_origin", lambda _: None)
            request = Request(
                {
                    "type": "http",
                    "method": "GET",
                    "path": "/api/v1/ppt/presentation/stream/test",
                    "headers": [],
                }
            )
            response = await middlewares.SessionAuthMiddleware(None).dispatch(request, handler)
            assert response.body == b"ok"
            assert get_current_owner_id() is None

    asyncio.run(run())


@pytest.mark.parametrize("with_template", [False, True])
def test_smart_stream_releases_reads_before_external_preparation(
    tmp_path, monkeypatch, with_template
):
    async def run():
        async with database(tmp_path) as (engine, sessions):
            async with sessions() as session:
                presentation = deck()
                presentation.generation_mode = "smart"
                if with_template:
                    session.add(
                        TemplateV2(
                            id="reference",
                            name="Reference",
                            is_default=True,
                            layouts={"layouts": [{"components": [{"elements": []}]}]},
                            assets={},
                        )
                    )
                    presentation.layout = {"smart_template_reference": {"template_id": "reference"}}
                session.add(presentation)
                await session.commit()
                presentation_id = presentation.id
            async with sessions() as session:
                checked = []

                async def load_references(*_args):
                    await assert_released(engine, session)
                    checked.append(True)
                    raise HTTPException(502, "Reference service unavailable")

                monkeypatch.setattr(endpoint, "load_community_references", load_references)
                monkeypatch.setattr(endpoint, "async_session_maker", sessions)
                response = await endpoint.stream_presentation(presentation_id, session)
                chunks = [chunk async for chunk in response.body_iterator]
                assert checked == [True]
                assert any("Reference service unavailable" in chunk for chunk in chunks)
                await assert_released(engine, session)

    asyncio.run(run())
