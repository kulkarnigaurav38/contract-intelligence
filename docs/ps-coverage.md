# Problem-statement coverage and evaluation

This is the document an evaluator can follow: every requirement of the case study, what implements it, and the
evidence (tests, metrics, files). Status legend — ✅ implemented and verified · ◐ implemented, not exercisable here
(needs a tenant/credentials) · ✗ not done.

## A. The problem as stated

| # | Requirement (from the case study) | Implementation | Evidence | Status |
| --- | --- | --- | --- | --- |
| A1 | Legal colleagues *organise and review contracts, compare them, ensure compliance with corporate guidelines* | Every contract is decomposed into typed clauses at ingest and checked automatically against the **corporate guideline** (`data/guidelines.json`: required clause types per contract type); each required clause that is missing is cross-checked by the verifier against the full contract | `api/app/report.py`, `GET /api/documents/{id}` (`report.clauses[*].required`, `status`); unit tests `tests/test_report_units.py`; contract page: markers on the pages, sidebar *Fundstellen* / *Vorhandene Klauseln*. Across contracts, the start page's filter row — *Alter Firmenname* · *Klausel fehlt* · *Regelung fehlt* — lists the contracts that fail one rule (`web/src/pages/Home.tsx`); the full coverage matrix and one-click guideline audits remain API-only: `GET /api/coverage`, `POST /api/audits/guideline`, e2e `test_guidelines_overlay_and_guideline_audits` | ✅ |
| A2 | *Most documents reside on SharePoint, PDF* | `SharePointSource` via Microsoft Graph (client-credentials, `/drives/{id}/root:/{folder}:/delta`, persisted delta link) behind `DOCUMENT_SOURCE=sharepoint`; local folder source for the demo; `POST /api/documents/sync` pulls what is new | `api/app/sources.py`; e2e `test_local_source_sync_ingests_only_new_files`; Terraform wires `SHAREPOINT_DRIVE_ID` + Entra secret | ◐ Graph path written from the documented API, not run against a tenant |
| A3 | *Some are scans of really old, handwritten contracts that exist only as JPEG* | Per-page routing; Tesseract with confidence, text-volume and ink-coverage gates; escalation to the Gemini Pro vision model; explicit `unreadable` verdict when nothing can read a page | `loader.py`, `ocr.py`; unit tests (gate, coverage, sparse page); live test `test_vision_ocr_reads_the_handwritten_contract`; fixtures C08 (handwritten JPEG), C09 (photographed typed page), C14 (low-quality scan), C10 (scanned signature page) | ✅ |
| A4 | *Contract storage solution with a RESTful API — solely to store an additional copy in a legally compliant manner* | The corrected copy (`api/app/correct.py`: accepted suggestions applied, original untouched) is pushed to the storage's REST API with an **Idempotency-Key** `copy-<sha256 of the copy>`, so filing the same copy twice stores it once; the storage's external id is kept in `report.storage`; every filing is logged. The finding-level push of the API audits works the same way | `POST /api/documents/{id}/file-to-storage` (`api/app/routers.py`), mock storage router; unit tests `tests/test_correct_units.py`; e2e `test_review_and_push_is_idempotent` (audit path) | ✅ (mocked API) |
| A5 | *Compare contracts and identify contracts that do not contain a certain text passage* | **Clause type**, automatic for every contract: deterministic lookup in the clause coverage, then the verifier reads the whole contract for each required clause that is missing; the verdict may be *partial* (page, quote, reason) when a narrower provision exists. On the contract page a missing clause is a dashed insertion line where the clause belongs, with a clause drafted in the contract's language (`api/app/draft.py`); a partial one is a box at the passage with a drafted amendment. **Across contracts, on the start page**: the filter *Klausel fehlt* [one of the 12 types] keeps the contracts whose result lacks that clause (a row the guideline does not require is marked „laut Richtlinie nicht erforderlich“); *Regelung fehlt* [free text → Suchen] runs the passage audit (`POST /api/audits`, kind `missing_passage`: closest clause per contract by hybrid retrieval, two thresholds, same verifier) and keeps the contracts without that provision — „Regelung nicht gefunden“, „nur teilweise vorhanden“ or „nicht gefunden (ohne KI-Gegenprüfung)“ — under the line „n von m Verträgen ohne diese Regelung“ | `api/app/report.py`; `audits/graph.py` (`POST /api/audits`), `web/src/pages/Home.tsx` (filter row); e2e `test_missing_clause_audit_scoped_by_contract_type`, `test_missing_passage_audit`; live audits: liability cap 2/2, anti-corruption passage: 2 confirmed + 3 partial with reasons | ✅ |
| A6 | *… or contracts in which a company name needs to be updated* | Name registry with roles (old Riverty name / current / unrelated company), "vormals/formerly" = historical, OCR-tolerant fuzzy match on scanned pages, verifier decides active vs historical; every contract's report lists each old-name mention with page and quote and boxes it on the page (`api/app/locate.py`: text layer, Tesseract word boxes or the vision model); accepting it puts „Riverty GmbH“ into the corrected copy; the start page's filter *Alter Firmenname* lists every contract whose result still has one | `entities.py`, `api/app/report.py` (`report.old_names`, `historical_names`); contract page: red marker *Alter Firmenname*; start page filter (`web/src/pages/Home.tsx`); unit tests (formerly, Arvato Systems, fuzzy, `test_verifier_decides_old_name_mentions`); live rename audit 9/9 incl. the scanned signature page (C10) and a mis-OCR'd name (C14) | ✅ |
| A7 | *So far semi-manual: open, search, verify* → AI should help | Nothing to start: the check runs on upload. The cross-contract question — which contracts lack X? — is one click on the start page (filter row *Alter Firmenname* · *Klausel fehlt* · *Regelung fehlt*). Every finding is a marker on the rendered page — a box around the old name or the partial passage, a dashed line where the missing clause belongs — with quote, the verifier's reason and a suggestion, so the lawyer verifies and decides on the page itself (Übernehmen / Nicht zutreffend with a note). Decisions are carried over per file, notes become precedents for the verifier, and the review rate of a class of finding falls once the team has agreed often enough (`learning.py`, rules in `policy.py`); the accepted suggestions become the corrected copy | contract page (`web/src/pages/Contract.tsx`), result line and filter row on the start page (`web/src/pages/Home.tsx`, `report_summary`); `api/app/report.py`, `learning.py`, `correct.py`; unit tests `tests/test_report_units.py`, `tests/test_learning_units.py`, `tests/test_correct_units.py`; browser tests `web/e2e/smoke.spec.ts` | ✅ |

