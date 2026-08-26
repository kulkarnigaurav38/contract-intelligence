import { useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import { api } from '../api'
import { useLabel, useSettings, useT } from '../i18n'
import { Details, Small, Tech } from '../components/tech'
import { EmptyState, usePolling, useToast } from '../components/ui'
import { AUDIT_KINDS, CLAUSE_SHORT, CLAUSE_TYPES, COMMON, CONTRACT_TYPES, INPUT_TYPES, LEGIBILITY, PAGE_METHODS } from '../vocab'

// ---------------------------------------------------------------- words
const T = {
  title: { de: 'Qualitätsmessung', en: 'Quality measurement' },
  intro: {
    de: 'Das Beispielpaket hat eine Musterlösung: Für jeden Vertrag ist bekannt, welche Klauseln er enthält und wo noch ein alter Name steht. Hier sehen Sie, wie gut jede Stufe trifft.',
    en: 'The sample set comes with a reference solution: for every contract we know which clauses it contains and where an old name still appears. Here you can see how well each stage performs.',
  },
  run: { de: 'Messung starten', en: 'Start measurement' },
  running: { de: 'Wir messen gerade … das dauert etwa eine halbe Minute.', en: 'We are measuring … this takes about half a minute.' },
  empty_title: { de: 'Noch keine Messung.', en: 'No measurement yet.' },
  empty_text: { de: 'Starten Sie eine – sie dauert etwa eine halbe Minute.', en: 'Start one – it takes about half a minute.' },
  summary: { de: 'Gemessen an {n} Verträgen des Beispielpakets, {ai}.', en: 'Measured on {n} contracts of the sample set, {ai}.' },
  with_ai: { de: 'mit KI-Gegenprüfung', en: 'with AI cross-check' },
  without_ai: { de: 'ohne KI-Gegenprüfung', en: 'without AI cross-check' },
  measured_at: { de: 'Stand: {when}', en: 'As of {when}' },
  unreadable_one: {
    de: '{ids} wurde als nicht lesbar an Sie weitergegeben und zählt nicht als geprüft.',
    en: '{ids} was handed to you as unreadable and does not count as checked.',
  },
  unreadable_many: {
    de: '{ids} wurden als nicht lesbar an Sie weitergegeben und zählen nicht als geprüft.',
    en: '{ids} were handed to you as unreadable and do not count as checked.',
  },
  no_gt_title: { de: 'Die Beispielverträge fehlen.', en: 'The sample contracts are missing.' },
  no_gt_text: {
    de: 'Die Messung braucht das Beispielpaket mit seiner Musterlösung. Laden Sie zuerst die Beispielverträge auf der Seite Verträge.',
    en: 'The measurement needs the sample set with its reference solution. Please load the sample contracts on the Contracts page first.',
  },
  to_contracts: { de: 'Zu den Verträgen', en: 'Go to contracts' },

  card_coverage: { de: 'Klausel-Übersicht', en: 'Clause overview' },
  card_coverage_sub: { de: 'Erkennt, welche Klauseln in einem Vertrag fehlen.', en: 'Detects which clauses a contract lacks.' },
  card_rename: { de: 'Namensregister', en: 'Name registry' },
  card_rename_sub: { de: 'Erkennt, wo ein alter Firmenname noch als Vertragspartei steht.', en: 'Detects where an old company name still appears as a contracting party.' },
  cov_precision: { de: 'Von den gemeldeten fehlenden Klauseln waren {p} richtig ({fp}).', en: 'Of the missing clauses reported, {p} were correct ({fp}).' },
  cov_recall: { de: 'Von den tatsächlich fehlenden Klauseln wurden {p} gefunden ({fn}).', en: 'Of the clauses actually missing, {p} were found ({fn}).' },
  ren_precision: { de: 'Von den gemeldeten alten Firmennamen waren {p} richtig ({fp}).', en: 'Of the old company names reported, {p} were correct ({fp}).' },
  ren_recall: { de: 'Von den Verträgen mit altem Firmennamen wurden {p} gefunden ({fn}).', en: 'Of the contracts with an old company name, {p} were found ({fn}).' },
  fp_one: { de: '1 Fehlalarm', en: '1 false alarm' },
  fp_many: { de: '{n} Fehlalarme', en: '{n} false alarms' },
  fn_n: { de: '{n} übersehen', en: '{n} missed' },
  precision: { de: 'Treffergenauigkeit (Precision)', en: 'Precision' },
  recall: { de: 'Vollständigkeit (Recall)', en: 'Recall' },
  tech_counts: { de: 'TP {tp} · FP {fp} · FN {fn} · F1 {f1}', en: 'TP {tp} · FP {fp} · FN {fn} · F1 {f1}' },
  errors_title: { de: 'Abweichungen von der Musterlösung', en: 'Deviations from the reference' },
  no_errors: { de: 'Keine Abweichungen von der Musterlösung.', en: 'No deviations from the reference.' },
  false_positive: { de: 'Fehlalarm', en: 'False alarm' },
  false_negative: { de: 'Übersehen', en: 'Missed' },

  audits_title: { de: 'Abgeschlossene Prüfungen', en: 'Completed checks' },
  audits_hint: {
    de: 'Gemessen werden Prüfungen der Art „Fehlende Klausel“ und „Alter Firmenname“ (ohne bestimmten Namen), weil nur dafür eine Musterlösung vorliegt.',
    en: 'Only checks of the kinds “Missing clause” and “Old company name” (without a specific name) are measured, because only those have a reference solution.',
  },
  audits_empty: { de: 'Noch keine abgeschlossene Prüfung. Sobald Sie eine Prüfung starten, erscheint sie hier.', en: 'No completed check yet. As soon as you start a check, it appears here.' },
  col_check: { de: 'Prüfung', en: 'Check' },
  col_verified: { de: 'Gegengeprüft', en: 'Cross-checked' },
  yes: { de: 'ja', en: 'yes' },
  no: { de: 'nein', en: 'no' },
  check_no: { de: 'Prüfung Nr. {id}', en: 'Check no. {id}' },

  extraction_title: { de: 'Lesbarkeit nach Quelle', en: 'Legibility by source' },
  extraction_hint: { de: 'Wie gut wir jede Art von Vorlage lesen konnten.', en: 'How well we could read each kind of source.' },
  col_source: { de: 'Quelle', en: 'Source' },
  col_pages: { de: 'Seiten', en: 'Pages' },
  col_methods: { de: 'Verfahren', en: 'Methods' },
  avg_hint: { de: 'Durchschnitt über alle Seiten dieser Quelle', en: 'Average over all pages of this source' },

  injection_title: { de: 'Erkennung verdächtiger Texte', en: 'Detection of suspicious text' },
  injection_hint: {
    de: 'Texte, die sich an automatische Prüfsysteme richten, sollen erkannt und ignoriert werden.',
    en: 'Text addressed to automated review systems should be detected and ignored.',
  },
  injection_none: { de: 'Kein Vertrag mit verdächtigem Text erwartet oder erkannt.', en: 'No contract with suspicious text expected or detected.' },
  col_expected: { de: 'Erwartet', en: 'Expected' },
  col_flagged: { de: 'Erkannt', en: 'Detected' },
  col_result: { de: 'Ergebnis', en: 'Result' },
  correct: { de: 'richtig', en: 'correct' },
  wrong: { de: 'falsch', en: 'wrong' },
}

// ---------------------------------------------------------------- backend shape (api.runEval is typed loosely)
type Metrics = { tp: number; fp: number; fn: number; precision: number; recall: number; f1: number }
type EvalError = { key: string; error: string }
type Scored = { metrics: Metrics; errors: EvalError[] }
type EvalAudit = { audit_id: number; kind: string; params: Record<string, string>; verified: boolean; metrics: Metrics; errors: EvalError[] }
type Extraction = Record<string, { pages: number; methods: Record<string, number>; confidence: number }>
type Injection = { id: string; expected: boolean; flagged: boolean }
type EvalResult = {
  documents: number
  unreadable: string[]
  llm_enabled: boolean
  coverage_matrix: Scored
  rename_registry: Scored
  extraction: Extraction
  audits: EvalAudit[]
  injection: Injection[]
}

/** The ground truth names sources slightly differently from the ingest pipeline. */
const INPUT_ALIAS: Record<string, string> = { jpeg_typed: 'image', jpg_typed: 'image', png_typed: 'image', jpeg_handwritten: 'image_handwritten', jpg_handwritten: 'image_handwritten' }
const INPUT_ORDER = ['digital_pdf', 'mixed_pdf', 'scanned_pdf', 'image', 'image_handwritten']

const pct = (v: number) => `${Math.round(v * 100)} %`
const legibilityWord = (v: number): 'good' | 'partial' | 'unreadable' => (v >= 0.8 ? 'good' : v >= 0.5 ? 'partial' : 'unreadable')

// ---------------------------------------------------------------- page
export default function Quality() {
  const t = useT(T)
  const c = useT(COMMON)
  const { lang } = useSettings()
  const toast = useToast()
  const navigate = useNavigate()
  const { data: docs } = usePolling(api.documents, 0, () => false)
  const [result, setResult] = useState<EvalResult | null>(null)
  const [failure, setFailure] = useState('')
  const [when, setWhen] = useState<Date | null>(null)
  const [busy, setBusy] = useState(false)

  /** "C07" → the contract's title, for tooltips on the sample ids. */
  const titleOf = (id: string): string => {
    const d = docs?.find((x) => x.filename.startsWith(`${id}_`))
    return d ? d.title || d.filename : ''
  }

  const run = async () => {
    setBusy(true)
    try {
      const r = await api.runEval()
      if (typeof r.error === 'string') {
        setFailure(r.error)
        setResult(null)
      } else {
        setResult(r as unknown as EvalResult)
        setFailure('')
      }
      setWhen(new Date())
    } catch (e) {
      toast(c('error', { msg: String(e) }))
    }
    setBusy(false)
  }

  const runButton = (
    <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={run} disabled={busy}>
      {t('run')}
    </Button>
  )

  return (
    <Stack spacing={3} sx={{ maxWidth: 1100 }}>
      <Box>
        <Typography variant="h5" sx={{ mb: 1 }}>
          {t('title')}
        </Typography>
        <Typography variant="body1" sx={{ maxWidth: 760, mb: 2 }}>
          {t('intro')}
        </Typography>
        {(result || failure) && runButton}
      </Box>

      {busy && (
        <Box>
          <LinearProgress sx={{ mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            {t('running')}
          </Typography>
        </Box>
      )}

      {!busy && !result && !failure && (
        <Paper sx={{ p: 2 }}>
          <EmptyState icon={<AssessmentOutlinedIcon sx={{ fontSize: 40 }} />} title={t('empty_title')} text={t('empty_text')} action={runButton} />
        </Paper>
      )}

      {!busy && failure && (
        <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => navigate('/contracts')}>{t('to_contracts')}</Button>}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t('no_gt_title')}
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {t('no_gt_text')}
          </Typography>
          <Details>
            <Small sx={{ fontFamily: 'monospace' }}>{failure}</Small>
          </Details>
        </Alert>
      )}

      {!busy && result && (
        <>
          <Box>
            <Typography variant="body1">{t('summary', { n: result.documents, ai: result.llm_enabled ? t('with_ai') : t('without_ai') })}</Typography>
            {when && <Small>{t('measured_at', { when: when.toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) })}</Small>}
          </Box>

          {result.unreadable.length > 0 && (
            <Alert severity="info" icon={<VisibilityOffIcon fontSize="inherit" />}>
              {t(result.unreadable.length === 1 ? 'unreadable_one' : 'unreadable_many', { ids: result.unreadable.join(', ') })}
              {result.unreadable.some(titleOf) && (
                <Small>{result.unreadable.map((id) => `${id}: ${titleOf(id)}`).filter((s) => !s.endsWith(': ')).join(' · ')}</Small>
              )}
            </Alert>
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <StageCard
              title={t('card_coverage')}
              sub={t('card_coverage_sub')}
              scored={result.coverage_matrix}
              precisionKey="cov_precision"
              recallKey="cov_recall"
              titleOf={titleOf}
            />
            <StageCard
              title={t('card_rename')}
              sub={t('card_rename_sub')}
              scored={result.rename_registry}
              precisionKey="ren_precision"
              recallKey="ren_recall"
              titleOf={titleOf}
            />
          </Box>

          <AuditsTable audits={result.audits} titleOf={titleOf} />

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <ExtractionSection extraction={result.extraction} />
            <InjectionSection injection={result.injection} titleOf={titleOf} />
          </Box>
        </>
      )}
    </Stack>
  )
}

// ---------------------------------------------------------------- shared pieces
/** "C07 · Datenschutz · Fehlalarm" — the raw key only with the technical switch. */
function ErrorLine({ error, titleOf }: { error: EvalError; titleOf: (id: string) => string }) {
  const t = useT(T)
  const { lang } = useSettings()
  const [doc, clause] = error.key.split(':')
  const parts = [doc]
  if (clause) parts.push(CLAUSE_SHORT[clause]?.[lang] ?? CLAUSE_TYPES[clause]?.[lang] ?? clause.replace(/_/g, ' '))
  parts.push(t(error.error === 'false_negative' ? 'false_negative' : 'false_positive'))
  const title = doc ? titleOf(doc) : ''
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
      <Tooltip title={title}>
        <Typography variant="body2">{parts.join(' · ')}</Typography>
      </Tooltip>
      <Tech>
        <Small sx={{ fontFamily: 'monospace' }}>
          {error.key} {error.error}
        </Small>
      </Tech>
    </Stack>
  )
}

