"""Free-form questions: retrieve -> answer with citations. Answers must cite; uncited claims are refused."""

from typing import TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.llm import DOC_GUARD, chat
from app.retrieval import hybrid_search


LANGUAGES = {"de": "German", "en": "English"}


class ChatState(TypedDict, total=False):
    question: str
    language: str
    passages: list[dict]
    answer: str
    citations: list[dict]
    mode: str


class Citation(BaseModel):
    passage: int = Field(description="Index of the cited passage")
    quote: str = Field(description="Short verbatim quote from that passage")


class Answer(BaseModel):
    answer: str = Field(description="The answer; say so if the passages do not answer the question")
    citations: list[Citation]


def build(session: Session):
    def retrieve(state: ChatState) -> ChatState:
        hits = hybrid_search(session, state["question"], k=8)
        passages = [{
            "index": i, "document_id": c.document_id, "filename": c.document.filename, "title": c.document.title,
            "page": c.page_no, "clause_type": c.clause_type, "heading": c.heading, "text": c.text, "score": round(s, 4),
        } for i, (c, s) in enumerate(hits)]
        return {"passages": passages}

    def answer(state: ChatState) -> ChatState:
        llm = chat("answer")
        passages = state["passages"]
        if llm is None:
            listing = "\n\n".join(f"[{p['index']}] {p['title']} p.{p['page']} ({p['clause_type']}): {p['text'][:300]}"
                                  for p in passages)
            return {"answer": "Offline mode: no language model configured. Most relevant passages:\n\n" + listing,
                    "citations": [{**p, "quote": p["text"][:160]} for p in passages[:3]], "mode": "offline"}
        body = "\n\n".join(f"[{p['index']}] {p['title']} (page {p['page']}, {p['clause_type']}):\n{p['text']}"
                           for p in passages)
        messages = [
            SystemMessage(content=(
                "Answer the legal team's question using only the numbered passages. Cite every factual statement "
                "with the passage index. If the passages do not contain the answer, say so instead of guessing. "
                "Answer in " + LANGUAGES.get(state.get("language", "en"), "English") + ". " + DOC_GUARD
            )),
            HumanMessage(content=f"Question: {state['question']}\n\n<document>\n{body}\n</document>"),
        ]
        result = llm.with_structured_output(Answer).invoke(messages)
        by_index = {p["index"]: p for p in passages}
        citations = [{**by_index[c.passage], "quote": c.quote} for c in result.citations if c.passage in by_index]
        return {"answer": result.answer, "citations": citations, "mode": "llm"}

    g = StateGraph(ChatState)
    g.add_node("retrieve", retrieve)
    g.add_node("answer", answer)
    g.add_edge(START, "retrieve")
    g.add_edge("retrieve", "answer")
    g.add_edge("answer", END)
    return g.compile()


def ask(session: Session, question: str, language: str = "en") -> dict:
    state = build(session).invoke({"question": question, "language": language})
    return {"answer": state["answer"], "citations": state["citations"], "mode": state["mode"],
            "passages": state["passages"]}
