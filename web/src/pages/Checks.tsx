import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Link as RouterLink, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import RuleIcon from '@mui/icons-material/Rule'
import ManageSearchIcon from '@mui/icons-material/ManageSearch'
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline'
import ReplayIcon from '@mui/icons-material/Replay'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined'
import { api, type Audit, type Doc, type Finding } from '../api'
import { useLabel, useSettings, useT, type Lang } from '../i18n'
import { Details, Small, Tech } from '../components/tech'
import {
  DecisionDialog,
  EmptyState,
  EvidenceList,
  HowFound,
  Reliability,
  ReviewChip,
  VerdictChip,
  useFindingSentence,
  usePolling,
  useToast,
} from '../components/ui'
import { AUDIT_KINDS, AUDIT_QUESTIONS, AUDIT_STATUS, CLAUSE_TYPES, COMMON, CONTRACT_TYPES, CONTRACT_TYPE_KEYS } from '../vocab'

const T = {
  title: { de: 'Prüfungen', en: 'Checks' },
  new_check: { de: 'Neue Prüfung', en: 'New check' },
  clause: { de: 'Klausel', en: 'Clause' },
  gap_1: { de: '(1 fehlt)', en: '(1 missing)' },
  gap_n: { de: '({n} fehlen)', en: '({n} missing)' },
  passage: { de: 'Regelung (sinngemäß)', en: 'Passage (in substance)' },
  passage_help: { de: 'Der Wortlaut muss nicht exakt stimmen – sinngemäß reicht.', en: 'The wording need not match exactly – the substance is enough.' },
  old_name: { de: 'Alter Firmenname (optional)', en: 'Old company name (optional)' },
  old_name_help: {
    de: 'Leer lassen = alle bekannten alten Namen: arvato Financial Solutions, Arvato Payment Solutions GmbH, AFS',
    en: 'Leave empty = all known old names: arvato Financial Solutions, Arvato Payment Solutions GmbH, AFS',
  },
  past: { de: 'Bisherige Prüfungen', en: 'Past checks' },
  past_empty: { de: 'Noch keine Prüfung', en: 'No checks yet' },
  past_empty_text: { de: 'Wählen Sie oben eine Frage und starten Sie die erste Prüfung.', en: 'Choose a question above and start the first check.' },
  again: { de: 'Erneut prüfen', en: 'Check again' },
  all_types_short: { de: 'alle Vertragsarten', en: 'all contract types' },
  pick_title: { de: 'Keine Prüfung ausgewählt', en: 'No check selected' },
  pick_text: { de: 'Wählen Sie links eine Prüfung aus oder starten Sie eine neue.', en: 'Select a check on the left or start a new one.' },
  not_found: { de: 'Diese Prüfung gibt es nicht.', en: 'This check does not exist.' },
  running_1: { de: 'Wir lesen 1 Vertrag … das dauert meist unter einer Minute.', en: 'We are reading 1 contract … this usually takes less than a minute.' },
  running_n: { de: 'Wir lesen {n} Verträge … das dauert meist unter einer Minute.', en: 'We are reading {n} contracts … this usually takes less than a minute.' },
  running_x: { de: 'Wir lesen Ihre Verträge … das dauert meist unter einer Minute.', en: 'We are reading your contracts … this usually takes less than a minute.' },
  failed: { de: 'Die Prüfung ist fehlgeschlagen.', en: 'The check failed.' },
  // summary sentence, singular / plural variants
  scope_1: { de: '1 Vertrag geprüft:', en: '1 contract checked:' },
  scope_n: { de: '{n} Verträge geprüft:', en: '{n} contracts checked:' },
  scope_empty: { de: 'Kein Vertrag lag im Prüfumfang. Fügen Sie zuerst Verträge hinzu.', en: 'No contract was in scope. Please add contracts first.' },
  all_clear: { de: 'Kein Vertrag im Prüfumfang ist auffällig.', en: 'No contract in scope is flagged.' },
  rename_hit_1: { de: '1 nennt noch den alten Firmennamen', en: '1 still names the old company name' },
  rename_hit_n: { de: '{n} nennen noch den alten Firmennamen', en: '{n} still name the old company name' },
  clause_hit_1: { de: '1 enthält keine Klausel {x}', en: '1 lacks a {x} clause' },
  clause_hit_n: { de: '{n} enthalten keine Klausel {x}', en: '{n} lack a {x} clause' },
  passage_hit_1: { de: '1 enthält die Regelung nicht', en: '1 does not contain the passage' },
  passage_hit_n: { de: '{n} enthalten die Regelung nicht', en: '{n} do not contain the passage' },
  fine_1: { de: '1 ist unauffällig', en: '1 is fine' },
  fine_n: { de: '{n} sind unauffällig', en: '{n} are fine' },
  has_1: { de: '1 enthält sie', en: '1 contains it' },
  has_n: { de: '{n} enthalten sie', en: '{n} contain it' },
  hist_1: { de: '1 nennt den alten Namen nur als historischen Verweis', en: '1 names the old name only as a historical reference' },
  hist_n: { de: '{n} nennen den alten Namen nur als historischen Verweis', en: '{n} name the old name only as a historical reference' },
  dismissed_1: { de: '1 wurde von der KI-Gegenprüfung entkräftet', en: '1 was cleared by the AI cross-check' },
  dismissed_n: { de: '{n} wurden von der KI-Gegenprüfung entkräftet', en: '{n} were cleared by the AI cross-check' },
  unclear_1: { de: '1 ist unklar', en: '1 is unclear' },
  unclear_n: { de: '{n} sind unklar', en: '{n} are unclear' },
  unreadable_1: { de: '1 konnte nicht gelesen werden und gilt nicht als geprüft', en: '1 could not be read and does not count as checked' },
  unreadable_n: { de: '{n} konnten nicht gelesen werden und gelten nicht als geprüft', en: '{n} could not be read and do not count as checked' },
  tile_hits: { de: 'auffällig', en: 'flagged' },
  tile_fine: { de: 'unauffällig', en: 'fine' },
  tile_unclear: { de: 'unklar', en: 'unclear' },
  tile_unreadable: { de: 'nicht lesbar', en: 'unreadable' },
  verifier: { de: 'KI-Gegenprüfung: {m}', en: 'AI cross-check: {m}' },
  to_approvals: { de: 'Zur Freigabe ({n} offen)', en: 'To approvals ({n} pending)' },
  col_result: { de: 'Ergebnis', en: 'Result' },
  col_decision: { de: 'Entscheidung', en: 'Decision' },
  unreadable_long: {
    de: 'Seiten konnten nicht zuverlässig gelesen werden. Dieser Vertrag wurde nicht geprüft. Bitte prüfen Sie das Original.',
    en: 'Pages could not be read reliably. This contract was not checked. Please check the original.',
  },
}
type Key = keyof typeof T

