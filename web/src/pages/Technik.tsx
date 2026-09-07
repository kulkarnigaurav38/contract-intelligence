import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { api, type Doc, type DocDetail } from '../api'
import { useLabel, useSettings, useT } from '../i18n'
import { usePolling } from '../components/ui'
import { CLAUSE_TYPES, CONTRACT_TYPES } from '../vocab'

/** The technical explanation: the same 14 stages as "So funktioniert es", with module, model, rules and thresholds; the graph
 *  with live counts; and the trace of one real contract through every stage. Everything on it comes from the API. */
const T = {
  title: { de: 'Technik', en: 'Under the hood' },
  intro: {
    de: 'Dieselben 14 Stufen wie unter „So funktioniert es“ – hier mit Modul, Modell, Regeln und Schwellen; das Datenmodell des Graphen mit den aktuellen Zahlen; und der Weg eines echten Vertrags durch jede Stufe. Alles auf dieser Seite wird aus der API erzeugt und kann dem Code nicht davonlaufen.',
    en: 'The same 14 stages as under "How it works" – here with module, model, rules and thresholds; the graph model with its current numbers; and the trace of a real contract through every stage. Everything on this page is generated from the API and cannot drift from the code.',
  },
  arch: { de: 'Architektur', en: 'Architecture' },
  a_source: { de: 'SharePoint · Upload', en: 'SharePoint · upload' },
  a_read: { de: 'Lesen (7 Stufen)', en: 'Read (7 stages)' },
  a_graph: { de: 'Neo4j – Graph und Datenbank', en: 'Neo4j – graph and database' },
  a_check: { de: 'Prüfen (LangGraph, 5 Stufen)', en: 'Check (LangGraph, 5 stages)' },
  a_decide: { de: 'Entscheiden (2 Stufen)', en: 'Decide (2 stages)' },
  a_store: { de: 'Vertragsablage (REST)', en: 'Contract storage (REST)' },
  stages_h: { de: 'Die Stufen', en: 'The stages' },
  col_stage: { de: 'Stufe', en: 'Stage' },
  col_module: { de: 'Modul', en: 'Module' },
  col_model: { de: 'Modell · Denken', en: 'Model · thinking' },
  col_detail: { de: 'Regeln und Schwellen', en: 'Rules and thresholds' },
  col_produces: { de: 'erzeugt', en: 'produces' },
  no_model: { de: 'kein Modell', en: 'no model' },
  read: { de: 'Lesen', en: 'Read' },
  check: { de: 'Prüfen', en: 'Check' },
  decide: { de: 'Entscheiden', en: 'Decide' },
  graph_h: { de: 'Der Graph', en: 'The graph' },
  graph_text: {
    de: 'Neo4j ist die Datenbank: Verträge, Seiten, Klauseln (mit Vektor- und Volltextindex), Namensnennungen, die Richtlinie als REQUIRES-Kanten, das Namensregister aus GLEIF mit RENAMED_TO, Entscheidungen, Prüfläufe und das Protokoll liegen in einem Graphen. Die Frage der Aufgabenstellung – welchem Vertrag fehlt eine geforderte Klausel? – ist darin ein Muster, keine Suche:',
    en: 'Neo4j is the database: contracts, pages, clauses (with vector and full-text index), name mentions, the guideline as REQUIRES edges, the name register from GLEIF with RENAMED_TO, decisions, audits and the log live in one graph. The question of the case study – which contract lacks a required clause? – is a pattern in it, not a search:',
  },
  nodes: { de: 'Knoten', en: 'Nodes' },
  rels: { de: 'Kanten', en: 'Relationships' },
  gaps: { de: '{n} Richtlinienlücken über alle Verträge im Moment', en: '{n} guideline gaps across all contracts right now' },
  graph_off: { de: 'Der Graph ist nicht erreichbar.', en: 'The graph is not reachable.' },
  trace_h: { de: 'Ein Vertrag durch alle Stufen', en: 'One contract through every stage' },
  pick: { de: 'Vertrag', en: 'Contract' },
  no_docs: { de: 'Noch kein geprüfter Vertrag – legen Sie einen auf der Startseite ab.', en: 'No checked contract yet – drop one on the start page.' },
  t_read: { de: '{type} · {lang} · {input} · {n} Seiten{inj}', en: '{type} · {lang} · {input} · {n} pages{inj}' },
  t_injection: { de: ' · verdächtiger Text erkannt', en: ' · suspicious text detected' },
  h_page: { de: 'Seite', en: 'Page' },
  h_method: { de: 'Methode', en: 'Method' },
  h_conf: { de: 'Verlässlichkeit', en: 'Confidence' },
  h_note: { de: 'Hinweis', en: 'Note' },
  h_no: { de: 'Nr.', en: 'No.' },
  h_heading: { de: 'Überschrift', en: 'Heading' },
  h_type: { de: 'Typ', en: 'Type' },
  h_labels: { de: 'Regel → Modell', en: 'Rule → model' },
  h_name: { de: 'Name', en: 'Name' },
  h_kind: { de: 'Art', en: 'Kind' },
  h_hist: { de: 'historisch', en: 'historical' },
  h_required: { de: 'erforderlich', en: 'required' },
  h_status: { de: 'Status', en: 'Status' },
  h_verified: { de: 'gegengeprüft', en: 'cross-checked' },
  h_reason: { de: 'Begründung', en: 'Reason' },
  h_item: { de: 'Fund', en: 'Finding' },
  h_anchor: { de: 'Anker', en: 'Anchor' },
  h_policy: { de: 'Prüfregel', en: 'Review rule' },
  h_review: { de: 'Entscheidung', en: 'Decision' },
  h_suggestion: { de: 'Vorschlag', en: 'Suggestion' },
  yes: { de: 'ja', en: 'yes' },
  no: { de: 'nein', en: 'no' },
  clauses_h: { de: 'Klauseln', en: 'Clauses' },
  names_h: { de: 'Namensnennungen', en: 'Name mentions' },
  result_h: { de: 'Ergebnis der Regelprüfung und Gegenprüfung', en: 'Result of the rule check and the cross-check' },
  items_h: { de: 'Funde auf der Seite', en: 'Findings on the page' },
  cross_checked: { de: 'mit KI-Gegenprüfung', en: 'with AI cross-check' },
  not_cross_checked: { de: 'ohne KI-Gegenprüfung', en: 'without AI cross-check' },
  degraded: { de: ' · wird beim nächsten Neustart nachgeholt', en: ' · repeated at the next restart' },
  t_decide: { de: '{open} offen · {accepted} übernommen · {dismissed} nicht zutreffend · {auto} automatisch{storage}', en: '{open} open · {accepted} accepted · {dismissed} not applicable · {auto} automatic{storage}' },
  t_storage: { de: ' · abgelegt unter {id}', en: ' · filed as {id}' },
  open: { de: 'Vertrag öffnen', en: 'Open contract' },
  guarantees_h: { de: 'Was das System zusichert', en: 'What the system guarantees' },
  g1: { de: 'Nur die Gegenprüfung darf einen Kandidaten entfernen – und bevor sie eine Klausel als fehlend bestätigt, liest sie den ganzen Vertrag (verify_absence).', en: 'Only the cross-check may remove a candidate – and before it confirms a clause as missing it reads the whole contract (verify_absence).' },
  g2: { de: 'Ohne Modellschlüssel oder bei einem Ausfall bleibt die Regelprüfung stehen und ist als „ohne KI-Gegenprüfung“ gekennzeichnet; sie wird beim nächsten Start wiederholt.', en: 'Without a model key or during an outage the rule result stands, marked "without AI cross-check", and is repeated at the next start.' },
  g3: { de: 'Text im Dokument ist Daten: jeder Prompt trägt DOC_GUARD, versteckte Anweisungen werden beim Lesen erkannt und markiert.', en: 'Text inside a document is data: every prompt carries DOC_GUARD, hidden instructions are detected at reading time and flagged.' },
  g4: { de: 'Das Original wird nie verändert; die korrigierte Kopie wird auf Anfrage erzeugt und mit Idempotency-Key abgelegt – dieselbe Kopie nur einmal.', en: 'The original is never modified; the corrected copy is generated on request and filed under an Idempotency-Key – the same copy only once.' },
  g5: { de: 'Jede Einlesung, Entscheidung, Ablage und Löschung landet im Protokoll (AuditLog-Knoten) mit Prüfsumme der Datei.', en: 'Every ingest, decision, filing and deletion lands in the log (AuditLog nodes) with the file checksum.' },
  g6: { de: 'Automatisiert wird nur, was das Team achtmal in Folge bestätigt hat – sichtbar, mit Stichprobe, jederzeit umkehrbar.', en: 'Only what the team has confirmed eight times in a row is automated – visibly, with spot checks, reversible at any time.' },
}

