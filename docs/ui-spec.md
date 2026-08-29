# UI spec — Contract Intelligence for a German-speaking legal team

Audience: lawyers and paralegals, mostly German-speaking, not engineers. German is the default; English is one
click away (DE | EN in the top bar). The tool works like a file converter: drop contracts in, get the result — and
the result is shown on the contract itself, the way a PDF editor shows its edits, because a lawyer trusts what they
can see on the page. Nothing has to be started or configured; the only clicks are the decisions on the findings.
Three pages, a top bar, nothing else.

## Foundation (reuse, do not re-implement)

| File | Provides |
| --- | --- |
| `web/src/i18n.tsx` | `SettingsProvider`, `useSettings()` → `{ lang, setLang }`, `useT(DICT)` → `t('key', {vars})`, `useLabel(MAP)` → `(value) => string` |
| `web/src/vocab.ts` | `CLAUSE_TYPES` (the 12 clause types), `CONTRACT_TYPES`, `COMMON` (nav labels, AI status, „Seite {n}“ / „Seiten {n}“, the generic error sentence) |
| `web/src/components/ui.tsx` | `usePolling`, `useToast`/`ToastProvider`, `ErrorAlert`, `EmptyState` |
| `web/src/App.tsx` | Shell: top bar with title, nav (Verträge · So funktioniert es), AI status chip („KI-Gegenprüfung aktiv“ / „Ohne KI-Gegenprüfung“), DE \| EN toggle. Content container `md`, widened to `lg` on `/contracts/:id` (pages plus sidebar). No drawer, no settings, no technical-details switch. |
| `web/src/api.ts` | The backend contract: `documents`, `document(id)`, `upload(files, lang)`, `ingestSamples(lang)`, `recheck(id, lang)`, `retryDocument(id)`, `deleteDocument(id)`, `decide(id, key, { decision, note?, edited_text? })`, `fileToStorage(id)`, `config` — and the types `Report`, `Item`, `ItemReview`, `ReportPage`, `Decision` (the report is built by `api/app/report.py`) |

## Routes

| Route | File | Nav (DE / EN) |
| --- | --- | --- |
| `/` | `pages/Home.tsx` | Verträge / Contracts |
| `/contracts/:id` | `pages/Contract.tsx` | — (opened from the list) |
| `/how-it-works` | `pages/HowItWorks.tsx` | So funktioniert es / How it works |

Anything else redirects to `/`.

## Wording rules (every page)

* **German first, both languages complete.** Each page defines `const T = { key: { de, en } }` and uses `const t = useT(T)`; enum values go through `useLabel(CLAUSE_TYPES | CONTRACT_TYPES)`. No hardcoded copy in JSX.
* **Plain language, Sie-Form, calm.** One sentence says what a thing is. No exclamation marks, no marketing, no jargon („Audit“, „Pipeline“, „Verifier“, „Precision“ do not appear). Buttons carry verbs: Verträge auswählen, Übernehmen, Nicht zutreffend, Bestätigen, Abbrechen, Entscheidung zurücknehmen, Korrigierte Fassung herunterladen, In der Vertragsablage ablegen, Erneut prüfen, Erneut versuchen, Löschen.
* **Every finding is shown on the page.** An old company name and a partly present clause are a box around the words, with the quoted passage; a missing clause has no quote by definition — it is a dashed line where the clause belongs („Hier fehlt: Haftungsbegrenzung“). A cross-checked finding also shows the model's reason under „Begründung“. When no place on the page can be found, the finding sits in a banner across the top of that page („Auf dieser Seite: · fehlt: …“) — never a wrong box.
* **A suggestion is a suggestion.** The drafted clause is headed „Vorschlag für die fehlende Klausel“ (partly present: „Vorschlag zur Ergänzung“), the new name „Ersetzen durch“. Nothing is applied until a person clicks Übernehmen, and the contract itself is never changed — the corrected copy is a separate file.
* **No technical layer.** No percentages, confidence scores, review rates, method traces, checksums, coordinates or raw enum keys anywhere. The only technical facts a user sees: the model list on *So funktioniert es* and the raw error text under a failed state (small, monospace).
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

Polling: every 3 s while any contract on the page is processing or its report is pending/running; otherwise none. A decision returns the updated report in its response; the contract page uses it directly, no reload.

## Start page — „Verträge prüfen“ (`/`)