/** Plural contract-type words for check sentences ("… · Händlerverträge"). */
const TYPE_PLURAL: Record<string, { de: string; en: string }> = {
  merchant_agreement: { de: 'Händlerverträge', en: 'Merchant agreements' },
  dpa: { de: 'Auftragsverarbeitungsverträge (AVV)', en: 'Data processing agreements (DPA)' },
  nda: { de: 'Geheimhaltungsvereinbarungen (NDA)', en: 'Non-disclosure agreements (NDA)' },
  vendor_agreement: { de: 'Lieferantenverträge', en: 'Vendor agreements' },
  receivables_purchase: { de: 'Forderungskaufverträge', en: 'Receivables purchase agreements' },
  collection_services: { de: 'Inkassodienstleistungsverträge', en: 'Collection services agreements' },
  saas_agreement: { de: 'SaaS-Verträge', en: 'SaaS agreements' },
  amendment: { de: 'Nachträge', en: 'Amendments' },
}

const KIND_ICONS: Record<string, ReactNode> = {
  missing_clause: <RuleIcon fontSize="small" />,
  missing_passage: <ManageSearchIcon fontSize="small" />,
  rename: <DriveFileRenameOutlineIcon fontSize="small" />,
}

type AuditDetail = Audit & { findings: Finding[] }
type Prefill = { kind?: string; clause_type?: string; passage?: string; old_name?: string; contract_type?: string }

// stable predicates for usePolling (an inline arrow would reset the timer on every render)
const NEVER = () => false
const ANY_RUNNING = (list: Audit[] | null) => !!list?.some((a) => a.status === 'running')
const IS_RUNNING = (a: AuditDetail | null) => a?.status === 'running'

const num = (s: Audit['summary'], k: string): number => (typeof s[k] === 'number' ? (s[k] as number) : 0)
const verdictCounts = (s: Audit['summary']): Record<string, number> => (typeof s.findings === 'object' && s.findings ? s.findings : {})
const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() + '…' : s)
const quoted = (s: string, lang: Lang) => (lang === 'de' ? `„${s}“` : `“${s}”`)
const fmtDate = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })
const firstPage = (f: Finding) => f.evidence.find((e) => e.page > 0)?.page ?? 1

