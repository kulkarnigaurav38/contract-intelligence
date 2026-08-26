from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import init_db
from app.routers import router


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Contract Intelligence API", version="0.1.0", lifespan=lifespan)
app.include_router(router)
