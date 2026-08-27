import { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import { api, type Audit, type Config, type Doc, type DocDetail, type Finding, type PolicyReport } from '../api'
import { useSettings, useT } from '../i18n'
import { Small } from '../components/tech'
import { usePolling } from '../components/ui'
import { AUDIT_KINDS, CLAUSE_TYPES, POLICY, THINKING, VERDICTS, REVIEW_STATUS } from '../vocab'

// ---------------------------------------------------------------- the diagram
type Lane = 'ingest' | 'audit' | 'ask'
type Kind = 'rule' | 'model' | 'human' | 'store'
type Stage = { id: string; lane: Lane; col: number; row: number; kind: Kind; task?: string; code: string }

const STAGES: Stage[] = [
  { id: 'source', lane: 'ingest', col: 0, row: 0, kind: 'store', code: 'api/app/ingest/pipeline.py' },
  { id: 'route', lane: 'ingest', col: 1, row: 0, kind: 'rule', code: 'api/app/ingest/loader.py' },
  { id: 'text', lane: 'ingest', col: 2, row: 0, kind: 'rule', code: 'api/app/ingest/loader.py' },
  { id: 'ocr', lane: 'ingest', col: 2, row: 1, kind: 'rule', code: 'api/app/ingest/ocr.py' },
  { id: 'gate', lane: 'ingest', col: 3, row: 1, kind: 'rule', code: 'api/app/ingest/ocr.py' },
  { id: 'vision', lane: 'ingest', col: 4, row: 1, kind: 'model', task: 'ocr_vision', code: 'api/app/ingest/ocr.py' },
  { id: 'screen', lane: 'ingest', col: 5, row: 0, kind: 'model', task: 'screen', code: 'api/app/ingest/screen.py' },
  { id: 'segment', lane: 'ingest', col: 6, row: 0, kind: 'rule', code: 'api/app/ingest/segment.py' },
  { id: 'classify', lane: 'ingest', col: 7, row: 0, kind: 'model', task: 'classify', code: 'api/app/ingest/classify.py' },
  { id: 'entities', lane: 'ingest', col: 8, row: 0, kind: 'model', task: 'extract', code: 'api/app/ingest/entities.py' },
  { id: 'embed', lane: 'ingest', col: 9, row: 0, kind: 'model', task: 'embeddings', code: 'api/app/ingest/embed.py' },
  { id: 'store', lane: 'ingest', col: 10, row: 0, kind: 'store', code: 'api/app/models.py' },
  { id: 'question', lane: 'audit', col: 0, row: 0, kind: 'human', code: 'api/app/routers.py' },
  { id: 'plan', lane: 'audit', col: 1, row: 0, kind: 'rule', code: 'api/app/audits/graph.py' },
  { id: 'deterministic', lane: 'audit', col: 2, row: 0, kind: 'rule', code: 'api/app/audits/graph.py' },
  { id: 'verify', lane: 'audit', col: 4, row: 0, kind: 'model', task: 'verify', code: 'api/app/audits/verify.py' },
  { id: 'policy', lane: 'audit', col: 6, row: 0, kind: 'rule', code: 'api/app/policy.py' },
  { id: 'review', lane: 'audit', col: 8, row: 0, kind: 'human', code: 'api/app/routers.py' },
  { id: 'file', lane: 'audit', col: 10, row: 0, kind: 'store', code: 'api/app/routers.py' },
  { id: 'ask', lane: 'ask', col: 0, row: 0, kind: 'human', code: 'api/app/chat.py' },
  { id: 'scope', lane: 'ask', col: 2, row: 0, kind: 'rule', code: 'api/app/chat.py' },
  { id: 'retrieve', lane: 'ask', col: 4, row: 0, kind: 'rule', code: 'api/app/retrieval.py' },
  { id: 'answer', lane: 'ask', col: 6, row: 0, kind: 'model', task: 'answer', code: 'api/app/chat.py' },
]
const EDGES: [string, string][] = [
  ['source', 'route'], ['route', 'text'], ['route', 'ocr'], ['ocr', 'gate'], ['gate', 'vision'], ['text', 'screen'],
  ['gate', 'screen'], ['vision', 'screen'], ['screen', 'segment'], ['segment', 'classify'], ['classify', 'entities'],
  ['entities', 'embed'], ['embed', 'store'],
  ['question', 'plan'], ['plan', 'deterministic'], ['deterministic', 'verify'], ['verify', 'policy'], ['policy', 'review'],
  ['review', 'file'], ['review', 'verify'],
  ['ask', 'scope'], ['scope', 'retrieve'], ['retrieve', 'answer'],
]
const PLAY_ORDER = ['source', 'route', 'ocr', 'gate', 'vision', 'screen', 'segment', 'classify', 'entities', 'embed', 'store',
  'question', 'plan', 'deterministic', 'verify', 'policy', 'review', 'file']

const NODE_W = 118
const NODE_H = 40
const COL_W = 134
const ROW_H = 64
const LANE_Y: Record<Lane, number> = { ingest: 56, audit: 236, ask: 346 }
const WIDTH = 40 + 11 * COL_W
const HEIGHT = 420
const KIND_COLOR: Record<Kind, string> = { rule: '#00695c', model: '#6a1b9a', human: '#2e7d32', store: '#546e7a' }

const pos = (s: Stage) => ({ x: 40 + s.col * COL_W, y: LANE_Y[s.lane] + s.row * ROW_H })
const byId = Object.fromEntries(STAGES.map((s) => [s.id, s])) as Record<string, Stage>

function edgePath(a: Stage, b: Stage): string {
  const pa = pos(a)
  const pb = pos(b)
  if (a.id === 'review' && b.id === 'verify') {
    // feedback loop: decisions become precedents for the next verification
    const x1 = pa.x + NODE_W / 2
    const x2 = pb.x + NODE_W / 2
    const y = pa.y + NODE_H + 22
    return `M ${x1} ${pa.y + NODE_H} V ${y} H ${x2} V ${pb.y + NODE_H}`
  }
  const x1 = pa.x + NODE_W
  const y1 = pa.y + NODE_H / 2
  const x2 = pb.x
  const y2 = pb.y + NODE_H / 2
  if (y1 === y2) return `M ${x1} ${y1} H ${x2}`
  const xm = x1 + (x2 - x1) / 2
  return `M ${x1} ${y1} H ${xm} V ${y2} H ${x2}`
}

// ---------------------------------------------------------------- words
const T = {
  title: { de: 'So arbeitet die Pipeline', en: 'How the pipeline works' },
  intro: { de: 'Drei Wege durch das System: Verträge einlesen, Prüfungen laufen lassen, Fragen stellen. Klicken Sie auf einen Schritt für Details und Live-Zahlen, oder verfolgen Sie einen einzelnen Vertrag.', en: 'Three paths through the system: reading contracts, running checks, asking questions. Click a step for details and live numbers, or trace a single contract.' },
  lane_ingest: { de: 'Einlesen', en: 'Reading' },
  lane_audit: { de: 'Prüfung', en: 'Check' },
  lane_ask: { de: 'Fragen', en: 'Ask' },
  kind_rule: { de: 'Regel / Algorithmus', en: 'Rule / algorithm' },
  kind_model: { de: 'KI-Modell', en: 'AI model' },
  kind_human: { de: 'Mensch', en: 'Person' },
  kind_store: { de: 'Ablage', en: 'Storage' },
  trace: { de: 'Vertrag verfolgen', en: 'Trace a contract' },
  trace_none: { de: 'Kein Vertrag', en: 'None' },
  play: { de: 'Abspielen', en: 'Play' },
  stop: { de: 'Stopp', en: 'Stop' },
  pick: { de: 'Wählen Sie einen Schritt im Diagramm.', en: 'Pick a step in the diagram.' },
  what: { de: 'Was passiert', en: 'What happens' },
  rules: { de: 'Regeln und Schwellen', en: 'Rules and thresholds' },
  model: { de: 'Modell', en: 'Model' },
  effort: { de: 'Denkaufwand', en: 'Effort' },
  code: { de: 'Code', en: 'Code' },
  live: { de: 'Live im System', en: 'Live in the system' },
  for_doc: { de: 'Für {title}', en: 'For {title}' },
  offline_model: { de: 'ohne Schlüssel: dieser Schritt entfällt, der Regelanteil läuft weiter', en: 'without a key: this step is skipped, the rule part keeps running' },
  feedback: { de: 'Entscheidungen fließen als Präzedenzfälle in die nächste Gegenprüfung zurück', en: 'decisions flow back as precedents into the next cross-check' },
  n_docs: { de: 'Verträge', en: 'contracts' },
  n_pages: { de: 'Seiten', en: 'pages' },
  n_text: { de: 'direkt aus der Textebene gelesen', en: 'read directly from the text layer' },
  n_ocr: { de: 'per Texterkennung gelesen', en: 'read by text recognition' },
  n_vision: { de: 'vom Bildmodell gelesen', en: 'read by the vision model' },
  n_escalated: { de: 'Seiten eskaliert', en: 'pages escalated' },
  n_injection: { de: 'Verträge mit verdächtigem Text', en: 'contracts with suspicious text' },
  n_clauses: { de: 'Klauseln', en: 'clauses' },
  n_entities: { de: 'erkannte Namen', en: 'names recognised' },
  n_cells: { de: 'Klauseln in der Übersicht', en: 'clauses in the overview' },
  n_audits: { de: 'Prüfungen', en: 'checks' },
  n_scope: { de: 'Verträge im letzten Prüfumfang', en: 'contracts in the last check' },
  n_claims: { de: 'Meldungen der Regelprüfung (letzte Prüfung)', en: 'claims from the rule check (last check)' },
  n_verified: { de: 'gegengeprüft', en: 'cross-checked' },
  n_precedents: { de: 'Präzedenzfälle im Prompt', en: 'precedents in the prompt' },
  n_auto: { de: 'automatisch freigegeben', en: 'auto-approved' },
  n_spot: { de: 'Stichproben', en: 'spot checks' },
  n_carried: { de: 'bereits entschieden', en: 'already decided' },
  n_pending: { de: 'warten auf Entscheidung', en: 'awaiting a decision' },
  n_decided: { de: 'von Menschen entschieden', en: 'decided by people' },
  n_filed: { de: 'in der Vertragsablage', en: 'in contract storage' },
  n_rate: { de: 'Prüfquote {cls}', en: 'review rate {cls}' },
  d_page: { de: 'Seite {n}: {method}, {conf} %', en: 'Page {n}: {method}, {conf}%' },
  d_input: { de: 'Form: {t}', en: 'Form: {t}' },
  d_checksum: { de: 'Prüfsumme {sha}', en: 'Checksum {sha}' },
  d_clauses: { de: '{n} Klauseln, davon {k} Standardtypen', en: '{n} clauses, {k} of the standard types' },
  d_entities: { de: '{n} Namen, davon {old} alte Riverty-Namen', en: '{n} names, {old} old Riverty names' },
  d_injection_yes: { de: 'Verdächtiger Text erkannt', en: 'Suspicious text detected' },
  d_injection_no: { de: 'Kein verdächtiger Text', en: 'No suspicious text' },
  d_finding: { de: '{kind}: {verdict} · {status}', en: '{kind}: {verdict} · {status}' },
  d_no_findings: { de: 'Keine Funde zu diesem Vertrag', en: 'No findings for this contract' },
  m_text_layer: { de: 'Textebene', en: 'text layer' },
  m_tesseract: { de: 'Texterkennung', en: 'text recognition' },
  m_vision_llm: { de: 'Bildmodell', en: 'vision model' },
  method_text_layer: { de: 'Textebene', en: 'text layer' },
  method_tesseract: { de: 'Tesseract', en: 'Tesseract' },
  method_vision_llm: { de: 'KI-Bilderkennung', en: 'AI image reading' },
} as const

// Per stage: label (on the node), purpose (one plain sentence), how (bullets, "\n"-separated), rules (short).
const STAGE_TEXT: Record<string, { label: { de: string; en: string }; purpose: { de: string; en: string }; how: { de: string; en: string }; rules?: { de: string; en: string } }> = {
  source: {
    label: { de: 'Dokument', en: 'Document' },
    purpose: { de: 'Ein Vertrag kommt als PDF oder Foto an – aus SharePoint oder per Upload.', en: 'A contract arrives as PDF or photo – from SharePoint or by upload.' },
    how: { de: 'SHA-256-Prüfsumme der Datei als eindeutiger Fingerabdruck\nDieselbe Datei wird nie zweimal eingelesen (idempotent)\nJeder Einlesevorgang landet im Protokoll', en: 'SHA-256 checksum of the file as unique fingerprint\nThe same file is never read twice (idempotent)\nEvery ingest is written to the activity log' },
  },
  route: {
    label: { de: 'Seiten-Routing', en: 'Page routing' },
    purpose: { de: 'Jede Seite wird danach behandelt, was sie ist – nicht nach der Dateiendung.', en: 'Every page is treated by what it is – not by file extension.' },
    how: { de: 'Seite mit brauchbarer Textebene → direkt lesen (exakt, kostenlos)\nSeite ohne Textebene → eingebettetes Scanbild in Originalauflösung → Texterkennung\nDeshalb funktioniert ein digitaler Vertrag mit eingescannter Unterschriftenseite', en: 'Page with a usable text layer → read directly (exact, free)\nPage without one → embedded scan at native resolution → text recognition\nThat is why a digital contract with a scanned signature page works' },
    rules: { de: 'Textebene gilt ab 40 Zeichen', en: 'Text layer counts from 40 characters' },
  },
  text: {
    label: { de: 'Textebene', en: 'Text layer' },
    purpose: { de: 'Digitale PDFs liefern ihren Text selbst.', en: 'Digital PDFs provide their own text.' },
    how: { de: 'PyMuPDF liest den Text der Seite\nVerlässlichkeit 100 %, kein Modell nötig\nAuch verstecktes Weiß-auf-Weiß landet im Text – wichtig für die Erkennung verdächtiger Anweisungen', en: 'PyMuPDF reads the page text\n100% reliable, no model needed\nHidden white-on-white text lands in the text too – important for the suspicious-text screen' },
  },
  ocr: {
    label: { de: 'Texterkennung', en: 'Text recognition' },
    purpose: { de: 'Scans werden lokal mit Tesseract gelesen – die Daten verlassen den Rechner nicht.', en: 'Scans are read locally with Tesseract – data does not leave the machine.' },
    how: { de: 'Graustufen zuerst (auf Farbbildern liefert Tesseract sonst nichts)\nWortweise Konfidenz aus Tesseract\nZusätzlich: Abdeckungsprüfung – jede Seitenzone mit Tinte muss Wörter geliefert haben', en: 'Grayscale first (Tesseract returns nothing on colour input)\nWord-level confidence from Tesseract\nPlus a coverage check – every inked band of the page must have produced words' },
    rules: { de: 'eng + deu Sprachpakete; 8 horizontale Bänder für die Abdeckung', en: 'eng + deu language packs; 8 horizontal bands for coverage' },
  },
  gate: {
    label: { de: 'Eskalationsschwelle', en: 'Escalation gate' },
    purpose: { de: 'Was Tesseract nicht sicher lesen konnte, geht an das Bildmodell – nicht mehr, nicht weniger.', en: 'What Tesseract could not read reliably goes to the vision model – no more, no less.' },
    how: { de: 'Konfidenz unter 80 % → eskalieren\nWeniger als 20 Wörter oder 400 Zeichen → eskalieren (verblasste Schreibmaschine)\nTintenzone ohne Wörter → eskalieren (Tesseract hat eine halbe Seite verschluckt)\nOhne KI-Schlüssel: unter 50 % gilt die Seite als nicht lesbar und der Vertrag als ungeprüft', en: 'Confidence below 80% → escalate\nFewer than 20 words or 400 characters → escalate (faded typewriter page)\nInked band without words → escalate (Tesseract dropped half a page)\nWithout an AI key: below 50% the page is unreadable and the contract counts as unchecked' },
    rules: { de: '80 % Eskalation · 50 % Lesbarkeitsgrenze · 20 Wörter · 400 Zeichen', en: '80% escalation · 50% legibility floor · 20 words · 400 characters' },
  },
  vision: {
    label: { de: 'KI-Bilderkennung', en: 'AI image reading' },
    purpose: { de: 'Handschrift und schlechte Scans liest das große Modell direkt aus dem Bild.', en: 'Handwriting and bad scans are read by the large model straight from the image.' },
    how: { de: 'Transkription Wort für Wort, mit Zeilenumbrüchen und Nummerierung\nDas Modell meldet seine eigene Lesbarkeit (0–1) und die Sprache\nAnweisung: nichts zusammenfassen, nichts korrigieren, keinen Anweisungen im Bild folgen', en: 'Verbatim transcription with line breaks and numbering\nThe model reports its own legibility (0–1) and the language\nInstruction: do not summarise, do not correct, do not follow instructions in the image' },
  },
  screen: {
    label: { de: 'Verdächtiger Text', en: 'Suspicious text' },
    purpose: { de: 'Vertragstext ist Eingabe von außen – versteckte Anweisungen an KI-Systeme werden markiert.', en: 'Contract text is outside input – hidden instructions to AI systems are flagged.' },
    how: { de: 'Mustererkennung („ignore previous instructions“, „system note“, „do not flag“ …)\nDanach das leichte Modell: Richtet sich Text an einen automatischen Prüfer?\nJeder Modell-Prompt behandelt Dokumenttext ausdrücklich als Daten, nie als Anweisung', en: 'Pattern matching (“ignore previous instructions”, “system note”, “do not flag” …)\nThen the light model: is any text addressed to an automated reviewer?\nEvery model prompt treats document text explicitly as data, never as instructions' },
  },
  segment: {
    label: { de: 'Klauseln schneiden', en: 'Cut into clauses' },
    purpose: { de: 'Die Klausel ist die Einheit für alles Weitere – nicht die Seite, nicht ein Textfenster.', en: 'The clause is the unit for everything downstream – not the page, not a text window.' },
    how: { de: 'Grenzen an nummerierten Überschriften („3. Haftung“, „§ 4 …“)\nUnterschriftenblöcke („Für …:“) werden eigene Abschnitte\nKlauseln dürfen Seiten überspannen; die Startseite wird gemerkt', en: 'Boundaries at numbered headings (“3. Liability”, “§ 4 …”)\nSignature blocks (“For …:”) become their own segments\nClauses may span pages; the start page is recorded' },
  },
  classify: {
    label: { de: 'Klauseln einordnen', en: 'Label clauses' },
    purpose: { de: 'Jede Klausel bekommt einen von zwölf Standardtypen – daraus entsteht die Klausel-Übersicht.', en: 'Every clause gets one of twelve standard types – that becomes the clause overview.' },
    how: { de: 'Regelprüfung zuerst: Schlüsselwörter in Überschrift (dreifach gewichtet) und Text, Deutsch und Englisch\nDann das schnelle Modell mit denselben Klauseln\nEinigkeit erhöht die Verlässlichkeit, Widerspruch senkt sie und wird gespeichert', en: 'Rule check first: keywords in heading (triple weight) and body, German and English\nThen the fast model on the same clauses\nAgreement raises reliability, disagreement lowers it and is recorded' },
    rules: { de: 'Zwölf Typen: Laufzeit, Vergütung, Haftung, Vertraulichkeit, Datenschutz, Recht, Gerichtsstand, Höhere Gewalt, Abtretung, Audit, Antikorruption, Kontrollwechsel', en: 'Twelve types: term, fees, liability, confidentiality, data protection, law, disputes, force majeure, assignment, audit, anti-corruption, change of control' },
  },
  entities: {
    label: { de: 'Namensregister', en: 'Name registry' },
    purpose: { de: 'Der alte Firmenname ist ein Namensproblem, keine Textsuche.', en: 'The old company name is a name problem, not a text search.' },
    how: { de: 'Register bekannter Namen mit Rolle: alter Riverty-Name, aktueller Name, Vertragspartner, anderes Unternehmen (Arvato Systems)\n„vormals / formerly“ davor → historischer Verweis, kein Handlungsbedarf\nAuf OCR-Seiten zusätzlich Schreibvarianten-Abgleich („Arvate Payment Solutions:“)\nDas schnelle Modell ergänzt Parteien, Titel und Vertragsart', en: 'Registry of known names with a role: old Riverty name, current name, counterparty, unrelated company (Arvato Systems)\n“formerly / vormals” before it → historical reference, no action\nOn OCR pages an additional near-match (“Arvate Payment Solutions:”)\nThe fast model adds parties, title and contract type' },
    rules: { de: 'Schreibvariante ab 80 % Ähnlichkeit, nur mehrteilige Namen', en: 'Near match from 80% similarity, multi-word names only' },
  },
  embed: {
    label: { de: 'Einbettungen', en: 'Embeddings' },
    purpose: { de: 'Jede Klausel wird als Vektor abgelegt, damit sinngemäße Suche möglich ist.', en: 'Every clause is stored as a vector so search by meaning works.' },
    how: { de: 'gemini-embedding-001 mit 768 Dimensionen in pgvector\nZusätzlich Volltext-Index mit deutscher und englischer Wortstammbildung\nOhne Schlüssel: deterministischer Hash-Vektor, die Volltextsuche trägt', en: 'gemini-embedding-001 with 768 dimensions in pgvector\nPlus a full-text index with German and English stemming\nWithout a key: deterministic hash vector, full-text search carries' },
  },
  store: {
    label: { de: 'Datenbank', en: 'Database' },
    purpose: { de: 'PostgreSQL hält alles, was die Prüfungen brauchen – schon bevor eine Frage gestellt wird.', en: 'PostgreSQL holds everything the checks need – before any question is asked.' },
    how: { de: 'Seiten mit Lesemethode und Konfidenz, Klauseln mit Typ und Verlässlichkeit, Namen mit Rolle\nDie Klausel-Übersicht ist damit ein Nachschlagen, keine Suche\nProtokoll: nur anhängen, nie ändern', en: 'Pages with reading method and confidence, clauses with type and reliability, names with role\nThe clause overview is therefore a lookup, not a search\nActivity log: append only, never edit' },
  },
  question: {
    label: { de: 'Frage', en: 'Question' },
    purpose: { de: 'Drei Fragen der Rechtsabteilung: fehlende Klausel, fehlende Regelung, alter Firmenname.', en: 'Three questions from Legal: missing clause, missing passage, old company name.' },
    how: { de: 'Eingrenzung auf eine Vertragsart möglich\nDie Sprache der Oberfläche geht mit – Begründungen kommen auf Deutsch zurück\nDie Prüfung läuft im Hintergrund, meist unter einer Minute', en: 'Can be limited to a contract type\nThe interface language travels along – reasoning comes back in German\nThe check runs in the background, usually under a minute' },
  },
  plan: {
    label: { de: 'Prüfumfang', en: 'Scope' },
    purpose: { de: 'Welche Verträge werden geprüft – und welche können es nicht?', en: 'Which contracts are checked – and which cannot be?' },
    how: { de: 'Alle fertig gelesenen Verträge, optional nach Vertragsart\nVerträge mit unlesbaren Seiten werden ausdrücklich als „nicht lesbar“ gemeldet, nie stillschweigend als unauffällig', en: 'All fully read contracts, optionally by contract type\nContracts with unreadable pages are reported explicitly as “unreadable”, never silently as fine' },
  },
  deterministic: {
    label: { de: 'Regelprüfung', en: 'Rule check' },
    purpose: { de: 'Die Antwort kommt zuerst aus Daten, nicht aus einem Modell.', en: 'The answer comes from data first, not from a model.' },
    how: { de: 'Fehlende Klausel: Nachschlagen in der Klausel-Übersicht – kein Eintrag heißt: nicht gefunden\nFehlende Regelung: ähnlichste Klausel je Vertrag per Vektor- und Volltextsuche, zwei Schwellen\nAlter Firmenname: aktive Nennungen aus dem Namensregister, historische Verweise ausgenommen\nJede Meldung trägt Beleg, Seite, Verlässlichkeit und ihren Entstehungsweg', en: 'Missing clause: lookup in the clause overview – no entry means: not found\nMissing passage: closest clause per contract via vector and full-text search, two thresholds\nOld company name: active mentions from the name registry, historical references excluded\nEvery claim carries evidence, page, reliability and how it was produced' },
    rules: { de: 'Ähnlichkeit ≥ 0,75 vorhanden · ≤ 0,60 fehlt · dazwischen unklar · Klauseltyp ab 90 % sicher', en: 'Similarity ≥ 0.75 present · ≤ 0.60 missing · in between uncertain · clause type certain from 90%' },
  },
  verify: {
    label: { de: 'KI-Gegenprüfung', en: 'AI cross-check' },
    purpose: { de: 'Ein unabhängiges Modell liest den ganzen Vertrag und urteilt über jede Meldung.', en: 'An independent model reads the whole contract and rules on every claim.' },
    how: { de: 'Der komplette Vertragstext, nicht nur Suchtreffer – Suche kann übersehen, der Volltext nicht\nUrteil: bestätigt, entkräftet oder teilweise (Regelung vorhanden, aber enger)\nZitat mit Seitenzahl ist Pflicht; Begründung in der Sprache der Oberfläche\nPräzedenzfälle: die letzten Entscheidungen der Rechtsabteilung mit Anmerkung stehen im Prompt\nBereits entschiedene Funde werden nicht erneut gegengeprüft', en: 'The complete contract text, not just search hits – search can miss, the full text cannot\nVerdict: confirmed, refuted or partial (a provision exists but is narrower)\nA quote with page number is mandatory; reasoning in the interface language\nPrecedents: the team’s latest decisions with notes are in the prompt\nAlready decided findings are not verified again' },
    rules: { de: 'Klauseltypen ab 90 % Verlässlichkeit werden nicht erneut geprüft', en: 'Clause types at 90%+ reliability are not re-checked' },
  },
  policy: {
    label: { de: 'Prüfpolitik', en: 'Review policy' },
    purpose: { de: 'Wer muss hinschauen? Die Prüflast sinkt, wenn die Rechtsabteilung dem System wiederholt zustimmt.', en: 'Who has to look? The review load falls as Legal repeatedly agrees with the system.' },
    how: { de: 'Jede Fundart beginnt bei 100 % Prüfung\nNach 8 übereinstimmenden Entscheidungen: 20 % Stichprobe, ab 24: 10 % – der Rest wird automatisch freigegeben\nNur KI-bestätigte Funde, mindestens eine Stichprobe pro Prüfung, deterministische Auswahl\nEine Ablehnung setzt die Fundart auf 100 % zurück\nBereits entschiedene Verträge werden übernommen, nie erneut vorgelegt', en: 'Every finding class starts at 100% review\nAfter 8 agreeing decisions: 20% spot check, from 24: 10% – the rest is auto-approved\nOnly AI-confirmed findings, at least one spot check per run, deterministic selection\nA rejection resets the class to 100%\nAlready decided contracts are carried over, never re-queued' },
    rules: { de: '8 Entscheidungen · 95 % Übereinstimmung · 20 % / 10 % Stichprobe', en: '8 decisions · 95% agreement · 20% / 10% spot check' },
  },
  review: {
    label: { de: 'Freigabe', en: 'Approval' },
    purpose: { de: 'Nichts verlässt das System ohne eine Person – auch eine automatische Freigabe bleibt änderbar.', en: 'Nothing leaves the system without a person – even an auto-approval stays changeable.' },
    how: { de: 'Freigeben oder Ablehnen mit Anmerkung\nJede Entscheidung wird mit Kürzel, Zeit und Dokument-Prüfsumme protokolliert\nAnmerkungen werden zu Präzedenzfällen für die nächste Gegenprüfung', en: 'Approve or reject with a note\nEvery decision is logged with reviewer, time and document checksum\nNotes become precedents for the next cross-check' },
  },
  file: {
    label: { de: 'Vertragsablage', en: 'Contract storage' },
    purpose: { de: 'Freigegebene Funde werden als rechtskonforme Kopie abgelegt.', en: 'Approved findings are filed as a compliant copy.' },
    how: { de: 'REST-Aufruf mit Idempotenz-Schlüssel – ein zweiter Klick legt keine Kopie an\nAblagenummer bleibt am Fund sichtbar\nAlles steht im Protokoll', en: 'REST call with an idempotency key – filing twice creates no copy\nThe storage reference stays visible on the finding\nEverything is in the activity log' },
  },
  ask: {
    label: { de: 'Frage', en: 'Question' },
    purpose: { de: 'Eine Frage in ganzen Sätzen, auf Deutsch oder Englisch.', en: 'A question in full sentences, in German or English.' },
    how: { de: 'Beispielfragen und Verlauf\nDie Antwortsprache folgt der Oberfläche', en: 'Example questions and history\nThe answer language follows the interface' },
  },
  scope: {
    label: { de: 'Eingrenzung', en: 'Scoping' },
    purpose: { de: 'Nennt die Frage einen Vertragspartner, wird nur in diesem Vertrag gesucht.', en: 'If the question names a counterparty, only that contract is searched.' },
    how: { de: 'Großgeschriebene Wörter der Frage gegen die Namen im Register\nOhne Eingrenzung: alle Verträge\nSo bekommt „Nordlicht“ die Schiedsklausel aus Frankfurt und nicht den Gerichtsstand eines anderen Vertrags', en: 'Capitalised words of the question against the names in the registry\nWithout scoping: all contracts\nThat is how “Nordlicht” gets its Frankfurt arbitration clause and not another contract’s court' },
  },
  retrieve: {
    label: { de: 'Hybride Suche', en: 'Hybrid search' },
    purpose: { de: 'Vektor- und Volltextsuche zusammen, damit weder Sinn noch Wortlaut verloren gehen.', en: 'Vector and full-text search together, so neither meaning nor wording is lost.' },
    how: { de: 'Top-25 per Vektorähnlichkeit und Top-25 per Volltext (deutsch + englisch gestemmt)\nVerschmelzung per Reciprocal Rank Fusion\nAcht Klauseln gehen an das Modell', en: 'Top-25 by vector similarity and top-25 by full text (German + English stemming)\nMerged with reciprocal rank fusion\nEight clauses go to the model' },
  },
  answer: {
    label: { de: 'Antwort mit Belegen', en: 'Cited answer' },
    purpose: { de: 'Jede Aussage muss eine zitierte Stelle haben – ohne Beleg keine Aussage.', en: 'Every statement must cite a passage – no evidence, no statement.' },
    how: { de: 'Das schnelle Modell antwortet nur aus den acht Klauseln\nZitate mit Vertrag und Seite; „Vertrag öffnen“ springt zur Stelle\nOhne Schlüssel: nur die passendsten Stellen, keine formulierte Antwort', en: 'The fast model answers only from the eight clauses\nCitations with contract and page; “Open contract” jumps to the spot\nWithout a key: only the best passages, no written answer' },
  },
}

// ---------------------------------------------------------------- page
export default function Pipeline() {
  const t = useT(T)
  const { lang } = useSettings()
  const { data: config } = usePolling(api.config, 0, () => false)
  const { data: docs } = usePolling(api.documents, 0, () => false)
  const { data: audits } = usePolling(api.audits, 0, () => false)
  const { data: findings } = usePolling(() => api.findings(), 0, () => false)
  const { data: policy } = usePolling(api.policy, 0, () => false)
  const [selected, setSelected] = useState<string>('route')
  const [traceId, setTraceId] = useState<number | ''>('')
  const [trace, setTrace] = useState<DocDetail | null>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (traceId === '') return setTrace(null)
    let cancelled = false
    api.document(traceId).then((d) => !cancelled && setTrace(d))
    return () => {
      cancelled = true
    }
  }, [traceId])

  useEffect(() => {
    if (!playing) return
    let i = 0
    setSelected(PLAY_ORDER[0])
    const id = setInterval(() => {
      i += 1
      if (i >= PLAY_ORDER.length) return setPlaying(false)
      setSelected(PLAY_ORDER[i])
    }, 1400)
    return () => clearInterval(id)
  }, [playing])

  const traced = useMemo(() => tracePath(trace, findings ?? []), [trace, findings])
  const stage = byId[selected]
  const text = STAGE_TEXT[selected]
  const routing = config?.routing.find((r) => r.task === stage?.task)
  const live = useMemo(() => liveNumbers(selected, docs, audits, findings, policy, config, t), [selected, docs, audits, findings, policy, config, t])
  const docLines = useMemo(() => traceLines(selected, trace, findings ?? [], t, lang), [selected, trace, findings, t, lang])

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          {t('title')}
        </Typography>
        <TextField select size="small" label={t('trace')} value={traceId} onChange={(e) => setTraceId(e.target.value === '' ? '' : Number(e.target.value))} sx={{ minWidth: 300 }}>
          <MenuItem value="">{t('trace_none')}</MenuItem>
          {(docs ?? []).filter((d) => d.status === 'ready').map((d) => (
            <MenuItem key={d.id} value={d.id}>
              {d.title || d.filename}
            </MenuItem>
          ))}
        </TextField>
        <Button variant={playing ? 'outlined' : 'contained'} startIcon={playing ? <StopIcon /> : <PlayArrowIcon />} onClick={() => setPlaying(!playing)}>
          {playing ? t('stop') : t('play')}
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary">
        {t('intro')}
      </Typography>

      <Paper sx={{ p: 1, overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ display: 'block', width: '100%', minWidth: 980, height: 'auto', fontFamily: 'Roboto, Helvetica, Arial, sans-serif' }} role="img" aria-label={t('title')}>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#90a4ae" />
            </marker>
            <marker id="arrow-hi" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#00695c" />
            </marker>
          </defs>
          {(['ingest', 'audit', 'ask'] as Lane[]).map((lane) => (
            <g key={lane}>
              <text x={40} y={LANE_Y[lane] - 16} fontSize={13} fontWeight={600} fill="#37474f">
                {t(`lane_${lane}` as keyof typeof T)}
              </text>
              <line x1={40} x2={WIDTH - 40} y1={LANE_Y[lane] - 10} y2={LANE_Y[lane] - 10} stroke="#e3e7e7" />
            </g>
          ))}
          {EDGES.map(([a, b]) => {
            const hi = traced.has(a) && traced.has(b)
            const feedback = a === 'review' && b === 'verify'
            return (
              <path
                key={`${a}-${b}`}
                d={edgePath(byId[a], byId[b])}
                fill="none"
                stroke={hi ? '#00695c' : '#90a4ae'}
                strokeWidth={hi ? 2.5 : 1.5}
                strokeDasharray={feedback ? '5 4' : undefined}
                markerEnd={`url(#${hi ? 'arrow-hi' : 'arrow'})`}
              />
            )
          })}
          <text x={pos(byId.verify).x + NODE_W / 2 + 150} y={pos(byId.review).y + NODE_H + 36} fontSize={11} fill="#546e7a" textAnchor="middle">
            {t('feedback')}
          </text>
          {STAGES.map((s) => {
            const p = pos(s)
            const isSel = s.id === selected
            const onPath = traced.has(s.id)
            const dim = trace !== null && !onPath
            return (
              <g key={s.id} transform={`translate(${p.x},${p.y})`} style={{ cursor: 'pointer' }} onClick={() => setSelected(s.id)} data-testid={`stage-${s.id}`} opacity={dim ? 0.35 : 1}>
                <rect width={NODE_W} height={NODE_H} rx={8} fill={isSel ? KIND_COLOR[s.kind] : '#ffffff'} stroke={KIND_COLOR[s.kind]} strokeWidth={isSel ? 2.5 : onPath ? 2.5 : 1.5}>
                  {isSel && playing && <animate attributeName="stroke-width" values="2.5;5;2.5" dur="1.4s" repeatCount="indefinite" />}
                </rect>
                <text x={NODE_W / 2} y={NODE_H / 2 + 4} fontSize={12} textAnchor="middle" fill={isSel ? '#ffffff' : '#263238'} fontWeight={isSel ? 600 : 500}>
                  {STAGE_TEXT[s.id].label[lang]}
                </text>
              </g>
            )
          })}
        </svg>
        <Stack direction="row" spacing={2} sx={{ px: 2, pb: 1, flexWrap: 'wrap' }}>
          {(['rule', 'model', 'human', 'store'] as Kind[]).map((k) => (
            <Stack key={k} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
              <Box sx={{ width: 14, height: 14, borderRadius: 1, border: `2px solid ${KIND_COLOR[k]}` }} />
              <Small>{t(`kind_${k}` as keyof typeof T)}</Small>
            </Stack>
          ))}
        </Stack>
      </Paper>

      {stage && text ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '3fr 2fr' }, gap: 2 }}>
          <Paper sx={{ p: 2.5 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: KIND_COLOR[stage.kind] }} />
              <Typography variant="h6">{text.label[lang]}</Typography>
              <Chip size="small" variant="outlined" label={t(`kind_${stage.kind}` as keyof typeof T)} />
            </Stack>
            <Typography variant="body1" sx={{ mb: 2 }}>
              {text.purpose[lang]}
            </Typography>
            <Typography variant="subtitle2" gutterBottom>
              {t('what')}
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, mb: 2 }}>
              {text.how[lang].split('\n').map((line, i) => (
                <Typography key={i} component="li" variant="body2" sx={{ mb: 0.5 }}>
                  {line}
                </Typography>
              ))}
            </Box>
            {text.rules && (
              <>
                <Typography variant="subtitle2" gutterBottom>
                  {t('rules')}
                </Typography>
                <Typography variant="body2" sx={{ mb: 2 }}>
                  {text.rules[lang]}
                </Typography>
              </>
            )}
            {stage.task && (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5, flexWrap: 'wrap' }}>
                <Typography variant="subtitle2">{t('model')}:</Typography>
                {stage.task === 'embeddings' ? (
                  <Chip size="small" label={config?.embedding.model ?? '…'} sx={{ fontFamily: 'monospace' }} />
                ) : routing ? (
                  <>
                    <Chip size="small" label={routing.model} sx={{ fontFamily: 'monospace' }} />
                    <Chip size="small" variant="outlined" label={`${t('effort')}: ${THINKING[routing.thinking]?.[lang] ?? routing.thinking}`} />
                  </>
                ) : null}
                {config && !config.llm_enabled && <Small>{t('offline_model')}</Small>}
              </Stack>
            )}
            <Small sx={{ fontFamily: 'monospace' }}>
              {t('code')}: {stage.code}
            </Small>
          </Paper>
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="subtitle2" gutterBottom>
              {t('live')}
            </Typography>
            {live.length === 0 && <Small>–</Small>}
            {live.map(([label, value], i) => (
              <Stack key={i} direction="row" spacing={1} sx={{ justifyContent: 'space-between', py: 0.5, borderBottom: '1px solid #eceff1' }}>
                <Typography variant="body2" color="text.secondary">
                  {label}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right' }}>
                  {value}
                </Typography>
              </Stack>
            ))}
            {trace && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  {t('for_doc', { title: trace.title || trace.filename })}
                </Typography>
                {docLines.length === 0 && <Small>–</Small>}
                {docLines.map((line, i) => (
                  <Typography key={i} variant="body2" sx={{ py: 0.25 }}>
                    {line}
                  </Typography>
                ))}
              </Box>
            )}
          </Paper>
        </Box>
      ) : (
        <Typography color="text.secondary">{t('pick')}</Typography>
      )}
    </Stack>
  )
}

