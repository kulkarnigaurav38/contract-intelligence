"""Clause-type classification: deterministic rules first, LLM refinement second.

The rules are the always-on floor (offline, explainable). When the LLM is
available it labels the same clauses; agreement raises confidence,
disagreement lowers it and is recorded, so reviewers see exactly why.
"""

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.ingest.segment import Segment
from app.llm import DOC_GUARD, chat

TAXONOMY = [
    "term_termination", "fees_payment", "liability_cap", "confidentiality", "data_protection", "governing_law",
    "dispute_resolution", "force_majeure", "assignment", "audit_rights", "anti_corruption", "change_of_control",
]
STRUCTURAL = ["preamble", "scope", "notices", "signature", "other"]
LABELS = TAXONOMY + STRUCTURAL

KEYWORDS: dict[str, list[str]] = {
    "term_termination": ["term of", "initial term", "terminat", "renew", "laufzeit", "kündig", "notice to the end"],
    "fees_payment": ["fee", "invoice", "payable", "payment", "remuneration", "vergütung", "zahlung", "rechnung", "% of"],
    "liability_cap": ["liabilit", "limited to the fees", "capped at", "consequential", "haftung", "loss of profit"],
    "confidentiality": ["confidential", "vertraulich", "trade secret", "geheim"],
    "data_protection": ["personal data", "gdpr", "data protection", "article 28", "art. 28", "datenschutz", "dsgvo",
                        "personenbezogen", "bdsg", "2016/679", "auftragsverarbeitung"],
    "governing_law": ["governed by", "laws of", "governing law", "german law", "recht der bundesrepublik",
                      "anwendbares recht", "cisg", "unterliegt dem recht", "law applies"],
    "dispute_resolution": ["jurisdiction", "courts of", "arbitrat", "gerichtsstand", "court is", "dispute"],
    "force_majeure": ["force majeure", "beyond its reasonable control", "höhere gewalt", "außerhalb ihrer kontrolle"],
    "assignment": ["assign", "transfer this agreement", "abtret", "übertragen"],
    "audit_rights": ["audit", "prüfungsrecht", "zu prüfen", "access to relevant records"],
    "anti_corruption": ["corruption", "bribery", "korruption", "bestechung", "undue advantage", "public officials",
                        "stgb"],
    "change_of_control": ["change of control", "kontrollwechsel", "voting rights", "stimmrechte"],
    "scope": ["services described", "annex 1", "leistungen", "hands over", "scope"],
    "notices": ["notices", "mitteilungen", "registered mail", "einschreiben"],
    "signature": ["managing director", "authorised signatory", "geschäftsführung", "____"],
}
HEADING_WEIGHT = 3


def rule_label(seg: Segment) -> tuple[str, float]:
    if seg.ordinal == 0 and not seg.heading:
        return "preamble", 0.9
    heading, body = seg.heading.lower(), seg.text.lower()
    scores = {}
    for label, words in KEYWORDS.items():
        score = sum(HEADING_WEIGHT for w in words if w in heading) + sum(1 for w in words if w in body)
        if score:
            scores[label] = score
    if not scores:
        return "other", 0.5
    label, score = max(scores.items(), key=lambda kv: kv[1])
    runner_up = sorted(scores.values(), reverse=True)[1] if len(scores) > 1 else 0
    if score >= HEADING_WEIGHT:  # heading matched
        confidence = 0.9 if score > runner_up else 0.6
    else:
        confidence = min(0.8, 0.45 + 0.1 * (score - runner_up))
    return label, round(confidence, 2)


class ClauseLabel(BaseModel):
    index: int
    clause_type: str = Field(description="one of: " + ", ".join(LABELS))
    confidence: float = Field(ge=0, le=1)


class ClauseLabels(BaseModel):
    labels: list[ClauseLabel]


def llm_labels(segments: list[Segment]) -> dict[int, tuple[str, float]]:
    llm = chat("classify")
    if llm is None or not segments:
        return {}
    listing = "\n\n".join(
        f"[{s.ordinal}] heading: {s.heading or '(none)'}\n{s.text[:700]}" for s in segments
    )
    messages = [
        SystemMessage(content=(
            "You label contract clauses. For every clause index return exactly one clause_type from this list: "
            + ", ".join(LABELS)
            + ". Definitions: liability_cap = limitation or exclusion of liability; data_protection = GDPR/DSGVO, "
              "personal data, data processing agreement; dispute_resolution = jurisdiction, courts or arbitration; "
              "governing_law = choice of law; scope = description of services; preamble = parties and recitals; "
              "signature = signature block; other = anything else. Use 'other' when unsure and lower the confidence. "
            + DOC_GUARD
        )),
        HumanMessage(content=f"<document>\n{listing}\n</document>"),
    ]
    result = llm.with_structured_output(ClauseLabels).invoke(messages)
    return {l.index: (l.clause_type if l.clause_type in LABELS else "other", l.confidence) for l in result.labels}


def classify(segments: list[Segment]) -> list[dict]:
    """Return one dict per segment: clause_type, confidence, method, rule_label, llm_label."""
    by_llm = llm_labels(segments)
    out = []
    for seg in segments:
        r_label, r_conf = rule_label(seg)
        if seg.ordinal in by_llm:
            l_label, l_conf = by_llm[seg.ordinal]
            if l_label == r_label:
                final = (l_label, round(min(0.99, max(l_conf, r_conf) + 0.05), 2), "llm+rules agree")
            else:
                final = (l_label, round(min(l_conf, 0.7), 2), "llm (rules disagree)")
        else:
            l_label, final = "", (r_label, r_conf, "rules")
        out.append({"clause_type": final[0], "confidence": final[1], "method": final[2],
                    "rule_label": r_label, "llm_label": l_label})
    return out
