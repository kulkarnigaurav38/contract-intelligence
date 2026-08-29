import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { api } from '../api'
import { useSettings, useT } from '../i18n'
import { usePolling } from '../components/ui'

const T = {
  title: { de: 'So funktioniert es', en: 'How it works' },
  intro: { de: 'Vier Schritte, vollautomatisch nach dem Ablegen. Der Vertrag selbst wird nie verändert.', en: 'Four steps, fully automatic after the drop. The contract itself is never changed.' },
  s1: { de: 'Lesen', en: 'Read' },
  s1t: { de: 'Digitale PDFs werden direkt gelesen. Scans und Fotos gehen durch eine Texterkennung; wo sie unsicher ist – etwa bei Handschrift –, liest das KI-Modell die Seite als Bild. Was auch dann nicht lesbar ist, wird als „nicht lesbar“ gemeldet statt geraten.', en: 'Digital PDFs are read directly. Scans and photos go through text recognition; where it is unsure – handwriting, for instance – the AI model reads the page as an image. What is still unreadable is reported as such rather than guessed.' },
  s2: { de: 'Zerlegen und einordnen', en: 'Split and label' },
  s2t: { de: 'Der Text wird in Klauseln zerlegt (Nummerierung, Überschriften, §-Zeichen). Jede Klausel wird einer von zwölf Standardklauseln zugeordnet – erst nach Regeln, dann vom Modell; bei Widerspruch entscheidet die Gegenprüfung im nächsten Schritt.', en: 'The text is split into clauses (numbering, headings, § signs). Each clause is assigned to one of twelve standard clause types – by rules first, then by the model; on disagreement the cross-check in the next step decides.' },
  s3: { de: 'Prüfen', en: 'Check' },
  s3t: { de: 'Die Richtlinie sagt, welche Klauseln eine Vertragsart braucht. Fehlt eine, liest das Modell den ganzen Vertrag noch einmal und bestätigt oder verwirft den Fund – mit Seite, Zitat und Begründung. Alte Firmennamen stammen aus einem Register (arvato Financial Solutions, Arvato Payment Solutions GmbH, AFS); „vormals“-Verweise zählen nicht.', en: 'The guideline says which clauses a contract type needs. If one is missing, the model reads the whole contract again and confirms or dismisses the finding – with page, quote and reason. Old company names come from a register (arvato Financial Solutions, Arvato Payment Solutions GmbH, AFS); “formerly” references do not count.' },
  s4: { de: 'Ergebnis', en: 'Result' },
  s4t: { de: 'Pro Vertrag: fehlende Klauseln, alte Firmennamen mit Seite und Zitat, vorhandene Klauseln mit Seite. Jeder Fund lässt sich im Text des Vertrags nachlesen.', en: 'Per contract: missing clauses, old company names with page and quote, present clauses with page. Every finding can be checked in the contract text.' },
  models: { de: 'Eingesetzte Modelle', en: 'Models used' },
  offline: { de: 'Ohne Modellschlüssel läuft nur die Regelprüfung; Ergebnisse sind dann als „ohne KI-Gegenprüfung“ gekennzeichnet.', en: 'Without a model key only the rule check runs; results are then marked “without AI cross-check”.' },
  data: { de: 'Verträge, Text und Ergebnisse liegen in einer eigenen Datenbank; an das Modell gehen nur die Seiten des jeweils geprüften Vertrags. Text im Dokument, der sich an Prüfsysteme richtet, wird erkannt und ignoriert.', en: 'Contracts, text and results live in a dedicated database; only the pages of the contract being checked are sent to the model. Text inside a document that addresses review systems is detected and ignored.' },
}

const PURPOSE: Record<string, { de: string; en: string }> = {
  classify: { de: 'Klauseln einordnen', en: 'Label clauses' },
  extract: { de: 'Vertragsdaten erkennen', en: 'Recognise contract data' },
  verify: { de: 'Gegenprüfung im Volltext', en: 'Full-text cross-check' },
  vision_ocr: { de: 'Handschrift und schwierige Scans lesen', en: 'Read handwriting and difficult scans' },
  screen: { de: 'Verdächtigen Text erkennen', en: 'Detect suspicious text' },
  answer: { de: 'Fragen beantworten', en: 'Answer questions' },
  embed: { de: 'Ähnliche Klauseln finden', en: 'Find similar clauses' },
}

export default function HowItWorks() {
  const t = useT(T)
  const { lang } = useSettings()
  const { data: config } = usePolling(api.config, 0, () => false)
  const steps = [
    ['s1', 's1t'],
    ['s2', 's2t'],
    ['s3', 's3t'],
    ['s4', 's4t'],
  ] as const

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
          {t('title')}
        </Typography>
        <Typography color="text.secondary">{t('intro')}</Typography>
      </Box>
      <Stack spacing={2}>
        {steps.map(([h, b], i) => (
          <Paper key={h} sx={{ p: 3, display: 'flex', gap: 2.5 }}>
            <Typography variant="h4" color="primary" sx={{ minWidth: 40, lineHeight: 1 }}>
              {i + 1}
            </Typography>
            <Box>
              <Typography variant="h6" sx={{ mb: 0.5 }}>
                {t(h)}
              </Typography>
              <Typography color="text.secondary">{t(b)}</Typography>
            </Box>
          </Paper>
        ))}
      </Stack>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          {t('models')}
        </Typography>
        {config?.llm_enabled ? (
          <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 3, rowGap: 0.5 }}>
            {config.routing
              .filter((r) => r.task in PURPOSE)
              .map((r) => (
                <Box key={r.task} sx={{ display: 'contents' }}>
                  <Typography component="dt" variant="body2">{PURPOSE[r.task][lang]}</Typography>
                  <Typography component="dd" variant="body2" color="text.secondary" sx={{ m: 0, fontFamily: 'monospace' }}>{r.model}</Typography>
                </Box>
              ))}
          </Box>
        ) : (
          <Typography color="text.secondary">{t('offline')}</Typography>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {t('data')}
        </Typography>
      </Paper>
    </Stack>
  )
}
