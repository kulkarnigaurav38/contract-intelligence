import { type ReactNode } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { api, type Config } from '../api'
import { useLabel, useSettings, useT } from '../i18n'
import { Small, Tech } from '../components/tech'
import { ErrorAlert, usePolling } from '../components/ui'
import { COMMON, ROUTING_TASKS, THINKING, modelTier } from '../vocab'

const T = {
  providers: { de: 'Aktive Anbieter: Modelle über {llm} · Texterkennung {ocr} · Verträge aus {src}. Jede Stufe hat eine Best-of-Breed- und eine Microsoft-Implementierung hinter demselben Schalter.', en: 'Active providers: models via {llm} · text recognition {ocr} · contracts from {src}. Each stage has a best-of-breed and a Microsoft implementation behind the same switch.' },
  llm_gemini: { de: 'Google Gemini', en: 'Google Gemini' },
  llm_foundry: { de: 'Azure AI Foundry', en: 'Azure AI Foundry' },
  llm_none: { de: 'keinen Anbieter', en: 'no provider' },
  ocr_tesseract: { de: 'Tesseract (lokal)', en: 'Tesseract (local)' },
  ocr_document_intelligence: { de: 'Azure AI Document Intelligence', en: 'Azure AI Document Intelligence' },
  src_local: { de: 'dem lokalen Ordner', en: 'the local folder' },
  src_sharepoint: { de: 'SharePoint (Microsoft Graph)', en: 'SharePoint (Microsoft Graph)' },
  loading: { de: 'Wir laden die Einstellungen …', en: 'Loading the settings …' },
  status_on: { de: 'KI-Gegenprüfung aktiv – alle Stufen laufen.', en: 'AI cross-check active – all stages are running.' },
  status_off: {
    de: 'Keine KI verbunden – Regelprüfung, Namensregister, Texterkennung und Suche laufen; Funde werden als „nicht gegengeprüft“ gekennzeichnet. Handschrift kann nicht gelesen werden.',
    en: 'No AI connected – rule check, name registry, text recognition and search are running; findings are marked “not cross-checked”. Handwriting cannot be read.',
  },
  intro: {
    de: 'Der Denkaufwand folgt der Aufgabe: Routinearbeit läuft auf einem schnellen Modell, das große Modell ist für Handschrift und für die Gegenprüfung reserviert.',
    en: 'Reasoning effort follows the task: routine work runs on a fast model; the large model is reserved for handwriting and for the cross-check.',
  },
  offline_note: {
    de: 'Diese Zuordnung gilt, sobald eine KI-Verbindung besteht.',
    en: 'This assignment applies as soon as an AI connection is available.',
  },
  col_task: { de: 'Aufgabe', en: 'Task' },
  col_model: { de: 'Modell', en: 'Model' },
  col_thinking: { de: 'Denkaufwand', en: 'Reasoning effort' },
  col_purpose: { de: 'Zweck', en: 'Purpose' },
  purpose_ocr_vision: {
    de: 'Liest gescannte Seiten und Handschrift, wenn die Texterkennung nicht ausreicht.',
    en: 'Reads scanned pages and handwriting when text recognition is not good enough.',
  },
  purpose_classify: {
    de: 'Ordnet jede Klausel einer der zwölf Klauselarten zu.',
    en: 'Assigns each clause to one of the twelve clause types.',
  },
  purpose_extract: {
    de: 'Erkennt Vertragsparteien, Titel und Vertragsart.',
    en: 'Identifies the contracting parties, the title and the contract type.',
  },
  purpose_screen: {
    de: 'Prüft den Text auf Anweisungen, die sich an automatische Prüfsysteme richten.',
    en: 'Checks the text for instructions addressed to automated review systems.',
  },
  purpose_verify: {
    de: 'Prüft jeden Fund unabhängig im vollständigen Vertragstext nach.',
    en: 'Independently re-checks each finding against the full contract text.',
  },
  purpose_answer: {
    de: 'Beantwortet Fragen zu Ihren Verträgen mit Belegen aus den gefundenen Stellen.',
    en: 'Answers questions about your contracts with evidence from the passages found.',
  },
  purpose_embeddings: {
    de: 'Findet ähnliche Stellen, auch wenn der Wortlaut abweicht.',
    en: 'Finds similar passages even when the wording differs.',
  },
  purpose_other: { de: 'Weitere Aufgabe im Hintergrund.', en: 'Further background task.' },
  dims: { de: '{n} Dimensionen', en: '{n} dimensions' },
}

