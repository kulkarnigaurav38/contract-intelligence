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
adaptive-review idea ("HITL should reduce over time and learn from corrections"), the demand for an
interactive pipeline explainer and for real, aligned input data, and finally the demand that findings be shown on
the PDF itself ("until they see the PDF itself they will not trust the system") all came from the author. The AI proposed
designs and implementations; the author accepted, redirected or rejected them turn by turn.

## What was verified rather than trusted

- 39 offline unit tests (ingest, policy, providers, resilience) plus `test_report_units.py`, `test_learning_units.py`
  and `test_correct_units.py` for the placed findings, the decisions and the corrected copy; 12 end-to-end tests on
  PostgreSQL/pgvector (offline); 10 live tests against Gemini including the full learning loop; the browser tests in
  `web/e2e/smoke.spec.ts`.
- Every metric in `docs/ps-coverage.md` is computed against a known answer key (`POST /api/eval/run`), not asserted.
- Explanatory text on the former pipeline page was reviewed against the code by an adversarial agent: 35 findings,
  several of them factual errors in the AI's own first draft, corrected.
- Where the AI's synthetic scans behaved unlike real ones (Tesseract silently dropping half a page while
  reporting 90% confidence; a font Tesseract reads too well for "handwriting"), the fixtures and gates were
  changed until they behaved like the real thing.

## 2026-08-29 — the simplification

Reviewing the build as a whole, the author judged the multi-page UI (question cards, clause matrix, checks,
approvals with review load, ask, and a technical group with pipeline explainer, quality measurement and model
table) over-engineered — "AI slop": every feature defensible on its own, the sum not what a legal team would
reach for. The product was cut to the shape of a file converter: drop contracts in → each is read and checked
automatically → one result line per contract → a contract page with the findings, page and quote, and the full
text. Three pages, a top bar, nothing to start or approve.

What stayed is what had been verified: the ingest pipeline, the rule layer (clause coverage against the
corporate guideline, name registry) and the full-contract verifier — now combined into one automatic report per
contract (`api/app/report.py`) instead of audits a person had to start. Audits, review policy, chat and
evaluation remain in the API with their tests, but out of the UI. Claude Code implemented the cut (report
module, three pages, tests, docs) under the author's direction; the measured numbers in `docs/ps-coverage.md`
are unchanged because the layers that produce them are.

## 2026-08-29 — the findings on the PDF itself

Looking at the contract page as a list of findings with page numbers and quotes, the author made the call that
decided the next step: lawyers work on the document, not on a report about it — "until they see the PDF itself
they will not trust the system". The brief was an ilovepdf-like view: the pages of the contract as they are,
every finding marked where it is, the correction offered at that spot, accept or dismiss, and a corrected copy at
the end.

What Claude Code built under that direction: every page rendered as an image (`api/app/files.py`); a placement
step that finds the box of a passage the same way the page was read — PDF text layer for digital pages, Tesseract
word boxes matched fuzzily for scans, the vision model for handwriting, and a page-level banner when none of them
is sure, never a guessed box (`api/app/locate.py`); a dashed insertion line below the last clause (or above the
signatures) for a missing clause, with a clause drafted in the contract's language by Flash (`api/app/draft.py`);
the popover with quote, reason, suggestion and decision; the decisions as data (table `decisions`,
`api/app/learning.py`), so that the same file gets its earlier decisions back, dismissal notes become precedents
for the verifier, and the review rate of a class of finding falls under the rules already in `app/policy.py`
(8 consecutive agreeing decisions and ≥ 95 % agreement → 20 %, then 10 % deterministic spot checks, at least one
per contract; automatic decisions visible and reversible); and the corrected copy (`api/app/correct.py`):
redaction with replacement text on digital pages, highlight and note on scans, an addendum page for inserted
clauses, filed to the contract storage under an idempotency key derived from the copy's checksum. The original
file is never written to. Existing results are upgraded at startup rather than thrown away.

During this work the Gemini project ran into its quota (a spending-cap 429). The first symptom was not an error
but a pipeline that hung: `with_retry` treated the 429 like weather and backed off for minutes per call, so
contracts sat at „Wird geprüft …“ and the result, when it finally came, was the rule result only. Two changes
followed, both proposed by the AI and accepted by the author. `with_retry` now recognises a quota 429 and fails
fast for ten minutes (`QUOTA_COOLDOWN`) instead of retrying, so the deterministic result arrives at once; and a
report whose cross-check could not run is marked `degraded` — the contract page says „Nur Regelprüfung – ohne
KI-Gegenprüfung · wird beim nächsten Neustart nachgeholt“, a finding without a draft says so in plain words, and
the next start of the API repeats those checks automatically. The system degrades honestly rather than
optimistically: no reasons are invented, and the user is told what is missing and when it will be repeated.

## Known limits of the AI-built parts

- The Azure Foundry, Document Intelligence and SharePoint/Graph paths were written from the documented
  SDK shapes and unit-tested for wiring, but not exercised against a live tenant (none available here).
- Synthetic contracts are a controlled benchmark, not the legal team's corpus; see `docs/ps-coverage.md` for
  the real-data evaluation.
- The drafted clause is a starting point, never a final text; the boxes on handwritten pages depend on the
  vision model, those on scans on Tesseract's word boxes — where neither is sure, the finding is shown as a
  page-level banner instead.
