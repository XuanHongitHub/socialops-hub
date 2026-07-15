import { expect, test } from '@playwright/test'

test('root redirects to the English Socials Hub home', async ({ page }) => {
  const response = await page.goto('/')

  expect(response?.status()).toBe(200)
  await expect(page).toHaveURL(/\/en\/?(?:\?.*)?$/)
  await expect(page.getByRole('button', { name: 'Generate Draft(Video)' })).toBeVisible()
})