const never = () => false

/** Reasoning effort as a word; the large model's high effort is the only filled chip. */
function ThinkingChip({ level }: { level: string }) {
  const label = useLabel(THINKING)
  const high = level === 'high'
  const medium = level === 'medium'
  return <Chip size="small" label={label(level)} color={high ? 'secondary' : medium ? 'primary' : 'default'} variant={high ? 'filled' : 'outlined'} />
}

/** The tier word a lawyer sees; the raw model id only with the technical switch. */
function ModelCell({ id, children }: { id: string; children?: ReactNode }) {
  const { lang } = useSettings()
  return (
    <Box>
      <Typography variant="body2">{modelTier(id)[lang]}</Typography>
      <Tech>
        <Small sx={{ fontFamily: 'monospace' }}>{id}</Small>
        {children}
      </Tech>
    </Box>
  )
}

function RoutingRow({ row }: { row: Config['routing'][number] }) {
  const t = useT(T)
  const taskLabel = useLabel(ROUTING_TASKS)
  const key = `purpose_${row.task}`
  const purpose = key in T ? t(key as keyof typeof T) : t('purpose_other')
  return (
    <TableRow>
      <TableCell sx={{ verticalAlign: 'top' }}>
        <Typography variant="body2">{taskLabel(row.task)}</Typography>
        <Tech>
          <Small sx={{ fontFamily: 'monospace' }}>{row.task}</Small>
        </Tech>
      </TableCell>
      <TableCell sx={{ verticalAlign: 'top' }}>
        <ModelCell id={row.model} />
      </TableCell>
      <TableCell sx={{ verticalAlign: 'top' }}>
        <ThinkingChip level={row.thinking} />
      </TableCell>
      <TableCell sx={{ verticalAlign: 'top' }}>
        <Typography variant="body2">{purpose}</Typography>
        <Tech>
          <Small>{row.purpose}</Small>
        </Tech>
      </TableCell>
    </TableRow>
  )
}

function EmbeddingsRow({ embedding }: { embedding: Config['embedding'] }) {
  const t = useT(T)
  const taskLabel = useLabel(ROUTING_TASKS)
  return (
    <TableRow>
      <TableCell sx={{ verticalAlign: 'top' }}>
        <Typography variant="body2">{taskLabel('embeddings')}</Typography>
        <Tech>
          <Small sx={{ fontFamily: 'monospace' }}>embeddings</Small>
        </Tech>
      </TableCell>
      <TableCell sx={{ verticalAlign: 'top' }}>
        <ModelCell id={embedding.model}>
          <Small>{t('dims', { n: embedding.dim })}</Small>
        </ModelCell>
      </TableCell>
      <TableCell sx={{ verticalAlign: 'top' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          –
        </Typography>
      </TableCell>
      <TableCell sx={{ verticalAlign: 'top' }}>
        <Typography variant="body2">{t('purpose_embeddings')}</Typography>
      </TableCell>
    </TableRow>
  )
}

export default function Models() {
  const t = useT(T)
  const c = useT(COMMON)
  const { data: config, error } = usePolling(api.config, 0, never)

  return (
    <Stack spacing={2.5} sx={{ maxWidth: 1040 }}>
      <Typography variant="h5">{c('nav_models')}</Typography>

      {error && <ErrorAlert msg={error} />}

      {!config && !error && (
        <Box>
          <LinearProgress />
          <Small sx={{ mt: 1 }}>{t('loading')}</Small>
        </Box>
      )}

      {config && (
        <>
          <Alert severity={config.llm_enabled ? 'success' : 'warning'}>{config.llm_enabled ? t('status_on') : t('status_off')}</Alert>

          <Typography variant="body1">{t('intro')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('providers', { llm: t(`llm_${config.provider}` as keyof typeof T), ocr: t(`ocr_${config.ocr_provider}` as keyof typeof T), src: t(`src_${config.document_source}` as keyof typeof T) })}
          </Typography>

          <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('col_task')}</TableCell>
                  <TableCell>{t('col_model')}</TableCell>
                  <TableCell>{t('col_thinking')}</TableCell>
                  <TableCell>{t('col_purpose')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {config.routing.map((row) => (
                  <RoutingRow key={row.task} row={row} />
                ))}
                <EmbeddingsRow embedding={config.embedding} />
              </TableBody>
            </Table>
          </TableContainer>

          {!config.llm_enabled && <Small>{t('offline_note')}</Small>}
        </>
      )}
    </Stack>
  )
}
