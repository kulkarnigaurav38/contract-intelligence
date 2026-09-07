import { BrowserRouter, Navigate, NavLink, Route, Routes, useMatch } from 'react-router-dom'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import CssBaseline from '@mui/material/CssBaseline'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Toolbar from '@mui/material/Toolbar'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import GavelIcon from '@mui/icons-material/Gavel'
import { api } from './api'
import { SettingsProvider, useSettings, useT, type Lang } from './i18n'
import { ToastProvider, usePolling } from './components/ui'
import { COMMON } from './vocab'
import Home from './pages/Home'
import Contract from './pages/Contract'
import Download from './pages/Download'
import HowItWorks from './pages/HowItWorks'
import Technik from './pages/Technik'

const theme = createTheme({
  palette: {
    primary: { main: '#00695c' },
    background: { default: '#f4f6f6' },
  },
  shape: { borderRadius: 10 },
  typography: { h4: { fontWeight: 600 }, h5: { fontWeight: 600 }, h6: { fontWeight: 600 } },
  components: {
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { border: '1px solid #e3e7e7' } } },
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
    MuiToggleButton: { styleOverrides: { root: { textTransform: 'none' } } },
  },
})

const NAV = [
  { to: '/', key: 'nav_contracts' },
  { to: '/how-it-works', key: 'nav_how' },
  { to: '/technik', key: 'nav_tech' },
] as const

function Shell() {
  const t = useT(COMMON)
  const { lang, setLang } = useSettings()
  const { data: config } = usePolling(api.config, 0, () => false)
  const onContract = useMatch('/contracts/:id/*') // both hooks every render: a short-circuit would change the hook count between pages
  const onTechnik = useMatch('/technik')
  const wide = !!onContract || !!onTechnik // the PDF viewer, the download preview and the technical tables need room

  return (
    <>
      <AppBar position="sticky" color="inherit" sx={{ borderBottom: '1px solid #e3e7e7' }}>
        <Toolbar sx={{ gap: 1 }}>
          <GavelIcon color="primary" />
          <Typography variant="h6" sx={{ mr: 3 }}>
            Contract Intelligence
          </Typography>
          {NAV.map((n) => (
            <Button key={n.to} component={NavLink} to={n.to} end={n.to === '/'} color="inherit" sx={{ fontWeight: 500, '&.active': { color: 'primary.main', fontWeight: 600 } }}>
              {t(n.key)}
            </Button>
          ))}
          <Box sx={{ flexGrow: 1 }} />
          {config && (
            <Tooltip title={config.llm_enabled ? '' : t('ai_off_hint')}>
              <Chip size="small" color={config.llm_enabled ? 'success' : 'warning'} variant="outlined" label={config.llm_enabled ? t('ai_on') : t('ai_off')} />
            </Tooltip>
          )}
          <Tooltip title={t('lang_hint')}>
            <ToggleButtonGroup size="small" exclusive value={lang} onChange={(_, v: Lang | null) => v && setLang(v)} aria-label="Sprache / Language">
              <ToggleButton value="de">DE</ToggleButton>
              <ToggleButton value="en">EN</ToggleButton>
            </ToggleButtonGroup>
          </Tooltip>
        </Toolbar>
      </AppBar>
      <Container component="main" maxWidth={wide ? 'lg' : 'md'} sx={{ py: 4 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/contracts/:id" element={<Contract />} />
          <Route path="/contracts/:id/download" element={<Download />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/technik" element={<Technik />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Container>
    </>
  )
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SettingsProvider>
        <ToastProvider>
          <BrowserRouter>
            <Shell />
          </BrowserRouter>
        </ToastProvider>
      </SettingsProvider>
    </ThemeProvider>
  )
}
