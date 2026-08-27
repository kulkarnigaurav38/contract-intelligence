from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Every external dependency has two implementations behind one switch: best-of-breed and Microsoft.

    LLM:        gemini (Google AI Studio / Vertex)      | foundry (Azure AI Foundry / Azure OpenAI)
    OCR:        tesseract (local) + vision escalation   | document_intelligence (Azure AI Document Intelligence)
    Documents:  local folder (demo)                     | sharepoint (Microsoft Graph, delta sync)
    'auto' picks whichever credentials are present; Gemini/Tesseract/local win when both are configured.
    """

    model_config = SettingsConfigDict(env_file=REPO_ROOT / ".env", extra="ignore")

    database_url: str = "postgresql+psycopg://contracts:contracts@localhost:5432/contracts"
    data_dir: Path = REPO_ROOT / "data"
    contract_storage_url: str = "http://localhost:8000/api/mock-contract-storage"

    # ---- LLM provider -------------------------------------------------------------------------
    llm_provider: str = "auto"  # auto | gemini | foundry | none
    gemini_api_key: str = ""
    # Model routing: reasoning effort follows the task, not the other way round.
    model_pro: str = "gemini-3.1-pro-preview"  # verification, handwriting OCR
    model_flash: str = "gemini-3.7-flash"  # classification, extraction, chat
    model_lite: str = "gemini-3.5-flash-lite"  # injection screening
    model_embedding: str = "gemini-embedding-001"
    embedding_dim: int = 768  # both providers are asked for this size (Gemini output_dimensionality / OpenAI dimensions)

    azure_openai_endpoint: str = ""  # https://<resource>.openai.azure.com/
    azure_openai_api_key: str = ""
    azure_openai_api_version: str = "2025-04-01-preview"
    azure_deployment_pro: str = "gpt-5"  # deployment names in the Foundry project
    azure_deployment_flash: str = "gpt-5-mini"
    azure_deployment_lite: str = "gpt-5-nano"
    azure_deployment_embedding: str = "text-embedding-3-large"

    # ---- OCR provider -------------------------------------------------------------------------
    ocr_provider: str = "auto"  # auto | tesseract | document_intelligence
    azure_document_intelligence_endpoint: str = ""
    azure_document_intelligence_key: str = ""

    # ---- Document source ----------------------------------------------------------------------
    document_source: str = "local"  # local | sharepoint
    document_source_path: Path = REPO_ROOT / "data" / "contracts"  # the folder standing in for the SharePoint library
    entra_tenant_id: str = ""
    entra_client_id: str = ""
    entra_client_secret: str = ""
    sharepoint_site_id: str = ""
    sharepoint_drive_id: str = ""
    sharepoint_folder: str = "Contracts"

    @property
    def llm_provider_resolved(self) -> str:
        if self.llm_provider in ("gemini", "foundry", "none"):
            return self.llm_provider
        if self.gemini_api_key:
            return "gemini"
        if self.azure_openai_endpoint and self.azure_openai_api_key:
            return "foundry"
        return "none"

    @property
    def llm_enabled(self) -> bool:
        return self.llm_provider_resolved != "none"

    @property
    def ocr_provider_resolved(self) -> str:
        if self.ocr_provider in ("tesseract", "document_intelligence"):
            return self.ocr_provider
        return "document_intelligence" if self.azure_document_intelligence_endpoint else "tesseract"


settings = Settings()
