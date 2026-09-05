# Leomed Pharma: D2C → B2B Informational Catalogue Site

## Why

The business does not sell direct to the public online — sales go through
distributors (managed in the ERP). The storefront's remaining purpose is to
let the general public browse the product catalogue and company content
(About, Upcoming Launches, News & Articles, Contact) with **no accounts, no
purchase intent signals (stock/price/reviews), and no self-service anything.**
Everything the public sees is fully admin-controlled.

## 1. Unified staff auth (`/erp/login` for everyone)

**Discovery:** `/erp/login` already authenticates via Supabase Auth
(`erpLogin` server action → `signInWithPassword`), then checks the signed-in
user against `erp_users.auth_user_id`. It is not a separate session
mechanism — it's the same identity system as the admin panel, plus a
membership check. `erp_users.role` already has an `'ADMIN'` value.

**Change:**
- `lib/admin-auth.ts` `requireAdmin()` → calls `getErpSession()` (from
  `lib/erp/auth.ts`) and requires `role === 'ADMIN'`, redirecting to
  `/erp/login` (not `/login`) on failure.
- `lib/security/admin-guard.ts` (API route guard) → same: check
  `erp_users.role === 'ADMIN'` instead of `profiles.role` / `app_metadata.role`.
- Every `/admin/*` page's implicit "sign in" path now goes through
  `/erp/login`.
- `proxy.ts` `/admin` edge check updated to whatever cheap signal
  `/erp` already uses.

**Removed entirely** (no public identity system left):
- `app/(auth)/login/`, `app/api/auth/{send-otp,signup,verify-email-otp,verify-signup-otp}/`
- `lib/hooks/useAuth.ts`, `lib/user-auth.ts` (`requireUser`)
- `app/(store)/account/**` (profile, addresses, notifications — orders/wishlist
  already gone)
- `components/storefront/ProfileDrawer.tsx`, `AccountNav.tsx`
- Header/Footer: "Sign in" and account entry points removed
- `handle_new_user()` trigger (fires on `auth.users` insert — no more public
  signups to fire it)

**RLS note:** admin writes already go through service-role API routes gated
by `adminGuard`, so RLS's `profiles.role = 'admin'` policies are a secondary
backstop, not the primary control. They'll be updated to check `erp_users`
membership in the same migration, but this is not launch-blocking on its own.

## 2. Reviews — removed entirely

Not selling direct to consumer ⇒ no product reviews.
- Delete `ReviewsList.tsx`, `ReviewForm.tsx`, `app/api/reviews/`,
  `app/admin/reviews/`, `app/api/admin/reviews/`.
- `reviews` table: **drop** (pending confirmation below).

## 3. Admin customer list — removed entirely

Selling is via distributors, not online — there's no customer relationship
to manage from the storefront admin.
- Delete `app/admin/customers/` (list + detail).
- Remove customer stats from the admin dashboard.
- `profiles`, `addresses`, `notifications` tables: no longer written to by
  anything once signup is gone — **drop** (pending confirmation below).

## 4. Product catalogue — informational only

Per your description: a visitor sees a **picture, name, and composition** —
nothing transactional.
- Add `composition text` column to `products` (new migration) + a field in
  the admin product form.
- Public product page: remove `VariantSelector`, `ProductActions`
  (stock/price display), reviews section — replaced with image + name +
  composition (+ description if you want it kept).
- Listing pages (home, `/products`, `/category/*`, `/health-concern/*`,
  `/search`) simplified to image + name cards.
- `product_variants` / `product_skus`: become unused — **drop** (pending
  confirmation below), unless you still track variants for your own
  reference even without public selection.
- Admin's existing Products screen keeps working as the "what's in the
  catalogue" control surface, minus variant/SKU management if those tables
  go.

## 5. New admin-managed content (built like Banners/Announcements)

- **News & Articles** — table `news_articles` (title, slug, excerpt, body,
  cover_image_url, is_published, published_at) + `/admin/news` CRUD +
  public `/news` (list) and `/news/[slug]` (detail).
- **Upcoming Product Launches** — table `upcoming_launches` (name,
  description, image_url, expected_date, is_active, sort_order) +
  `/admin/upcoming-launches` CRUD + public `/upcoming-launches`.
- **About** — not part of the CMS question; building as a static page
  (company info, not something that changes often) unless you'd rather it
  be admin-editable too.

## 6. Navigation

Header: Products · About · Upcoming Launches · News · Contact — no
search-cart-account clutter, no sign-in. Footer: drop the Account section
entirely.

---

## Open decisions before I start

1. **Drop `reviews`, `profiles`, `addresses`, `notifications`,
   `product_variants`, `product_skus` tables**, or keep them (unused) the
   way we kept cart/order tables the first time round?
2. **Price** — does the catalogue show price anywhere, or is it picture +
   name + composition only, full stop?
3. **About page** — static (my default above) or should it be
   admin-editable like News/Launches?
