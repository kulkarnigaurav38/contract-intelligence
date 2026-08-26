import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import CheckIcon from '@mui/icons-material/Check'
import FactCheckIcon from '@mui/icons-material/FactCheck'
import GridOnIcon from '@mui/icons-material/GridOn'
import HelpOutlineIcon from '@mui/icons-material/HelpOutlineOutlined'
import RemoveIcon from '@mui/icons-material/Remove'
import { api, type Coverage, type Doc } from '../api'
import { useLabel, useSettings, useT } from '../i18n'
import { Small, Tech } from '../components/tech'
import { EmptyState, ErrorAlert, quoted, usePolling, useToast } from '../components/ui'
import { CLAUSE_SHORT, CLAUSE_TYPES, COMMON, CONTRACT_TYPES, CONTRACT_TYPE_KEYS, LANGUAGES } from '../vocab'

const T = {
  title: { de: 'Klausel-Übersicht', en: 'Clause overview' },
  subtitle: { de: 'Welcher Vertrag enthält welche Klausel?', en: 'Which contract contains which clause?' },
  intro: {
    de: 'Die Übersicht entsteht beim Einlesen jedes Vertrags. Ein Strich heißt: Wir haben keine solche Klausel gefunden.',
    en: 'The overview is built while each contract is read in. A dash means: we found no such clause.',
  },
  loading: { de: 'Wir laden die Übersicht …', en: 'Loading the overview …' },
  reading: { de: 'Wir lesen gerade {x} von {y} Verträgen …', en: 'We are reading {x} of {y} contracts …' },
  scope: { de: 'Wir zeigen {n} {w}, davon {m} mit mindestens einer Lücke.', en: 'Showing {n} {w}, {m} of them with at least one gap.' },
  contract_one: { de: 'Vertrag', en: 'contract' },
  contract_many: { de: 'Verträge', en: 'contracts' },
  only_gaps: { de: 'Nur Lücken zeigen', en: 'Show only gaps' },
  missing_in: { de: 'fehlt in {n}', en: 'missing in {n}' },
  missing_none: { de: 'fehlt in keinem', en: 'missing in none' },
  check_clause: { de: 'Diese Klausel prüfen', en: 'Check this clause' },
  present: { de: 'vorhanden', en: 'present' },
  uncertain: { de: 'vorhanden, unsicher', en: 'present, uncertain' },
  not_found: { de: 'nicht gefunden', en: 'not found' },
  legend: { de: 'Legende', en: 'Legend' },
  legend_tech: { de: 'Die Deckkraft zeigt die Verlässlichkeit der Einstufung.', en: 'Opacity reflects the confidence of the classification.' },
  via: { de: '{pct} % via {method}', en: '{pct} % via {method}' },
  empty: { de: 'Die Übersicht füllt sich, sobald Verträge gelesen sind.', en: 'The overview fills in as soon as contracts have been read.' },
  add_contracts: { de: 'Verträge hinzufügen', en: 'Add contracts' },
  no_match: { de: 'Kein Vertrag passt zu dieser Auswahl.', en: 'No contract matches this selection.' },
}

type Data = { coverage: Coverage; docs: Doc[] }
type Row = Coverage['rows'][number]
type Cell = Row['cells'][string]

const CERTAIN = 0.8

const load = (): Promise<Data> => Promise.all([api.coverage(), api.documents()]).then(([coverage, docs]) => ({ coverage, docs }))
const isReading = (d: Doc) => d.status === 'queued' || d.status === 'processing'
const stillReading = (d: Data | null) => !!d && d.docs.some(isReading)

const cellState = (cell: Cell | undefined): 'present' | 'uncertain' | 'missing' =>
  !cell ? 'missing' : cell.confidence >= CERTAIN ? 'present' : 'uncertain'

const STICKY = { position: 'sticky', left: 0, bgcolor: 'background.paper', borderRight: '1px solid', borderColor: 'divider' } as const

