import { Fragment, useRef, useState, type ReactNode } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { alpha, type Theme } from '@mui/material/styles'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ReplayIcon from '@mui/icons-material/Replay'
import { api, type BBox, type Decision, type DocDetail, type Item, type Report } from '../api'
import { useLabel, useSettings, useT } from '../i18n'
import { ErrorAlert, Steps, usePolling, useToast } from '../components/ui'
import { CLAUSE_TYPES, COMMON, CONTRACT_TYPES } from '../vocab'

const T = {
  back: { de: 'Alle Verträge', en: 'All contracts' },
  reading: { de: 'Der Vertrag wird gelesen …', en: 'Reading the contract …' },
  checking: { de: 'Der Vertrag wird geprüft …', en: 'Checking the contract …' },
  failed_read: { de: 'Der Vertrag konnte nicht gelesen werden.', en: 'The contract could not be read.' },
  failed_check: { de: 'Die Prüfung ist fehlgeschlagen.', en: 'The check failed.' },
  retry: { de: 'Erneut versuchen', en: 'Try again' },
  recheck: { de: 'Erneut prüfen', en: 'Check again' },
  rechecking: { de: 'Die Prüfung läuft erneut.', en: 'The check is running again.' },
  delete: { de: 'Löschen', en: 'Delete' },
  delete_confirm: { de: 'Diesen Vertrag aus der Prüfung entfernen?', en: 'Remove this contract from the check?' },
  n_pages: { de: '{n} Seiten', en: '{n} pages' },
  one_page: { de: '1 Seite', en: '1 page' },
  ok: { de: 'Alles in Ordnung', en: 'All good' },
  ok_text: { de: 'Alle für diese Vertragsart erforderlichen Klauseln sind vorhanden, und es wird kein alter Firmenname mehr genannt.', en: 'All clauses required for this contract type are present and no old company name is used.' },
  missing: { de: '{n} Klauseln fehlen', en: '{n} clauses missing' },
  missing_one: { de: '1 Klausel fehlt', en: '1 clause missing' },
  old_name: { de: 'alter Firmenname auf {p}', en: 'old company name on {p}' },
  unreadable: { de: 'teilweise nicht lesbar', en: 'partly unreadable' },
  suspicious: { de: 'Dieses Dokument enthält Text, der sich an automatische Prüfsysteme richtet. Solche Anweisungen werden ignoriert – bitte mit besonderer Sorgfalt prüfen.', en: 'This document contains text addressed to automated review systems. Such instructions are ignored – please review with particular care.' },
  // markers
  here_missing: { de: 'Hier fehlt:', en: 'Missing here:' },
  on_this_page: { de: 'Auf dieser Seite', en: 'On this page' },
  banner_missing: { de: 'fehlt:', en: 'missing:' },
  banner_partial: { de: 'nur teilweise:', en: 'only partly:' },
  banner_name: { de: 'alter Firmenname:', en: 'old company name:' },
  kind_missing_clause: { de: 'Fehlende Klausel', en: 'Missing clause' },
  kind_partial_clause: { de: 'Klausel nur teilweise vorhanden', en: 'Clause only partly present' },
  kind_old_name: { de: 'Alter Firmenname', en: 'Old company name' },
  old_name_title: { de: 'Alter Firmenname: {name}', en: 'Old company name: {name}' },
  state_open: { de: 'Wartet auf Ihre Entscheidung', en: 'Waiting for your decision' },
  state_accepted: { de: 'Übernommen', en: 'Accepted' },
  state_dismissed: { de: 'Nicht zutreffend', en: 'Not applicable' },
  state_auto: { de: 'Automatisch übernommen', en: 'Accepted automatically' },
  state_auto_long: { de: 'Automatisch übernommen – Stichprobe nicht nötig', en: 'Accepted automatically – no spot check needed' },
  carried_over: { de: 'aus früherer Prüfung übernommen', en: 'carried over from an earlier check' },
  why: { de: 'Begründung', en: 'Reason' },
  note_h: { de: 'Anmerkung', en: 'Note' },
  scan_note: { de: 'Gescanntes Dokument – bitte im Original ändern', en: 'Scanned document – please change it in the original' },
  no_suggestion: { de: 'Kein Vorschlag verfügbar – die KI war beim Prüfen nicht erreichbar. „Erneut prüfen“ holt ihn nach.', en: 'No suggestion available – the AI was unreachable during the check. “Check again” fetches it.' },
  accept: { de: 'Übernehmen', en: 'Accept' },
  dismiss: { de: 'Nicht zutreffend', en: 'Not applicable' },
  confirm: { de: 'Bestätigen', en: 'Confirm' },
  cancel: { de: 'Abbrechen', en: 'Cancel' },
  note_label: { de: 'Warum? (optional, hilft der KI beim nächsten Mal)', en: 'Why? (optional, helps the AI next time)' },
  reopen: { de: 'Entscheidung zurücknehmen', en: 'Undo decision' },
  toast_accepted: { de: 'Übernommen', en: 'Accepted' },
  toast_dismissed: { de: 'Als nicht zutreffend markiert', en: 'Marked as not applicable' },
  toast_reopen: { de: 'Entscheidung zurückgenommen', en: 'Decision undone' },
  // the panel
  progress: { de: 'Fundstelle {i} von {n}', en: 'Finding {i} of {n}' },
  prev: { de: 'Vorherige Fundstelle', en: 'Previous finding' },
  next: { de: 'Nächste Fundstelle', en: 'Next finding' },
  decided_line: { de: '{d} entschieden · {o} offen', en: '{d} decided · {o} open' },
  all_decided: { de: 'Alle Fundstellen entschieden', en: 'All findings decided' },
  findings_none: { de: 'Keine Fundstellen.', en: 'No findings.' },
  to_download: { de: 'Weiter zum Download', en: 'Continue to download' },
  needs_accepted: { de: 'Erst möglich, wenn mindestens ein Vorschlag übernommen wurde.', en: 'Available once at least one suggestion has been accepted.' },
  scan_hint: { de: 'Gescanntes Dokument: Markierungen und Kommentare, keine Textänderung', en: 'Scanned document: markers and comments, no text changes' },
  more: { de: 'Weitere Angaben', en: 'More details' },
  names_historical: { de: 'Nur als Verweis („vormals …“) genannt, das ist in Ordnung: {list}.', en: 'Only mentioned as a reference (“formerly …”), which is fine: {list}.' },
  present_h: { de: 'Vorhandene Klauseln', en: 'Clauses present' },
  present_none: { de: 'Keine der Standardklauseln wurde erkannt.', en: 'None of the standard clauses was recognised.' },
  not_required: { de: 'Für diese Vertragsart nicht erforderlich und ebenfalls nicht enthalten: {list}.', en: 'Not required for this contract type and also not included: {list}.' },
  cross_checked: { de: 'Regelprüfung mit KI-Gegenprüfung', en: 'Rule check with AI cross-check' },
  not_cross_checked: { de: 'Nur Regelprüfung – ohne KI-Gegenprüfung', en: 'Rule check only – without AI cross-check' },
  degraded: { de: 'wird beim nächsten Neustart nachgeholt', en: 'will be repeated at the next restart' },
}

