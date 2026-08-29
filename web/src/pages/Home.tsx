import { useCallback, useRef, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { api, type Doc } from '../api'
import { useLabel, useSettings, useT } from '../i18n'
import { Small, Tech } from '../components/tech'
import { EmptyState, ErrorAlert, usePolling, useToast } from '../components/ui'
import { AUDIT_QUESTIONS, CLAUSE_TYPES, COMMON, CONTRACT_TYPES, CONTRACT_TYPE_KEYS } from '../vocab'

const T = {
  headline: { de: 'Was möchten Sie prüfen?', en: 'What would you like to check?' },
  what: { de: 'Contract Intelligence findet Verträge, in denen eine Klausel oder Regelung fehlt oder noch ein alter Firmenname steht – mit Beleg und Seitenzahl, zur Freigabe durch Sie.', en: 'Contract Intelligence finds contracts that lack a clause or passage or still carry an old company name – with evidence and page number, for your approval.' },
  exp_missing_clause: { de: 'Eine der zwölf Standardklauseln kommt nicht vor – z. B. keine Haftungsbegrenzung.', en: 'One of the twelve standard clauses does not occur – e.g. no limitation of liability.' },
  exp_missing_passage: { de: 'Eine Regelung, die Sie in eigenen Worten beschreiben, fehlt.', en: 'A passage you describe in your own words is missing.' },
  exp_rename: { de: 'Ein alter Firmenname wird noch als Vertragspartei genannt. „Vormals“-Verweise zählen nicht.', en: 'An old company name is still named as a party. “Formerly” references do not count.' },
  clause: { de: 'Klausel', en: 'Clause' },
  missing_1: { de: '(fehlt in 1 Vertrag)', en: '(missing in 1 contract)' },
  missing_n: { de: '(fehlt in {n} Verträgen)', en: '(missing in {n} contracts)' },
  passage: { de: 'Regelung', en: 'Passage' },
  passage_help: { de: 'Der Wortlaut muss nicht exakt stimmen – sinngemäß reicht.', en: 'The wording need not match exactly – the gist is enough.' },
  passage_example: { de: 'Zum Beispiel: Jede Partei hält die geltenden Antikorruptionsgesetze ein.', en: 'For example: Each party shall comply with applicable anti-corruption laws.' },
  registry: { de: 'Gesucht werden die bekannten alten Namen: {names}.', en: 'The known old names are searched for: {names}.' },
  other_name: { de: 'Anderen Namen suchen', en: 'Search another name' },
  other_name_label: { de: 'Anderer alter Name', en: 'Other old name' },
  other_name_hide: { de: 'Nur die bekannten Namen', en: 'Only the known names' },
  scope_help: { de: 'Leer lassen, um alle Verträge zu prüfen.', en: 'Leave empty to check all contracts.' },
  start: { de: 'Prüfung starten', en: 'Start check' },
  add_first: { de: 'Zuerst Verträge hinzufügen.', en: 'Add contracts first.' },
  still_reading: { de: 'Die Verträge werden noch gelesen.', en: 'The contracts are still being read.' },
  read_one: { de: '1 Vertrag eingelesen', en: '1 contract read in' },
  read_many: { de: '{n} Verträge eingelesen', en: '{n} contracts read in' },
  reading: { de: 'Wir lesen gerade {done} von {total} Verträgen …', en: 'We are reading {done} of {total} contracts …' },
  add_contracts: { de: 'Verträge hinzufügen', en: 'Add contracts' },
  pending_one: { de: '1 Fund wartet auf Ihre Freigabe', en: '1 finding awaits your approval' },
  pending_many: { de: '{n} Funde warten auf Ihre Freigabe', en: '{n} findings await your approval' },
  nothing_pending: { de: 'Nichts wartet auf Ihre Freigabe', en: 'Nothing awaits your approval' },
  to_approvals: { de: 'Zur Freigabe', en: 'Go to approvals' },
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
type Kind = 'missing_clause' | 'missing_passage' | 'rename'
const KINDS: Kind[] = ['missing_clause', 'missing_passage', 'rename']

const isReading = (d: Doc) => d.status === 'queued' || d.status === 'processing'
const never = () => false

function storedClause(): string {
  try {
    return localStorage.getItem(CLAUSE_KEY) ?? ''
  } catch {
    return ''
  }
}

export default function Home() {
  const t = useT(T)
  const tc = useT(COMMON)
  const { lang } = useSettings()
  const navigate = useNavigate()
  const toast = useToast()
  const clauseLabel = useLabel(CLAUSE_TYPES)
  const ctypeLabel = useLabel(CONTRACT_TYPES)
  const questionLabel = useLabel(AUDIT_QUESTIONS)

  // The backend inserts each document only when it starts reading it, so the list alone cannot tell "3 of 14";
  // remember how many were queued and poll until they have all appeared.
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
      b.expected = d.length
      setExpected(d.length)
      return false
    }
    return true
  }, [])
  const { data: docs, error: docsError, refresh: refreshDocs } = usePolling(api.documents, 2000, active)
  const { data: config } = usePolling(api.config, 0, never)
  const { data: coverage } = usePolling(api.coverage, 0, never)
  const { data: pending } = usePolling(() => api.findings('pending'), 0, never)

  const [kind, setKind] = useState<Kind>('rename')
  const [contractType, setContractType] = useState('')
  const [clauseType, setClauseType] = useState(storedClause)
  const [passage, setPassage] = useState('')
  const [showOther, setShowOther] = useState(false)
  const [oldName, setOldName] = useState('')
  const [busy, setBusy] = useState('')

  const taxonomy = config?.taxonomy ?? coverage?.taxonomy ?? []
  const clauseValue = taxonomy.includes(clauseType) ? clauseType : ''
  const coverageRows = coverage?.rows.filter((r) => !contractType || r.contract_type === contractType) ?? []
  const missing = (key: string) => coverageRows.filter((r) => !r.cells[key]).length

  const readyCount = docs?.filter((d) => d.status === 'ready').length ?? 0
  const readingCount = docs?.filter(isReading).length ?? 0
  const reading = readingCount > 0 || (docs !== null && docs.length < expected)
  const total = Math.max(docs?.length ?? 0, expected)
  const done = (docs?.length ?? 0) - readingCount
  const hint = !docs ? undefined : docs.length === 0 ? t('add_first') : readyCount === 0 ? t('still_reading') : undefined
  const canStart = readyCount > 0 && !busy && (kind === 'missing_clause' ? !!clauseValue : kind === 'missing_passage' ? !!passage.trim() : true)

  const chooseClause = (v: string) => {
    setClauseType(v)
    try {
      localStorage.setItem(CLAUSE_KEY, v)
    } catch {
      /* private mode etc. */
    }
  }

  const start = async () => {
    const params: Record<string, string> =
      kind === 'missing_clause' ? { clause_type: clauseValue } : kind === 'missing_passage' ? { passage: passage.trim() } : oldName.trim() ? { old_name: oldName.trim() } : {}
    if (contractType) params.contract_type = contractType
    setBusy(kind)
    try {
      const audit = await api.createAudit(kind, params, lang)
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

  const verifier = config?.routing.find((r) => r.task === 'verify')?.model ?? ''

  return (
    <Stack spacing={3} sx={{ maxWidth: 900 }}>
      {docsError && <ErrorAlert msg={docsError} severity="warning" />}

      <Box>
        <Typography variant="h5" sx={{ mb: 1 }}>
          {t('headline')}
        </Typography>
        <Typography variant="body1" sx={{ maxWidth: 680 }}>
          {t('what')}
        </Typography>
      </Box>

      {docs && docs.length === 0 && (
        <Paper sx={{ maxWidth: 560, px: 3 }}>
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
        <Paper sx={{ p: { xs: 2, md: 3 } }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr' }, gap: { xs: 2, md: 4 } }}>
            <RadioGroup value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              {KINDS.map((k) => (
                <FormControlLabel
                  key={k}
                  value={k}
                  control={<Radio />}
                  sx={{ alignItems: 'flex-start', mb: 1.5, mx: 0 }}
                  label={
                    <Box sx={{ pt: 1 }}>
                      <Typography variant="subtitle1" sx={{ lineHeight: 1.3 }}>
                        {questionLabel(k)}
                      </Typography>
                      <Small>{t(`exp_${k}` as const)}</Small>
                    </Box>
                  }
                />
              ))}
            </RadioGroup>

            <Stack spacing={2.5}>
              {kind === 'missing_clause' && (
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
              )}
              {kind === 'missing_passage' && (
                <TextField fullWidth multiline size="small" minRows={4} label={t('passage')} placeholder={t('passage_example')} helperText={t('passage_help')} value={passage} onChange={(e) => setPassage(e.target.value)} />
              )}
              {kind === 'rename' && (
                <Box>
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
              <TextField
                select
                fullWidth
                size="small"
                label={tc('contract_type')}
                value={contractType}
                onChange={(e) => setContractType(e.target.value)}
                helperText={t('scope_help')}
                slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
              >
                <MenuItem value="">{tc('all_types')}</MenuItem>
                {CONTRACT_TYPE_KEYS.map((k) => (
                  <MenuItem key={k} value={k}>
                    {ctypeLabel(k)}
                  </MenuItem>
                ))}
              </TextField>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Button variant="contained" size="large" startIcon={<PlayArrowIcon />} onClick={start} disabled={!canStart}>
                  {t('start')}
                </Button>
                {hint && <Small>{hint}</Small>}
              </Stack>
            </Stack>
          </Box>
        </Paper>
      )}

      {docs && docs.length > 0 && (
        <Stack spacing={1}>
          {reading && (
            <Box sx={{ maxWidth: 480 }}>
              <LinearProgress variant="determinate" value={total ? (done / total) * 100 : 0} sx={{ mb: 0.5 }} />
              <Small>{t('reading', { done, total })}</Small>
            </Box>
          )}
          <Typography variant="body2" color="text.secondary">
            {docs.length === 1 ? t('read_one') : t('read_many', { n: docs.length })} ·{' '}
            <Link component={RouterLink} to="/contracts" underline="hover">
              {t('add_contracts')}
            </Link>
          </Typography>
          {pending && (
            <Typography variant="body2" color="text.secondary">
              {pending.length === 0 ? t('nothing_pending') : pending.length === 1 ? t('pending_one') : t('pending_many', { n: pending.length })}
              {pending.length > 0 && (
                <>
                  {' · '}
                  <Link component={RouterLink} to="/approvals" underline="hover">
                    {t('to_approvals')}
                  </Link>
                </>
              )}
            </Typography>
          )}
        </Stack>
      )}

      {config && (
        <Tech>
          <Small>{config.llm_enabled ? t('verifier_on', { model: verifier }) : t('verifier_off')}</Small>
        </Tech>
      )}
    </Stack>
  )
}
