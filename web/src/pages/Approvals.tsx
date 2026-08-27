import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import LinearProgress from '@mui/material/LinearProgress'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tabs from '@mui/material/Tabs'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AutoModeIcon from '@mui/icons-material/AutoMode'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import EditNoteIcon from '@mui/icons-material/EditNote'
import Inventory2Icon from '@mui/icons-material/Inventory2'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import RuleIcon from '@mui/icons-material/Rule'
import { api, type Doc, type Finding, type LogEntry, type Policy, type PolicyClass, type PolicyReport } from '../api'
import { useLabel, useSettings, useT } from '../i18n'
import { Details, Small, Tech } from '../components/tech'
import { AuditKindChip, DecisionDialog, EmptyState, ErrorAlert, EvidenceList, HowFound, Reliability, ReviewChip, useFindingSentence, usePolling, useToast, VerdictChip } from '../components/ui'
import { AUDIT_KINDS, CLAUSE_TYPES, COMMON, CONTRACT_TYPES, INPUT_TYPES, LOG_ACTIONS, POLICY, POLICY_HELP, REVIEW_STATUS, VERDICT_HELP } from '../vocab'

// ---------------------------------------------------------------- words
const T = {
  header_none: { de: 'Nichts wartet auf Ihre Entscheidung.', en: 'Nothing is waiting for your decision.' },
  header_one: { de: '1 Fund wartet auf Ihre Entscheidung.', en: '1 finding is waiting for your decision.' },
  header_many: { de: '{n} Funde warten auf Ihre Entscheidung.', en: '{n} findings are waiting for your decision.' },
  intro: {
    de: 'Nichts verlässt das System ohne Ihre Entscheidung. Jede Entscheidung wird unter dem Kürzel legal.reviewer mit Zeitpunkt und Dokument-Prüfsumme protokolliert.',
    en: 'Nothing leaves the system without your decision. Every decision is logged under the reviewer legal.reviewer with time and document checksum.',
  },
  loading: { de: 'Wir laden die Funde …', en: 'Loading the findings …' },
  tab_open: { de: 'Offen ({n})', en: 'Open ({n})' },
  tab_decided: { de: 'Entschieden ({n})', en: 'Decided ({n})' },
  tab_log: { de: 'Protokoll', en: 'Activity log' },
  progress: { de: 'Fund {i} von {n}', en: 'Finding {i} of {n}' },
  finding_log: { de: 'Protokoll zu diesem Fund', en: 'Log for this finding' },
  finding_log_empty: { de: 'Noch keine Einträge zu diesem Fund.', en: 'No entries for this finding yet.' },
  done_title: { de: 'Alles erledigt.', en: 'All done.' },
  done_text: { de: 'Nichts wartet auf Ihre Freigabe.', en: 'Nothing is waiting for your approval.' },
  new_check: { de: 'Neue Prüfung starten', en: 'Start a new check' },
  col_decision: { de: 'Entscheidung', en: 'Decision' },
  col_note: { de: 'Anmerkung', en: 'Note' },
  col_storage: { de: 'Vertragsablage', en: 'Contract storage' },
  change_decision: { de: 'Entscheidung ändern', en: 'Change decision' },
  filing: { de: 'Wird abgelegt …', en: 'Filing …' },
  decided_empty: { de: 'Noch keine Entscheidungen.', en: 'No decisions yet.' },
  decided_empty_text: { de: 'Entschiedene Funde erscheinen hier mit Zeitpunkt und Anmerkung.', en: 'Decided findings appear here with time and note.' },
  log_intro: { de: 'Einträge können nachträglich nicht geändert oder gelöscht werden.', en: 'Entries cannot be changed or deleted afterwards.' },
  log_empty: { de: 'Noch keine Einträge.', en: 'No entries yet.' },
  log_empty_filter: { de: 'Keine Einträge zu dieser Auswahl.', en: 'No entries match this selection.' },
  log_auto_approved: { de: 'hat Fund Nr. {id} automatisch freigegeben', en: 'auto-approved finding no. {id}' },
  log_carried: { de: 'Entscheidung übernommen von Fund Nr. {id}', en: 'decision carried over from finding no. {id}' },
  filter_contracts: { de: 'Verträge', en: 'Contracts' },
  filter_checks: { de: 'Prüfungen', en: 'Checks' },
  filter_decisions: { de: 'Entscheidungen', en: 'Decisions' },
  filter_storage: { de: 'Ablage', en: 'Filing' },
  today: { de: 'Heute', en: 'Today' },
  yesterday: { de: 'Gestern', en: 'Yesterday' },
  system: { de: 'System', en: 'System' },
  all_types_inline: { de: 'alle Vertragsarten', en: 'all contract types' },
  registry_all: { de: 'alle bekannten alten Namen', en: 'all known old names' },
  note_line: { de: 'Anmerkung: „{note}“', en: 'Note: “{note}”' },
  storage_line: { de: 'Ablage-Nr. {ref}', en: 'Storage ref. {ref}' },
  sha_label: { de: 'SHA-256', en: 'SHA-256' },
  check_label: { de: 'Prüfung', en: 'Check' },
  document_label: { de: 'Dokument', en: 'Document' },
  // Prüflast
  policy_intro: {
    de: 'Ihre Entscheidungen senken die Prüflast: Funde, die Sie wiederholt freigegeben haben, legen wir Ihnen nur noch stichprobenartig vor. Eine Ablehnung setzt die Prüfung für diese Art von Fund sofort wieder auf 100 % zurück.',
    en: 'Your decisions lower the review load: findings you have approved repeatedly are only put to you as a sample. One rejection immediately puts this kind of finding back to 100% review.',
  },
  policy_empty: { de: 'Noch keine Entscheidungen – die Prüfquote liegt bei 100 %.', en: 'No decisions yet – the review rate is 100%.' },
  policy_empty_text: {
    de: 'Sobald Sie Funde freigeben oder ablehnen, sehen Sie hier, wie sich die Prüfquote je Frage entwickelt.',
    en: 'Once you approve or reject findings, you will see here how the review rate develops per question.',
  },
  to_open: { de: 'Zur Freigabe', en: 'Go to approvals' },
  col_question: { de: 'Frage', en: 'Question' },
  col_decisions: { de: 'Entscheidungen', en: 'Decisions' },
  col_agreement: { de: 'Übereinstimmung', en: 'Agreement' },
  col_auto: { de: 'Automatisch freigegeben', en: 'Auto-approved' },
  col_next: { de: 'Nächste Stufe', en: 'Next level' },
  rejected_of: { de: 'davon {n} abgelehnt', en: '{n} of them rejected' },
  next_tier: { de: '{n} von {m} Entscheidungen bis zur nächsten Stufe', en: '{n} of {m} decisions until the next level' },
  top_tier: { de: 'Höchste Stufe erreicht', en: 'Highest level reached' },
  agreement_low: { de: 'Wegen früherer Ablehnungen bleibt die Prüfquote vorerst bei 100 %.', en: 'Because of earlier rejections the review rate stays at 100% for now.' },
  rules_label: { de: 'Regeln', en: 'Rules' },
}