// ---------------------------------------------------------------- derived data
type Tr = (key: keyof typeof T, vars?: Record<string, string | number>) => string

function tracePath(doc: DocDetail | null, findings: Finding[]): Set<string> {
  if (!doc) return new Set()
  const methods = new Set(doc.ingest_summary.map((p) => p.method))
  const path = ['source', 'route', 'screen', 'segment', 'classify', 'entities', 'embed', 'store']
  if (methods.has('text_layer')) path.push('text')
  if (methods.has('tesseract') || methods.has('vision_llm')) path.push('ocr', 'gate')
  if (methods.has('vision_llm')) path.push('vision')
  const mine = findings.filter((f) => f.document_id === doc.id)
  if (mine.length) {
    path.push('question', 'plan', 'deterministic')
    if (mine.some((f) => f.reasoning || f.verdict === 'confirmed' || f.verdict === 'partial')) path.push('verify')
    if (mine.some((f) => f.policy && 'kind' in f.policy)) path.push('policy')
    if (mine.some((f) => f.review_status !== 'pending')) path.push('review')
    if (mine.some((f) => f.storage_ref)) path.push('file')
  }
  return new Set(path)
}

function liveNumbers(stage: string, docs: Doc[] | null, audits: Audit[] | null, findings: Finding[] | null, policy: PolicyReport | null, config: Config | null, t: Tr): [string, string][] {
  const ready = (docs ?? []).filter((d) => d.status === 'ready')
  const pages = ready.flatMap((d) => d.ingest_summary)
  const count = (m: string) => pages.filter((p) => p.method === m).length
  const last = (audits ?? []).find((a) => a.status === 'done')
  const s = (last?.summary ?? {}) as Record<string, number | Record<string, number>>
  const num = (k: string) => (typeof s[k] === 'number' ? (s[k] as number) : 0)
  const review = (typeof s.review === 'object' && s.review ? s.review : {}) as Record<string, number>
  const all = findings ?? []
  switch (stage) {
    case 'source':
    case 'route':
      return [[t('n_docs'), String(ready.length)], [t('n_pages'), String(pages.length)], [t('n_text'), String(count('text_layer'))], [t('n_ocr'), String(count('tesseract'))], [t('n_vision'), String(count('vision_llm'))]]
    case 'text':
      return [[t('n_text'), String(count('text_layer'))]]
    case 'ocr':
      return [[t('n_ocr'), String(count('tesseract'))], [t('n_escalated'), String(pages.filter((p) => p.note.includes('escalated')).length)]]
    case 'gate':
      return [[t('n_escalated'), String(pages.filter((p) => p.note.includes('escalated')).length)], [t('n_vision'), String(count('vision_llm'))]]
    case 'vision':
      return [[t('n_vision'), String(count('vision_llm'))]]
    case 'screen':
      return [[t('n_injection'), String(ready.filter((d) => d.injection_suspected).length)]]
    case 'segment':
    case 'classify':
    case 'embed':
    case 'store':
      return [[t('n_clauses'), String(ready.reduce((n, d) => n + d.clauses, 0))], [t('n_docs'), String(ready.length)]]
    case 'entities':
      return [[t('n_entities'), String(ready.reduce((n, d) => n + d.entities, 0))]]
    case 'question':
    case 'plan':
      return [[t('n_audits'), String((audits ?? []).length)], [t('n_scope'), String(num('scope'))]]
    case 'deterministic':
      return [[t('n_scope'), String(num('scope'))], [t('n_claims'), String(num('missing') + num('uncertain'))]]
    case 'verify':
      return [[t('n_verified'), s.verified ? (config?.routing.find((r) => r.task === 'verify')?.model ?? '✓') : '–'], [t('n_precedents'), String(num('precedents'))]]
    case 'policy':
      return [[t('n_auto'), String(review.auto_approved ?? 0)], [t('n_spot'), String(review.spot_check ?? 0)], [t('n_carried'), String(review.carried_over ?? 0)],
        ...(policy?.classes ?? []).slice(0, 3).map((c): [string, string] => [t('n_rate', { cls: c.class_key.split(':')[0] }), `${Math.round(c.review_rate * 100)} %`])]
    case 'review':
      return [[t('n_pending'), String(all.filter((f) => f.review_status === 'pending').length)], [t('n_decided'), String(all.filter((f) => f.review_status === 'approved' || f.review_status === 'rejected').length)], [t('n_auto'), String(all.filter((f) => f.review_status === 'auto_approved').length)]]
    case 'file':
      return [[t('n_filed'), String(all.filter((f) => f.storage_ref).length)]]
    default:
      return []
  }
}

