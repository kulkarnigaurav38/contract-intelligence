import { expect, test } from '@playwright/test'

// Runs against a live stack (API on :8000 with the sample set ingested, web on :5173).
// Every page is opened, key content asserted, and a screenshot stored for the presentation.

test('documents page shows the sample corpus with per-page extraction methods', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible()
  await expect(page.getByText('C10_merchant_agreement_lumen_mixed.pdf')).toBeVisible()
  await expect(page.getByText('mixed pdf').first()).toBeVisible()
  await page.getByText('C13_merchant_agreement_velora_injection.pdf').click()
  await expect(page.getByText('Prompt-injection suspected')).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/01-documents.png', fullPage: true })
})

test('coverage matrix renders every taxonomy column', async ({ page }) => {
  await page.goto('/coverage')
  await expect(page.getByRole('heading', { name: 'Clause coverage matrix' })).toBeVisible()
  await expect(page.getByText('liability cap')).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/02-coverage.png', fullPage: true })
})

test('rename audit runs and flags the scanned signature page', async ({ page }) => {
  await page.goto('/audits')
  await page.getByLabel('Question').click()
  await page.getByRole('option', { name: /superseded company name/ }).click()
  await page.getByRole('button', { name: 'Run audit' }).click()
  await expect(page.getByText(/contracts in scope/)).toBeVisible({ timeout: 60_000 })
  const lumen = page.getByRole('row', { name: /Lumen Retail/ }).first()
  await expect(lumen).toBeVisible()
  await lumen.click()
  await expect(page.getByText('How this finding was produced')).toBeVisible()
  await expect(page.getByText(/OCR-tolerant fuzzy match/)).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/03-audit-rename.png', fullPage: true })
})

test('review queue approves a finding and pushes it to contract storage', async ({ page }) => {
  await page.goto('/review')
  await expect(page.getByRole('heading', { name: 'Review queue' })).toBeVisible()
  await page.getByRole('button', { name: 'Approve' }).first().click()
  await page.getByLabel('Note (optional)').fill('Checked against the signed original.')
  await page.getByRole('button', { name: 'Confirm' }).click()
  await page.getByRole('button', { name: 'Push to contract storage' }).first().click()
  await expect(page.getByText(/CS-[A-Z0-9]+/).first()).toBeVisible()
  await expect(page.getByText('finding.pushed_to_storage').first()).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/04-review.png', fullPage: true })
})

test('ask returns cited passages', async ({ page }) => {
  await page.goto('/ask')
  await page.getByText('Which court has jurisdiction in the Nordlicht agreement?').click()
  await expect(page.getByText('Retrieved passages')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/Baden-Baden/).first()).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/05-ask.png', fullPage: true })
})

test('evaluation and model routing pages render', async ({ page }) => {
  await page.goto('/eval')
  await page.getByRole('button', { name: 'Run evaluation' }).click()
  await expect(page.getByText('Deterministic layer: entity registry')).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: 'e2e/screenshots/06-evaluation.png', fullPage: true })
  await page.goto('/models')
  await expect(page.getByText('gemini-3.1-pro-preview').first()).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/07-models.png', fullPage: true })
})
