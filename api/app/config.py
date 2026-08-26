from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=REPO_ROOT / ".env", extra="ignore")

    gemini_api_key: str = ""
    database_url: str = "postgresql+psycopg://contracts:contracts@localhost:5432/contracts"
    data_dir: Path = REPO_ROOT / "data"
    contract_storage_url: str = "http://localhost:8000/api/mock-contract-storage"

    # Model routing: reasoning effort follows the task, not the other way round.
    model_pro: str = "gemini-3.1-pro-preview"  # verification, handwriting OCR
    model_flash: str = "gemini-3.7-flash"  # classification, extraction, chat
    model_lite: str = "gemini-3.5-flash-lite"  # injection screening
    model_embedding: str = "gemini-embedding-001"
    embedding_dim: int = 768

    @property
    def llm_enabled(self) -> bool:
        return bool(self.gemini_api_key)


settings = Settings()
