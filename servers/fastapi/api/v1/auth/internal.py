from api.v1.auth.config import SESSION_COOKIE_NAME
from api.v1.auth.context import get_current_owner_id, get_current_session_token
from api.v1.auth.users import get_jwt_strategy
from models.sql.user import User
from services.database import async_session_maker
from utils.get_env import is_disable_auth_enabled
from api.v1.auth.oidc import is_oidc_auth_mode, session_cookie_name


async def authenticated_internal_request_headers() -> dict[str, str]:
    """Issue a database-backed JWT for the current trusted internal request."""
    if is_disable_auth_enabled():
        return {}

    if is_oidc_auth_mode():
        raw_session = get_current_session_token()
        if not raw_session:
            return {}
        return {
            "Cookie": f"{session_cookie_name()}={raw_session}",
            "X-PPTMate-Internal": "1",
        }

    owner_id = get_current_owner_id()
    if owner_id is None:
        return {}

    async with async_session_maker() as session:
        user = await session.get(User, owner_id)
        if user is None or not user.is_active:
            return {}
        token = await get_jwt_strategy().write_token(user)
    return {"Cookie": f"{SESSION_COOKIE_NAME}={token}"}
