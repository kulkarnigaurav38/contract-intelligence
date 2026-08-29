"""Draft what is missing, in the contract's own language and style - a starting point for the lawyer, never final."""

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.audits.graph import LABELS
from app.llm import DOC_GUARD, ModelUnavailable, chat, with_retry

LANGUAGES = {"de": "German", "en": "English"}


class Draft(BaseModel):
    heading: str = Field(description="Clause heading with the next number in the contract's numbering style")
    text: str = Field(description="The clause text, 3-6 sentences, market standard, balanced")


def draft_clause(pages: list[tuple[int, str]], clause_type: str, contract_type: str, language: str,
                 partial_quote: str = "") -> Draft | None:
    llm = chat("draft")
    if llm is None:
        return None
    body = "\n".join(f'<page n="{n}">\n{t}\n</page>' for n, t in pages)
    task = (f"The contract has a provision on this subject that is materially narrower: \"{partial_quote}\". Draft the "
            f"amendment that completes it (as a replacement clause)." if partial_quote
            else "The contract has no such clause. Draft it as a new clause.")
    messages = [
        SystemMessage(content=(
            "You draft one clause for an existing commercial contract of a German payments company (Riverty GmbH). "
            f"Write in {LANGUAGES.get(language, 'English')}, in the register, numbering style and defined terms of the "
            "contract you are given (use the parties' names as the contract names them). Market-standard, balanced, "
            "3-6 sentences, no commentary, no placeholders in brackets unless a figure genuinely must be agreed. "
            + DOC_GUARD
        )),
        HumanMessage(content=f"Clause type: {LABELS.get(clause_type, clause_type)} (contract type: {contract_type}).\n{task}"
                             f"\n\n<document>\n{body[:40000]}\n</document>"),
    ]
    try:
        return with_retry(lambda: llm.with_structured_output(Draft).invoke(messages), "draft")
    except ModelUnavailable:
        return None
