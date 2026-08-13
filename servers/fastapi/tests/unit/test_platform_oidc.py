import asyncio
import base64
import hashlib
import hmac
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlsplit

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from api.v1.auth.oidc import (
    OIDC_AUTH_ROUTER,
    oidc_authenticator,
    reset_oidc_authenticator_cache,
    reset_oidc_settings_cache,
)
from api.v1.auth.router import API_V1_AUTH_ROUTER
from models.sql.oidc import ApplicationSession, OidcLoginTransaction
from models.sql.user import User
from services.database import get_async_session


def _configure_oidc(monkeypatch, tmp_path):
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    private_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    public_pem = private_key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    public_key_path = tmp_path / "oidc-public.pem"
    client_secret_path = tmp_path / "oidc-client-secret"
    encryption_key_path = tmp_path / "session-key"
    public_key_path.write_bytes(public_pem)
    client_secret_path.write_text("client-secret", encoding="utf-8")
    encryption_key_path.write_text("11" * 32, encoding="utf-8")

    values = {
        "AUTH_MODE": "oidc",
        "PLATFORM_MODE": "true",
        "APPLICATION_PUBLIC_URL": "https://pptmate.ngl.local",
        "AUTH_ISSUER_URL": "https://auth.ngl.local",
        "AUTH_INTERNAL_URL": "http://auth:8000",
        "AUTH_JWT_PUBLIC_KEY_FILE": str(public_key_path),
        "OIDC_CLIENT_ID": "pptmate",
        "OIDC_CLIENT_SECRET_FILE": str(client_secret_path),
        "SESSION_ENCRYPTION_KEY_FILE": str(encryption_key_path),
        "SESSION_COOKIE_NAME": "ngl_pptmate_session",
        "COOKIE_SECURE": "true",
    }
    for name, value in values.items():
        monkeypatch.setenv(name, value)
    reset_oidc_authenticator_cache()
    reset_oidc_settings_cache()
    return private_pem


def _access_token(
    private_key: bytes,
    *,
    roles: tuple[str, ...],
    expired=False,
    lifetime_minutes: int = 5,
) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": "platform-user-id",
            "roles": list(roles),
            "client_id": "pptmate",
            "scope": "openid profile email offline_access",
            "authz_version": 1,
            "token_use": "access",
            "jti": "access-token-id",
            "iat": now - (timedelta(minutes=10) if expired else timedelta()),
            "exp": now - timedelta(minutes=5)
            if expired
            else now + timedelta(minutes=lifetime_minutes),
            "iss": "https://auth.ngl.local",
            "aud": "pptmate",
        },
        private_key,
        algorithm="RS256",
    )


def _id_token(private_key: bytes, *, nonce: str, lifetime_minutes: int = 5) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": "platform-user-id",
            "nonce": nonce,
            "iat": now,
            "exp": now + timedelta(minutes=lifetime_minutes),
            "iss": "https://auth.ngl.local",
            "aud": "pptmate",
        },
        private_key,
        algorithm="RS256",
    )


def _build_client(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'oidc.db'}")
    session_maker = async_sessionmaker(engine, expire_on_commit=False)

    async def create_tables():
        async with engine.begin() as connection:
            await connection.run_sync(User.__table__.create)
            await connection.run_sync(ApplicationSession.__table__.create)
            await connection.run_sync(OidcLoginTransaction.__table__.create)

    asyncio.run(create_tables())

    async def override_session():
        async with session_maker() as session:
            yield session

    app = FastAPI()
    app.include_router(API_V1_AUTH_ROUTER)
    app.include_router(OIDC_AUTH_ROUTER)
    app.dependency_overrides[get_async_session] = override_session
    return TestClient(app, base_url="https://pptmate.ngl.local"), engine, session_maker


