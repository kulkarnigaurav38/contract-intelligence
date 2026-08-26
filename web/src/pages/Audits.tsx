import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import { api, label, type Audit, type Finding } from '../api'
import { Confidence, MethodTrace, Quote, ReviewChip, VerdictChip, usePolling } from '../components/ui'

const KINDS = [
  { value: 'missing_clause', label: 'Contracts missing a clause type' },
  { value: 'missing_passage', label: 'Contracts missing a specific passage' },
  { value: 'rename', label: 'Contracts naming a superseded company name' },
]
const TYPES = ['', 'merchant_agreement', 'dpa', 'nda', 'vendor_agreement', 'receivables_purchase', 'collection_services', 'saas_agreement', 'amendment']

export default function Audits() {
  const { data: config } = usePolling(api.config, 0, () => false)
  const { data: audits, refresh } = usePolling(api.audits, 2000, (a) => !!a?.some((x) => x.status === 'running'))
  const [selected, setSelected] = useState<number | null>(null)
  const [kind, setKind] = useState('missing_clause')
  const [clauseType, setClauseType] = useState('liability_cap')
  const [passage, setPassage] = useState('')
  const [oldName, setOldName] = useState('')
  const [contractType, setContractType] = useState('')
  const [error, setError] = useState('')

  const run = async () => {
    const params: Record<string, string> = {}
    if (contractType) params.contract_type = contractType
    if (kind === 'missing_clause') params.clause_type = clauseType
    if (kind === 'missing_passage') params.passage = passage
    if (kind === 'rename' && oldName) params.old_name = oldName
    try {
      const a = await api.createAudit(kind, params)
      setSelected(a.id)
      setError('')
      refresh()
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5">Audits</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '340px 1fr' }, gap: 2, alignItems: 'start' }}>
        <Stack spacing={2}>
          <Paper sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Typography variant="subtitle1">New audit</Typography>
              <TextField select size="small" label="Question" value={kind} onChange={(e) => setKind(e.target.value)}>
                {KINDS.map((k) => (
                  <MenuItem key={k.value} value={k.value}>
                    {k.label}
                  </MenuItem>
                ))}
              </TextField>
              {kind === 'missing_clause' && (
                <TextField select size="small" label="Clause type" value={clauseType} onChange={(e) => setClauseType(e.target.value)}>
                  {(config?.taxonomy ?? []).map((t) => (
                    <MenuItem key={t} value={t}>
                      {label(t)}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              {kind === 'missing_passage' && (
                <TextField
                  size="small"
                  label="Passage (any wording)"
                  multiline
                  minRows={3}
                  value={passage}
                  onChange={(e) => setPassage(e.target.value)}
                  placeholder="Each Party shall comply with all applicable anti-corruption and anti-bribery laws…"
                />
              )}
              {kind === 'rename' && (
                <TextField
                  size="small"
                  label="Old name (blank = entity registry)"
                  value={oldName}
                  onChange={(e) => setOldName(e.target.value)}
                  helperText="Registry: arvato Financial Solutions, Arvato Payment Solutions GmbH, AFS → Riverty GmbH"
                />
              )}
              <TextField select size="small" label="Contract type" value={contractType} onChange={(e) => setContractType(e.target.value)}>
                {TYPES.map((t) => (
                  <MenuItem key={t} value={t}>
                    {t ? label(t) : 'All types'}
                  </MenuItem>
                ))}
              </TextField>
              <Button variant="contained" onClick={run}>
                Run audit
              </Button>
              {error && <Alert severity="error">{error}</Alert>}
            </Stack>
          </Paper>
          <Paper>
            <List dense disablePadding>
              {(audits ?? []).map((a) => (
                <ListItemButton key={a.id} selected={a.id === selected} onClick={() => setSelected(a.id)}>
                  <ListItemText
                    primary={`#${a.id} ${label(a.kind)}${a.params.clause_type ? ` · ${label(a.params.clause_type)}` : ''}`}
                    secondary={`${a.params.contract_type ? label(a.params.contract_type) : 'all types'} · ${summarize(a)}`}
                  />
                  <Chip size="small" label={a.status} color={a.status === 'done' ? 'success' : a.status === 'failed' ? 'error' : 'warning'} />
                </ListItemButton>
              ))}
            </List>
          </Paper>
        </Stack>
        {selected !== null ? <AuditDetail id={selected} /> : <Alert severity="info">Run an audit or pick one from the list.</Alert>}
      </Box>
    </Stack>
  )
}

function summarize(a: Audit) {
  const s = a.summary as Record<string, number>
  if (!s || a.status !== 'done') return typeof a.findings === 'number' ? `${a.findings} findings` : ''
  return `${s.scope} in scope · ${s.missing ?? 0} flagged · ${s.uncertain ?? 0} uncertain · ${s.unreadable ?? 0} unreadable`
}

function AuditDetail({ id }: { id: number }) {
  const { data: audit } = usePolling(() => api.audit(id), 1500, (a) => !a || a.status === 'running')
  const [open, setOpen] = useState<number | null>(null)
  if (!audit) return null
  const findings = audit.findings as Finding[]
  const s = audit.summary as Record<string, number | boolean | string>
  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <Typography variant="subtitle1" sx={{ mr: 1 }}>
            Audit #{audit.id} · {label(audit.kind)}
          </Typography>
          {Object.entries(audit.params).map(([k, v]) => (
            <Chip key={k} size="small" variant="outlined" label={`${label(k)}: ${label(String(v)).slice(0, 60)}`} />
          ))}
          {audit.status === 'done' && (
            <Chip
              size="small"
              color={s.verified ? 'success' : 'warning'}
              label={s.verified ? `verified by ${s.verifier}` : 'unverified – no verifier offline'}
            />
          )}
        </Stack>
        {audit.status === 'done' && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {String(s.scope)} contracts in scope · {String(s.present)} clearly fine · {String(s.missing)} flagged · {String(s.uncertain)} uncertain
            {Number(s.historical_only) > 0 ? ` · ${s.historical_only} historical reference only` : ''}
            {Number(s.unreadable) > 0 ? ` · ${s.unreadable} unreadable (needs vision OCR)` : ''}
          </Typography>
        )}
        {audit.status === 'failed' && <Alert severity="error">{String(s.error)}</Alert>}
      </Paper>
      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell width={32} />
              <TableCell>Contract</TableCell>
              <TableCell>Verdict</TableCell>
              <TableCell>Confidence</TableCell>
              <TableCell>Evidence</TableCell>
              <TableCell>Review</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {findings.map((f) => (
              <FindingRow key={f.id} f={f} open={open === f.id} toggle={() => setOpen(open === f.id ? null : f.id)} />
            ))}
            {audit.status === 'done' && findings.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    Nothing flagged — every contract in scope passed.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
    </Stack>
  )
}

function FindingRow({ f, open, toggle }: { f: Finding; open: boolean; toggle: () => void }) {
  const first = f.evidence[0]
  return (
    <>
      <TableRow hover onClick={toggle} sx={{ cursor: 'pointer', '& td': { borderBottom: open ? 0 : undefined } }}>
        <TableCell>
          <IconButton size="small">{open ? <ExpandLessIcon /> : <ExpandMoreIcon />}</IconButton>
        </TableCell>
        <TableCell>
          <Typography variant="body2">{f.title}</Typography>
          <Typography variant="caption" color="text.secondary">
            {f.filename}
          </Typography>
        </TableCell>
        <TableCell>
          <VerdictChip verdict={f.verdict} />
        </TableCell>
        <TableCell>
          <Confidence value={f.confidence} />
        </TableCell>
        <TableCell sx={{ maxWidth: 380 }}>
          {first ? (
            <Typography variant="caption" noWrap sx={{ display: 'block' }}>
              p.{first.page}: {first.quote}
            </Typography>
          ) : (
            <Typography variant="caption" color="text.secondary">
              {f.method_chain[0]}
            </Typography>
          )}
        </TableCell>
        <TableCell>
          <ReviewChip status={f.review_status} />
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={6} sx={{ py: 0 }}>
          <Collapse in={open} unmountOnExit>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, py: 2 }}>
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  How this finding was produced
                </Typography>
                <MethodTrace steps={f.method_chain} />
                {f.reasoning && (
                  <Typography variant="body2" sx={{ mt: 1.5 }}>
                    <strong>Verifier:</strong> {f.reasoning}
                  </Typography>
                )}
              </Box>
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Evidence
                </Typography>
                {f.evidence.map((e, i) => (
                  <Quote key={i} page={e.page} quote={e.quote} />
                ))}
                {f.evidence.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    No passage to quote — the page could not be read reliably.
                  </Typography>
                )}
              </Box>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  )
}
