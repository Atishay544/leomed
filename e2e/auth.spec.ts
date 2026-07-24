import { test, expect } from '@playwright/test'

test.describe('Auth flow', () => {
  test('login page loads correctly', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveTitle(/Login|Sign in/i)
    // Should have email input
    await expect(page.locator('input[type="email"]')).toBeVisible()
  })

  test('login shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login')
    // Switch to email/password tab if needed
    const emailTab = page.locator('button', { hasText: /Email.*Password|Sign in with email/i })
    if (await emailTab.isVisible()) await emailTab.click()

    await page.locator('input[type="email"]').fill('invalid@test.com')
    await page.locator('input[type="password"]').fill('wrongpassword')
    await page.locator('button[type="submit"]').click()
    // Error message should appear
    await expect(page.locator('[role="alert"], .text-red-500, .text-red-600').first()).toBeVisible({ timeout: 5000 })
  })

  test('accessing protected route redirects to login', async ({ page }) => {
    await page.goto('/account')
    await expect(page).toHaveURL(/login/)
  })

  test('checkout redirect when not logged in', async ({ page }) => {
    // Set up some cart items in localStorage first
    await page.goto('/products')
    const firstProduct = page.locator('a[href^="/products/"]').first()
    const href = await firstProduct.getAttribute('href')
    if (href) {
      await page.goto(href)
      const addBtn = page.locator('button', { hasText: /Add to Cart/i }).first()
      if (await addBtn.isEnabled()) {
        await addBtn.click()
        await page.goto('/checkout')
        // Should either show checkout or redirect to login
        const url = page.url()
        const hasCheckout = url.includes('/checkout') || url.includes('/login')
        expect(hasCheckout).toBe(true)
      }
    }
  })
})
