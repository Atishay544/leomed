import { test, expect } from '@playwright/test'

test.describe('Homepage', () => {
  test('loads and shows hero content', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Leomed Pharma/)
    // Header should be visible
    await expect(page.locator('header')).toBeVisible()
  })

  test('navigation links work', async ({ page }) => {
    await page.goto('/')
    // Shop/Products link
    const productsLink = page.getByRole('link', { name: /products|shop/i }).first()
    await expect(productsLink).toBeVisible()
  })

  test('header search box submits to the search page', async ({ page }) => {
    // The inline form is "hidden md:flex" — assert this at a desktop width
    // regardless of which project (e.g. mobile-chrome) runs this file.
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    // Desktop header has an inline search form (components/storefront/Header.tsx),
    // not a bare icon link — fill it and submit, same as a real visitor would.
    const searchInput = page.getByPlaceholder('Search products...')
    await expect(searchInput).toBeVisible()
    await searchInput.fill('test')
    await searchInput.press('Enter')
    await expect(page).toHaveURL(/\/search\?q=test/)
  })

  test('mobile header search icon navigates to search', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    // Below md, the inline form is replaced by a bare icon button that
    // navigates straight to /search with no query (same file, "Search (mobile)").
    const searchTrigger = page.getByRole('button', { name: /search/i }).first()
    await expect(searchTrigger).toBeVisible()
    await searchTrigger.click()
    await expect(page).toHaveURL('/search')
  })
})
