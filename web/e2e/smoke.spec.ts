import { expect, test, type Page } from '@playwright/test'
import type { Doc, DocDetail } from '../src/api'

// Runs against a live stack (API behind BASE_URL, German UI by default). The three pages are opened,
// key content asserted and screenshots stored for the presentation. Reports exist with and
// without a model key; only the footer wording differs, so nothing here depends on the mode.

test.describe.configure({ mode: 'serial' })

const shot = (page: Page, name: string, fullPage = true) => page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage })
const docs = async (page: Page): Promise<Doc[]> => (await page.request.get('/api/documents')).json()
const busy = (d: Doc) => d.status === 'processing' || d.report_status === 'pending' || d.report_status === 'running'

// list rows are buttons named by their whole text: title · type · pages · result
const rows = (page: Page, result: RegExp) => page.getByRole('button', { name: result })
const FINDINGS = /Klausel(n)? fehl|alter Firmenname|teilweise nicht lesbar/
const READY = /Klausel(n)? fehl|alter Firmenname|teilweise nicht lesbar|Alles in Ordnung/

// viewer: the panel shows one finding at a time ("Fundstelle 1 von 5", the suggestion, Übernehmen / Nicht zutreffend)
const card = (page: Page) => page.getByTestId('finding-card')
/** The page-1 image, fully loaded (scans are large; a screenshot taken earlier shows a white page). */
const page1Image = async (page: Page) => {
  const img = page.locator('img[src$="/pages/1.png"]')
  await expect(img).toBeVisible()
  await expect(img).toHaveJSProperty('complete', true)
  return img
}
/** Safety net: a run that fails between accepting and undoing must not leave a decision on the demo contract. */
const reopenAccepted = async (page: Page, id: number) => {
  const d: DocDetail = await (await page.request.get(`/api/documents/${id}`)).json()
  for (const it of d.report.items ?? []) if (it.review.status === 'accepted') await page.request.post(`/api/documents/${id}/items/${encodeURIComponent(it.key)}/decide`, { data: { decision: 'reopen' } })
}

test('Start page: drop zone, sample link, contract list', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Verträge prüfen' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Verträge auswählen' })).toBeVisible()
  await expect(page.getByText('oder hierher ziehen')).toBeVisible()
  await expect(page.getByText('PDF, JPG oder PNG – auch Scans und handschriftliche Verträge')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Beispielverträge laden' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Ihre Verträge' })).toBeVisible()
  await expect(page.getByRole('link', { name: '1 · Hochladen' })).toBeVisible() // the three steps: upload, review, download
  await shot(page, '01-home')
})

test('Upload: two contracts in one go, each ends with a result line', async ({ page }) => {
  test.setTimeout(240_000) // reading + checking may queue behind other reports
  const files = ['C02_dpa_bergmann.pdf', 'C03_nda_fjordline.pdf']
  await page.goto('/')
  await page.getByTestId('file-input').setInputFiles(files.map((f) => `../data/contracts/${f}`))
  await expect(page.getByText('2 Verträge werden gelesen …')).toBeVisible()

  for (const f of files) {
    // a known file (same checksum) comes back as the existing contract with its existing report
    let doc: Doc | undefined
    await expect.poll(async () => (doc = (await docs(page)).find((d) => d.filename === f)) && !busy(doc), { timeout: 180_000, intervals: [3000] }).toBe(true)
    const row = rows(page, new RegExp(doc!.title || doc!.filename)).first()
    await expect(row).toBeVisible()
    await expect(row).not.toContainText(/Wird gelesen …|Wird geprüft …/)
    await expect(row).toContainText(READY)
  }
})

