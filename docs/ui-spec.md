# UI spec — Contract Intelligence for a German-speaking legal team

Audience: lawyers and paralegals, mostly German-speaking, not engineers. German is the default; English is one
click away. The tool must feel simple and pleasant. All technical substance is kept, but one layer down: small
print, a collapsed "Details" disclosure, or the global switch **Technische Details anzeigen** (off by default).

This document is the contract for every page. The foundation it relies on already exists — reuse it, do not
re-implement it:

| File | Provides |
| --- | --- |
| `web/src/i18n.tsx` | `SettingsProvider`, `useSettings()` → `{ lang, setLang, tech, setTech }`, `useT(DICT)` → `t('key', {vars})`, `useLabel(MAP)` → `(value) => string` |
| `web/src/vocab.ts` | Every DE/EN word for backend enums (`AUDIT_KINDS`, `AUDIT_QUESTIONS`, `VERDICTS`, `VERDICT_HELP`, `REVIEW_STATUS`, `DOC_STATUS`, `AUDIT_STATUS`, `CLAUSE_TYPES`, `CLAUSE_SHORT`, `CONTRACT_TYPES`, `CONTRACT_TYPE_KEYS`, `INPUT_TYPES`, `LANGUAGES`, `PAGE_METHODS`, `LEGIBILITY`, `RELIABILITY`, `CLAUSE_METHODS`, `ENTITY_KINDS`, `ENTITY_METHODS`, `LOG_ACTIONS`, `ROUTING_TASKS`, `THINKING`, `modelTier()`) and `COMMON` UI strings |
| `web/src/components/tech.tsx` | `<Tech>` (renders children only when the switch is on), `<Small>` (grey 11.5px print), `<Details label?>` (collapsed disclosure) |
| `web/src/components/ui.tsx` | `usePolling`, `useToast`/`ToastProvider`, `legibility(doc)`, `reliability(v)`, `useFindingSentence()`, `VerdictChip`, `ReviewChip`, `AuditKindChip`, `LegibilityChip`, `Reliability`, `Quote`, `EvidenceList`, `HowFound`, `DecisionDialog`, `EmptyState` |
| `web/src/App.tsx` | Shell: app bar (AI status chip, DE|EN toggle), nav with Freigabe badge, collapsed "Technik" group, the switch. Routes below. |
| `web/src/api.ts` | The fixed backend contract. `createAudit(kind, params, language)` and `chat(question, language)` take the UI language. |

## Conventions (every page)

