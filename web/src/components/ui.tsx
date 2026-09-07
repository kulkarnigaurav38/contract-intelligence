import { Fragment, createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useT } from '../i18n'
import { COMMON } from '../vocab'

// ---------------------------------------------------------------- the three steps: upload, review, download
/** Where the user is in the flow. Steps with a link are clickable; step 1 always leads back to the start page. */
export function Steps({ active, review, download }: { active: 1 | 2 | 3; review?: string; download?: string }) {
  const t = useT(COMMON)
  const steps = [
    { n: 1, label: t('step_upload'), to: '/' },
    { n: 2, label: t('step_review'), to: review },
    { n: 3, label: t('step_download'), to: download },
  ] as const
  return (
    <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }} aria-label={`${t('step_upload')} · ${t('step_review')} · ${t('step_download')}`}>
      {steps.map((s, i) => (
        <Fragment key={s.n}>
          {i > 0 && <Box sx={{ width: 20, borderTop: '2px solid', borderColor: 'divider' }} />}
          {s.to ? (
            <Button component={RouterLink} to={s.to} size="small" variant={s.n === active ? 'contained' : 'outlined'} sx={{ borderRadius: 5, px: 1.5 }}>
              {s.n} · {s.label}
            </Button>
          ) : (
            <Button size="small" variant="outlined" disabled sx={{ borderRadius: 5, px: 1.5 }}>
              {s.n} · {s.label}
            </Button>
          )}
        </Fragment>
      ))}
    </Stack>
  )
}

/** Load once, then keep polling every `ms` while `active(data)` says so; `reload()` restarts the loop. */
export function usePolling<T>(fn: () => Promise<T>, ms: number, active: (data: T | null) => boolean) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [round, setRound] = useState(0)
  const fnRef = useRef(fn)
  const activeRef = useRef(active)
  fnRef.current = fn
  activeRef.current = active
  const reload = useCallback(() => setRound((r) => r + 1), [])
  useEffect(() => {
    let stopped = false
    let timer: number | undefined
    const tick = async () => {
      let d: T | null = null
      try {
        d = await fnRef.current()
        if (stopped) return
        setData(d)
        setError('')
      } catch (e) {
        if (stopped) return
        setError(String(e))
      }
      if (ms > 0 && activeRef.current(d)) timer = window.setTimeout(tick, ms)
    }
    tick()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [ms, round])
  return { data, error, reload }
}

// ---------------------------------------------------------------- toasts
const ToastCtx = createContext<(msg: string) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('')
  return (
    <ToastCtx.Provider value={setMsg}>
      {children}
      <Snackbar open={!!msg} autoHideDuration={5000} onClose={() => setMsg('')} message={msg} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </ToastCtx.Provider>
  )
}

// ---------------------------------------------------------------- errors + empty state
/** Friendly sentence first; the raw (technical, usually English) message small underneath. */
export function ErrorAlert({ msg, severity = 'error', sx }: { msg: string; severity?: 'error' | 'warning'; sx?: object }) {
  const t = useT(COMMON)
  return (
    <Alert severity={severity} sx={sx}>
      {t('error')}
      <Typography variant="caption" component="div" color="text.secondary" sx={{ fontFamily: 'monospace', mt: 0.5, wordBreak: 'break-word' }}>
        {msg}
      </Typography>
    </Alert>
  )
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <Stack spacing={1} sx={{ alignItems: 'center', py: 6, textAlign: 'center', color: 'text.secondary' }}>
      {icon}
      <Typography variant="h6" color="text.primary">
        {title}
      </Typography>
      {text && <Typography variant="body2">{text}</Typography>}
      {action && <Box sx={{ pt: 1 }}>{action}</Box>}
    </Stack>
  )
}
