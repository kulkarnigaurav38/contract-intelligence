import { useState } from 'react'
import Box from '@mui/material/Box'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { api, label } from '../api'
import { usePolling } from '../components/ui'

export default function CoveragePage() {
  const { data } = usePolling(api.coverage, 0, () => false)
  const [type, setType] = useState('')
  const types = Array.from(new Set((data?.rows ?? []).map((r) => r.contract_type))).sort()
  const rows = (data?.rows ?? []).filter((r) => !type || r.contract_type === type)
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          Clause coverage matrix
        </Typography>
        <TextField select size="small" label="Contract type" value={type} onChange={(e) => setType(e.target.value)} sx={{ minWidth: 220 }}>
          <MenuItem value="">All</MenuItem>
          {types.map((t) => (
            <MenuItem key={t} value={t}>
              {label(t)}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <Typography variant="body2" color="text.secondary">
        Built at ingest time, before any question is asked. "Which contracts lack X" is a lookup here, not a search — absence is a fact of
        the matrix, not an inference of a model. Cell shade = classification confidence; hover for the source clause.
      </Typography>
      <Paper sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 900 }}>
          <TableHead>
            <TableRow>
              <TableCell>Contract</TableCell>
              {data?.taxonomy.map((t) => (
                <TableCell key={t} align="center" sx={{ px: 0.5 }}>
                  <Tooltip title={data.labels[t]}>
                    <Typography variant="caption" sx={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap' }}>
                      {label(t)}
                    </Typography>
                  </Tooltip>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.document_id} hover>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Typography variant="body2">{r.title}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {label(r.contract_type)} · {r.language.toUpperCase()}
                  </Typography>
                </TableCell>
                {data?.taxonomy.map((t) => {
                  const cell = r.cells[t]
                  return (
                    <TableCell key={t} align="center" sx={{ px: 0.5 }}>
                      <Tooltip
                        title={
                          cell ? `${cell.heading || '(no heading)'} · p.${cell.page} · ${Math.round(cell.confidence * 100)}% via ${cell.method}` : 'not found'
                        }
                      >
                        <Box
                          sx={{
                            width: 28,
                            height: 28,
                            mx: 'auto',
                            borderRadius: 1,
                            bgcolor: cell ? 'primary.main' : 'error.light',
                            opacity: cell ? 0.35 + 0.65 * cell.confidence : 0.25,
                          }}
                        />
                      </Tooltip>
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Stack>
  )
}
