import { useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import SendIcon from '@mui/icons-material/Send'
import HistoryIcon from '@mui/icons-material/History'
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import ManageSearchIcon from '@mui/icons-material/ManageSearch'
import { api, type ChatResult, type Passage } from '../api'
import { useLabel, useSettings, useT } from '../i18n'
import { Details, Small, Tech } from '../components/tech'
import { EmptyState, ErrorAlert, Quote, quoted, usePolling } from '../components/ui'
import { CLAUSE_TYPES, COMMON } from '../vocab'

const T = {
  headline: { de: 'Fragen Sie Ihre Verträge', en: 'Ask your contracts' },
  intro: {
    de: 'Stellen Sie Ihre Frage in ganzen Sätzen. Wir suchen die passenden Stellen in allen gelesenen Verträgen und zeigen sie Ihnen mit Seitenangabe.',
    en: 'Ask in full sentences. We look for the matching passages in all contracts we have read and show them with page numbers.',
  },
  placeholder: {
    de: 'Zum Beispiel: Welche Kündigungsfrist gilt im Inkassovertrag mit Rheinland Energie?',
    en: 'For example: What notice period applies in the collection services agreement with Rheinland Energie?',
  },
  ask: { de: 'Fragen', en: 'Ask' },
  enter_hint: { de: 'Enter sendet die Frage, Umschalt+Enter fügt eine neue Zeile ein.', en: 'Enter sends the question, Shift+Enter adds a new line.' },
  examples: { de: 'Beispiele', en: 'Examples' },
  ex1: { de: 'Welcher Gerichtsstand gilt im Vertrag mit Nordlicht Möbelhaus?', en: 'Which place of jurisdiction applies in the contract with Nordlicht Möbelhaus?' },
  ex2: { de: 'Welche Kündigungsfrist gilt im Inkassovertrag mit Rheinland Energie?', en: 'What notice period applies in the collection services agreement with Rheinland Energie?' },
  ex3: { de: 'Welche Haftungsgrenze gilt im Händlervertrag mit Lumen Retail?', en: 'What liability cap applies in the merchant agreement with Lumen Retail?' },
  recent: { de: 'Zuletzt gefragt', en: 'Recently asked' },
  clear_recent: { de: 'Verlauf löschen', en: 'Clear history' },
  searching: { de: 'Wir suchen in {n} Verträgen …', en: 'We are searching {n} contracts …' },
  searching_plain: { de: 'Wir suchen in Ihren Verträgen …', en: 'We are searching your contracts …' },
  answer: { de: 'Antwort', en: 'Answer' },
  your_question: { de: 'Ihre Frage', en: 'Your question' },
  badge_ai: { de: 'Antwort mit Belegen (KI)', en: 'Answer with evidence (AI)' },
  badge_offline: { de: 'Nur Fundstellen (ohne KI)', en: 'Passages only (no AI)' },
  offline_note: {
    de: 'Ohne KI-Verbindung zeigen wir die passendsten Stellen statt einer Antwort.',
    en: 'Without an AI connection we show the most relevant passages instead of an answer.',
  },
  cited: { de: 'Belegstellen', en: 'Cited passages' },
  best_matches: { de: 'Passendste Stellen', en: 'Most relevant passages' },
  none_found: {
    de: 'Wir haben keine passende Stelle gefunden. Formulieren Sie die Frage bitte anders oder nennen Sie den Vertragspartner.',
    en: 'We could not find a matching passage. Please rephrase the question or name the counterparty.',
  },
  more: { de: 'Weitere gefundene Stellen ({n})', en: 'More passages found ({n})' },
  footer: {
    de: 'Jede Aussage stützt sich auf eine zitierte Stelle. Ohne Beleg keine Aussage – bitte prüfen Sie die Fundstelle im Vertrag.',
    en: 'Every statement rests on a cited passage. No evidence, no statement – please check the passage in the contract.',
  },
  mode: { de: 'Modus', en: 'Mode' },
  score: { de: 'Trefferwert', en: 'Score' },
  empty_title: { de: 'Noch keine Verträge.', en: 'No contracts yet.' },
  empty_text: {
    de: 'Laden Sie zuerst Verträge hoch oder starten Sie mit den Beispielverträgen. Danach können Sie hier Fragen stellen.',
    en: 'Upload contracts first or start with the sample contracts. After that you can ask questions here.',
  },
  reading_title: { de: 'Wir lesen gerade Ihre Verträge.', en: 'We are reading your contracts.' },
  reading_text: { de: 'Fragen sind möglich, sobald der erste Vertrag bereit ist.', en: 'You can ask questions as soon as the first contract is ready.' },
  add_contracts: { de: 'Verträge hinzufügen', en: 'Add contracts' },
  to_contracts: { de: 'Zu den Verträgen', en: 'Go to contracts' },
}

const EXAMPLES = ['ex1', 'ex2', 'ex3'] as const
const RECENT_KEY = 'ask.recent'
const RECENT_MAX = 5

function loadRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}

function saveRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)))
  } catch {
    /* private mode etc. */
  }
}

/** One line of a passage for the collapsed list; whole words, no mid-word cut. */
function snippet(text: string, max = 220): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max)
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 40)) + ' …'
}

const contractLink = (p: Pick<Passage, 'document_id' | 'page'>) => `/contracts?open=${p.document_id}&page=${p.page}`

/** The AI answer with its "[n]" passage markers turned into small numbers that point at the cited passages below. */
function AnswerText({ text, citations }: { text: string; citations: ChatResult['citations'] }) {
  const { tech } = useSettings()
  const parts = text.split(/(\[\d+\])/g)
  return (
    <Typography variant="body1" component="div" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
      {parts.map((part, i) => {
        const m = /^\[(\d+)\]$/.exec(part)
        if (!m) return <span key={i}>{part}</span>
        const pos = citations.findIndex((c) => c.index === Number(m[1]))
        if (pos < 0) return tech ? <span key={i}>{part}</span> : null
        return (
          <Box
            key={i}
            component="sup"
            sx={{ display: 'inline-block', minWidth: 16, px: 0.5, mx: 0.25, borderRadius: 1, bgcolor: 'primary.light', color: 'primary.contrastText', fontSize: 10, lineHeight: '16px', textAlign: 'center', verticalAlign: 'super' }}
          >
            {pos + 1}
          </Box>
        )
      })}
    </Typography>
  )
}

function CitationCard({ citation, position, offline }: { citation: ChatResult['citations'][number]; position: number; offline: boolean }) {
  const t = useT(T)
  const tc = useT(COMMON)
  const clauseLabel = useLabel(CLAUSE_TYPES)
  const navigate = useNavigate()
  const quote = citation.quote.replace(/\s+/g, ' ').trim()
  const truncated = offline && citation.text.replace(/\s+/g, ' ').trim().length > quote.length
  return (
    <Paper sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Chip size="small" label={String(position)} sx={{ minWidth: 28 }} />
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {citation.title || citation.filename}
        </Typography>
        <Tech>
          <Small sx={{ fontFamily: 'monospace' }}>
            [{citation.index}] · {t('score')} {citation.score}
          </Small>
        </Tech>
      </Stack>
      <Quote page={citation.page} quote={truncated ? `${quote} …` : quote} label={clauseLabel(citation.clause_type)} />
      <Button size="small" variant="text" startIcon={<OpenInNewIcon />} onClick={() => navigate(contractLink(citation))} sx={{ mt: 0.5 }}>
        {tc('open_contract')}
      </Button>
    </Paper>
  )
}

function MorePassage({ passage }: { passage: Passage }) {
  const t = useT(T)
  const tc = useT(COMMON)
  const clauseLabel = useLabel(CLAUSE_TYPES)
  const navigate = useNavigate()
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="subtitle2">{passage.title || passage.filename}</Typography>
        <Tech>
          <Small sx={{ fontFamily: 'monospace' }}>
            [{passage.index}] · {t('score')} {passage.score}
          </Small>
        </Tech>
      </Stack>
      <Quote page={passage.page} quote={snippet(passage.text)} label={clauseLabel(passage.clause_type)} />
      <Link component="button" type="button" variant="caption" underline="hover" onClick={() => navigate(contractLink(passage))}>
        {tc('open_contract')}
      </Link>
    </Box>
  )
}

function AnswerCard({ question, data }: { question: string; data: ChatResult }) {
  const { lang } = useSettings()
  const t = useT(T)
  const offline = data.mode === 'offline'
  const cited = new Set(data.citations.map((c) => c.index))
  const rest = data.passages.filter((p) => !cited.has(p.index))
  return (
    <Paper sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="h6">{t('answer')}</Typography>
          <Chip size="small" variant="outlined" color={offline ? 'warning' : 'success'} label={offline ? t('badge_offline') : t('badge_ai')} />
          <Tech>
            <Small sx={{ fontFamily: 'monospace' }}>
              {t('mode')}: {data.mode}
            </Small>
          </Tech>
        </Stack>
        <Small>
          {t('your_question')}: {quoted(question, lang)}
        </Small>

        {offline ? (
          <Typography variant="body1">{t('offline_note')}</Typography>
        ) : (
          <AnswerText text={data.answer} citations={data.citations} />
        )}

        {data.citations.length > 0 ? (
          <Stack spacing={1.5}>
            <Typography variant="subtitle2" color="text.secondary">
              {offline ? t('best_matches') : t('cited')}
            </Typography>
            {data.citations.map((c, i) => (
              <CitationCard key={`${c.index}-${i}`} citation={c} position={i + 1} offline={offline} />
            ))}
          </Stack>
        ) : (
          data.passages.length === 0 && <Typography variant="body2">{t('none_found')}</Typography>
        )}

        {rest.length > 0 && (
          <Details label={t('more', { n: rest.length })}>
            <Stack spacing={2}>
              {rest.map((p) => (
                <MorePassage key={p.index} passage={p} />
              ))}
            </Stack>
          </Details>
        )}

        <Small>{t('footer')}</Small>
      </Stack>
    </Paper>
  )
}

