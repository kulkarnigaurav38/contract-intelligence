"""A corrected copy of a contract with the accepted suggestions applied. The original is never touched.

Digital page: the old name is replaced in place (redaction with replacement text). Scanned page: the spot is
highlighted and gets a comment, because the team changes the paper original. A missing clause cannot be flowed
into an existing PDF, so it goes on an addendum page and a note marks where it belongs.
"""

import pymupdf

from app.audits.graph import LABELS
from app.files import has_text_layer, open_pdf, source_path
from app.locate import all_occurrences
from app.models import Document

TITLES = {"de": "Nachtrag – eingefügte Klauseln", "en": "Addendum – inserted clauses"}
INTRO = {"de": "Die folgenden Klauseln wurden bei der Prüfung als fehlend erkannt und ergänzt. Die Stelle im Vertrag, "
               "an der sie gehören, ist dort mit einer Notiz markiert.",
         "en": "The following clauses were found missing during review and added. The place in the contract where "
               "they belong is marked there with a note."}
MARK = {"de": "Nachtrag: {label}", "en": "Addendum: {label}"}
RENAME = {"de": "{old} → {new}", "en": "{old} → {new}"}


def _rect(bbox: list[float], page: pymupdf.Page) -> pymupdf.Rect:
    w, h = page.rect.width, page.rect.height
    return pymupdf.Rect(bbox[0] * w, bbox[1] * h, bbox[2] * w, bbox[3] * h)


def _grow(page: pymupdf.Page, rect: pymupdf.Rect, text: str, size: float) -> pymupdf.Rect:
    """Widen the box to the right for a longer replacement, as far as the line is empty there."""
    need = pymupdf.get_text_length(text, fontname="helv", fontsize=size) + 2
    if need <= rect.width:
        return rect
    limit = pymupdf.Rect(rect.x1, rect.y0, min(page.rect.width - 36, rect.x0 + need), rect.y1)
    if limit.width <= 0:
        return rect
    others = [w for w in page.get_text("words", clip=limit) if pymupdf.Rect(w[:4]).intersects(limit)
              and pymupdf.Rect(w[:4]).width > 0 and not pymupdf.Rect(w[:4]).intersects(rect)]
    free_until = min([w[0] for w in others], default=limit.x1)
    return pymupdf.Rect(rect.x0, rect.y0, max(rect.x1, min(limit.x1, free_until - 1)), rect.y1)


def _fit(text: str, rect: pymupdf.Rect) -> float:
    size = min(11.0, rect.height * 0.8)
    while size > 5 and pymupdf.get_text_length(text, fontname="helv", fontsize=size) > rect.width:
        size -= 0.5
    return size


def _write_addendum(pdf: pymupdf.Document, blocks: list[tuple[str, str]], lang: str) -> None:
    page = pdf.new_page()
    margin, y = 56, 72
    page.insert_text((margin, y), TITLES.get(lang, TITLES["en"]), fontname="hebo", fontsize=14)
    y += 24
    intro = pymupdf.Rect(margin, y, page.rect.width - margin, y + 80)
    rest = page.insert_textbox(intro, INTRO.get(lang, INTRO["en"]), fontname="helv", fontsize=9, lineheight=1.35)
    y = intro.y0 + (intro.height - max(rest, 0)) + 28
    for heading, text in blocks:
        for attempt in range(2):
            rect = pymupdf.Rect(margin, y, page.rect.width - margin, page.rect.height - margin)
            block = f"{heading}\n\n{text}" if heading else text
            left = page.insert_textbox(rect, block, fontname="helv", fontsize=10, lineheight=1.35)
            if left >= 0:
                y = rect.y1 - left + 18
                break
            page = pdf.new_page()  # did not fit: continue on a fresh page
            y = 72


def corrected_pdf(doc: Document, report: dict) -> bytes | None:
    path = source_path(doc)
    if path is None:
        return None
    lang = doc.language if doc.language in TITLES else "en"
    pdf = open_pdf(path)
    addendum: list[tuple[str, str]] = []
    for it in report.get("items", []):
        if it["review"]["status"] not in ("accepted", "auto"):
            continue
        page = pdf[it["page"] - 1]
        text = it["review"].get("edited_text") or it["suggestion"]
        bbox = it["anchor"]["bbox"]
        if it["kind"] == "old_name":
            hits = all_occurrences(page, it["name"]) if has_text_layer(page) else []
            if hits:
                for r in hits:
                    r = _grow(page, r, text, min(11.0, r.height * 0.8))
                    page.add_redact_annot(r, text=text, fontname="helv", fontsize=_fit(text, r), fill=(1, 1, 1), align=0)
                page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE)
            else:
                where = _rect(bbox, page) if bbox else pymupdf.Rect(36, 36, 200, 60)
                if bbox:
                    page.add_highlight_annot(where)
                note = page.add_text_annot(where.top_left, RENAME[lang].format(old=it["name"], new=text), icon="Note")
                note.update()
        else:
            heading, _, body = text.partition("\n\n") if "\n\n" in text else ("", "", text)
            label = LABELS.get(it.get("clause_type", ""), it.get("clause_type", ""))
            addendum.append((heading or label, body))
            where = _rect(bbox, page).top_left if bbox else pymupdf.Point(36, 36)
            note = page.add_text_annot(where, MARK[lang].format(label=label), icon="Insert")
            note.update()
    if addendum:
        _write_addendum(pdf, addendum, lang)
    out = pdf.tobytes(garbage=3, deflate=True)
    pdf.close()
    return out
