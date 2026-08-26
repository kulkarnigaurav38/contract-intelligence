import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { api, label } from '../api'

type Metrics = { tp: number; fp: number; fn: number; precision: number; recall: number; f1: number }
type Layer = { metrics: Metrics; errors: { key: string; error: string }[] }
type Eval = {
  error?: string
  documents: number
  unreadable: string[]
  llm_enabled: boolean
  coverage_matrix: Layer
  rename_registry: Layer
  extraction: Record<string, { pages: number; methods: Record<string, number>; confidence: number }>
  audits: { audit_id: number; kind: string; params: Record<string, string>; verified: boolean; metrics: Metrics; errors: { key: string; error: string }[] }[]
  injection: { id: string; expected: boolean; flagged: boolean }[]
}

export default function Evaluation() {
  const [ev, setEv] = useState<Eval | null>(null)
  const [loading, setLoading] = useState(false)
  const run = async () => {
    setLoading(true)
    setEv((await api.runEval()) as unknown as Eval)
    setLoading(false)
  }
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          Evaluation against ground truth
        </Typography>
        <Button variant="contained" onClick={run} disabled={loading}>
          Run evaluation
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary">
        The sample corpus is generated, so the truth is known: which clauses each contract contains and which still carry a superseded
        name. Each layer is scored separately, so the value of verification is measurable instead of asserted.
      </Typography>
      {ev?.error && <Alert severity="warning">{ev.error}</Alert>}
      {ev && !ev.error && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <LayerCard title="Deterministic layer: clause coverage matrix" subtitle="per (contract, clause type): is the clause missing?" layer={ev.coverage_matrix} />
            <LayerCard title="Deterministic layer: entity registry" subtitle="per contract: does it need the name updated?" layer={ev.rename_registry} />
          </Box>
          {ev.audits.length > 0 && (
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle1" gutterBottom>
                Finished audits (deterministic + verifier)
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Audit</TableCell>
                    <TableCell>Verified</TableCell>
                    <TableCell align="right">Precision</TableCell>
                    <TableCell align="right">Recall</TableCell>
                    <TableCell align="right">F1</TableCell>
                    <TableCell>Errors</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ev.audits.map((a) => (
                    <TableRow key={a.audit_id}>
                      <TableCell>
                        #{a.audit_id} {label(a.kind)}
                        {a.params.clause_type ? ` · ${label(a.params.clause_type)}` : ''}
                        {a.params.contract_type ? ` · ${label(a.params.contract_type)}` : ''}
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={a.verified ? 'yes' : 'no'} color={a.verified ? 'success' : 'default'} />
                      </TableCell>
                      <TableCell align="right">{pct(a.metrics.precision)}</TableCell>
                      <TableCell align="right">{pct(a.metrics.recall)}</TableCell>
                      <TableCell align="right">{pct(a.metrics.f1)}</TableCell>
                      <TableCell>{a.errors.map((e) => `${e.key} (${label(e.error)})`).join(', ') || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle1" gutterBottom>
                Text extraction by input type
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Input type</TableCell>
                    <TableCell align="right">Pages</TableCell>
                    <TableCell>Methods</TableCell>
                    <TableCell align="right">Avg. confidence</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(ev.extraction).map(([k, v]) => (
                    <TableRow key={k}>
                      <TableCell>{label(k)}</TableCell>
                      <TableCell align="right">{v.pages}</TableCell>
                      <TableCell>
                        {Object.entries(v.methods)
                          .map(([m, n]) => `${label(m)} ×${n}`)
                          .join(', ')}
                      </TableCell>
                      <TableCell align="right">{pct(v.confidence)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {ev.unreadable.length > 0 && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  Escalated to a human as unreadable (no vision OCR offline): {ev.unreadable.join(', ')}. Not scored as clean.
                </Alert>
              )}
            </Paper>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle1" gutterBottom>
                Prompt-injection screening
              </Typography>
              {ev.injection.map((i) => (
                <Stack key={i.id} direction="row" spacing={1} sx={{ mb: 0.5, alignItems: 'center' }}>
                  <Chip size="small" label={i.id} />
                  <Typography variant="body2">
                    expected {i.expected ? 'injection' : 'clean'} → {i.flagged ? 'flagged' : 'not flagged'}
                  </Typography>
                  <Chip size="small" color={i.expected === i.flagged ? 'success' : 'error'} label={i.expected === i.flagged ? 'correct' : 'wrong'} />
                </Stack>
              ))}
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Contract text is untrusted input: hidden instructions are detected at ingest, and every model prompt is told to treat
                document text as data.
              </Typography>
            </Paper>
          </Box>
        </>
      )}
    </Stack>
  )
}

const pct = (v: number) => `${Math.round(v * 100)}%`

function LayerCard({ title, subtitle, layer }: { title: string; subtitle: string; layer: Layer }) {
  const m = layer.metrics
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1">{title}</Typography>
      <Typography variant="caption" color="text.secondary" gutterBottom sx={{ display: 'block' }}>
        {subtitle}
      </Typography>
      <Stack direction="row" spacing={3} sx={{ my: 1.5 }}>
        <Stat label="Precision" value={pct(m.precision)} />
        <Stat label="Recall" value={pct(m.recall)} />
        <Stat label="F1" value={pct(m.f1)} />
        <Stat label="TP / FP / FN" value={`${m.tp} / ${m.fp} / ${m.fn}`} />
      </Stack>
      {layer.errors.length > 0 ? (
        <Typography variant="body2" color="text.secondary">
          Errors: {layer.errors.map((e) => `${e.key} (${label(e.error)})`).join(', ')}
        </Typography>
      ) : (
        <Typography variant="body2" color="success.main">
          No errors on readable documents.
        </Typography>
      )}
    </Paper>
  )
}

const Stat = ({ label: l, value }: { label: string; value: string }) => (
  <Box>
    <Typography variant="caption" color="text.secondary">
      {l}
    </Typography>
    <Typography variant="h6">{value}</Typography>
  </Box>
)
