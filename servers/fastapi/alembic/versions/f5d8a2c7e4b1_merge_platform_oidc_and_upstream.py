"""merge platform OIDC and upstream migration heads

Revision ID: f5d8a2c7e4b1
Revises: e4c1a7b9d2f0, e4c7a9b2d6f1
"""

from collections.abc import Sequence

revision: str = "f5d8a2c7e4b1"
down_revision: tuple[str, str] = ("e4c1a7b9d2f0", "e4c7a9b2d6f1")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
