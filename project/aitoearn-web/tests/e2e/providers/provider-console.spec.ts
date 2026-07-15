import { expect, test } from '@playwright/test'

test.describe('Provider Console redesign', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // API-only checks do not need a full page bootstrap.
    if (testInfo.title.includes('API remains healthy'))
      return
    await page.goto('/en/providers')
    await expect(page.getByTestId('provider-console')).toBeVisible({ timeout: 30_000 })
  })

  test('loads catalog shell with providers navigation', async ({ page }) => {
    await expect(page.getByTestId('provider-console-sidebar')).toBeVisible()
    await expect(page.getByTestId('pc-nav-providers')).toBeVisible()
    await expect(page.getByTestId('pc-provider-catalog')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Providers' })).toBeVisible()
    await expect(page.getByTestId('pc-provider-row-grok')).toBeVisible()
  })

  test('planned providers stay unavailable', async ({ page }) => {
    const chatgpt = page.getByTestId('pc-provider-row-chatgpt')
    await expect(chatgpt).toBeVisible()
    await expect(chatgpt).toHaveAttribute('data-status', 'planned')
    await expect(chatgpt.getByText('Unavailable')).toBeVisible()
    await expect(page.getByTestId('pc-manage-chatgpt')).toHaveCount(0)
  })

  test('manage Grok opens connection manager without layout squeeze', async ({ page }) => {
    await page.getByTestId('pc-manage-grok').click()
    await expect(page.getByRole('heading', { name: 'Grok' })).toBeVisible()
    await expect(page.getByTestId('pc-connection-table')).toBeVisible()
    await expect(page.getByTestId('pc-add-connection')).toBeVisible()

    // Table keeps core columns (horizontal scroll allowed, not clipped by side form)
    const table = page.getByTestId('pc-connection-table')
    await expect(table.getByRole('columnheader', { name: 'Account' })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: 'Health' })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: 'Status' })).toBeVisible()

    // No always-open side form stealing width
    await expect(page.getByText('Edit Connection')).toHaveCount(0)
    // Drawer closed until row open
    await expect(page.getByTestId('pc-edit-drawer')).toHaveCount(0)
  })

  test('connection identity prefers email over Account N labels', async ({ page }) => {
    await page.getByTestId('pc-manage-grok').click()
    await expect(page.getByTestId('pc-connection-table')).toBeVisible()

    const identities = page.getByTestId('pc-connection-identity')
    const count = await identities.count()
    test.skip(count === 0, 'No Grok connections seeded in this environment')

    for (let i = 0; i < count; i += 1) {
      const text = (await identities.nth(i).innerText()).trim()
      expect(text.toLowerCase()).not.toMatch(/^grok account\s*\d+$/)
    }
  })

  test('edit drawer overlays and shows identity email title', async ({ page }) => {
    await page.getByTestId('pc-manage-grok').click()
    const openers = page.locator('[data-testid^="pc-open-connection-"]')
    const count = await openers.count()
    test.skip(count === 0, 'No Grok connections seeded in this environment')

    await openers.first().click()
    const drawer = page.getByTestId('pc-edit-drawer')
    await expect(drawer).toBeVisible()
    const title = (await page.getByTestId('pc-edit-title').innerText()).trim()
    expect(title.length).toBeGreaterThan(2)
    expect(title.toLowerCase()).not.toMatch(/^grok account\s*\d+$/)

    // Main table still present under overlay (not unmounted by split layout)
    await expect(page.getByTestId('pc-connection-table')).toBeVisible()
    await expect(drawer.getByText('Display label')).toBeVisible()
    await expect(drawer.getByRole('button', { name: 'Save changes' })).toBeVisible()
  })

  test('bulk select shows bulk action bar', async ({ page }) => {
    await page.getByTestId('pc-manage-grok').click()
    const selectAll = page.getByTestId('pc-select-all')
    test.skip(!(await selectAll.count()), 'No selectable rows')

    // Only run if there is at least one connection checkbox
    const rowChecks = page.locator('[data-testid^="pc-select-"]:not([data-testid="pc-select-all"])')
    const n = await rowChecks.count()
    test.skip(n === 0, 'No connection rows')

    await rowChecks.first().click()
    await expect(page.getByTestId('pc-bulk-bar')).toBeVisible()
    await expect(page.getByTestId('pc-bulk-health')).toBeVisible()
    await expect(page.getByTestId('pc-bulk-disconnect')).toBeVisible()
  })

  test('nav switches to Connections and Automation', async ({ page }) => {
    await page.getByTestId('pc-nav-connections').click()
    await expect(page.getByRole('heading', { name: 'Connections' })).toBeVisible()
    await expect(page.getByTestId('pc-connection-table')).toBeVisible()

    await page.getByTestId('pc-nav-automation').click()
    await expect(page.getByRole('heading', { name: 'Automation' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Generate content pack/i })).toBeVisible()
  })

  test('providers API remains healthy for console', async ({ request }) => {
    const res = await request.get('/api/ai/providers')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.code).toBe(0)
    expect(Array.isArray(body.data)).toBeTruthy()
    const grok = body.data.find((p: { id: string }) => p.id === 'grok')
    expect(grok).toBeTruthy()
  })
})
