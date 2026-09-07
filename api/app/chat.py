"""Free-form questions: retrieve -> answer with citations. Answers must cite; uncited claims are refused."""

from typing import TypedDict

import re

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

from app.db import Store
from app.llm import DOC_GUARD, ModelUnavailable, chat, with_retry
from app.retrieval import hybrid_search

GENERIC = {"gmbh", "agreement", "vertrag", "contract", "limited", "group", "software", "solutions", "financial",
           "payment", "riverty", "arvato", "merchant", "services", "retail", "energie", "energy"}


LANGUAGES = {"de": "German", "en": "English"}


class ChatState(TypedDict, total=False):
    question: str
    language: str
    scope: list[dict]  # contracts the question names, if any
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


def documents_named_in(session: Store, question: str) -> list[dict]:
    """Contracts whose counterparty (or title) is named in the question, e.g. 'Nordlicht' -> C01."""
    words = {w.lower() for w in re.findall(r"[A-ZÄÖÜ][\wäöüß]{3,}", question)} - GENERIC
    if not words:
        return []
    hits: dict[int, str] = {}
    for e in session.mentions(["counterparty", "third_party"]):
        if words & ({w.lower() for w in re.findall(r"[\wäöüß]{4,}", e.name)} - GENERIC):
            hits.setdefault(e.document_id, e.name)
    return [{"document_id": d.id, "title": d.title, "counterparty": hits[d.id]}
            for d in session.documents(ids=list(hits))] if hits else []


def build(session: Store):
    def retrieve(state: ChatState) -> ChatState:
        scope = documents_named_in(session, state["question"])
        hits = hybrid_search(session, state["question"], k=8, document_ids=[d["document_id"] for d in scope] or None)
        docs = {d.id: d for d in session.documents(ids={c.document_id for c, _ in hits})} if hits else {}
        passages = [{
            "index": i, "document_id": c.document_id, "filename": docs[c.document_id].filename, "title": docs[c.document_id].title,
            "page": c.page_no, "clause_type": c.clause_type, "heading": c.heading, "text": c.text, "score": round(s, 4),
        } for i, (c, s) in enumerate(hits)]
        return {"passages": passages, "scope": scope}

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
        scope_note = ""
        if state.get("scope"):
            names = ", ".join(f"{d['title']} ({d['counterparty']})" for d in state["scope"])
            scope_note = f"The passages come only from the contract(s) the question names: {names}. "
        messages = [
            SystemMessage(content=(
                "Answer the legal team's question using only the numbered passages. Cite every factual statement "
                "with the passage index. If the passages do not contain the answer, say so instead of guessing. "
                + scope_note + "Answer in " + LANGUAGES.get(state.get("language", "en"), "English") + ". " + DOC_GUARD
            )),
            HumanMessage(content=f"Question: {state['question']}\n\n<document>\n{body}\n</document>"),
        ]
        try:
            result = with_retry(lambda: llm.with_structured_output(Answer).invoke(messages), "answer")
        except ModelUnavailable:
            listing = "\n\n".join(f"[{p['index']}] {p['title']} p.{p['page']} ({p['clause_type']}): {p['text'][:300]}"
                                  for p in passages)
            return {"answer": "Model unavailable: most relevant passages:\n\n" + listing,
                    "citations": [{**p, "quote": p["text"][:160]} for p in passages[:3]], "mode": "offline"}
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


def ask(session: Store, question: str, language: str = "en") -> dict:
    state = build(session).invoke({"question": question, "language": language})
    return {"answer": state["answer"], "citations": state["citations"], "mode": state["mode"],
            "passages": state["passages"], "scope": state.get("scope", [])}