@pytest.mark.parametrize(
    ("roles", "expected_role"),
    [
        (("pptmate.user",), "user"),
        (("pptmate.user", "pptmate.admin"), "admin"),
    ],
)
def test_oidc_pkce_callback_creates_host_only_session_and_maps_roles(
    monkeypatch, tmp_path, roles, expected_role
):
    private_key = _configure_oidc(monkeypatch, tmp_path)
    client, engine, session_maker = _build_client(tmp_path)

    login = client.get(
        "/api/v1/auth/oidc/login?returnTo=%2Fdashboard",
        follow_redirects=False,
    )
    authorization = urlsplit(login.headers["location"])
    params = parse_qs(authorization.query)
    state = params["state"][0]

    assert login.status_code == 302
    assert authorization.geturl().startswith("https://auth.ngl.local/oauth/authorize")
    assert params["code_challenge_method"] == ["S256"]
    assert params["scope"] == ["openid profile email offline_access"]

    async def load_transaction():
        async with session_maker() as session:
            return await session.scalar(select(OidcLoginTransaction))

    transaction = asyncio.run(load_transaction())
    assert transaction is not None
    expected_challenge = (
        base64.urlsafe_b64encode(
            hashlib.sha256(
                oidc_authenticator()
                .cipher.decrypt(transaction.code_verifier_encrypted)
                .encode()
            ).digest()
        )
        .rstrip(b"=")
        .decode()
    )
    assert params["code_challenge"] == [expected_challenge]

    authenticator = oidc_authenticator()

    async def exchange(*, code, verifier):
        assert code == "authorization-code"
        assert verifier
        return {
            "access_token": _access_token(private_key, roles=roles),
            "id_token": _id_token(private_key, nonce=transaction.nonce),
            "refresh_token": "refresh-token",
        }

    async def userinfo(_access_token):
        return {
            "sub": "platform-user-id",
            "preferred_username": "employee",
            "email": "employee@example.invalid",
            "name": "Employee",
        }

    monkeypatch.setattr(authenticator.client, "exchange", exchange)
    monkeypatch.setattr(authenticator.client, "userinfo", userinfo)
    callback = client.get(
        f"/oidc/callback?state={state}&code=authorization-code",
        follow_redirects=False,
    )

    assert callback.status_code == 302
    assert callback.headers["location"] == "/dashboard"
    cookie = callback.headers["set-cookie"]
    assert cookie.startswith("ngl_pptmate_session=")
    assert "HttpOnly" in cookie
    assert "Secure" in cookie
    assert "SameSite=lax" in cookie
    assert "Domain=" not in cookie

    status = client.get("/api/v1/auth/status")
    assert status.status_code == 200
    assert status.json()["authenticated"] is True
    assert status.json()["role"] == expected_role

    async def load_user():
        async with session_maker() as session:
            return await session.scalar(select(User))

    user = asyncio.run(load_user())
    assert user is not None
    assert user.oidc_subject == "platform-user-id"
    assert user.admin_slot is None
    assert user.is_superuser is (expected_role == "admin")
    asyncio.run(engine.dispose())


def test_oidc_rejects_missing_application_role_and_local_login(monkeypatch, tmp_path):
    private_key = _configure_oidc(monkeypatch, tmp_path)
    client, engine, _session_maker = _build_client(tmp_path)
    with pytest.raises(HTTPException) as denied:
        oidc_authenticator().verify_access_token(_access_token(private_key, roles=()))
    assert getattr(denied.value, "status_code", None) == 403

    assert (
        client.post(
            "/api/v1/auth/setup",
            json={"username": "local", "password": "secret123"},
        ).status_code
        == 404
    )
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"username": "local", "password": "secret123"},
        ).status_code
        == 404
    )
    asyncio.run(engine.dispose())


def test_oidc_rejects_access_token_lasting_more_than_five_minutes(
    monkeypatch, tmp_path
):
    private_key = _configure_oidc(monkeypatch, tmp_path)
    with pytest.raises(jwt.InvalidTokenError):
        oidc_authenticator().verify_access_token(
            _access_token(
                private_key,
                roles=("pptmate.user",),
                lifetime_minutes=6,
            )
        )


def test_oidc_callback_rejects_id_token_lasting_more_than_five_minutes(
    monkeypatch, tmp_path
):
    private_key = _configure_oidc(monkeypatch, tmp_path)
    client, engine, session_maker = _build_client(tmp_path)
    login = client.get("/api/v1/auth/oidc/login", follow_redirects=False)
    state = parse_qs(urlsplit(login.headers["location"]).query)["state"][0]

    async def load_transaction():
        async with session_maker() as session:
            return await session.scalar(select(OidcLoginTransaction))

    transaction = asyncio.run(load_transaction())
    assert transaction is not None
    authenticator = oidc_authenticator()

    async def exchange(*, code, verifier):
        assert code == "authorization-code"
        assert verifier
        return {
            "access_token": _access_token(private_key, roles=("pptmate.user",)),
            "id_token": _id_token(
                private_key,
                nonce=transaction.nonce,
                lifetime_minutes=6,
            ),
            "refresh_token": "refresh-token",
        }

    monkeypatch.setattr(authenticator.client, "exchange", exchange)
    callback = client.get(
        f"/oidc/callback?state={state}&code=authorization-code",
        follow_redirects=False,
    )
    assert callback.status_code == 502
    assert callback.json()["detail"]["code"] == "OIDC_TOKEN_INVALID"
    asyncio.run(engine.dispose())


