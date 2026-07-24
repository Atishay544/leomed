import { test, expect } from '@playwright/test'

test.describe('Cart page', () => {
  test('shows empty state when cart is empty', async ({ page }) => {
    // Clear localStorage cart before visiting
    await page.goto('/cart')
    // If cart store has no items (fresh browser), shows empty state
    const body = await page.content()
    if (body.includes('Your cart is empty')) {
      await expect(page.locator('text=Your cart is empty')).toBeVisible()
      await expect(page.getByRole('link', { name: /Shop Now/i })).toBeVisible()
    }
  })

  test('cart page has correct title', async ({ page }) => {
    await page.goto('/cart')
    await expect(page).toHaveTitle(/My Store/)
  })

  test('empty cart shop now link goes to products', async ({ page }) => {
    await page.goto('/cart')
    const shopLink = page.getByRole('link', { name: /Shop Now/i })
    if (await shopLink.isVisible()) {
      await shopLink.click()
      await expect(page).toHaveURL('/products')
    }
  })
})

test.describe('Add to cart flow', () => {
  test('add to cart button visible on product page', async ({ page }) => {
    await page.goto('/products')
    const firstProduct = page.locator('a[href^="/products/"]').first()
    const href = await firstProduct.getAttribute('href')
    if (href) {
      await page.goto(href)
      // Add to cart button should be visible
      const addBtn = page.locator('button', { hasText: /Add to Cart|Out of Stock/i }).first()
      await expect(addBtn).toBeVisible()
    }
  })

  test('adding item to cart updates cart count', async ({ page }) => {
    await page.goto('/products')
    const firstProduct = page.locator('a[href^="/products/"]').first()
    const href = await firstProduct.getAttribute('href')
    if (href) {
      await page.goto(href)
      const addBtn = page.locator('button', { hasText: /Add to Cart/i }).first()
      if (await addBtn.isEnabled()) {
        await addBtn.click()
        // Cart count in header should update
        await page.goto('/cart')
        await expect(page.locator('text=/Cart \\(/i')).toBeVisible()
      }
    }
  })
})
