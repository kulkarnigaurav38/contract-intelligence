import { useState } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import AppBar from '@mui/material/AppBar'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import CssBaseline from '@mui/material/CssBaseline'
import Drawer from '@mui/material/Drawer'
import FormControlLabel from '@mui/material/FormControlLabel'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Switch from '@mui/material/Switch'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Toolbar from '@mui/material/Toolbar'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import HomeIcon from '@mui/icons-material/Home'
import DescriptionIcon from '@mui/icons-material/Description'
import GridOnIcon from '@mui/icons-material/GridOn'
import FactCheckIcon from '@mui/icons-material/FactCheck'
import HowToRegIcon from '@mui/icons-material/HowToReg'
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer'
import AssessmentIcon from '@mui/icons-material/Assessment'
import MemoryIcon from '@mui/icons-material/Memory'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import GavelIcon from '@mui/icons-material/Gavel'
import { api } from './api'
import { SettingsProvider, useSettings, useT, type Lang } from './i18n'
import { ToastProvider, usePolling } from './components/ui'
import { COMMON } from './vocab'
import Home from './pages/Home'
import Contracts from './pages/Contracts'
import Clauses from './pages/Clauses'
import Checks from './pages/Checks'
import Approvals from './pages/Approvals'
import Ask from './pages/Ask'
import Quality from './pages/Quality'
import Models from './pages/Models'

const theme = createTheme({
  palette: {
    primary: { main: '#00695c' },
    secondary: { main: '#6a1b9a' },
    background: { default: '#f4f6f6' },
  },
  shape: { borderRadius: 10 },
  typography: { h5: { fontWeight: 600 }, h6: { fontWeight: 600 } },
  components: {
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { border: '1px solid #e3e7e7' } } },
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
    MuiToggleButton: { styleOverrides: { root: { textTransform: 'none' } } },
  },
})

const WIDTH = 232

const T = {
  lang_label: { de: 'Sprache', en: 'Language' },
}

const MAIN_NAV = [
  { to: '/', key: 'nav_home', icon: <HomeIcon /> },
  { to: '/contracts', key: 'nav_contracts', icon: <DescriptionIcon /> },
  { to: '/clauses', key: 'nav_clauses', icon: <GridOnIcon /> },
  { to: '/checks', key: 'nav_checks', icon: <FactCheckIcon /> },
  { to: '/approvals', key: 'nav_approvals', icon: <HowToRegIcon /> },
  { to: '/ask', key: 'nav_ask', icon: <QuestionAnswerIcon /> },
] as const

const TECH_NAV = [
  { to: '/tech/quality', key: 'nav_quality', icon: <AssessmentIcon /> },
  { to: '/tech/models', key: 'nav_models', icon: <MemoryIcon /> },
] as const

function Shell() {
  const t = useT(COMMON)
  const tl = useT(T)
  const { lang, setLang, tech, setTech } = useSettings()
  const { data: config } = usePolling(api.config, 0, () => false)
  const { data: pending } = usePolling(() => api.findings('pending'), 15000, () => true)
  const [techOpen, setTechOpen] = useState(false)

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" color="inherit" sx={{ zIndex: (th) => th.zIndex.drawer + 1, borderBottom: '1px solid #e3e7e7' }}>
        <Toolbar>
          <GavelIcon color="primary" sx={{ mr: 1.5 }} />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Contract Intelligence
          </Typography>
          {config && (
            <Tooltip title={config.llm_enabled ? '' : t('ai_off_hint')}>
              <Chip size="small" color={config.llm_enabled ? 'success' : 'warning'} variant="outlined" label={config.llm_enabled ? t('ai_on') : t('ai_off')} sx={{ mr: 2 }} />
            </Tooltip>
          )}
          <Tooltip title={t('lang_hint')}>
            <ToggleButtonGroup size="small" exclusive value={lang} onChange={(_, v: Lang | null) => v && setLang(v)} aria-label={tl('lang_label')}>
              <ToggleButton value="de">DE</ToggleButton>
              <ToggleButton value="en">EN</ToggleButton>
            </ToggleButtonGroup>
          </Tooltip>
        </Toolbar>
      </AppBar>
      <Drawer variant="permanent" sx={{ width: WIDTH, [`& .MuiDrawer-paper`]: { width: WIDTH, boxSizing: 'border-box' } }}>
        <Toolbar />
        <List sx={{ flexGrow: 1 }}>
          {MAIN_NAV.map((n) => (
            <ListItemButton key={n.to} component={NavLink} to={n.to} end={n.to === '/'} sx={{ '&.active': { bgcolor: 'action.selected', color: 'primary.main' } }}>
              <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}>
                {n.key === 'nav_approvals' ? (
                  <Badge badgeContent={pending?.length ?? 0} color="warning">
                    {n.icon}
                  </Badge>
                ) : (
                  n.icon
                )}
              </ListItemIcon>
              <ListItemText primary={t(n.key)} />
            </ListItemButton>
          ))}
        </List>
        <List dense sx={{ pb: 1 }}>
          <ListItemButton onClick={() => setTechOpen(!techOpen)} sx={{ color: 'text.secondary' }}>
            <ListItemText primary={t('nav_tech')} slotProps={{ primary: { variant: 'caption', sx: { textTransform: 'uppercase', letterSpacing: 0.6 } } }} />
            {techOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </ListItemButton>
          <Collapse in={techOpen}>
            {TECH_NAV.map((n) => (
              <ListItemButton key={n.to} component={NavLink} to={n.to} sx={{ pl: 3, color: 'text.secondary', '&.active': { color: 'primary.main' } }}>
                <ListItemIcon sx={{ minWidth: 32, color: 'inherit' }}>{n.icon}</ListItemIcon>
                <ListItemText primary={t(n.key)} slotProps={{ primary: { variant: 'body2' } }} />
              </ListItemButton>
            ))}
          </Collapse>
          <Box sx={{ px: 2, pt: 1 }}>
            <FormControlLabel
              control={<Switch size="small" checked={tech} onChange={(e) => setTech(e.target.checked)} />}
              label={<Typography variant="caption" color="text.secondary">{t('tech_switch')}</Typography>}
            />
          </Box>
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3, minWidth: 0 }}>
        <Toolbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/contracts" element={<Contracts />} />
          <Route path="/clauses" element={<Clauses />} />
          <Route path="/checks" element={<Checks />} />
          <Route path="/checks/:id" element={<Checks />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/ask" element={<Ask />} />
          <Route path="/tech/quality" element={<Quality />} />
          <Route path="/tech/models" element={<Models />} />
          <Route path="/coverage" element={<Navigate to="/clauses" replace />} />
          <Route path="/audits" element={<Navigate to="/checks" replace />} />
          <Route path="/review" element={<Navigate to="/approvals" replace />} />
          <Route path="/eval" element={<Navigate to="/tech/quality" replace />} />
          <Route path="/models" element={<Navigate to="/tech/models" replace />} />
        </Routes>
      </Box>
    </Box>
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
