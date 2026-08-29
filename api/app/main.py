import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import report
from app.db import SessionLocal, init_db
from app.models import Document
from app.routers import router


def catch_up_reports() -> None:
    """Contracts read before a restart (or whose check was interrupted) get their result now, in the background."""
    def wants(r: dict) -> str:
        if r.get("status") in (None, "running", "failed") or r.get("degraded"):
            return "build"  # never finished, or finished without the cross-check
        if r.get("status") == "ready" and ("items" not in r or any(i["kind"] != "old_name" and not i["suggestion"] for i in r["items"])):
            return "upgrade"  # result exists; add places, suggestions and decision state
        return ""

    with SessionLocal() as session:
        todo = [(d.id, wants(d.report)) for d in session.query(Document).filter(Document.status == "ready").order_by(Document.id)
                if wants(d.report)]
    for doc_id, what in todo:
        with SessionLocal() as session:
            doc = session.get(Document, doc_id)
            if doc is None:
                continue
            if what == "upgrade":
                report.upgrade(session, doc)
            else:
                report.build(session, doc, doc.report.get("language", "de") if doc.report else "de")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    threading.Thread(target=catch_up_reports, daemon=True).start()
    yield


app = FastAPI(title="Contract Intelligence API", version="0.1.0", lifespan=lifespan)
app.include_router(router)
