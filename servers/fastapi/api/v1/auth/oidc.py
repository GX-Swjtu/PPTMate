from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import urlencode, urlsplit

import httpx
import jwt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from api.v1.auth.users import PASSWORD_HELPER
from models.sql.oidc import ApplicationSession, OidcLoginTransaction
from models.sql.user import User
from services.database import get_async_session
from utils.datetime_utils import get_current_utc_datetime

OIDC_AUTH_ROUTER = APIRouter(tags=["OIDC"])
ALLOWED_ROLES = frozenset({"pptmate.user", "pptmate.admin"})
ADMIN_ROLE = "pptmate.admin"
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS", "TRACE"})
MAX_OIDC_TOKEN_LIFETIME_SECONDS = 5 * 60


def _truthy(value: str | None) -> bool:
    return bool(value and value.strip().lower() in {"1", "true", "yes", "on"})


def is_oidc_auth_mode() -> bool:
    return (os.getenv("AUTH_MODE") or "local").strip().lower() == "oidc"


def is_platform_mode() -> bool:
    return _truthy(os.getenv("PLATFORM_MODE"))


def api_keys_enabled() -> bool:
    return _truthy(os.getenv("API_KEYS_ENABLED")) if is_platform_mode() else True


@dataclass(frozen=True)
class OidcSettings:
    application_public_url: str
    auth_issuer_url: str
    auth_internal_url: str
    auth_public_key_file: Path
    client_id: str
    client_secret_file: Path
    session_encryption_key_file: Path
    session_cookie_name: str
    cookie_secure: bool
    session_hours: int
    session_absolute_hours: int
    session_renewal_window_hours: int
    refresh_lease_seconds: int

    @classmethod
    def from_env(cls) -> OidcSettings:
        def required(name: str) -> str:
            value = (os.getenv(name) or "").strip()
            if not value:
                raise RuntimeError(f"{name} is required when AUTH_MODE=oidc")
            return value

        public_url = required("APPLICATION_PUBLIC_URL").rstrip("/")
        issuer_url = required("AUTH_ISSUER_URL").rstrip("/")
        internal_url = required("AUTH_INTERNAL_URL").rstrip("/")
        for name, value in (
            ("APPLICATION_PUBLIC_URL", public_url),
            ("AUTH_ISSUER_URL", issuer_url),
            ("AUTH_INTERNAL_URL", internal_url),
        ):
            parsed = urlsplit(value)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                raise RuntimeError(f"{name} must be an absolute HTTP(S) origin")
            if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
                raise RuntimeError(
                    f"{name} must not contain a path, query, or fragment"
                )

        settings = cls(
            application_public_url=public_url,
            auth_issuer_url=issuer_url,
            auth_internal_url=internal_url,
            auth_public_key_file=Path(required("AUTH_JWT_PUBLIC_KEY_FILE")),
            client_id=(os.getenv("OIDC_CLIENT_ID") or "pptmate").strip(),
            client_secret_file=Path(required("OIDC_CLIENT_SECRET_FILE")),
            session_encryption_key_file=Path(required("SESSION_ENCRYPTION_KEY_FILE")),
            session_cookie_name=(
                os.getenv("SESSION_COOKIE_NAME") or "ngl_pptmate_session"
            ).strip(),
            cookie_secure=_truthy(os.getenv("COOKIE_SECURE")),
            session_hours=int(os.getenv("SESSION_HOURS") or "168"),
            session_absolute_hours=int(os.getenv("SESSION_ABSOLUTE_HOURS") or "720"),
            session_renewal_window_hours=int(
                os.getenv("SESSION_RENEWAL_WINDOW_HOURS") or "24"
            ),
            refresh_lease_seconds=int(os.getenv("OIDC_REFRESH_LEASE_SECONDS") or "120"),
        )
        if not settings.client_id:
            raise RuntimeError("OIDC_CLIENT_ID must not be empty")
        if settings.session_hours < 1 or settings.session_hours > 168:
            raise RuntimeError("SESSION_HOURS must be between 1 and 168")
        if settings.session_absolute_hours < settings.session_hours:
            raise RuntimeError(
                "SESSION_ABSOLUTE_HOURS must not be shorter than SESSION_HOURS"
            )
        if settings.cookie_secure and not public_url.startswith("https://"):
            raise RuntimeError("COOKIE_SECURE requires an HTTPS APPLICATION_PUBLIC_URL")
        for path in (
            settings.auth_public_key_file,
            settings.client_secret_file,
            settings.session_encryption_key_file,
        ):
            if not path.is_file():
                raise RuntimeError(f"OIDC secret file does not exist: {path}")
        return settings

    @property
    def callback_url(self) -> str:
        return f"{self.application_public_url}/oidc/callback"

    def read_client_secret(self) -> str:
        value = self.client_secret_file.read_text(encoding="utf-8").strip()
        if not value:
            raise RuntimeError("OIDC client secret is empty")
        return value

    def read_public_key(self) -> bytes:
        return self.auth_public_key_file.read_bytes()

    def read_encryption_key(self) -> bytes:
        value = self.session_encryption_key_file.read_text(encoding="utf-8").strip()
        try:
            decoded = bytes.fromhex(value)
        except ValueError:
            decoded = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
        if len(decoded) != 32:
            raise RuntimeError(
                "SESSION_ENCRYPTION_KEY_FILE must contain exactly 32 bytes"
            )
        return decoded


