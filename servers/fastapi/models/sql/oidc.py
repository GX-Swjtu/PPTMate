import datetime
import uuid

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from models.sql.user import UserBase
from utils.datetime_utils import get_current_utc_datetime


class ApplicationSession(UserBase):
    __tablename__ = "application_sessions"
    __table_args__ = (Index("ix_application_sessions_expires_at", "expires_at", "id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    token_hash: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subject: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    access_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    identity_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    token_version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    refresh_lease_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    refresh_lease_expires_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expires_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    absolute_expires_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=get_current_utc_datetime
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=get_current_utc_datetime,
        onupdate=get_current_utc_datetime,
    )


class OidcLoginTransaction(UserBase):
    __tablename__ = "oidc_login_transactions"
    __table_args__ = (
        Index("ix_oidc_login_transactions_expires_at", "expires_at", "id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    state_hash: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True
    )
    nonce: Mapped[str] = mapped_column(String(128), nullable=False)
    code_verifier_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    return_to: Mapped[str] = mapped_column(Text, nullable=False, default="/")
    expires_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=get_current_utc_datetime
    )