def test_oidc_callback_rejects_nonce_mismatch(monkeypatch, tmp_path):
    private_key = _configure_oidc(monkeypatch, tmp_path)
    client, engine, _session_maker = _build_client(tmp_path)
    login = client.get("/api/v1/auth/oidc/login", follow_redirects=False)
    state = parse_qs(urlsplit(login.headers["location"]).query)["state"][0]
    authenticator = oidc_authenticator()

    async def exchange(*, code, verifier):
        assert code == "authorization-code"
        assert verifier
        return {
            "access_token": _access_token(private_key, roles=("pptmate.user",)),
            "id_token": _id_token(private_key, nonce="different-login-transaction"),
            "refresh_token": "refresh-token",
        }

    monkeypatch.setattr(authenticator.client, "exchange", exchange)
    callback = client.get(
        f"/oidc/callback?state={state}&code=authorization-code",
        follow_redirects=False,
    )
    assert callback.status_code == 502
    assert callback.json()["detail"]["code"] == "OIDC_TOKEN_INVALID"
    asyncio.run(engine.dispose())


def test_active_refresh_lease_prevents_concurrent_rotation(monkeypatch, tmp_path):
    private_key = _configure_oidc(monkeypatch, tmp_path)
    _client, engine, session_maker = _build_client(tmp_path)
    authenticator = oidc_authenticator()
    raw_cookie = "opaque-browser-session"

    async def seed_and_authenticate():
        async with session_maker() as session:
            user = User(
                username="employee",
                oidc_subject="platform-user-id",
                hashed_password="not-used",
                is_active=True,
                is_verified=True,
            )
            session.add(user)
            await session.flush()
            session.add(
                ApplicationSession(
                    token_hash=hmac.new(
                        authenticator.key, raw_cookie.encode(), hashlib.sha256
                    ).hexdigest(),
                    user_id=user.id,
                    subject="platform-user-id",
                    access_token_encrypted=authenticator.cipher.encrypt(
                        _access_token(
                            private_key, roles=("pptmate.user",), expired=True
                        )
                    ),
                    refresh_token_encrypted=authenticator.cipher.encrypt("refresh"),
                    identity_encrypted=authenticator.cipher.encrypt("{}"),
                    refresh_lease_id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
                    refresh_lease_expires_at=datetime.now(UTC) + timedelta(minutes=1),
                    expires_at=datetime.now(UTC) + timedelta(hours=1),
                    absolute_expires_at=datetime.now(UTC) + timedelta(days=1),
                )
            )
            await session.commit()

        from starlette.requests import Request

        request = Request(
            {
                "type": "http",
                "method": "GET",
                "path": "/api/v1/ppt/presentation/all",
                "headers": [(b"cookie", f"ngl_pptmate_session={raw_cookie}".encode())],
            }
        )
        async with session_maker() as session:
            with pytest.raises(HTTPException) as in_progress:
                await authenticator.authenticate(request, session)
            assert getattr(in_progress.value, "status_code", None) == 503
            assert in_progress.value.detail["code"] == "OIDC_REFRESH_IN_PROGRESS"

    asyncio.run(seed_and_authenticate())
    asyncio.run(engine.dispose())