@lru_cache(maxsize=1)
def oidc_settings() -> OidcSettings:
    return OidcSettings.from_env()


def reset_oidc_settings_cache() -> None:
    oidc_settings.cache_clear()


def session_cookie_name() -> str:
    if is_oidc_auth_mode():
        return oidc_settings().session_cookie_name
    return (os.getenv("SESSION_COOKIE_NAME") or "presenton_session").strip()


class TokenCipher:
    def __init__(self, key: bytes) -> None:
        self._aes = AESGCM(key)

    def encrypt(self, value: str) -> str:
        nonce = secrets.token_bytes(12)
        payload = nonce + self._aes.encrypt(nonce, value.encode(), None)
        return base64.urlsafe_b64encode(payload).decode()

    def decrypt(self, value: str) -> str:
        payload = base64.urlsafe_b64decode(value)
        return self._aes.decrypt(payload[:12], payload[12:], None).decode()


def _digest(value: str, key: bytes) -> str:
    return hmac.new(key, value.encode(), hashlib.sha256).hexdigest()


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _validate_return_to(value: str) -> str:
    normalized = value.strip() or "/"
    parsed = urlsplit(normalized)
    if (
        not normalized.startswith("/")
        or normalized.startswith("//")
        or parsed.scheme
        or parsed.netloc
    ):
        raise HTTPException(status_code=400, detail={"code": "RETURN_TO_INVALID"})
    return normalized


def _validate_token_lifetime(claims: dict[str, Any]) -> None:
    issued_at = claims.get("iat")
    expires_at = claims.get("exp")
    if (
        isinstance(issued_at, bool)
        or isinstance(expires_at, bool)
        or not isinstance(issued_at, (int, float))
        or not isinstance(expires_at, (int, float))
    ):
        raise jwt.InvalidTokenError("token lifetime claims are invalid")
    lifetime = float(expires_at) - float(issued_at)
    if lifetime <= 0 or lifetime > MAX_OIDC_TOKEN_LIFETIME_SECONDS:
        raise jwt.InvalidTokenError("token lifetime exceeds five minutes")


class OidcClient:
    def __init__(self, settings: OidcSettings) -> None:
        self.settings = settings
        self._client: httpx.AsyncClient | None = None

    def _http_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=10, trust_env=False)
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()

    async def _token_request(self, data: dict[str, str]) -> dict[str, Any]:
        try:
            response = await self._http_client().post(
                f"{self.settings.auth_internal_url}/oauth/token",
                data=data,
                auth=(self.settings.client_id, self.settings.read_client_secret()),
                headers={"Host": urlsplit(self.settings.auth_issuer_url).netloc},
            )
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=502, detail={"code": "OIDC_PROVIDER_UNAVAILABLE"}
            ) from exc
        try:
            payload = response.json()
        except ValueError:
            payload = {}
        if not response.is_success or not isinstance(payload, dict):
            oauth_error = payload.get("error") if isinstance(payload, dict) else None
            raise HTTPException(
                status_code=401 if oauth_error == "invalid_grant" else 502,
                detail={"code": "OIDC_TOKEN_EXCHANGE_FAILED"},
            )
        return payload

    async def exchange(self, *, code: str, verifier: str) -> dict[str, Any]:
        payload = await self._token_request(
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": self.settings.callback_url,
                "code_verifier": verifier,
            }
        )
        if not all(
            payload.get(key) for key in ("access_token", "id_token", "refresh_token")
        ):
            raise HTTPException(
                status_code=502, detail={"code": "OIDC_TOKEN_RESPONSE_INVALID"}
            )
        return payload

    async def refresh(self, refresh_token: str) -> dict[str, Any]:
        payload = await self._token_request(
            {"grant_type": "refresh_token", "refresh_token": refresh_token}
        )
        if not payload.get("access_token"):
            raise HTTPException(
                status_code=502, detail={"code": "OIDC_TOKEN_RESPONSE_INVALID"}
            )
        return payload

    async def userinfo(self, access_token: str) -> dict[str, Any]:
        try:
            response = await self._http_client().get(
                f"{self.settings.auth_internal_url}/oauth/userinfo",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Host": urlsplit(self.settings.auth_issuer_url).netloc,
                },
            )
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=502, detail={"code": "OIDC_PROVIDER_UNAVAILABLE"}
            ) from exc
        try:
            payload = response.json()
        except ValueError:
            payload = {}
        if not response.is_success or not isinstance(payload, dict):
            raise HTTPException(
                status_code=502, detail={"code": "OIDC_USERINFO_FAILED"}
            )
        return payload

    async def revoke(self, refresh_token: str) -> None:
        try:
            await self._http_client().post(
                f"{self.settings.auth_internal_url}/oauth/revoke",
                data={"token": refresh_token},
                auth=(self.settings.client_id, self.settings.read_client_secret()),
                headers={"Host": urlsplit(self.settings.auth_issuer_url).netloc},
            )
        except httpx.HTTPError:
            return


