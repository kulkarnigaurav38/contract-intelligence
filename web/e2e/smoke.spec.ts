import { expect, test, type Page } from '@playwright/test'

// Runs against a live stack: API on :8000 with the 14 sample contracts ingested, the new UI (German default)
// on BASE_URL. Every page is opened, key content asserted, and a full-page screenshot stored for the presentation.

test.describe.configure({ mode: 'serial' })

const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true })

/** The stack runs with or without a Gemini key; the UI wording differs accordingly. */
const aiEnabled = async (page: Page): Promise<boolean> => {
  const res = await page.request.get('/api/config')
  return ((await res.json()) as { llm_enabled: boolean }).llm_enabled
}

test('Home shows the three question cards and the contract-set strip', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Was möchten Sie wissen?' })).toBeVisible()
  await expect(page.getByText('Welchen Verträgen fehlt eine Klausel?')).toBeVisible()
  await expect(page.getByText('Welche Verträge enthalten eine bestimmte Regelung nicht?')).toBeVisible()
  await expect(page.getByText('Wo steht noch ein alter Firmenname?')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Prüfen', exact: true })).toHaveCount(3)
  await expect(page.getByText('Ihr Vertragsbestand')).toBeVisible()
  await expect(page.getByText(/14 Verträge · \d+ gut lesbar/)).toBeVisible()
  await expect(page.getByText('Wartet auf Ihre Freigabe')).toBeVisible()
  await expect(page.getByText('Letzte Prüfungen')).toBeVisible()
  await shot(page, '01-home')
})