function traceLines(stage: string, doc: DocDetail | null, findings: Finding[], t: Tr, lang: 'de' | 'en'): string[] {
  if (!doc) return []
  const mine = findings.filter((f) => f.document_id === doc.id)
  const methodWord = (m: string) => t(`method_${m}` as keyof typeof T)
  switch (stage) {
    case 'source':
      return [t('d_input', { t: doc.input_type }), t('d_checksum', { sha: doc.sha256.slice(0, 12) })]
    case 'route':
    case 'text':
    case 'ocr':
    case 'gate':
    case 'vision':
      return doc.ingest_summary.map((p) => t('d_page', { n: p.page, method: methodWord(p.method), conf: Math.round(p.confidence * 100) }) + (p.note ? ` – ${p.note}` : ''))
    case 'screen':
      return [doc.injection_suspected ? t('d_injection_yes') : t('d_injection_no')]
    case 'segment':
    case 'classify':
    case 'embed':
    case 'store':
      return [t('d_clauses', { n: doc.clause_rows.length, k: doc.clause_rows.filter((c) => c.clause_type in CLAUSE_TYPES && !['preamble', 'scope', 'notices', 'signature', 'other'].includes(c.clause_type)).length })]
    case 'entities':
      return [t('d_entities', { n: doc.entity_rows.length, old: doc.entity_rows.filter((e) => e.kind === 'our_entity_old' && !e.historical).length })]
    case 'question':
    case 'plan':
    case 'deterministic':
    case 'verify':
    case 'policy':
    case 'review':
    case 'file':
      return mine.length
        ? mine.map((f) => t('d_finding', { kind: AUDIT_KINDS[f.audit_kind]?.[lang] ?? f.audit_kind, verdict: VERDICTS[f.verdict]?.[lang] ?? f.verdict, status: REVIEW_STATUS[f.review_status]?.[lang] ?? f.review_status }) + (f.policy && 'kind' in f.policy && f.policy.kind !== 'required' ? ` · ${(POLICY[f.policy.kind]?.[lang] ?? f.policy.kind).replace('{date}', '')}` : ''))
        : [t('d_no_findings')]
    default:
      return []
  }
}
