"""Independent verification of a claim against the *full* contract text.

Retrieval can miss; a verifier that only sees retrieved chunks inherits that
blind spot. Contracts are small relative to a 1M-token context, so the verifier
reads the whole document and must quote the decisive passage with its page.
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
    body = "\n".join(f'<page n="{n}">\n{t}\n</page>' for n, t in pages)
    history = ""
    if precedents:
        history = "\n\nDecisions of the legal team on earlier findings of the same kind - calibrate to what this team " \
                  "considers acceptable:\n" + "\n".join(
            f"- {p['decision'].upper()}: \"{p['note']}\"" + (f" (evidence was: \"{p['quote'][:200]}\")" if p['quote'] else "")
            for p in precedents)
    messages = [
        SystemMessage(content=(
            "You are the independent verifier of a legal review tool. You receive the full text of one contract and "
            "a claim produced by an automated pipeline. Decide from the contract text alone whether the claim is "
            "correct. A claim that a clause is missing is refuted if an equivalent provision exists under any "
            "heading or wording, in any language. A claim that an old company name is used as an active party is "
            "refuted if the name only appears as a historical reference (e.g. 'formerly', 'vormals') or belongs to "
            "a different company. Answer 'partial' when a provision on the same subject exists but is materially "
            "narrower than what the claim asks for (e.g. a bare warranty where a compliance-and-procedures obligation "
            "is expected) - a lawyer must then judge. Quote the decisive passage verbatim with its page number. Be conservative with "
            "confidence: sensitive legal documents, mistakes are costly. Write the reasoning in "
            + LANGUAGES.get(language, "English") + ", for a lawyer, in two or three sentences. " + DOC_GUARD
        )),
        HumanMessage(content=f"Claim: {claim}{history}\n\n<document>\n{body}\n</document>"),
    ]
    try:
        return with_retry(lambda: llm.with_structured_output(Verdict).invoke(messages), "verify")
    except ModelUnavailable:
        return None  # the finding is stored as 'not cross-checked' and a person decides