function MetricTiles({ metrics }: { metrics: Metrics }) {
  const t = useT(T)
  const tile = (label: string, value: number) => (
    <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider' }}>
      <Typography variant="h5">{pct(value)}</Typography>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Box>
  )
  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
        {tile(t('precision'), metrics.precision)}
        {tile(t('recall'), metrics.recall)}
      </Box>
      <Tech>
        <Small sx={{ mt: 0.75, fontFamily: 'monospace' }}>{t('tech_counts', { tp: metrics.tp, fp: metrics.fp, fn: metrics.fn, f1: metrics.f1.toFixed(3) })}</Small>
      </Tech>
    </Box>
  )
}

function StageCard({
  title,
  sub,
  scored,
  precisionKey,
  recallKey,
  titleOf,
}: {
  title: string
  sub: string
  scored: Scored
  precisionKey: 'cov_precision' | 'ren_precision'
  recallKey: 'cov_recall' | 'ren_recall'
  titleOf: (id: string) => string
}) {
  const t = useT(T)
  const m = scored.metrics
  const fp = m.fp === 1 ? t('fp_one') : t('fp_many', { n: m.fp })
  return (
    <Paper sx={{ p: 2.5 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h6">{title}</Typography>
          <Small>{sub}</Small>
        </Box>
        <Stack spacing={0.5}>
          <Typography variant="body1">{t(precisionKey, { p: pct(m.precision), fp })}</Typography>
          <Typography variant="body1">{t(recallKey, { p: pct(m.recall), fn: t('fn_n', { n: m.fn }) })}</Typography>
        </Stack>
        <MetricTiles metrics={m} />
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            {t('errors_title')}
          </Typography>
          {scored.errors.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t('no_errors')}
            </Typography>
          ) : (
            <Stack spacing={0.25}>
              {scored.errors.map((e) => (
                <ErrorLine key={`${e.key}:${e.error}`} error={e} titleOf={titleOf} />
              ))}
            </Stack>
          )}
        </Box>
      </Stack>
    </Paper>
  )
}

