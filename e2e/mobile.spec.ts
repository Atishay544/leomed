import { test, expect } from '@playwright/test'

// These tests verify responsive layout behavior at a phone-sized viewport —
// set explicitly here (same convention as "ERP on a phone" in
// erp-access.spec.ts) so this file is correct regardless of which
// playwright project(s) it runs under, not just when --project=mobile-chrome
// is remembered.
test.describe('Mobile layout', () => {
  test.use({ viewport: { width: 390, height: 844 } })

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

  // The header's own search box is "hidden md:flex" at this width, so target
  // the search page's own input (app/(store)/search/SearchInput.tsx) by its
  // more specific placeholder rather than `input.first()`.
  test('search page works on mobile', async ({ page }) => {
    await page.goto('/search')
    const input = page.getByPlaceholder('Search products, categories…')
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
    }
  })
})
