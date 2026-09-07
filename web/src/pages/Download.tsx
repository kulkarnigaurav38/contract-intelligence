import { useState } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined'
import { api } from '../api'
import { useLabel, useSettings, useT } from '../i18n'
import { ErrorAlert, Steps, usePolling, useToast } from '../components/ui'
import { CONTRACT_TYPES } from '../vocab'

const T = {
  back: { de: 'Zurück zur Prüfung', en: 'Back to the review' },
  all: { de: 'Alle Verträge', en: 'All contracts' },
  n_pages: { de: '{n} Seiten', en: '{n} pages' },
  one_page: { de: '1 Seite', en: '1 page' },
  ready: { de: 'Ihre korrigierte Fassung ist fertig', en: 'Your corrected version is ready' },
  ready_scan: { de: 'Ihre kommentierte Fassung ist fertig', en: 'Your annotated version is ready' },
  nothing: { de: 'Noch nichts übernommen', en: 'Nothing accepted yet' },
  nothing_text: { de: 'Übernehmen Sie in der Prüfung mindestens einen Vorschlag – dann steht die korrigierte Fassung hier zum Herunterladen bereit.', en: 'Accept at least one suggestion in the review – the corrected version will then be ready to download here.' },
  to_review: { de: 'Zur Prüfung', en: 'To the review' },
  names: { de: '{n} Firmennamen ersetzt', en: '{n} company names replaced' },
  names_one: { de: '1 Firmenname ersetzt', en: '1 company name replaced' },
  clauses: { de: '{n} Klauseln ergänzt (Nachtrag)', en: '{n} clauses added (addendum)' },
  clauses_one: { de: '1 Klausel ergänzt (Nachtrag)', en: '1 clause added (addendum)' },
  marked: { de: '{n} Stellen markiert und kommentiert', en: '{n} places marked and commented' },
  marked_one: { de: '1 Stelle markiert und kommentiert', en: '1 place marked and commented' },
  dismissed: { de: '{n} nicht zutreffend', en: '{n} not applicable' },
  open: { de: '{n} noch offen', en: '{n} still open' },
  open_one: { de: '1 noch offen', en: '1 still open' },
  download: { de: 'Korrigierte Fassung herunterladen', en: 'Download corrected version' },
  download_scan: { de: 'Kommentierte Fassung herunterladen', en: 'Download annotated version' },
  file: { de: 'In der Vertragsablage ablegen', en: 'File in the contract storage' },
  filed: { de: 'Abgelegt unter {id}', en: 'Filed as {id}' },
  original: { de: 'Das Original bleibt unverändert – diese Fassung wird aus den übernommenen Vorschlägen erzeugt.', en: 'The original stays unchanged – this version is generated from the accepted suggestions.' },
  scan_note: { de: 'Gescanntes Dokument: Markierungen und Kommentare, keine Textänderung – bitte im Original ändern.', en: 'Scanned document: markers and comments, no text changes – please change the original.' },
  preview: { de: 'Vorschau der korrigierten Fassung', en: 'Preview of the corrected version' },
  next: { de: 'Nächster Vertrag mit offenen Fundstellen', en: 'Next contract with open findings' },
}