* Headline „Verträge prüfen“ and one sentence: „Legen Sie einen oder mehrere Verträge ab. Jeder Vertrag wird gelesen und automatisch geprüft: Welche Standardklauseln fehlen? Steht noch ein alter Firmenname darin?“
* Drop zone (dashed): button **Verträge auswählen** (hidden multi-file input, `.pdf,.jpg,.jpeg,.png`), „oder hierher ziehen“, „PDF, JPG oder PNG – auch Scans und handschriftliche Verträge“. Small line „Keine Verträge zur Hand? Beispielverträge laden“ (`POST /api/documents/ingest-samples?language=<lang>`). Upload → `POST /api/documents/upload?language=<lang>` (multipart field `files`), toast „3 Verträge werden gelesen …“, list refreshes. Every contract is read and checked automatically (`api/app/report.py` builds the result right after ingest; at startup `api/app/main.py` finishes what is unfinished, repeats checks whose cross-check could not run, and upgrades old-format results).
* „Ihre Verträge“: newest first, one row per contract: icon (spinner / green check / red / warning) · title with „Vertragsart · n Seiten“ · the result line from the table above. Row click → `/contracts/:id`.
* Empty: „Noch keine Verträge. Ihr erster Vertrag erscheint hier.“ Errors: `ErrorAlert` with the generic sentence from `COMMON`.

## Contract page (`/contracts/:id`) — the viewer

Back link „Alle Verträge“, title, „Vertragsart · n Seiten · Dateiname“, the result line (same wording as on the start page). Warning banner when `injection_suspected` („Dieses Dokument enthält Text, der sich an automatische Prüfsysteme richtet …“). Once the report is ready, two columns from `md` up (pages left, 300 px sidebar right, sticky); on narrow screens the sidebar comes first.

### The pages

Every page of the contract, in order, headed „Seite n“: `<img src="/api/documents/{id}/pages/{n}.png">` (PyMuPDF at 110 dpi, cached on the server under `data/cache/<sha256>/`; `report.pages[n-1].width/height` gives the aspect ratio so the layout does not jump; images load lazily). A JPG/PNG is one page. Each finding (`report.items[]`) is one marker, positioned over the image with `item.anchor.bbox` (normalised 0..1 of the page):

| `item.kind` | `anchor.kind` | Marker | Colour |
| --- | --- | --- | --- |
| `old_name` | `highlight` | box around the words, tag with the finding's number | red (`error`) |
| `partial_clause` | `highlight` | box around the passage, numbered tag | orange (`warning`) |
| `missing_clause` | `insert` | dashed line where the clause belongs — below the last clause, or above the signatures — with the tag „Hier fehlt: {Klausel}“ | blue (`primary`) |
| any, `bbox === null` | — | banner across the top of the page: „Auf dieser Seite: · fehlt: {…} · nur teilweise: {…} · alter Firmenname: {…}“, one clickable chip per finding | dark; chips in the finding's colour |

Decided findings are grey and translucent, dismissed ones struck through. Hover shows a tooltip: label, the first 120 characters of the suggestion (or the edited text), the state. Click (or Enter) opens the popover at the marker; the selected marker gets a ring.

Where the box comes from (`api/app/locate.py`): digital page → the PDF text layer, exact; scanned page → Tesseract word boxes, matched fuzzily against OCR noise; handwriting or anything Tesseract cannot read → the vision model (task `locate`); nothing reliable → `null` and the banner. A box is never guessed.

### The sidebar

1. **Fundstellen**: the findings numbered in page order (page, then top edge; page-level ones first), each „n. Label · Seite p“, plus „· Übernommen“ / „· Nicht zutreffend“ / „· Automatisch übernommen“ once decided (struck through when dismissed). Icon by kind and state (plus-circle / warning / error; green check when accepted, grey when dismissed). Click → scroll the marker into view, then open its popover. Below: „n warten auf Ihre Entscheidung“ / „1 wartet auf Ihre Entscheidung“ / „Nichts wartet auf Sie“, and the small line for names that appear only as „vormals …“ references. Without findings: „Keine Fundstellen.“
2. Collapsed **Vorhandene Klauseln**: „Klausel – Seite n“ with a green check; „Keine der Standardklauseln wurde erkannt.“ when empty; small line „Für diese Vertragsart nicht erforderlich und ebenfalls nicht enthalten: …“.
3. Buttons: **Korrigierte Fassung herunterladen** — on a scan **Kommentierte Fassung herunterladen**, preceded by the caption „Gescanntes Dokument: Markierungen und Kommentare, keine Textänderung“ — opens `GET /api/documents/{id}/corrected.pdf` in a new tab; **In der Vertragsablage ablegen** → `POST /api/documents/{id}/file-to-storage`, toast „Abgelegt unter {id}“, afterwards the caption „Abgelegt unter {id} · time“ from `report.storage`. Both are disabled with the tooltip „Erst möglich, wenn mindestens ein Vorschlag übernommen wurde.“ until at least one finding is accepted (the API answers 409 otherwise). Then **Erneut prüfen** (`POST /api/documents/{id}/report?language=<lang>`, toast „Die Prüfung läuft erneut.“; decisions already taken survive the re-check) and **Löschen** (confirm „Diesen Vertrag aus der Prüfung entfernen?“, then `DELETE /api/documents/{id}`, back to `/`).
4. Caption: cross-checked or not, „· wird beim nächsten Neustart nachgeholt“ when degraded, and the time.

