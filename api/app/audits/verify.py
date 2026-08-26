"""Independent verification of a claim against the *full* contract text.

Retrieval can miss; a verifier that only sees retrieved chunks inherits that
blind spot. Contracts are small relative to a 1M-token context, so the verifier
reads the whole document and must quote the decisive passage with its page.
"""

from typing import Literal

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.llm import DOC_GUARD, chat


class Verdict(BaseModel):
    verdict: Literal["confirmed", "refuted"]
    confidence: float = Field(ge=0, le=1)
    page: int = Field(description="Page of the decisive passage, 0 if none")
    quote: str = Field(description="Verbatim decisive passage, or empty")
    reasoning: str


def verify(pages: list[tuple[int, str]], claim: str) -> Verdict | None:
    llm = chat("verify")
    if llm is None:
        return None
    body = "\n".join(f'<page n="{n}">\n{t}\n</page>' for n, t in pages)
    messages = [
        SystemMessage(content=(
            "You are the independent verifier of a legal review tool. You receive the full text of one contract and "
            "a claim produced by an automated pipeline. Decide from the contract text alone whether the claim is "
            "correct. A claim that a clause is missing is refuted if an equivalent provision exists under any "
            "heading or wording, in any language. A claim that an old company name is used as an active party is "
            "refuted if the name only appears as a historical reference (e.g. 'formerly', 'vormals') or belongs to "
            "a different company. Quote the decisive passage verbatim with its page number. Be conservative with "
            "confidence: sensitive legal documents, mistakes are costly. " + DOC_GUARD
        )),
        HumanMessage(content=f"Claim: {claim}\n\n<document>\n{body}\n</document>"),
    ]
    return llm.with_structured_output(Verdict).invoke(messages)
