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
    // Either a result count/listing or a "no results" message — scoped to
    // <main> so it doesn't also match the header/footer's "All Products" nav
    // link (both contain the word "Products").
    const hasResults = await page.locator('main').getByText(/no results/i)
      .or(page.locator('main').getByText(/result/i))
      .first().isVisible()
    expect(hasResults).toBe(true)
  })

  // The page's own search box (app/(store)/search/SearchInput.tsx) is a
  // different element from the header's global search box, which also
  // matches a loose input[placeholder*="Search"] selector and always starts
  // empty — distinguish by its own, more specific placeholder text.
  test('search input has correct default value from URL', async ({ page }) => {
    await page.goto('/search?q=test')
    const input = page.getByPlaceholder('Search products, categories…')
    await expect(input).toHaveValue('test')
  })

  test('typing in search input updates URL', async ({ page }) => {
    await page.goto('/search')
    const input = page.getByPlaceholder('Search products, categories…')
    await input.fill('laptop')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/q=laptop/)
  })
})