const KIND = { missing_clause: 'kind_missing_clause', partial_clause: 'kind_partial_clause', old_name: 'kind_old_name' } as const
const STATE = { open: 'state_open', accepted: 'state_accepted', dismissed: 'state_dismissed', auto: 'state_auto' } as const
const TOAST = { accepted: 'toast_accepted', dismissed: 'toast_dismissed', reopen: 'toast_reopen' } as const
const BANNER = { missing_clause: 'banner_missing', partial_clause: 'banner_partial', old_name: 'banner_name' } as const

const active = (d: DocDetail | null) => !d || d.status === 'processing' || d.report.status === 'pending' || d.report.status === 'running'
const decided = (it: Item) => it.review.status !== 'open'
const tone = (it: Item) => (it.kind === 'old_name' ? 'error' : it.kind === 'partial_clause' ? 'warning' : 'primary')
/** Page order: page, then top edge; page-level items (no box) first. */
const byPosition = (a: Item, b: Item) => a.page - b.page || (a.anchor.bbox?.[1] ?? -1) - (b.anchor.bbox?.[1] ?? -1)

export default function Contract() {
  const id = Number(useParams().id)
  const t = useT(T)
  const tc = useT(COMMON)
  const clause = useLabel(CLAUSE_TYPES)
  const type = useLabel(CONTRACT_TYPES)
  const { lang } = useSettings()
  const toast = useToast()
  const navigate = useNavigate()
  const [err, setErr] = useState('')
  const [override, setOverride] = useState<Report | null>(null) // report returned by a decision – replaces the polled one without a reload
  const [cur, setCur] = useState<string | null>(null) // the finding shown in the panel; null = the first open one
  const markers = useRef<Record<string, HTMLElement | null>>({})
  const { data: doc, error, reload } = usePolling(() => api.document(id), 3000, active)

  const refresh = () => {
    setOverride(null)
    reload()
  }
  const recheck = async () => {
    try {
      await api.recheck(id, lang)
      toast(t('rechecking'))
      refresh()
    } catch (e) {
      setErr(String(e))
    }
  }
  const retry = async () => {
    try {
      await api.retryDocument(id)
      refresh()
    } catch (e) {
      setErr(String(e))
    }
  }
  const remove = async () => {
    if (!window.confirm(t('delete_confirm'))) return
    try {
      await api.deleteDocument(id)
      navigate('/')
    } catch (e) {
      setErr(String(e))
    }
  }
  /** Show a finding in the panel; from the panel's arrows the page scrolls to its marker as well. */
  const select = (key: string, scroll = true) => {
    setCur(key)
    if (scroll) markers.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  if (error && !doc) return <ErrorAlert msg={error} />
  if (!doc) return <LinearProgress />

  const r = override ?? doc.report
  const items = [...(r.items ?? [])].sort(byPosition)
  const pages = r.pages ?? []
  const clauses = r.clauses ?? []
  const present = clauses.filter((c) => c.status === 'present')
  const notRequired = clauses.filter((c) => !c.required && c.status !== 'present')
  const historical = r.historical_names ?? []
  const ready = doc.status === 'ready' && r.status === 'ready'
  const scan = !r.editable
  const open = items.filter((it) => !decided(it)).length
  const applied = (r.summary?.accepted ?? 0) + (r.summary?.auto ?? 0)
  const current = (cur && items.find((it) => it.key === cur)) || items.find((it) => !decided(it)) || items[0]
  const index = current ? items.indexOf(current) : -1

  const label = (it: Item) => (it.kind === 'old_name' ? t('old_name_title', { name: it.name ?? '' }) : clause(it.clause_type ?? ''))
  const when = (iso: string) => new Date(iso).toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB')
  /** One line, same wording as the list on the start page. */
  const result = (): { text: string; ok: boolean } | null => {
    const s = r.summary
    if (!ready || !s) return null
    const parts: string[] = []
    if (s.missing === 1) parts.push(t('missing_one'))
    else if (s.missing > 1) parts.push(t('missing', { n: s.missing }))
    if (s.old_names) parts.push(t('old_name', { p: s.old_name_pages.length === 1 ? tc('page', { n: s.old_name_pages[0] }) : tc('pages', { n: s.old_name_pages.join(', ') }) }))
    if (s.unreadable) parts.push(t('unreadable'))
    return parts.length ? { text: parts.join(' · '), ok: false } : { text: t('ok'), ok: true }
  }
  const res = result()

  const tip = (it: Item) => (
    <>
      <Box sx={{ fontWeight: 600 }}>{label(it)}</Box>
      <Box sx={{ opacity: 0.75, mt: 0.5 }}>{t(STATE[it.review.status])}</Box>
    </>
  )
  /** Items that share one spot on the page (banner, insert line) are shown as chips. */
  const chip = (it: Item) => (
    <Tooltip key={it.key} title={tip(it)} arrow>
      <Chip
        size="small"
        clickable
        color={decided(it) ? 'default' : tone(it)}
        label={`${items.indexOf(it) + 1}. ${it.kind === 'old_name' ? it.name : label(it)}`}
        onClick={() => select(it.key, false)}
        sx={{ fontWeight: 600, opacity: decided(it) ? 0.7 : 1, textDecoration: it.review.status === 'dismissed' ? 'line-through' : 'none', boxShadow: (th) => (current?.key === it.key ? `0 0 0 3px ${alpha(th.palette.primary.main, 0.45)}` : 'none') }}
      />
    </Tooltip>
  )
  /** The element that stands for these items on the page – the panel's scroll target. */
  const register = (group: Item[]) => (el: HTMLElement | null) => {
    for (const it of group) markers.current[it.key] = el
  }
  /** After a decision the panel moves on to the next open finding, if there is one. */
  const onDecided = (rep: Report, decision: Decision) => {
    setOverride(rep)
    if (decision === 'reopen' || !current) return
    const list = [...(rep.items ?? [])].sort(byPosition)
    const i = list.findIndex((it) => it.key === current.key)
    const after = [...list.slice(i + 1), ...list.slice(0, i)].find((it) => it.review.status === 'open')
    if (after) select(after.key)
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Link component={RouterLink} to="/" underline="hover" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
          <ArrowBackIcon fontSize="small" /> {t('back')}
        </Link>
        <Typography variant="h4" component="h1">
          {doc.title || doc.filename}
        </Typography>
        <Typography color="text.secondary">
          {type(doc.contract_type)} · {doc.pages === 1 ? t('one_page') : t('n_pages', { n: doc.pages })} · {doc.filename}
        </Typography>
        {res && (
          <Typography sx={{ mt: 0.5, fontWeight: 600, color: res.ok ? 'success.main' : 'error.main' }}>
            {res.text}
          </Typography>
        )}
        <Box sx={{ mt: 2 }}>
          <Steps active={2} review={`/contracts/${id}`} download={applied ? `/contracts/${id}/download` : undefined} />
        </Box>
      </Box>

      {doc.injection_suspected && <Alert severity="warning">{t('suspicious')}</Alert>}
      {err && <ErrorAlert msg={err} />}

      {doc.status === 'processing' && (
        <Paper sx={{ p: 3 }}>
          <Typography sx={{ mb: 1.5 }}>{t('reading')}</Typography>
          <LinearProgress />
        </Paper>
      )}
      {doc.status === 'failed' && (
        <Alert severity="error" action={<Button color="inherit" size="small" startIcon={<ReplayIcon />} onClick={retry}>{t('retry')}</Button>}>
          {t('failed_read')}
          <Typography variant="caption" component="div" sx={{ fontFamily: 'monospace', mt: 0.5 }}>{doc.error}</Typography>
        </Alert>
      )}
      {doc.status === 'ready' && (r.status === 'pending' || r.status === 'running') && (
        <Paper sx={{ p: 3 }}>
          <Typography sx={{ mb: 1.5 }}>{t('checking')}</Typography>
          <LinearProgress />
        </Paper>
      )}
      {doc.status === 'ready' && r.status === 'failed' && (
        <Alert severity="error" action={<Button color="inherit" size="small" startIcon={<ReplayIcon />} onClick={recheck}>{t('retry')}</Button>}>
          {t('failed_check')}
          <Typography variant="caption" component="div" sx={{ fontFamily: 'monospace', mt: 0.5 }}>{r.error}</Typography>
        </Alert>
      )}
      {!ready && (
        <Box>
          <Button color="inherit" startIcon={<DeleteOutlineIcon />} onClick={remove}>{t('delete')}</Button>
        </Box>
      )}

      {ready && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1fr) 340px' }, gap: 3, alignItems: 'start' }}>
          {/* ---------------------------------------------------------- the pages */}
          <Stack spacing={3}>
            {items.length === 0 && (
              <Alert icon={<CheckCircleOutlinedIcon />} severity="success">
                {t('ok_text')}
              </Alert>
            )}
            {Array.from({ length: doc.pages }, (_, i) => i + 1).map((n) => {
              const p = pages[n - 1]
              const onPage = items.filter((it) => it.page === n)
              const loose = onPage.filter((it) => !it.anchor.bbox) // no position → one banner at the top of the page
              const inserts = new Map<string, { box: BBox; items: Item[] }>() // insert lines at the same spot → one line, one chip each
              for (const it of onPage) {
                if (it.anchor.kind !== 'insert' || !it.anchor.bbox) continue
                const g = inserts.get(it.anchor.bbox.join()) ?? { box: it.anchor.bbox, items: [] }
                g.items.push(it)
                inserts.set(it.anchor.bbox.join(), g)
              }
              return (
                <Box key={n}>
                  <Typography variant="overline" color="text.secondary" component="div">
                    {tc('page', { n })}
                  </Typography>
                  <Box sx={{ position: 'relative', bgcolor: '#fff', boxShadow: 1 }}>
                    <img src={`/api/documents/${id}/pages/${n}.png`} alt={tc('page', { n })} loading="lazy" style={{ display: 'block', width: '100%', aspectRatio: p ? `${p.width} / ${p.height}` : '210 / 297' }} />
                    {loose.length > 0 && (
                      <Box ref={register(loose)} sx={{ position: 'absolute', top: 0, left: 0, right: 0, px: 1.5, py: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75, fontSize: 13, fontWeight: 600, color: '#fff', bgcolor: (th) => alpha(th.palette.grey[900], 0.8) }}>
                        {t('on_this_page')}
                        {(['missing_clause', 'partial_clause', 'old_name'] as const).map((kind) => {
                          const group = loose.filter((it) => it.kind === kind)
                          return group.length ? (
                            <Fragment key={kind}>
                              <span>· {t(BANNER[kind])}</span>
                              {group.map(chip)}
                            </Fragment>
                          ) : null
                        })}
                      </Box>
                    )}
                    {[...inserts.values()].map(({ box: [x0, y0, x1], items: group }) => {
                      const done = group.every(decided)
                      return (
                        <Box key={group[0].key} ref={register(group)} sx={{ position: 'absolute', left: `${x0 * 100}%`, top: `${y0 * 100}%`, width: `${(x1 - x0) * 100}%`, height: 0, borderTop: '2px dashed', borderColor: done ? 'grey.500' : 'primary.main' }}>
                          <Box sx={{ position: 'absolute', left: 0, bottom: '100%', mb: '3px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', color: done ? 'grey.600' : 'primary.main' }}>
                            {t('here_missing')}
                            {group.map(chip)}
                          </Box>
                        </Box>
                      )
                    })}
                    {onPage.map((it) =>
                      it.anchor.kind === 'highlight' && it.anchor.bbox ? (
                        <Marker key={it.key} item={it} box={it.anchor.bbox} n={items.indexOf(it) + 1} tip={tip(it)} selected={current?.key === it.key} onClick={() => select(it.key, false)} ref={register([it])} />
                      ) : null,
                    )}
                  </Box>
                </Box>
              )
            })}
          </Stack>

          {/* ---------------------------------------------------------- the panel: one finding at a time, then the download */}
          <Stack spacing={2} sx={{ position: { md: 'sticky' }, top: 80, maxHeight: { md: 'calc(100vh - 96px)' }, overflowY: 'auto', order: { xs: -1, md: 0 } }}>
            {current ? (
              <Paper data-testid="finding-card" sx={{ p: 2 }}>
                <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="subtitle2">{t('progress', { i: index + 1, n: items.length })}</Typography>
                  <Box>
                    <IconButton size="small" aria-label={t('prev')} disabled={index <= 0} onClick={() => select(items[index - 1].key)}>
                      <ChevronLeftIcon />
                    </IconButton>
                    <IconButton size="small" aria-label={t('next')} disabled={index >= items.length - 1} onClick={() => select(items[index + 1].key)}>
                      <ChevronRightIcon />
                    </IconButton>
                  </Box>
                </Stack>
                <LinearProgress variant="determinate" value={((items.length - open) / items.length) * 100} sx={{ height: 6, borderRadius: 3, my: 0.5 }} />
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1.5 }}>
                  {open === 0 ? t('all_decided') : t('decided_line', { d: items.length - open, o: open })}
                </Typography>
                <FindingCard key={current.key} docId={id} item={current} title={label(current)} scan={scan} onDecided={onDecided} />
              </Paper>
            ) : (
              <Paper sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary">{t('findings_none')}</Typography>
              </Paper>
            )}

            {items.length > 0 && (
              <Tooltip title={applied ? '' : t('needs_accepted')}>
                <span>
                  <Button fullWidth variant="contained" size="large" endIcon={<ArrowForwardIcon />} disabled={!applied} onClick={() => navigate(`/contracts/${id}/download`)}>
                    {t('to_download')}
                  </Button>
                </span>
              </Tooltip>
            )}
            {scan && items.length > 0 && <Typography variant="caption" color="text.secondary">{t('scan_hint')}</Typography>}

            <Accordion disableGutters sx={{ '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle2">{t('more')}</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
                  {t('present_h')}
                </Typography>
                {present.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">{t('present_none')}</Typography>
                ) : (
                  <Stack component="ul" spacing={0.75} sx={{ m: 0, pl: 0, listStyle: 'none' }}>
                    {present.map((c) => (
                      <Typography component="li" key={c.clause_type} variant="body2">
                        <CheckCircleOutlinedIcon color="success" sx={{ fontSize: 16, verticalAlign: 'text-bottom', mr: 0.75 }} />
                        {clause(c.clause_type)}
                        {c.page && <Typography component="span" variant="body2" color="text.secondary"> – {tc('page', { n: c.page })}</Typography>}
                      </Typography>
                    ))}
                  </Stack>
                )}
                {notRequired.length > 0 && (
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1.5 }}>
                    {t('not_required', { list: notRequired.map((c) => clause(c.clause_type)).join(', ') })}
                  </Typography>
                )}
                {historical.length > 0 && (
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1.5 }}>
                    {t('names_historical', { list: historical.join(', ') })}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1.5 }}>
                  {r.cross_checked ? t('cross_checked') : t('not_cross_checked')}
                  {r.degraded ? ` · ${t('degraded')}` : ''}
                  {r.generated_at ? ` · ${when(r.generated_at)}` : ''}
                </Typography>
              </AccordionDetails>
            </Accordion>

            <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between' }}>
              <Button size="small" color="inherit" startIcon={<ReplayIcon />} onClick={recheck}>{t('recheck')}</Button>
              <Button size="small" color="inherit" startIcon={<DeleteOutlineIcon />} onClick={remove}>{t('delete')}</Button>
            </Stack>
          </Stack>
        </Box>
      )}
    </Stack>
  )
}

