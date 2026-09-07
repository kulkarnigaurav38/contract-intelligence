"""Independent verification of a claim against the contract text.

Retrieval can miss; a verifier that only sees retrieved chunks inherits that blind spot. So the verifier reads
either the whole document or - when the knowledge graph is there - the contract's complete outline (every clause
heading with its type and page, passed as page 0) plus the clauses the graph ranked as relevant to the claim: the
structure proves what exists, the excerpts carry the substance, and the model must still quote the decisive
passage with its page.
"""

from typing import Literal

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.llm import DOC_GUARD, ModelUnavailable, chat, with_retry


class Verdict(BaseModel):
    verdict: Literal["confirmed", "refuted", "partial"]
    confidence: float = Field(ge=0, le=1)
    page: int = Field(description="Page of the decisive passage, 0 if none")
    quote: str = Field(description="Verbatim decisive passage, or empty")
    reasoning: str


LANGUAGES = {"de": "German", "en": "English"}


def verify(pages: list[tuple[int, str]], claim: str, language: str = "en",
           precedents: list[dict] | None = None) -> Verdict | None:
    llm = chat("verify")
    if llm is None:
        return None
    body = "\n".join(f'<outline>\n{t}\n</outline>' if n == 0 else f'<page n="{n}">\n{t}\n</page>' for n, t in pages)
    history = ""
    if precedents:
        history = "\n\nDecisions of the legal team on earlier findings of the same kind - calibrate to what this team " \
                  "considers acceptable:\n" + "\n".join(
            f"- {p['decision'].upper()}: \"{p['note']}\"" + (f" (evidence was: \"{p['quote'][:200]}\")" if p['quote'] else "")
            for p in precedents)
    messages = [
        SystemMessage(content=(
            "You are the independent verifier of a legal review tool. You receive the text of one contract - either "
            "in full, or as its complete outline (<outline>: every clause with its type and page) followed by the "
            "clauses a knowledge graph selected as relevant - and a claim produced by an automated pipeline. Decide "
            "from that text alone whether the claim is correct; the outline tells you which clauses exist, the "
            "<page> excerpts what they say. A claim that a clause is missing is refuted if an equivalent provision exists under any "
            "heading or wording, in any language. A claim that an old company name is used as an active party is "
            "refuted if the name only appears as a historical reference (e.g. 'formerly', 'vormals') or belongs to "
            "a different company. Answer 'partial' when a provision on the same subject exists but is materially "
            "narrower than what the claim asks for (e.g. a bare warranty where a compliance-and-procedures obligation "
            "is expected) - a lawyer must then judge. Quote the decisive passage verbatim with its page number (never page 0, the outline). Be conservative with "
            "confidence: sensitive legal documents, mistakes are costly. Write the reasoning in "
            + LANGUAGES.get(language, "English") + ", for a lawyer, in two or three sentences. " + DOC_GUARD
        )),
        HumanMessage(content=f"Claim: {claim}{history}\n\n<document>\n{body}\n</document>"),
    ]
    try:
        return with_retry(lambda: llm.with_structured_output(Verdict).invoke(messages), "verify")
    except ModelUnavailable:
        return None  # the finding is stored as 'not cross-checked' and a person decides


def _covers(scoped: list[tuple[int, str]], full: list[tuple[int, str]]) -> bool:
    """The selection already holds (nearly) the whole contract: a second read would only repeat the first."""
    if scoped is full:
        return True
    got = sum(len(t) for n, t in scoped if n != 0)
    total = sum(len(t) for _, t in full)
    return total == 0 or got >= 0.9 * total


def verify_absence(scoped: list[tuple[int, str]], full: list[tuple[int, str]], claim: str, language: str = "en",
                   precedents: list[dict] | None = None, absence: str = "confirmed", verify_fn=None) -> tuple[Verdict | None, bool]:
    """Two reads for an absence. The graph's selection first - cheap, and enough to refute most candidates - and, when
    that read still says the provision is not there (`absence`: the verdict that means so for this claim), the whole
    contract before a lawyer is asked to look: over-flagging is the cheap error, and the full read removes it.
    Returns (verdict, complete); complete is False when a read could not run, so the check is repeated later."""
    fn = verify_fn or verify
    v = fn(scoped, claim, language, precedents)
    if v is None:
        return None, False
    if v.verdict != absence or _covers(scoped, full):
        return v, True
    again = fn(full, claim, language, precedents)
    return (v, False) if again is None else (again, True)