/** "Fehlende Klausel: Haftungsbegrenzung · Händlerverträge" — one line naming a check. */
function useCheckLabel() {
  const { lang } = useSettings()
  const t = useT(T)
  return (a: Pick<Audit, 'kind' | 'params'>): string => {
    const p = a.params
    const kind = AUDIT_KINDS[a.kind]?.[lang] ?? a.kind
    const detail =
      a.kind === 'missing_clause'
        ? (CLAUSE_TYPES[p.clause_type]?.[lang] ?? p.clause_type ?? '')
        : a.kind === 'missing_passage'
          ? quoted(trunc((p.passage ?? '').replace(/\s+/g, ' '), 60), lang)
          : p.old_name
            ? quoted(p.old_name, lang)
            : ''
    const scope = p.contract_type ? (TYPE_PLURAL[p.contract_type]?.[lang] ?? CONTRACT_TYPES[p.contract_type]?.[lang] ?? p.contract_type) : t('all_types_short')
    return `${kind}${detail ? ': ' + detail : ''} · ${scope}`
  }
}

/** The one human sentence above the tiles, built per kind from the summary. */
function useSummarySentence() {
  const { lang } = useSettings()
  const t = useT(T)
  const pl = (n: number, base: string, vars?: Record<string, string | number>) => t(`${base}_${n === 1 ? '1' : 'n'}` as Key, { n, ...vars })
  return (a: Audit): string => {
    const s = a.summary
    const v = verdictCounts(s)
    const scope = num(s, 'scope')
    // uncertain contracts are reported as (unverified) findings too, but they are not hits
    const unclear = num(s, 'uncertain')
    const hits = Math.max(0, (v.confirmed ?? 0) + (v.unverified ?? 0) - unclear)
    const unreadable = num(s, 'unreadable')
    if (scope === 0) return t('scope_empty')
    if (hits === 0 && unclear === 0) return t('all_clear') + (unreadable ? ' ' + pl(unreadable, 'unreadable') + '.' : '')
    const parts: string[] = []
    if (hits > 0) {
      if (a.kind === 'rename') parts.push(pl(hits, 'rename_hit'))
      else if (a.kind === 'missing_clause')
        parts.push(pl(hits, 'clause_hit', { x: quoted(CLAUSE_TYPES[a.params.clause_type]?.[lang] ?? a.params.clause_type ?? '', lang) }))
      else parts.push(pl(hits, 'passage_hit'))
    }
    if (unclear) parts.push(pl(unclear, 'unclear'))
    const present = num(s, 'present')
    if (present) parts.push(pl(present, a.kind === 'rename' ? 'fine' : 'has'))
    const hist = num(s, 'historical_only')
    if (hist) parts.push(pl(hist, 'hist'))
    if (v.dismissed) parts.push(pl(v.dismissed, 'dismissed'))
    if (unreadable) parts.push(pl(unreadable, 'unreadable'))
    return `${pl(scope, 'scope')} ${parts.join(', ')}.`
  }
}

function Tile({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <Paper sx={{ p: 1.5 }}>
      <Typography variant="h4" sx={{ fontWeight: 600, lineHeight: 1.1, color: n > 0 ? color : 'text.disabled' }}>
        {n}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Paper>
  )
}

