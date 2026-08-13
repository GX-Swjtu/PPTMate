from pathlib import Path

from utils.db_utils import get_database_url_and_connect_args


def test_database_password_file_is_url_encoded(monkeypatch, tmp_path: Path):
    password_file = tmp_path / "database-password"
    password_file.write_text("s:e/c@r#et", encoding="utf-8")
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+asyncpg://ngl_pptmate@postgres:5432/ngl_pptmate",
    )
    monkeypatch.setenv("DATABASE_PASSWORD_FILE", str(password_file))

    database_url, connect_args = get_database_url_and_connect_args()

    assert database_url == (
        "postgresql+asyncpg://ngl_pptmate:s%3Ae%2Fc%40r%23et@postgres:5432/ngl_pptmate"
    )
    assert connect_args == {}