const PHASES = ['read', 'check', 'decide'] as const
const GAP_QUERY = `MATCH (c:Contract)-[:OF_TYPE]->(:ContractType)-[:REQUIRES]->(t:ClauseType)
WHERE NOT EXISTS { (c)-[:HAS_CLAUSE]->(:Clause)-[:IS_A]->(t) }
RETURN c.title, t.key`
const MODEL = `(Contract)-[:HAS_PAGE]->(Page)
(Contract)-[:HAS_CLAUSE]->(Clause {text, embedding})-[:IS_A]->(ClauseType), (Clause)-[:NEXT]->(Clause)
(Contract)-[:OF_TYPE]->(ContractType)-[:REQUIRES]->(ClauseType)
(Contract)-[:MENTIONS {page_no, historical}]->(Entity)-[:RENAMED_TO]->(Entity)
(Decision)-[:ON]->(Contract), (Decision)-[:ABOUT]->(ClauseType)
(Audit)-[:HAS_FINDING]->(Finding)-[:ON]->(Contract)   (AuditLog) (StoredContract) (SyncState)`

const pct = (x: number) => `${Math.round(x * 100)} %`
const showable = (d: Doc) => d.report_status === 'ready'

function Tbl({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small" sx={{ '& td, & th': { fontSize: 12, verticalAlign: 'top' } }}>
        <TableHead>
          <TableRow>
            {head.map((h) => (
              <TableCell key={h} sx={{ fontWeight: 600 }}>{h}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              {r.map((c, j) => (
                <TableCell key={j}>{c}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  )
}

export default function Technik() {
  const t = useT(T)
  const { lang } = useSettings()
  const type = useLabel(CONTRACT_TYPES)
  const clause = useLabel(CLAUSE_TYPES)
  const { data: pipeline } = usePolling(api.pipeline, 0, () => false)
  const { data: stats, error: statsError } = usePolling(api.graphStats, 0, () => false)
  const { data: docs } = usePolling(api.documents, 0, () => false)
  const ready = (docs ?? []).filter(showable).sort((a, b) => a.id - b.id)
  const [picked, setPicked] = useState<number | ''>('')
  const [doc, setDoc] = useState<DocDetail | null>(null)
  const id = picked || (ready.find((d) => (d.report_summary?.missing ?? 0) + (d.report_summary?.old_names ?? 0) > 0) ?? ready[0])?.id
  useEffect(() => {
    if (id) api.document(id).then(setDoc, () => setDoc(null))
  }, [id])

  const stages = pipeline?.stages ?? []
  const boxes = [t('a_source'), t('a_read'), t('a_graph'), t('a_check'), t('a_decide'), t('a_store')]
  const yes = (b: boolean) => (b ? t('yes') : t('no'))
  const mono = { fontFamily: 'monospace', fontSize: 12 } as const

  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h4" component="h1" sx={{ mb: 1 }}>{t('title')}</Typography>
        <Typography color="text.secondary">{t('intro')}</Typography>
      </Box>

      <Box>
        <Typography variant="h6" sx={{ mb: 1.5 }}>{t('arch')}</Typography>
        <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
          {boxes.map((b, i) => (
            <Fragment key={b}>
              {i > 0 && <Typography color="text.secondary">→</Typography>}
              <Paper sx={{ px: 2, py: 1, fontWeight: 600, bgcolor: i === 2 ? 'primary.main' : 'background.paper', color: i === 2 ? 'primary.contrastText' : 'text.primary' }}>{b}</Paper>
            </Fragment>
          ))}
        </Stack>
      </Box>

      <Box>
        <Typography variant="h6" sx={{ mb: 1.5 }}>{t('stages_h')}</Typography>
        <Paper>
          <Tbl
            head={['#', t('col_stage'), t('col_module'), t('col_model'), t('col_detail'), t('col_produces')]}
            rows={stages.map((s, i) => [
              i + 1,
              <><Box sx={{ fontWeight: 600 }}>{s.title[lang]}</Box><Box sx={{ ...mono, color: 'text.secondary' }}>{s.id} · {t(s.phase)}</Box></>,
              <Box sx={mono}>{s.module}</Box>,
              s.model ? <Box sx={mono}>{s.model}{s.thinking ? ` · ${s.thinking}` : ''}</Box> : <Typography variant="caption" color="text.secondary">{t('no_model')}</Typography>,
              s.detail[lang],
              s.produces[lang],
            ])}
          />
        </Paper>
      </Box>

      <Box>
        <Typography variant="h6" sx={{ mb: 1 }}>{t('graph_h')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{t('graph_text')}</Typography>
        <Paper sx={{ p: 2, mb: 1.5 }}>
          <Box component="pre" sx={{ ...mono, m: 0, whiteSpace: 'pre-wrap' }}>{GAP_QUERY}</Box>
        </Paper>
        {stats ? (
          <Stack spacing={1}>
            <Typography variant="body2">{t('gaps', { n: stats.gaps })}</Typography>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>{t('nodes')}:</Typography>
              {Object.entries(stats.nodes).sort().map(([k, v]) => <Chip key={k} size="small" variant="outlined" label={`${k} ${v}`} />)}
            </Stack>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>{t('rels')}:</Typography>
              {Object.entries(stats.relationships).sort().map(([k, v]) => <Chip key={k} size="small" variant="outlined" label={`${k} ${v}`} />)}
            </Stack>
          </Stack>
        ) : (
          statsError && <Typography variant="body2" color="text.secondary">{t('graph_off')}</Typography>
        )}
        <Paper sx={{ p: 2, mt: 1.5 }}>
          <Box component="pre" sx={{ ...mono, m: 0, whiteSpace: 'pre-wrap' }}>{MODEL}</Box>
        </Paper>
      </Box>

      <Box>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
          <Typography variant="h6">{t('trace_h')}</Typography>
          {ready.length > 0 && (
            <TextField select size="small" label={t('pick')} value={id ?? ''} onChange={(e) => setPicked(Number(e.target.value))} sx={{ minWidth: 320 }}>
              {ready.map((d) => (
                <MenuItem key={d.id} value={d.id}>{d.title || d.filename}</MenuItem>
              ))}
            </TextField>
          )}
        </Stack>
        {ready.length === 0 && <Typography variant="body2" color="text.secondary">{t('no_docs')}</Typography>}
        {doc && (
          <Stack spacing={2}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="overline" color="primary" component="div">{t('read')}</Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                {t('t_read', { type: type(doc.contract_type), lang: doc.language, input: doc.input_type, n: doc.pages, inj: doc.injection_suspected ? t('t_injection') : '' })}
              </Typography>
              <Tbl head={[t('h_page'), t('h_method'), t('h_conf'), t('h_note')]} rows={doc.ingest_summary.map((p) => [p.page, <Box sx={mono}>{p.method}</Box>, pct(p.confidence), p.note])} />
              <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5 }}>{t('clauses_h')} ({doc.clause_rows.length})</Typography>
              <Tbl
                head={[t('h_no'), t('h_page'), t('h_heading'), t('h_type'), t('h_conf'), t('h_method'), t('h_labels')]}
                rows={doc.clause_rows.map((c) => [c.ordinal, c.page_no, c.heading || <Typography variant="caption" color="text.secondary">{c.text.slice(0, 60)}…</Typography>, clause(c.clause_type), pct(c.confidence), <Box sx={mono}>{c.method}</Box>, <Box sx={mono}>{c.rule_label} → {c.llm_label || '–'}</Box>])}
              />
              <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5 }}>{t('names_h')} ({doc.entity_rows.length})</Typography>
              <Tbl
                head={[t('h_name'), t('h_kind'), t('h_page'), t('h_hist'), t('h_method'), t('h_conf')]}
                rows={doc.entity_rows.map((e) => [e.name, <Box sx={mono}>{e.kind}</Box>, e.page_no, yes(e.historical), <Box sx={mono}>{e.method}</Box>, pct(e.confidence)])}
              />
            </Paper>
            <Paper sx={{ p: 2 }}>
              <Typography variant="overline" color="primary" component="div">{t('check')}</Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                {doc.report.cross_checked ? t('cross_checked') : t('not_cross_checked')}{doc.report.degraded ? t('degraded') : ''}
                {doc.report.generated_at ? ` · ${new Date(doc.report.generated_at).toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB')}` : ''}
              </Typography>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{t('result_h')}</Typography>
              <Tbl
                head={[t('h_type'), t('h_required'), t('h_status'), t('h_verified'), t('h_page'), t('h_reason')]}
                rows={(doc.report.clauses ?? []).map((c) => [clause(c.clause_type), yes(c.required), <Box sx={mono}>{c.status}</Box>, yes(c.verified), c.page ?? '–', c.reason ?? ''])}
              />
              <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5 }}>{t('items_h')} ({(doc.report.items ?? []).length})</Typography>
              <Tbl
                head={[t('h_item'), t('h_kind'), t('h_page'), t('h_anchor'), t('h_verified'), t('h_suggestion'), t('h_policy'), t('h_review')]}
                rows={(doc.report.items ?? []).map((it) => [
                  <Box sx={mono}>{it.key}</Box>, <Box sx={mono}>{it.kind}</Box>, it.page,
                  <Box sx={mono}>{it.anchor.kind}{it.anchor.bbox ? ` [${it.anchor.bbox.map((v) => v.toFixed(2)).join(', ')}]` : ' · banner'}</Box>,
                  yes(it.verified), `${(it.review.edited_text || it.suggestion).length} Z.`,
                  <Box sx={mono}>{it.policy.kind} · {Math.round(it.policy.review_rate * 100)} %</Box>, <Box sx={mono}>{it.review.status}{it.review.carried_over ? ' · carried over' : ''}</Box>,
                ])}
              />
            </Paper>
            <Paper sx={{ p: 2 }}>
              <Typography variant="overline" color="primary" component="div">{t('decide')}</Typography>
              <Typography variant="body2">
                {t('t_decide', { open: doc.report.summary?.open ?? 0, accepted: doc.report.summary?.accepted ?? 0, dismissed: doc.report.summary?.dismissed ?? 0, auto: doc.report.summary?.auto ?? 0, storage: doc.report.storage ? t('t_storage', { id: doc.report.storage.external_id }) : '' })}
              </Typography>
              <Link component={RouterLink} to={`/contracts/${doc.id}`} variant="body2" sx={{ display: 'inline-block', mt: 1 }}>{t('open')}</Link>
            </Paper>
          </Stack>
        )}
      </Box>

      <Box>
        <Typography variant="h6" sx={{ mb: 1 }}>{t('guarantees_h')}</Typography>
        <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2.5 }}>
          {(['g1', 'g2', 'g3', 'g4', 'g5', 'g6'] as const).map((k) => (
            <Typography component="li" key={k} variant="body2">{t(k)}</Typography>
          ))}
        </Stack>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1.5 }}>
          {PHASES.map((p) => t(p)).join(' · ')} — GET /api/pipeline · GET /api/graph/stats · GET /api/documents/{'{id}'}
        </Typography>
      </Box>
    </Stack>
  )
}
