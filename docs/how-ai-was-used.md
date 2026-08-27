# How AI was used to build this — and what a human decided

The case study explicitly encourages AI use "as long as we understand what is happening". This is the
account of what was done by which party.

## Tools

- **Claude Code (Opus 5)** as the pair programmer for the whole build: it wrote the code, tests, fixtures and
  documentation, ran the tests, and drove the browser checks.
- For larger, parallelisable pieces it used **multi-agent workflows**: a three-lens design panel for the
  legal-team UI (judged by a "German in-house lawyer" and an "engineer" persona), page-by-page front-end
  implementation with a reviewer/fixer loop, adversarial accuracy reviews of explanatory content against
  the code, and a multi-angle research sweep for real datasets with a verification pass on every URL.
- **Gemini** (`gemini-3.1-pro-preview`, `gemini-3.7-flash`, `gemini-3.5-flash-lite`, `gemini-embedding-001`) is the
  runtime model provider; Azure AI Foundry is wired behind the same switch.

## What the human decided

The problem framing (absence detection as a structural, not a retrieval, problem), the choice of Gemini and
MUI, using the real Arvato → Riverty rebrand as the scenario, the "German-first, technical detail one layer
down" UI brief, the requirement that the strategy be *defensible* (confidence, mistakes, security), the
adaptive-review idea ("HITL should reduce over time and learn from corrections"), and the demand for an
interactive pipeline explainer and for real, aligned input data all came from the author. The AI proposed
designs and implementations; the author accepted, redirected or rejected them turn by turn.

## What was verified rather than trusted

- 28 unit tests, 9 end-to-end tests on PostgreSQL/pgvector (offline), 10 live tests against Gemini including
  the full learning loop, 11 Playwright browser tests.
- Every metric on the *Qualitätsmessung* page is computed against a known answer key, not asserted.
- Explanatory text on the pipeline page was reviewed against the code by an adversarial agent: 35 findings,
  several of them factual errors in the AI's own first draft, corrected.
- Where the AI's synthetic scans behaved unlike real ones (Tesseract silently dropping half a page while
  reporting 90% confidence; a font Tesseract reads too well for "handwriting"), the fixtures and gates were
  changed until they behaved like the real thing.

## Known limits of the AI-built parts

- The Azure Foundry, Document Intelligence and SharePoint/Graph paths were written from the documented
  SDK shapes and unit-tested for wiring, but not exercised against a live tenant (none available here).
- Synthetic contracts are a controlled benchmark, not the legal team's corpus; see `docs/ps-coverage.md` for
  the real-data evaluation.
