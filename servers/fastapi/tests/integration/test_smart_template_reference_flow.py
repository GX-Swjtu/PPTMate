import asyncio
import json
import uuid
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import pytest
from api.v1.auth.context import reset_current_owner_id, set_current_owner_id
from api.v1.ppt.endpoints import presentation as endpoint
from fastapi import HTTPException
from models.sql.presentation import PresentationModel
from models.sql.slide import SlideModel
from models.sql.template_v2 import TemplateV2
from models.sql.user import User
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from tests.conftest import FakeAsyncSession


def _template(template_id, owner_id=None, is_default=False):
    return TemplateV2(
        id=template_id,
        owner_id=owner_id,
        name=template_id,
        is_default=is_default,
        layouts={
            "layouts": [
                {
                    "components": [
                        {
                            "elements": [
                                {
                                    "type": "text",
                                    "font": {"color": "#123456", "family": "Arial"},
                                }
                            ]
                        }
                    ]
                }
            ]
        },
        assets={
            "fonts": {
                "Arial": "/app_data/fonts/arial.ttf",
                "Remote": "https://example.com/font.css",
            }
        },
    )


@pytest.mark.parametrize(
    "mode, template_id, status", [("standard", "shared", 400), ("smart", "missing", 404)]
)
def test_create_rejects_invalid_reference_without_saving(mode, template_id, status):
    session = FakeAsyncSession(get_results={"shared": _template("shared", is_default=True)})
    with pytest.raises(HTTPException) as error:
        asyncio.run(
            endpoint.create_presentation(
                content="Create a deck",
                generation_mode=mode,
                reference_template_id=template_id,
                sql_session=session,
            )
        )
    assert error.value.status_code == status
    assert session.added == [] and session.commit_count == 0


def test_template_style_alone_does_not_replace_a_prompt_or_document():
    with pytest.raises(HTTPException) as error:
        asyncio.run(
            endpoint.create_presentation(
                content="",
                generation_mode="smart",
                reference_template_id="shared",
                sql_session=FakeAsyncSession(),
            )
        )
    assert error.value.status_code == 400


@asynccontextmanager
async def _database(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'smart.db'}")
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        for model in (User, PresentationModel, TemplateV2, SlideModel):
            await connection.run_sync(model.__table__.create)
    owner, other = uuid.uuid4(), uuid.uuid4()
    async with sessions() as session:
        session.add_all(
            [
                User(
                    id=owner,
                    username="owner",
                    hashed_password="unused",
                    is_active=True,
                    is_superuser=True,
                    is_verified=True,
                ),
                User(
                    id=other,
                    username="other",
                    hashed_password="unused",
                    is_active=True,
                    is_superuser=False,
                    is_verified=True,
                ),
                _template("shared", is_default=True),
                _template("mine", owner),
                _template("other", other),
                _template("unowned"),
            ]
        )
        await session.commit()
    token = set_current_owner_id(owner)
    try:
        yield sessions, other
    finally:
        reset_current_owner_id(token)
        await engine.dispose()


async def _stream_events(sessions, presentation_id):
    async with sessions() as session:
        presentation = await session.get(PresentationModel, presentation_id)
        response = await endpoint._stream_smart_presentation(presentation, session)
        return [
            json.loads(line.removeprefix("data: "))
            async for chunk in response.body_iterator
            for line in str(chunk).splitlines()
            if line.startswith("data: ")
        ]


