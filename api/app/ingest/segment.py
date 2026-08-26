"""Split contract text into clauses. A clause is the retrieval unit everywhere downstream."""

import re
from dataclasses import dataclass

# "1. Heading", "12) Heading", "§ 3 Überschrift" at line start
BOUNDARY_RE = re.compile(r"^[ \t]*(?:§[ \t]*\d{1,2}|\d{1,2}[.)])[ \t]+(\S.*)$", re.M)
MAX_HEADING_WORDS = 8


@dataclass
class Segment:
    ordinal: int
    page_no: int
    heading: str
    text: str


def segment(pages: list[tuple[int, str]]) -> list[Segment]:
    """pages: [(page_no, text)] in order. Clauses may span pages; page_no is where the clause starts."""
    full, starts = "", []
    for page_no, text in pages:
        starts.append((len(full), page_no))
        full += text.strip() + "\n"

    def page_at(offset: int) -> int:
        page = starts[0][1]
        for start, page_no in starts:
            if start <= offset:
                page = page_no
        return page

    cuts = [(m.start(), m) for m in BOUNDARY_RE.finditer(full)]
    segments: list[Segment] = []
    preamble = full[: cuts[0][0]] if cuts else full
    if preamble.strip():
        segments.append(Segment(0, page_at(0), "", preamble.strip()))
    for i, (start, m) in enumerate(cuts):
        end = cuts[i + 1][0] if i + 1 < len(cuts) else len(full)
        block = full[start:end].strip()
        first_line = m.group(1).strip()
        if len(first_line.split()) <= MAX_HEADING_WORDS:
            heading, body = first_line, block[m.end() - start:].strip()
        else:
            heading, body = "", block
        segments.append(Segment(len(segments), page_at(start), heading, body or heading))
    return segments
