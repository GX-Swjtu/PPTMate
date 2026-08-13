from contextvars import ContextVar, Token
import uuid


_CURRENT_OWNER_ID: ContextVar[uuid.UUID | None] = ContextVar(
    "presenton_current_owner_id", default=None
)
_CURRENT_OWNER_IS_ADMIN: ContextVar[bool] = ContextVar(
    "presenton_current_owner_is_admin", default=False
)
_CURRENT_SESSION_TOKEN: ContextVar[str | None] = ContextVar(
    "presenton_current_session_token", default=None
)


def get_current_owner_id() -> uuid.UUID | None:
    return _CURRENT_OWNER_ID.get()


def get_current_owner_is_admin() -> bool:
    return _CURRENT_OWNER_IS_ADMIN.get()


def get_current_session_token() -> str | None:
    return _CURRENT_SESSION_TOKEN.get()


def set_current_owner_id(owner_id: uuid.UUID | None) -> Token:
    return _CURRENT_OWNER_ID.set(owner_id)


def set_current_owner_is_admin(is_admin: bool) -> Token:
    return _CURRENT_OWNER_IS_ADMIN.set(is_admin)


def set_current_session_token(session_token: str | None) -> Token:
    return _CURRENT_SESSION_TOKEN.set(session_token)


def reset_current_owner_id(token: Token) -> None:
    _CURRENT_OWNER_ID.reset(token)


def reset_current_owner_is_admin(token: Token) -> None:
    _CURRENT_OWNER_IS_ADMIN.reset(token)


def reset_current_session_token(token: Token) -> None:
    _CURRENT_SESSION_TOKEN.reset(token)
