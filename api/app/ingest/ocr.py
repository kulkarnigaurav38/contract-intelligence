"""OCR with confidence-driven escalation.

Tesseract runs first and reports a word-level confidence. Clean scans stay on
Tesseract (fast, local, no data leaves the machine). Low-confidence pages -
handwriting, faded photocopies - escalate to the vision model. Offline, the
low-confidence text is kept but flagged so nobody mistakes it for reliable.
"""

import base64
import io
import statistics
from dataclasses import dataclass

import pytesseract
from langchain_core.messages import HumanMessage, SystemMessage
from PIL import Image
from pydantic import BaseModel, Field

from app.llm import DOC_GUARD, chat

ESCALATE_BELOW = 0.80  # try the vision model below this
UNREADABLE_BELOW = 0.50  # without a vision model, text below this is not trusted at all
MIN_WORDS = 20
MIN_CHARS = 400  # a page that yields less text than a short paragraph is suspect even at high word confidence


@dataclass
class OcrResult:
    text: str
    method: str  # tesseract | vision_llm
    confidence: float
    note: str = ""


def _langs() -> str:
    available = set(pytesseract.get_languages())
    return "eng+deu" if "deu" in available else "eng"


def tesseract(image: bytes) -> tuple[str, float]:
    img = Image.open(io.BytesIO(image)).convert("L")  # tesseract is unreliable on RGB input
    data = pytesseract.image_to_data(img, lang=_langs(), output_type=pytesseract.Output.DICT)
    lines: dict[tuple, list[str]] = {}
    confs = []
    for text, conf, b, p, l in zip(data["text"], data["conf"], data["block_num"], data["par_num"], data["line_num"]):
        if not text.strip():
            continue
        lines.setdefault((b, p, l), []).append(text)
        if float(conf) >= 0:
            confs.append(float(conf))
    joined = "\n".join(" ".join(words) for words in lines.values())
    confidence = statistics.mean(confs) / 100 if confs else 0.0
    return joined, round(confidence, 3)


class Transcription(BaseModel):
    text: str = Field(description="Verbatim transcription, preserving line breaks and headings")
    legibility: float = Field(ge=0, le=1, description="How confidently the page could be read, 0-1")
    language: str = Field(description="ISO 639-1 code of the page language")


def vision_transcribe(image: bytes) -> Transcription | None:
    llm = chat("ocr_vision")
    if llm is None:
        return None
    mime = Image.MIME[Image.open(io.BytesIO(image)).format]
    messages = [
        SystemMessage(content=(
            "You transcribe scanned and handwritten contract pages. Return the text exactly as written, "
            "including headings, numbering and signature blocks. Do not summarise or correct the content. " + DOC_GUARD
        )),
        HumanMessage(content=[
            {"type": "text", "text": "Transcribe this page."},
            {"type": "image", "base64": base64.b64encode(image).decode(), "mime_type": mime},
        ]),
    ]
    return llm.with_structured_output(Transcription).invoke(messages)


def needs_escalation(text: str, confidence: float) -> bool:
    """Low confidence, or suspiciously little text for a page (a faded typewriter page can score 87% on the few words it finds)."""
    return confidence < ESCALATE_BELOW or len(text.split()) < MIN_WORDS or len(text) < MIN_CHARS


def ocr_page(image: bytes) -> OcrResult:
    text, confidence = tesseract(image)
    if not needs_escalation(text, confidence):
        return OcrResult(text, "tesseract", confidence)
    transcription = vision_transcribe(image)
    if transcription is None:
        return OcrResult(text, "tesseract", confidence,
                         note=f"low OCR confidence ({confidence:.0%}); vision OCR unavailable offline")
    return OcrResult(transcription.text, "vision_llm", round(transcription.legibility, 3),
                     note=f"escalated from tesseract ({confidence:.0%})")