@dataclass(frozen=True)
class OidcPrincipal:
    subject: str
    roles: tuple[str, ...]

    @property
    def is_admin(self) -> bool:
        return ADMIN_ROLE in self.roles


class OidcAuthenticator:
    def __init__(self, settings: OidcSettings) -> None:
        self.settings = settings
        self.key = settings.read_encryption_key()
        self.cipher = TokenCipher(self.key)
        self.client = OidcClient(settings)
        from ngl_platform_auth import ApplicationTokenVerifier

        self.verifier = ApplicationTokenVerifier(
            settings.read_public_key(),
            issuer=settings.auth_issuer_url,
            audience=settings.client_id,
        )

    def verify_access_token(self, token: str) -> OidcPrincipal:
        from ngl_platform_auth import (
            PlatformTokenExpiredError,
            PlatformTokenInvalidError,
        )

        try:
            principal = self.verifier.verify(token)
        except PlatformTokenExpiredError as exc:
            raise jwt.ExpiredSignatureError from exc
        except PlatformTokenInvalidError as exc:
            raise jwt.InvalidTokenError from exc
        claims = jwt.decode(
            token,
            options={
                "verify_signature": False,
                "verify_aud": False,
                "verify_exp": False,
            },
        )
        _validate_token_lifetime(claims)
        if principal.client_id != self.settings.client_id:
            raise jwt.InvalidTokenError("client mismatch")
        roles = tuple(principal.roles)
        if not ALLOWED_ROLES.intersection(roles):
            raise HTTPException(
                status_code=403, detail={"code": "APPLICATION_ACCESS_DENIED"}
            )
        return OidcPrincipal(subject=principal.subject, roles=roles)

    async def authenticate(
        self, request: Request, session: AsyncSession
    ) -> tuple[OidcPrincipal, User, ApplicationSession]:
        raw = request.cookies.get(self.settings.session_cookie_name, "").strip()
        if not raw:
            raise HTTPException(status_code=401, detail={"code": "SESSION_MISSING"})
        now = get_current_utc_datetime()
        record = await session.scalar(
            select(ApplicationSession).where(
                ApplicationSession.token_hash == _digest(raw, self.key),
                ApplicationSession.expires_at > now,
                ApplicationSession.absolute_expires_at > now,
            )
        )
        if record is None:
            raise HTTPException(status_code=401, detail={"code": "SESSION_EXPIRED"})
        user = await session.get(User, record.user_id)
        if user is None or not user.is_active or user.oidc_subject != record.subject:
            raise HTTPException(status_code=401, detail={"code": "SESSION_INVALID"})
        try:
            principal = self.verify_access_token(
                self.cipher.decrypt(record.access_token_encrypted)
            )
        except jwt.ExpiredSignatureError:
            principal, record, user = await self._refresh(session, record)
        except (jwt.PyJWTError, ValueError) as exc:
            raise HTTPException(
                status_code=401, detail={"code": "ACCESS_TOKEN_INVALID"}
            ) from exc

        if principal.subject != record.subject:
            raise HTTPException(
                status_code=401, detail={"code": "SESSION_SUBJECT_MISMATCH"}
            )
        if _aware(record.expires_at) <= now + timedelta(
            hours=self.settings.session_renewal_window_hours
        ):
            record.expires_at = min(
                now + timedelta(hours=self.settings.session_hours),
                _aware(record.absolute_expires_at),
            )
            await session.commit()
        return principal, user, record

    async def _refresh(
        self, session: AsyncSession, record: ApplicationSession
    ) -> tuple[OidcPrincipal, ApplicationSession, User]:
        now = get_current_utc_datetime()
        locked = await session.scalar(
            select(ApplicationSession)
            .where(ApplicationSession.id == record.id)
            .with_for_update()
        )
        if locked is None:
            raise HTTPException(status_code=401, detail={"code": "SESSION_EXPIRED"})
        if (
            locked.refresh_lease_id is not None
            and locked.refresh_lease_expires_at is not None
            and _aware(locked.refresh_lease_expires_at) > now
        ):
            await session.rollback()
            raise HTTPException(
                status_code=503,
                detail={"code": "OIDC_REFRESH_IN_PROGRESS"},
                headers={"Retry-After": "1"},
            )
        lease_id = uuid.uuid4()
        token_version = locked.token_version
        locked.refresh_lease_id = lease_id
        locked.refresh_lease_expires_at = now + timedelta(
            seconds=self.settings.refresh_lease_seconds
        )
        refresh_token = self.cipher.decrypt(locked.refresh_token_encrypted)
        expected_subject = locked.subject
        await session.commit()

        try:
            payload = await self.client.refresh(refresh_token)
            access_token = str(payload["access_token"])
            principal = self.verify_access_token(access_token)
            if principal.subject != expected_subject:
                raise jwt.InvalidTokenError("subject mismatch")
            identity = _normalize_userinfo(
                await self.client.userinfo(access_token),
                expected_subject=expected_subject,
            )
        except HTTPException as exc:
            if exc.status_code == 401:
                await session.execute(
                    delete(ApplicationSession).where(ApplicationSession.id == record.id)
                )
                await session.commit()
                raise HTTPException(
                    status_code=401, detail={"code": "OIDC_REFRESH_INVALID"}
                ) from exc
            await self._release_refresh_lease(
                session, record.id, lease_id, token_version
            )
            raise HTTPException(
                status_code=503, detail={"code": "OIDC_REFRESH_UNAVAILABLE"}
            ) from exc
        except (jwt.PyJWTError, ValueError) as exc:
            await session.execute(
                delete(ApplicationSession).where(ApplicationSession.id == record.id)
            )
            await session.commit()
            raise HTTPException(
                status_code=401, detail={"code": "OIDC_REFRESH_INVALID"}
            ) from exc

        replacement_refresh = str(payload.get("refresh_token") or refresh_token)
        updated = await session.execute(
            update(ApplicationSession)
            .where(
                ApplicationSession.id == record.id,
                ApplicationSession.refresh_lease_id == lease_id,
                ApplicationSession.token_version == token_version,
            )
            .values(
                access_token_encrypted=self.cipher.encrypt(access_token),
                refresh_token_encrypted=self.cipher.encrypt(replacement_refresh),
                identity_encrypted=self.cipher.encrypt(
                    json.dumps(identity, ensure_ascii=False, separators=(",", ":"))
                ),
                token_version=token_version + 1,
                refresh_lease_id=None,
                refresh_lease_expires_at=None,
            )
        )
        if updated.rowcount != 1:
            await session.rollback()
            raise HTTPException(
                status_code=503, detail={"code": "OIDC_REFRESH_RESULT_STALE"}
            )
        user = await session.scalar(
            select(User).where(User.oidc_subject == expected_subject)
        )
        if user is None:
            await session.rollback()
            raise HTTPException(status_code=401, detail={"code": "SESSION_INVALID"})
        _update_user_from_identity(user, identity, principal)
        await session.commit()
        refreshed = await session.get(ApplicationSession, record.id)
        if refreshed is None:
            raise HTTPException(status_code=401, detail={"code": "SESSION_EXPIRED"})
        return principal, refreshed, user

    async def _release_refresh_lease(
        self,
        session: AsyncSession,
        session_id: uuid.UUID,
        lease_id: uuid.UUID,
        token_version: int,
    ) -> None:
        await session.execute(
            update(ApplicationSession)
            .where(
                ApplicationSession.id == session_id,
                ApplicationSession.refresh_lease_id == lease_id,
                ApplicationSession.token_version == token_version,
            )
            .values(refresh_lease_id=None, refresh_lease_expires_at=None)
        )
        await session.commit()