function CellIcon({ state, cell }: { state: 'present' | 'uncertain' | 'missing'; cell?: Cell }) {
  const { tech } = useSettings()
  const color = state === 'present' ? 'success.main' : state === 'uncertain' ? 'warning.main' : 'text.disabled'
  const opacity = tech && cell ? 0.35 + 0.65 * cell.confidence : 1
  return (
    <Box component="span" sx={{ display: 'inline-flex', color, opacity, verticalAlign: 'middle' }}>
      {state === 'present' ? <CheckIcon fontSize="small" /> : state === 'uncertain' ? <HelpOutlineIcon fontSize="small" /> : <RemoveIcon fontSize="small" />}
    </Box>
  )
}

export default function Clauses() {
  const t = useT(T)
  const tc = useT(COMMON)
  const { lang } = useSettings()
  const clauseName = useLabel(CLAUSE_TYPES)
  const clauseShort = useLabel(CLAUSE_SHORT)
  const contractType = useLabel(CONTRACT_TYPES)
  const language = useLabel(LANGUAGES)
  const navigate = useNavigate()
  const toast = useToast()
  const { data, error } = usePolling(load, 2000, stillReading)
  const [type, setType] = useState('')
  const [onlyGaps, setOnlyGaps] = useState(false)
  const [busy, setBusy] = useState('')

  if (error && !data) return <ErrorAlert msg={error} />

  const header = (
    <Stack spacing={0.5}>
      <Typography variant="h5">{t('title')}</Typography>
      <Typography variant="subtitle1" color="text.secondary">
        {t('subtitle')}
      </Typography>
      <Typography variant="body2">{t('intro')}</Typography>
    </Stack>
  )

  if (!data)
    return (
      <Stack spacing={2}>
        {header}
        <LinearProgress />
        <Typography variant="body2" color="text.secondary">
          {t('loading')}
        </Typography>
      </Stack>
    )

  const taxonomy = data.coverage.taxonomy
  const readyIds = new Set(data.docs.filter((d) => d.status === 'ready').map((d) => d.id))
  const readingCount = data.docs.filter(isReading).length
  const inScope = data.coverage.rows.filter((r) => readyIds.has(r.document_id))
  const typed = inScope.filter((r) => !type || r.contract_type === type)
  const missingIn = (ct: string) => typed.filter((r) => !r.cells[ct]).length
  const hasGap = (r: Row) => taxonomy.some((ct) => !r.cells[ct])
  const rows = onlyGaps ? typed.filter(hasGap) : typed

  const openContract = (row: Row, cell?: Cell) => navigate(`/contracts?open=${row.document_id}${cell ? `&page=${cell.page}` : ''}`)

  const startCheck = async (clause_type: string) => {
    setBusy(clause_type)
    try {
      const params: Record<string, string> = { clause_type }
      if (type) params.contract_type = type
      const audit = await api.createAudit('missing_clause', params, lang)
      navigate(`/checks/${audit.id}`)
    } catch (e) {
      toast(tc('error', { msg: String(e) }))
      setBusy('')
    }
  }

  const tooltip = (ct: string, cell: Cell | undefined) => {
    const state = cellState(cell)
    if (!cell) return `${clauseName(ct)} · ${t('not_found')}`
    const parts = [clauseName(ct), cell.heading ? quoted(cell.heading, lang) : '', tc('page', { n: cell.page }), state === 'uncertain' ? t('uncertain') : ''].filter(Boolean)
    return (
      <Box>
        {parts.join(' · ')}
        <Tech>
          <Small sx={{ color: 'inherit', opacity: 0.85 }}>{t('via', { pct: Math.round(cell.confidence * 100), method: cell.method })}</Small>
        </Tech>
      </Box>
    )
  }

  return (
    <Stack spacing={2}>
      {header}

      {readingCount > 0 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {t('reading', { x: readyIds.size, y: data.docs.length })}
          </Typography>
          <LinearProgress variant="determinate" value={data.docs.length ? (readyIds.size / data.docs.length) * 100 : 0} />
        </Paper>
      )}

      {inScope.length === 0 ? (
        <Paper>
          <EmptyState
            icon={<GridOnIcon sx={{ fontSize: 40 }} />}
            title={t('empty')}
            action={
              <Button variant="contained" onClick={() => navigate('/contracts')}>
                {t('add_contracts')}
              </Button>
            }
          />
        </Paper>
      ) : (
        <>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField select size="small" label={tc('contract_type')} value={type} onChange={(e) => setType(e.target.value)} sx={{ minWidth: 260 }}>
              <MenuItem value="">{tc('all_types')}</MenuItem>
              {CONTRACT_TYPE_KEYS.map((k) => (
                <MenuItem key={k} value={k}>
                  {contractType(k)}
                </MenuItem>
              ))}
            </TextField>
            <FormControlLabel control={<Switch checked={onlyGaps} onChange={(e) => setOnlyGaps(e.target.checked)} />} label={t('only_gaps')} />
          </Stack>

          <Typography variant="body2" color="text.secondary">
            {t('scope', { n: typed.length, w: typed.length === 1 ? t('contract_one') : t('contract_many'), m: typed.filter(hasGap).length })}
          </Typography>

          {rows.length === 0 ? (
            <Paper>
              <EmptyState title={t('no_match')} />
            </Paper>
          ) : (
            <Paper sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 240 + taxonomy.length * 88 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ ...STICKY, zIndex: 2, minWidth: 240, verticalAlign: 'bottom' }}>{tc('contract')}</TableCell>
                    {taxonomy.map((ct) => {
                      const n = missingIn(ct)
                      return (
                        <TableCell key={ct} align="center" sx={{ px: 0.5, minWidth: 88, verticalAlign: 'bottom' }}>
                          <Tooltip title={clauseName(ct)}>
                            <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, lineHeight: 1.2 }}>
                              {clauseShort(ct)}
                            </Typography>
                          </Tooltip>
                          <Small>{n === 0 ? t('missing_none') : t('missing_in', { n })}</Small>
                          <Tooltip title={t('check_clause')}>
                            <span>
                              <IconButton size="small" aria-label={t('check_clause')} disabled={busy !== ''} onClick={() => startCheck(ct)}>
                                <FactCheckIcon fontSize="inherit" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </TableCell>
                      )
                    })}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.document_id} hover>
                      <TableCell sx={{ ...STICKY, zIndex: 1, cursor: 'pointer' }} onClick={() => openContract(row)}>
                        <Typography variant="body2">{row.title || row.filename}</Typography>
                        <Small>
                          {contractType(row.contract_type)} · {language(row.language)}
                        </Small>
                      </TableCell>
                      {taxonomy.map((ct) => {
                        const cell = row.cells[ct]
                        return (
                          <TableCell key={ct} align="center" sx={{ px: 0.5, cursor: 'pointer' }} onClick={() => openContract(row, cell)}>
                            <Tooltip title={tooltip(ct, cell)}>
                              <span>
                                <CellIcon state={cellState(cell)} cell={cell} />
                              </span>
                            </Tooltip>
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}

          <Stack direction="row" spacing={3} sx={{ alignItems: 'center', flexWrap: 'wrap', px: 1 }}>
            <Small>{t('legend')}</Small>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
              <CellIcon state="present" />
              <Small>{t('present')}</Small>
            </Stack>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
              <CellIcon state="uncertain" />
              <Small>{t('uncertain')}</Small>
            </Stack>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
              <CellIcon state="missing" />
              <Small>{t('not_found')}</Small>
            </Stack>
            <Tech>
              <Small>{t('legend_tech')}</Small>
            </Tech>
          </Stack>
        </>
      )}
    </Stack>
  )
}
