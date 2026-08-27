import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import SearchIcon from '@mui/icons-material/Search'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import HowToRegIcon from '@mui/icons-material/HowToReg'
import Inventory2Icon from '@mui/icons-material/Inventory2'
import AutoModeIcon from '@mui/icons-material/AutoMode'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined'
import { api, type Doc, type Evidence as EvidenceT, type Finding } from '../api'
import { useSettings, useT } from '../i18n'
import { Details, Small, Tech } from './tech'
import { AUDIT_KINDS, CLAUSE_TYPES, COMMON, LEGIBILITY, POLICY_HELP, RELIABILITY, REVIEW_STATUS, VERDICTS, VERDICT_HELP } from '../vocab'

// ---------------------------------------------------------------- data
/** Poll `fn` every `ms` while `active`; always fetch once on mount. `refresh()` refetches now. */
export function usePolling<T>(fn: () => Promise<T>, ms: number, active: (data: T | null) => boolean) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    fn()
      .then((d) => !cancelled && (setData(d), setError('')))
      .catch((e) => !cancelled && setError(String(e)))
    return () => {
      cancelled = true
    }
  }, [tick]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!active(data)) return
    const id = setTimeout(() => setTick((t) => t + 1), ms)
    return () => clearTimeout(id)
  }, [data, ms, active])
  return { data, error, refresh: () => setTick((t) => t + 1) }
}

// ---------------------------------------------------------------- toasts
const ToastCtx = createContext<(message: string, action?: { label: string; onClick: () => void }) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; action?: { label: string; onClick: () => void } } | null>(null)
  return (
    <ToastCtx.Provider value={(message, action) => setToast({ message, action })}>
      {children}
      <Snackbar
        open={!!toast}
        autoHideDuration={6000}
        onClose={() => setToast(null)}
        message={toast?.message}
        action={
          toast?.action && (
            <Button color="inherit" size="small" onClick={() => (toast.action?.onClick(), setToast(null))}>
              {toast.action.label}
            </Button>
          )
        }
      />
    </ToastCtx.Provider>
  )
}

// ---------------------------------------------------------------- derived facts
/** Legibility from the OCR'd pages only (a page read from its text layer or by the vision model is fine). Mirrors the backend gates. */
export function legibility(doc: Pick<Doc, 'ingest_summary' | 'status'>): 'good' | 'partial' | 'unreadable' | 'reading' {
  if (doc.status === 'queued' || doc.status === 'processing') return 'reading'
  const ocr = doc.ingest_summary.filter((p) => p.method === 'tesseract').map((p) => p.confidence)
  if (!ocr.length) return 'good'
  const min = Math.min(...ocr)
  return min >= 0.8 ? 'good' : min >= 0.5 ? 'partial' : 'unreadable'
}

export const reliability = (value: number): 'high' | 'medium' | 'low' => (value >= 0.8 ? 'high' : value >= 0.5 ? 'medium' : 'low')

/** The finding in one plain sentence, built from what was checked. */
export function useFindingSentence() {
  const { lang } = useSettings()
  const t = useT(COMMON)
  return (f: Pick<Finding, 'verdict' | 'audit_kind' | 'audit_params'>): string => {
    if (f.verdict === 'unreadable') return t('sentence_unreadable')
    if (f.audit_kind === 'missing_clause') return t('sentence_missing_clause', { x: CLAUSE_TYPES[f.audit_params.clause_type]?.[lang] ?? f.audit_params.clause_type })
    if (f.audit_kind === 'missing_passage') return t('sentence_missing_passage', { x: (f.audit_params.passage ?? '').slice(0, 80) + ((f.audit_params.passage ?? '').length > 80 ? '…' : '') })
    return t('sentence_rename')
  }
}

