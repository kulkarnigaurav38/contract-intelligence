"""Route every page by what it actually is, not by file extension.

A PDF page with a usable text layer is read directly (free, exact). A page
without one is rendered and sent to OCR. This is decided per page, so a
digital contract with a scanned signature page is handled correctly.
"""

from dataclasses import dataclass
from pathlib import Path

import pymupdf

MIN_TEXT_CHARS = 40
RENDER_DPI = 200
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}


@dataclass
class PageInput:
    page_no: int
    text: str | None  # text layer, if usable
    image: bytes | None  # rendered page (PNG) or original image, when OCR is needed


def _page_image(doc: pymupdf.Document, page: pymupdf.Page) -> bytes:
    """Use the embedded scan at native resolution when the page is just one image; render otherwise."""
    images = page.get_images()
    if len(images) == 1:
        return doc.extract_image(images[0][0])["image"]
    return page.get_pixmap(dpi=RENDER_DPI).tobytes("png")


def load(path: Path) -> tuple[str, list[PageInput]]:
    """Return (input_type, pages). input_type: digital_pdf | scanned_pdf | mixed_pdf | image."""
    if path.suffix.lower() in IMAGE_SUFFIXES:
        return "image", [PageInput(1, None, path.read_bytes())]
    doc = pymupdf.open(path)
    pages = []
    for i, page in enumerate(doc, start=1):
        text = page.get_text().strip()
        if len(text) >= MIN_TEXT_CHARS:
            pages.append(PageInput(i, text, None))
        else:
            pages.append(PageInput(i, None, _page_image(doc, page)))
    needs_ocr = sum(p.text is None for p in pages)
    if needs_ocr == 0:
        kind = "digital_pdf"
    elif needs_ocr == len(pages):
        kind = "scanned_pdf"
    else:
        kind = "mixed_pdf"
    return kind, pages