// ---------------------------------------------------------------- right column
function SelectedCheck({ id, inScope, onChanged }: { id: number; inScope: (contractType: string) => number | null; onChanged: () => void }) {
  const t = useT(T)
  const c = useT(COMMON)
  const { lang } = useSettings()
  const navigate = useNavigate()
  const label = useCheckLabel()
  const sentence = useSummarySentence()
  const findingSentence = useFindingSentence()
  const statusLabel = useLabel(AUDIT_STATUS)
  const { data: audit, error, refresh } = usePolling(() => api.audit(id), 1500, IS_RUNNING)
  const [open, setOpen] = useState<number | null>(null)
  const [decision, setDecision] = useState<{ finding: Finding; decision: 'approved' | 'rejected' } | null>(null)
  const wasRunning = audit?.status === 'running'
  useEffect(() => {
    if (audit && !wasRunning) onChanged()
  }, [wasRunning]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <EmptyState title={t('not_found')} />
  if (!audit) return <LinearProgress />

  const s = audit.summary
  const v = verdictCounts(s)
  const verified = s.verified === true
  const unclear = num(s, 'uncertain')
  const hits = Math.max(0, (v.confirmed ?? 0) + (v.unverified ?? 0) - unclear)
  const fine = num(s, 'present') + num(s, 'historical_only') + (v.dismissed ?? 0)
  const rows = [...audit.findings].sort((a, b) => Number(a.verdict === 'dismissed') - Number(b.verdict === 'dismissed'))
  const isPending = (f: Finding) => f.review_status === 'pending' && f.verdict !== 'dismissed'
  const pendingCount = rows.filter(isPending).length
  const scopeCount = inScope(audit.params.contract_type ?? '')

  return (
    <Stack spacing={2} sx={{ minWidth: 0 }}>
      <Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="h6">{label(audit)}</Typography>
          <Chip size="small" variant="outlined" color={audit.status === 'failed' ? 'error' : audit.status === 'running' ? 'info' : 'default'} label={statusLabel(audit.status)} />
        </Stack>
        <Small>{fmtDate(audit.created_at, lang)}</Small>
      </Box>

      {audit.status === 'running' && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="body1" sx={{ mb: 1.5 }}>
            {scopeCount === null ? t('running_x') : scopeCount === 1 ? t('running_1') : t('running_n', { n: scopeCount })}
          </Typography>
          <LinearProgress />
        </Paper>
      )}

      {audit.status === 'failed' && (
        <Alert severity="error">
          <Typography variant="body2" sx={{ mb: 0.5 }}>
            {t('failed')}
          </Typography>
          {typeof s.error === 'string' && (
            <Details>
              <Small sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{s.error}</Small>
            </Details>
          )}
        </Alert>
      )}

      {audit.status === 'done' && (
        <>
          <Typography variant="body1" sx={{ fontSize: 17 }}>
            {sentence(audit)}
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 1.5 }}>
            <Tile n={hits} label={t('tile_hits')} color="error.main" />
            <Tile n={fine} label={t('tile_fine')} color="success.main" />
            <Tile n={unclear} label={t('tile_unclear')} color="warning.main" />
            <Tile n={num(s, 'unreadable')} label={t('tile_unreadable')} color="text.secondary" />
          </Box>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip size="small" variant="outlined" color={verified ? 'success' : 'warning'} label={verified ? c('verified_yes') : c('verified_no')} />
            <Tech>{typeof s.verifier === 'string' && <Small sx={{ fontFamily: 'monospace' }}>{t('verifier', { m: s.verifier })}</Small>}</Tech>
          </Stack>

          {rows.length > 0 && (
            <Box>
              {pendingCount > 0 && (
                <Link component={RouterLink} to="/approvals" variant="body2" underline="hover" sx={{ display: 'inline-block', mb: 1 }}>
                  {t('to_approvals', { n: pendingCount })}
                </Link>
              )}
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 36 }} />
                      <TableCell>{c('contract')}</TableCell>
                      <TableCell>{t('col_result')}</TableCell>
                      <TableCell>{c('evidence')}</TableCell>
                      <TableCell>{t('col_decision')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((f) => {
                      const isOpen = open === f.id
                      const quote = f.evidence[0]
                      return (
                        <Fragment key={f.id}>
                          <TableRow hover onClick={() => setOpen(isOpen ? null : f.id)} sx={{ cursor: 'pointer', '& > td': { borderBottom: isOpen ? 'none' : undefined } }}>
                            <TableCell sx={{ color: 'text.secondary' }}>{isOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}</TableCell>
                            <TableCell>
                              <Typography variant="body2">{f.title || f.filename}</Typography>
                              <Small>{f.filename}</Small>
                            </TableCell>
                            <TableCell>
                              <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
                                <VerdictChip verdict={f.verdict} />
                                <Typography variant="body2">{f.verdict === 'unreadable' ? t('unreadable_long') : findingSentence(f)}</Typography>
                              </Stack>
                            </TableCell>
                            <TableCell sx={{ maxWidth: 260 }}>
                              {quote ? (
                                <>
                                  <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                                    {quoted(trunc(quote.quote.replace(/\s+/g, ' '), 70), lang)}
                                  </Typography>
                                  {quote.page > 0 && <Small>{c('page', { n: quote.page })}</Small>}
                                </>
                              ) : (
                                <Typography variant="body2" color="text.disabled">
                                  –
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              <ReviewChip finding={f} />
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell colSpan={5} sx={{ py: 0, borderBottom: isOpen ? undefined : 'none' }}>
                              <Collapse in={isOpen} unmountOnExit>
                                <Stack spacing={1.5} sx={{ py: 2, pl: 4.5 }}>
                                  <EvidenceList finding={f} />
                                  <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                                    <Button size="small" startIcon={<OpenInNewIcon />} onClick={() => navigate(`/contracts?open=${f.document_id}&page=${firstPage(f)}`)}>
                                      {c('open_contract')}
                                    </Button>
                                    <Reliability value={f.confidence} unreadable={f.verdict === 'unreadable'} />
                                  </Stack>
                                  {f.reasoning && (
                                    <Box sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
                                      <Small sx={{ mb: 0.5 }}>{c('reasoning')}</Small>
                                      <Typography variant="body2">{f.reasoning}</Typography>
                                    </Box>
                                  )}
                                  <HowFound steps={f.method_chain} verified={f.verdict === 'confirmed' || f.verdict === 'dismissed'} />
                                  {isPending(f) && (
                                    <Stack direction="row" spacing={1}>
                                      <Button variant="contained" color="success" onClick={() => setDecision({ finding: f, decision: 'approved' })}>
                                        {c('approve')}
                                      </Button>
                                      <Button variant="outlined" color="inherit" onClick={() => setDecision({ finding: f, decision: 'rejected' })}>
                                        {c('reject')}
                                      </Button>
                                    </Stack>
                                  )}
                                </Stack>
                              </Collapse>
                            </TableCell>
                          </TableRow>
                        </Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </>
      )}

      <DecisionDialog
        finding={decision?.finding ?? null}
        decision={decision?.decision ?? 'approved'}
        onClose={() => setDecision(null)}
        onDone={() => {
          refresh()
          onChanged()
        }}
      />
    </Stack>
  )
}

// ---------------------------------------------------------------- page
export default function Checks() {
  const t = useT(T)
  const c = useT(COMMON)
  const { lang } = useSettings()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { id } = useParams()
  const selectedId = id && /^\d+$/.test(id) ? Number(id) : null
  const label = useCheckLabel()
  const statusLabel = useLabel(AUDIT_STATUS)
  const typeLabel = useLabel(CONTRACT_TYPES)

  const audits = usePolling(api.audits, 3000, ANY_RUNNING)
  const { data: config } = usePolling(api.config, 0, NEVER)
  const { data: coverage } = usePolling(api.coverage, 0, NEVER)
  const { data: docs } = usePolling(api.documents, 0, NEVER)

  const [kind, setKind] = useState('missing_clause')
  const [clauseType, setClauseType] = useState('')
  const [passage, setPassage] = useState('')
  const [oldName, setOldName] = useState('')
  const [contractType, setContractType] = useState('')
  const [busy, setBusy] = useState(false)

  const fill = (p: Prefill) => {
    if (p.kind && AUDIT_KINDS[p.kind]) setKind(p.kind)
    if (p.clause_type !== undefined) setClauseType(p.clause_type)
    if (p.passage !== undefined) setPassage(p.passage)
    if (p.old_name !== undefined) setOldName(p.old_name)
    if (p.contract_type !== undefined) setContractType(p.contract_type)
  }

  // Location state or ?kind=&clause_type= may preselect the form.
  useEffect(() => {
    const st = (location.state ?? null) as Prefill | null
    const fromQuery: Prefill = {}
    for (const k of ['kind', 'clause_type', 'passage', 'old_name', 'contract_type'] as const) {
      const v = searchParams.get(k)
      if (v) fromQuery[k] = v
    }
    const p = { ...fromQuery, ...st }
    if (Object.keys(p).length) fill(p)
  }, [location.state, searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  const taxonomy = config?.taxonomy ?? []
  const gaps = (ct: string) => (coverage?.rows ?? []).filter((r) => (!contractType || r.contract_type === contractType) && !r.cells[ct]).length
  const inScope = (ct: string): number | null =>
    docs ? docs.filter((d: Doc) => d.status === 'ready' && (!ct || d.contract_type === ct)).length : null

  const ready = kind === 'missing_clause' ? !!clauseType : kind === 'missing_passage' ? !!passage.trim() : true

  const start = async () => {
    setBusy(true)
    try {
      const params: Record<string, string> = {}
      if (kind === 'missing_clause') params.clause_type = clauseType
      if (kind === 'missing_passage') params.passage = passage.trim()
      if (kind === 'rename' && oldName.trim()) params.old_name = oldName.trim()
      if (contractType) params.contract_type = contractType
      const a = await api.createAudit(kind, params, lang)
      audits.refresh()
      navigate(`/checks/${a.id}`)
    } catch (e) {
      toast(c('error', { msg: String(e) }))
    }
    setBusy(false)
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5">{t('title')}</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(320px, 400px) 1fr' }, gap: 3, alignItems: 'start' }}>
        <Stack spacing={2}>
          <Paper sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Typography variant="h6">{t('new_check')}</Typography>
              <ToggleButtonGroup exclusive fullWidth orientation="vertical" value={kind} onChange={(_, v: string | null) => v && setKind(v)}>
                {Object.keys(AUDIT_QUESTIONS).map((k) => (
                  <ToggleButton key={k} value={k} sx={{ justifyContent: 'flex-start', textAlign: 'left', gap: 1.5, lineHeight: 1.3, py: 1 }}>
                    {KIND_ICONS[k]}
                    {AUDIT_QUESTIONS[k][lang]}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>

              {kind === 'missing_clause' && (
                <TextField select fullWidth label={t('clause')} value={clauseType} onChange={(e) => setClauseType(e.target.value)}>
                  {taxonomy.map((k) => {
                    const n = gaps(k)
                    return (
                      <MenuItem key={k} value={k}>
                        {CLAUSE_TYPES[k]?.[lang] ?? k} {n === 1 ? t('gap_1') : t('gap_n', { n })}
                      </MenuItem>
                    )
                  })}
                </TextField>
              )}
              {kind === 'missing_passage' && (
                <TextField fullWidth multiline minRows={3} label={t('passage')} helperText={t('passage_help')} value={passage} onChange={(e) => setPassage(e.target.value)} />
              )}
              {kind === 'rename' && (
                <TextField fullWidth label={t('old_name')} helperText={t('old_name_help')} value={oldName} onChange={(e) => setOldName(e.target.value)} />
              )}

              <TextField select fullWidth label={c('contract_type')} value={contractType} onChange={(e) => setContractType(e.target.value)}>
                <MenuItem value="">{c('all_types')}</MenuItem>
                {CONTRACT_TYPE_KEYS.map((k) => (
                  <MenuItem key={k} value={k}>
                    {typeLabel(k)}
                  </MenuItem>
                ))}
              </TextField>

              <Button variant="contained" startIcon={<FactCheckOutlinedIcon />} disabled={!ready || busy} onClick={start}>
                {c('start_check')}
              </Button>
            </Stack>
          </Paper>

          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              {t('past')}
            </Typography>
            {audits.data && audits.data.length === 0 ? (
              <EmptyState title={t('past_empty')} text={t('past_empty_text')} />
            ) : (
              <List disablePadding>
                {(audits.data ?? []).map((a) => (
                  <ListItemButton key={a.id} selected={a.id === selectedId} onClick={() => navigate(`/checks/${a.id}`)} sx={{ borderRadius: 1, alignItems: 'flex-start', px: 1 }}>
                    <Stack spacing={0.5} sx={{ width: '100%' }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <Typography variant="body2">{label(a)}</Typography>
                        <Chip size="small" variant="outlined" color={a.status === 'failed' ? 'error' : a.status === 'running' ? 'info' : 'default'} label={statusLabel(a.status)} sx={{ flexShrink: 0 }} />
                      </Stack>
                      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                        <Small>{fmtDate(a.created_at, lang)}</Small>
                        <Button
                          size="small"
                          variant="text"
                          startIcon={<ReplayIcon />}
                          sx={{ px: 0.5, py: 0, fontSize: 11.5, minWidth: 0 }}
                          onClick={(e) => {
                            e.stopPropagation()
                            fill({ kind: a.kind, clause_type: '', passage: '', old_name: '', contract_type: '', ...a.params })
                          }}
                        >
                          {t('again')}
                        </Button>
                      </Stack>
                    </Stack>
                  </ListItemButton>
                ))}
              </List>
            )}
          </Paper>
        </Stack>

        {selectedId === null ? (
          <Paper sx={{ p: 2 }}>
            <EmptyState icon={<FactCheckOutlinedIcon sx={{ fontSize: 40 }} />} title={t('pick_title')} text={t('pick_text')} />
          </Paper>
        ) : (
          <SelectedCheck key={selectedId} id={selectedId} inScope={inScope} onChanged={audits.refresh} />
        )}
      </Box>
    </Stack>
  )
}