## B. Technology principles ("best-of-breed vs what Microsoft provides")

| Technology in the statement | Used? | How | Microsoft counterpart behind the same switch |
| --- | --- | --- | --- |
| Azure | ✅ (IaC) | Terraform: Container Apps, PostgreSQL Flexible Server + pgvector, Blob, Key Vault, Document Intelligence, Log Analytics, Entra ID group access | — |
| Azure Foundry / Google Gemini | ✅ Gemini at runtime; ◐ Foundry wired | `LLM_PROVIDER=gemini` → Gemini 3.x via `langchain-google-genai`; `LLM_PROVIDER=foundry` → Azure OpenAI deployments via `langchain-openai` with the identical task→tier→effort routing; Terraform creates the deployments | see `docs/tech-choices.md` for the reasoning |
| Containerised environments | ✅ | Docker Compose (db/api/web); Container Apps in Terraform | — |
| Python with FastAPI | ✅ | `api/` | — |
| Terraform | ✅ | `infra/terraform` (validated) | — |
| React + TypeScript | ✅ | `web/` (Vite, MUI 9, German/English) | — |
| LangChain and LangGraph | ✅ | LangGraph runs the automatic per-contract check (`api/app/report.py`: `rules → cross_check → place → draft → policy → summarize`; a re-check re-enters at `place`) as well as the API audits (`api/app/audits/graph.py`: `plan → deterministic → verify → report`) and the chat graph; LangChain model integrations and structured output | — |
| OCR (not named; needed for A3) | ✅ Tesseract + vision; ◐ Document Intelligence wired | `OCR_PROVIDER=document_intelligence` → `prebuilt-read` (printed + handwritten, German) with the same escalation gate | Azure AI Document Intelligence |
| Vector/text index (not named) | ✅ PostgreSQL + pgvector + tsvector | one database for documents, vectors, findings and the audit log | Azure AI Search would add a second system; PostgreSQL Flexible Server is itself an Azure managed service |

Unit tests `tests/test_providers_units.py` prove the switch: the same routing table builds `AzureChatOpenAI`/`AzureOpenAIEmbeddings` or the Gemini classes; OCR and source resolution follow configuration.

## C. Deliverables

