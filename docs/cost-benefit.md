# Cost-benefit: why a lawyer still looks at every finding

The case study describes the work as semi-manual: *open the documents, search for the relevant content, verify the
results yourself* — to find the contracts that lack a certain passage, or still carry a company name that must be
updated. This note puts numbers on that work for a company of Riverty's size, on the tool, and on the one design
decision that shapes the user experience: **the AI finds, drafts and explains; a person decides — on the page, one
finding at a time.** Every number below is an estimate with its assumption stated; the sources are at the end.

## 1. How much work is there?

**Facts (2026):** Riverty has more than 4,000 employees, operates in 10 European countries, serves more than 1,800
merchants and ~25 million consumers, processes ~235 million transactions a year, was renamed from arvato Financial
Solutions / Arvato Payment Solutions in 2022–23, and opened a bank in Luxembourg in July 2026 — the next event that
touches every contract naming an entity.

**Estimates (assumptions in italics):**

| Quantity | Estimate | How |
| --- | --- | --- |
| Active contracts | **~15,000** | 1,800 merchants × *~3 documents each* (agreement, DPA, amendments) ≈ 5,500; *1,500–3,000 vendor/supplier contracts* for a 4,000-employee company; collection mandates, factoring/receivables agreements, NDAs, SLAs, intercompany |
| Archive incl. legacy entities | **~40,000 documents** | *2–3 × active*: Arvato Payment Solutions, arvato infoscore, AfterPay, the Nordic finance companies — the SharePoint/JPEG history the statement mentions |
| New or renewed contracts | **3,000–5,000 / year → 12–20 per working day** | *20–30 % of the active stock turns over per year* (250 working days) |
| Legal & compliance staff | **40–60 people, ~15 FTE on contract work** | *1–1.5 % of headcount* for a regulated fintech across 10 countries |
| Events that trigger a sweep | **1–3 per year** | rebrand (2022–23), a new entity (the bank, 2026), regulation (GDPR Art. 28 in 2018, DORA ICT-provider clauses in 2025, sanctions clauses in 2022), a guideline change |

Two kinds of work follow: **sweeps** over the whole inventory when such an event happens, and the **daily flow** of
new contracts checked against the corporate guideline.

## 2. Time per contract, manual

The semi-manual process, per contract and per question (*is clause X in here? is the old name used as a party?*):

| Document | Steps | Time |
| --- | --- | --- |
| Digital PDF, 5–20 pages (~80 %) | open from SharePoint, Ctrl-F with the synonyms in two languages, read the context of every hit, record the result | 8–15 min |
| Scanned PDF (~15 %) | no text layer: read it | 20–40 min |
| Handwritten JPEG (~5 %) | read it — or skip it, which is what happens | 30–60 min |
| **Weighted** | | **~15 min per contract and question** |
| Full guideline check (8 required clause types) | the same, eight times, with the interactions | **45–60 min per contract** |

## 3. Time per contract, with the tool

| Step | Who | Time |
| --- | --- | --- |
| Read, classify, cross-check, place, draft | machine, unattended, in parallel | 1–3 min per contract (rate limits, not compute, are the ceiling) |
| „Alles in Ordnung“ | nobody — plus a deterministic spot check | 0; ~1 min per spot check |
| One finding on the page: quote, reason, marker, suggestion → Übernehmen / Nicht zutreffend | lawyer | **2–3 min** |
| Corrected copy, filing | lawyer | ~1 min per contract |
| **Contract with two findings** | | **~6 min of a lawyer's time**, against 15–50 min manually |

The review load falls further once the team has agreed with a class of finding often enough (8 in a row, ≥ 95 %:
20 % spot checks, later 10 %), so the 2–3 minutes are paid in full only while the system is still earning that trust.

## 4. The sums

**A rename sweep over the 15,000 active contracts** (the 2022–23 rebrand, or the bank in 2026):

| | Manual | With the tool |
| --- | --- | --- |
| Lawyer time | 15,000 × 15 min = **3,750 h ≈ 2.3 FTE-years** | *30 % flagged* × 3 min + spot checks ≈ **250 h ≈ 6 weeks for one person** |
| Elapsed | a task force of five: **~5 months** | machine 2–3 days, people **1–2 weeks** |
| Cost | 3,750 h × *€90/h loaded* ≈ **€340,000** | model calls ≈ **€900** (below), OCR ≈ €200, lawyer time ≈ €22,000 |

**The daily flow**, 15 contracts a day against the guideline:

| | Manual | With the tool |
| --- | --- | --- |
| Per day | 15 × 50 min = 12.5 h ≈ **1.6 FTE** | 15 × 6 min = 1.5 h ≈ **0.2 FTE** |
| Per year | ≈ **€240,000** of lawyer time | ≈ €30,000 of lawyer time + **~€250** of model calls + ~€3,000 infrastructure |

**A regulation sweep** (DORA ICT clauses over ~2,000 vendor contracts): 500 h manual → ~40 h with the tool.

**Model cost per contract** (list prices, September 2026): a 10-page contract ≈ 6,000 tokens. Reading: classification,
extraction and screening on Flash / Flash-Lite ≈ 20,000 tokens ≈ $0.02; embeddings negligible. Checking: ~3
candidates × (2,000 tokens of graph-selected context + 6,000 for the full read when a clause still counts as
missing) ≈ 15,000 Pro input tokens at $2/M + ~1,000 output tokens at $12/M ≈ $0.04; two drafted clauses on Flash
≈ $0.01. **≈ $0.06–0.10 per contract**, scans with vision OCR ≈ $0.15. Infrastructure: AuraDB Professional from
~$65/month, Container Apps ~$50–100/month, Document Intelligence $1.50 per 1,000 pages.

