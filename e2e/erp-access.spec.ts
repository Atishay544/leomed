import { test, expect } from '@playwright/test'

/**
 * Route protection for the ERP (spec §7, §60).
 *
 * These check the part of authorization that has to hold for an anonymous
 * visitor typing URLs — that no ERP screen renders without a session, and that
 * the staff portal is separate from the storefront's customer login.
 *
 * Role-level rules (an MR cannot read another MR's visits, cannot write
 * inventory, cannot reprice a product) are enforced by RLS and tested where
 * they actually live, in supabase/tests/erp_business_rules.sql. Testing them
 * through the browser would only prove the UI hides a button.
 */

const ERP_ROUTES = [
  '/erp',
  '/erp/dashboard',
  '/erp/mr',
  '/erp/mr/doctor-visits',
  '/erp/mr/doctor-visits/new',
  '/erp/mr/chemist-visits',
  '/erp/mr/orders',
  '/erp/mr/followups',
  '/erp/masters/doctors',
  '/erp/masters/chemists',
  '/erp/masters/products',
  '/erp/masters/batches',
  '/erp/masters/distributors',
  '/erp/masters/suppliers',
  '/erp/accounting/purchases',
  '/erp/accounting/purchases/new',
  '/erp/accounting/sales',
  '/erp/accounting/sales/new',
  '/erp/accounting/inventory',
  '/erp/reports',
  '/erp/targets',
  '/erp/users',
  '/erp/audit',
  '/erp/settings',
]

test.describe('ERP access control', () => {
  test('the staff login page loads', async ({ page }) => {
    await page.goto('/erp/login')
    await expect(page.getByRole('heading', { name: /Leomed Pharma/i })).toBeVisible()
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('the staff portal is not the storefront login', async ({ page }) => {
    await page.goto('/erp/login')
    // Customers have their own door; staff accounts are admin-provisioned, so
    // there must be no sign-up path here (plan Q11).
    await expect(page.getByText(/created by your administrator/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /sign up|create account|register/i })).toHaveCount(0)
  })

  for (const route of ERP_ROUTES) {
    test(`${route} redirects an anonymous visitor to the staff login`, async ({ page }) => {
      await page.goto(route)
      await expect(page).toHaveURL(/\/erp\/login/)
    })
  }

  test('a rejected sign-in reports a failure and stays put', async ({ page }) => {
    await page.goto('/erp/login')
    await page.locator('input[type="email"]').fill('nobody@leomedpharma.test')
    await page.locator('input[type="password"]').fill('definitely-not-the-password')
    await page.locator('button[type="submit"]').click()

    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/\/erp\/login/)
  })

  test('the ERP is excluded from search engines', async ({ page }) => {
    const response = await page.goto('/erp/login')
    expect(response?.status()).toBe(200)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/i)
  })

  test('the storefront still works alongside the ERP', async ({ page }) => {
    // The ERP was added to a live shop; the shop must be untouched.
    const response = await page.goto('/')
    expect(response?.status()).toBe(200)
    await expect(page.locator('body')).toBeVisible()
  })
})

test.describe('ERP on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the login page fits a phone screen without sideways scrolling', async ({ page }) => {
    await page.goto('/erp/login')

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    )
    expect(overflows).toBe(false)
  })

  test('login inputs are large enough to tap', async ({ page }) => {
    await page.goto('/erp/login')

    // 16px font stops iOS zooming the page on focus, which throws off a form
    // being filled in one-handed.
    const fontSize = await page.locator('input[type="email"]')
      .evaluate(el => parseFloat(getComputedStyle(el).fontSize))
    expect(fontSize).toBeGreaterThanOrEqual(16)

    const box = await page.locator('button[type="submit"]').boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(40)
  })
})
