import { useState, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { useSettings, useT } from '../i18n'

/** Renders its children only when the global "show technical details" switch is on. */
export function Tech({ children }: { children: ReactNode }) {
  const { tech } = useSettings()
  return tech ? <>{children}</> : null
}

/** Small grey print for secondary/technical information that stays visible. */
export function Small({ children, sx }: { children: ReactNode; sx?: object }) {
  return (
    <Typography variant="caption" component="div" sx={{ color: 'text.secondary', fontSize: 11.5, lineHeight: 1.4, ...sx }}>
      {children}
    </Typography>
  )
}

const T = {
  show: { de: 'Details anzeigen', en: 'Show details' },
  hide: { de: 'Details ausblenden', en: 'Hide details' },
}

/** A collapsed disclosure ("Details anzeigen") for the technical substance behind a result. */
export function Details({ children, label }: { children: ReactNode; label?: string }) {
  const t = useT(T)
  const [open, setOpen] = useState(false)
  return (
    <Box>
      <Link component="button" type="button" variant="caption" underline="hover" onClick={() => setOpen(!open)} sx={{ color: 'text.secondary' }}>
        {open ? t('hide') : (label ?? t('show'))}
      </Link>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ mt: 1, p: 1.5, bgcolor: 'grey.50', borderRadius: 1, fontSize: 12 }}>{children}</Box>
      </Collapse>
    </Box>
  )
}