def test_refresh_rotation_uses_compare_and_swap(monkeypatch, tmp_path):
    private_key = _configure_oidc(monkeypatch, tmp_path)
    _client, engine, session_maker = _build_client(tmp_path)
    authenticator = oidc_authenticator()

    async def seed_and_refresh():
        async with session_maker() as session:
            user = User(
                username="employee",
                oidc_subject="platform-user-id",
                hashed_password="not-used",
                is_active=True,
                is_verified=True,
            )
            session.add(user)
            await session.flush()
            record = ApplicationSession(
                token_hash="0" * 64,
                user_id=user.id,
                subject="platform-user-id",
                access_token_encrypted=authenticator.cipher.encrypt(
                    _access_token(private_key, roles=("pptmate.user",), expired=True)
                ),
                refresh_token_encrypted=authenticator.cipher.encrypt("refresh-token"),
                identity_encrypted=authenticator.cipher.encrypt("{}"),
                expires_at=datetime.now(UTC) + timedelta(hours=1),
                absolute_expires_at=datetime.now(UTC) + timedelta(days=1),
            )
            session.add(record)
            await session.commit()
            record_id = record.id

        async def refresh(_refresh_token):
            # Simulate another worker winning the rotation after this worker
            # releases its lease transaction for remote I/O.
            async with session_maker() as concurrent_session:
                await concurrent_session.execute(
                    update(ApplicationSession)
                    .where(ApplicationSession.id == record_id)
                    .values(
                        token_version=1,
                        refresh_lease_id=None,
                        refresh_lease_expires_at=None,
                    )
                )
                await concurrent_session.commit()
            return {
                "access_token": _access_token(
                    private_key, roles=("pptmate.user",)
                ),
                "refresh_token": "rotated-refresh-token",
            }

        async def userinfo(_access_token):
            return {
                "sub": "platform-user-id",
                "preferred_username": "employee",
                "email": "employee@example.invalid",
                "name": "Employee",
            }

        monkeypatch.setattr(authenticator.client, "refresh", refresh)
        monkeypatch.setattr(authenticator.client, "userinfo", userinfo)
        async with session_maker() as session:
            record = await session.get(ApplicationSession, record_id)
            with pytest.raises(HTTPException) as stale:
                await authenticator._refresh(session, record)
            assert stale.value.status_code == 503
            assert stale.value.detail["code"] == "OIDC_REFRESH_RESULT_STALE"

    asyncio.run(seed_and_refresh())
    asyncio.run(engine.dispose())


def test_oidc_logout_rejects_cross_origin_request(monkeypatch, tmp_path):
    _configure_oidc(monkeypatch, tmp_path)
    client, engine, _session_maker = _build_client(tmp_path)
    client.cookies.set("ngl_pptmate_session", "opaque")
    response = client.post(
        "/api/v1/auth/logout",
        headers={"Origin": "https://attacker.example"},
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "ORIGIN_INVALID"
    asyncio.run(engine.dispose())


def test_oidc_logout_deletes_session_revokes_refresh_and_clears_cookie(
    monkeypatch, tmp_path
):
    private_key = _configure_oidc(monkeypatch, tmp_path)
    client, engine, session_maker = _build_client(tmp_path)
    authenticator = oidc_authenticator()
    raw_cookie = "opaque-browser-session"

    async def seed_session():
        async with session_maker() as session:
            user = User(
                username="employee",
                oidc_subject="platform-user-id",
                hashed_password="not-used",
                is_active=True,
                is_verified=True,
            )
            session.add(user)
            await session.flush()
            session.add(
                ApplicationSession(
                    token_hash=hmac.new(
                        authenticator.key, raw_cookie.encode(), hashlib.sha256
                    ).hexdigest(),
                    user_id=user.id,
                    subject="platform-user-id",
                    access_token_encrypted=authenticator.cipher.encrypt(
                        _access_token(private_key, roles=("pptmate.user",))
                    ),
                    refresh_token_encrypted=authenticator.cipher.encrypt(
                        "refresh-token"
                    ),
                    identity_encrypted=authenticator.cipher.encrypt("{}"),
                    expires_at=datetime.now(UTC) + timedelta(hours=1),
                    absolute_expires_at=datetime.now(UTC) + timedelta(days=1),
                )
            )
            await session.commit()

    revoked: list[str] = []

    async def revoke(refresh_token):
        revoked.append(refresh_token)

    asyncio.run(seed_session())
    monkeypatch.setattr(authenticator.client, "revoke", revoke)
    client.cookies.set("ngl_pptmate_session", raw_cookie)
    response = client.post(
        "/api/v1/auth/logout",
        headers={"Origin": "https://pptmate.ngl.local"},
    )

    assert response.status_code == 200
    assert revoked == ["refresh-token"]
    assert "ngl_pptmate_session=" in response.headers["set-cookie"]
    assert "Max-Age=0" in response.headers["set-cookie"]

    async def assert_session_deleted():
        async with session_maker() as session:
            assert await session.scalar(select(ApplicationSession)) is None

    asyncio.run(assert_session_deleted())
    asyncio.run(engine.dispose())