test('Contract page: page images with markers, one finding at a time, accept, download step, undo', async ({ page }) => {
  // the demo merchant agreement (4 old names + 1 missing clause), or any checked contract with an old name
  const all = await docs(page)
  const fits = (d: Doc) => d.report_status === 'ready' && (d.report_summary?.old_names ?? 0) > 0
  const doc = all.find((d) => d.id === 1 && fits(d)) ?? all.find(fits)
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.goto(`/contracts/${doc!.id}`)

  const header = page.getByRole('heading', { level: 1, name: doc!.title || doc!.filename })
  await expect(header).toBeVisible()
  await expect(header.locator('..')).toContainText(FINDINGS) // the one-line result under the title
  await expect(page.getByRole('link', { name: 'Alle Verträge' })).toBeVisible()

  const page1 = (await page1Image(page)).locator('..')
  const markers = page1.locator('[role=button]', { hasText: /^\d+$/ }) // highlight boxes carry just their number
  await expect(markers.first()).toBeVisible()
  expect(await markers.count()).toBeGreaterThanOrEqual(2)

  const panel = card(page)
  await expect(panel).toContainText(/Fundstelle 1 von \d+/)
  await expect(panel).toContainText(/\d+ entschieden · \d+ offen/)
  await expect(panel.getByRole('button', { name: 'Übernehmen' })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Nicht zutreffend' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Weitere Angaben' })).toHaveAttribute('aria-expanded', 'false')
  const toDownload = page.getByRole('button', { name: 'Weiter zum Download' })
  await expect(toDownload).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Erneut prüfen' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Löschen' })).toBeVisible()
  await shot(page, '02-contract', false)

  try {
    // accepting moves the panel on to the next open finding and unlocks the download step
    await panel.getByRole('button', { name: 'Übernehmen' }).click()
    await expect(page.getByRole('alert')).toHaveText('Übernommen')
    await expect(panel).toContainText(/Fundstelle 2 von \d+/)
    await expect(toDownload).toBeEnabled()

    // step 3: the corrected version, ready to download, with a preview
    await toDownload.click()
    await expect(page).toHaveURL(/\/contracts\/\d+\/download$/)
    await expect(page.getByRole('heading', { name: 'Ihre korrigierte Fassung ist fertig' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Korrigierte Fassung herunterladen' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'In der Vertragsablage ablegen' })).toBeVisible()
    await expect(page.locator('iframe[title="Vorschau der korrigierten Fassung"]')).toBeVisible()
    await shot(page, '02b-download', false)

    // back to the review: the first marker shows its decision, which can be taken back - the demo contract stays as it was
    await page.getByRole('link', { name: 'Zurück zur Prüfung' }).click()
    await markers.first().click()
    await expect(panel).toContainText(/Fundstelle 1 von \d+/)
    await expect(panel).toContainText('Übernommen')
    await panel.getByRole('button', { name: 'Entscheidung zurücknehmen' }).click()
    await expect(panel.getByRole('button', { name: 'Übernehmen' })).toBeVisible()
    await expect(toDownload).toBeDisabled()
  } finally {
    await reopenAccepted(page, doc!.id)
  }
})

test('Contract page: a scanned contract offers the annotated version', async ({ page }) => {
  // the handwritten JPG, or any other checked scan
  const all = await docs(page)
  const fits = (d: Doc) => d.report_status === 'ready' && (d.input_type === 'image' || d.input_type === 'scanned_pdf')
  const doc = all.find((d) => d.id === 8 && fits(d)) ?? all.find(fits)
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.goto(`/contracts/${doc!.id}`)

  await expect(page.getByRole('heading', { level: 1, name: doc!.title || doc!.filename })).toBeVisible()
  await page1Image(page)
  await expect(card(page)).toContainText(/Fundstelle 1 von \d+/)
  await expect(page.getByText(/^Gescanntes Dokument:/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Weiter zum Download' })).toBeDisabled()
  await shot(page, '03-contract-scan', false)
})

test('How it works: pipeline stages from the API and an example contract', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.goto('/how-it-works')
  await expect(page.getByRole('heading', { name: 'So funktioniert es' })).toBeVisible()
  for (const phase of ['Lesen', 'Prüfen', 'Entscheiden']) await expect(page.getByRole('heading', { name: phase, exact: true })).toBeVisible()

  // one numbered card per stage, each ending with its "→ erzeugt:" line
  const produces = page.getByText(/^→ erzeugt:/)
  await expect(produces.first()).toBeVisible()
  expect(await produces.count()).toBeGreaterThanOrEqual(14)
  await expect(page.getByText('Datei lesen', { exact: true })).toBeVisible()
  await expect(page.getByText('Korrigierte Kopie', { exact: true })).toBeVisible()

  // the sticky example panel links to the contract it was computed from
  const example = page.getByText(/^Beispiel: /)
  await expect(example).toBeVisible()
  await shot(page, '04-how-it-works', false)
  const title = (await example.textContent())!.replace(/^Beispiel: /, '')
  await page.getByRole('link', { name: 'Vertrag öffnen' }).click()
  await expect(page).toHaveURL(/\/contracts\/\d+$/)
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
})

test('Technik: stages with modules and models, the graph, a trace of one contract', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.goto('/technik')
  await expect(page.getByRole('heading', { name: 'Technik' })).toBeVisible()
  await expect(page.getByText('app/ingest/loader.py', { exact: true })).toBeVisible()
  await expect(page.getByText('app/audits/verify.py (verify_absence)')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Der Graph' })).toBeVisible()
  await expect(page.getByText(/Richtlinienlücken über alle Verträge/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Ein Vertrag durch alle Stufen' })).toBeVisible()
  await expect(page.getByText('Klauseln (', { exact: false }).first()).toBeVisible()
  await shot(page, '06-technik', false)
})

test('Start page filter answers the cross-contract question', async ({ page }) => {
  test.setTimeout(150_000) // "Klausel fehlt" loads every checked contract once
  await page.goto('/')
  const count = page.getByText(/^(\d+ Verträge|1 Vertrag)$/)
  const listRows = page.getByRole('list').getByRole('button')
  const filter = (name: string) => page.getByRole('button', { name, exact: true }) // rows contain the same words
  await expect(listRows.first()).toBeVisible()
  const all = (await count.textContent())!
  const total = parseInt(all)

  // "Alter Firmenname": only contracts with an old name, and each row says so
  await filter('Alter Firmenname').click()
  await expect(listRows.filter({ hasNotText: 'Firmenname' })).toHaveCount(0)
  const oldNames = parseInt((await count.textContent())!)
  expect(oldNames).toBeGreaterThan(0)
  expect(oldNames).toBeLessThanOrEqual(total)
  await expect(listRows).toHaveCount(oldNames)
  await shot(page, '05-home-filter')

  // "Klausel fehlt": a clause type to pick (default Haftungsbegrenzung); the per-contract details load first
  await filter('Klausel fehlt').click()
  await expect(page.getByRole('combobox')).toHaveText('Haftungsbegrenzung')
  await expect(page.locator('.MuiLinearProgress-root')).toBeHidden({ timeout: 60_000 })
  await expect(listRows.first()).toBeVisible({ timeout: 60_000 })
  await expect(listRows).toHaveCount(parseInt((await count.textContent())!))

  // "Regelung fehlt": free-text search; nothing typed, nothing to search
  await filter('Regelung fehlt').click()
  await expect(page.getByPlaceholder(/^z\. B\. /)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Suchen', exact: true })).toBeDisabled()

  await filter('Alle').click()
  await expect(count).toHaveText(all)
  await expect(page.getByRole('button', { name: 'Neue Dateien aus SharePoint holen' })).toHaveCount(0) // document_source is local
})

test('Language switch: EN and back to DE', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Check contracts' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'How it works' })).toBeVisible()
  await page.getByRole('button', { name: 'DE', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Verträge prüfen' })).toBeVisible()
})

test('Unknown route redirects to the start page', async ({ page }) => {
  await page.goto('/checks/1')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Verträge prüfen' })).toBeVisible()
})
