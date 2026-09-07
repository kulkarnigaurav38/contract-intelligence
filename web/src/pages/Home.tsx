import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined'
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import { api, type Doc, type DocDetail, type Finding } from '../api'
import { useLabel, useSettings, useT } from '../i18n'
import { ErrorAlert, Steps, usePolling, useToast } from '../components/ui'
import { CLAUSE_TYPES, COMMON, CONTRACT_TYPES } from '../vocab'

const T = {
  title: { de: 'Verträge prüfen', en: 'Check contracts' },
  intro: {
    de: 'Legen Sie einen oder mehrere Verträge ab. Jeder Vertrag wird gelesen und automatisch geprüft: Welche Standardklauseln fehlen? Steht noch ein alter Firmenname darin?',
    en: 'Drop one or more contracts. Each contract is read and checked automatically: which standard clauses are missing? Does an old company name still appear?',
  },
  choose: { de: 'Verträge auswählen', en: 'Select contracts' },
  or_drop: { de: 'oder hierher ziehen', en: 'or drop them here' },
  formats: { de: 'PDF, JPG oder PNG – auch Scans und handschriftliche Verträge', en: 'PDF, JPG or PNG – scans and handwritten contracts too' },
  samples: { de: 'Beispielverträge laden', en: 'Load sample contracts' },
  sample_one: { de: 'einen einzelnen laden', en: 'load a single one' },
  loaded: { de: 'bereits geladen', en: 'already loaded' },
  batch2: { de: 'Neuzugang', en: 'new arrival' },
  samples_hint: { de: 'Keine Verträge zur Hand?', en: 'No contracts at hand?' },
  sync: { de: 'Neue Dateien aus SharePoint holen', en: 'Fetch new files from SharePoint' },
  syncing: { de: 'SharePoint wird abgefragt …', en: 'Checking SharePoint …' },
  queued: { de: '{n} Verträge werden gelesen …', en: 'Reading {n} contracts …' },
  queued_one: { de: 'Der Vertrag wird gelesen …', en: 'Reading the contract …' },
  your: { de: 'Ihre Verträge', en: 'Your contracts' },
  f_all: { de: 'Alle', en: 'All' },
  f_old_name: { de: 'Alter Firmenname', en: 'Old company name' },
  f_clause: { de: 'Klausel fehlt', en: 'Clause missing' },
  f_passage: { de: 'Regelung fehlt', en: 'Provision missing' },
  passage_hint: { de: 'z. B. Der Auftragnehmer verpflichtet sich zur Einhaltung von Antikorruptionsgesetzen', en: 'e.g. The contractor undertakes to comply with anti-corruption laws' },
  search: { de: 'Suchen', en: 'Search' },
  searching: { de: 'Wird gesucht …', en: 'Searching …' },
  passage_result: { de: '{n} von {m} Verträgen ohne diese Regelung', en: '{n} of {m} contracts without this provision' },
  count: { de: '{n} Verträge', en: '{n} contracts' },
  count_one: { de: '1 Vertrag', en: '1 contract' },
  not_required: { de: '(laut Richtlinie nicht erforderlich)', en: '(not required by the guideline)' },
  v_confirmed: { de: 'Regelung nicht gefunden', en: 'provision not found' },
  v_partial: { de: 'nur teilweise vorhanden', en: 'only partly present' },
  v_unverified: { de: 'nicht gefunden (ohne KI-Gegenprüfung)', en: 'not found (without AI cross-check)' },
  reading: { de: 'Wird gelesen …', en: 'Reading …' },
  checking: { de: 'Wird geprüft …', en: 'Checking …' },
  failed: { de: 'Fehlgeschlagen – öffnen und erneut versuchen', en: 'Failed – open and try again' },
  ok: { de: 'Alles in Ordnung', en: 'All good' },
  missing: { de: '{n} Klauseln fehlen', en: '{n} clauses missing' },
  missing_one: { de: '1 Klausel fehlt', en: '1 clause missing' },
  old_name: { de: 'alter Firmenname auf {p}', en: 'old company name on {p}' },
  unreadable: { de: 'teilweise nicht lesbar', en: 'partly unreadable' },
  n_pages: { de: '{n} Seiten', en: '{n} pages' },
  one_page: { de: '1 Seite', en: '1 page' },
}

