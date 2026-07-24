import { test, expect } from '@playwright/test'

test.describe('SEO & metadata', () => {
  test('homepage has correct meta title', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle('My Store')
  })

  test('products page has correct meta title', async ({ page }) => {
    await page.goto('/products')
    await expect(page).toHaveTitle(/All Products.*My Store/)
  })

  test('product detail page has product name in title', async ({ page }) => {
    await page.goto('/products')
    const firstProduct = page.locator('a[href^="/products/"]').first()
    const href = await firstProduct.getAttribute('href')
    if (href) {
      await page.goto(href)
      const title = await page.title()
      // Title should NOT be "My Store" alone — product name should be in it
      expect(title).toMatch(/\|.*My Store|My Store.*\|/)
    }
  })

  test('sitemap.xml is accessible', async ({ page }) => {
    const res = await page.goto('/sitemap.xml')
    expect(res?.status()).toBe(200)
    const content = await page.content()
    expect(content).toContain('<urlset')
  })

  test('robots.txt is accessible', async ({ page }) => {
    const res = await page.goto('/robots.txt')
    expect(res?.status()).toBe(200)
    const content = await page.content()
    expect(content).toContain('User-agent')
  })

  test('admin routes are blocked in robots.txt', async ({ page }) => {
    await page.goto('/robots.txt')
    const content = await page.content()
    expect(content).toContain('/admin')
  })

  test('404 page renders custom not-found', async ({ page }) => {
    await page.goto('/this-page-does-not-exist-xyz')
    await expect(page.locator('text=/not found|404/i').first()).toBeVisible()
  })

  test('product detail has JSON-LD structured data', async ({ page }) => {
    await page.goto('/products')
    const firstProduct = page.locator('a[href^="/products/"]').first()
    const href = await firstProduct.getAttribute('href')
    if (href) {
      await page.goto(href)
      const ldScript = page.locator('script[type="application/ld+json"]')
      await expect(ldScript).toBeAttached()
      const content = await ldScript.textContent()
      const data = JSON.parse(content ?? '{}')
      expect(data['@type']).toBe('Product')
    }
  })
})