const REVIEWER = 'legal.reviewer'
type Decision = 'approved' | 'rejected'
type TabKey = 'open' | 'decided' | 'log' | 'policy'
type Data = { findings: Finding[]; docs: Doc[]; log: LogEntry[] }
type CarriedOver = Extract<Policy, { kind: 'carried_over' }>

const ALWAYS = () => true

async function load(): Promise<Data> {
  const [findings, docs, log] = await Promise.all([api.findings(), api.documents(), api.auditLog()])
  return { findings, docs, log }
}

/** Which filter chip an activity-log action belongs to. */
const CATEGORY: Record<string, string> = {
  ingest: 'contracts',
  'audit.create': 'checks',
  'finding.approved': 'decisions',
  'finding.rejected': 'decisions',
  'finding.auto_approved': 'decisions',
  'finding.pushed_to_storage': 'storage',
}
const FILTERS = ['contracts', 'checks', 'decisions', 'storage'] as const

const locale = (lang: string) => (lang === 'de' ? 'de-DE' : 'en-GB')
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s)
const pct = (x: number, lang: string) => `${Math.round(x * 100)}${lang === 'de' ? ' %' : '%'}`

/** The policy kind of a finding; findings created before the policy existed carry an empty object. */
const policyKind = (f: Finding): string => (f.policy as { kind?: string } | null | undefined)?.kind ?? ''
const carriedOver = (f: Finding): CarriedOver | null => (policyKind(f) === 'carried_over' ? (f.policy as CarriedOver) : null)
/** A carried-over rejection: the backend dismisses the verdict but leaves review_status 'pending' and reviewed_at empty. */
const carriedRejection = (f: Finding): boolean => f.review_status === 'pending' && carriedOver(f)?.decision === 'rejected'
/** When a finding was decided – by a person, by the system, or by the earlier decision it inherited. */
const decidedAt = (f: Finding): string | null => f.reviewed_at ?? carriedOver(f)?.decided_at ?? null