// ---------------------------------------------------------------- a highlight box on the page image
type MarkerProps = { item: Item; box: BBox; n: number; tip: ReactNode; selected: boolean; onClick: () => void; ref: (el: HTMLElement | null) => void }

function Marker({ item, box: [x0, y0, x1, y1], n, tip, selected, onClick, ref }: MarkerProps) {
  const done = decided(item)
  const color = (th: Theme) => (done ? th.palette.grey[600] : th.palette[tone(item)].main)
  return (
    <Tooltip title={tip} placement="top" arrow>
      <Box
        ref={ref}
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => e.key === 'Enter' && onClick()}
        sx={{
          position: 'absolute',
          left: `${x0 * 100}%`,
          top: `${y0 * 100}%`,
          width: `${(x1 - x0) * 100}%`,
          height: `${(y1 - y0) * 100}%`,
          border: '2px solid',
          borderColor: color,
          bgcolor: (th) => alpha(color(th), done ? 0.08 : 0.18),
          cursor: 'pointer',
          opacity: done ? 0.6 : 1,
          '&:hover': { opacity: 1 },
          boxShadow: (th) => (selected ? `0 0 0 3px ${alpha(th.palette.primary.main, 0.45)}` : 'none'),
        }}
      >
        <Box component="span" sx={{ position: 'absolute', left: -2, bottom: '100%', mb: '2px', px: 0.75, borderRadius: 0.5, fontSize: 12, fontWeight: 600, lineHeight: 1.5, whiteSpace: 'nowrap', color: '#fff', bgcolor: color, textDecoration: item.review.status === 'dismissed' ? 'line-through' : 'none' }}>
          {n}
        </Box>
      </Box>
    </Tooltip>
  )
}

