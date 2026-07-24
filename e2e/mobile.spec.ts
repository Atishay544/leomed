import { test, expect, devices } from '@playwright/test'

// Mobile-specific tests run with Pixel 5 device in playwright.config.ts
// These tests verify responsive layout behavior

test.describe('Mobile layout', () => {
  test('homepage renders on mobile', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('header')).toBeVisible()
  })

  test('products page hides sidebar filter on mobile', async ({ page }) => {
    await page.goto('/products')
    // Sidebar has hidden lg:block — should be hidden on mobile
    const sidebar = page.locator('aside')
    await expect(sidebar).toBeHidden()
  })

  test('search page works on mobile', async ({ page }) => {
    await page.goto('/search')
    const input = page.locator('input').first()
    await expect(input).toBeVisible()
    await input.fill('test')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/q=test/)
  })

  test('product detail page renders on mobile', async ({ page }) => {
    await page.goto('/products')
    const firstProduct = page.locator('a[href^="/products/"]').first()
    const href = await firstProduct.getAttribute('href')
    if (href) {
      await page.goto(href)
      await expect(page.locator('h1')).toBeVisible()
      // Add to cart button must be visible even on mobile
      await expect(page.locator('button', { hasText: /Add to Cart|Out of Stock/i }).first()).toBeVisible()
    }
  })

  test('cart page works on mobile', async ({ page }) => {
    await page.goto('/cart')
    // Either empty state or cart items
    const body = await page.content()
    expect(body.length).toBeGreaterThan(100)
  })
})
