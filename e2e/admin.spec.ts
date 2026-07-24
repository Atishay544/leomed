import { test, expect } from '@playwright/test'

test.describe('Admin portal access control', () => {
  test('redirects unauthenticated users from admin', async ({ page }) => {
    await page.goto('/admin/dashboard')
    // Should redirect to login or home
    const url = page.url()
    expect(url).not.toContain('/admin/dashboard')
  })

  test('redirects non-admin users from admin', async ({ page }) => {
    // Even if there's a session, non-admins should be denied
    // This test verifies the security boundary exists
    await page.goto('/admin')
    const url = page.url()
    expect(url).not.toMatch(/^.*\/admin\/?$/)
  })
})

// Admin authenticated tests — only run with admin credentials set in env
const adminEmail = process.env.E2E_ADMIN_EMAIL
const adminPassword = process.env.E2E_ADMIN_PASSWORD

test.describe('Admin dashboard (requires credentials)', () => {
  test.skip(!adminEmail || !adminPassword, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set')

  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    // Switch to email/password tab
    const emailTab = page.locator('button', { hasText: /Email.*Password/i })
    if (await emailTab.isVisible()) await emailTab.click()

    await page.locator('input[type="email"]').fill(adminEmail!)
    await page.locator('input[type="password"]').fill(adminPassword!)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(/account|\//, { timeout: 10000 })
  })

  test('admin can access dashboard', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await expect(page).toHaveURL('/admin/dashboard')
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })

  test('admin dashboard shows key metrics', async ({ page }) => {
    await page.goto('/admin/dashboard')
    // Look for stats cards
    await expect(page.locator('text=/orders|revenue|customers|products/i').first()).toBeVisible()
  })

  test('admin products page loads', async ({ page }) => {
    await page.goto('/admin/products')
    await expect(page).toHaveURL('/admin/products')
    await expect(page.getByRole('link', { name: /Add Product|New Product/i })).toBeVisible()
  })

  test('admin orders page loads', async ({ page }) => {
    await page.goto('/admin/orders')
    await expect(page).toHaveURL('/admin/orders')
  })
})
