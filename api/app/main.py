import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import report
from app.db import SessionLocal, init_db
from app.models import Document
from app.routers import router


def catch_up_reports() -> None:
    """Contracts read before a restart (or whose check was interrupted) get their result now, in the background."""
    with SessionLocal() as session:
        ids = [d.id for d in session.query(Document).filter(Document.status == "ready").order_by(Document.id)
               if d.report.get("status") in (None, "running")]
    for doc_id in ids:
        with SessionLocal() as session:
            doc = session.get(Document, doc_id)
            if doc is not None:
                report.build(session, doc, doc.report.get("language", "de") if doc.report else "de")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    threading.Thread(target=catch_up_reports, daemon=True).start()
    yield


app = FastAPI(title="Contract Intelligence API", version="0.1.0", lifespan=lifespan)
app.include_router(router)