| Deliverable | Where | Status |
| --- | --- | --- |
| Basic pipeline that analyses documents and makes them accessible | `api/app/ingest/*`; the per-contract result in `api/app/report.py`; explained in plain words on *So funktioniert es*, which is generated from the stage list in `api/app/pipeline.py` (`GET /api/pipeline`) and so cannot drift from the code; `retrieval.py`, `chat.py` (API-only) | ✅ |
| Basic front-end demonstrating how the solution can be used | `web/` — German-first legal-team UI: drop zone → automatic result → filter row for the cross-contract question → the contract with its findings marked on the pages, decisions, corrected copy (three pages; browser tests in `web/e2e/smoke.spec.ts`) | ✅ |
| Anything necessary for the end-to-end workflow | automatic report after ingest (and at startup: unfinished, degraded and old-format results are rebuilt or upgraded, `api/app/main.py`), decisions with carry-over and adaptive review, corrected copy and filing to the contract storage, re-check, retry, delete, audit log; the free-text passage audit is reachable from the start page (*Regelung fehlt*); the other audits, their review queue, chat and evaluation remain API-only | ✅ |
| Presentation: solution, technical solution, infrastructure, adoption concept, other | `docs/presentation.html` (15 slides; adoption concept on slide 13) | ✅ |
| "AI usage encouraged as long as we understand what is happening" | `docs/how-ai-was-used.md` | ✅ |

## D. Correctness — measured, not asserted

The numbers below were measured through the audit and evaluation endpoints (`POST /api/eval/run`, API-only); the
automatic per-contract report uses the same rule layer and the same full-contract verifier (`report.py` calls
`audits/verify.py`), so they hold for it unchanged.

### D1. Synthetic corpus with known answer key (`data/ground_truth.json`)
14 + 4 generated contracts covering every input type (digital EN/DE, clean and low-quality scans, handwritten JPEG,
photographed typewriter page, digital PDF with scanned signature page, hidden prompt-injection). Ground truth is
exact because the generator wrote the documents. Latest LLM-mode run (Gemini 3.x):

| Layer | Precision | Recall | Notes |
| --- | --- | --- | --- |
| Clause-coverage matrix (is clause X missing?) | 1.00 (42/42) | 1.00 | after the OCR coverage gate; before it, 4 false alarms on the half-dropped scan |
| Name registry (needs rename?) | 1.00 (9/9) | 1.00 | includes the scanned signature page and a mis-OCR'd "arvalo" |
| Rename audit (registry + verifier) | 1.00 | 1.00 | verifier reasoning in German legal register |
| Missing liability cap, merchant agreements | 1.00 (2/2) | 1.00 | injected contract C13 not fooled |
| Injection screen | C13 flagged, 0 false alarms | | |
| Extraction | 17 text-layer pages at 1.0; 4 vision pages at 0.90–0.98; 2 Tesseract pages at 0.90 | | |

Offline mode (no key): recall stays 1.0 on readable documents; the low-quality scan is reported *unreadable*
instead of scored (by design).

The automatic per-contract report (`api/app/report.py`) was compared with the same answer key: 18 of 18
expectations (clause missing per guideline, rename needed) matched.

### D2. Test suites
`cd api && uv run pytest tests/test_*_units.py -q` → 56 offline unit tests in 7 files (ingest gates, providers, resilience,
review policy, and — in `tests/test_report_units.py`, `tests/test_learning_units.py`, `tests/test_correct_units.py` — the
report graph with its placed findings, the decisions and the corrected copy). `cd api && uv run pytest` additionally runs the 12
end-to-end tests on PostgreSQL/pgvector (`tests/test_end_to_end_db.py`, drops and recreates the schema) and the 10
live Gemini tests (incl. the full learning loop; skipped without a key). `cd web && npx playwright test` → the 8 browser
tests in `web/e2e/smoke.spec.ts` (drop zone, multi-upload, viewer with markers + accept/undo, scanned contract, how it works, language, redirect).

### D3. Real-world data
See section E — the synthetic corpus proves the mechanics; real contracts prove the claims.

## E. Real-data evaluation

