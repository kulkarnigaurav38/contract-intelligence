import { useState } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import ReplayIcon from '@mui/icons-material/Replay'
import { api, type DocDetail, type ReportClause } from '../api'
import { useLabel, useSettings, useT } from '../i18n'
import { ErrorAlert, usePolling, useToast } from '../components/ui'
import { CLAUSE_TYPES, COMMON, CONTRACT_TYPES } from '../vocab'

const T = {
  back: { de: 'Alle Verträge', en: 'All contracts' },
  reading: { de: 'Der Vertrag wird gelesen …', en: 'Reading the contract …' },
  checking: { de: 'Der Vertrag wird geprüft …', en: 'Checking the contract …' },
  failed_read: { de: 'Der Vertrag konnte nicht gelesen werden.', en: 'The contract could not be read.' },
  failed_check: { de: 'Die Prüfung ist fehlgeschlagen.', en: 'The check failed.' },
  retry: { de: 'Erneut versuchen', en: 'Try again' },
  recheck: { de: 'Erneut prüfen', en: 'Check again' },
  delete: { de: 'Löschen', en: 'Delete' },
  delete_confirm: { de: 'Diesen Vertrag aus der Prüfung entfernen?', en: 'Remove this contract from the check?' },
  ok: { de: 'Alles in Ordnung', en: 'All good' },
  ok_text: { de: 'Alle für diese Vertragsart erforderlichen Klauseln sind vorhanden, und es wird kein alter Firmenname mehr genannt.', en: 'All clauses required for this contract type are present and no old company name is used.' },
  missing_h: { de: 'Fehlende Klauseln', en: 'Missing clauses' },
  missing_none: { de: 'Keine erforderliche Klausel fehlt.', en: 'No required clause is missing.' },
  partial: { de: 'Nur teilweise', en: 'Only partly' },
  not_required: { de: 'Für diese Vertragsart nicht erforderlich und ebenfalls nicht enthalten: {list}.', en: 'Not required for this contract type and also not included: {list}.' },
  names_h: { de: 'Alter Firmenname', en: 'Old company name' },
  names_none: { de: 'Kein alter Firmenname wird als Vertragspartei genannt.', en: 'No old company name is used as a contracting party.' },
  names_historical: { de: 'Nur als Verweis („vormals …“) genannt, das ist in Ordnung: {list}.', en: 'Only mentioned as a reference (“formerly …”), which is fine: {list}.' },
  names_fuzzy: { de: 'ähnliche Schreibweise (Scan)', en: 'similar spelling (scan)' },
  present_h: { de: 'Vorhandene Klauseln', en: 'Clauses present' },
  present_none: { de: 'Keine der Standardklauseln wurde erkannt.', en: 'None of the standard clauses was recognised.' },
  text_h: { de: 'Text des Vertrags', en: 'Contract text' },
  text_unreadable: { de: 'Diese Seite konnte nicht zuverlässig gelesen werden – bitte das Original prüfen.', en: 'This page could not be read reliably – please check the original.' },
  cross_checked: { de: 'Regelprüfung mit KI-Gegenprüfung im Volltext', en: 'Rule check with AI cross-check of the full text' },
  not_cross_checked: { de: 'Nur Regelprüfung – ohne KI-Gegenprüfung', en: 'Rule check only – without AI cross-check' },
  suspicious: { de: 'Dieses Dokument enthält Text, der sich an automatische Prüfsysteme richtet. Solche Anweisungen werden ignoriert – bitte mit besonderer Sorgfalt prüfen.', en: 'This document contains text addressed to automated review systems. Such instructions are ignored – please review with particular care.' },
  n_pages: { de: '{n} Seiten', en: '{n} pages' },
  one_page: { de: '1 Seite', en: '1 page' },
  why: { de: 'Begründung', en: 'Reason' },
  rechecking: { de: 'Die Prüfung läuft erneut.', en: 'The check is running again.' },
}

