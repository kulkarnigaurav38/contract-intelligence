# UI spec — Contract Intelligence for a German-speaking legal team

Audience: lawyers and paralegals, mostly German-speaking, not engineers. German is the default; English is one
click away (DE | EN in the top bar). The tool works like a file converter: drop contracts in, get the result — and
the result is shown on the contract itself, the way a PDF editor shows its edits, because a lawyer trusts what they
can see on the page. Nothing has to be started or configured; the only clicks are the decisions on the findings.
Three steps — **1 Hochladen · 2 Prüfen · 3 Herunterladen** — shown as a strip on every page, a top bar, nothing else.

## Foundation (reuse, do not re-implement)

| File | Provides |
| --- | --- |
| `web/src/i18n.tsx` | `SettingsProvider`, `useSettings()` → `{ lang, setLang }`, `useT(DICT)` → `t('key', {vars})`, `useLabel(MAP)` → `(value) => string` |
| `web/src/vocab.ts` | `CLAUSE_TYPES` (the 12 clause types), `CONTRACT_TYPES`, `COMMON` (nav labels, AI status, „Seite {n}“ / „Seiten {n}“, the generic error sentence) |
| `web/src/components/ui.tsx` | `usePolling`, `useToast`/`ToastProvider`, `ErrorAlert`, `EmptyState`, `Steps` (the strip: `active` 1–3, `review`/`download` links; steps without a link are disabled) |
| `web/src/App.tsx` | Shell: top bar with title, nav (Verträge · So funktioniert es), AI status chip („KI-Gegenprüfung aktiv“ / „Ohne KI-Gegenprüfung“), DE \| EN toggle. Content container `md`, widened to `lg` on `/contracts/:id` (pages plus sidebar). No drawer, no settings, no technical-details switch. |
| `web/src/api.ts` | The backend contract: `documents`, `document(id)`, `upload(files, lang)`, `ingestSamples(lang)`, `sync()`, `recheck(id, lang)`, `retryDocument(id)`, `deleteDocument(id)`, `decide(id, key, { decision, note?, edited_text? })`, `fileToStorage(id)`, `createAudit(kind, params)`, `audit(id)`, `config`, `pipeline` — and the types `Report`, `Item`, `ItemReview`, `ReportPage`, `Decision`, `Audit`, `Finding`, `Stage` (the report is built by `api/app/report.py`, the stage list by `api/app/pipeline.py`) |

## Routes