### E1. Why and what
The synthetic corpus proves the mechanics with exact ground truth; it cannot prove the claims on contracts nobody
wrote for the test. A multi-angle dataset sweep (labelled corpora, German sources, scanned/handwritten collections,
Riverty's own public documents) with URL/licence verification selected:

- **CUAD v1** (The Atticus Project, CC BY 4.0): 510 real commercial contracts from SEC EDGAR with 41 expert-annotated
  clause categories. Five categories map 1:1 onto our taxonomy (Governing Law, Cap On Liability, Audit Rights, Change
  Of Control, Anti-Assignment); an empty/“No” annotation means the annotators found no such clause — real absence
  ground truth. `data/real/build_cuad_subset.py` picks 12 contracts (8–45k characters) with a mix of presence and
  absence; `data/real/cuad_ground_truth.json` is the answer key.
- **Real German documents** (no clause answer key; used to show behaviour on authentic text): the 2019 **AfterPay
  AGB** from the Wayback Machine (names *Arvato Payment Solutions GmbH* — a genuine pre-rebrand document), the
  **LfDI Baden-Württemberg Muster-Auftragsverarbeitungsvertrag**, and the **IHK Muster-Handelsvertretervertrag**.
- Considered and not used here: LEDGAR, ContractNLI, MAUD (English, lower alignment), UCSF Industry Documents
  (real scanned/handwritten agreements, no open licence — a good source for an internal OCR benchmark).

### E2. Results on the CUAD subset (12 contracts, Gemini 3.x, one run)

| Clause type | Rule layer P | Rule layer R | With verifier P | With verifier R | true absences |
| --- | --- | --- | --- | --- | --- |
| assignment | 0.20 | 1.00 | 1.00 | 1.00 | 2 |
| audit_rights | 0.55 | 1.00 | 1.00 | 1.00 | 6 |
| change_of_control | 0.92 | 1.00 | 1.00 | 0.80 | 11 |
| governing_law | 0.09 | 1.00 | 1.00 | 1.00 | 1 |
| liability_cap | 0.22 | 0.67 | 1.00 | 1.00 | 3 |
| **all five** | **0.43** | **0.95** | **1.00** | **0.91** | 22 |

Reading: on long, heterogeneous real contracts the rule layer (keywords + Flash labels on segmented clauses) is
**recall-first** — it found 21 of 22 true absences but over-flagged (28 false alarms; e.g. governing law inside a
“Miscellaneous” section, audit rights phrased as inspection rights). The **verifier reading the whole contract**
restored precision to 1.00 on every type and kept recall at 1.00 on four of five (0.91 overall, 20 of 22); its two change-of-control misses
are dismissals on provisions CUAD's annotators did not count as change-of-control clauses — a disputable call,
surfaced with its quote and reasoning, not a silent error. This is the two-layer design doing what it claims:
structure gives recall, verification gives precision, and nothing is lost between them because only the verifier
can remove a candidate.

### E3. Real German documents
- AfterPay AGB (2019): rename check **confirmed** — evidence page 1, „Diesen Service bieten wir, AfterPay (Arvato
  Payment Solutions GmbH, Gütersloher Str. 123 …)“; reasoning in German. The two official templates were correctly
  *not* flagged (no Riverty predecessor named).
- LfDI Muster-AVV: recognised as a DPA; clause types found: data protection, audit rights, liability cap, assignment,
  term/termination. IHK Handelsvertretervertrag: assignment, confidentiality, fees, governing law, term/termination.

### E4. How to reproduce
`docker compose up`, upload `data/real/cuad/*.pdf` and `data/real/german/*.pdf` (or `POST /api/documents/ingest-samples?batch=3|4`
on a current image), run missing-clause checks scoped to the CUAD documents (`params.document_ids`), then
`POST /api/eval/run` → `real_data`.

## F. Known gaps and honest limits

- SharePoint/Graph, Azure Foundry and Document Intelligence paths are written and unit-tested for wiring, but were
  not exercised against a live Microsoft tenant.
- No authentication in the prototype (reviewer is the fixed `legal.reviewer`); production uses Entra ID (Terraform).
- Pairwise "diff two contracts" is not a separate screen; comparison happens through the per-contract reports (same
  guideline, same twelve clause types), the start-page filter and the API audits.
- The verifier is a model: on genuinely borderline provisions it answers *partial* and hands the judgement to a
  lawyer rather than flip-flopping — but it remains a model.
- The drafted clause is a starting point for the lawyer, never a final text; it is labelled as a suggestion, is
  editable on digital PDFs, and nothing reaches the corrected copy without an explicit decision.
- Markers on handwritten pages depend on the vision model (and on scans on Tesseract's word boxes); where neither is
  sure the finding is shown as a page-level banner rather than a guessed box.
- A missing clause cannot be flowed into an existing PDF: the corrected copy puts it on an addendum page and marks
  the insertion point with a note; on scans the copy carries highlights and notes only.
- When the model quota is exhausted the check completes as *„Nur Regelprüfung – ohne KI-Gegenprüfung · wird beim
  nächsten Neustart nachgeholt“* — no reasons, no drafts — until the next start of the API repeats it (or *Erneut
  prüfen* is clicked).
- Of the cross-contract audits only the free-text passage check is in the UI (start page, *Regelung fehlt*); the
  guideline audits, their review queue, cited question answering and the evaluation remain API-only.