/** The smallest tier threshold still above the class's run of approvals; undefined once the top tier is reached. */
const nextThreshold = (rules: PolicyReport['rules'], since: number): number | undefined =>
  rules.tiers
    .map(([n]) => n)
    .filter((n) => n > since)
    .sort((a, b) => a - b)[0]

/** Formatting helpers that follow the interface language. */
function useFormat() {
  const { lang } = useSettings()
  const t = useT(T)
  const loc = locale(lang)
  return {
    quote: (s: string) => (lang === 'de' ? `„${s}“` : `“${s}”`),
    time: (iso: string) => new Date(iso).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }),
    date: (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(loc, { dateStyle: 'medium' }) : '–'),
    dateTime: (iso: string | null) => (iso ? new Date(iso).toLocaleString(loc, { dateStyle: 'medium', timeStyle: 'short' }) : '–'),
    day: (iso: string) => {
      const d = new Date(iso)
      const now = new Date()
      const yesterday = new Date()
      yesterday.setDate(now.getDate() - 1)
      if (sameDay(d, now)) return t('today')
      if (sameDay(d, yesterday)) return t('yesterday')
      return d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    },
  }
}

/** "Fehlende Klausel: Haftungsbegrenzung · Händlervertrag" from the parameters stored with a check. */
function useAuditTitle() {
  const { lang } = useSettings()
  const t = useT(T)
  const fmt = useFormat()
  const clauseLabel = useLabel(CLAUSE_TYPES)
  const typeLabel = useLabel(CONTRACT_TYPES)
  return (kind: string, params: Record<string, string>): string => {
    const base = AUDIT_KINDS[kind]?.[lang] ?? kind.replace(/_/g, ' ')
    let detail = ''
    if (kind === 'missing_clause' && params.clause_type) detail = clauseLabel(params.clause_type)
    else if (kind === 'missing_passage' && params.passage) detail = fmt.quote(truncate(params.passage, 60))
    else if (kind === 'rename' && params.old_name) detail = params.old_name
    const scope = params.contract_type ? typeLabel(params.contract_type) : t('all_types_inline')
    return `${base}${detail ? ': ' + detail : ''} · ${scope}`
  }
}

/** The question behind a finding class in plain words. A class spans all contract types, so no scope is shown. */
function useClassQuestion() {
  const { lang } = useSettings()
  const t = useT(T)
  const fmt = useFormat()
  const clauseLabel = useLabel(CLAUSE_TYPES)
  return (kind: string, params: Record<string, string>): { base: string; detail: string } => {
    const base = AUDIT_KINDS[kind]?.[lang] ?? kind.replace(/_/g, ' ')
    let detail = ''
    if (kind === 'missing_clause' && params.clause_type) detail = clauseLabel(params.clause_type)
    else if (kind === 'missing_passage' && params.passage) detail = fmt.quote(truncate(params.passage.trim(), 70))
    else if (kind === 'rename') detail = params.old_name || t('registry_all')
    return { base, detail }
  }
}

