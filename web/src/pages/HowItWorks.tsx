import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { api, type Doc, type DocDetail } from '../api'
import { useSettings, useT } from '../i18n'
import { usePolling } from '../components/ui'

const T = {
  title: { de: 'So funktioniert es', en: 'How it works' },
  intro: {
    de: 'Jeder Vertrag durchläuft diese Schritte – automatisch nach dem Ablegen, in dieser Reihenfolge. Die Seite wird aus dem Code erzeugt und ist immer aktuell.',
    en: 'Every contract goes through these steps – automatically after the drop, in this order. This page is generated from the code and is always up to date.',
  },
  read: { de: 'Lesen', en: 'Read' },
  check: { de: 'Prüfen', en: 'Check' },
  decide: { de: 'Entscheiden', en: 'Decide' },
  produces: { de: '→ erzeugt: {x}', en: '→ produces: {x}' },
  example: { de: 'Beispiel: {title}', en: 'Example: {title}' },
  ex_pages: { de: '{pages} Seiten: {t} Textebene, {o} OCR, {v} Vision', en: '{pages} pages: {t} text layer, {o} OCR, {v} vision' },
  ex_clauses: { de: '{n} Klauseln erkannt', en: '{n} clauses recognised' },
  ex_entities: { de: '{n} Namensfunde', en: '{n} name hits' },
  ex_rules: { de: '{required} erforderliche Klauseltypen, {missing} fehlen, {partial} nur teilweise, {old_names} alte Namen', en: '{required} required clause types, {missing} missing, {partial} only partly, {old_names} old names' },
  ex_placed: { de: '{placed} von {items} Funden exakt verortet', en: '{placed} of {items} findings placed exactly' },
  ex_drafted: { de: '{n} Vorschläge', en: '{n} suggestions' },
  ex_decisions: { de: '{open} offen, {accepted} übernommen, {dismissed} nicht zutreffend, {auto} automatisch', en: '{open} open, {accepted} accepted, {dismissed} not applicable, {auto} automatic' },
  ex_copy: { de: 'Korrigierte Kopie: {s}', en: 'Corrected copy: {s}' },
  copy_yes: { de: 'verfügbar', en: 'available' },
  copy_no: { de: 'sobald ein Vorschlag übernommen ist', en: 'once a suggestion is accepted' },
  open: { de: 'Vertrag öffnen', en: 'Open contract' },
  offline: { de: 'Ohne Modellschlüssel läuft nur die Regelprüfung; Ergebnisse sind dann als „ohne KI-Gegenprüfung“ gekennzeichnet.', en: 'Without a model key only the rule check runs; results are then marked “without AI cross-check”.' },
  data: { de: 'Verträge, Text und Ergebnisse liegen in einer eigenen Datenbank; an das Modell gehen nur die Seiten des jeweils geprüften Vertrags. Text im Dokument, der sich an Prüfsysteme richtet, wird erkannt und ignoriert.', en: 'Contracts, text and results live in a dedicated database; only the pages of the contract being checked are sent to the model. Text inside a document that addresses review systems is detected and ignored.' },
}

const PHASES = ['read', 'check', 'decide'] as const

/** A checked contract with something to show (a missing clause or an old name). */
const showable = (d: Doc) => d.report_status === 'ready' && !!d.report_summary && d.report_summary.missing + d.report_summary.old_names > 0

