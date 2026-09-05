import { test, expect } from '@playwright/test'

test.describe('Products page', () => {
  test('loads product listing', async ({ page }) => {
    await page.goto('/products')
    await expect(page).toHaveTitle(/All Products/)
    // Product count should show
    await expect(page.locator('text=/\\d+ products/')).toBeVisible()
  })

  test('filter sidebar visible on desktop', async ({ page }) => {
    await page.goto('/products')
    await expect(page.locator('aside')).toBeVisible()
  })

  test('clicking a product navigates to detail page', async ({ page }) => {
    await page.goto('/products')
    const firstProduct = page.locator('a[href^="/products/"]').first()
    const href = await firstProduct.getAttribute('href')
    if (href) {
      await firstProduct.click()
      await expect(page).toHaveURL(href)
      await expect(page.locator('h1')).toBeVisible()
    }
  })
})
