import { test, expect } from '@playwright/test'

test.describe('Search page', () => {
  test('shows empty state when no query', async ({ page }) => {
    await page.goto('/search')
    await expect(page).toHaveTitle(/Search/)
    await expect(page.locator('text=Start typing to search')).toBeVisible()
  })

  test('shows results for a query', async ({ page }) => {
    await page.goto('/search?q=shirt')
    await expect(page).toHaveTitle(/Search: shirt/)
    // Either results or "no results" message
    const hasResults = await page.locator('text=/Products|No results/').isVisible()
    expect(hasResults).toBe(true)
  })

  test('search input has correct default value from URL', async ({ page }) => {
    await page.goto('/search?q=test')
    const input = page.locator('input[type="search"], input[placeholder*="Search"]').first()
    await expect(input).toHaveValue('test')
  })

  test('typing in search input updates URL', async ({ page }) => {
    await page.goto('/search')
    const input = page.locator('input').first()
    await input.fill('laptop')
    // Wait for debounce / form submit
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/q=laptop/)
  })
})
