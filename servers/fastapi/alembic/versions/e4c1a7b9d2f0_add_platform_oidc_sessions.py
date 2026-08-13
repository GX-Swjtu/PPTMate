"""add platform OIDC sessions

Revision ID: e4c1a7b9d2f0
Revises: f3a7c1d9e5b2
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e4c1a7b9d2f0"
down_revision: str | None = "f3a7c1d9e5b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("user", sa.Column("oidc_subject", sa.String(128), nullable=True))
    op.add_column("user", sa.Column("email", sa.String(320), nullable=True))
    op.add_column("user", sa.Column("display_name", sa.String(256), nullable=True))
    op.create_index("ix_user_oidc_subject", "user", ["oidc_subject"], unique=True)

    op.create_table(
        "application_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("subject", sa.String(128), nullable=False),
        sa.Column("access_token_encrypted", sa.Text(), nullable=False),
        sa.Column("refresh_token_encrypted", sa.Text(), nullable=False),
        sa.Column("identity_encrypted", sa.Text(), nullable=False),
        sa.Column("token_version", sa.Integer(), server_default="0", nullable=False),
        sa.Column("refresh_lease_id", sa.Uuid(), nullable=True),
        sa.Column(
            "refresh_lease_expires_at", sa.DateTime(timezone=True), nullable=True
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("absolute_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_application_sessions_token_hash",
        "application_sessions",
        ["token_hash"],
        unique=True,
    )
    op.create_index(
        "ix_application_sessions_user_id",
        "application_sessions",
        ["user_id"],
    )
    op.create_index(
        "ix_application_sessions_subject",
        "application_sessions",
        ["subject"],
    )
    op.create_index(
        "ix_application_sessions_expires_at",
        "application_sessions",
        ["expires_at", "id"],
    )

    op.create_table(
        "oidc_login_transactions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("state_hash", sa.String(64), nullable=False),
        sa.Column("nonce", sa.String(128), nullable=False),
        sa.Column("code_verifier_encrypted", sa.Text(), nullable=False),
        sa.Column("return_to", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_oidc_login_transactions_state_hash",
        "oidc_login_transactions",
        ["state_hash"],
        unique=True,
    )
    op.create_index(
        "ix_oidc_login_transactions_expires_at",
        "oidc_login_transactions",
        ["expires_at", "id"],
    )


def downgrade() -> None:
    op.drop_table("oidc_login_transactions")
    op.drop_table("application_sessions")
    op.drop_index("ix_user_oidc_subject", table_name="user")
    op.drop_column("user", "display_name")
    op.drop_column("user", "email")
    op.drop_column("user", "oidc_subject")