The order of magnitude is what matters: **the tool costs about 1 % of the lawyer time it replaces, and the lawyer
time that remains is the part only a lawyer can do.**

## 5. Why a person still looks — the decision the UX is built on

The tool could apply its findings itself: replace the name, insert the drafted clause, file the copy. It does not,
and this is the cost-benefit of that choice.

**The cost of review.** 2–3 minutes per finding — ~250 hours in the rename sweep, 7 % of the manual effort it
replaces. This is the whole price of keeping a person in the loop.

**The benefit of review — precision that no measurement can promise at scale.** On the real-contract benchmark
(`docs/ps-coverage.md`, CUAD) the rule layer alone had a precision of 0.43: applied automatically, 57 % of its
edits would have been wrong. With the verifier, precision reached 1.00 and recall 0.91 — on 22 true absences. That
is a good number and a small sample; at 15,000 contracts a residual error rate of even 0.5 % means 75 wrong edits.

**The asymmetry.** A false alarm reviewed by a person costs 3 minutes (≈ €4.50). A false edit that goes through
costs hours of legal rework and, filed in the contract storage as a corrected copy, is a document with legal
effect: a clause inserted where one existed, a counterparty renamed that was never Riverty. €1,000–€100,000 per
event. Review pays for itself if it prevents one such error in every few thousand findings — at any plausible
residual error rate it wins by a wide margin.

**Accountability.** In a regulated financial company a change to a contract must be attributable to a person: the
audit log records who accepted what, when, on which file (SHA-256). „Die KI hat es gefunden, eine Juristin hat
entschieden“ is a sentence that holds up in an audit; „die KI hat es geändert“ is not.

**Trust and adoption.** Lawyers work on the document, not on a report about it. A finding shown *on the page* —
the old name boxed, the quote, the model's reason, the suggested text — is verified with a glance; the same finding
in a list makes the lawyer re-open the PDF and search (5–10 minutes), which gives most of the benefit back. That is
why the review page is the PDF itself with one finding at a time, and why „AI edits, human approves the final PDF“
would not work either: approving a 20-page corrected PDF without markers means reading it — back to manual.

**The cost decays.** The review rate per finding class starts at 100 % and falls to 20 % and then 10 % spot checks
only after the team's own decisions have shown the class to be reliable; one dismissal resets it. Automation is
earned per class from evidence, never granted on trust — so the design gets cheaper exactly where it has proven
itself, and nowhere else.

## 6. Why this approach for this use case

- **The questions are structural, not textual.** *Which contracts lack X* and *which still name Y* are relations —
  contract type *requires* clause type, contract *has* clause, old name *renamed to* current — so they are answered
  as graph patterns (Neo4j, `GET /api/graph/gaps`), deterministically and auditably; the model verifies rather than
  searches, and reads the whole contract before it confirms an absence.
- **The corpus is mid-sized and heterogeneous.** Tens of thousands of documents fit one graph; SharePoint PDFs,
  scans and handwritten JPEGs need per-page routing (text layer → Tesseract → vision model) more than a search
  cluster.
- **The work is bursty.** Sweeps arrive as events: drop a folder, get one result line per contract, filter the list
  by the question. The daily flow is the same tool without the bulk.
- **The team is small and not technical.** Three steps — Hochladen, Prüfen, Herunterladen — and the only clicks are
  the decisions.
- **The company is regulated.** Original never modified, corrected copy filed store-only under an idempotency key,
  append-only audit log, decisions by named people, documents screened for hidden instructions.
- **A Microsoft shop.** Every external dependency has an Azure counterpart behind one switch (`docs/tech-choices.md`).

## 7. Explainability — where it lives

| Audience | Where | What |
| --- | --- | --- |
| The lawyer, on every finding | the review page | the quote, the model's reason in plain German, the marker on the page, the suggestion; the caption whether the result was cross-checked, and when |
| The lawyer, once | *So funktioniert es* | the 14 stages in three phases in plain words, tools and model per stage, a worked example from a real contract — generated from the code |
| The engineer, the assessor | *Technik* | the same stages with module, model and thinking level, thresholds and rules; the graph model with live counts and the gap query; a trace of one contract through every stage |
| The team, in the interview | the deck | one slide per question above: what, why, how much, and how it is made defensible |

## Sources

- Riverty facts: https://www.riverty.com/en/business/newsroom/riverty-establishes-bank-in-luxembourg/ ,
  https://en.wikipedia.org/wiki/Riverty , https://www.bertelsmann.com/en/media/news/riverty-launches.html
- Gemini 3.1 Pro list price $2 / $12 per 1M tokens (≤ 200k context), Flash $0.75 / $3.75, Flash-Lite $0.30 / $2.50:
  https://devtk.ai/en/models/gemini-3-1-pro/ , https://benchlm.ai/google/api-pricing , `docs/tech-choices.md`
- Neo4j AuraDB pricing: https://neo4j.com/pricing/ · Azure AI Document Intelligence: `docs/tech-choices.md`
- Measured precision/recall: `docs/ps-coverage.md` (CUAD subset, 12 contracts, 22 true absences)
- Everything else: assumptions, marked as such above. Loaded hourly cost of €90 blends lawyer and paralegal time.
