"""Where a contract's file lives, and what one of its pages looks like on screen."""

from pathlib import Path

import pymupdf

from app.config import settings
from app.ingest.loader import IMAGE_SUFFIXES, MIN_TEXT_CHARS
from app.models import Document

VIEW_DPI = 110  # page images for the viewer: sharp enough to read, small enough to scroll


def folders() -> list[Path]:
    d = settings.data_dir
    return [d / "contracts", d / "contracts_batch2", d / "uploads", d / "inbox", d / "real" / "cuad", d / "real" / "german",
            Path(settings.document_source_path)]


def source_path(doc: Document) -> Path | None:
    return next((p for folder in folders() for p in [folder / doc.filename] if p.exists()), None)


def open_pdf(path: Path) -> pymupdf.Document:
    """Always a PDF: a JPEG/PNG becomes a one-page PDF, so page coordinates mean the same thing everywhere."""
    if path.suffix.lower() in IMAGE_SUFFIXES:
        with pymupdf.open(path) as img:
            return pymupdf.open("pdf", img.convert_to_pdf())
    return pymupdf.open(path)


def has_text_layer(page: pymupdf.Page) -> bool:
    return len(page.get_text().strip()) >= MIN_TEXT_CHARS


def page_png(doc: Document, page_no: int) -> bytes | None:
    cache = settings.data_dir / "cache" / doc.sha256 / f"{page_no}.png"
    if cache.exists():
        return cache.read_bytes()
    path = source_path(doc)
    if path is None:
        return None
    with open_pdf(path) as pdf:
        if not 1 <= page_no <= len(pdf):
            return None
        data = pdf[page_no - 1].get_pixmap(dpi=VIEW_DPI).tobytes("png")
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_bytes(data)
    return data


def page_info(pdf: pymupdf.Document) -> list[dict]:
    scale = VIEW_DPI / 72
    return [{"page": i, "width": round(p.rect.width * scale), "height": round(p.rect.height * scale),
             "text_layer": has_text_layer(p)} for i, p in enumerate(pdf, start=1)]
