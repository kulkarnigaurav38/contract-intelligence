import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline'
import GridOnIcon from '@mui/icons-material/GridOn'
import HowToRegIcon from '@mui/icons-material/HowToReg'
import ManageSearchIcon from '@mui/icons-material/ManageSearch'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { api, type Audit, type Doc } from '../api'
import { useLabel, useSettings, useT } from '../i18n'
import { Small, Tech } from '../components/tech'
import { EmptyState, ErrorAlert, legibility, usePolling, useToast } from '../components/ui'
import { AUDIT_KINDS, AUDIT_QUESTIONS, AUDIT_STATUS, CLAUSE_TYPES, COMMON, CONTRACT_TYPES, CONTRACT_TYPE_KEYS } from '../vocab'

const T = {
  morning: { de: 'Guten Morgen', en: 'Good morning' },
  day: { de: 'Guten Tag', en: 'Good afternoon' },
  evening: { de: 'Guten Abend', en: 'Good evening' },
  headline: { de: 'Was möchten Sie wissen?', en: 'What would you like to know?' },
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
const VERDICT_ORDER = ['confirmed', 'unverified', 'dismissed', 'unreadable'] as const
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

// ---------------------------------------------------------------- question card
function QuestionCard({ kind, icon, children, onCheck, disabled, hint }: { kind: string; icon: ReactNode; children: ReactNode; onCheck: () => void; disabled: boolean; hint?: string }) {
  const question = useLabel(AUDIT_QUESTIONS)
  const tc = useT(COMMON)
  return (
    <Paper sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
        <Box sx={{ color: 'primary.main', display: 'flex', mt: 0.25 }}>{icon}</Box>
        <Typography variant="h6" sx={{ fontSize: 17, lineHeight: 1.35 }}>
          {question(kind)}
        </Typography>
      </Stack>
      <Box sx={{ flexGrow: 1 }}>{children}</Box>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Button variant="contained" onClick={onCheck} disabled={disabled}>
          {tc('check')}
        </Button>
        {hint && <Small>{hint}</Small>}
      </Stack>
    </Paper>
  )
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

  return (
    <Stack spacing={3} sx={{ maxWidth: 1100 }}>
      {docsError && <ErrorAlert msg={docsError} severity="warning" />}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { md: 'flex-end' } }}>
        <Box>
          <Typography variant="body1" color="text.secondary">
            {t(greetingKey())}
          </Typography>
          <Typography variant="h5">{t('headline')}</Typography>
        </Box>
        <TextField
          select
          size="small"
          label={tc('contract_type')}
          value={contractType}
          onChange={(e) => setContractType(e.target.value)}
          slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
          sx={{ minWidth: 280 }}
        >
          <MenuItem value="">{tc('all_types')}</MenuItem>
          {CONTRACT_TYPE_KEYS.map((k) => (
            <MenuItem key={k} value={k}>
              {ctypeLabel(k)}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
        <QuestionCard kind="missing_clause" icon={<GridOnIcon />} disabled={!canCheck || !clauseValue} hint={hint} onCheck={() => start('missing_clause', { clause_type: clauseValue })}>
          <TextField select fullWidth size="small" label={t('clause')} value={clauseValue} onChange={(e) => chooseClause(e.target.value)}>
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
        </QuestionCard>

        <QuestionCard kind="missing_passage" icon={<ManageSearchIcon />} disabled={!canCheck || !passage.trim()} hint={hint} onCheck={() => start('missing_passage', { passage: passage.trim() })}>
          <TextField
            fullWidth
            multiline
            size="small"
            minRows={passageFocus ? 5 : 2}
            label={t('passage')}
            placeholder={t('passage_example')}
            helperText={t('passage_help')}
            value={passage}
            onChange={(e) => setPassage(e.target.value)}
            onFocus={() => setPassageFocus(true)}
            onBlur={() => setPassageFocus(false)}
          />
        </QuestionCard>

        <QuestionCard kind="rename" icon={<DriveFileRenameOutlineIcon />} disabled={!canCheck} hint={hint} onCheck={() => start('rename', oldName.trim() ? { old_name: oldName.trim() } : {})}>
          <Typography variant="body2" color="text.secondary">
            {t('registry', { names: REGISTRY_NAMES })}
          </Typography>
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
        </QuestionCard>
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
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <Paper sx={{ p: 2.5 }}>
              <Typography variant="overline" color="text.secondary">
                {t('pending_title')}
              </Typography>
              {pending && pending.length > 0 && (
                <Stack spacing={1.5} sx={{ mt: 0.5, alignItems: 'flex-start' }}>
                  <Typography variant="body1">{pending.length === 1 ? t('pending_one') : t('pending_many', { n: pending.length })}</Typography>
                  <Button variant="contained" startIcon={<HowToRegIcon />} component={RouterLink} to="/approvals">
                    {t('to_approvals')}
                  </Button>
                </Stack>
              )}
              {pending && pending.length === 0 && (
                <Stack direction="row" spacing={1} sx={{ mt: 0.5, alignItems: 'center' }}>
                  <CheckCircleOutlinedIcon color="success" fontSize="small" />
                  <Typography variant="body1">{t('nothing_pending')}</Typography>
                </Stack>
              )}
            </Paper>

            <Paper sx={{ p: 2.5 }}>
              <Typography variant="overline" color="text.secondary">
                {t('stock_title')}
              </Typography>
              <Stack spacing={1.5} sx={{ mt: 0.5, alignItems: 'flex-start' }}>
                <Typography variant="body1">{stockParts.join(' · ')}</Typography>
                {reading && (
                  <Box sx={{ width: '100%' }}>
                    <LinearProgress variant="determinate" value={total ? (done / total) * 100 : 0} sx={{ mb: 0.75 }} />
                    <Typography variant="body2" color="text.secondary">
                      {t('reading', { done, total })}
                    </Typography>
                  </Box>
                )}
                <Button variant="outlined" startIcon={<UploadFileIcon />} component={RouterLink} to="/contracts">
                  {t('add_contracts')}
                </Button>
              </Stack>
            </Paper>
          </Box>

          <Box>
            <Typography variant="h6" sx={{ mb: 1 }}>
              {t('recent_title')}
            </Typography>
            {recent && recent.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                {t('recent_none')}
              </Typography>
            )}
            {recent && recent.length > 0 && (
              <Paper>
                <List disablePadding>
                  {recent.map((a) => (
                    <AuditRow key={a.id} audit={a} />
                  ))}
                </List>
              </Paper>
            )}
          </Box>
        </>
      )}

      {config && (
        <Tech>
          <Small>{config.llm_enabled ? t('verifier_on', { model: verifier }) : t('verifier_off')}</Small>
        </Tech>
      )}
    </Stack>
  )
}
