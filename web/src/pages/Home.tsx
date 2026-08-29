import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Link from '@mui/material/Link'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined'
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import { api, type Doc } from '../api'
import { useLabel, useSettings, useT } from '../i18n'
import { ErrorAlert, usePolling, useToast } from '../components/ui'
import { COMMON, CONTRACT_TYPES } from '../vocab'

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
  samples_hint: { de: 'Keine Verträge zur Hand?', en: 'No contracts at hand?' },
  queued: { de: '{n} Verträge werden gelesen …', en: 'Reading {n} contracts …' },
  queued_one: { de: 'Der Vertrag wird gelesen …', en: 'Reading the contract …' },
  your: { de: 'Ihre Verträge', en: 'Your contracts' },
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

export default function Home() {
  const t = useT(T)
  const tc = useT(COMMON)
  const label = useLabel(CONTRACT_TYPES)
  const { lang } = useSettings()
  const toast = useToast()
  const navigate = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [err, setErr] = useState('')
  const { data: docs, error, reload } = usePolling(api.documents, 3000, (ds) => !!ds?.some(busy))

  const send = async (files: File[]) => {
    if (!files.length) return
    try {
      await api.upload(files, lang)
      toast(files.length === 1 ? t('queued_one') : t('queued', { n: files.length }))
      reload()
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
      reload()
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

  const sorted = [...(docs ?? [])].sort((a, b) => b.id - a.id)

  return (
    <Stack spacing={4}>
      <Box sx={{ textAlign: 'center', pt: 2 }}>
        <Typography variant="h4" component="h1" sx={{ mb: 1.5 }}>
          {t('title')}
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 620, mx: 'auto' }}>
          {t('intro')}
        </Typography>
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
        </Typography>
      </Paper>

      {err && <ErrorAlert msg={err} />}
      {error && !docs && <ErrorAlert msg={error} />}

      {sorted.length > 0 && (
        <Box>
          <Typography variant="h6" sx={{ mb: 1 }}>
            {t('your')}
          </Typography>
          <Paper>
            <List disablePadding>
              {sorted.map((d) => {
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
                    <Typography sx={{ flex: '1 1 40%', textAlign: 'right', fontWeight: r.tone === 'bad' ? 600 : 400, color: r.tone === 'ok' ? 'success.main' : r.tone === 'bad' ? 'error.main' : r.tone === 'warn' ? 'warning.main' : 'text.secondary' }}>
                      {r.text}
                    </Typography>
                  </ListItemButton>
                )
              })}
            </List>
          </Paper>
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