// ---------------------------------------------------------------- chips
export function VerdictChip({ verdict }: { verdict: string }) {
  const { lang } = useSettings()
  const icon = verdict === 'unreadable' ? <VisibilityOffIcon /> : verdict === 'dismissed' ? <CheckCircleOutlineIcon /> : <SearchIcon />
  const color = verdict === 'confirmed' ? 'error' : verdict === 'unverified' || verdict === 'partial' ? 'warning' : verdict === 'dismissed' ? 'success' : 'info'
  return (
    <Tooltip title={VERDICT_HELP[verdict]?.[lang] ?? ''}>
      <Chip size="small" icon={icon} label={VERDICTS[verdict]?.[lang] ?? verdict} color={color} variant={verdict === 'dismissed' ? 'outlined' : 'filled'} />
    </Tooltip>
  )
}

/** Human decision; the check icon is reserved for people. `filed` when a storage reference exists. */
export function ReviewChip({ finding }: { finding: Pick<Finding, 'review_status' | 'storage_ref'> }) {
  const { lang } = useSettings()
  if (finding.storage_ref)
    return <Chip size="small" icon={<Inventory2Icon />} color="success" label={`${REVIEW_STATUS.filed[lang]} · ${finding.storage_ref}`} />
  const s = finding.review_status
  if (s === 'auto_approved')
    return (
      <Tooltip title={POLICY_HELP.auto[lang]}>
        <Chip size="small" icon={<AutoModeIcon />} label={REVIEW_STATUS.auto_approved[lang]} color="success" variant="outlined" />
      </Tooltip>
    )
  return (
    <Chip
      size="small"
      icon={s === 'approved' ? <HowToRegIcon /> : undefined}
      label={REVIEW_STATUS[s]?.[lang] ?? s}
      color={s === 'approved' ? 'success' : s === 'rejected' ? 'default' : 'warning'}
      variant={s === 'approved' ? 'filled' : 'outlined'}
    />
  )
}

export function AuditKindChip({ kind }: { kind: string }) {
  const { lang } = useSettings()
  return <Chip size="small" variant="outlined" label={AUDIT_KINDS[kind]?.[lang] ?? kind} />
}

export function LegibilityChip({ doc }: { doc: Pick<Doc, 'ingest_summary' | 'status'> }) {
  const { lang } = useSettings()
  const l = legibility(doc)
  const color = l === 'good' ? 'success' : l === 'partial' ? 'warning' : l === 'unreadable' ? 'error' : 'default'
  return <Chip size="small" variant="outlined" color={color} label={LEGIBILITY[l][lang]} />
}

/** Confidence as a word with a coloured dot; the percentage only with the technical switch. For unreadable findings the number is OCR legibility. */
export function Reliability({ value, unreadable }: { value: number; unreadable?: boolean }) {
  const { lang } = useSettings()
  const t = useT(COMMON)
  const r = reliability(value)
  const color = r === 'high' ? 'success.main' : r === 'medium' ? 'warning.main' : 'error.main'
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
      <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
      <Typography variant="body2">
        {unreadable ? t('legibility') : t('reliability')}: {RELIABILITY[r][lang]}
      </Typography>
      <Tech>
        <Small>{Math.round(value * 100)} %</Small>
      </Tech>
    </Stack>
  )
}

// ---------------------------------------------------------------- evidence + provenance
export function Quote({ page, quote, label }: { page: number; quote: string; label?: string }) {
  const t = useT(COMMON)
  const { lang } = useSettings()
  return (
    <Box sx={{ borderLeft: 3, borderColor: 'primary.light', pl: 1.5, py: 0.5, my: 0.75 }}>
      <Small>
        {page > 0 ? t('page', { n: page }) : ''}
        {label ? ` · ${label}` : ''}
      </Small>
      <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
        {lang === 'de' ? `„${quote}“` : `“${quote}”`}
      </Typography>
    </Box>
  )
}

/** Evidence quotes with an honest sub-label: for missing-clause/passage findings without a verifier the quote is only the closest passage. */
export function EvidenceList({ finding }: { finding: Pick<Finding, 'evidence' | 'audit_kind' | 'verdict' | 'reasoning'> }) {
  const t = useT(COMMON)
  if (!finding.evidence.length) return <Small>{t('no_quote')}</Small>
  const label =
    finding.audit_kind === 'rename' ? t('evidence_rename') : finding.reasoning ? t('evidence') : t('evidence_nearest')
  return (
    <Box>
      {finding.evidence.map((e: EvidenceT, i: number) => (
        <Quote key={i} page={e.page} quote={e.quote} label={i === 0 ? label : undefined} />
      ))}
    </Box>
  )
}

