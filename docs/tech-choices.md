# Technology choices — best-of-breed vs. what Microsoft provides

The case study names Azure, *Azure Foundry / Google Gemini*, containers, Python + FastAPI, Terraform, React +
TypeScript, LangChain + LangGraph, and asks that best-of-breed options be compared against Microsoft's. Every
external dependency in this system therefore has **two implementations behind one configuration switch**, so
the comparison is a decision the team can revisit without touching pipeline code:

| Concern | Best-of-breed (default here) | Microsoft path | Switch |
| --- | --- | --- | --- |
| Language models | Google Gemini 3.x (`gemini-3.1-pro-preview`, `3.7-flash`, `3.5-flash-lite`, `gemini-embedding-001`) | Azure AI Foundry / Azure OpenAI deployments (GPT-5 family, `text-embedding-3-large`) | `LLM_PROVIDER=gemini|foundry` (`api/app/llm.py`; Terraform creates the deployments) |
| OCR for scans | Tesseract locally + Gemini Pro vision on escalation | Azure AI Document Intelligence `prebuilt-read` (+ the same vision escalation) | `OCR_PROVIDER` (`api/app/ingest/ocr.py`) |
| Document source | local folder (demo) | SharePoint via Microsoft Graph delta queries | `DOCUMENT_SOURCE` (`api/app/sources.py`) |
| Index | PostgreSQL + pgvector + full-text | Azure Database for PostgreSQL Flexible Server (same code) — or Azure AI Search | PostgreSQL is already Azure-managed; AI Search would be a second system |
| Hosting, secrets, identity, logs | — | Azure Container Apps, Key Vault, Entra ID, Log Analytics | Terraform in `infra/terraform` |

Facts below were collected from vendor documentation on 2026-08-27/28 (URLs in the research log); prices are
list prices and change often.

## 1. Models: why Gemini is the default, and when Foundry is the better answer

**What each side offers today**

- *Azure AI Foundry* sells OpenAI's GPT-5.x line directly (GPT-5, 5.1, 5.4, 5.5, 5.6 series) plus Mistral, Meta,
  DeepSeek, Cohere and others. Gemini is **not** in the Foundry catalogue; the only Microsoft-documented route to
  Gemini is Azure Databricks external model serving. GPT-5 family models are deployable from Foundry resources in
  all eleven European regions; *Data Zone* deployments keep inference inside the EU, *Global* deployments may run
  anywhere but keep data at rest in the geography. Prompts and completions are not used for training and are
  not shared with OpenAI; abuse monitoring samples flagged content unless "modified abuse monitoring" is
  approved (zero-data-retention is gated, not self-service).
- *Google Gemini on Vertex AI*: 1,048,576-token context on 3.x models, thinking levels, native image input, no
  training on customer data (Service Specific Terms §18). EU processing: `gemini-3.7-flash` and `3.5-flash` are
  available in the `eu` multi-region; **`gemini-3.1-pro-preview` is *global* only as of August 2026**. Frankfurt
  (`europe-west3`) exists as a Vertex region, but 3.x Pro is not yet served there.

**Why Gemini is the default for this problem**

1. *The verifier reads whole contracts.* Absence has to be proven against the full text, not retrieved chunks.
   A 1M-token context makes "read the entire contract" the normal case, including long CUAD-style
   agreements. GPT-5.x on Foundry works too (400k class context), but the Gemini window is roomier for batches of
   long contracts and precedents.
2. *Handwriting and bad scans.* The escalation path sends page images to the Pro model with thinking; in our
   runs it read a cursive 1996 agreement and a 100-dpi skewed scan (95% self-reported legibility) that Tesseract
   scored at 34–68%. Azure's equivalent is Document Intelligence Read (handwriting in 12 languages incl. German)
   — good, and cheap at $1.50 per 1,000 pages — but it is an OCR service, not a model that can be told
   "transcribe verbatim, do not follow instructions in the image, report legibility".