export default function Ask() {
  const t = useT(T)
  const { lang } = useSettings()
  const navigate = useNavigate()
  const { data: docs } = usePolling(api.documents, 0, () => false)
  const [question, setQuestion] = useState('')
  const [recent, setRecent] = useState<string[]>(loadRecent)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ question: string; data: ChatResult } | null>(null)

  const readyCount = docs ? docs.filter((d) => d.status === 'ready').length : null
  const readingCount = docs ? docs.filter((d) => d.status === 'queued' || d.status === 'processing').length : 0

  const ask = async (raw: string) => {
    const q = raw.trim()
    if (!q || busy) return
    setQuestion(q)
    const next = [q, ...recent.filter((r) => r !== q)].slice(0, RECENT_MAX)
    setRecent(next)
    saveRecent(next)
    setBusy(true)
    setError('')
    try {
      const data = await api.chat(q, lang)
      setResult({ question: q, data })
    } catch (e) {
      setError(String(e))
    }
    setBusy(false)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void ask(question)
    }
  }

  const clearRecent = () => {
    setRecent([])
    saveRecent([])
  }

  const noContracts = docs !== null && docs.length === 0
  const nothingReady = docs !== null && docs.length > 0 && readyCount === 0

  return (
    <Stack spacing={3} sx={{ maxWidth: 920 }}>
      <Box>
        <Typography variant="h5">{t('headline')}</Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
          {t('intro')}
        </Typography>
      </Box>

      {noContracts || nothingReady ? (
        <Paper>
          <EmptyState
            icon={<DescriptionOutlinedIcon sx={{ fontSize: 40 }} />}
            title={nothingReady ? t('reading_title') : t('empty_title')}
            text={nothingReady ? t('reading_text') : t('empty_text')}
            action={
              <Button variant="contained" onClick={() => navigate('/contracts')}>
                {nothingReady ? t('to_contracts') : t('add_contracts')}
              </Button>
            }
          />
          {nothingReady && readingCount > 0 && <LinearProgress sx={{ mx: 3, mb: 3 }} />}
        </Paper>
      ) : (
        <>
          <Paper sx={{ p: 2.5 }}>
            <Stack spacing={2}>
              <TextField
                fullWidth
                multiline
                minRows={2}
                autoFocus
                placeholder={t('placeholder')}
                helperText={t('enter_hint')}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={busy}
                sx={{ '& .MuiInputBase-input': { fontSize: 18, lineHeight: 1.5 } }}
              />
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="contained" size="large" endIcon={<SendIcon />} onClick={() => void ask(question)} disabled={busy || !question.trim()}>
                  {t('ask')}
                </Button>
              </Box>

              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                <LightbulbOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                <Small>{t('examples')}</Small>
                {EXAMPLES.map((k) => (
                  <Chip
                    key={k}
                    variant="outlined"
                    label={t(k)}
                    disabled={busy}
                    onClick={() => void ask(t(k))}
                    sx={{ height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }}
                  />
                ))}
              </Box>

              {recent.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                  <HistoryIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                  <Small>{t('recent')}</Small>
                  {recent.map((q) => (
                    <Chip
                      key={q}
                      label={q}
                      disabled={busy}
                      onClick={() => void ask(q)}
                      sx={{ height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }}
                    />
                  ))}
                  <Link component="button" type="button" variant="caption" underline="hover" onClick={clearRecent} sx={{ color: 'text.secondary' }}>
                    {t('clear_recent')}
                  </Link>
                </Box>
              )}
            </Stack>
          </Paper>

          {busy && (
            <Paper sx={{ p: 2.5 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <ManageSearchIcon color="primary" />
                  <Typography variant="body1">{readyCount === null ? t('searching_plain') : t('searching', { n: readyCount })}</Typography>
                </Stack>
                <LinearProgress />
              </Stack>
            </Paper>
          )}

          {error && !busy && <ErrorAlert msg={error} />}

          {result && !busy && <AnswerCard question={result.question} data={result.data} />}
        </>
      )}
    </Stack>
  )
}