// ---------------------------------------------------------------- the card: finding, suggestion, decision
type CardProps = { docId: number; item: Item; title: string; scan: boolean; onDecided: (report: Report, decision: Decision) => void }

function FindingCard({ docId, item, title, scan, onDecided }: CardProps) {
  const t = useT(T)
  const tc = useT(COMMON)
  const { lang } = useSettings()
  const toast = useToast()
  const rv = item.review
  const editing = item.editable && rv.status === 'open'
  const [text, setText] = useState(rv.edited_text || item.suggestion)
  const [note, setNote] = useState('')
  const [dismissing, setDismissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const q = (s: string) => (lang === 'de' ? `„${s}“` : `“${s}”`)

  const send = async (decision: Decision) => {
    setBusy(true)
    setErr('')
    try {
      const body: { decision: Decision; note?: string; edited_text?: string } = { decision }
      if (decision === 'accepted' && item.editable) body.edited_text = text
      if (decision === 'dismissed' && note.trim()) body.note = note.trim()
      const rep = await api.decide(docId, item.key, body)
      toast(t(TOAST[decision]))
      onDecided(rep, decision)
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack spacing={1.5}>
      <Box>
        <Typography variant="caption" color="text.secondary">
          {t(KIND[item.kind])} · {tc('page', { n: item.page })}
        </Typography>
        <Typography variant="h6" sx={{ lineHeight: 1.3 }}>{title}</Typography>
      </Box>
      {item.quote && <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>{q(item.quote)}</Typography>}
      {item.reason && (
        <Typography variant="caption" color="text.secondary" component="div">
          {t('why')}: {item.reason}
        </Typography>
      )}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          {item.suggestion_title}
        </Typography>
        {!(rv.edited_text || item.suggestion) && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: editing ? 1 : 0 }}>
            {t('no_suggestion')}
          </Typography>
        )}
        {editing ? (
          <TextField multiline fullWidth size="small" minRows={2} maxRows={10} value={text} onChange={(e) => setText(e.target.value)} />
        ) : (
          (rv.edited_text || item.suggestion) && (
            <>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{rv.edited_text || item.suggestion}</Typography>
              {scan && (
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                  {t('scan_note')}
                </Typography>
              )}
            </>
          )
        )}
      </Box>
      {err && <ErrorAlert msg={err} />}
      {rv.status === 'open' ? (
        dismissing ? (
          <>
            <TextField label={t('note_label')} multiline fullWidth size="small" minRows={2} autoFocus value={note} onChange={(e) => setNote(e.target.value)} />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" disabled={busy} onClick={() => send('dismissed')}>{t('confirm')}</Button>
              <Button color="inherit" disabled={busy} onClick={() => setDismissing(false)}>{t('cancel')}</Button>
            </Stack>
          </>
        ) : (
          <Stack direction="row" spacing={1}>
            <Button variant="contained" size="large" disabled={busy} onClick={() => send('accepted')} sx={{ flex: 1 }}>{t('accept')}</Button>
            <Button variant="outlined" size="large" disabled={busy} onClick={() => setDismissing(true)} sx={{ flex: 1 }}>{t('dismiss')}</Button>
          </Stack>
        )
      ) : (
        <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
          <Chip size="small" variant="outlined" color={rv.status === 'dismissed' ? 'default' : 'success'} label={rv.status === 'auto' ? t('state_auto_long') : t(STATE[rv.status])} sx={{ height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.25 } }} />
          {rv.carried_over && <Typography variant="caption" color="text.secondary">{t('carried_over')}</Typography>}
          {rv.note && (
            <Typography variant="body2" color="text.secondary">
              {t('note_h')}: {rv.note}
            </Typography>
          )}
          <Button size="small" disabled={busy} onClick={() => send('reopen')}>{t('reopen')}</Button>
        </Stack>
      )}
    </Stack>
  )
}