* **Page-local dictionary**: each page defines `const T = { key: { de, en } }` at the top and uses `const t = useT(T)`. Every visible string goes through `t()` or a vocab map. No hardcoded German or English in JSX. Both languages complete.
* **Register**: German in Sie-Form, calm, precise, first-person plural for progress ("Wir lesen gerade 3 von 14 Verträgen …"). No exclamation marks, no emojis, no jokes in verdicts. Buttons carry verbs (Prüfen, Freigeben, Ablehnen, Ablegen). "Bestätigt/bestätigen" belongs to the machine verdict — never use it for a human action.
* **Words**: Fund (finding), Vertrag, Klausel, Regelung (passage), Prüfung (check), Freigabe (approval), Beleg (evidence), Vertragsablage (contract storage), Protokoll (activity log), Namensregister, Klausel-Übersicht, Verlässlichkeit (confidence), Lesbarkeit (legibility), Prüfsumme (checksum), KI-Gegenprüfung (verifier). English equivalents are in `vocab.ts`.
* **Technical layer**: percentages, method traces, model IDs, OCR methods, SHA-256, raw enum keys, retrieval scores, thresholds → only inside `<Tech>` (switch on) or `<Details>`; when shown, use `<Small>`. Verdicts are words (`VerdictChip`), confidence is a word with a dot (`Reliability`), provenance is `HowFound` (plain line by default, raw steps with the switch).
* **Sentences before numbers**: every result page opens with one human sentence, then tiles/tables.
* **Empty states** use `EmptyState` with a next step. **Progress** is honest: determinate where counts exist (documents ready / total), indeterminate for a running check ("… dauert meist unter einer Minute").
* **MUI 9**: system props (`alignItems`, `flexWrap`, `display`, `fontWeight`, …) are NOT accepted on `Stack`/`Typography` — put them in `sx`. `Box` is fine. Use `Stack`, `Box` with CSS grid, `Paper`, `Table`, `Chip`, `Tabs`, `Dialog`, `ToggleButtonGroup`, `LinearProgress`, `Alert`, `Tooltip`, `Snackbar` via `useToast`. Icons from `@mui/icons-material/<Name>`.
* **TypeScript strict**, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` (use `import { type X }`). Default-export the page component. Keep each page self-contained in its file (helpers inline).
* **Deep link to a contract**: navigate to `/contracts?open=<document_id>&page=<n>`; the Contracts page opens that contract's dialog on the Seitentext tab at that page.
* **Titles**: `doc.title || doc.filename`. The backend already replaces garbled OCR titles with the filename stem.
* **Contract-set counts for sentences**: "in scope" = documents with `status === 'ready'` and, if a contract type filter is set, matching `contract_type`.
* Actor is hard-coded `legal.reviewer` (no auth yet) — copy says "unter dem Kürzel legal.reviewer", never "mit Ihrem Namen".

## Routes and pages

| Route | File | DE / EN nav |
| --- | --- | --- |
| `/` | `pages/Home.tsx` | Start / Home |
| `/contracts` | `pages/Contracts.tsx` | Verträge / Contracts |
| `/clauses` | `pages/Clauses.tsx` | Klauseln / Clauses |
| `/checks`, `/checks/:id` | `pages/Checks.tsx` | Prüfungen / Checks |
| `/approvals` | `pages/Approvals.tsx` | Freigabe / Approvals |
| `/ask` | `pages/Ask.tsx` | Fragen / Ask |
| `/tech/pipeline` | `pages/Pipeline.tsx` | Pipeline / Pipeline (Technik group): interactive explainer of the three lanes, click-for-details, trace a contract, play |
| `/tech/quality` | `pages/Quality.tsx` | Qualitätsmessung / Quality measurement (Technik group) |
| `/tech/models` | `pages/Models.tsx` | Modelle / Models (Technik group) |

### Home — "Was möchten Sie wissen?" / "What would you like to know?"
* Greeting by time of day (Guten Morgen / Guten Tag / Guten Abend; Good morning / afternoon / evening) and the headline.
* Three question cards, one per audit kind (`AUDIT_QUESTIONS`), each with exactly the one input it needs and a **Prüfen** button: (1) clause select (`CLAUSE_TYPES`, the 12 taxonomy keys from `api.config().taxonomy`; show "(n fehlen)" counts from `api.coverage()` next to each name; remember the last choice in localStorage); (2) passage text field (grows on focus; helper "Der Wortlaut muss nicht exakt stimmen – sinngemäß reicht."); (3) old-name card with the registry hint "arvato Financial Solutions, Arvato Payment Solutions GmbH, AFS → Riverty GmbH" and an optional "Anderer Name" field behind a small link. Optional Vertragsart select applies to all three. Prüfen → `api.createAudit(kind, params, lang)` → `navigate('/checks/' + id)`.
* Strip below: left "Wartet auf Ihre Freigabe" with the pending count (`api.findings('pending')`) and button "Zur Freigabe" (or "Nichts wartet auf Sie." with a check icon); right "Ihr Vertragsbestand": "14 Verträge · 13 gut lesbar · 1 nicht lesbar" (from `legibility`), a `LinearProgress` with "Wir lesen gerade 3 von 14 Verträgen …" while any document is queued/processing (poll every 2 s while so), and a button "Verträge hinzufügen" → `/contracts`.
* "Letzte Prüfungen": the three most recent audits as sentences (kind · scope · counts from `summary.findings` keyed by verdict) with `AUDIT_STATUS` chip, each linking to `/checks/:id`.
* Empty state (no documents): question cards disabled with hint "Zuerst Verträge hinzufügen"; centred card "Noch keine Verträge. Laden Sie PDFs oder Fotos hoch – oder starten Sie mit den 14 Beispielverträgen." with buttons "Verträge hochladen" (→ `/contracts`) and "Beispielverträge laden" (`api.ingestSamples()` then poll).
* `<Tech>`: footer line "KI-Gegenprüfung: verbunden (model id)" / "nicht verbunden".

### Contracts — Verträge / Contracts
* Toolbar: primary "Verträge hochladen (PDF, JPG, PNG)" (hidden multi-file input) and secondary "Beispielverträge laden (14 Verträge, darunter Scans und eine Handschrift)". A drop zone appears while dragging files over the page.
* While any document is queued/processing: banner with determinate `LinearProgress` "Wir lesen gerade x von y Verträgen …"; on completion toast "Alle 14 Verträge sind bereit." with action "Jetzt prüfen" → `/`.
* Table: Vertrag (title, filename in `<Small>`) · Vertragsart (`CONTRACT_TYPES`) · Sprache (`LANGUAGES`) · Form (`INPUT_TYPES`, tooltip for mixed_pdf "z. B. digitaler Vertrag mit eingescannter Unterschriftenseite") · Lesbarkeit (`LegibilityChip`, tooltip "Nicht lesbar = wird in Prüfungen als ungeprüft ausgewiesen") · a shield icon with tooltip `COMMON.suspicious` when `injection_suspected` · Status (`DOC_STATUS`; failed → raw error under `<Details>`). Within `<Tech>` add the per-page extraction chips (`PAGE_METHODS` + %), clause/entity counts.
* Row click → dialog "Vertrag ansehen": title, contract type, language, pages, `<Small>` "Prüfsumme 6b52e1ca" with tooltip `checksum_hint` (full hash inside `<Tech>`). Injection alert in plain words (`COMMON.suspicious_help`); the matched text under `<Details>`. Tabs: **Klauseln** (Nr, Überschrift, Art via `CLAUSE_TYPES`, Seite; click a row to expand the clause text; `<Tech>`: `Reliability` % and `CLAUSE_METHODS` + rule/llm labels), **Genannte Unternehmen** (Name, Rolle via `ENTITY_KINDS` — old name red, current green, others grey — badge "nur historischer Verweis" when `historical`, Seite, Kontext in `<Small>`; `<Tech>`: `ENTITY_METHODS` + match %), **Seitentext** (per page "Seite n" header + a legibility word; `<Tech>`: page method chip + %; text in a pre-wrap box). Reads `?open=<id>&page=<n>` from the URL to open directly on Seitentext scrolled to that page.
* Empty state as on Home.

### Clauses — Klausel-Übersicht / Clause overview
* Subtitle "Welcher Vertrag enthält welche Klausel?" and one sentence: "Die Übersicht entsteht beim Einlesen jedes Vertrags. Ein Strich heißt: Wir haben keine solche Klausel gefunden."
* Filter: Vertragsart select (`CONTRACT_TYPE_KEYS` + all). Switch "Nur Lücken zeigen" (show only rows with at least one gap).
* Matrix: sticky first column (title; `<Small>` type · language), 12 columns headed by `CLAUSE_SHORT` (full name in tooltip) with "fehlt in n" under each header and a small button/menu "Diese Klausel prüfen" → `api.createAudit('missing_clause', {clause_type, contract_type?}, lang)` → navigate to `/checks/:id`. Cells: green check (`confidence ≥ 0.8`), amber ring/"?" (0.5–0.8, tooltip "vorhanden, unsicher"), grey dash (not found — neutral, NOT red: an NDA legitimately lacks most clauses). Tooltip: "Haftungsbegrenzung · „Limitation of Liability“ · Seite 2"; `<Tech>` adds "% via method" and opacity shading. Cell click → deep link to the contract (Seitentext at that page). Legend row under the table.
* Empty state: "Die Übersicht füllt sich, sobald Verträge gelesen sind."

### Checks — Prüfungen / Checks (`/checks` and `/checks/:id`)
* Left column, card "Neue Prüfung": `ToggleButtonGroup` with the three questions (`AUDIT_QUESTIONS`, icons), then only the one field the question needs (clause select with "(n fehlen)" from coverage / passage textarea with the helper / optional old-name field with the registry helper "Leer lassen = alle bekannten alten Namen: …"), optional Vertragsart select, primary button **Prüfung starten**. Location state or `?kind=&clause_type=` may preselect. Below: "Bisherige Prüfungen" list as sentences ("Fehlende Klausel: Haftungsbegrenzung · Händlerverträge", "Alter Firmenname · alle Vertragsarten") with date and `AUDIT_STATUS` chip; selecting navigates to `/checks/:id`. "Erneut prüfen" on a past check refills the form.
* Right column (selected check): running → indeterminate bar "Wir lesen n Verträge … das dauert meist unter einer Minute." (poll 1.5 s). Done → **one summary sentence** built per kind from `summary` (`scope`, `present`, `historical_only`, `unreadable`) and `summary.findings` (counts by verdict: confirmed, unverified, dismissed, unreadable), e.g. "14 Verträge geprüft: 8 nennen noch den alten Firmennamen, 4 sind unauffällig, 1 nennt den alten Namen nur als historischen Verweis, 1 konnte nicht gelesen werden und gilt nicht als geprüft." Then four tiles: auffällig (confirmed + unverified) · unauffällig (present + historical_only + dismissed) · unklar (uncertain) · nicht lesbar; and a chip `verified_yes`/`verified_no` (`<Tech>` adds the verifier model). Failed → "Die Prüfung ist fehlgeschlagen." with the error under `<Details>`. All clear → "Kein Vertrag im Prüfumfang ist auffällig." (+ the unreadable sentence if any).
* Results table: Vertrag · Ergebnis (`VerdictChip` + the sentence from `useFindingSentence`) · Beleg (first quote truncated, "Seite n") · Entscheidung (`ReviewChip`). Dismissed rows are shown (they explain what the AI cleared) but sorted last. Row expand: `EvidenceList`, "Vertrag öffnen" deep link, `Reliability` (`unreadable` when verdict is unreadable), reasoning block labelled `COMMON.reasoning` only when `reasoning` is non-empty, `HowFound`, and — for pending findings — buttons Freigeben / Ablehnen via `DecisionDialog` (refresh after). Unreadable rows say "Seiten konnten nicht zuverlässig gelesen werden. Dieser Vertrag wurde nicht geprüft. Bitte prüfen Sie das Original." with the OCR numbers only under `HowFound`/`<Tech>`.
* A link "Zur Freigabe (n offen)" above the table when pending findings exist.

### Approvals — Freigabe / Approvals
* Header "n Funde warten auf Ihre Entscheidung." and one line "Nichts verlässt das System ohne Ihre Entscheidung. Jede Entscheidung wird unter dem Kürzel legal.reviewer mit Zeitpunkt und Dokument-Prüfsumme protokolliert."
* Tabs: **Offen (n)** · **Entschieden (n)** · **Protokoll**.
* Offen: progress line "Fund 1 von 8" with determinate bar; one card per pending finding (from `api.findings('pending')`, verdict ≠ dismissed): title + `CONTRACT_TYPES`, `AuditKindChip`, `VerdictChip`, the sentence (`useFindingSentence`), `EvidenceList` with "Vertrag öffnen", `Reliability`, reasoning block when present, `HowFound`, collapsed "Protokoll zu diesem Fund" (client-side filter of `api.auditLog()` by `target_type === 'finding' && target_id === id`). Buttons **Freigeben** (contained, success) / **Ablehnen** (outlined) → `DecisionDialog`. After approval, toast with action "Jetzt ablegen" (→ `api.push`). Empty: `EmptyState` "Alles erledigt. Nichts wartet auf Ihre Freigabe." with link "Neue Prüfung starten".
* Entschieden: table Vertrag · Fund · Entscheidung (`ReviewChip` + "legal.reviewer · date time") · Anmerkung · Vertragsablage: button "In der Vertragsablage ablegen" (tooltip `file_hint`) for approved without `storage_ref`, else the `ReviewChip` filed state. Toast `filed_toast` after a push. A small "Entscheidung ändern" opens the dialog again (the backend accepts a second decision).
* Protokoll: entries as sentences via `LOG_ACTIONS` (`actor` "system" → "System"; target resolved to the contract/finding), grouped by day (Heute / Gestern / date), filter chips (Verträge · Prüfungen · Entscheidungen · Ablage). `<Tech>`: raw action key, target_type #id, monospace JSON details, full sha256. Intro "Einträge können nachträglich nicht geändert oder gelöscht werden."

### Ask — Fragen / Ask
* Headline "Fragen Sie Ihre Verträge" / "Ask your contracts". One large field, placeholder "Zum Beispiel: Welche Kündigungsfrist gilt im Inkassovertrag mit Rheinland Energie?", button **Fragen**, Enter sends. Example chips in the UI language (DE: "Welcher Gerichtsstand gilt im Vertrag mit Nordlicht Möbelhaus?", "Welche Kündigungsfrist gilt im Inkassovertrag mit Rheinland Energie?", "Welche Haftungsgrenze gilt im Händlervertrag mit Lumen Retail?"; EN: the equivalents). Last five questions remembered in localStorage. Loading: "Wir suchen in n Verträgen …".
* `api.chat(question, lang)`. Answer card "Antwort" with badge "Antwort mit Belegen (KI)" / "Nur Fundstellen (ohne KI)". **Offline mode**: do NOT render `result.answer` (it is an English backend preamble); show "Ohne KI-Verbindung zeigen wir die passendsten Stellen statt einer Antwort." and the citations as quote cards. Citations: contract title · "Seite n" · quote · "Vertrag öffnen". Collapsed "Weitere gefundene Stellen (n)" with the remaining passages (title, `CLAUSE_TYPES`, page, quote). Footer line: "Jede Aussage stützt sich auf eine zitierte Stelle. Ohne Beleg keine Aussage – bitte prüfen Sie die Fundstelle im Vertrag." `<Tech>`: scores, [index], model mode string.

### Quality — Qualitätsmessung / Quality measurement (Technik)
* Intro: "Das Beispielpaket hat eine Musterlösung: Für jeden Vertrag ist bekannt, welche Klauseln er enthält und wo noch ein alter Name steht. Hier sehen Sie, wie gut jede Stufe trifft." Button **Messung starten** (`api.runEval()`), empty state "Noch keine Messung. Starten Sie eine – sie dauert etwa eine halbe Minute."
* Result shape (from the backend): `{ documents, unreadable: string[], llm_enabled, coverage_matrix: {metrics:{tp,fp,fn,precision,recall,f1}, errors:[{key,error}]}, rename_registry: {same}, extraction: {[input_type]: {pages, methods:{[m]:n}, confidence}}, audits: [{audit_id, kind, params, verified, metrics, errors}], injection: [{id, expected, flagged}] }`. Error keys look like `C07:data_protection`, `error` is `false_positive`/`false_negative`.
* Two cards (Klausel-Übersicht, Namensregister), each with two sentences: "Von den gemeldeten fehlenden Klauseln waren 85 % richtig (7 Fehlalarme)." and "Von den tatsächlich fehlenden Klauseln wurden 100 % gefunden (0 übersehen)." Metrics labelled "Treffergenauigkeit (Precision)" / "Vollständigkeit (Recall)"; F1 and TP/FP/FN only in `<Tech>`. Errors as "C07 · Datenschutz · Fehlalarm" (raw key in `<Tech>`).
* Table "Abgeschlossene Prüfungen" (plain titles, Gegengeprüft ja/nein, the two percentages). Collapsed sections "Lesbarkeit nach Quelle" (`INPUT_TYPES`, pages, average as word + %; `<Tech>`: method counts) and "Erkennung verdächtiger Texte" (id · erwartet/erkannt · richtig/falsch). Line "C14 wurde als nicht lesbar an Sie weitergegeben und zählt nicht als geprüft." when `unreadable` is non-empty.

### Models — Modelle / Models (Technik)
* Status alert: "KI-Gegenprüfung aktiv – alle Stufen laufen." (success) or "Keine KI verbunden – Regelprüfung, Namensregister, Texterkennung und Suche laufen; Funde werden als „nicht gegengeprüft“ gekennzeichnet. Handschrift kann nicht gelesen werden." (warning). Intro: "Der Denkaufwand folgt der Aufgabe: Routinearbeit läuft auf einem schnellen Modell, das große Modell ist für Handschrift und für die Gegenprüfung reserviert."
* Table: Aufgabe (`ROUTING_TASKS`) · Modell (`modelTier(id)` word; the raw id in `<Tech>` monospace) · Denkaufwand (`THINKING` chips) · Zweck (German/English text keyed by task, written in the page dictionary; the API's English `purpose` only in `<Tech>`). Last row: embeddings (`config.embedding.model`, dim in `<Tech>`).

## Adaptive review ("Prüflast") — added later

Backend (`api/app/policy.py`): every finding carries `class_key` (the question asked) and `policy` (why a person did or
did not have to look): `{kind: 'required', reason: 'not_verified' | 'learning', review_rate}`,
`{kind: 'spot_check', review_rate}`, `{kind: 'auto', review_rate}`, or
`{kind: 'carried_over', decision: 'approved' | 'rejected', note, decided_at, finding_id}`. New `review_status`
value **`auto_approved`** (system decision, logged as actor `system`, overturnable with "Entscheidung ändern"; may be
filed like an approved one). Audit summaries carry `review: {required, spot_check, auto_approved, carried_over}` and
`precedents` (number of team decisions with notes that were handed to the verifier).
`GET /api/policy` → `{classes: [{class_key, kind, params, decisions, approved, rejected, since_rejection, agreement,
review_rate, automation_active, findings: {status: n}}], rules: {min_decisions, min_agreement, tiers: [[since, rate]]}}`.

Words: review status auto_approved = „Automatisch freigegeben“ / "Auto-approved"; policy kinds: required →
„Prüfung erforderlich“, spot_check → „Stichprobe“ / "Spot check", auto → „Automatisch freigegeben (Regel)“,
carried_over → „Bereits entschieden am {date}“ / "Already decided on {date}". Review rate → „Prüfquote“; the whole
feature → „Prüflast“ / "Review load"; „Ihre Entscheidungen senken die Prüflast.“

* **Approvals › Offen**: a finding with `policy.kind === 'spot_check'` shows a small chip „Stichprobe“ with tooltip
  „Diese Art von Fund wird nur noch stichprobenartig vorgelegt – Ihre Entscheidung hält die Regel scharf.“ Findings
  with `policy.kind === 'required' && reason === 'not_verified'` show nothing new.
* **Approvals › Entschieden**: auto-approved findings appear with `ReviewChip` (status auto_approved, grey-green,
  icon AutoMode) and „System · {date}“ instead of the reviewer; „Entscheidung ändern“ works on them. Carried-over
  findings show „Bereits entschieden am {date}“ in `<Small>`.
* **Approvals › new tab „Prüflast“** (`/api/policy`): one sentence on top — „Ihre Entscheidungen senken die
  Prüflast: Funde, die Sie wiederholt bestätigt haben, legen wir Ihnen nur noch stichprobenartig vor. Eine Ablehnung
  setzt die Prüfung für diese Art von Fund sofort wieder auf 100 %.“ Then a table per class: Frage (kind + param in
  plain words), Entscheidungen (n, „davon x abgelehnt“), Übereinstimmung (%), Prüfquote (100 % / 20 % / 10 % as a
  chip: 100 % = „Volle Prüfung“, else „Stichprobe {rate}“), Automatisch freigegeben (count of findings with
  status auto_approved), and a `LinearProgress` „{since_rejection} von {next threshold} Entscheidungen bis zur
  nächsten Stufe“. Empty state: „Noch keine Entscheidungen – die Prüfquote liegt bei 100 %.“ `<Tech>`: the raw rules
  (`min_decisions`, `min_agreement`, tiers) and `class_key`.
* **Checks detail**: summary line gets „… {auto_approved} automatisch freigegeben, {spot_check} Stichprobe,
  {carried_over} bereits entschieden“ when `summary.review` has non-zero counts; findings table `ReviewChip` handles
  `auto_approved`; expanded row shows the policy reason in `<Small>` („Stichprobe“ / „Automatisch freigegeben – Prüfquote
  20 %“ / „Bereits entschieden am …: ‚note‘“). `HowFound` already shows the policy step in the raw chain.
* **Home › „Wartet auf Ihre Freigabe“**: second line „{n} Funde wurden automatisch freigegeben“ when > 0 (count from
  `api.findings()` with status auto_approved).
