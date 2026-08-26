import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { label } from '../api'

/** Poll `fn` every `ms` while `active`; always fetch once on mount. */
export function usePolling<T>(fn: () => Promise<T>, ms: number, active: (data: T | null) => boolean) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    fn()
      .then((d) => !cancelled && (setData(d), setError('')))
      .catch((e) => !cancelled && setError(String(e)))
    return () => {
      cancelled = true
    }
  }, [tick]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!active(data)) return
    const id = setTimeout(() => setTick((t) => t + 1), ms)
    return () => clearTimeout(id)
  }, [data, ms, active])
  return { data, error, refresh: () => setTick((t) => t + 1) }
}

const verdictColor: Record<string, 'success' | 'warning' | 'default' | 'error' | 'info'> = {
  confirmed: 'error',
  unverified: 'warning',
  dismissed: 'default',
  unreadable: 'info',
}

export const VerdictChip = ({ verdict }: { verdict: string }) => (
  <Chip size="small" label={verdict} color={verdictColor[verdict] ?? 'default'} variant={verdict === 'dismissed' ? 'outlined' : 'filled'} />
)

const methodColor: Record<string, 'success' | 'warning' | 'secondary' | 'default'> = {
  text_layer: 'success',
  tesseract: 'warning',
  vision_llm: 'secondary',
}

export const MethodChip = ({ method, confidence }: { method: string; confidence?: number }) => (
  <Chip
    size="small"
    variant="outlined"
    color={methodColor[method] ?? 'default'}
    label={confidence === undefined ? label(method) : `${label(method)} ${Math.round(confidence * 100)}%`}
  />
)

const inputTypeColor: Record<string, 'primary' | 'warning' | 'secondary' | 'info' | 'default'> = {
  digital_pdf: 'primary',
  scanned_pdf: 'warning',
  mixed_pdf: 'info',
  image: 'secondary',
  image_handwritten: 'secondary',
}

export const InputTypeChip = ({ type }: { type: string }) => (
  <Chip size="small" label={label(type)} color={inputTypeColor[type] ?? 'default'} />
)

export const ReviewChip = ({ status }: { status: string }) => (
  <Chip
    size="small"
    label={status}
    color={status === 'approved' ? 'success' : status === 'rejected' ? 'default' : 'warning'}
    variant="outlined"
  />
)

export function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  return (
    <Stack direction="row" spacing={1} sx={{ minWidth: 110, alignItems: 'center' }}>
      <LinearProgress
        variant="determinate"
        value={pct}
        color={pct >= 80 ? 'success' : pct >= 50 ? 'warning' : 'error'}
        sx={{ flex: 1, height: 6, borderRadius: 3 }}
      />
      <Typography variant="caption" sx={{ width: 32, textAlign: 'right' }}>
        {pct}%
      </Typography>
    </Stack>
  )
}

/** The provenance of a finding: which rule, model or verifier produced it, in order. */
export function MethodTrace({ steps }: { steps: string[] }) {
  return (
    <Stack spacing={0.5}>
      {steps.map((s, i) => (
        <Stack key={i} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          <Box
            sx={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              mt: '2px',
            }}
          >
            {i + 1}
          </Box>
          <Typography variant="body2">{s}</Typography>
        </Stack>
      ))}
    </Stack>
  )
}

export function Quote({ page, quote }: { page: number; quote: string }) {
  return (
    <Box sx={{ borderLeft: 3, borderColor: 'primary.light', pl: 1.5, py: 0.5, my: 0.5 }}>
      <Typography variant="caption" color="text.secondary">
        page {page}
      </Typography>
      <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
        “{quote}”
      </Typography>
    </Box>
  )
}