| Route | File | Nav (DE / EN) |
| --- | --- | --- |
| `/` | `pages/Home.tsx` | Verträge / Contracts |
| `/contracts/:id` | `pages/Contract.tsx` | — step 2, Prüfen (opened from the list) |
| `/contracts/:id/download` | `pages/Download.tsx` | — step 3, Herunterladen (opened from the review's **Weiter zum Download**) |
| `/how-it-works` | `pages/HowItWorks.tsx` | So funktioniert es / How it works |
| `/technik` | `pages/Technik.tsx` | Technik / Under the hood — the technical explanation for engineers and assessors; the one page where the "no technical layer" rule does not apply |

Anything else redirects to `/`.

## Wording rules (every page)

* **German first, both languages complete.** Each page defines `const T = { key: { de, en } }` and uses `const t = useT(T)`; enum values go through `useLabel(CLAUSE_TYPES | CONTRACT_TYPES)`. No hardcoded copy in JSX.
* **Plain language, Sie-Form, calm.** One sentence says what a thing is. No exclamation marks, no marketing, no jargon („Audit“, „Pipeline“, „Verifier“, „Precision“ do not appear). Buttons carry verbs: Verträge auswählen, Übernehmen, Nicht zutreffend, Bestätigen, Abbrechen, Entscheidung zurücknehmen, Korrigierte Fassung herunterladen, In der Vertragsablage ablegen, Erneut prüfen, Erneut versuchen, Löschen.
* **Every finding is shown on the page.** An old company name and a partly present clause are a box around the words, with the quoted passage; a missing clause has no quote by definition — it is a dashed line where the clause belongs („Hier fehlt: Haftungsbegrenzung“). A cross-checked finding also shows the model's reason under „Begründung“. When no place on the page can be found, the finding sits in a banner across the top of that page („Auf dieser Seite: · fehlt: …“) — never a wrong box.
* **A suggestion is a suggestion.** The drafted clause is headed „Vorschlag für die fehlende Klausel“ (partly present: „Vorschlag zur Ergänzung“), the new name „Ersetzen durch“. Nothing is applied until a person clicks Übernehmen, and the contract itself is never changed — the corrected copy is a separate file.
* **No technical layer.** No percentages, confidence scores, review rates, method traces, checksums, coordinates or raw enum keys anywhere. The only technical facts a user sees: the small tools-and-model line on each stage card of *So funktioniert es* and the raw error text under a failed state (small, monospace).
* **Honest about what was done.** Every ready result ends with „Regelprüfung mit KI-Gegenprüfung im Volltext“ or „Nur Regelprüfung – ohne KI-Gegenprüfung“ plus the time; when the cross-check could not run (`report.degraded`) the line adds „· wird beim nächsten Neustart nachgeholt“. A finding without a drafted suggestion says „Kein Vorschlag verfügbar – die KI war beim Prüfen nicht erreichbar. „Erneut prüfen“ holt ihn nach.“ The top-bar chip says the same for the whole system.
* **Titles**: `doc.title || doc.filename`.
* **MUI 9**: no system props on `Stack`/`Typography` — use `sx`. TypeScript strict, `verbatimModuleSyntax` (`import { type X }`); default-export the page component; helpers inline.

## States

The backend exposes `status` (document: `processing | ready | failed`) and `report.status` (`pending | running | ready | failed`). The UI maps them to one line on the start page and one block on the contract page:

| Backend | Start page line | Contract page |
| --- | --- | --- |
| document `processing` | „Wird gelesen …“ (spinner) | „Der Vertrag wird gelesen …“ + indeterminate bar; only **Löschen** |
| document `ready`, report `pending`/`running` | „Wird geprüft …“ (spinner) | „Der Vertrag wird geprüft …“ + indeterminate bar; only **Löschen** |
| document `failed` | „Fehlgeschlagen – öffnen und erneut versuchen“ (warning) | „Der Vertrag konnte nicht gelesen werden.“ + raw error + **Erneut versuchen** (`POST /api/documents/{id}/retry`) |
| report `failed` | same line | „Die Prüfung ist fehlgeschlagen.“ + raw error + **Erneut versuchen** (`POST /api/documents/{id}/report`) |
| report `ready`, findings | „2 Klauseln fehlen · alter Firmenname auf Seite 3“ (red, bold); „teilweise nicht lesbar“ appended when a page could not be read | the same line under the title, then the viewer: pages with markers, sidebar |
| report `ready`, no findings | „Alles in Ordnung“ (green) | „Alles in Ordnung“ under the title; green banner „Alle für diese Vertragsart erforderlichen Klauseln sind vorhanden, und es wird kein alter Firmenname mehr genannt.“ above the pages (no markers); sidebar „Keine Fundstellen.“ |

Polling: every 3 s while any contract on the page is processing or its report is pending/running; otherwise none. A decision returns the updated report in its response; the contract page uses it directly, no reload. The *Regelung fehlt* search on the start page polls its audit (`GET /api/audits/{id}`) every 2 s until it is `done` or `failed`.

## Start page — „Verträge prüfen“ (`/`)

* Headline „Verträge prüfen“ and one sentence: „Legen Sie einen oder mehrere Verträge ab. Jeder Vertrag wird gelesen und automatisch geprüft: Welche Standardklauseln fehlen? Steht noch ein alter Firmenname darin?“
* Drop zone (dashed): button **Verträge auswählen** (hidden multi-file input, `.pdf,.jpg,.jpeg,.png`), „oder hierher ziehen“, „PDF, JPG oder PNG – auch Scans und handschriftliche Verträge“. Small line „Keine Verträge zur Hand? Beispielverträge laden“ (`POST /api/documents/ingest-samples?language=<lang>`) „· einen einzelnen laden ▾“ (a menu of the sample files from `GET /api/samples`, already-loaded ones with a green check; a click → `POST /api/documents/ingest-samples?file=<name>`), followed by „· Neue Dateien aus SharePoint holen“ (`POST /api/documents/sync`, toast „SharePoint wird abgefragt …“) only when `GET /api/config` says `document_source === 'sharepoint'`. Upload → `POST /api/documents/upload?language=<lang>` (multipart field `files`), toast „3 Verträge werden gelesen …“, list refreshes. Every contract is read and checked automatically (`api/app/report.py` builds the result right after ingest; at startup `api/app/main.py` finishes what is unfinished, repeats checks whose cross-check could not run, and upgrades old-format results).
* „Ihre Verträge“: newest first, one row per contract: icon (spinner / green check / red / warning) · title with „Vertragsart · n Seiten“ · the result line from the table above. Row click → `/contracts/:id`.
* Filter row, right of „Ihre Verträge“ (`ToggleButtonGroup`, exclusive): **Alle** · **Alter Firmenname** · **Klausel fehlt** · **Regelung fehlt** — the problem statement's question across all contracts in one click. Under it the count of rows shown („n Verträge“ / „1 Vertrag“). A filtered-out contract simply leaves the list; a row that stays keeps its result line and may get a small grey suffix under it.
  * *Alter Firmenname*: rows whose result still has an old name (`report_summary.old_names > 0`); no suffix.
  * *Klausel fehlt*: a select with the twelve clause types (default Haftungsbegrenzung). Each checked contract's result is fetched once (`GET /api/documents/{id}`, progress bar meanwhile); a row stays when `report.clauses[type].status` is not `present`, with the suffix „(laut Richtlinie nicht erforderlich)“ when `required` is false.
  * *Regelung fehlt*: a text field (placeholder „z. B. Der Auftragnehmer verpflichtet sich zur Einhaltung von Antikorruptionsgesetzen“) and **Suchen** (Enter works too) → `POST /api/audits` with `{ kind: 'missing_passage', params: { passage, language } }`, polled every 2 s; „Wird gesucht …“ with a progress bar meanwhile, the list unfiltered. Done: only the flagged contracts stay (findings whose verdict is not `dismissed`), each with the suffix „Regelung nicht gefunden“ (`confirmed`), „nur teilweise vorhanden“ (`partial`) or „nicht gefunden (ohne KI-Gegenprüfung)“ (rule result only), under the line „{n} von {m} Verträgen ohne diese Regelung“ (m = the audit's scope). A failed audit (e.g. embedding quota) shows its error in an `ErrorAlert`.
* Empty: „Noch keine Verträge. Ihr erster Vertrag erscheint hier.“ Errors: `ErrorAlert` with the generic sentence from `COMMON`.

## Review page (`/contracts/:id`) — step 2, the viewer

Back link „Alle Verträge“, title, „Vertragsart · n Seiten · Dateiname“, the result line (same wording as on the start page), the steps strip (2 active; 3 linked once a suggestion is applied). Warning banner when `injection_suspected` („Dieses Dokument enthält Text, der sich an automatische Prüfsysteme richtet …“). Once the report is ready, two columns from `md` up (pages left, 340 px panel right, sticky); on narrow screens the panel comes first.

### The pages

Every page of the contract, in order, headed „Seite n“: `<img src="/api/documents/{id}/pages/{n}.png">` (PyMuPDF at 110 dpi, cached on the server under `data/cache/<sha256>/`; `report.pages[n-1].width/height` gives the aspect ratio so the layout does not jump; images load lazily). A JPG/PNG is one page. Each finding (`report.items[]`) is one marker, positioned over the image with `item.anchor.bbox` (normalised 0..1 of the page):

| `item.kind` | `anchor.kind` | Marker | Colour |
| --- | --- | --- | --- |
| `old_name` | `highlight` | box around the words, tag with the finding's number | red (`error`) |
| `partial_clause` | `highlight` | box around the passage, numbered tag | orange (`warning`) |
| `missing_clause` | `insert` | dashed line where the clause belongs — below the last clause, or above the signatures — with the tag „Hier fehlt: {Klausel}“ | blue (`primary`) |
| any, `bbox === null` | — | banner across the top of the page: „Auf dieser Seite: · fehlt: {…} · nur teilweise: {…} · alter Firmenname: {…}“, one clickable chip per finding | dark; chips in the finding's colour |

Decided findings are grey and translucent, dismissed ones struck through. Hover shows a tooltip: label and state. Click (or Enter) shows that finding in the panel; the selected marker gets a ring.

Where the box comes from (`api/app/locate.py`): digital page → the PDF text layer, exact; scanned page → Tesseract word boxes, matched fuzzily against OCR noise; handwriting or anything Tesseract cannot read → the vision model (task `locate`); nothing reliable → `null` and the banner. A box is never guessed.

### The panel — one finding at a time

`data-testid="finding-card"`. „Fundstelle i von n“ with arrows (aria-labels „Vorherige Fundstelle“ / „Nächste Fundstelle“; an arrow also scrolls the page to the marker), a thin progress bar and „d entschieden · o offen“ / „Alle Fundstellen entschieden“. Then the finding itself, top to bottom:

* Kind and page („Alter Firmenname · Seite 3“, „Fehlende Klausel · Seite 4“, „Klausel nur teilweise vorhanden · Seite 2“), then the title: the clause name, or „Alter Firmenname: {name}“.
* The quote in italics (`item.quote`; none for a missing clause).
* „Begründung: …“ when the cross-check gave a reason (`item.reason`).
* `item.suggestion_title` — „Ersetzen durch“ / „Vorschlag für die fehlende Klausel“ / „Vorschlag zur Ergänzung“ — and the suggestion: the register's current name for the old one (`Riverty GmbH`, `Riverty Sweden AB`; „Riverty“ for a short form such as AFS), or the clause drafted in the contract's language and numbering style (`api/app/draft.py`, given the outline, the neighbouring clauses and the team's accepted precedents from the graph). On a digital PDF whose page has a text layer (`item.editable`) and while the finding is open, the suggestion is a multi-line text field: what the lawyer types is what goes into the corrected copy. On a scan it is read-only with the caption „Gescanntes Dokument – bitte im Original ändern“. No suggestion → the „Kein Vorschlag verfügbar …“ sentence.
* The decision, by `item.review.status`:

| `review.status` | Panel | Marker |
| --- | --- | --- |
| `open` | **Übernehmen** (→ `decision: 'accepted'`, with `edited_text` from the field when editable) and **Nicht zutreffend** (→ note field „Warum? (optional, hilft der KI beim nächsten Mal)“ with **Bestätigen** / **Abbrechen** → `decision: 'dismissed'`, `note`) | tooltip „Wartet auf Ihre Entscheidung“; full colour |
| `accepted` | chip „Übernommen“, „Anmerkung: …“ if any, **Entscheidung zurücknehmen** (→ `decision: 'reopen'`) | grey |
| `dismissed` | chip „Nicht zutreffend“, the note, **Entscheidung zurücknehmen** | grey, struck through |
| `auto` | chip „Automatisch übernommen – Stichprobe nicht nötig“, **Entscheidung zurücknehmen** | grey |

`review.carried_over` adds the line „aus früherer Prüfung übernommen“. Every decision → `POST /api/documents/{id}/items/{key}/decide`, toast „Übernommen“ / „Als nicht zutreffend markiert“ / „Entscheidung zurückgenommen“; accept and dismiss move the panel on to the next open finding (page order, wrapping round), undo stays. `item.policy` (`required | spot_check | auto | carried_over`, `review_rate`) is never shown — the user sees only the state. Without findings the panel says „Keine Fundstellen.“ and the pages carry the green banner.

Under the panel: **Weiter zum Download** (large, primary; → `/contracts/:id/download`), disabled with the tooltip „Erst möglich, wenn mindestens ein Vorschlag übernommen wurde.“ until at least one finding is accepted (the API answers 409 otherwise); on a scan the caption „Gescanntes Dokument: Markierungen und Kommentare, keine Textänderung“. Then the collapsed accordion **Weitere Angaben**: „Vorhandene Klauseln“ as „Klausel – Seite n“ with a green check („Keine der Standardklauseln wurde erkannt.“ when empty), „Für diese Vertragsart nicht erforderlich und ebenfalls nicht enthalten: …“, the line for names that appear only as „vormals …“ references, and the caption „Regelprüfung mit KI-Gegenprüfung“ / „Nur Regelprüfung – ohne KI-Gegenprüfung“ (+ „· wird beim nächsten Neustart nachgeholt“ when degraded) with the time. Last, small: **Erneut prüfen** (`POST /api/documents/{id}/report?language=<lang>`, toast „Die Prüfung läuft erneut.“; decisions already taken survive the re-check) and **Löschen** (confirm „Diesen Vertrag aus der Prüfung entfernen?“, then `DELETE /api/documents/{id}`, back to `/`).

What a decision does on the server (`api/app/learning.py`): it is stored per file and finding as a `Decision` node in the graph (sha256, item_key, class_key, decision `accepted | dismissed | reopened`, note, edited_text, quote, actor; linked to the contract and the clause type); the same file checked again gets it back (`carried_over`); a note becomes a precedent the verifier sees for that class of finding, accepted wording a precedent the drafter sees for that clause type; and a class the team has accepted 8 times in a row with at least 95 % agreement (rules in `api/app/policy.py`) is accepted automatically except for a deterministic spot-check sample — 20 %, 10 % after 24 — with at least one spot check per contract. Automatic decisions look like any other and can be undone; automation applies only to cross-checked findings, and one dismissal returns the class to full review.

## Download page (`/contracts/:id/download`) — step 3

Back link „Zurück zur Prüfung“, title, „Vertragsart · n Seiten · Dateiname“, the steps strip (3 active). Nothing applied yet → info box „Noch nichts übernommen“ with the sentence „Übernehmen Sie in der Prüfung mindestens einen Vorschlag – dann steht die korrigierte Fassung hier zum Herunterladen bereit.“ and the button **Zur Prüfung**. Otherwise a centred card: green check, „Ihre korrigierte Fassung ist fertig“ (scan: „Ihre kommentierte Fassung ist fertig“), one line of what was done — „2 Firmennamen ersetzt · 1 Klausel ergänzt (Nachtrag) · 1 nicht zutreffend · 1 noch offen“ (scan: „n Stellen markiert und kommentiert“) — the large primary **Korrigierte Fassung herunterladen** (scan: **Kommentierte Fassung herunterladen**; `<a download>` of `GET /api/documents/{id}/corrected.pdf` as `<Dateiname>_korrigiert.pdf`), **In der Vertragsablage ablegen** (`POST /api/documents/{id}/file-to-storage`, toast „Abgelegt unter {id}“, afterwards „Abgelegt unter {id} · time“ from `report.storage`), and the caption „Das Original bleibt unverändert – diese Fassung wird aus den übernommenen Vorschlägen erzeugt.“ (scan: „Gescanntes Dokument: Markierungen und Kommentare, keine Textänderung – bitte im Original ändern.“). Below it the corrected PDF itself in an `<iframe>` (title „Vorschau der korrigierten Fassung“, 75 vh). At the bottom **Alle Verträge** and, when another checked contract still has open findings, **Nächster Vertrag mit offenen Fundstellen: {title}** → its review page.

### The corrected copy (`api/app/correct.py`)

`GET /api/documents/{id}/corrected.pdf` → `<Dateiname>_korrigiert.pdf`, built on request from the accepted and automatic findings; the original file is never modified. Digital page: the old name is replaced in place (redaction with the replacement text, the box widened into free space on the line); a missing or partly present clause goes on an addendum page („Nachtrag – eingefügte Klauseln“) with a note at the marker. Scanned page: the spot is highlighted with a note — the team changes the paper original. JPG/PNG: converted to a one-page PDF first. **In der Vertragsablage ablegen** pushes that file to the contract-storage REST API (`Idempotency-Key: copy-<sha256 of the copy>` — filing the same copy twice stores it once) and records `report.storage` (external id, checksum, time).

## So funktioniert es (`/how-it-works`)

„Jeder Vertrag durchläuft diese Schritte – automatisch nach dem Ablegen, in dieser Reihenfolge. Die Seite wird aus dem Code erzeugt und ist immer aktuell.“ The page renders `GET /api/pipeline` (`api/app/pipeline.py` — the one list of stages the check graph in `api/app/report.py` is built from), so it cannot drift from the code; nothing on it is hand-written except the headings below.

* **Three phases**, each a heading with its stages in order: **Lesen** (`load`, `ocr`, `segment`, `classify`, `entities`, `screen`, `embed`) · **Prüfen** (`rules`, `cross_check`, `place`, `draft`, `policy`) · **Entscheiden** (`decide`, `correct`) — 14 stages, numbered 1–14 across the phases, joined by a vertical line.
* **One card per stage**: the title (`title[lang]`), one plain sentence (`text[lang]`), a small monospace line „{tools} · {model}“ (the model id from the live routing table; tools only when the stage uses no model or no key is set) and „→ erzeugt: {produces}“. No other technical detail; the wording lives in `api/app/pipeline.py`, German and English.
* **Worked example**, a sticky panel right of the cards (below them on narrow screens), headed „Beispiel: {title}“ and computed from a real contract — the first checked contract with at least one finding (contract 1 preferred), `GET /api/documents/{id}`. Three blocks with the phase names: Lesen — „{pages} Seiten: {t} Textebene, {o} OCR, {v} Vision“, „{n} Klauseln erkannt“, „{n} Namensfunde“; Prüfen — „{required} erforderliche Klauseltypen, {missing} fehlen, {partial} nur teilweise, {old_names} alte Namen“, „{placed} von {items} Funden exakt verortet“, „{n} Vorschläge“; Entscheiden — „{open} offen, {accepted} übernommen, {dismissed} nicht zutreffend, {auto} automatisch“, „Korrigierte Kopie: verfügbar“ / „… sobald ein Vorschlag übernommen ist“; then the link „Vertrag öffnen“. No panel while no contract qualifies.
* Below: the offline sentence when no key is set (`GET /api/config`, `llm_enabled`), and one paragraph on where the data lives and that instructions inside documents are ignored.

## Technik (`/technik`)

For engineers and the people assessing the solution; generated from the API like *So funktioniert es*, wide container. Top to bottom: the **architecture strip** (SharePoint · Upload → Lesen → Neo4j → Prüfen → Entscheiden → Vertragsablage); the **stage table** from `GET /api/pipeline` — number, title and id, module (`stage.module`), model and thinking level, the technical description with rules and thresholds (`stage.detail`), what it produces; **the graph** — the guideline-gap Cypher, „n Richtlinienlücken über alle Verträge im Moment“ and node/relationship counts from `GET /api/graph/stats`, the graph model; **one contract through every stage** — a select over the checked contracts (default: the first with a finding) and, from `GET /api/documents/{id}`, the read phase (input type, language, pages with method/confidence/note, every clause with rule and model label and confidence, every name mention), the check phase (cross-check status and time, the twelve clause types with required/status/verified/page/reason, every finding with anchor, verified flag, review rule and decision), the decide phase (counts, filing) and the link to the contract; and **what the system guarantees** — six sentences (two reads, degradation, DOC_GUARD, original untouched + idempotent filing, audit log, earned automation). German/English like every page.