export default function Download() {
  const id = Number(useParams().id)
  const t = useT(T)
  const type = useLabel(CONTRACT_TYPES)
  const { lang } = useSettings()
  const toast = useToast()
  const [err, setErr] = useState('')
  const { data: doc, error, reload } = usePolling(() => api.document(id), 0, () => false)
  const { data: docs } = usePolling(api.documents, 0, () => false)

  if (error && !doc) return <ErrorAlert msg={error} />
  if (!doc) return <LinearProgress />

  const r = doc.report
  const items = r.items ?? []
  const applied = items.filter((it) => it.review.status === 'accepted' || it.review.status === 'auto')
  const names = applied.filter((it) => it.kind === 'old_name').length
  const clauses = applied.length - names
  const dismissed = items.filter((it) => it.review.status === 'dismissed').length
  const open = items.filter((it) => it.review.status === 'open').length
  const scan = !r.editable
  const url = `/api/documents/${id}/corrected.pdf`
  const stem = doc.filename.replace(/\.[^.]+$/, '')
  const next = (docs ?? []).filter((d) => d.id !== id && d.report_status === 'ready' && (d.report_summary?.open ?? 0) > 0).sort((a, b) => a.id - b.id)[0]
  const when = (iso: string) => new Date(iso).toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB')

  const parts: string[] = []
  if (scan && applied.length) parts.push(applied.length === 1 ? t('marked_one') : t('marked', { n: applied.length }))
  if (!scan && names) parts.push(names === 1 ? t('names_one') : t('names', { n: names }))
  if (!scan && clauses) parts.push(clauses === 1 ? t('clauses_one') : t('clauses', { n: clauses }))
  if (dismissed) parts.push(t('dismissed', { n: dismissed }))
  if (open) parts.push(open === 1 ? t('open_one') : t('open', { n: open }))

  const file = async () => {
    try {
      const s = await api.fileToStorage(id)
      toast(t('filed', { id: s.external_id }))
      reload()
    } catch (e) {
      setErr(String(e))
    }
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Link component={RouterLink} to={`/contracts/${id}`} underline="hover" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
          <ArrowBackIcon fontSize="small" /> {t('back')}
        </Link>
        <Typography variant="h4" component="h1">
          {doc.title || doc.filename}
        </Typography>
        <Typography color="text.secondary">
          {type(doc.contract_type)} · {doc.pages === 1 ? t('one_page') : t('n_pages', { n: doc.pages })} · {doc.filename}
        </Typography>
        <Box sx={{ mt: 2 }}>
          <Steps active={3} review={`/contracts/${id}`} download={`/contracts/${id}/download`} />
        </Box>
      </Box>

      {err && <ErrorAlert msg={err} />}

      {applied.length === 0 ? (
        <Alert severity="info" action={<Button component={RouterLink} to={`/contracts/${id}`} color="inherit" size="small">{t('to_review')}</Button>}>
          <Typography sx={{ fontWeight: 600 }}>{t('nothing')}</Typography>
          {t('nothing_text')}
        </Alert>
      ) : (
        <>
          <Paper sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
            <CheckCircleOutlinedIcon color="success" sx={{ fontSize: 48, mb: 1 }} />
            <Typography variant="h5" component="h2">
              {t(scan ? 'ready_scan' : 'ready')}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              {parts.join(' · ')}
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'center', mt: 3 }}>
              <Button component="a" href={url} download={`${stem}_korrigiert.pdf`} variant="contained" size="large" startIcon={<DownloadOutlinedIcon />} sx={{ px: 4, py: 1.5, fontSize: 18 }}>
                {t(scan ? 'download_scan' : 'download')}
              </Button>
              <Button variant="outlined" size="large" startIcon={<ArchiveOutlinedIcon />} onClick={file}>
                {t('file')}
              </Button>
            </Stack>
            {r.storage && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                {t('filed', { id: r.storage.external_id })} · {when(r.storage.at)}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 2 }}>
              {scan ? t('scan_note') : t('original')}
            </Typography>
          </Paper>

          <Paper sx={{ overflow: 'hidden' }}>
            <Box component="iframe" src={`${url}#toolbar=0`} title={t('preview')} sx={{ display: 'block', width: '100%', height: '75vh', border: 0 }} />
          </Paper>
        </>
      )}

      <Stack direction="row" sx={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Button component={RouterLink} to="/" color="inherit" startIcon={<ArrowBackIcon />}>
          {t('all')}
        </Button>
        {next && (
          <Button component={RouterLink} to={`/contracts/${next.id}`} endIcon={<ArrowForwardIcon />}>
            {t('next')}: {next.title || next.filename}
          </Button>
        )}
      </Stack>
    </Stack>
  )
}
