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

## 2026-08-29, later that day — the problem statement, re-read

With the product cut down and the findings on the page, the author asked for two things: re-check the build
against the problem statement, and keep the technical pipeline explainable to the people who will assess it. The
gap review that followed found two things the earlier docs had quietly filed under "API-only": the cross-contract
question — *which contracts do not contain X?* — could only be asked through `POST /api/audits`, not from the UI;
and LangGraph, named in the statement, ran only the audit and chat graphs, not the automatic check every contract
goes through.

What Claude Code built under that direction: a filter row over the contract list — *Alle · Alter Firmenname ·
Klausel fehlt · Regelung fehlt* — so the statement's question is one click on the start page (the free-text mode
runs the existing passage audit and marks the contracts without the provision); the automatic check in
`api/app/report.py` as a LangGraph `StateGraph` with the nodes `rules → cross_check → place → draft → policy →
summarize` (a re-check re-enters at `place`), covered by the existing report unit tests; and one description of
all 14 stages in `api/app/pipeline.py`, served by `GET /api/pipeline` and rendered by *So funktioniert es* —
three phases, numbered cards with tools and model, a worked example computed from a real contract — so the
explainer cannot drift from the code, the risk the earlier hand-written page carried (its accuracy had to be
established by an adversarial review). The author chose which gaps mattered and accepted the shape; the AI
proposed the stage list and its wording, which was checked against the code.

The session was interrupted once by the machine rather than the model: macOS withdrew the terminal's permission
for the Downloads folder the repository lives in, and every file access failed with "Operation not permitted"
until a `tccutil reset` restored it. Noted because it cost real time, and because "the tool cannot see the files"
looks, at first, exactly like a broken build.

## 2026-09-05 — the knowledge graph, and the review as three steps

The author asked for four things at once: a Neo4j knowledge graph as the backend, a thorough search for
*database-first* data sources, an architecture in which the graph is the RAG store so that the models retrieve only
what is useful before they work on a contract, and a simpler contract page with a separate page where the final
edited PDF is downloaded. The AI was told not to test extensively and to report back.

What Claude Code built, and the decisions it took on its own and flagged: the graph is derived from PostgreSQL rather
than replacing it (`api/app/graph.py`: schema, seed, one contract in/out, retrieval, the context builders; every call
falls back to the SQL path without `NEO4J_URI`) — a full replacement of the relational bookkeeping was judged the
wrong trade for an untested change; the verifier reads the outline plus the clauses the graph ranks, which trades the
"read the whole contract" guarantee for a smaller, structured context (the outline still shows every clause that
exists), with the full read kept as the fallback; the drafter reads the neighbours and the team's accepted wording;
the name register became database-first — the AI queried GLEIF's LEI API live and found the rebrand recorded as
`PREVIOUS_LEGAL_NAME` on eight Riverty entities, seeded them with `RENAMED_TO` edges, and the suggested new name now
follows that edge; the deprecated `db.index.vector.queryNodes` was replaced by Cypher's `SEARCH` clause after a live
probe showed which syntax the pinned server accepts; the review page became "one finding at a time" with
**Weiter zum Download**, and the download page shows what was applied, the download, the filing and a preview.

What was verified rather than trusted: the 56 unit tests, the graph module against a live Neo4j 2026.07 (seed,
upsert, gap pattern, registry, successor, context, hybrid search, decisions, delete), the 12-test end-to-end suite
with the graph switched on (16 contracts, 207 clause nodes, 25 gaps), the web build, and the two new pages in the
browser. Not run: the live Gemini tests and the Playwright suite (updated to the new pages, not executed) — the
author chose to look at the result himself first.

## 2026-09-05, later — Neo4j becomes the database

After the graph-vs-RAG discussion the author decided two things: add the scoped-then-full read, and move the whole
persistence layer from PostgreSQL to Neo4j — "as it is now confirmed that the GraphRAG approach is better". The AI
had flagged the migration as the riskier option the first time; once reaffirmed it did it in full: SQLAlchemy models
became dataclasses (`api/app/models.py`), a `Store` unit of work over the Neo4j driver replaced the session
(`api/app/db.py`: `add`/`get`/`delete`/`commit` in one transaction, dirty tracking, integer ids from Counter nodes,
cascading deletes), and every caller — ingest, report, learning, policy, audits, chat, evaluation, sources, routers —
was rewired; `verify_absence` (`api/app/audits/verify.py`) reads the graph's selection first and the full contract
before confirming an absence. Postgres, pgvector and psycopg left the project, compose and Terraform. Kept
deliberately: the shape of the code (`session.add`/`commit`/`get`), so the unit tests and the fakes in them still
hold; and the graph's own tests moved to a scratch Neo4j (`neo4j-test`) because Community has one database.

Verified: 56 unit tests, the 12 end-to-end tests against the scratch instance, the web build. Not run: Playwright,
live Gemini.

## Known limits of the AI-built parts

- The Azure Foundry, Document Intelligence and SharePoint/Graph paths were written from the documented
  SDK shapes and unit-tested for wiring, but not exercised against a live tenant (none available here).
- Synthetic contracts are a controlled benchmark, not the legal team's corpus; see `docs/ps-coverage.md` for
  the real-data evaluation.
- The drafted clause is a starting point, never a final text; the boxes on handwritten pages depend on the
  vision model, those on scans on Tesseract's word boxes — where neither is sure, the finding is shown as a
  page-level banner instead.