@lru_cache(maxsize=1)
def oidc_authenticator() -> OidcAuthenticator:
    return OidcAuthenticator(oidc_settings())


def reset_oidc_authenticator_cache() -> None:
    oidc_authenticator.cache_clear()


def _normalize_userinfo(
    payload: dict[str, Any], *, expected_subject: str
) -> dict[str, str]:
    subject = str(payload.get("sub") or "")
    username = str(
        payload.get("preferred_username") or payload.get("ldap") or ""
    ).strip()
    email = str(payload.get("email") or "").strip().lower()
    name = str(payload.get("name") or username).strip()
    if subject != expected_subject or not username or not email or not name:
        raise HTTPException(status_code=502, detail={"code": "OIDC_USERINFO_INVALID"})
    identity = {"sub": subject, "username": username, "email": email, "name": name}
    if len(json.dumps(identity, ensure_ascii=False).encode()) > 4096:
        raise HTTPException(status_code=502, detail={"code": "OIDC_USERINFO_INVALID"})
    return identity


def _update_user_from_identity(
    user: User, identity: dict[str, str], principal: OidcPrincipal
) -> None:
    user.email = identity["email"]
    user.display_name = identity["name"]
    user.is_active = True
    user.is_verified = True
    user.is_superuser = principal.is_admin
    # ``admin_slot`` is the single local bootstrap-administrator marker. OIDC
    # may legitimately grant pptmate.admin to more than one user, so it must
    # never consume that unique slot.
    user.admin_slot = None


