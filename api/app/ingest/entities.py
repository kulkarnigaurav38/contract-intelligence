"""Party / entity registry.

The rename problem is an entity problem, not a text-search problem: "Arvato
Systems" contains "Arvato" but was never renamed, and "Riverty (formerly Arvato
Payment Solutions)" is already up to date. So every mention is resolved against
a registry of known names and tagged with its role, and a "formerly/vormals"
context marks historical references.
"""

import re
from dataclasses import dataclass
from difflib import SequenceMatcher

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.llm import DOC_GUARD, ModelUnavailable, chat, with_retry

# longest names first so "Arvato Systems GmbH" is claimed before the bare brand "Arvato"
REGISTRY: list[tuple[str, str, bool]] = [  # (name, kind, case_sensitive)
    ("Arvato Systems GmbH", "third_party", False),
    ("Arvato Systems", "third_party", False),
    ("Arvato Payment Solutions GmbH", "our_entity_old", False),
    ("Arvato Payment Solutions", "our_entity_old", False),
    ("arvato Financial Solutions", "our_entity_old", False),
    ("Riverty GmbH", "our_entity_current", False),
    ("Riverty B.V.", "our_entity_current", False),
    ("Riverty", "our_entity_current", False),
    ("AFS", "our_entity_old", True),
    ("arvato", "our_entity_old", False),
]
HISTORICAL_RE = re.compile(r"(formerly|previously|vormals|ehemals|früher|now trading as)[^.\n]{0,40}$", re.I)
SUFFIX_RE = re.compile(
    r"\b([A-ZÄÖÜ][\w&.'\-]*(?:\s+[A-ZÄÖÜa-z&][\w&.'\-]*){0,4}\s+(?:GmbH|AG|B\.V\.|S\.A\.|S\.L\.|Ltd|AB|AS|OÜ|e\.K\.|SE|Inc\.))"
)
CONTEXT = 80
FUZZY_MIN = 0.8  # OCR-tolerant matching, multi-word registry names only
FUZZY_NAMES = [(name, kind) for name, kind, _ in REGISTRY if len(name.split()) >= 2]


@dataclass
class Mention:
    page_no: int
    name: str
    normalized: str
    kind: str
    context: str
    historical: bool
    method: str = "rules"
    confidence: float = 1.0


def normalize(name: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s&]", "", name.lower())).strip()


def find_mentions(pages: list[tuple[int, str]], ocr_pages: frozenset[int] = frozenset()) -> list[Mention]:
    """Exact registry matches everywhere; fuzzy matches additionally on OCR'd pages (noise-tolerant)."""
    mentions: list[Mention] = []
    for page_no, text in pages:
        taken: list[tuple[int, int]] = []

        def free(a: int, b: int) -> bool:
            return all(b <= s or a >= e for s, e in taken)

        for name, kind, cs in REGISTRY:
            pattern = re.compile(r"(?<![\w-])" + re.escape(name) + r"(?![\w-])", 0 if cs else re.I)
            for m in pattern.finditer(text):
                if not free(m.start(), m.end()):
                    continue
                taken.append((m.start(), m.end()))
                before = text[max(0, m.start() - CONTEXT): m.start()]
                context = (before + m.group(0) + text[m.end(): m.end() + CONTEXT]).replace("\n", " ")
                mentions.append(Mention(page_no, m.group(0), normalize(name), kind, context.strip(),
                                        bool(HISTORICAL_RE.search(before))))
        if page_no in ocr_pages:
            for start, end, name, kind, ratio in _fuzzy(text):
                if not free(start, end):
                    continue
                taken.append((start, end))
                before = text[max(0, start - CONTEXT): start]
                context = (before + text[start:end] + text[end: end + CONTEXT]).replace("\n", " ")
                mentions.append(Mention(page_no, text[start:end], normalize(name), kind, context.strip(),
                                        bool(HISTORICAL_RE.search(before)), "rules-fuzzy", round(ratio, 2)))
        for m in SUFFIX_RE.finditer(text):
            if not free(m.start(), m.end()):
                continue
            taken.append((m.start(), m.end()))
            context = text[max(0, m.start() - CONTEXT): m.end() + CONTEXT].replace("\n", " ")
            mentions.append(Mention(page_no, m.group(1), normalize(m.group(1)), "counterparty", context.strip(), False))
    return mentions


def _fuzzy(text: str) -> list[tuple[int, int, str, str, float]]:
    """Slide word n-grams over the text and compare them to multi-word registry names."""
    tokens = [(m.start(), m.end()) for m in re.finditer(r"\S+", text)]
    hits = []
    for name, kind in FUZZY_NAMES:
        target, n = normalize(name), len(name.split())
        for i in range(len(tokens) - n + 1):
            start, end = tokens[i][0], tokens[i + n - 1][1]
            ratio = SequenceMatcher(None, normalize(text[start:end]), target).ratio()
            if ratio >= FUZZY_MIN:
                hits.append((start, end, name, kind, ratio))
    return sorted(hits, key=lambda h: -h[4])


class Party(BaseModel):
    name: str
    role: str = Field(description="our_company | counterparty")


class ContractMeta(BaseModel):
    title: str
    contract_type: str = Field(description="merchant_agreement | dpa | nda | vendor_agreement | receivables_purchase | "
                                           "collection_services | saas_agreement | amendment | other")
    language: str = Field(description="ISO 639-1 code")
    parties: list[Party]


def llm_meta(text: str) -> ContractMeta | None:
    llm = chat("extract")
    if llm is None:
        return None
    messages = [
        SystemMessage(content=(
            "Extract the title, contract type, language and contracting parties of this contract. 'our_company' is "
            "the Riverty / arvato Financial Solutions / Arvato Payment Solutions side; everything else is a "
            "counterparty. " + DOC_GUARD
        )),
        HumanMessage(content=f"<document>\n{text[:12000]}\n</document>"),
    ]
    try:
        return with_retry(lambda: llm.with_structured_output(ContractMeta).invoke(messages), "extract")
    except ModelUnavailable:
        return None  # heuristics for title/type/language take over
