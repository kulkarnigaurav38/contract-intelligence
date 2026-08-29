"""Find where a passage sits on a page, so the viewer can point at it.

Digital page: the PDF text layer knows exactly. Scanned page: Tesseract word boxes, matched fuzzily (OCR noise).
Handwritten or otherwise unreadable for Tesseract: ask the vision model for the box. Nothing found: None, and the
viewer falls back to a page-level marker - never a wrong box.
"""

import base64
import difflib
import io
import re

import pymupdf
import pytesseract
from langchain_core.messages import HumanMessage, SystemMessage
from PIL import Image
from pydantic import BaseModel, Field

from app.files import VIEW_DPI, has_text_layer
from app.ingest.ocr import _langs
from app.llm import DOC_GUARD, ModelUnavailable, chat, with_retry

Box = list[float]  # [x0, y0, x1, y1], normalised 0..1 of the page
WORD_MIN = 0.72  # per-word similarity a scanned word must reach


def _norm(rect: pymupdf.Rect, page: pymupdf.Page) -> Box:
    w, h = page.rect.width, page.rect.height
    return [round(rect.x0 / w, 4), round(rect.y0 / h, 4), round(rect.x1 / w, 4), round(rect.y1 / h, 4)]


def _tokens(text: str) -> list[str]:
    return [t for t in re.split(r"[^\wäöüß]+", text.lower()) if t]


def words_of(page: pymupdf.Page) -> list[tuple[str, Box]]:
    """OCR word boxes of a rendered page, normalised. Cached per call site; cheap enough for a few pages."""
    pix = page.get_pixmap(dpi=VIEW_DPI)
    img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("L")
    data = pytesseract.image_to_data(img, lang=_langs(), output_type=pytesseract.Output.DICT)
    w, h = img.size
    out = []
    for text, left, top, width, height in zip(data["text"], data["left"], data["top"], data["width"], data["height"]):
        if text.strip():
            out.append((text, [left / w, top / h, (left + width) / w, (top + height) / h]))
    return out


def _match_words(words: list[tuple[str, Box]], needle: str) -> Box | None:
    tokens = _tokens(needle)
    if not tokens:
        return None
    n = len(tokens)
    best, best_score = None, 0.0
    for i in range(len(words) - n + 1):
        window = words[i:i + n]
        scores = [difflib.SequenceMatcher(None, "".join(_tokens(wt)), t).ratio() for (wt, _), t in zip(window, tokens)]
        good = sum(sc >= WORD_MIN for sc in scores)
        if good >= max(1, round(0.7 * n)) and sum(scores) / n >= 0.8 and sum(scores) / n > best_score:
            best_score = sum(scores) / n
            xs0, ys0, xs1, ys1 = zip(*[b for _, b in window])
            best = [round(min(xs0), 4), round(min(ys0), 4), round(max(xs1), 4), round(max(ys1), 4)]
    return best


class Located(BaseModel):
    found: bool = Field(description="Whether the passage is visible on the page")
    box_2d: list[int] = Field(default_factory=list, description="[ymin, xmin, ymax, xmax] on a 0-1000 scale")


def vision_box(page: pymupdf.Page, needle: str) -> Box | None:
    llm = chat("locate")
    if llm is None:
        return None
    png = page.get_pixmap(dpi=VIEW_DPI).tobytes("png")
    messages = [
        SystemMessage(content="You locate a given passage on an image of a contract page (printed or handwritten). "
                              "Return the tight bounding box of exactly that passage as box_2d [ymin, xmin, ymax, xmax] "
                              "on a 0-1000 scale, or found=false if it is not on the page. " + DOC_GUARD),
        HumanMessage(content=[{"type": "text", "text": f"Passage to locate: \"{needle}\""},
                              {"type": "image", "base64": base64.b64encode(png).decode(), "mime_type": "image/png"}]),
    ]
    try:
        r = with_retry(lambda: llm.with_structured_output(Located).invoke(messages), "locate")
    except ModelUnavailable:
        return None
    if r is None or not r.found or len(r.box_2d) != 4:
        return None
    ymin, xmin, ymax, xmax = (max(0, min(1000, v)) / 1000 for v in r.box_2d)
    return [round(xmin, 4), round(ymin, 4), round(xmax, 4), round(ymax, 4)] if xmax > xmin and ymax > ymin else None


def find_text(page: pymupdf.Page, needle: str, words: list[tuple[str, Box]] | None = None,
              allow_vision: bool = True) -> Box | None:
    """Box of the first occurrence of `needle` on the page (digital: exact; scan: fuzzy; else vision)."""
    needle = " ".join(needle.split())
    if not needle:
        return None
    if has_text_layer(page):
        hits = exact_hits(page, needle)
        for probe in (needle, needle[:80], needle[:40]):
            hits = hits or page.search_for(probe)
            if hits:
                return _norm(hits[0], page)
        return None
    ocr_words = words if words is not None else words_of(page)
    box = next((b for probe in (needle[:120], needle[:60], needle[:30]) for b in [_match_words(ocr_words, probe)] if b), None)
    if box is None and allow_vision:
        box = vision_box(page, needle[:200])
    return box


def _alnum(s: str) -> str:
    return re.sub(r"[^\w]", "", s)


def exact_hits(page: pymupdf.Page, needle: str) -> list[pymupdf.Rect]:
    """search_for is case-insensitive and matches inside words ('AFS' in 'AFSX'); keep only whole-word,
    case-sensitive hits, decided by the words the hit rectangle covers."""
    words = page.get_text("words")
    want = _alnum(needle)
    out = []
    for hit in page.search_for(needle):
        covered = [w for w in words if pymupdf.Rect(w[:4]).intersects(hit)]
        if _alnum("".join(w[4] for w in sorted(covered, key=lambda w: (w[5], w[6], w[7])))) == want:
            out.append(hit)
    return out


def all_occurrences(page: pymupdf.Page, needle: str) -> list[pymupdf.Rect]:
    """Every whole-word hit of a name on a digital page, in page coordinates (for replacing it)."""
    return exact_hits(page, needle) if has_text_layer(page) else []


def insert_line(page: pymupdf.Page, after_text: str, words: list[tuple[str, Box]] | None = None) -> Box | None:
    """A thin box just below the last line of `after_text`: where a new clause would go."""
    flat = " ".join(after_text.split())
    box = next((b for tail in (flat[-60:], flat[-30:]) for b in [find_text(page, tail, words, allow_vision=False)] if b), None)
    if box is None:
        return None
    y = min(0.99, box[3] + (0.005 if has_text_layer(page) else 0.015))  # OCR boxes hug the ink; leave room
    return [0.08, y, 0.92, min(1.0, y + 0.012)]