async def _upsert_oidc_user(
    session: AsyncSession, identity: dict[str, str], principal: OidcPrincipal
) -> User:
    user = await session.scalar(
        select(User).where(User.oidc_subject == principal.subject)
    )
    if user is None:
        preferred = identity["username"][:128]
        collision = await session.scalar(
            select(User.id).where(func.lower(User.username) == preferred.casefold())
        )
        if collision is not None:
            suffix = hashlib.sha256(principal.subject.encode()).hexdigest()[:10]
            preferred = f"{preferred[:117]}-{suffix}"
        user = User(
            username=preferred,
            oidc_subject=principal.subject,
            hashed_password=PASSWORD_HELPER.hash(secrets.token_urlsafe(48)),
            auth_version=1,
        )
        session.add(user)
    _update_user_from_identity(user, identity, principal)
    await session.flush()
    return user


def _set_session_cookie(response: Response, raw: str, settings: OidcSettings) -> None:
    response.set_cookie(
        settings.session_cookie_name,
        raw,
        max_age=settings.session_absolute_hours * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


@OIDC_AUTH_ROUTER.get("/api/v1/auth/oidc/login", include_in_schema=False)
async def oidc_login(
    return_to: str = Query("/", alias="returnTo"),
    session: AsyncSession = Depends(get_async_session),  # noqa: B008
) -> Response:
    if not is_oidc_auth_mode():
        raise HTTPException(status_code=404, detail="Not found")
    settings = oidc_settings()
    authenticator = oidc_authenticator()
    state_value = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
        .rstrip(b"=")
        .decode()
    )
    session.add(
        OidcLoginTransaction(
            state_hash=_digest(state_value, authenticator.key),
            nonce=nonce,
            code_verifier_encrypted=authenticator.cipher.encrypt(verifier),
            return_to=_validate_return_to(return_to),
            expires_at=get_current_utc_datetime() + timedelta(minutes=5),
        )
    )
    await session.commit()
    params = {
        "response_type": "code",
        "client_id": settings.client_id,
        "redirect_uri": settings.callback_url,
        "scope": "openid profile email offline_access",
        "state": state_value,
        "nonce": nonce,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    return RedirectResponse(
        f"{settings.auth_issuer_url}/oauth/authorize?{urlencode(params)}",
        status_code=302,
    )


@OIDC_AUTH_ROUTER.get("/oidc/callback", include_in_schema=False)
async def oidc_callback(
    state_value: str = Query(alias="state"),
    code: str | None = Query(default=None),
    error: str | None = Query(default=None),
    session: AsyncSession = Depends(get_async_session),  # noqa: B008
) -> Response:
    if not is_oidc_auth_mode():
        raise HTTPException(status_code=404, detail="Not found")
    settings = oidc_settings()
    authenticator = oidc_authenticator()
    transaction = await session.scalar(
        select(OidcLoginTransaction).where(
            OidcLoginTransaction.state_hash == _digest(state_value, authenticator.key),
            OidcLoginTransaction.expires_at > get_current_utc_datetime(),
        )
    )
    if transaction is None:
        raise HTTPException(status_code=400, detail={"code": "OIDC_STATE_INVALID"})
    await session.delete(transaction)
    await session.commit()
    if error or not code:
        raise HTTPException(status_code=403, detail={"code": "OIDC_ACCESS_DENIED"})

    payload = await authenticator.client.exchange(
        code=code,
        verifier=authenticator.cipher.decrypt(transaction.code_verifier_encrypted),
    )
    try:
        id_claims = jwt.decode(
            payload["id_token"],
            settings.read_public_key(),
            algorithms=["RS256"],
            audience=settings.client_id,
            issuer=settings.auth_issuer_url,
            options={"require": ["sub", "nonce", "iat", "exp", "iss", "aud"]},
        )
        _validate_token_lifetime(id_claims)
        if not secrets.compare_digest(str(id_claims["nonce"]), transaction.nonce):
            raise jwt.InvalidTokenError("nonce mismatch")
        principal = authenticator.verify_access_token(str(payload["access_token"]))
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=502, detail={"code": "OIDC_TOKEN_INVALID"}
        ) from exc
    if str(id_claims["sub"]) != principal.subject:
        raise HTTPException(status_code=502, detail={"code": "OIDC_SUBJECT_MISMATCH"})
    identity = _normalize_userinfo(
        await authenticator.client.userinfo(str(payload["access_token"])),
        expected_subject=principal.subject,
    )
    user = await _upsert_oidc_user(session, identity, principal)
    raw = secrets.token_urlsafe(48)
    now = get_current_utc_datetime()
    session.add(
        ApplicationSession(
            token_hash=_digest(raw, authenticator.key),
            user_id=user.id,
            subject=principal.subject,
            access_token_encrypted=authenticator.cipher.encrypt(
                str(payload["access_token"])
            ),
            refresh_token_encrypted=authenticator.cipher.encrypt(
                str(payload["refresh_token"])
            ),
            identity_encrypted=authenticator.cipher.encrypt(
                json.dumps(identity, ensure_ascii=False, separators=(",", ":"))
            ),
            expires_at=now + timedelta(hours=settings.session_hours),
            absolute_expires_at=now + timedelta(hours=settings.session_absolute_hours),
        )
    )
    await session.commit()
    response = RedirectResponse(transaction.return_to, status_code=302)
    _set_session_cookie(response, raw, settings)
    return response


