import { expect, test } from '@playwright/test'

test.describe('BugSell product picker (opt-in production)', () => {
  test('status endpoint reports configuration', async ({ request }) => {
    const res = await request.get('/api/local/bugsell/status')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.code).toBe(0)
    expect(body.data).toBeTruthy()
    expect(typeof body.data.enabled).toBe('boolean')
    expect(body.data.auth).toBe('public_storefront')
  })

  test('when enabled, product search hits production catalog', async ({ request }) => {
    const status = await (await request.get('/api/local/bugsell/status')).json()
    test.skip(!status.data?.enabled, 'BugSell not enabled in this environment')

    const res = await request.get('/api/local/bugsell/products?q=cat&per_page=4')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.code).toBe(0)
    expect(Array.isArray(body.data.items)).toBeTruthy()
    expect(body.data.items.length).toBeGreaterThan(0)
    const first = body.data.items[0]
    expect(first.storeUrl).toMatch(/^https:\/\/www\.bugsell\.com\/products\//)
    expect(first.name).toBeTruthy()
  })

  test('when enabled, shops list works and shop products filter', async ({ request }) => {
    const status = await (await request.get('/api/local/bugsell/status')).json()
    test.skip(!status.data?.enabled, 'BugSell not enabled in this environment')

    const shopsRes = await request.get('/api/local/bugsell/shops?per_page=10')
    expect(shopsRes.ok()).toBeTruthy()
    const shops = await shopsRes.json()
    expect(shops.code).toBe(0)
    expect(shops.data.items.length).toBeGreaterThan(0)

    // Prefer a known active shop when present
    const cityCats = shops.data.items.find((s: { slug: string }) => s.slug === 'city-cats')
      || shops.data.items[0]

    const productsRes = await request.get(`/api/local/bugsell/products?shop=${cityCats.slug}&per_page=4`)
    expect(productsRes.ok()).toBeTruthy()
    const products = await productsRes.json()
    expect(products.code).toBe(0)
    expect(Array.isArray(products.data.items)).toBeTruthy()
  })

  test('when disabled, product API returns 503', async ({ request }) => {
    const status = await (await request.get('/api/local/bugsell/status')).json()
    test.skip(status.data?.enabled, 'Only asserts disabled path')

    const res = await request.get('/api/local/bugsell/products?q=cat')
    expect(res.status()).toBe(503)
  })

  test('Content Management draft bar can open BugSell picker and fill prompt', async ({ page }) => {
    await page.goto('/en/draft-box')
    // Draft box may require plan bootstrap; wait for AI generate bar when present
    const openBtn = page.getByTestId('draftbox-bugsell-pick-btn').or(page.getByTestId('draftbox-bugsell-open-btn'))
    await expect(openBtn.first()).toBeVisible({ timeout: 60_000 })
    await openBtn.first().click()

    const disabled = page.getByTestId('bugsell-picker-disabled')
    const picker = page.getByTestId('bugsell-picker')
    await expect(disabled.or(picker)).toBeVisible({ timeout: 20_000 })

    if (await disabled.isVisible()) {
      await expect(disabled).toContainText(/optional|BUGSELL_ENABLED/i)
      return
    }

    await page.getByTestId('bugsell-mode-product').click()
    await page.getByTestId('bugsell-search-input').fill('cat')
    await page.getByTestId('bugsell-search-btn').click()
    await expect(page.locator('[data-testid^="bugsell-product-"]').first()).toBeVisible({ timeout: 30_000 })
    await page.locator('[data-testid^="bugsell-product-"]').first().click()
    await expect(page.getByTestId('bugsell-selected')).toBeVisible()
    await page.getByTestId('bugsell-use-product-btn').click()

    await expect(page.getByTestId('draftbox-bugsell-chip')).toBeVisible()
    await expect(page.getByTestId('draftbox-ai-prompt-input')).not.toHaveValue('')
    await expect(page.getByTestId('draftbox-ai-prompt-input')).toHaveValue(/bugsell\.com\/products\//)
  })
})