// ---------------------------------------------------------------- one activity-log entry as a sentence
function LogLine({ e, docs, findings }: { e: LogEntry; docs: Map<number, Doc>; findings: Map<number, Finding> }) {
  const t = useT(T)
  const tc = useT(COMMON)
  const la = useT(LOG_ACTIONS)
  const { lang } = useSettings()
  const fmt = useFormat()
  const auditTitle = useAuditTitle()
  const inputLabel = useLabel(INPUT_TYPES)
  const d = e.details
  const str = (v: unknown) => (typeof v === 'string' ? v : '')

  let target = ''
  const sub: string[] = []
  if (e.target_type === 'document') {
    const doc = docs.get(e.target_id)
    target = doc ? doc.title || doc.filename : str(d.filename) || `${t('document_label')} ${e.target_id}`
    if (doc && doc.title) sub.push(doc.filename)
    if (str(d.input_type)) sub.push(inputLabel(str(d.input_type)))
  } else if (e.target_type === 'audit') {
    const params = (d.params && typeof d.params === 'object' ? d.params : {}) as Record<string, string>
    target = str(d.kind) ? auditTitle(str(d.kind), params) : `${t('check_label')} ${e.target_id}`
  } else if (e.target_type === 'finding') {
    const f = findings.get(e.target_id)
    target = `${tc('finding')} ${e.target_id}`
    if (f) sub.push(f.title || f.filename)
    if (str(d.note)) sub.push(t('note_line', { note: str(d.note) }))
    if (str(d.external_id)) sub.push(t('storage_line', { ref: str(d.external_id) }))
    if (e.action === 'finding.auto_approved') {
      if (str(d.reason) === 'carried_over' && typeof d.from_finding === 'number') sub.push(t('log_carried', { id: d.from_finding }))
      else if (typeof d.review_rate === 'number') sub.push(`${tc('review_rate')} ${pct(d.review_rate, lang)}`)
    }
  }
  const sha = str(d.sha256)
  if (sha && e.target_type === 'finding') sub.push(`${tc('checksum')} ${sha.slice(0, 8)}`)

  const actor = e.actor === 'system' ? t('system') : e.actor
  const action = LOG_ACTIONS[e.action]
    ? la(e.action, { target, id: e.target_id })
    : e.action === 'finding.auto_approved'
      ? t('log_auto_approved', { id: e.target_id })
      : e.action.replace(/[._]/g, ' ')

  return (
    <Stack direction="row" spacing={2} sx={{ py: 1.25, alignItems: 'flex-start' }}>
      <Small sx={{ minWidth: 44, pt: 0.4, flexShrink: 0 }}>{fmt.time(e.ts)}</Small>
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <Typography variant="body2">
          <Box component="span" sx={{ fontWeight: 600 }}>
            {actor}
          </Box>{' '}
          {action}
        </Typography>
        {sub.length > 0 && <Small>{sub.join(' · ')}</Small>}
        <Tech>
          <Stack spacing={0.25} sx={{ mt: 0.5 }}>
            <Small sx={{ fontFamily: 'monospace' }}>
              {e.action} · {e.target_type} #{e.target_id}
            </Small>
            {sha && (
              <Small sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {t('sha_label')} {sha}
              </Small>
            )}
            <Small sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(e.details, null, 2)}</Small>
          </Stack>
        </Tech>
      </Box>
    </Stack>
  )
}