### The popover — one finding

440 px wide, anchored below the marker. Top to bottom:

* Kind and page („Alter Firmenname · Seite 3“, „Fehlende Klausel · Seite 4“, „Klausel nur teilweise vorhanden · Seite 2“), then the title: the clause name, or „Alter Firmenname: {name}“.
* The quote in italics (`item.quote`; none for a missing clause).
* „Begründung: …“ when the cross-check gave a reason (`item.reason`).
* `item.suggestion_title` — „Ersetzen durch“ / „Vorschlag für die fehlende Klausel“ / „Vorschlag zur Ergänzung“ — and the suggestion: „Riverty GmbH“ (or „Riverty“ for a short form such as AFS), or the clause drafted in the contract's language and numbering style (heading and text, `api/app/draft.py`). On a digital PDF whose page has a text layer (`item.editable`) and while the finding is open, the suggestion is a multi-line text field: what the lawyer types is what goes into the corrected copy. On a scan it is read-only with the caption „Gescanntes Dokument – bitte im Original ändern“. No suggestion → the „Kein Vorschlag verfügbar …“ sentence.
* The decision, by `item.review.status`:

| `review.status` | Popover | Sidebar / marker |
| --- | --- | --- |
| `open` | **Übernehmen** (→ `decision: 'accepted'`, with `edited_text` from the field when editable) and **Nicht zutreffend** (→ note field „Warum? (optional, hilft der KI beim nächsten Mal)“ with **Bestätigen** / **Abbrechen** → `decision: 'dismissed'`, `note`) | tooltip „Wartet auf Ihre Entscheidung“; full colour |
| `accepted` | chip „Übernommen“, „Anmerkung: …“ if any, **Entscheidung zurücknehmen** (→ `decision: 'reopen'`) | „· Übernommen“, green check; marker grey |
| `dismissed` | chip „Nicht zutreffend“, the note, **Entscheidung zurücknehmen** | „· Nicht zutreffend“, struck through; marker grey, struck through |
| `auto` | chip „Automatisch übernommen – Stichprobe nicht nötig“, **Entscheidung zurücknehmen** | „· Automatisch übernommen“; marker grey |

`review.carried_over` adds the line „aus früherer Prüfung übernommen“. Every decision → `POST /api/documents/{id}/items/{key}/decide`, toast „Übernommen“ / „Als nicht zutreffend markiert“ / „Entscheidung zurückgenommen“; accept and dismiss close the popover, undo keeps it open. `item.policy` (`required | spot_check | auto | carried_over`, `review_rate`) is never shown — the user sees only the state.

What a decision does on the server (`api/app/learning.py`): it is stored per file and finding (table `decisions`: sha256, item_key, class_key, decision `accepted | dismissed | reopened`, note, edited_text, quote, actor); the same file checked again gets it back (`carried_over`); a note becomes a precedent the verifier sees for that class of finding; and a class the team has accepted 8 times in a row with ≥ 95 % agreement (rules in `api/app/policy.py`) is accepted automatically except for a deterministic spot-check sample — 20 %, 10 % after 24 — with at least one spot check per contract. Automatic decisions look like any other and can be undone; automation applies only to cross-checked findings, and one dismissal returns the class to full review.

### The corrected copy (`api/app/correct.py`)

`GET /api/documents/{id}/corrected.pdf` → `<Dateiname>_korrigiert.pdf`, built on request from the accepted and automatic findings; the original file is never modified. Digital page: the old name is replaced in place (redaction with the replacement text, the box widened into free space on the line); a missing or partly present clause goes on an addendum page („Nachtrag – eingefügte Klauseln“) with a note at the marker. Scanned page: the spot is highlighted with a note — the team changes the paper original. JPG/PNG: converted to a one-page PDF first. **In der Vertragsablage ablegen** pushes that file to the contract-storage REST API (`Idempotency-Key: copy-<sha256 of the copy>` — filing the same copy twice stores it once) and records `report.storage` (external id, checksum, time).

## So funktioniert es (`/how-it-works`)

„Vier Schritte, vollautomatisch nach dem Ablegen. Der Vertrag selbst wird nie verändert.“ Four numbered cards — Lesen · Zerlegen und einordnen · Prüfen · Ergebnis — one paragraph each in plain words (what is read directly, when the model reads a page as an image, what „nicht lesbar“ means, the twelve clause types, the guideline, the full-contract cross-check, the name register and why „vormals“ does not count). Card **Eingesetzte Modelle**: task → model id from `GET /api/config` (`routing`), or the offline sentence when no key is set; one paragraph on where the data lives and that instructions inside documents are ignored.
