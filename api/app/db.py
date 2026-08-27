from collections.abc import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def init_db() -> None:
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    from app import models  # noqa: F401  (registers tables)

    Base.metadata.create_all(engine)
    with engine.begin() as conn:  # additive columns for databases created before they existed
        conn.execute(text("ALTER TABLE findings ADD COLUMN IF NOT EXISTS class_key VARCHAR(64) NOT NULL DEFAULT ''"))
        conn.execute(text("ALTER TABLE findings ADD COLUMN IF NOT EXISTS policy JSON NOT NULL DEFAULT '{}'"))


def get_session() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session
