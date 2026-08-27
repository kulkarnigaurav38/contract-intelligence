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


BANDS = 8  # horizontal bands used to check that every inked region produced words
INK_RELATIVE = 0.4  # a band with >= 40% of the densest band's dark pixels holds text (noise and blank bands stay far below)


@dataclass
class OcrResult:
    text: str
    method: str  # tesseract | vision_llm
    confidence: float
    note: str = ""


def _langs() -> str:
    available = set(pytesseract.get_languages())
    return "eng+deu" if "deu" in available else "eng"


def _uncovered_bands(img: Image.Image, data: dict) -> list[int]:
    """Bands that contain ink but no recognised word: OCR silently dropped a region (faded half page, skew)."""
    w, h = img.size
    band_h = h / BANDS
    words_in = set()
    for text, top, height in zip(data["text"], data["top"], data["height"]):
        if text.strip():
            words_in.add(min(BANDS - 1, int((top + height / 2) / band_h)))
    dark = [sum(img.crop((0, int(b * band_h), w, int((b + 1) * band_h))).histogram()[:128]) for b in range(BANDS)]
    floor = max(dark) * INK_RELATIVE
    return [b + 1 for b in range(BANDS) if dark[b] >= floor and dark[b] > 0 and b not in words_in]


def tesseract(image: bytes) -> tuple[str, float, list[int]]:
    """Return (text, mean word confidence, bands with ink but no words)."""
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
    return joined, round(confidence, 3), _uncovered_bands(img, data)


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


def needs_escalation(text: str, confidence: float, uncovered: list[int] = ()) -> bool:
    """Low confidence, suspiciously little text (a faded typewriter page can score 87% on the few words it finds),
    or inked regions that produced no words at all (mean confidence cannot see what was never detected)."""
    return confidence < ESCALATE_BELOW or len(text.split()) < MIN_WORDS or len(text) < MIN_CHARS or bool(uncovered)


def ocr_page(image: bytes) -> OcrResult:
    text, confidence, uncovered = tesseract(image)
    if not needs_escalation(text, confidence, uncovered):
        return OcrResult(text, "tesseract", confidence)
    transcription = vision_transcribe(image)
    if transcription is None:
        if uncovered and confidence >= ESCALATE_BELOW:  # text is fine where it exists, but regions are missing
            confidence = round(ESCALATE_BELOW - 0.01, 3)
        note = (f"page regions {uncovered} produced no text" if uncovered else f"low OCR confidence ({confidence:.0%})")
        return OcrResult(text, "tesseract", confidence, note=note + "; vision OCR unavailable offline")
    return OcrResult(transcription.text, "vision_llm", round(transcription.legibility, 3),
                     note=f"escalated from tesseract ({confidence:.0%})")