// ---------------------------------------------------------------- one pending finding
function PendingCard({
  finding: f,
  contractType,
  entries,
  docs,
  findings,
  onDecide,
}: {
  finding: Finding
  contractType: string
  entries: LogEntry[]
  docs: Map<number, Doc>
  findings: Map<number, Finding>
  onDecide: (decision: Decision) => void
}) {
  const t = useT(T)
  const tc = useT(COMMON)
  const { lang } = useSettings()
  const navigate = useNavigate()
  const sentence = useFindingSentence()
  const unreadable = f.verdict === 'unreadable'
  const verified = f.verdict === 'confirmed' || f.verdict === 'dismissed' || f.verdict === 'partial'
  const kind = policyKind(f)
  const openContract = () => navigate(`/contracts?open=${f.document_id}&page=${f.evidence[0]?.page ?? 1}`)

  return (
    <Paper sx={{ p: 2.5 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" useFlexGap spacing={1} sx={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="h6">{f.title || f.filename}</Typography>
            {contractType && (
              <Typography variant="body2" color="text.secondary">
                {contractType}
              </Typography>
            )}
            <Small>{f.filename}</Small>
          </Box>
          <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }}>
            <AuditKindChip kind={f.audit_kind} />
            <VerdictChip verdict={f.verdict} />
            {kind === 'spot_check' && (
              <Tooltip title={POLICY_HELP.spot_check[lang]}>
                <Chip size="small" variant="outlined" color="info" icon={<RuleIcon />} label={POLICY.spot_check[lang]} />
              </Tooltip>
            )}
          </Stack>
        </Stack>

        <Typography variant="body1" sx={{ fontWeight: 500 }}>
          {sentence(f)}
        </Typography>
        {unreadable && (
          <Typography variant="body2" color="text.secondary">
            {VERDICT_HELP.unreadable[lang]}
          </Typography>
        )}

        <Box>
          <EvidenceList finding={f} />
          <Button size="small" variant="text" startIcon={<OpenInNewIcon />} onClick={openContract} sx={{ mt: 0.5 }}>
            {tc('open_contract')}
          </Button>
        </Box>

        <Reliability value={f.confidence} unreadable={unreadable} />

        {f.reasoning && (
          <Box sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
            <Small sx={{ mb: 0.5 }}>{tc('reasoning')}</Small>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {f.reasoning}
            </Typography>
          </Box>
        )}

        <HowFound steps={f.method_chain} verified={verified} />

        <Details label={t('finding_log')}>
          {entries.length ? (
            <Stack divider={<Divider flexItem />}>
              {entries.map((e) => (
                <LogLine key={e.id} e={e} docs={docs} findings={findings} />
              ))}
            </Stack>
          ) : (
            <Small>{t('finding_log_empty')}</Small>
          )}
        </Details>

        <Tech>
          <Small sx={{ fontFamily: 'monospace' }}>
            {tc('finding')} #{f.id} · {t('check_label')} #{f.audit_id} · {t('document_label')} #{f.document_id} · {f.verdict} · {f.review_status}
            {kind ? ` · policy ${kind}` : ''}
            {f.class_key ? ` · ${f.class_key}` : ''}
          </Small>
        </Tech>

        <Stack direction="row" spacing={1} sx={{ pt: 0.5 }}>
          <Button variant="contained" color="success" onClick={() => onDecide('approved')}>
            {tc('approve')}
          </Button>
          <Button variant="outlined" color="inherit" onClick={() => onDecide('rejected')}>
            {tc('reject')}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  )
}

// ---------------------------------------------------------------- Prüflast: one finding class
function PolicyRow({ c, rules }: { c: PolicyClass; rules: PolicyReport['rules'] }) {
  const t = useT(T)
  const tc = useT(COMMON)
  const { lang } = useSettings()
  const question = useClassQuestion()
  const { base, detail } = question(c.kind, c.params ?? {})
  const next = nextThreshold(rules, c.since_rejection)
  const auto = c.findings?.auto_approved ?? 0
  const full = c.review_rate >= 1
  // Enough approvals in a row, but too many rejections overall: the rule stays at full review.
  const stalled = full && c.agreement !== null && c.agreement < rules.min_agreement && c.since_rejection >= rules.min_decisions

  return (
    <TableRow sx={{ verticalAlign: 'top' }}>
      <TableCell>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {base}
        </Typography>
        {detail && (
          <Typography variant="body2" color="text.secondary">
            {detail}
          </Typography>
        )}
        <Tech>
          <Small sx={{ fontFamily: 'monospace' }}>
            {c.class_key} · automation_active={String(c.automation_active)}
          </Small>
        </Tech>
      </TableCell>
      <TableCell>
        <Typography variant="body2">{c.decisions}</Typography>
        {c.decisions > 0 && <Small>{t('rejected_of', { n: c.rejected })}</Small>}
      </TableCell>
      <TableCell>
        <Typography variant="body2">{c.agreement === null ? '–' : pct(c.agreement, lang)}</Typography>
      </TableCell>
      <TableCell>
        {full ? (
          <Chip size="small" variant="outlined" label={tc('full_review')} />
        ) : (
          <Chip size="small" variant="outlined" color="info" icon={<RuleIcon />} label={tc('sample_rate', { rate: pct(c.review_rate, lang) })} />
        )}
      </TableCell>
      <TableCell>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          {auto > 0 && <AutoModeIcon fontSize="inherit" color="success" />}
          <Typography variant="body2">{auto}</Typography>
        </Stack>
      </TableCell>
      <TableCell sx={{ minWidth: 220 }}>
        <Small sx={{ mb: 0.5 }}>{next ? t('next_tier', { n: c.since_rejection, m: next }) : t('top_tier')}</Small>
        <LinearProgress variant="determinate" value={next ? Math.min(100, (c.since_rejection / next) * 100) : 100} sx={{ height: 6, borderRadius: 3 }} />
        {stalled && <Small sx={{ mt: 0.5 }}>{t('agreement_low')}</Small>}
      </TableCell>
    </TableRow>
  )
}

