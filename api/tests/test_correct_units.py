"""A corrected copy of a real digital contract: accepted renames replaced in place, accepted clauses on an addendum page."""

from types import SimpleNamespace as NS

import pymupdf
import pytest

from app import correct
from app.config import settings

SOURCE = settings.data_dir / "contracts" / "C01_merchant_agreement_nordlicht.pdf"
OLD, NEW = "arvato Financial Solutions", "Riverty GmbH"


@pytest.fixture
def doc(monkeypatch):
    monkeypatch.setattr(correct, "source_path", lambda doc: SOURCE)
    return NS(filename=SOURCE.name, language="en", sha256="c01")


def items(status):
    return [
        {"kind": "old_name", "name": OLD, "page": 1, "suggestion": NEW, "anchor": {"kind": "highlight", "bbox": [0.3, 0.1, 0.5, 0.12]},
         "review": {"status": status, "edited_text": ""}},
        {"kind": "missing_clause", "clause_type": "anti_corruption", "page": 2, "suggestion": "", "anchor": {"kind": "insert", "bbox": None},
         "review": {"status": status, "edited_text": "Heading\n\nBody text of the clause."}},
    ]


def source_pages():
    with pymupdf.open(SOURCE) as src:
        return len(src), src[0].get_text()


def _span(page, needle):
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                if needle in span["text"]:
                    return span
    raise AssertionError(needle)


def test_accepted_items_are_applied_to_a_copy(doc):
    n, first = source_pages()
    assert OLD in first and NEW not in first
    with pymupdf.open(SOURCE) as src:
        original = _span(src[0], OLD)
    out = pymupdf.open("pdf", correct.corrected_pdf(doc, {"items": items("accepted")}))
    assert OLD not in out[0].get_text() and NEW in out[0].get_text()
    replaced = _span(out[0], NEW)  # set like the surrounding text: same size, same baseline
    assert abs(replaced["size"] - original["size"]) < 0.01 and abs(replaced["origin"][1] - original["origin"][1]) < 0.5
    assert len(out) == n + 1 and "Addendum" in out[-1].get_text() and "Body text of the clause." in out[-1].get_text()
    assert [a.info["content"] for a in out[1].annots()] == ["Addendum: anti-corruption / compliance"]  # where the clause belongs
    assert source_pages() == (n, first)  # the original is never touched


def test_dismissed_items_change_nothing(doc):
    n, first = source_pages()
    out = pymupdf.open("pdf", correct.corrected_pdf(doc, {"items": items("dismissed")}))
    assert len(out) == n and OLD in out[0].get_text() and NEW not in out[0].get_text()
