import { Fragment, useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import LinearProgress from '@mui/material/LinearProgress'
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
import UploadFileIcon from '@mui/icons-material/UploadFile'
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks'
import GppMaybeIcon from '@mui/icons-material/GppMaybe'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import { api, type Doc, type DocDetail } from '../api'
import { useLabel, useT } from '../i18n'
import { Details, Small, Tech } from '../components/tech'
import { EmptyState, ErrorAlert, legibility, LegibilityChip, Reliability, usePolling, useToast } from '../components/ui'
import {
  CLAUSE_METHODS,
  CLAUSE_TYPES,
  COMMON,
  CONTRACT_TYPES,
  DOC_STATUS,
  ENTITY_KINDS,
  ENTITY_METHODS,
  INPUT_TYPES,
  LANGUAGES,
  LEGIBILITY,
  PAGE_METHODS,
} from '../vocab'

const T = {
  title: { de: 'Verträge', en: 'Contracts' },
  stock: { de: 'Sie haben {n} Verträge im Bestand: {parts}.', en: 'You have {n} contracts on file: {parts}.' },
  stock_one: { de: 'Sie haben einen Vertrag im Bestand: {parts}.', en: 'You have one contract on file: {parts}.' },
  part_good: { de: '{n} gut lesbar', en: '{n} easy to read' },
  part_partial: { de: '{n} schwer lesbar', en: '{n} hard to read' },
  part_unreadable: { de: '{n} nicht lesbar', en: '{n} unreadable' },
  part_reading: { de: '{n} in Arbeit', en: '{n} in progress' },
  part_failed: { de: '{n} fehlgeschlagen', en: '{n} failed' },
  and: { de: 'und', en: 'and' },
  upload: { de: 'Verträge hochladen (PDF, JPG, PNG)', en: 'Upload contracts (PDF, JPG, PNG)' },
  upload_short: { de: 'Verträge hochladen', en: 'Upload contracts' },
  samples: {
    de: 'Beispielverträge laden (14 Verträge, darunter Scans und eine Handschrift)',
    en: 'Load sample contracts (14 contracts, including scans and one handwritten page)',
  },
  samples_short: { de: 'Beispielverträge laden', en: 'Load sample contracts' },
  drop_title: { de: 'Dateien hier ablegen', en: 'Drop files here' },
  drop_text: { de: 'PDF, JPG oder PNG – gern auch mehrere auf einmal.', en: 'PDF, JPG or PNG – several at once is fine.' },
  reading: { de: 'Wir lesen gerade {x} von {y} Verträgen …', en: 'We are reading {x} of {y} contracts …' },
  reading_hint: { de: 'Die Tabelle aktualisiert sich von selbst. Scans dauern etwas länger.', en: 'The table updates by itself. Scans take a little longer.' },
  all_ready: { de: 'Alle {n} Verträge sind bereit.', en: 'All {n} contracts are ready.' },
  all_ready_one: { de: 'Der Vertrag ist bereit.', en: 'The contract is ready.' },
  ready_failed: { de: '{n} Verträge sind bereit, bei {f} ist das Einlesen fehlgeschlagen.', en: '{n} contracts are ready, {f} failed to import.' },
  check_now: { de: 'Jetzt prüfen', en: 'Check now' },
  uploaded: { de: '{n} Dateien übernommen. Wir lesen sie jetzt.', en: '{n} files received. We are reading them now.' },
  uploaded_one: { de: 'Eine Datei übernommen. Wir lesen sie jetzt.', en: 'One file received. We are reading it now.' },
  skipped: { de: '{n} Dateien wurden übersprungen: Wir unterstützen nur PDF, JPG und PNG.', en: '{n} files were skipped: only PDF, JPG and PNG are supported.' },
  skipped_one: { de: 'Eine Datei wurde übersprungen: Wir unterstützen nur PDF, JPG und PNG.', en: 'One file was skipped: only PDF, JPG and PNG are supported.' },
  col_language: { de: 'Sprache', en: 'Language' },
  col_form: { de: 'Form', en: 'Form' },
  col_status: { de: 'Status', en: 'Status' },
  col_tech: { de: 'Einlesen', en: 'Extraction' },
  mixed_hint: { de: 'z. B. digitaler Vertrag mit eingescannter Unterschriftenseite', en: 'e.g. a digital contract with a scanned signature page' },
  legibility_hint: { de: 'Nicht lesbar = wird in Prüfungen als ungeprüft ausgewiesen', en: 'Unreadable = reported as unchecked in checks' },
  counts: { de: '{c} Klauseln · {e} Unternehmen', en: '{c} clauses · {e} companies' },
  show_error: { de: 'Fehlermeldung anzeigen', en: 'Show error message' },
  view: { de: 'Vertrag ansehen', en: 'View contract' },
  pages: { de: '{n} Seiten', en: '{n} pages' },
  page_one: { de: '1 Seite', en: '1 page' },
  close: { de: 'Schließen', en: 'Close' },
  matched_text: { de: 'Gefundenen Text anzeigen', en: 'Show the matched text' },
  loading: { de: 'Wir laden den Vertrag …', en: 'Loading the contract …' },
  tab_clauses: { de: 'Klauseln', en: 'Clauses' },
  tab_entities: { de: 'Genannte Unternehmen', en: 'Companies named' },
  tab_pages: { de: 'Seitentext', en: 'Page text' },
  col_no: { de: 'Nr.', en: 'No.' },
  col_heading: { de: 'Überschrift', en: 'Heading' },
  col_kind: { de: 'Art', en: 'Type' },
  col_page: { de: 'Seite', en: 'Page' },
  col_labelling: { de: 'Einstufung', en: 'Labelling' },
  no_heading: { de: 'ohne Überschrift', en: 'no heading' },
  no_clauses: { de: 'Wir haben in diesem Vertrag keine Klauseln erkannt.', en: 'We did not recognise any clauses in this contract.' },
  rule_label: { de: 'Regel: {x}', en: 'Rule: {x}' },
  llm_label: { de: 'KI: {x}', en: 'AI: {x}' },
  col_name: { de: 'Name', en: 'Name' },
  col_role: { de: 'Rolle', en: 'Role' },
  col_context: { de: 'Kontext', en: 'Context' },
  historical: { de: 'nur historischer Verweis', en: 'historical reference only' },
  no_entities: { de: 'Wir haben in diesem Vertrag keine Unternehmen erkannt.', en: 'We did not recognise any companies in this contract.' },
  match: { de: 'Übereinstimmung {p} %', en: 'Match {p} %' },
  no_text: { de: 'Kein Text erkannt.', en: 'No text recognised.' },
  empty_title: { de: 'Noch keine Verträge.', en: 'No contracts yet.' },
  empty_text: {
    de: 'Laden Sie PDFs oder Fotos hoch – oder starten Sie mit den 14 Beispielverträgen.',
    en: 'Upload PDFs or photos – or start with the 14 sample contracts.',
  },
}

const ACCEPT = /\.(pdf|jpe?g|png)$/i
const isBusy = (d: Pick<Doc, 'status'>) => d.status === 'queued' || d.status === 'processing'
const pct = (v: number) => Math.round(v * 100)
/** Per-page legibility, mirroring `legibility()` in ui.tsx: only OCR'd pages can be hard to read. */
const pageLegibility = (method: string, confidence: number): 'good' | 'partial' | 'unreadable' =>
  method !== 'tesseract' ? 'good' : confidence >= 0.8 ? 'good' : confidence >= 0.5 ? 'partial' : 'unreadable'

type Selection = { id: number; tab: number; page?: number }

export default function Contracts() {
  const t = useT(T)
  const c = useT(COMMON)
  const contractType = useLabel(CONTRACT_TYPES)
  const language = useLabel(LANGUAGES)
  const form = useLabel(INPUT_TYPES)
  const docStatus = useLabel(DOC_STATUS)
  const pageMethod = useLabel(PAGE_METHODS)
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  // The backend inserts each document only when it starts reading it, so the list alone cannot tell "3 of 14".
  // We remember how many were queued by the last upload/sample load and poll until they have all appeared.
  const [expected, setExpected] = useState(0)
  const batch = useRef({ expected: 0, lastProgress: 0, lastCount: 0 })
  const active = useCallback((d: Doc[] | null) => {
    if (!d) return false
    const b = batch.current
    if (d.length !== b.lastCount) {
      b.lastCount = d.length
      b.lastProgress = Date.now()
    }
    if (d.some(isBusy)) {
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
  const { data: docs, error, refresh } = usePolling(api.documents, 2000, active)

  const list = docs ?? []
  const done = list.filter((d) => !isBusy(d)).length
  const total = Math.max(list.length, expected)
  const busy = done < list.length || list.length < expected
  const current = Math.min(total, done + 1)

  const startBatch = (n: number) => {
    const e = Math.max(batch.current.expected, list.length) + n
    batch.current = { expected: e, lastProgress: Date.now(), lastCount: list.length }
    setExpected(e)
  }

  // ---- completion toast
  const wasBusy = useRef(false)
  useEffect(() => {
    if (!docs) return
    if (busy) {
      wasBusy.current = true
      return
    }
    if (!wasBusy.current) return
    wasBusy.current = false
    const failed = docs.filter((d) => d.status === 'failed').length
    const msg = failed
      ? t('ready_failed', { n: docs.length - failed, f: failed })
      : docs.length === 1
        ? t('all_ready_one')
        : t('all_ready', { n: docs.length })
    toast(msg, { label: t('check_now'), onClick: () => navigate('/') })
  }, [busy, docs]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- upload (button, drop zone) and samples
  const fileInput = useRef<HTMLInputElement>(null)
  const [busyAction, setBusyAction] = useState(false)
  const uploadFiles = async (files: File[]) => {
    const ok = files.filter((f) => ACCEPT.test(f.name))
    const skipped = files.length - ok.length
    const skippedMsg = skipped === 0 ? '' : skipped === 1 ? t('skipped_one') : t('skipped', { n: skipped })
    if (!ok.length) {
      if (skippedMsg) toast(skippedMsg)
      return
    }
    setBusyAction(true)
    let n = 0
    try {
      for (const f of ok) {
        await api.upload(f)
        n += 1
      }
      toast(`${n === 1 ? t('uploaded_one') : t('uploaded', { n })}${skippedMsg ? ` ${skippedMsg}` : ''}`)
    } catch (e) {
      toast(c('error', { msg: String(e) }))
    }
    if (n) {
      startBatch(n)
      refresh()
    }
    setBusyAction(false)
  }
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length) void uploadFiles(files)
  }
  const loadSamples = async () => {
    setBusyAction(true)
    try {
      const { queued } = await api.ingestSamples()
      startBatch(queued)
      refresh()
    } catch (e) {
      toast(c('error', { msg: String(e) }))
    }
    setBusyAction(false)
  }

  const [dragging, setDragging] = useState(false)
  const uploadRef = useRef(uploadFiles)
  useEffect(() => {
    uploadRef.current = uploadFiles
  })
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth += 1
      setDragging(true)
    }
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length) void uploadRef.current(files)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [])

  // ---- dialog, incl. deep link ?open=<id>&page=<n>
  const [picked, setPicked] = useState<Selection | null>(null)
  const openId = Number(params.get('open')) || 0
  const openPage = Number(params.get('page')) || 0
  const selected: Selection | null = openId ? { id: openId, tab: 2, page: openPage || undefined } : picked
  const closeDialog = () => {
    setPicked(null)
    if (params.has('open')) setParams({}, { replace: true })
  }

  // ---- the one sentence before the table
  const counts = { good: 0, partial: 0, unreadable: 0, reading: 0, failed: 0 }
  for (const d of list) counts[d.status === 'failed' ? 'failed' : legibility(d)] += 1
  const parts = (
    [
      ['good', 'part_good'],
      ['partial', 'part_partial'],
      ['unreadable', 'part_unreadable'],
      ['reading', 'part_reading'],
      ['failed', 'part_failed'],
    ] as const
  )
    .filter(([k]) => counts[k] > 0)
    .map(([k, key]) => t(key, { n: counts[k] }))
  const joined = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} ${t('and')} ${parts[parts.length - 1]}` : parts.join('')
  const sentence = list.length === 1 ? t('stock_one', { parts: joined }) : t('stock', { n: list.length, parts: joined })

  const uploadButton = (label: string) => (
    <Button variant="contained" startIcon={<UploadFileIcon />} onClick={() => fileInput.current?.click()} disabled={busyAction}>
      {label}
    </Button>
  )
  const samplesButton = (label: string) => (
    <Button variant="outlined" startIcon={<LibraryBooksIcon />} onClick={loadSamples} disabled={busyAction}>
      {label}
    </Button>
  )

  return (
    <Box sx={{ maxWidth: 1200 }}>
      <input ref={fileInput} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" hidden onChange={onPick} />
      {dragging && (
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: (th) => th.zIndex.modal + 1,
            bgcolor: 'rgba(0, 105, 92, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <Paper sx={{ p: 4, textAlign: 'center', border: '2px dashed', borderColor: 'primary.main' }}>
            <UploadFileIcon color="primary" sx={{ fontSize: 40 }} />
            <Typography variant="h6">{t('drop_title')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('drop_text')}
            </Typography>
          </Paper>
        </Box>
      )}

      <Typography variant="h5" sx={{ mb: 0.5 }}>
        {t('title')}
      </Typography>
      {list.length > 0 && (
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          {sentence}
        </Typography>
      )}
      {error && <ErrorAlert msg={error} sx={{ mb: 2 }} />}
      {docs === null && !error && <LinearProgress sx={{ my: 2 }} />}

      {docs && (list.length > 0 || busy) && (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, mb: 2, mt: list.length ? 0 : 2 }}>
          {uploadButton(t('upload'))}
          {samplesButton(t('samples'))}
        </Stack>
      )}

      {busy && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="body1">{t('reading', { x: current, y: total })}</Typography>
          <LinearProgress variant="determinate" value={total ? (done / total) * 100 : 0} sx={{ my: 1 }} />
          <Small>{t('reading_hint')}</Small>
        </Paper>
      )}

      {list.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{c('contract')}</TableCell>
                <TableCell>{c('contract_type')}</TableCell>
                <TableCell>{t('col_language')}</TableCell>
                <TableCell>{t('col_form')}</TableCell>
                <TableCell>
                  <Tooltip title={t('legibility_hint')}>
                    <Box component="span" sx={{ borderBottom: '1px dotted', cursor: 'help' }}>
                      {c('legibility')}
                    </Box>
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ width: 40, px: 0.5 }} />
                <TableCell>{t('col_status')}</TableCell>
                <Tech>
                  <TableCell>{t('col_tech')}</TableCell>
                </Tech>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map((doc) => (
                <TableRow key={doc.id} hover sx={{ cursor: 'pointer' }} onClick={() => setPicked({ id: doc.id, tab: 0 })}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {doc.title || doc.filename}
                    </Typography>
                    <Small>{doc.filename}</Small>
                  </TableCell>
                  <TableCell>{contractType(doc.contract_type)}</TableCell>
                  <TableCell>{language(doc.language)}</TableCell>
                  <TableCell>
                    {doc.input_type === 'mixed_pdf' ? (
                      <Tooltip title={t('mixed_hint')}>
                        <Box component="span" sx={{ borderBottom: '1px dotted', cursor: 'help' }}>
                          {form(doc.input_type)}
                        </Box>
                      </Tooltip>
                    ) : (
                      form(doc.input_type)
                    )}
                  </TableCell>
                  <TableCell>
                    <Tooltip title={t('legibility_hint')}>
                      <Box component="span" sx={{ display: 'inline-flex' }}>
                        <LegibilityChip doc={doc} />
                      </Box>
                    </Tooltip>
                  </TableCell>
                  <TableCell sx={{ width: 40, px: 0.5 }}>
                    {doc.injection_suspected && (
                      <Tooltip title={c('suspicious')}>
                        <GppMaybeIcon color="warning" fontSize="small" sx={{ display: 'block' }} />
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={docStatus(doc.status)}
                      color={doc.status === 'failed' ? 'error' : doc.status === 'processing' ? 'primary' : 'default'}
                    />
                    {doc.status === 'failed' && doc.error && (
                      <Box sx={{ mt: 0.5 }} onClick={(e) => e.stopPropagation()}>
                        <Details label={t('show_error')}>
                          <Small sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{doc.error}</Small>
                        </Details>
                      </Box>
                    )}
                  </TableCell>
                  <Tech>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.5 }}>
                        {doc.ingest_summary.map((p) => (
                          <Chip
                            key={p.page}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: 11 }}
                            label={`${c('page', { n: p.page })} · ${pageMethod(p.method)} · ${pct(p.confidence)} %`}
                          />
                        ))}
                      </Box>
                      <Small>{t('counts', { c: doc.clauses, e: doc.entities })}</Small>
                    </TableCell>
                  </Tech>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {docs && list.length === 0 && !busy && (
        <Paper sx={{ maxWidth: 560, mx: 'auto', mt: 4, px: 3 }}>
          <EmptyState
            icon={<DescriptionOutlinedIcon sx={{ fontSize: 40 }} />}
            title={t('empty_title')}
            text={t('empty_text')}
            action={
              <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
                {uploadButton(t('upload_short'))}
                {samplesButton(t('samples_short'))}
              </Stack>
            }
          />
        </Paper>
      )}

      {selected && <ContractDialog key={selected.id} id={selected.id} initialTab={selected.tab} page={selected.page} onClose={closeDialog} />}
    </Box>
  )
}

// ---------------------------------------------------------------- "Vertrag ansehen"
function ContractDialog({ id, initialTab, page, onClose }: { id: number; initialTab: number; page?: number; onClose: () => void }) {
  const t = useT(T)
  const c = useT(COMMON)
  const contractType = useLabel(CONTRACT_TYPES)
  const language = useLabel(LANGUAGES)
  const clauseType = useLabel(CLAUSE_TYPES)
  const clauseMethod = useLabel(CLAUSE_METHODS)
  const entityKind = useLabel(ENTITY_KINDS)
  const entityMethod = useLabel(ENTITY_METHODS)
  const pageMethod = useLabel(PAGE_METHODS)
  const legibilityWord = useLabel(LEGIBILITY)

  const [detail, setDetail] = useState<DocDetail | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState(initialTab)
  const [openClause, setOpenClause] = useState<number | null>(null)
  const pageRefs = useRef(new Map<number, HTMLElement>())
  const scrolled = useRef(false)

  useEffect(() => {
    let cancelled = false
    api
      .document(id)
      .then((d) => !cancelled && setDetail(d))
      .catch((e) => !cancelled && setError(String(e)))
    return () => {
      cancelled = true
    }
  }, [id])

  // Deep link: once the page text is on screen, scroll to the requested page (once).
  useEffect(() => {
    if (!detail || tab !== 2 || !page || scrolled.current) return
    const el = pageRefs.current.get(page)
    if (!el) return
    const timer = window.setTimeout(() => {
      scrolled.current = true
      el.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }, 200)
    return () => window.clearTimeout(timer)
  }, [detail, tab, page])

  const roleColor = (kind: string) => (kind === 'our_entity_old' ? 'error' : kind === 'our_entity_current' ? 'success' : 'default')

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle component="div">
        <Small>{t('view')}</Small>
        <Typography variant="h6" component="h2">
          {detail ? detail.title || detail.filename : ''}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        {error && <ErrorAlert msg={error} />}
        {!detail && !error && (
          <Box>
            <LinearProgress />
            <Small sx={{ mt: 1 }}>{t('loading')}</Small>
          </Box>
        )}
        {detail && (
          <>
            <Typography variant="body2">
              {contractType(detail.contract_type)} · {language(detail.language)} · {detail.pages === 1 ? t('page_one') : t('pages', { n: detail.pages })}
            </Typography>
            <Small>
              <Tooltip title={c('checksum_hint')}>
                <Box component="span" sx={{ cursor: 'help' }}>
                  {c('checksum')} {detail.sha256.slice(0, 8)}
                </Box>
              </Tooltip>
            </Small>
            <Tech>
              <Small sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{detail.sha256}</Small>
            </Tech>

            {detail.injection_suspected && (
              <Alert severity="warning" icon={<GppMaybeIcon />} sx={{ mt: 2 }}>
                <AlertTitle>{c('suspicious')}</AlertTitle>
                {c('suspicious_help')}
                {detail.injection_note && (
                  <Box sx={{ mt: 1 }}>
                    <Details label={t('matched_text')}>
                      <Small sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{detail.injection_note}</Small>
                    </Details>
                  </Box>
                )}
              </Alert>
            )}

            <Tabs value={tab} onChange={(_, v: number) => setTab(v)} sx={{ mt: 2, mb: 2, borderBottom: 1, borderColor: 'divider' }}>
              <Tab label={`${t('tab_clauses')} (${detail.clause_rows.length})`} />
              <Tab label={`${t('tab_entities')} (${detail.entity_rows.length})`} />
              <Tab label={`${t('tab_pages')} (${detail.page_rows.length})`} />
            </Tabs>

            {tab === 0 &&
              (detail.clause_rows.length === 0 ? (
                <Small>{t('no_clauses')}</Small>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 48 }}>{t('col_no')}</TableCell>
                      <TableCell>{t('col_heading')}</TableCell>
                      <TableCell>{t('col_kind')}</TableCell>
                      <TableCell sx={{ width: 64 }}>{t('col_page')}</TableCell>
                      <Tech>
                        <TableCell>{t('col_labelling')}</TableCell>
                      </Tech>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detail.clause_rows.map((cl) => (
                      <Fragment key={cl.id}>
                        <TableRow hover sx={{ cursor: 'pointer' }} onClick={() => setOpenClause(openClause === cl.id ? null : cl.id)}>
                          <TableCell>{cl.ordinal + 1}</TableCell>
                          <TableCell>{cl.heading || <Small>{t('no_heading')}</Small>}</TableCell>
                          <TableCell>{clauseType(cl.clause_type)}</TableCell>
                          <TableCell>{cl.page_no}</TableCell>
                          <Tech>
                            <TableCell>
                              <Reliability value={cl.confidence} />
                              <Small>
                                {clauseMethod(cl.method)} · {t('rule_label', { x: cl.rule_label || '–' })} · {t('llm_label', { x: cl.llm_label || '–' })}
                              </Small>
                            </TableCell>
                          </Tech>
                        </TableRow>
                        {openClause === cl.id && (
                          <TableRow>
                            <TableCell colSpan={6} sx={{ bgcolor: 'grey.50' }}>
                              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', py: 0.5, pl: 1.5, borderLeft: 3, borderColor: 'primary.light' }}>
                                {cl.text}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              ))}

            {tab === 1 &&
              (detail.entity_rows.length === 0 ? (
                <Small>{t('no_entities')}</Small>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('col_name')}</TableCell>
                      <TableCell>{t('col_role')}</TableCell>
                      <TableCell sx={{ width: 64 }}>{t('col_page')}</TableCell>
                      <TableCell>{t('col_context')}</TableCell>
                      <Tech>
                        <TableCell>{t('col_labelling')}</TableCell>
                      </Tech>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detail.entity_rows.map((en, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                            {en.name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
                            <Chip size="small" variant="outlined" color={roleColor(en.kind)} label={entityKind(en.kind)} />
                            {en.historical && <Chip size="small" variant="outlined" label={t('historical')} />}
                          </Stack>
                        </TableCell>
                        <TableCell>{en.page_no}</TableCell>
                        <TableCell>
                          <Small>{en.context}</Small>
                        </TableCell>
                        <Tech>
                          <TableCell>
                            <Small>
                              {entityMethod(en.method)} · {t('match', { p: pct(en.confidence) })}
                            </Small>
                          </TableCell>
                        </Tech>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ))}

            {tab === 2 &&
              (detail.page_rows.length === 0 ? (
                <Small>{t('no_text')}</Small>
              ) : (
                <Stack spacing={2}>
                  {detail.page_rows.map((p) => {
                    const l = pageLegibility(p.method, p.confidence)
                    return (
                      <Box
                        key={p.page_no}
                        ref={(el: HTMLElement | null) => {
                          if (el) pageRefs.current.set(p.page_no, el)
                          else pageRefs.current.delete(p.page_no)
                        }}
                        sx={{ border: 1, borderColor: p.page_no === page ? 'primary.main' : 'divider', borderRadius: 1, p: 1.5, scrollMarginTop: 8 }}
                      >
                        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                          <Typography variant="subtitle2">{c('page', { n: p.page_no })}</Typography>
                          <Chip size="small" variant="outlined" color={l === 'good' ? 'success' : l === 'partial' ? 'warning' : 'error'} label={legibilityWord(l)} />
                          <Tech>
                            <Chip size="small" variant="outlined" sx={{ fontSize: 11 }} label={`${pageMethod(p.method)} · ${pct(p.confidence)} %`} />
                          </Tech>
                        </Stack>
                        {p.text.trim() ? (
                          <Box
                            component="pre"
                            sx={{ m: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5, bgcolor: 'grey.50', p: 1.5, borderRadius: 1 }}
                          >
                            {p.text}
                          </Box>
                        ) : (
                          <Small>{t('no_text')}</Small>
                        )}
                      </Box>
                    )
                  })}
                </Stack>
              ))}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('close')}</Button>
      </DialogActions>
    </Dialog>
  )
}
