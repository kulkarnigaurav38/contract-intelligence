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

// viewer: the "Fundstellen" box in the sidebar and its rows ("1. Alter Firmenname: … Seite 1"). Located by CSS, not by
// role, because the finding popover is a modal that marks the rest of the page aria-hidden while it is open.
const findingsBox = (page: Page) => page.getByText('Fundstellen', { exact: true }).locator('..')
const findingRows = (page: Page) => findingsBox(page).locator('[role=button]')
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

test('Contract page: page images with markers, findings list, accept and undo a suggestion', async ({ page }) => {
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

  const findings = findingRows(page)
  await expect(findings.first()).toContainText(/^1\. /)
  expect(await findings.count()).toBeGreaterThanOrEqual(3)
  await expect(findingsBox(page)).toContainText(/\d+ warten auf Ihre Entscheidung/)
  await expect(page.getByRole('button', { name: 'Vorhandene Klauseln' })).toHaveAttribute('aria-expanded', 'false')
  const download = page.getByRole('link', { name: 'Korrigierte Fassung herunterladen' })
  await expect(download).toBeDisabled()
  await expect(page.getByRole('button', { name: 'In der Vertragsablage ablegen' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Erneut prüfen' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Löschen' })).toBeVisible()
  await shot(page, '02-contract', false)

  try {
    // a row opens the finding at its marker; accepting closes it and the row shows the decision
    await findings.first().click()
    const popover = page.locator('.MuiPopover-paper')
    await expect(popover).toBeVisible()
    await expect(popover.getByRole('button', { name: 'Nicht zutreffend' })).toBeVisible()
    await popover.getByRole('button', { name: 'Übernehmen' }).click()
    await expect(page.getByRole('alert')).toHaveText('Übernommen')
    await expect(popover).toBeHidden()
    await expect(findings.first()).toContainText('Übernommen')
    await expect(download).toBeEnabled()

    // the decision can be taken back, which leaves the demo contract as it was
    await findings.first().click()
    await popover.getByRole('button', { name: 'Entscheidung zurücknehmen' }).click()
    await expect(popover.getByRole('button', { name: 'Übernehmen' })).toBeVisible()
    await popover.press('Escape')
    await expect(popover).toBeHidden()
    await expect(findings.first()).not.toContainText('Übernommen')
    await expect(download).toBeDisabled()
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
  await expect(findingRows(page).first()).toBeVisible()
  await expect(page.getByText(/^Gescanntes Dokument:/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Kommentierte Fassung herunterladen' })).toBeDisabled()
  await shot(page, '03-contract-scan', false)
})

test('How it works: four steps and the models used', async ({ page }) => {
  await page.goto('/how-it-works')
  await expect(page.getByRole('heading', { name: 'So funktioniert es' })).toBeVisible()
  for (const step of ['Lesen', 'Zerlegen und einordnen', 'Prüfen', 'Ergebnis']) await expect(page.getByRole('heading', { name: step, exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Eingesetzte Modelle' })).toBeVisible()
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