def test_owned_template_selection_and_smart_checkpoint_resume(monkeypatch, tmp_path):
    monkeypatch.setenv("PLATFORM_MODE", "true")

    async def run():
        async with _database(tmp_path) as (sessions, _other):
            for template_id in ("other", "unowned"):
                async with sessions() as session:
                    with pytest.raises(HTTPException) as error:
                        await endpoint.create_presentation(
                            content="New content",
                            generation_mode="smart",
                            reference_template_id=template_id,
                            sql_session=session,
                        )
                    assert error.value.status_code == 404
            for template_id in ("shared", "mine"):
                async with sessions() as session:
                    presentation = await endpoint.create_presentation(
                        content="New content",
                        n_slides=2,
                        generation_mode="smart",
                        reference_template_id=template_id,
                        sql_session=session,
                    )
                    assert presentation.layout == {
                        "smart_template_reference": {"template_id": template_id}
                    }
                    assert presentation.fonts is None
                    presentation_id = presentation.id
            async with sessions() as session:
                # The first stream must also read edits made after selection.
                template = await session.get(TemplateV2, "mine")
                template.theme = {"colors": {"primary": "#456789"}}
                await session.commit()

            slides = [
                {
                    "title": f"Slide {index}",
                    "html": (
                        '<section class="relative h-[720px] w-[1280px] overflow-hidden">'
                        f"Slide {index}</section>"
                    ),
                }
                for index in range(2)
            ]
            contexts = []

            async def generate(**kwargs):
                contexts.append(kwargs["community_design_context"])
                assert "#123456" in contexts[-1]
                assert kwargs["default_max_output_tokens"] == 32_768
                if len(contexts) == 1:
                    assert "#456789" in contexts[-1]
                    assert kwargs["fonts"] == {"Arial": "/app_data/fonts/arial.ttf"}
                    assert kwargs["existing_slides"] == []
                    await kwargs["on_slide"](0, slides[0])
                    raise HTTPException(status_code=503, detail="Temporary test failure")
                assert "#987654" in contexts[-1] and "#456789" not in contexts[-1]
                assert kwargs["fonts"] == {
                    "Arial": "/app_data/fonts/arial.ttf",
                    "Noto": "/app_data/fonts/noto.ttf",
                }
                assert kwargs["existing_slides"] == [{"html": slides[0]["html"]}]
                await kwargs["on_slide"](1, slides[1])
                return {"title": "Completed", "slides": slides}

            community = AsyncMock(return_value=[])
            monkeypatch.setattr(endpoint, "async_session_maker", sessions)
            monkeypatch.setattr(endpoint, "load_community_references", community)
            monkeypatch.setattr(endpoint, "generate_smart_presentation", generate)
            events = await _stream_events(sessions, presentation_id)
            assert events[-1]["type"] == "error" and events[-1]["completed_slides"] == 1
            async with sessions() as session:
                template = await session.get(TemplateV2, "mine")
                template.theme = {"colors": {"primary": "#987654"}}
                template.assets = {"fonts": {"Noto": "/app_data/fonts/noto.ttf"}}
                await session.commit()
            events = await _stream_events(sessions, presentation_id)
            assert events[-1]["type"] == "complete"
            assert events[-1]["presentation"]["slides"][0]["html_content"] == slides[0]["html"]
            async with sessions() as session:
                await session.delete(await session.get(TemplateV2, "mine"))
                await session.commit()
            # A completed deck opens from its saved slides, even after deletion.
            events = await _stream_events(sessions, presentation_id)
            assert events[-1]["type"] == "complete"
            assert len(contexts) == 2
            assert all(call.args == (None,) for call in community.call_args_list)
            async with sessions() as session:
                presentation = await session.get(PresentationModel, presentation_id)
                assert presentation.layout == {"smart_template_reference": {"template_id": "mine"}}
                assert presentation.get_new_presentation().layout == presentation.layout

    asyncio.run(run())


@pytest.mark.parametrize("saved_slides", [0, 1])
@pytest.mark.parametrize("change, status", [("delete", 404), ("owner", 404), ("layouts", 400)])
def test_start_and_resume_revalidate_template(monkeypatch, tmp_path, saved_slides, change, status):
    monkeypatch.setenv("PLATFORM_MODE", "true")

    async def run():
        async with _database(tmp_path) as (sessions, other):
            async with sessions() as session:
                presentation = await endpoint.create_presentation(
                    content="New content",
                    n_slides=2,
                    generation_mode="smart",
                    reference_template_id="mine",
                    sql_session=session,
                )
                presentation_id = presentation.id
                if saved_slides:
                    session.add(
                        SlideModel(
                            presentation=presentation_id,
                            layout_group="smart-html",
                            layout="smart-html",
                            index=0,
                            content={"title": "Saved"},
                            html_content="<section>Saved slide</section>",
                        )
                    )
                template = await session.get(TemplateV2, "mine")
                if change == "delete":
                    await session.delete(template)
                elif change == "owner":
                    template.owner_id = other
                else:
                    template.layouts = {"layouts": []}
                await session.commit()
            generate = AsyncMock()
            monkeypatch.setattr(endpoint, "async_session_maker", sessions)
            monkeypatch.setattr(endpoint, "generate_smart_presentation", generate)
            events = await _stream_events(sessions, presentation_id)
            error = events[-1]
            assert error["type"] == "error" and error["status_code"] == status
            assert error["retryable"] is False
            assert error["completed_slides"] == saved_slides
            assert "参考模板" in error["detail"] and "重新选择模板" in error["detail"]
            generate.assert_not_called()

    asyncio.run(run())


def test_legacy_reference_uses_current_template_and_discards_saved_style(monkeypatch, tmp_path):
    monkeypatch.setenv("PLATFORM_MODE", "true")

    async def run():
        async with _database(tmp_path) as (sessions, _other):
            async with sessions() as session:
                presentation = await endpoint.create_presentation(
                    content="New content",
                    n_slides=1,
                    generation_mode="smart",
                    reference_template_id="mine",
                    sql_session=session,
                )
                presentation_id = presentation.id
                presentation.layout = {
                    "smart_template_reference": {
                        "template_id": "mine",
                        "name": "OLD_SNAPSHOT",
                        "layouts": [{"components": [{"fill": {"color": "#ABCDEF"}}]}],
                    }
                }
                await session.commit()

            async def generate(**kwargs):
                context = kwargs["community_design_context"]
                assert "#123456" in context
                assert "OLD_SNAPSHOT" not in context and "#ABCDEF" not in context
                return {
                    "title": "New",
                    "slides": [{"title": "New", "html": "<section>New</section>"}],
                }

            monkeypatch.setattr(endpoint, "async_session_maker", sessions)
            monkeypatch.setattr(endpoint, "generate_smart_presentation", generate)
            events = await _stream_events(sessions, presentation_id)
            assert events[-1]["type"] == "complete"
            async with sessions() as session:
                presentation = await session.get(PresentationModel, presentation_id)
                assert presentation.layout == {"smart_template_reference": {"template_id": "mine"}}

    asyncio.run(run())