async def authenticate_oidc_request(
    request: Request, session: AsyncSession
) -> tuple[OidcPrincipal, User, ApplicationSession]:
    return await oidc_authenticator().authenticate(request, session)


async def oidc_logout(
    request: Request, response: Response, session: AsyncSession
) -> None:
    settings = oidc_settings()
    authenticator = oidc_authenticator()
    raw = request.cookies.get(settings.session_cookie_name, "").strip()
    refresh_token: str | None = None
    if raw:
        record = await session.scalar(
            select(ApplicationSession).where(
                ApplicationSession.token_hash == _digest(raw, authenticator.key)
            )
        )
        if record is not None:
            try:
                refresh_token = authenticator.cipher.decrypt(
                    record.refresh_token_encrypted
                )
            except ValueError:
                refresh_token = None
            await session.delete(record)
            await session.commit()
    response.delete_cookie(
        settings.session_cookie_name,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    if refresh_token:
        await authenticator.client.revoke(refresh_token)


def validate_oidc_request_origin(request: Request) -> None:
    if request.method in SAFE_METHODS or not is_oidc_auth_mode():
        return
    if request.headers.get("x-pptmate-internal") == "1":
        return
    if not request.cookies.get(session_cookie_name()):
        return
    settings = oidc_settings()
    origin = (request.headers.get("origin") or "").strip().rstrip("/")
    if not origin:
        referer = (request.headers.get("referer") or "").strip()
        if referer:
            parsed = urlsplit(referer)
            origin = f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
    if origin != settings.application_public_url:
        raise HTTPException(status_code=403, detail={"code": "ORIGIN_INVALID"})


async def cleanup_oidc_state(session: AsyncSession) -> None:
    now = get_current_utc_datetime()
    await session.execute(
        delete(OidcLoginTransaction).where(OidcLoginTransaction.expires_at <= now)
    )
    await session.execute(
        delete(ApplicationSession).where(ApplicationSession.absolute_expires_at <= now)
    )
    await session.commit()
