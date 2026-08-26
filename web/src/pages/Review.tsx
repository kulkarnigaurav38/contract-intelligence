import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import CloudDoneIcon from '@mui/icons-material/CloudDone'
import { api, label, type Finding } from '../api'
import { Confidence, MethodTrace, Quote, ReviewChip, VerdictChip, usePolling } from '../components/ui'

export default function Review() {
  const { data: findings, refresh } = usePolling(() => api.findings(), 0, () => false)
  const { data: log, refresh: refreshLog } = usePolling(api.auditLog, 0, () => false)
  const [decide, setDecide] = useState<{ f: Finding; decision: string } | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      setError('')
    } catch (e) {
      setError(String(e))
    }
    refresh()
    refreshLog()
  }
  const submit = async () => {
    if (!decide) return
    await act(() => api.review(decide.f.id, decide.decision, note))
    setDecide(null)
    setNote('')
  }

  const pending = (findings ?? []).filter((f) => f.review_status === 'pending')
  const decided = (findings ?? []).filter((f) => f.review_status !== 'pending')

  return (
    <Stack spacing={2}>
      <Typography variant="h5">Review queue</Typography>
      <Typography variant="body2" color="text.secondary">
        Nothing leaves the system without a person. Approve or reject each finding; approved findings can be filed as a compliant copy in
        the contract storage (idempotent — pushing twice never creates a second copy). Every decision lands in the audit log.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {pending.length === 0 && <Alert severity="success">No findings waiting for review.</Alert>}
      {pending.map((f) => (
        <Paper key={f.id} sx={{ p: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <Box>
              <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography variant="subtitle1">{f.title}</Typography>
                <Chip size="small" variant="outlined" label={`${label(f.audit_kind)}${f.audit_params.clause_type ? `: ${label(f.audit_params.clause_type)}` : ''}`} />
                <VerdictChip verdict={f.verdict} />
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                {f.filename}
              </Typography>
              <Confidence value={f.confidence} />
              <Box sx={{ mt: 1.5 }}>
                <MethodTrace steps={f.method_chain} />
              </Box>
              {f.reasoning && (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  <strong>Verifier:</strong> {f.reasoning}
                </Typography>
              )}
            </Box>
            <Box>
              {f.evidence.map((e, i) => (
                <Quote key={i} page={e.page} quote={e.quote} />
              ))}
              <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                <Button variant="contained" color="success" startIcon={<CheckIcon />} onClick={() => setDecide({ f, decision: 'approved' })}>
                  Approve
                </Button>
                <Button variant="outlined" color="inherit" startIcon={<CloseIcon />} onClick={() => setDecide({ f, decision: 'rejected' })}>
                  Reject
                </Button>
              </Stack>
            </Box>
          </Box>
        </Paper>
      ))}

      {decided.length > 0 && (
        <Paper>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Contract</TableCell>
                <TableCell>Finding</TableCell>
                <TableCell>Decision</TableCell>
                <TableCell>Note</TableCell>
                <TableCell>Contract storage</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {decided.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>{f.title}</TableCell>
                  <TableCell>
                    {label(f.audit_kind)}
                    {f.audit_params.clause_type ? `: ${label(f.audit_params.clause_type)}` : ''}
                  </TableCell>
                  <TableCell>
                    <ReviewChip status={f.review_status} />
                  </TableCell>
                  <TableCell>{f.review_note}</TableCell>
                  <TableCell>
                    {f.storage_ref ? (
                      <Chip size="small" color="success" icon={<CloudDoneIcon />} label={f.storage_ref} />
                    ) : f.review_status === 'approved' ? (
                      <Button size="small" variant="outlined" onClick={() => act(() => api.push(f.id))}>
                        Push to contract storage
                      </Button>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <Typography variant="h6" sx={{ pt: 2 }}>
        Audit log
      </Typography>
      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>When</TableCell>
              <TableCell>Who</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>Target</TableCell>
              <TableCell>Details</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(log ?? []).slice(0, 40).map((e) => (
              <TableRow key={e.id}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(e.ts).toLocaleString()}</TableCell>
                <TableCell>{e.actor}</TableCell>
                <TableCell>{e.action}</TableCell>
                <TableCell>
                  {e.target_type} #{e.target_id}
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                    {JSON.stringify(e.details).slice(0, 140)}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={!!decide} onClose={() => setDecide(null)}>
        <DialogTitle>{decide?.decision === 'approved' ? 'Approve finding' : 'Reject finding'}</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth multiline minRows={2} label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDecide(null)}>Cancel</Button>
          <Button variant="contained" onClick={submit}>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