test('Contracts table shows Lesbarkeit chips and opens a contract dialog', async ({ page }) => {
  await page.goto('/contracts')
  await expect(page.getByRole('heading', { name: 'Verträge', exact: true })).toBeVisible()
  await expect(page.getByText('C01_merchant_agreement_nordlicht.pdf')).toBeVisible()
  await expect(page.getByText('Lesbarkeit', { exact: true })).toBeVisible()
  expect(await page.getByText('Gut lesbar', { exact: true }).count()).toBeGreaterThan(5)
  if (!(await aiEnabled(page))) await expect(page.getByText('Nicht lesbar', { exact: true }).first()).toBeVisible() // offline: the bad scan cannot be read
  await page.getByRole('row', { name: /C10_merchant_agreement_lumen_mixed\.pdf/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Vertrag ansehen')).toBeVisible()
  await expect(dialog.getByRole('tab', { name: /Klauseln \(\d+\)/ })).toBeVisible()
  await expect(dialog.getByRole('tab', { name: /Genannte Unternehmen \(\d+\)/ })).toBeVisible()
  await expect(dialog.getByRole('tab', { name: /Seitentext \(\d+\)/ })).toBeVisible()
  await expect(dialog.getByText(/Prüfsumme [0-9a-f]{8}/)).toBeVisible()
  await shot(page, '02-contracts')
  await dialog.getByRole('button', { name: 'Schließen' }).click()
  await expect(dialog).toBeHidden()
})

test('Clauses matrix renders the 12 clause headers', async ({ page }) => {
  await page.goto('/clauses')
  await expect(page.getByRole('heading', { name: 'Klausel-Übersicht' })).toBeVisible()
  await expect(page.getByText('Welcher Vertrag enthält welche Klausel?')).toBeVisible()
  // sticky "Vertrag" column + the 12 taxonomy columns
  await expect(page.getByRole('columnheader')).toHaveCount(13)
  // the header shows the short word; its accessible name is the full clause name from the tooltip
  const headers = ['Laufzeit und Kündigung', 'Vergütung und Zahlung', 'Haftungsbegrenzung', 'Vertraulichkeit', 'Datenschutz (DSGVO)', 'Anwendbares Recht', 'Gerichtsstand und Streitbeilegung', 'Höhere Gewalt', 'Abtretung', 'Auditrechte', 'Antikorruption und Compliance', 'Kontrollwechsel (Change of Control)']
  for (const h of headers) await expect(page.getByRole('columnheader', { name: new RegExp(`^${h.replace(/[()]/g, '\\$&')} fehlt in`) })).toBeVisible()
  for (const short of ['Laufzeit', 'Vergütung', 'Haftung', 'Gerichtsstand', 'Kontrollwechsel']) await expect(page.getByText(short, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Diese Klausel prüfen' })).toHaveCount(12)
  await expect(page.getByText(/fehlt in \d+|fehlt in keinem/).first()).toBeVisible()
  await expect(page.getByText('Nur Lücken zeigen')).toBeVisible()
  await shot(page, '03-clauses')
})

test('Old-company-name check from Home lands on the check detail', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/14 Verträge · \d+ gut lesbar/)).toBeVisible()
  // the third card is "Wo steht noch ein alter Firmenname?"
  await page.getByRole('button', { name: 'Prüfen', exact: true }).nth(2).click()
  await expect(page).toHaveURL(/\/checks\/\d+$/)
  await expect(page.getByText(/Alter Firmenname · alle Vertragsarten/).first()).toBeVisible()
  // one summary sentence once the check has finished
  await expect(page.getByText(/^14 Verträge geprüft: .*nennen noch den alten Firmennamen/)).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('auffällig', { exact: true })).toBeVisible()
  const ai = await aiEnabled(page)
  await expect(page.getByText(ai ? 'KI-gegengeprüft' : 'Ohne KI-Gegenprüfung', { exact: true }).first()).toBeVisible()
  // verdict chips are words: KI-… or "Nicht gegengeprüft"
  const verdict = page.getByText(/^(KI-bestätigt|Nicht gegengeprüft)$/).first()
  await expect(verdict).toBeVisible()
  // expand a finding row: the provenance disclosure is collapsed by default
  await page.getByRole('row').filter({ hasText: ai ? 'KI-bestätigt' : 'Nicht gegengeprüft' }).first().click()
  const howFound = page.getByRole('button', { name: 'So kam der Fund zustande' })
  await expect(howFound).toBeVisible()
  await expect(page.getByText('Über das Namensregister gefunden')).toBeHidden()
  await expect(page.getByText(/Verlässlichkeit: (hoch|mittel|gering)/).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Vertrag öffnen' }).first()).toBeVisible()
  await shot(page, '04-check-detail')
})

test('Approvals: approve, confirm, file to storage, and the log lists it', async ({ page }) => {
  await page.goto('/approvals')
  await expect(page.getByRole('heading', { name: /Funde? warte[nt] auf Ihre Entscheidung\./ })).toBeVisible()
  await expect(page.getByText(/unter dem Kürzel legal\.reviewer/)).toBeVisible()
  await expect(page.getByRole('tab', { name: /Offen \(\d+\)/ })).toBeVisible()
  await expect(page.getByText(/Fund 1 von \d+/)).toBeVisible()

  // remember which contract we approve so we can find it again on the decided tab
  const card = page.locator('.MuiPaper-root').filter({ has: page.getByRole('button', { name: 'Freigeben' }) }).first()
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Freigeben' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Fund freigeben')).toBeVisible()
  await expect(dialog.getByText(/unter dem Kürzel „legal\.reviewer“/)).toBeVisible()
  await dialog.getByLabel('Anmerkung (optional)').fill('Mit dem unterschriebenen Original abgeglichen.')
  await dialog.getByRole('button', { name: 'Freigeben' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Freigegeben. Der Eintrag steht im Protokoll.')).toBeVisible()

  await page.getByRole('tab', { name: /Entschieden \(\d+\)/ }).click()
  await expect(page.getByText('Mit dem unterschriebenen Original abgeglichen.').first()).toBeVisible()
  const row = page.getByRole('row').filter({ hasText: 'Mit dem unterschriebenen Original abgeglichen.' }).first()
  await row.getByRole('button', { name: 'In der Vertragsablage ablegen' }).click()
  await expect(page.getByText(/^Abgelegt unter CS-[A-Z0-9-]+\./)).toBeVisible()
  await expect(row.getByText(/^Abgelegt · CS-/)).toBeVisible()
  await shot(page, '05-approvals')

  await page.getByRole('tab', { name: 'Protokoll' }).click()
  await expect(page.getByText('Einträge können nachträglich nicht geändert oder gelöscht werden.')).toBeVisible()
  await expect(page.getByText(/hat Fund Nr\. \d+ in der Vertragsablage abgelegt/).first()).toBeVisible()
  await expect(page.getByText(/hat Fund Nr\. \d+ freigegeben/).first()).toBeVisible()
  // the raw action key is a technical detail and stays hidden
  await expect(page.getByText('finding.pushed_to_storage')).toBeHidden()
})

test('Ask: example chip returns Belege (cited answer with AI, passages only without)', async ({ page }) => {
  await page.goto('/ask')
  await expect(page.getByRole('heading', { name: 'Fragen Sie Ihre Verträge' })).toBeVisible()
  await page.getByText('Welcher Gerichtsstand gilt im Vertrag mit Nordlicht Möbelhaus?', { exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Antwort' })).toBeVisible({ timeout: 60_000 })
  if (await aiEnabled(page)) {
    await expect(page.getByText('Antwort mit Belegen (KI)')).toBeVisible()
  } else {
    await expect(page.getByText('Nur Fundstellen (ohne KI)')).toBeVisible()
    await expect(page.getByText('Ohne KI-Verbindung zeigen wir die passendsten Stellen statt einer Antwort.')).toBeVisible()
  }
  await expect(page.getByText(/Eingegrenzt auf: .*Nordlicht/)).toBeVisible() // the question names a contract
  await expect(page.getByText(/Frankfurt/).first()).toBeVisible() // C01 goes to DIS arbitration, not a court
  await expect(page.getByRole('button', { name: 'Vertrag öffnen' }).first()).toBeVisible()
  await expect(page.getByText(/Weitere gefundene Stellen \(\d+\)/)).toBeVisible()
  await expect(page.getByText(/Jede Aussage stützt sich auf eine zitierte Stelle/)).toBeVisible()
  await expect(page.getByText(/Offline mode/)).toHaveCount(0)
  await expect(page.getByText(/no language model configured/)).toHaveCount(0)
  await shot(page, '06-ask')
})

test('Quality measurement runs and reports precision and recall in words', async ({ page }) => {
  await page.goto('/tech/quality')
  await expect(page.getByRole('heading', { name: 'Qualitätsmessung' })).toBeVisible()
  await page.getByRole('button', { name: 'Messung starten' }).click()
  await expect(page.getByText(/Von den gemeldeten fehlenden Klauseln waren \d+[\s ]% richtig/)).toBeVisible({ timeout: 90_000 })
  await expect(page.getByText(/Von den Verträgen mit altem Firmennamen wurden \d+[\s ]% gefunden/)).toBeVisible()
  await expect(page.getByText('Treffergenauigkeit (Precision)').first()).toBeVisible()
  await expect(page.getByText('Abgeschlossene Prüfungen')).toBeVisible()
  if (!(await aiEnabled(page))) await expect(page.getByText(/wurde als nicht lesbar an Sie weitergegeben/)).toBeVisible() // offline only
  await shot(page, '07-quality')
})

test('Switching to EN changes the nav labels', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Verträge', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Contracts', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Checks', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Approvals', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Verträge', exact: true })).toBeHidden()
  await expect(page.getByRole('heading', { name: 'What would you like to know?' })).toBeVisible()
  await page.getByRole('button', { name: 'DE', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Verträge', exact: true })).toBeVisible()
})

test('The technical switch reveals model IDs on /tech/models', async ({ page }) => {
  await page.goto('/tech/models')
  await expect(page.getByRole('heading', { name: 'Modelle' })).toBeVisible()
  await expect(page.getByText(/Keine KI verbunden|KI-Gegenprüfung aktiv/).first()).toBeVisible()
  await expect(page.getByText('Großes Modell').first()).toBeVisible()
  await expect(page.getByText('Funde gegenprüfen')).toBeVisible()
  await expect(page.getByText('gemini-3.1-pro-preview')).toHaveCount(0)
  await page.getByLabel('Technische Details anzeigen').check()
  await expect(page.getByText('gemini-3.1-pro-preview').first()).toBeVisible()
  await expect(page.getByText('gemini-embedding-001')).toBeVisible()
  await expect(page.getByText('768 Dimensionen')).toBeVisible()
  await shot(page, '08-models')
  // and percentages elsewhere: the contracts table gains per-page extraction chips
  await page.goto('/contracts')
  await expect(page.getByText(/Seite 1 · Text direkt gelesen · 100[\s ]%/).first()).toBeVisible()
  await page.getByLabel('Technische Details anzeigen').uncheck()
  await expect(page.getByText(/Text direkt gelesen · 100[\s ]%/)).toHaveCount(0)
})

test('Approvals › Prüflast explains the review load and shows the review rate per question', async ({ page }) => {
  await page.goto('/approvals')
  await expect(page.getByRole('heading', { name: /Funde? warte[nt] auf Ihre Entscheidung\./ })).toBeVisible()
  await page.getByRole('tab', { name: 'Prüflast', exact: true }).click()

  const intro = page.getByText('Ihre Entscheidungen senken die Prüflast')
  const failed = page.getByText('Das hat leider nicht funktioniert') // ErrorAlert: an older API build has no /api/policy
  const empty = page.getByText('Noch keine Entscheidungen')
  const rateHeader = page.getByRole('columnheader', { name: 'Prüfquote', exact: true })

  // the tab renders in every API build …
  await expect(intro.or(failed).first()).toBeVisible()
  // … and the policy request settles into one of three states: error, empty state, or the table
  await expect(failed.or(empty).or(rateHeader).first()).toBeVisible()

  if (await failed.isVisible()) {
    // older API without /api/policy: the friendly sentence, no crash; the raw status stays under Details
    await expect(page.getByText(/^404 /)).toBeHidden()
  } else {
    await expect(intro).toBeVisible()
    await expect(empty.or(rateHeader).first()).toBeVisible()
    if (await rateHeader.isVisible()) {
      // one row per question: the rate is a word, not a bare number
      for (const h of ['Frage', 'Entscheidungen', 'Übereinstimmung', 'Automatisch freigegeben']) await expect(page.getByRole('columnheader', { name: h, exact: true })).toBeVisible()
      await expect(page.getByText(/^(Volle Prüfung|Stichprobe \d+\s?%)$/).first()).toBeVisible()
      await expect(page.getByText(/(\d+ von \d+ Entscheidungen bis zur nächsten Stufe|Höchste Stufe erreicht)/).first()).toBeVisible()
    }
  }
  // the raw rule parameters are technical and stay hidden while the switch is off
  await expect(page.getByText(/min_decisions/)).toHaveCount(0)
  await shot(page, '09-review-load')
})