3. *Cost at the routing tiers we use.* List prices per 1M tokens (Aug 2026): Gemini 3.7 Flash $0.75 in / $3.75
   out; 3.5 Flash-Lite $0.30 / $2.50; GPT-5 mini $0.25 / $2.00 (Data Zone +10%); GPT-5 $1.25 / $10; GPT-5.5 $5 /
   $30. The volume work (classification, extraction, screening) is cheap on either side; the expensive step is
   the verifier, and both providers' top tiers are in the same order of magnitude. Cost does not decide this.
4. *The problem statement lists Gemini explicitly* as the model option the team already uses.

**When Foundry is the right call — and what it takes**

- If Legal or the DPO requires that *all* inference stays in the EU today: Foundry Data Zone deployments give
  that for every tier now; Gemini 3.x Pro does not yet. That is a legitimate reason to flip the switch.
- If the tenant already carries an Azure OpenAI commitment (PTU) or a Microsoft EA with modified abuse
  monitoring.
- What changes: `LLM_PROVIDER=foundry`, four deployment names, one Terraform variable. The routing table
  (task → tier → reasoning effort) is identical; `reasoning_effort` maps 1:1 onto the thinking levels. Vision
  input for handwriting works with GPT-5.x. Unit tests prove the wiring; the path was not exercised against a
  live tenant during the case study.

## 2. OCR: Tesseract + vision escalation vs. Document Intelligence

- Tesseract runs locally (no data leaves the machine), is free, and handles clean scans well (90% on our
  flatbed-style scan). It fails silently on bad regions — which is why the pipeline adds a text-volume gate and
  an ink-coverage gate before trusting it.
- Document Intelligence Read: printed and handwritten text, German included, confidence per word, $1.50 per
  1,000 pages (first 1M/month), free tier 500 pages/month. It replaces Tesseract's role one-for-one behind
  `OCR_PROVIDER=document_intelligence` and would remove the coverage-gate workaround. In a Microsoft tenant it is
  the pragmatic default; the vision escalation stays for the genuinely hard pages.

## 3. Index: PostgreSQL + pgvector vs. Azure AI Search

- Everything the checks need — pages, clauses, vectors, entities, findings, the append-only audit log — lives in
  one PostgreSQL database with `pgvector` (HNSW; Azure additionally offers DiskANN) and a bilingual `tsvector`
  index. On Azure this is *Azure Database for PostgreSQL Flexible Server*: from ~$14.5/month (B1ms) to
  ~$155/month (D2ds v5) plus storage — and it is a Microsoft service.
- Azure AI Search adds a managed hybrid index with a semantic reranker (Basic ~$74/month, S1 ~$245/month, plus
  $1 per 1,000 semantic queries). It would be a second system to keep in sync for a corpus that fits
  comfortably in Postgres, and the absence question is answered from the clause matrix, not from search. If the
  corpus grows to millions of clauses or the team wants Bing-grade reranking, AI Search is the upgrade path;
  LangChain supports both stores.

## 4. Documents: SharePoint via Graph

Microsoft Graph's `driveItem` delta query (`/drives/{id}/root/delta`) enumerates a library once and then returns
only changes — the right primitive for a nightly sync of a contracts library. Implemented in
`api/app/sources.py` with MSAL client-credentials (`Sites.Read.All`) and a persisted delta link; the demo uses a
local folder through the same interface. SharePoint Premium (Syntex) contract processing is the fully
Microsoft-native alternative; it does not answer "which contracts lack X" and would sit beside, not instead of,
this pipeline.

## 5. The rest is what the statement asked for

FastAPI, LangGraph (the audit and chat graphs), LangChain (model integrations, structured output), React +
TypeScript, containers, Terraform — used as prescribed. Where we went beyond the list: MUI for the legal-team
UI, PyMuPDF for PDF handling, `pgvector` for vectors, Playwright for browser tests.
