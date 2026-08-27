"""One switch, two implementations: the Microsoft path is selected by configuration, nothing else changes."""

from app import llm
from app.config import settings


def _with(monkeypatch, **values):
    for k, v in values.items():
        monkeypatch.setattr(settings, k, v)


def test_provider_resolution_prefers_explicit_setting_then_credentials(monkeypatch):
    _with(monkeypatch, llm_provider="auto", gemini_api_key="", azure_openai_endpoint="", azure_openai_api_key="")
    assert settings.llm_provider_resolved == "none" and not settings.llm_enabled
    _with(monkeypatch, azure_openai_endpoint="https://x.openai.azure.com/", azure_openai_api_key="k")
    assert settings.llm_provider_resolved == "foundry"
    _with(monkeypatch, gemini_api_key="g")
    assert settings.llm_provider_resolved == "gemini"  # best-of-breed wins when both are configured
    _with(monkeypatch, llm_provider="foundry")
    assert settings.llm_provider_resolved == "foundry"  # unless the operator says otherwise
    _with(monkeypatch, llm_provider="none")
    assert not settings.llm_enabled


def test_foundry_builds_azure_models_with_the_same_routing_table(monkeypatch):
    from langchain_openai import AzureChatOpenAI, AzureOpenAIEmbeddings

    _with(monkeypatch, llm_provider="foundry", azure_openai_endpoint="https://x.openai.azure.com/", azure_openai_api_key="k")
    verify = llm.chat("verify")
    assert isinstance(verify, AzureChatOpenAI)
    assert verify.deployment_name == settings.azure_deployment_pro and verify.reasoning_effort == "high"
    screen = llm.chat("screen")
    assert screen.deployment_name == settings.azure_deployment_lite and screen.reasoning_effort == "minimal"
    emb = llm.embeddings("RETRIEVAL_DOCUMENT")
    assert isinstance(emb, AzureOpenAIEmbeddings) and emb.dimensions == settings.embedding_dim
    assert {r["task"] for r in llm.routing_table()} == set(llm.TASKS)
    assert llm.routing_table()[0]["model"] == settings.azure_deployment_pro


def test_gemini_builds_google_models(monkeypatch):
    from langchain_google_genai import ChatGoogleGenerativeAI

    _with(monkeypatch, llm_provider="gemini", gemini_api_key="g")
    assert isinstance(llm.chat("classify"), ChatGoogleGenerativeAI)
    assert llm.routing_table()[1]["model"] == settings.model_flash


def test_ocr_provider_resolution(monkeypatch):
    _with(monkeypatch, ocr_provider="auto", azure_document_intelligence_endpoint="")
    assert settings.ocr_provider_resolved == "tesseract"
    _with(monkeypatch, azure_document_intelligence_endpoint="https://x.cognitiveservices.azure.com/")
    assert settings.ocr_provider_resolved == "document_intelligence"
    _with(monkeypatch, ocr_provider="tesseract")
    assert settings.ocr_provider_resolved == "tesseract"
