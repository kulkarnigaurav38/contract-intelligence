import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import CssBaseline from '@mui/material/CssBaseline'
import Drawer from '@mui/material/Drawer'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import DescriptionIcon from '@mui/icons-material/Description'
import GridOnIcon from '@mui/icons-material/GridOn'
import FactCheckIcon from '@mui/icons-material/FactCheck'
import RateReviewIcon from '@mui/icons-material/RateReview'
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer'
import AssessmentIcon from '@mui/icons-material/Assessment'
import MemoryIcon from '@mui/icons-material/Memory'
import GavelIcon from '@mui/icons-material/Gavel'
import { api } from './api'
import { usePolling } from './components/ui'
import Documents from './pages/Documents'
import CoveragePage from './pages/Coverage'
import Audits from './pages/Audits'
import Review from './pages/Review'
import Ask from './pages/Ask'
import Evaluation from './pages/Evaluation'
import Models from './pages/Models'

const theme = createTheme({
  palette: {
    primary: { main: '#00695c' },
    secondary: { main: '#6a1b9a' },
    background: { default: '#f4f6f6' },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { border: '1px solid #e3e7e7' } } },
  },
})

const NAV = [
  { to: '/', label: 'Documents', icon: <DescriptionIcon /> },
  { to: '/coverage', label: 'Coverage', icon: <GridOnIcon /> },
  { to: '/audits', label: 'Audits', icon: <FactCheckIcon /> },
  { to: '/review', label: 'Review', icon: <RateReviewIcon /> },
  { to: '/ask', label: 'Ask', icon: <QuestionAnswerIcon /> },
  { to: '/eval', label: 'Evaluation', icon: <AssessmentIcon /> },
  { to: '/models', label: 'Models', icon: <MemoryIcon /> },
]
const WIDTH = 220

export default function App() {
  const { data: config } = usePolling(api.config, 0, () => false)
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Box sx={{ display: 'flex' }}>
          <AppBar position="fixed" color="inherit" sx={{ zIndex: (t) => t.zIndex.drawer + 1, borderBottom: '1px solid #e3e7e7' }}>
            <Toolbar>
              <GavelIcon color="primary" sx={{ mr: 1.5 }} />
              <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 600 }}>
                Contract Intelligence
              </Typography>
              {config && (
                <Chip
                  size="small"
                  color={config.llm_enabled ? 'success' : 'default'}
                  label={config.llm_enabled ? 'Gemini connected' : 'Offline mode – deterministic core only'}
                />
              )}
            </Toolbar>
          </AppBar>
          <Drawer variant="permanent" sx={{ width: WIDTH, [`& .MuiDrawer-paper`]: { width: WIDTH, boxSizing: 'border-box' } }}>
            <Toolbar />
            <List>
              {NAV.map((n) => (
                <ListItemButton
                  key={n.to}
                  component={NavLink}
                  to={n.to}
                  end={n.to === '/'}
                  sx={{ '&.active': { bgcolor: 'action.selected', color: 'primary.main' } }}
                >
                  <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}>{n.icon}</ListItemIcon>
                  <ListItemText primary={n.label} />
                </ListItemButton>
              ))}
            </List>
          </Drawer>
          <Box component="main" sx={{ flexGrow: 1, p: 3, minWidth: 0 }}>
            <Toolbar />
            <Routes>
              <Route path="/" element={<Documents />} />
              <Route path="/coverage" element={<CoveragePage />} />
              <Route path="/audits" element={<Audits />} />
              <Route path="/review" element={<Review />} />
              <Route path="/ask" element={<Ask />} />
              <Route path="/eval" element={<Evaluation />} />
              <Route path="/models" element={<Models />} />
            </Routes>
          </Box>
        </Box>
      </BrowserRouter>
    </ThemeProvider>
  )
}