const ACCEPT = '.pdf,.jpg,.jpeg,.png'
const busy = (d: Doc) => d.status === 'processing' || d.report_status === 'pending' || d.report_status === 'running'

type Filter = 'all' | 'old_name' | 'clause' | 'passage'

export default function Home() {
  const t = useT(T)
  const tc = useT(COMMON)
  const label = useLabel(CONTRACT_TYPES)
  const clauseLabel = useLabel(CLAUSE_TYPES)
  const { lang } = useSettings()
  const toast = useToast()
  const navigate = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [err, setErr] = useState('')
  const [menu, setMenu] = useState<HTMLElement | null>(null) // the single-sample picker
  const expecting = useRef(0) // after queuing a file, keep polling until its row has appeared (or 90 s passed)
  const { data: config } = usePolling(api.config, 0, () => false)
  const { data: sampleList } = usePolling(api.samples, 0, () => false)
  const { data: docs, error, reload } = usePolling(api.documents, 3000, (ds) => !!ds?.some(busy) || Date.now() < expecting.current)
  const queued = () => {
    expecting.current = Date.now() + 90_000
    reload()
  }

  const [filter, setFilter] = useState<Filter>('all')
  const [clauseType, setClauseType] = useState('liability_cap')
  const [passage, setPassage] = useState('')
  const [auditId, setAuditId] = useState<number | null>(null)
  const [details, setDetails] = useState<Record<number, DocDetail>>({})
  const [loadingDetails, setLoadingDetails] = useState(false)
  const requested = useRef(new Set<number>())

  // "Klausel fehlt": the list has no per-clause status → fetch every checked contract once, when the filter is chosen.
  useEffect(() => {
    if (filter !== 'clause') return
    const todo = (docs ?? []).filter((d) => d.report_status === 'ready' && !requested.current.has(d.id))
    if (!todo.length) return
    for (const d of todo) requested.current.add(d.id)
    setLoadingDetails(true)
    Promise.all(todo.map((d) => api.document(d.id)))
      .then((ds) => setDetails((m) => ({ ...m, ...Object.fromEntries(ds.map((x) => [x.id, x])) })))
      .catch((e) => {
        for (const d of todo) requested.current.delete(d.id)
        setErr(String(e))
      })
      .finally(() => setLoadingDetails(false))
  }, [filter, docs])

  // "Regelung fehlt": one cross-contract audit, polled every 2 s until it is done.
  const { data: audit, error: auditError, reload: pollAudit } = usePolling(
    () => (auditId ? api.audit(auditId) : Promise.resolve(null)),
    2000,
    (a) => !!a && a.status !== 'done' && a.status !== 'failed',
  )
  const auditDone = audit && audit.id === auditId && audit.status === 'done' ? audit : null
  const auditFailed = audit && audit.id === auditId && audit.status === 'failed' ? audit : null
  const searching = !!auditId && !auditDone && !auditFailed
  const search = async () => {
    const text = passage.trim()
    if (!text) return
    try {
      const a = await api.createAudit('missing_passage', { passage: text, language: lang })
      setAuditId(a.id)
      pollAudit()
    } catch (e) {
      setErr(String(e))
    }
  }

  const send = async (files: File[]) => {
    if (!files.length) return
    try {
      await api.upload(files, lang)
      toast(files.length === 1 ? t('queued_one') : t('queued', { n: files.length }))
      queued()
    } catch (e) {
      setErr(String(e))
    }
  }
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    send(Array.from(e.target.files ?? []))
    e.target.value = ''
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    send(Array.from(e.dataTransfer.files))
  }
  const samples = async () => {
    try {
      const r = await api.ingestSamples(lang)
      toast(t('queued', { n: r.queued }))
      queued()
    } catch (e) {
      setErr(String(e))
    }
  }
  const sample = async (file: string) => {
    setMenu(null)
    try {
      await api.ingestSample(file, lang)
      toast(t('queued_one'))
      queued()
    } catch (e) {
      setErr(String(e))
    }
  }
  const pretty = (file: string) => file.replace(/\.[^.]+$/, '').replace(/_/g, ' ')
  const isLoaded = (file: string) => (docs ?? []).some((d) => d.filename === file || d.filename.endsWith(`_${file}`))
  const sync = async () => {
    try {
      await api.sync()
      toast(t('syncing'))
      queued()
    } catch (e) {
      setErr(String(e))
    }
  }

  const result = (d: Doc): { text: string; tone: 'ok' | 'bad' | 'warn' | 'busy' } => {
    if (d.status === 'failed' || d.report_status === 'failed') return { text: t('failed'), tone: 'warn' }
    if (d.status === 'processing') return { text: t('reading'), tone: 'busy' }
    if (d.report_status !== 'ready' || !d.report_summary) return { text: t('checking'), tone: 'busy' }
    const s = d.report_summary
    const parts: string[] = []
    if (s.missing === 1) parts.push(t('missing_one'))
    else if (s.missing > 1) parts.push(t('missing', { n: s.missing }))
    if (s.old_names) parts.push(t('old_name', { p: s.old_name_pages.length === 1 ? tc('page', { n: s.old_name_pages[0] }) : tc('pages', { n: s.old_name_pages.join(', ') }) }))
    if (s.unreadable) parts.push(t('unreadable'))
    return parts.length ? { text: parts.join(' · '), tone: 'bad' } : { text: t('ok'), tone: 'ok' }
  }

  const flagged = new Map<number, Finding>()
  if (auditDone) for (const f of auditDone.findings) if (f.verdict !== 'dismissed') flagged.set(f.document_id, f)

  /** What the active filter adds to a row, or null when the row is filtered out. */
  const suffix = (d: Doc): string | null => {
    if (filter === 'old_name') return d.report_summary?.old_names ? '' : null
    if (filter === 'clause') {
      const c = details[d.id]?.report.clauses?.find((x) => x.clause_type === clauseType)
      if (!c || c.status === 'present') return null
      return c.required ? '' : t('not_required')
    }
    if (filter === 'passage' && auditDone) {
      const f = flagged.get(d.id)
      if (!f) return null
      return f.verdict === 'confirmed' ? t('v_confirmed') : f.verdict === 'partial' ? t('v_partial') : t('v_unverified')
    }
    return ''
  }

  const sorted = [...(docs ?? [])].sort((a, b) => b.id - a.id)
  const rows = sorted.flatMap((d) => {
    const s = suffix(d)
    return s === null ? [] : [{ d, suffix: s }]
  })

  return (
    <Stack spacing={4}>
      <Box sx={{ textAlign: 'center', pt: 2 }}>
        <Typography variant="h4" component="h1" sx={{ mb: 1.5 }}>
          {t('title')}
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 620, mx: 'auto' }}>
          {t('intro')}
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2.5 }}>
          <Steps active={1} />
        </Box>
      </Box>

      <Paper
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        sx={{ p: { xs: 4, sm: 6 }, textAlign: 'center', borderStyle: 'dashed', borderWidth: 2, borderColor: over ? 'primary.main' : 'divider', bgcolor: over ? 'action.hover' : 'background.paper', transition: 'all .15s' }}
      >
        <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={onPick} data-testid="file-input" />
        <CloudUploadOutlinedIcon color="primary" sx={{ fontSize: 56, mb: 1 }} />
        <Box>
          <Button variant="contained" size="large" onClick={() => input.current?.click()} sx={{ px: 4, py: 1.5, fontSize: 18 }}>
            {t('choose')}
          </Button>
        </Box>
        <Typography color="text.secondary" sx={{ mt: 1.5 }}>
          {t('or_drop')}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div">
          {t('formats')}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 2 }}>
          {t('samples_hint')}{' '}
          <Link component="button" type="button" variant="caption" onClick={samples}>
            {t('samples')}
          </Link>
          {' · '}
          <Link component="button" type="button" variant="caption" onClick={(e) => setMenu(e.currentTarget)}>
            {t('sample_one')} ▾
          </Link>
          <Menu open={!!menu} anchorEl={menu} onClose={() => setMenu(null)}>
            {(sampleList ?? []).map((s) => (
              <MenuItem key={s.file} dense onClick={() => sample(s.file)}>
                <ListItemIcon sx={{ minWidth: 28 }}>{isLoaded(s.file) && <CheckCircleOutlinedIcon fontSize="small" color="success" />}</ListItemIcon>
                <ListItemText primary={pretty(s.file)} secondary={[s.batch === 2 ? t('batch2') : null, isLoaded(s.file) ? t('loaded') : null].filter(Boolean).join(' · ') || undefined} />
              </MenuItem>
            ))}
          </Menu>
          {config?.document_source === 'sharepoint' && (
            <>
              {' · '}
              <Link component="button" type="button" variant="caption" onClick={sync}>
                {t('sync')}
              </Link>
            </>
          )}
        </Typography>
      </Paper>

      {err && <ErrorAlert msg={err} />}
      {error && !docs && <ErrorAlert msg={error} />}

      {sorted.length > 0 && (
        <Box>
          <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
            <Typography variant="h6">{t('your')}</Typography>
            <ToggleButtonGroup size="small" exclusive value={filter} onChange={(_, v: Filter | null) => v && setFilter(v)}>
              <ToggleButton value="all">{t('f_all')}</ToggleButton>
              <ToggleButton value="old_name">{t('f_old_name')}</ToggleButton>
              <ToggleButton value="clause">{t('f_clause')}</ToggleButton>
              <ToggleButton value="passage">{t('f_passage')}</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          {filter === 'clause' && (
            <TextField select size="small" value={clauseType} onChange={(e) => setClauseType(e.target.value)} sx={{ minWidth: 300, mb: 1 }}>
              {Object.keys(CLAUSE_TYPES).map((k) => (
                <MenuItem key={k} value={k}>
                  {clauseLabel(k)}
                </MenuItem>
              ))}
            </TextField>
          )}
          {filter === 'passage' && (
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              <TextField size="small" fullWidth placeholder={t('passage_hint')} value={passage} onChange={(e) => setPassage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
              <Button variant="outlined" onClick={search} disabled={!passage.trim() || searching} sx={{ flexShrink: 0 }}>
                {t('search')}
              </Button>
            </Stack>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {rows.length === 1 ? t('count_one') : t('count', { n: rows.length })}
          </Typography>
          {filter === 'passage' && searching && (
            <Typography variant="body2" sx={{ mb: 1 }}>
              {t('searching')}
            </Typography>
          )}
          {filter === 'passage' && auditDone && (
            <Typography variant="body2" sx={{ mb: 1 }}>
              {t('passage_result', { n: flagged.size, m: auditDone.summary.scope ?? sorted.length })}
            </Typography>
          )}
          {(loadingDetails || searching) && <LinearProgress sx={{ mb: 1 }} />}
          {auditError && <ErrorAlert msg={auditError} sx={{ mb: 1 }} />}
          {auditFailed && <ErrorAlert msg={auditFailed.summary.error ?? auditFailed.status} sx={{ mb: 1 }} />}
          {rows.length > 0 && (
            <Paper>
              <List disablePadding>
                {rows.map(({ d, suffix }) => {
                  const r = result(d)
                  return (
                    <ListItemButton key={d.id} onClick={() => navigate(`/contracts/${d.id}`)} divider sx={{ py: 1.5 }}>
                      <ListItemIcon sx={{ minWidth: 44 }}>
                        {r.tone === 'busy' ? <CircularProgress size={22} /> : r.tone === 'ok' ? <CheckCircleOutlinedIcon color="success" /> : r.tone === 'bad' ? <ErrorOutlineIcon color="error" /> : <ReportProblemOutlinedIcon color="warning" />}
                      </ListItemIcon>
                      <ListItemText
                        primary={d.title || d.filename}
                        secondary={`${label(d.contract_type)} · ${d.pages === 1 ? t('one_page') : t('n_pages', { n: d.pages })}`}
                        sx={{ flex: '1 1 50%' }}
                      />
                      <Box sx={{ flex: '1 1 40%', textAlign: 'right' }}>
                        <Typography sx={{ fontWeight: r.tone === 'bad' ? 600 : 400, color: r.tone === 'ok' ? 'success.main' : r.tone === 'bad' ? 'error.main' : r.tone === 'warn' ? 'warning.main' : 'text.secondary' }}>
                          {r.text}
                        </Typography>
                        {suffix && (
                          <Typography variant="caption" color="text.secondary" component="div">
                            {suffix}
                          </Typography>
                        )}
                      </Box>
                    </ListItemButton>
                  )
                })}
              </List>
            </Paper>
          )}
        </Box>
      )}
      {docs && docs.length === 0 && (
        <Stack sx={{ alignItems: 'center', color: 'text.secondary' }} spacing={1}>
          <DescriptionOutlinedIcon />
          <Typography variant="body2">{lang === 'de' ? 'Noch keine Verträge. Ihr erster Vertrag erscheint hier.' : 'No contracts yet. Your first contract will appear here.'}</Typography>
        </Stack>
      )}
    </Stack>
  )
}
