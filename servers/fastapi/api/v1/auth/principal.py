from dataclasses import dataclass
from typing import Literal
import uuid

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.v1.auth.users import UsernameUserDatabase, UserManager, get_jwt_strategy
from models.sql.access_token import AccessToken
from models.sql.user import User
from api.v1.auth.config import SESSION_COOKIE_NAME


@dataclass(frozen=True)
class AuthPrincipal:
    user_id: uuid.UUID
    username: str
    is_admin: bool
    method: Literal["jwt", "oidc", "api_key"]


async def resolve_request_principal(
    request: Request, session: AsyncSession
) -> tuple[AuthPrincipal | None, User | None]:
    from api.v1.auth.oidc import (
        api_keys_enabled,
        authenticate_oidc_request,
        is_oidc_auth_mode,
    )

    if is_oidc_auth_mode():
        try:
            principal, user, _record = await authenticate_oidc_request(request, session)
        except HTTPException as exc:
            if exc.status_code in {401, 403}:
                return None, None
            raise
        return (
            AuthPrincipal(
                user_id=user.id,
                username=user.username,
                is_admin=principal.is_admin,
                method="oidc",
            ),
            user,
        )

    cookie_token = request.cookies.get(SESSION_COOKIE_NAME)
    if cookie_token:
        user_db = UsernameUserDatabase(session)
        user = await get_jwt_strategy().read_token(cookie_token, UserManager(user_db))
        if user:
            return (
                AuthPrincipal(
                    user_id=user.id,
                    username=user.username,
                    is_admin=user.is_superuser,
                    method="jwt",
                ),
                user,
            )

    authorization = request.headers.get("Authorization", "")
    if authorization.lower().startswith("bearer "):
        if not api_keys_enabled():
            return None, None
        token = authorization.split(" ", 1)[1].strip()
        if not token.startswith("sk-presenton-"):
            return None, None
        access_token = await session.get(AccessToken, token)
        if access_token is None:
            return None, None
        user = await session.get(User, access_token.user_id)
        if user is None or not user.is_active or not user.is_superuser:
            return None, None
        return (
            AuthPrincipal(
                user_id=user.id,
                username=user.username,
                is_admin=True,
                method="api_key",
            ),
            user,
        )

    return None, None


def principal_from_request(request: Request) -> AuthPrincipal:
    principal = getattr(request.state, "auth_principal", None)
    if principal is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return principal


def require_browser_admin_principal(request: Request) -> AuthPrincipal:
    principal = principal_from_request(request)
    if principal.method not in {"jwt", "oidc"} or not principal.is_admin:
        raise HTTPException(status_code=403, detail="Admin browser session required")
    return principal