export default function HowItWorks() {
  const t = useT(T)
  const { lang } = useSettings()
  const { data: config } = usePolling(api.config, 0, () => false)
  const { data: pipeline } = usePolling(api.pipeline, 0, () => false)
  const { data: docs } = usePolling(api.documents, 0, () => false)
  const exampleId = docs ? ((docs.find((d) => d.id === 1 && showable(d)) ?? docs.find(showable))?.id ?? null) : null
  const [ex, setEx] = useState<DocDetail | null>(null)
  useEffect(() => {
    if (exampleId) api.document(exampleId).then(setEx, () => setEx(null))
  }, [exampleId])

  const stages = pipeline?.stages ?? []

  let lines: Record<(typeof PHASES)[number], string[]> | null = null
  if (ex?.report.summary) {
    const s = ex.report.summary
    const items = ex.report.items ?? []
    const by = (method: string) => ex.page_rows.filter((p) => p.method === method).length
    lines = {
      read: [t('ex_pages', { pages: ex.pages, t: by('text_layer'), o: by('tesseract'), v: by('vision_llm') }), t('ex_clauses', { n: ex.clauses }), t('ex_entities', { n: ex.entities })],
      check: [
        t('ex_rules', { required: (ex.report.clauses ?? []).filter((c) => c.required).length, missing: s.missing, partial: s.partial, old_names: s.old_names }),
        t('ex_placed', { placed: items.filter((i) => i.anchor.bbox).length, items: items.length }),
        t('ex_drafted', { n: items.filter((i) => i.suggestion).length }),
      ],
      decide: [
        t('ex_decisions', { open: s.open, accepted: s.accepted, dismissed: s.dismissed, auto: s.auto }),
        t('ex_copy', { s: s.accepted + s.auto > 0 ? t('copy_yes') : t('copy_no') }),
      ],
    }
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
          {t('title')}
        </Typography>
        <Typography color="text.secondary">{t('intro')}</Typography>
      </Box>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ alignItems: 'flex-start' }}>
        <Stack spacing={3} sx={{ flex: 1, minWidth: 0, alignSelf: 'stretch' }}>
          {PHASES.map((phase) => {
            const list = stages.filter((s) => s.phase === phase)
            if (!list.length) return null
            return (
              <Box key={phase}>
                <Typography variant="h6" sx={{ mb: 1.5 }}>
                  {t(phase)}
                </Typography>
                {list.map((s) => (
                  <Box
                    key={s.id}
                    sx={{
                      display: 'flex',
                      gap: 2,
                      position: 'relative',
                      pb: 2,
                      '&:last-child': { pb: 0 },
                      '&:not(:last-child)::before': { content: '""', position: 'absolute', left: 15, top: 32, bottom: 0, borderLeft: '2px solid', borderColor: 'divider' },
                    }}
                  >
                    <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: 'primary.main', color: 'primary.contrastText', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, flexShrink: 0 }}>
                      {stages.indexOf(s) + 1}
                    </Box>
                    <Paper sx={{ p: 2, flex: 1, minWidth: 0, transition: 'box-shadow .15s', '&:hover': { boxShadow: 3 } }}>
                      <Typography sx={{ fontWeight: 600 }}>{s.title[lang]}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {s.text[lang]}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1, fontFamily: 'monospace' }}>
                        {s.model ? `${s.tools} · ${s.model}` : s.tools}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" component="div">
                        {t('produces', { x: s.produces[lang] })}
                      </Typography>
                    </Paper>
                  </Box>
                ))}
              </Box>
            )
          })}
        </Stack>

        {ex && lines && (
          <Paper sx={{ p: 2.5, width: { xs: '100%', md: 300 }, flexShrink: 0, position: { md: 'sticky' }, top: 88 }}>
            <Typography sx={{ fontWeight: 600, mb: 1.5 }}>{t('example', { title: ex.title || ex.filename })}</Typography>
            {PHASES.map((phase) => (
              <Box key={phase} sx={{ mb: 1.5 }}>
                <Typography variant="overline" color="primary" component="div" sx={{ lineHeight: 1.8 }}>
                  {t(phase)}
                </Typography>
                {lines[phase].map((l) => (
                  <Typography key={l} variant="body2" color="text.secondary">
                    {l}
                  </Typography>
                ))}
              </Box>
            ))}
            <Link component={RouterLink} to={`/contracts/${ex.id}`} variant="body2">
              {t('open')}
            </Link>
          </Paper>
        )}
      </Stack>

      {config && !config.llm_enabled && (
        <Typography variant="body2" color="text.secondary">
          {t('offline')}
        </Typography>
      )}
      <Typography variant="body2" color="text.secondary">
        {t('data')}
      </Typography>
    </Stack>
  )
}
