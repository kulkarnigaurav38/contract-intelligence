import { useCallback, useEffect, useRef, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline'
import GridOnIcon from '@mui/icons-material/GridOn'
import HowToRegIcon from '@mui/icons-material/HowToReg'
import ManageSearchIcon from '@mui/icons-material/ManageSearch'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { api, type Audit, type Doc } from '../api'
import { useLabel, useSettings, useT } from '../i18n'
import { Details, Small, Tech } from '../components/tech'
import { EmptyState, ErrorAlert, legibility, usePolling, useToast } from '../components/ui'
import { AUDIT_KINDS, AUDIT_QUESTIONS, AUDIT_STATUS, CLAUSE_TYPES, COMMON, CONTRACT_TYPES, CONTRACT_TYPE_KEYS } from '../vocab'

const T = {
  morning: { de: 'Guten Morgen', en: 'Good morning' },
  day: { de: 'Guten Tag', en: 'Good afternoon' },
  evening: { de: 'Guten Abend', en: 'Good evening' },
  headline: { de: 'Was möchten Sie wissen?', en: 'What would you like to know?' },
  what: { de: 'Contract Intelligence liest Ihre Verträge ein – PDFs, Scans und Fotos –, findet Verträge, in denen eine Klausel oder Regelung fehlt oder noch ein alter Firmenname steht, und legt Ihnen jeden Fund mit Beleg und Seitenzahl zur Freigabe vor. Ohne Ihre Freigabe passiert nichts.', en: 'Contract Intelligence reads your contracts – PDFs, scans and photos –, finds contracts that lack a clause or passage or still carry an old company name, and puts every finding in front of you with its evidence and page for approval. Nothing happens without your approval.' },
  step1: { de: 'Verträge einlesen', en: 'Read contracts in' },
  step1_text: { de: 'Hochladen oder aus der Ablage abholen. Jeder Vertrag wird in Klauseln und Namen zerlegt.', en: 'Upload or fetch from the library. Every contract is split into clauses and names.' },
  step2: { de: 'Prüfung starten', en: 'Start a check' },
  step2_text: { de: 'Eine der drei Fragen stellen. Die Antwort kommt mit Beleg und wird von der KI gegengeprüft.', en: 'Ask one of the three questions. The answer comes with evidence and is cross-checked by the AI.' },
  step3: { de: 'Funde freigeben', en: 'Approve findings' },
  step3_text: { de: 'Jeden Fund ansehen, freigeben oder ablehnen. Ihre Entscheidungen senken mit der Zeit die Prüflast.', en: 'Look at each finding, approve or reject. Your decisions lower the review load over time.' },
  new_check: { de: 'Neue Prüfung', en: 'New check' },
  q_which: { de: '1 · Was möchten Sie prüfen?', en: '1 · What would you like to check?' },
  q_input: { de: '2 · Ihre Angabe', en: '2 · Your input' },
  q_scope: { de: '3 · Eingrenzen (optional)', en: '3 · Narrow down (optional)' },
  exp_missing_clause: { de: 'Findet Verträge, in denen eine der zwölf Standardklauseln nicht vorkommt – z. B. keine Haftungsbegrenzung.', en: 'Finds contracts in which one of the twelve standard clauses does not occur – e.g. no limitation of liability.' },
  exp_missing_passage: { de: 'Findet Verträge, die eine bestimmte Regelung nicht enthalten. Sie beschreiben die Regelung in eigenen Worten.', en: 'Finds contracts that do not contain a specific passage. You describe the passage in your own words.' },
  exp_rename: { de: 'Findet Verträge, die noch einen alten Firmennamen als Vertragspartei nennen – historische Verweise („vormals“) werden nicht gemeldet.', en: 'Finds contracts that still name an old company name as a party – historical references (“formerly”) are not reported.' },
  clause_help: { de: 'Die Zahl in Klammern: in wie vielen Verträgen diese Klausel bisher nicht gefunden wurde.', en: 'The number in brackets: in how many contracts this clause has not been found so far.' },
  scope_help: { de: 'Leer lassen, um alle Verträge zu prüfen.', en: 'Leave empty to check all contracts.' },
  start: { de: 'Prüfung starten', en: 'Start check' },
  glossary: { de: 'Was bedeuten die Begriffe?', en: 'What do the terms mean?' },
  g_check: { de: 'Prüfung', en: 'Check' }, g_check_d: { de: 'Eine Frage, die über alle Verträge (oder eine Vertragsart) beantwortet wird. Ergebnis: eine Liste von Funden.', en: 'A question answered across all contracts (or one contract type). Result: a list of findings.' },
  g_finding: { de: 'Fund', en: 'Finding' }, g_finding_d: { de: 'Ein Vertrag, auf den die Frage zutrifft – mit Beleg, Seite und Verlässlichkeit. Ein Fund wartet auf Ihre Entscheidung.', en: 'A contract the question applies to – with evidence, page and confidence. A finding waits for your decision.' },
  g_evidence: { de: 'Beleg', en: 'Evidence' }, g_evidence_d: { de: 'Die zitierte Stelle im Vertrag, auf die sich ein Fund stützt. „Vertrag öffnen“ springt dorthin.', en: 'The quoted passage a finding rests on. “Open contract” jumps to it.' },
  g_verify: { de: 'KI-Gegenprüfung', en: 'AI cross-check' }, g_verify_d: { de: 'Ein unabhängiges Modell liest den ganzen Vertrag und bestätigt oder entkräftet den Fund. Fehlt sie, ist der Fund „nicht gegengeprüft“.', en: 'An independent model reads the whole contract and confirms or refutes the finding. Without it a finding is “not cross-checked”.' },
  g_approve: { de: 'Freigabe', en: 'Approval' }, g_approve_d: { de: 'Ihre Entscheidung zu einem Fund. Sie wird mit Zeitpunkt und Prüfsumme protokolliert. Freigegebene Funde können in der Vertragsablage abgelegt werden.', en: 'Your decision on a finding. It is logged with time and checksum. Approved findings can be filed in the contract storage.' },
  g_matrix: { de: 'Klausel-Übersicht', en: 'Clause overview' }, g_matrix_d: { de: 'Welche der zwölf Standardklauseln in welchem Vertrag gefunden wurden – entsteht beim Einlesen. Rote Striche: laut Richtlinie erforderlich, aber nicht gefunden.', en: 'Which of the twelve standard clauses were found in which contract – built while reading. Red dashes: required by the guideline but not found.' },
  g_legibility: { de: 'Lesbarkeit', en: 'Legibility' }, g_legibility_d: { de: 'Wie zuverlässig ein Scan gelesen werden konnte. „Nicht lesbar“ heißt: der Vertrag gilt als ungeprüft, bitte Original ansehen.', en: 'How reliably a scan could be read. “Unreadable” means: the contract counts as unchecked, please look at the original.' },
  g_load: { de: 'Prüflast', en: 'Review load' }, g_load_d: { de: 'Der Anteil der Funde, den Sie noch selbst ansehen. Er sinkt, wenn Sie einer Fundart wiederholt zustimmen, und steigt sofort wieder, wenn Sie ablehnen.', en: 'The share of findings you still look at yourself. It falls when you repeatedly agree with a kind of finding and rises again as soon as you reject one.' },
  clause: { de: 'Klausel', en: 'Clause' },
  missing_1: { de: '(1 fehlt)', en: '(1 missing)' },
  missing_n: { de: '({n} fehlen)', en: '({n} missing)' },
  passage: { de: 'Regelung', en: 'Passage' },
  passage_help: { de: 'Der Wortlaut muss nicht exakt stimmen – sinngemäß reicht.', en: 'The wording need not match exactly – the gist is enough.' },
  passage_example: { de: 'Zum Beispiel: Jede Partei hält die geltenden Antikorruptionsgesetze ein.', en: 'For example: Each party shall comply with applicable anti-corruption laws.' },
  registry: { de: 'Wir suchen nach den bekannten alten Namen: {names}', en: 'We look for the known old names: {names}' },
  other_name: { de: 'Anderer Name', en: 'Other name' },
  other_name_label: { de: 'Anderer alter Name', en: 'Other old name' },
  other_name_hide: { de: 'Nur die bekannten Namen', en: 'Only the known names' },
  add_first: { de: 'Zuerst Verträge hinzufügen', en: 'Add contracts first' },
  still_reading: { de: 'Die Verträge werden noch gelesen.', en: 'The contracts are still being read.' },
  pending_title: { de: 'Wartet auf Ihre Freigabe', en: 'Waiting for your approval' },
  pending_one: { de: '1 Fund wartet auf Ihre Entscheidung.', en: '1 finding awaits your decision.' },
  pending_many: { de: '{n} Funde warten auf Ihre Entscheidung.', en: '{n} findings await your decision.' },
  to_approvals: { de: 'Zur Freigabe', en: 'Go to approvals' },
  nothing_pending: { de: 'Nichts wartet auf Sie.', en: 'Nothing is waiting for you.' },
  auto_one: { de: '1 Fund wurde automatisch freigegeben.', en: '1 finding was approved automatically.' },
  auto_many: { de: '{n} Funde wurden automatisch freigegeben.', en: '{n} findings were approved automatically.' },
  stock_title: { de: 'Ihr Vertragsbestand', en: 'Your contracts' },
  contracts_one: { de: '1 Vertrag', en: '1 contract' },
  contracts_many: { de: '{n} Verträge', en: '{n} contracts' },
  leg_good: { de: '{n} gut lesbar', en: '{n} easy to read' },
  leg_partial: { de: '{n} schwer lesbar', en: '{n} hard to read' },
  leg_unreadable: { de: '{n} nicht lesbar', en: '{n} unreadable' },
  leg_reading: { de: '{n} werden gerade gelesen', en: '{n} being read' },
  leg_failed: { de: '{n} fehlgeschlagen', en: '{n} failed' },
  reading: { de: 'Wir lesen gerade {done} von {total} Verträgen …', en: 'We are reading {done} of {total} contracts …' },
  add_contracts: { de: 'Verträge hinzufügen', en: 'Add contracts' },
  recent_title: { de: 'Letzte Prüfungen', en: 'Recent checks' },
  recent_none: { de: 'Noch keine Prüfungen.', en: 'No checks yet.' },
  checked_one: { de: '1 Vertrag geprüft', en: '1 contract checked' },
  checked_many: { de: '{n} Verträge geprüft', en: '{n} contracts checked' },
  no_findings: { de: 'keine Funde', en: 'no findings' },
  v_confirmed: { de: '{n} KI-bestätigt', en: '{n} AI-confirmed' },
  v_unverified: { de: '{n} nicht gegengeprüft', en: '{n} not cross-checked' },
  v_partial: { de: '{n} teilweise', en: '{n} partly' },
  v_dismissed: { de: '{n} entkräftet', en: '{n} cleared' },
  v_unreadable: { de: '{n} nicht lesbar', en: '{n} unreadable' },
  empty_title: { de: 'Noch keine Verträge.', en: 'No contracts yet.' },
  empty_text: { de: 'Laden Sie PDFs oder Fotos hoch – oder starten Sie mit den 14 Beispielverträgen.', en: 'Upload PDFs or photos – or start with the 14 sample contracts.' },
  upload: { de: 'Verträge hochladen', en: 'Upload contracts' },
  samples: { de: 'Beispielverträge laden', en: 'Load sample contracts' },
  samples_toast: { de: 'Wir lesen jetzt {n} Beispielverträge ein.', en: 'We are now reading {n} sample contracts.' },
  verifier_on: { de: 'KI-Gegenprüfung: verbunden ({model})', en: 'AI cross-check: connected ({model})' },
  verifier_off: { de: 'KI-Gegenprüfung: nicht verbunden', en: 'AI cross-check: not connected' },
}

const REGISTRY_NAMES = 'arvato Financial Solutions, Arvato Payment Solutions GmbH, AFS → Riverty GmbH'
const CLAUSE_KEY = 'home.clause_type'
const VERDICT_ORDER = ['confirmed', 'unverified', 'partial', 'dismissed', 'unreadable'] as const
const LEGIBILITY_ORDER = ['good', 'partial', 'unreadable', 'reading'] as const

const isReading = (d: Doc) => d.status === 'queued' || d.status === 'processing'
const anyReading = (docs: Doc[] | null) => !!docs?.some(isReading)
const anyRunning = (audits: Audit[] | null) => !!audits?.slice(0, 3).some((a) => a.status === 'running')
const never = () => false

function storedClause(): string {
  try {
    return localStorage.getItem(CLAUSE_KEY) ?? ''
  } catch {
    return ''
  }
}

function greetingKey(): 'morning' | 'day' | 'evening' {
  const h = new Date().getHours()
  return h < 12 ? 'morning' : h < 18 ? 'day' : 'evening'
}

// ---------------------------------------------------------------- recent check as a sentence
function AuditRow({ audit }: { audit: Audit }) {
  const t = useT(T)
  const tc = useT(COMMON)
  const { lang } = useSettings()
  const kind = useLabel(AUDIT_KINDS)
  const clause = useLabel(CLAUSE_TYPES)
  const ctype = useLabel(CONTRACT_TYPES)
  const status = useLabel(AUDIT_STATUS)
  const p = audit.params
  let what = kind(audit.kind)
  if (audit.kind === 'missing_clause' && p.clause_type) what += ` „${clause(p.clause_type)}“`
  if (audit.kind === 'missing_passage' && p.passage) what += ` „${p.passage.length > 60 ? p.passage.slice(0, 60) + '…' : p.passage}“`
  if (audit.kind === 'rename' && p.old_name) what += ` „${p.old_name}“`
  const parts = [what, p.contract_type ? ctype(p.contract_type) : tc('all_types')]
  const scope = audit.summary.scope
  const f = audit.summary.findings
  if (audit.status === 'done' && typeof scope === 'number') {
    const counts = typeof f === 'object' ? VERDICT_ORDER.filter((v) => f[v]).map((v) => t(`v_${v}` as const, { n: f[v] })) : []
    parts.push(`${scope === 1 ? t('checked_one') : t('checked_many', { n: scope })}: ${counts.length ? counts.join(', ') : t('no_findings')}`)
  }
  const color = audit.status === 'running' ? 'info' : audit.status === 'failed' ? 'error' : 'default'
  return (
    <ListItemButton component={RouterLink} to={`/checks/${audit.id}`} divider sx={{ py: 1.5 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body1">{parts.join(' · ')}</Typography>
          <Small>{new Date(audit.created_at).toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</Small>
        </Box>
        <Chip size="small" variant="outlined" color={color} label={status(audit.status)} sx={{ flexShrink: 0 }} />
      </Stack>
    </ListItemButton>
  )
}

// ---------------------------------------------------------------- page
export default function Home() {
  const t = useT(T)
  const tc = useT(COMMON)
  const { lang } = useSettings()
  const navigate = useNavigate()
  const toast = useToast()
  const clauseLabel = useLabel(CLAUSE_TYPES)
  const ctypeLabel = useLabel(CONTRACT_TYPES)

  // The backend inserts each document only when it starts reading it, so the list alone cannot tell "3 of 14".
  // We remember how many were queued by the last sample load and poll until they have all appeared.
  const [expected, setExpected] = useState(0)
  const batch = useRef({ expected: 0, lastProgress: 0, lastCount: 0 })
  const active = useCallback((d: Doc[] | null) => {
    if (!d) return false
    const b = batch.current
    if (d.length !== b.lastCount) {
      b.lastCount = d.length
      b.lastProgress = Date.now()
    }
    if (d.some(isReading)) {
      b.lastProgress = Date.now()
      return true
    }
    if (d.length >= b.expected) return false
    if (Date.now() - b.lastProgress > 8000) {
      // nothing has arrived for a while: the batch is over, whatever was promised
      b.expected = d.length
      setExpected(d.length)
      return false
    }
    return true
  }, [])
  const { data: docs, error: docsError, refresh: refreshDocs } = usePolling(api.documents, 2000, active)
  const { data: config } = usePolling(api.config, 0, never)
  const { data: coverage, refresh: refreshCoverage } = usePolling(api.coverage, 0, never)
  const { data: pending } = usePolling(() => api.findings('pending'), 0, never)
  const { data: allFindings } = usePolling(() => api.findings(), 0, never)
  const { data: audits } = usePolling(api.audits, 2000, anyRunning)

  const [contractType, setContractType] = useState('')
  const [clauseType, setClauseType] = useState(storedClause)
  const [passage, setPassage] = useState('')
  const [passageFocus, setPassageFocus] = useState(false)
  const [showOther, setShowOther] = useState(false)
  const [oldName, setOldName] = useState('')
  const [busy, setBusy] = useState('')

  // The clause counts change once reading finishes.
  const reading = anyReading(docs) || (docs !== null && docs.length < expected)
  const wasReading = useRef(false)
  useEffect(() => {
    if (wasReading.current && !reading) refreshCoverage()
    wasReading.current = reading
  }, [reading]) // eslint-disable-line react-hooks/exhaustive-deps

  const taxonomy = config?.taxonomy ?? coverage?.taxonomy ?? []
  const clauseValue = taxonomy.includes(clauseType) ? clauseType : ''
  const coverageRows = coverage?.rows.filter((r) => !contractType || r.contract_type === contractType) ?? []
  const missing = (key: string) => coverageRows.filter((r) => !r.cells[key]).length

  const readyCount = docs?.filter((d) => d.status === 'ready').length ?? 0
  const canCheck = readyCount > 0 && !busy
  const hint = !docs ? undefined : docs.length === 0 ? t('add_first') : readyCount === 0 ? t('still_reading') : undefined

  const chooseClause = (v: string) => {
    setClauseType(v)
    try {
      localStorage.setItem(CLAUSE_KEY, v)
    } catch {
      /* private mode etc. */
    }
  }

  const start = async (kind: string, params: Record<string, string>) => {
    setBusy(kind)
    try {
      const audit = await api.createAudit(kind, contractType ? { ...params, contract_type: contractType } : params, lang)
      navigate(`/checks/${audit.id}`)
    } catch (e) {
      toast(tc('error', { msg: String(e) }))
      setBusy('')
    }
  }

  const loadSamples = async () => {
    setBusy('samples')
    try {
      const r = await api.ingestSamples()
      const e = Math.max(batch.current.expected, docs?.length ?? 0) + r.queued
      batch.current = { expected: e, lastProgress: Date.now(), lastCount: docs?.length ?? 0 }
      setExpected(e)
      toast(t('samples_toast', { n: r.queued }))
      refreshDocs()
    } catch (e) {
      toast(tc('error', { msg: String(e) }))
    }
    setBusy('')
  }

  // Contract-set sentence: "14 Verträge · 13 gut lesbar · 1 nicht lesbar"
  const legCounts = { good: 0, partial: 0, unreadable: 0, reading: 0 }
  let failed = 0
  for (const d of docs ?? []) {
    if (d.status === 'failed') failed += 1
    else legCounts[legibility(d)] += 1
  }
  const stockParts = docs
    ? [
        docs.length === 1 ? t('contracts_one') : t('contracts_many', { n: docs.length }),
        ...LEGIBILITY_ORDER.filter((k) => legCounts[k]).map((k) => t(`leg_${k}` as const, { n: legCounts[k] })),
        ...(failed ? [t('leg_failed', { n: failed })] : []),
      ]
    : []
  const total = Math.max(docs?.length ?? 0, expected)
  const done = (docs?.length ?? 0) - legCounts.reading

  const recent = audits ? [...audits].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3) : null
  const verifier = config?.routing.find((r) => r.task === 'verify')?.model ?? ''

  // Second line of the approval card: findings the review policy approved without a person ("Prüflast").
  const autoCount = allFindings?.filter((f) => f.review_status === 'auto_approved').length ?? 0
  const autoLine =
    autoCount > 0 ? (
      <Small sx={{ mt: 0.5 }}>{autoCount === 1 ? t('auto_one') : t('auto_many', { n: autoCount })}</Small>
    ) : null

  const questionLabel = useLabel(AUDIT_QUESTIONS)
  const [kind, setKind] = useState<'missing_clause' | 'missing_passage' | 'rename'>('rename')
  const canStart = canCheck && (kind === 'missing_clause' ? !!clauseValue : kind === 'missing_passage' ? !!passage.trim() : true)
  const startSelected = () => {
    if (kind === 'missing_clause') return start('missing_clause', { clause_type: clauseValue })
    if (kind === 'missing_passage') return start('missing_passage', { passage: passage.trim() })
    return start('rename', oldName.trim() ? { old_name: oldName.trim() } : {})
  }
  const QUESTIONS = [
    { key: 'missing_clause' as const, icon: <GridOnIcon fontSize="small" /> },
    { key: 'missing_passage' as const, icon: <ManageSearchIcon fontSize="small" /> },
    { key: 'rename' as const, icon: <DriveFileRenameOutlineIcon fontSize="small" /> },
  ]
  const STEPS = [
    { n: 1, title: t('step1'), text: t('step1_text'), to: '/contracts' },
    { n: 2, title: t('step2'), text: t('step2_text'), to: '/checks' },
    { n: 3, title: t('step3'), text: t('step3_text'), to: '/approvals' },
  ]
  const GLOSSARY = ['check', 'finding', 'evidence', 'verify', 'approve', 'matrix', 'legibility', 'load'] as const

  return (
    <Stack spacing={3} sx={{ maxWidth: 1000 }}>
      {docsError && <ErrorAlert msg={docsError} severity="warning" />}

      <Box>
        <Typography variant="body2" color="text.secondary">
          {t(greetingKey())}
        </Typography>
        <Typography variant="h5" sx={{ mb: 1 }}>
          {t('headline')}
        </Typography>
        <Typography variant="body1" sx={{ maxWidth: 760 }}>
          {t('what')}
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2, mt: 2 }}>
          {STEPS.map((s) => (
            <Stack key={s.n} direction="row" spacing={1.25} component={RouterLink} to={s.to} sx={{ textDecoration: 'none', color: 'inherit', alignItems: 'flex-start' }}>
              <Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: 'primary.main', color: 'primary.contrastText', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, mt: '2px' }}>
                {s.n}
              </Box>
              <Box>
                <Typography variant="subtitle2">{s.title}</Typography>
                <Small>{s.text}</Small>
              </Box>
            </Stack>
          ))}
        </Box>
      </Box>

      {docs && docs.length === 0 && (
        <Paper sx={{ maxWidth: 560, mx: 'auto', px: 3, width: '100%' }}>
          <EmptyState
            icon={<DescriptionOutlinedIcon sx={{ fontSize: 40 }} />}
            title={t('empty_title')}
            text={t('empty_text')}
            action={
              <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'center', flexWrap: 'wrap' }}>
                <Button variant="contained" startIcon={<UploadFileIcon />} component={RouterLink} to="/contracts">
                  {t('upload')}
                </Button>
                <Button variant="outlined" onClick={loadSamples} disabled={busy === 'samples' || reading}>
                  {t('samples')}
                </Button>
              </Stack>
            }
          />
        </Paper>
      )}

      {docs && docs.length > 0 && (
        <Paper sx={{ p: { xs: 2, md: 3 }, borderLeft: 4, borderLeftColor: 'primary.main' }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {t('new_check')}
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr' }, gap: { xs: 2, md: 4 } }}>
            <Box>
              <Typography variant="overline" color="text.secondary">
                {t('q_which')}
              </Typography>
              <RadioGroup value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                {QUESTIONS.map((q) => (
                  <FormControlLabel
                    key={q.key}
                    value={q.key}
                    control={<Radio />}
                    sx={{ alignItems: 'flex-start', mb: 1, mx: 0 }}
                    label={
                      <Box sx={{ pt: 1 }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <Box sx={{ color: 'primary.main', display: 'flex' }}>{q.icon}</Box>
                          <Typography variant="subtitle1" sx={{ lineHeight: 1.3 }}>
                            {questionLabel(q.key)}
                          </Typography>
                        </Stack>
                        <Small>{t(`exp_${q.key}` as const)}</Small>
                      </Box>
                    }
                  />
                ))}
              </RadioGroup>
            </Box>
            <Stack spacing={2.5}>
              <Box>
                <Typography variant="overline" color="text.secondary">
                  {t('q_input')}
                </Typography>
                {kind === 'missing_clause' && (
                  <TextField select fullWidth size="small" label={t('clause')} value={clauseValue} onChange={(e) => chooseClause(e.target.value)} helperText={t('clause_help')} sx={{ mt: 1 }}>
                    {taxonomy.map((k) => (
                      <MenuItem key={k} value={k}>
                        {clauseLabel(k)}
                        {coverage && (
                          <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                            {missing(k) === 1 ? t('missing_1') : t('missing_n', { n: missing(k) })}
                          </Typography>
                        )}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
                {kind === 'missing_passage' && (
                  <TextField
                    fullWidth
                    multiline
                    size="small"
                    minRows={passageFocus ? 5 : 3}
                    label={t('passage')}
                    placeholder={t('passage_example')}
                    helperText={t('passage_help')}
                    value={passage}
                    onChange={(e) => setPassage(e.target.value)}
                    onFocus={() => setPassageFocus(true)}
                    onBlur={() => setPassageFocus(false)}
                    sx={{ mt: 1 }}
                  />
                )}
                {kind === 'rename' && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2">{t('registry', { names: REGISTRY_NAMES })}</Typography>
                    {showOther && <TextField fullWidth size="small" label={t('other_name_label')} value={oldName} onChange={(e) => setOldName(e.target.value)} sx={{ mt: 1.5 }} />}
                    <Link
                      component="button"
                      type="button"
                      variant="caption"
                      underline="hover"
                      onClick={() => {
                        if (showOther) setOldName('')
                        setShowOther(!showOther)
                      }}
                      sx={{ mt: 1 }}
                    >
                      {showOther ? t('other_name_hide') : t('other_name')}
                    </Link>
                  </Box>
                )}
              </Box>
              <Box>
                <Typography variant="overline" color="text.secondary">
                  {t('q_scope')}
                </Typography>
                <TextField
                  select
                  fullWidth
                  size="small"
                  label={tc('contract_type')}
                  value={contractType}
                  onChange={(e) => setContractType(e.target.value)}
                  helperText={t('scope_help')}
                  slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
                  sx={{ mt: 1 }}
                >
                  <MenuItem value="">{tc('all_types')}</MenuItem>
                  {CONTRACT_TYPE_KEYS.map((k) => (
                    <MenuItem key={k} value={k}>
                      {ctypeLabel(k)}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Button variant="contained" size="large" startIcon={<PlayArrowIcon />} onClick={startSelected} disabled={!canStart}>
                  {t('start')}
                </Button>
                {hint && <Small>{hint}</Small>}
              </Stack>
            </Stack>
          </Box>
        </Paper>
      )}

      {docs && docs.length > 0 && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="overline" color="text.secondary">
                {t('stock_title')}
              </Typography>
              <Stack spacing={1} sx={{ mt: 0.5, alignItems: 'flex-start' }}>
                <Typography variant="body2">{stockParts.join(' · ')}</Typography>
                {reading && (
                  <Box sx={{ width: '100%' }}>
                    <LinearProgress variant="determinate" value={total ? (done / total) * 100 : 0} sx={{ mb: 0.75 }} />
                    <Small>{t('reading', { done, total })}</Small>
                  </Box>
                )}
                <Button size="small" variant="outlined" startIcon={<UploadFileIcon />} component={RouterLink} to="/contracts">
                  {t('add_contracts')}
                </Button>
              </Stack>
            </Paper>
            <Paper sx={{ p: 2 }}>
              <Typography variant="overline" color="text.secondary">
                {t('pending_title')}
              </Typography>
              {pending && pending.length > 0 && (
                <Stack spacing={1} sx={{ mt: 0.5, alignItems: 'flex-start' }}>
                  <Box>
                    <Typography variant="body2">{pending.length === 1 ? t('pending_one') : t('pending_many', { n: pending.length })}</Typography>
                    {autoLine}
                  </Box>
                  <Button size="small" variant="contained" startIcon={<HowToRegIcon />} component={RouterLink} to="/approvals">
                    {t('to_approvals')}
                  </Button>
                </Stack>
              )}
              {pending && pending.length === 0 && (
                <Stack direction="row" spacing={1} sx={{ mt: 0.5, alignItems: 'flex-start' }}>
                  <CheckCircleOutlinedIcon color="success" fontSize="small" sx={{ mt: 0.25 }} />
                  <Box>
                    <Typography variant="body2">{t('nothing_pending')}</Typography>
                    {autoLine}
                  </Box>
                </Stack>
              )}
            </Paper>
          </Box>

          <Box>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              {t('recent_title')}
            </Typography>
            {recent && recent.length === 0 && <Small>{t('recent_none')}</Small>}
            {recent && recent.length > 0 && (
              <Paper>
                <List disablePadding dense>
                  {recent.map((a) => (
                    <AuditRow key={a.id} audit={a} />
                  ))}
                </List>
              </Paper>
            )}
          </Box>
        </>
      )}

      <Divider />
      <Details label={t('glossary')}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
          {GLOSSARY.map((g) => (
            <Box key={g}>
              <Typography variant="subtitle2">{t(`g_${g}` as const)}</Typography>
              <Small>{t(`g_${g}_d` as const)}</Small>
            </Box>
          ))}
        </Box>
      </Details>

      {config && (
        <Tech>
          <Small>{config.llm_enabled ? t('verifier_on', { model: verifier }) : t('verifier_off')}</Small>
        </Tech>
      )}
    </Stack>
  )
}
