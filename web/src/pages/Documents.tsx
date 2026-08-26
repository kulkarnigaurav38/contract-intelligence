import { useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tabs from '@mui/material/Tabs'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { api, label, type Doc, type DocDetail } from '../api'
import { Confidence, InputTypeChip, MethodChip, usePolling } from '../components/ui'

const busy = (docs: Doc[] | null) => !!docs?.some((d) => d.status === 'queued' || d.status === 'processing')

export default function Documents() {
  const { data: docs, error, refresh } = usePolling(api.documents, 1500, busy)
  const [open, setOpen] = useState<number | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const ingest = async () => {
    await api.ingestSamples()
    refresh()
  }
  const upload = async (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) await api.upload(f)
    refresh()
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          Documents
        </Typography>
        <Button variant="outlined" startIcon={<CloudUploadIcon />} onClick={() => fileInput.current?.click()}>
          Upload PDF / JPEG
        </Button>
        <input ref={fileInput} type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => upload(e.target.files)} />
        <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={ingest}>
          Ingest sample set
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      <Typography variant="body2" color="text.secondary">
        Every page is routed by what it is: text layer → read directly; no text layer → Tesseract; low OCR confidence → vision model.
        Click a row to see clauses, entities and the extracted text.
      </Typography>
      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Contract</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Lang</TableCell>
              <TableCell>Input</TableCell>
              <TableCell>Extraction per page</TableCell>
              <TableCell align="right">Clauses</TableCell>
              <TableCell align="right">Entities</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(docs ?? []).map((d) => (
              <TableRow key={d.id} hover sx={{ cursor: 'pointer' }} onClick={() => setOpen(d.id)}>
                <TableCell>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    {d.injection_suspected && (
                      <Tooltip title={`Prompt-injection suspected: ${d.injection_note}`}>
                        <WarningAmberIcon color="error" fontSize="small" />
                      </Tooltip>
                    )}
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {d.title || d.filename}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {d.filename}
                      </Typography>
                    </Box>
                  </Stack>
                </TableCell>
                <TableCell>{label(d.contract_type)}</TableCell>
                <TableCell>{d.language.toUpperCase()}</TableCell>
                <TableCell>
                  <InputTypeChip type={d.input_type} />
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
                    {d.ingest_summary.map((p) => (
                      <Tooltip key={p.page} title={p.note || `page ${p.page}`}>
                        <span>
                          <MethodChip method={p.method} confidence={p.confidence} />
                        </span>
                      </Tooltip>
                    ))}
                  </Stack>
                </TableCell>
                <TableCell align="right">{d.clauses}</TableCell>
                <TableCell align="right">{d.entities}</TableCell>
                <TableCell>
                  <Tooltip title={d.error}>
                    <Chip
                      size="small"
                      label={d.status}
                      color={d.status === 'ready' ? 'success' : d.status === 'failed' ? 'error' : 'warning'}
                    />
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {docs && docs.length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>
                  <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    No documents yet. Ingest the sample set or upload contracts.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
      {open !== null && <DocumentDialog id={open} onClose={() => setOpen(null)} />}
    </Stack>
  )
}

function DocumentDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: doc } = usePolling<DocDetail>(() => api.document(id), 0, () => false)
  const [tab, setTab] = useState(0)
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {doc?.title ?? '…'}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {doc?.filename} · sha256 {doc?.sha256.slice(0, 16)}…
        </Typography>
      </DialogTitle>
      <DialogContent>
        {doc?.injection_suspected && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Prompt-injection suspected — {doc.injection_note}. Document text is treated as data only; the verifier is told to ignore
            instructions inside documents.
          </Alert>
        )}
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label={`Clauses (${doc?.clause_rows.length ?? 0})`} />
          <Tab label={`Entities (${doc?.entity_rows.length ?? 0})`} />
          <Tab label={`Pages (${doc?.page_rows.length ?? 0})`} />
        </Tabs>
        {tab === 0 && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Heading</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Confidence</TableCell>
                <TableCell>How</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {doc?.clause_rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.ordinal}</TableCell>
                  <TableCell>
                    <Tooltip title={c.text.slice(0, 600)}>
                      <span>{c.heading || <em>(no heading)</em>}</span>
                    </Tooltip>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      p.{c.page_no}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={label(c.clause_type)} variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Confidence value={c.confidence} />
                  </TableCell>
                  <TableCell>
                    <Tooltip title={`rules: ${c.rule_label}${c.llm_label ? ` · llm: ${c.llm_label}` : ''}`}>
                      <span>{c.method}</span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {tab === 1 && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Kind</TableCell>
                <TableCell>Page</TableCell>
                <TableCell>Match</TableCell>
                <TableCell>Context</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {doc?.entity_rows.map((e, i) => (
                <TableRow key={i}>
                  <TableCell>{e.name}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={label(e.kind) + (e.historical ? ' · historical' : '')}
                      color={e.kind === 'our_entity_old' && !e.historical ? 'error' : e.kind === 'our_entity_current' ? 'success' : 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>{e.page_no}</TableCell>
                  <TableCell>
                    {e.method}
                    {e.confidence < 1 ? ` ${Math.round(e.confidence * 100)}%` : ''}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{e.context}</Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {tab === 2 &&
          doc?.page_rows.map((p) => (
            <Box key={p.page_no} sx={{ mb: 2 }}>
              <Stack direction="row" spacing={1} sx={{ mb: 0.5, alignItems: 'center' }}>
                <Typography variant="subtitle2">Page {p.page_no}</Typography>
                <MethodChip method={p.method} confidence={p.confidence} />
              </Stack>
              <Box component="pre" sx={{ whiteSpace: 'pre-wrap', fontSize: 12, bgcolor: 'grey.50', p: 1.5, borderRadius: 1, m: 0 }}>
                {p.text}
              </Box>
            </Box>
          ))}
      </DialogContent>
    </Dialog>
  )
}