const PLAIN_PREFIX: [string, keyof typeof COMMON][] = [
  ['coverage matrix', 'found_via_matrix'],
  ['hybrid retrieval', 'found_via_search'],
  ['entity registry', 'found_via_registry'],
  ['OCR confidence', 'found_via_ocr'],
]

/** "So kam der Fund zustande": one plain line by default, the raw numbered steps with the technical switch. */
export function HowFound({ steps, verified }: { steps: string[]; verified: boolean }) {
  const t = useT(COMMON)
  const { tech, setTech } = useSettings()
  const first = steps[0] ?? ''
  const plain = PLAIN_PREFIX.find(([p]) => first.startsWith(p))?.[1]
  return (
    <Details label={t('how_found')}>
      <Stack spacing={0.5}>
        {plain && <Typography variant="body2">{t(plain)}</Typography>}
        <Typography variant="body2">{verified ? t('verified_yes') : t('verified_no')}</Typography>
        {tech ? (
          <Stack spacing={0.5} sx={{ mt: 1 }}>
            {steps.map((s, i) => (
              <Small key={i} sx={{ fontFamily: 'monospace' }}>
                {i + 1}. {s}
              </Small>
            ))}
          </Stack>
        ) : (
          <Button size="small" variant="text" sx={{ alignSelf: 'flex-start', px: 0, fontSize: 11.5 }} onClick={() => setTech(true)}>
            {t('show_tech')}
          </Button>
        )}
      </Stack>
    </Details>
  )
}

// ---------------------------------------------------------------- decision dialog (shared by Prüfungen and Freigabe)
export function DecisionDialog({
  finding,
  decision,
  onClose,
  onDone,
}: {
  finding: Finding | null
  decision: 'approved' | 'rejected'
  onClose: () => void
  onDone: (updated: Finding) => void
}) {
  const t = useT(COMMON)
  const toast = useToast()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!finding) return
    setBusy(true)
    try {
      const updated = await api.review(finding.id, decision, note)
      toast(decision === 'approved' ? t('approved_toast') : t('rejected_toast'))
      onDone(updated)
      setNote('')
      onClose()
    } catch (e) {
      toast(t('error', { msg: String(e) }))
    }
    setBusy(false)
  }
  return (
    <Dialog open={!!finding} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{decision === 'approved' ? t('approve_title') : t('reject_title')}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>{decision === 'approved' ? t('approve_text') : t('reject_text')}</DialogContentText>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={2}
          label={t('note_optional')}
          placeholder={t('note_example')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && submit()}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button variant="contained" color={decision === 'approved' ? 'success' : 'inherit'} onClick={submit} disabled={busy}>
          {decision === 'approved' ? t('approve') : t('reject')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ---------------------------------------------------------------- errors + quotes
/** Friendly sentence by default; the raw (technical, usually English) message only under Details. */
export function ErrorAlert({ msg, severity = 'error', sx }: { msg: string; severity?: 'error' | 'warning'; sx?: object }) {
  const t = useT(COMMON)
  return (
    <Alert severity={severity} sx={sx}>
      {t('error')}
      <Details label={t('error_detail')}>
        <Small sx={{ fontFamily: 'monospace' }}>{msg}</Small>
      </Details>
    </Alert>
  )
}

/** Typographic quotes per language: „…“ in German, “…” in English. */
export const quoted = (text: string, lang: string) => (lang === 'de' ? `„${text}“` : `“${text}”`)

// ---------------------------------------------------------------- empty state
export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <Stack spacing={1} sx={{ alignItems: 'center', py: 6, textAlign: 'center', color: 'text.secondary' }}>
      {icon}
      <Typography variant="h6" color="text.primary">
        {title}
      </Typography>
      {text && <Typography variant="body2">{text}</Typography>}
      {action && <Box sx={{ pt: 1 }}>{action}</Box>}
    </Stack>
  )
}