// ---------------------------------------------------------------- Prüflast: the whole tab
function PolicyPanel({ report, pending, onOpen }: { report: PolicyReport; pending: number; onOpen: () => void }) {
  const t = useT(T)
  const tc = useT(COMMON)
  const rules = report.rules
  const decisions = report.classes.reduce((n, c) => n + c.decisions, 0)
  const classes = [...report.classes].sort((a, b) => a.review_rate - b.review_rate || b.decisions - a.decisions)

  return (
    <>
      {decisions === 0 ? (
        <Paper>
          <EmptyState
            icon={<RuleIcon color="disabled" sx={{ fontSize: 40 }} />}
            title={t('policy_empty')}
            text={t('policy_empty_text')}
            action={
              pending > 0 ? (
                <Button variant="outlined" onClick={onOpen}>
                  {t('to_open')}
                </Button>
              ) : (
                <Button component={RouterLink} to="/checks" variant="outlined">
                  {t('new_check')}
                </Button>
              )
            }
          />
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('col_question')}</TableCell>
                <TableCell>{t('col_decisions')}</TableCell>
                <TableCell>{t('col_agreement')}</TableCell>
                <TableCell>{tc('review_rate')}</TableCell>
                <TableCell>{t('col_auto')}</TableCell>
                <TableCell>{t('col_next')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {classes.map((c) => (
                <PolicyRow key={c.class_key} c={c} rules={rules} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Tech>
        <Small sx={{ fontFamily: 'monospace' }}>
          {t('rules_label')}: min_decisions = {rules.min_decisions} · min_agreement = {rules.min_agreement} · tiers = {JSON.stringify(rules.tiers)}
        </Small>
      </Tech>
    </>
  )
}

// ---------------------------------------------------------------- page
export default function Approvals() {
  const t = useT(T)
  const tc = useT(COMMON)
  const tp = useT(POLICY)
  const { lang } = useSettings()
  const toast = useToast()
  const fmt = useFormat()
  const sentence = useFindingSentence()
  const typeLabel = useLabel(CONTRACT_TYPES)
  const { data, error, refresh } = usePolling(load, 15000, ALWAYS)

  const [tab, setTab] = useState<TabKey>('open')
  const [dlg, setDlg] = useState<{ finding: Finding; decision: Decision; fromQueue: boolean } | null>(null)
  const [doneInSession, setDoneInSession] = useState(0)
  const [filing, setFiling] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ anchor: HTMLElement; finding: Finding } | null>(null)
  const [filters, setFilters] = useState<string[]>([])
  const [policy, setPolicy] = useState<PolicyReport | null>(null)
  const [policyError, setPolicyError] = useState('')

  const findings = useMemo(() => data?.findings ?? [], [data])
  const log = useMemo(() => data?.log ?? [], [data])
  const docs = useMemo(() => new Map((data?.docs ?? []).map((d) => [d.id, d])), [data])
  const byId = useMemo(() => new Map(findings.map((f) => [f.id, f])), [findings])

  const pending = useMemo(() => findings.filter((f) => f.review_status === 'pending' && f.verdict !== 'dismissed'), [findings])
  /** Human decisions, system decisions (auto_approved) and inherited rejections alike; all can be changed. */
  const decided = useMemo(
    () =>
      findings
        .filter((f) => f.review_status !== 'pending' || carriedRejection(f))
        .sort((a, b) => (decidedAt(b) ?? '').localeCompare(decidedAt(a) ?? '') || b.id - a.id),
    [findings],
  )
  const entriesFor = (id: number) => log.filter((e) => e.target_type === 'finding' && e.target_id === id)
  /** The reviewer who took the latest decision on a finding, as recorded in the log. */
  const decidedBy = (id: number) =>
    log.find((e) => e.target_type === 'finding' && e.target_id === id && (e.action === 'finding.approved' || e.action === 'finding.rejected'))?.actor ?? REVIEWER

  // The review-load report is fetched only while its tab is open, and again after every refresh of the findings.
  useEffect(() => {
    if (tab !== 'policy') return
    let cancelled = false
    api
      .policy()
      .then((p) => {
        if (cancelled) return
        setPolicy(p)
        setPolicyError('')
      })
      .catch((e) => {
        if (!cancelled) setPolicyError(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [tab, data])

  const push = async (id: number) => {
    setFiling(id)
    try {
      const updated = await api.push(id)
      toast(tc('filed_toast', { ref: updated.storage_ref }))
      refresh()
    } catch (e) {
      toast(tc('error', { msg: String(e) }))
    }
    setFiling(null)
  }

  const onDecided = (updated: Finding) => {
    if (dlg?.fromQueue) setDoneInSession((n) => n + 1)
    if (dlg?.decision === 'approved') toast(tc('approved_toast'), { label: tc('file_now'), onClick: () => push(updated.id) })
    refresh()
  }

  const total = pending.length + doneInSession
  const current = Math.min(doneInSession + 1, total)
  const header = pending.length === 0 ? t('header_none') : pending.length === 1 ? t('header_one') : t('header_many', { n: pending.length })

  const filteredLog = filters.length ? log.filter((e) => filters.includes(CATEGORY[e.action] ?? 'other')) : log
  const groups: { key: string; label: string; entries: LogEntry[] }[] = []
  for (const e of filteredLog) {
    const key = new Date(e.ts).toDateString()
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.entries.push(e)
    else groups.push({ key, label: fmt.day(e.ts), entries: [e] })
  }
  const toggleFilter = (k: string) => setFilters((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))

  return (
    <Box sx={{ maxWidth: 1040 }}>
      <Stack spacing={0.75} sx={{ mb: 2.5 }}>
        <Typography variant="h5">{data ? header : t('loading')}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t('intro')}
        </Typography>
      </Stack>

      {error && <ErrorAlert msg={error} sx={{ mb: 2 }} />}
      {!data && !error && <LinearProgress sx={{ mb: 2 }} />}

      <Tabs value={tab} onChange={(_, v: TabKey) => setTab(v)} sx={{ mb: 2.5, borderBottom: 1, borderColor: 'divider' }}>
        <Tab value="open" label={t('tab_open', { n: pending.length })} />
        <Tab value="decided" label={t('tab_decided', { n: decided.length })} />
        <Tab value="log" label={t('tab_log')} />
        <Tab value="policy" label={tc('review_load')} />
      </Tabs>

      {/* ---------------------------------------------------------- Offen */}
      {tab === 'open' &&
        data &&
        (pending.length === 0 ? (
          <Paper>
            <EmptyState
              icon={<CheckCircleOutlinedIcon color="success" sx={{ fontSize: 40 }} />}
              title={t('done_title')}
              text={t('done_text')}
              action={
                <Button component={RouterLink} to="/checks" variant="outlined">
                  {t('new_check')}
                </Button>
              }
            />
          </Paper>
        ) : (
          <Stack spacing={2}>
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
                {t('progress', { i: current, n: total })}
              </Typography>
              <LinearProgress variant="determinate" value={total ? (doneInSession / total) * 100 : 0} sx={{ height: 6, borderRadius: 3 }} />
            </Box>
            {pending.map((f) => {
              const doc = docs.get(f.document_id)
              return (
                <PendingCard
                  key={f.id}
                  finding={f}
                  contractType={doc ? typeLabel(doc.contract_type) : ''}
                  entries={entriesFor(f.id)}
                  docs={docs}
                  findings={byId}
                  onDecide={(decision) => setDlg({ finding: f, decision, fromQueue: true })}
                />
              )
            })}
          </Stack>
        ))}

      {/* ---------------------------------------------------------- Entschieden */}
      {tab === 'decided' &&
        data &&
        (decided.length === 0 ? (
          <Paper>
            <EmptyState icon={<EditNoteIcon color="disabled" sx={{ fontSize: 40 }} />} title={t('decided_empty')} text={t('decided_empty_text')} />
          </Paper>
        ) : (
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{tc('contract')}</TableCell>
                  <TableCell>{tc('finding')}</TableCell>
                  <TableCell>{t('col_decision')}</TableCell>
                  <TableCell>{t('col_note')}</TableCell>
                  <TableCell>{t('col_storage')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {decided.map((f) => {
                  const doc = docs.get(f.document_id)
                  const auto = f.review_status === 'auto_approved'
                  const co = carriedOver(f)
                  const coRejected = carriedRejection(f)
                  return (
                    <TableRow key={f.id} sx={{ verticalAlign: 'top' }}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {f.title || f.filename}
                        </Typography>
                        <Small>{[doc ? typeLabel(doc.contract_type) : '', f.filename].filter(Boolean).join(' · ')}</Small>
                      </TableCell>
                      <TableCell>
                        <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
                          <Stack direction="row" useFlexGap spacing={0.5} sx={{ flexWrap: 'wrap' }}>
                            <AuditKindChip kind={f.audit_kind} />
                            <VerdictChip verdict={f.verdict} />
                          </Stack>
                          <Typography variant="body2">{sentence(f)}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
                          {coRejected ? (
                            <Chip size="small" variant="outlined" label={REVIEW_STATUS.rejected[lang]} />
                          ) : (
                            <ReviewChip finding={{ review_status: f.review_status, storage_ref: '' }} />
                          )}
                          <Small>
                            {auto || coRejected ? t('system') : decidedBy(f.id)} · {fmt.dateTime(decidedAt(f))}
                          </Small>
                          {co && <Small>{tp('carried_over', { date: fmt.date(co.decided_at) })}</Small>}
                          <Button size="small" variant="text" sx={{ px: 0, fontSize: 11.5 }} onClick={(ev) => setMenu({ anchor: ev.currentTarget, finding: f })}>
                            {t('change_decision')}
                          </Button>
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 240 }}>
                        <Typography variant="body2" color={f.review_note ? 'text.primary' : 'text.secondary'}>
                          {f.review_note || '–'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {f.storage_ref ? (
                          <ReviewChip finding={f} />
                        ) : f.review_status === 'approved' || auto ? (
                          <Tooltip title={tc('file_hint')}>
                            <span>
                              <Button size="small" variant="outlined" startIcon={<Inventory2Icon />} disabled={filing === f.id} onClick={() => push(f.id)}>
                                {filing === f.id ? t('filing') : tc('file')}
                              </Button>
                            </span>
                          </Tooltip>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            –
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ))}

      {/* ---------------------------------------------------------- Protokoll */}
      {tab === 'log' && data && (
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            {t('log_intro')}
          </Typography>
          <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }}>
            {FILTERS.map((k) => (
              <Chip
                key={k}
                clickable
                label={t(`filter_${k}`)}
                color={filters.includes(k) ? 'primary' : 'default'}
                variant={filters.includes(k) ? 'filled' : 'outlined'}
                onClick={() => toggleFilter(k)}
              />
            ))}
          </Stack>
          {groups.length === 0 ? (
            <Paper>
              <EmptyState title={log.length ? t('log_empty_filter') : t('log_empty')} />
            </Paper>
          ) : (
            groups.map((g) => (
              <Box key={g.key}>
                <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  {g.label}
                </Typography>
                <Paper sx={{ px: 2 }}>
                  <Stack divider={<Divider flexItem />}>
                    {g.entries.map((e) => (
                      <LogLine key={e.id} e={e} docs={docs} findings={byId} />
                    ))}
                  </Stack>
                </Paper>
              </Box>
            ))
          )}
        </Stack>
      )}

      {/* ---------------------------------------------------------- Prüflast */}
      {tab === 'policy' && (
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            {t('policy_intro')}
          </Typography>
          {policyError && <ErrorAlert msg={policyError} />}
          {!policy && !policyError && <LinearProgress />}
          {policy && <PolicyPanel report={policy} pending={pending.length} onOpen={() => setTab('open')} />}
        </Stack>
      )}

      <Menu open={!!menu} anchorEl={menu?.anchor ?? null} onClose={() => setMenu(null)}>
        {(['approved', 'rejected'] as Decision[]).map((decision) => (
          <MenuItem
            key={decision}
            onClick={() => {
              if (menu) setDlg({ finding: menu.finding, decision, fromQueue: false })
              setMenu(null)
            }}
          >
            {decision === 'approved' ? tc('approve') : tc('reject')}
          </MenuItem>
        ))}
      </Menu>

      <DecisionDialog finding={dlg?.finding ?? null} decision={dlg?.decision ?? 'approved'} onClose={() => setDlg(null)} onDone={onDecided} />
    </Box>
  )
}
