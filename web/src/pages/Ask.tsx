import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { api, label, type ChatResult } from '../api'
import { Quote } from '../components/ui'

const EXAMPLES = [
  'Which court has jurisdiction in the Nordlicht agreement?',
  'Welche Kündigungsfrist gilt im Inkassovertrag mit Rheinland Energie?',
  'What liability cap applies in the Lumen Retail merchant agreement?',
]

export default function Ask() {
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState<ChatResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const ask = async (q: string) => {
    setQuestion(q)
    setLoading(true)
    try {
      setResult(await api.chat(q))
      setError('')
    } catch (e) {
      setError(String(e))
    }
    setLoading(false)
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 900 }}>
      <Typography variant="h5">Ask the contracts</Typography>
      <Typography variant="body2" color="text.secondary">
        Hybrid retrieval (full-text + vector, fused) over clauses, then an answer that must cite. Uncited statements are not allowed; if
        the passages do not answer the question, the model says so.
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {EXAMPLES.map((e) => (
          <Chip key={e} label={e} variant="outlined" onClick={() => ask(e)} />
        ))}
      </Stack>
      <Stack direction="row" spacing={1}>
        <TextField fullWidth size="small" value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask(question)} placeholder="Ask in English or German…" />
        <Button variant="contained" onClick={() => ask(question)} disabled={!question || loading}>
          {loading ? <CircularProgress size={20} color="inherit" /> : 'Ask'}
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {result && (
        <>
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: 'center' }}>
              <Typography variant="subtitle1">Answer</Typography>
              <Chip size="small" label={result.mode === 'llm' ? 'Gemini, cited' : 'offline: extractive'} color={result.mode === 'llm' ? 'success' : 'default'} />
            </Stack>
            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
              {result.answer}
            </Typography>
            {result.citations.length > 0 && (
              <Stack spacing={0.5} sx={{ mt: 2 }}>
                <Typography variant="subtitle2">Citations</Typography>
                {result.citations.map((c, i) => (
                  <Stack key={i} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                    <Chip size="small" label={`${c.title} · p.${c.page}`} />
                    <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                      “{c.quote}”
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            )}
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Retrieved passages
            </Typography>
            {result.passages.map((p) => (
              <Stack key={p.index} sx={{ mb: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  [{p.index}] {p.title} · {label(p.clause_type)} · score {p.score}
                </Typography>
                <Quote page={p.page} quote={p.text.slice(0, 280)} />
              </Stack>
            ))}
          </Paper>
        </>
      )}
    </Stack>
  )
}
