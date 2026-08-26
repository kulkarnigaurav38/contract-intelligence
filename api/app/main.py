from fastapi import FastAPI

from app.config import settings

app = FastAPI(title="Contract Intelligence API", version="0.1.0")


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/config")
def config() -> dict:
    return {
        "llm_enabled": settings.llm_enabled,
        "models": {
            "pro": settings.model_pro,
            "flash": settings.model_flash,
            "lite": settings.model_lite,
            "embedding": settings.model_embedding,
        },
    }