const active = (d: DocDetail | null) => !d || d.status === 'processing' || d.report.status === 'pending' || d.report.status === 'running'

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
  const { data: doc, error, reload } = usePolling(() => api.document(id), 3000, active)

  const recheck = async () => {
    try {
      await api.recheck(id, lang)
      toast(t('rechecking'))
      reload()
    } catch (e) {
      setErr(String(e))
    }
  }
  const retry = async () => {
    try {
      await api.retryDocument(id)
      reload()
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

  if (error && !doc) return <ErrorAlert msg={error} />
  if (!doc) return <LinearProgress />

  const r = doc.report
  const clauses = r.clauses ?? []
  const missing = clauses.filter((c) => c.required && c.status !== 'present')
  const notRequired = clauses.filter((c) => !c.required && c.status !== 'present')
  const present = clauses.filter((c) => c.status === 'present')
  const names = r.old_names ?? []
  const allGood = r.status === 'ready' && missing.length === 0 && names.length === 0
  const q = (s: string) => (lang === 'de' ? `„${s}“` : `“${s}”`)
  const where = (c: ReportClause) => (c.page ? tc('page', { n: c.page }) : '')

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

      {r.status === 'ready' && (
        <>
          {allGood && (
            <Alert icon={<CheckCircleOutlinedIcon />} severity="success">
              <Typography sx={{ fontWeight: 600 }}>{t('ok')}</Typography>
              {t('ok_text')}
            </Alert>
          )}

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              {missing.length > 0 && <ErrorOutlineIcon color="error" />} {t('missing_h')} {missing.length > 0 && <Chip size="small" color="error" label={missing.length} />}
            </Typography>
            {missing.length === 0 ? (
              <Typography color="text.secondary">{t('missing_none')}</Typography>
            ) : (
              <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', pl: 0, m: 0 }}>
                {missing.map((c) => (
                  <Box component="li" key={c.clause_type}>
                    <Typography sx={{ fontWeight: 600 }}>
                      {clause(c.clause_type)}
                      {c.status === 'partial' && <Chip size="small" color="warning" variant="outlined" label={`${t('partial')}${c.page ? ` · ${where(c)}` : ''}`} sx={{ ml: 1 }} />}
                    </Typography>
                    {c.status === 'partial' && c.quote && (
                      <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>{q(c.quote)}</Typography>
                    )}
                    {c.reason && (
                      <Typography variant="body2" color="text.secondary">
                        {t('why')}: {c.reason}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Stack>
            )}
            {notRequired.length > 0 && (
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 2 }}>
                {t('not_required', { list: notRequired.map((c) => clause(c.clause_type)).join(', ') })}
              </Typography>
            )}
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              {names.length > 0 && <ErrorOutlineIcon color="error" />} {t('names_h')} {names.length > 0 && <Chip size="small" color="error" label={names.length} />}
            </Typography>
            {names.length === 0 ? (
              <Typography color="text.secondary">{t('names_none')}</Typography>
            ) : (
              <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', pl: 0, m: 0 }}>
                {names.map((n, i) => (
                  <Box component="li" key={i}>
                    <Typography sx={{ fontWeight: 600 }}>
                      {tc('page', { n: n.page })} · {n.name}
                      {n.fuzzy && <Chip size="small" variant="outlined" label={t('names_fuzzy')} sx={{ ml: 1 }} />}
                    </Typography>
                    <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>{q(n.quote)}</Typography>
                  </Box>
                ))}
                {r.old_names_reason && (
                  <Typography variant="body2" color="text.secondary">
                    {t('why')}: {r.old_names_reason}
                  </Typography>
                )}
              </Stack>
            )}
            {(r.historical_names ?? []).length > 0 && (
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 2 }}>
                {t('names_historical', { list: (r.historical_names ?? []).join(', ') })}
              </Typography>
            )}
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              {t('present_h')}
            </Typography>
            {present.length === 0 ? (
              <Typography color="text.secondary">{t('present_none')}</Typography>
            ) : (
              <Box component="ul" sx={{ m: 0, pl: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 0.75 }}>
                {present.map((c) => (
                  <Typography component="li" key={c.clause_type} variant="body2">
                    <CheckCircleOutlinedIcon color="success" sx={{ fontSize: 16, verticalAlign: 'text-bottom', mr: 0.75 }} />
                    {clause(c.clause_type)} <Typography component="span" variant="body2" color="text.secondary">– {where(c)}</Typography>
                  </Typography>
                ))}
              </Box>
            )}
          </Paper>

          <Typography variant="caption" color="text.secondary">
            {r.cross_checked ? t('cross_checked') : t('not_cross_checked')}
            {r.generated_at ? ` · ${new Date(r.generated_at).toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB')}` : ''}
          </Typography>
        </>
      )}

      {doc.status === 'ready' && (
        <Accordion disableGutters sx={{ '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography sx={{ fontWeight: 600 }}>{t('text_h')}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              {doc.page_rows.map((p) => (
                <Box key={p.page_no}>
                  <Typography variant="overline" color="text.secondary">
                    {tc('page', { n: p.page_no })}
                  </Typography>
                  {p.method === 'tesseract' && p.confidence < 0.5 ? (
                    <Typography variant="body2" color="text.secondary">{t('text_unreadable')}</Typography>
                  ) : (
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'Georgia, serif' }}>{p.text}</Typography>
                  )}
                </Box>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      <Stack direction="row" spacing={1}>
        {doc.status === 'ready' && r.status !== 'running' && (
          <Button variant="outlined" startIcon={<ReplayIcon />} onClick={recheck}>{t('recheck')}</Button>
        )}
        <Button color="inherit" startIcon={<DeleteOutlineIcon />} onClick={remove}>{t('delete')}</Button>
      </Stack>
    </Stack>
  )
}