// ---------------------------------------------------------------- finished checks
function AuditsTable({ audits, titleOf }: { audits: EvalAudit[]; titleOf: (id: string) => string }) {
  const t = useT(T)
  const c = useT(COMMON)
  const { lang } = useSettings()
  const contractType = useLabel(CONTRACT_TYPES)
  const auditTitle = (a: EvalAudit): string => {
    const scope = a.params.contract_type ? contractType(a.params.contract_type) : c('all_types')
    const kind = AUDIT_KINDS[a.kind]?.[lang] ?? a.kind
    if (a.kind === 'missing_clause') return `${kind}: ${CLAUSE_TYPES[a.params.clause_type]?.[lang] ?? a.params.clause_type} · ${scope}`
    return `${kind} · ${scope}`
  }
  const rows = [...audits].sort((a, b) => b.audit_id - a.audit_id)
  return (
    <Paper sx={{ p: 2.5 }}>
      <Typography variant="h6">{t('audits_title')}</Typography>
      <Small sx={{ mb: 1.5 }}>{t('audits_hint')}</Small>
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t('audits_empty')}
        </Typography>
      ) : (
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('col_check')}</TableCell>
                <TableCell>{t('col_verified')}</TableCell>
                <TableCell align="right">{t('precision')}</TableCell>
                <TableCell align="right">{t('recall')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.audit_id} hover>
                  <TableCell>
                    <Link component={RouterLink} to={`/checks/${a.audit_id}`} underline="hover" color="inherit">
                      {auditTitle(a)}
                    </Link>
                    <Small>{t('check_no', { id: a.audit_id })}</Small>
                    {a.errors.length > 0 && (
                      <Stack spacing={0} sx={{ mt: 0.5 }}>
                        {a.errors.map((e) => (
                          <ErrorLine key={`${e.key}:${e.error}`} error={e} titleOf={titleOf} />
                        ))}
                      </Stack>
                    )}
                    <Tech>
                      <Small sx={{ fontFamily: 'monospace' }}>
                        {a.kind} {JSON.stringify(a.params)} · {t('tech_counts', { tp: a.metrics.tp, fp: a.metrics.fp, fn: a.metrics.fn, f1: a.metrics.f1.toFixed(3) })}
                      </Small>
                    </Tech>
                  </TableCell>
                  <TableCell>{a.verified ? t('yes') : t('no')}</TableCell>
                  <TableCell align="right">{pct(a.metrics.precision)}</TableCell>
                  <TableCell align="right">{pct(a.metrics.recall)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  )
}

