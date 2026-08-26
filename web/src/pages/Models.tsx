import Alert from '@mui/material/Alert'
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
import { usePolling } from '../components/ui'

const thinkingColor: Record<string, 'default' | 'info' | 'warning' | 'error'> = { minimal: 'default', low: 'info', medium: 'warning', high: 'error' }

export default function Models() {
  const { data: config } = usePolling(api.config, 0, () => false)
  return (
    <Stack spacing={2} sx={{ maxWidth: 1000 }}>
      <Typography variant="h5">Model routing</Typography>
      <Typography variant="body2" color="text.secondary">
        The reasoning effort follows the task. High-volume labelling runs on a cheap, low-thinking model; the expensive high-thinking model
        is reserved for the two places where a mistake is costly — reading handwriting and independently verifying a finding. Without a key
        the deterministic core (rules, registry, Tesseract, full-text search) still runs end to end.
      </Typography>
      {config && (
        <Alert severity={config.llm_enabled ? 'success' : 'warning'}>
          {config.llm_enabled ? 'Gemini API key configured — all stages active.' : 'No GEMINI_API_KEY — running the deterministic core only. Findings are marked unverified.'}
        </Alert>
      )}
      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Task</TableCell>
              <TableCell>Model</TableCell>
              <TableCell>Thinking</TableCell>
              <TableCell>Purpose</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {config?.routing.map((r) => (
              <TableRow key={r.task}>
                <TableCell>{label(r.task)}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace' }}>{r.model}</TableCell>
                <TableCell>
                  <Chip size="small" label={r.thinking} color={thinkingColor[r.thinking] ?? 'default'} variant="outlined" />
                </TableCell>
                <TableCell>{r.purpose}</TableCell>
              </TableRow>
            ))}
            {config && (
              <TableRow>
                <TableCell>embeddings</TableCell>
                <TableCell sx={{ fontFamily: 'monospace' }}>{config.embedding.model}</TableCell>
                <TableCell>—</TableCell>
                <TableCell>{config.embedding.dim}-dim vectors in pgvector; hashed bag-of-words fallback offline</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
    </Stack>
  )
}
