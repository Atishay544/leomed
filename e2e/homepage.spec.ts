import { test, expect } from '@playwright/test'

test.describe('Homepage', () => {
  test('loads and shows hero content', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/My Store/)
    // Header should be visible
    await expect(page.locator('header')).toBeVisible()
  })

  test('navigation links work', async ({ page }) => {
    await page.goto('/')
    // Shop/Products link
    const productsLink = page.getByRole('link', { name: /products|shop/i }).first()
    await expect(productsLink).toBeVisible()
  })

  test('header search icon navigates to search', async ({ page }) => {
    await page.goto('/')
    // Click search icon in header
    const searchLink = page.locator('a[href="/search"]').first()
    await expect(searchLink).toBeVisible()
    await searchLink.click()
    await expect(page).toHaveURL('/search')
  })

  test('cart icon is visible in header', async ({ page }) => {
    await page.goto('/')
    const cartLink = page.locator('a[href="/cart"]').first()
    await expect(cartLink).toBeVisible()
  })
})