// ---------------------------------------------------------------- collapsed sections
function ExtractionSection({ extraction }: { extraction: Extraction }) {
  const t = useT(T)
  const c = useT(COMMON)
  const { lang } = useSettings()
  const inputType = useLabel(INPUT_TYPES)
  const pageMethod = useLabel(PAGE_METHODS)
  const norm = (k: string) => INPUT_ALIAS[k] ?? k
  const rank = (k: string) => {
    const i = INPUT_ORDER.indexOf(norm(k))
    return i < 0 ? INPUT_ORDER.length : i
  }
  const keys = Object.keys(extraction).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  return (
    <Paper sx={{ p: 2.5 }}>
      <Typography variant="h6">{t('extraction_title')}</Typography>
      <Small sx={{ mb: 1 }}>{t('extraction_hint')}</Small>
      <Details>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('col_source')}</TableCell>
                <TableCell align="right">{t('col_pages')}</TableCell>
                <TableCell>{c('legibility')}</TableCell>
                <Tech>
                  <TableCell>{t('col_methods')}</TableCell>
                </Tech>
              </TableRow>
            </TableHead>
            <TableBody>
              {keys.map((k) => {
                const b = extraction[k]
                const l = legibilityWord(b.confidence)
                const color = l === 'good' ? 'success' : l === 'partial' ? 'warning' : 'error'
                return (
                  <TableRow key={k}>
                    <TableCell>
                      {inputType(norm(k))}
                      <Tech>
                        <Small sx={{ fontFamily: 'monospace' }}>{k}</Small>
                      </Tech>
                    </TableCell>
                    <TableCell align="right">{b.pages}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <Chip size="small" variant="outlined" color={color} label={LEGIBILITY[l][lang]} />
                        <Tooltip title={t('avg_hint')}>
                          <Box sx={{ display: 'inline-flex' }}>
                            <Small>{pct(b.confidence)}</Small>
                          </Box>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                    <Tech>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
                          {Object.entries(b.methods).map(([m, n]) => (
                            <Chip key={m} size="small" variant="outlined" label={`${pageMethod(m)} ${n}`} />
                          ))}
                        </Stack>
                      </TableCell>
                    </Tech>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Details>
    </Paper>
  )
}

function InjectionSection({ injection, titleOf }: { injection: Injection[]; titleOf: (id: string) => string }) {
  const t = useT(T)
  const c = useT(COMMON)
  return (
    <Paper sx={{ p: 2.5 }}>
      <Typography variant="h6">{t('injection_title')}</Typography>
      <Small sx={{ mb: 1 }}>{t('injection_hint')}</Small>
      <Details>
        {injection.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('injection_none')}
          </Typography>
        ) : (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{c('contract')}</TableCell>
                  <TableCell>{t('col_expected')}</TableCell>
                  <TableCell>{t('col_flagged')}</TableCell>
                  <TableCell>{t('col_result')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {injection.map((i) => {
                  const ok = i.expected === i.flagged
                  const title = titleOf(i.id)
                  return (
                    <TableRow key={i.id}>
                      <TableCell>
                        {i.id}
                        {title && <Small>{title}</Small>}
                      </TableCell>
                      <TableCell>{i.expected ? t('yes') : t('no')}</TableCell>
                      <TableCell>{i.flagged ? t('yes') : t('no')}</TableCell>
                      <TableCell>
                        <Chip size="small" variant="outlined" color={ok ? 'success' : 'error'} label={ok ? t('correct') : t('wrong')} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Details>
    </Paper>
  )
}
