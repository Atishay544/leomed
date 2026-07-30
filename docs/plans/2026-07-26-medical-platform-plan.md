# Plan: E-commerce → Pharmacy Platform UI/Feature Upgrade

## Reference analysis (the 4 images)

**Images 1-3 — Tata 1mg (desktop + category grids):**
- Two parallel category taxonomies on the homepage: **product-type categories** (Hair Care, Oral Care, Baby Care, Women Care, Men Grooming, Pet Care, Sexual Wellness, Elderly Care — colorful icon tiles) AND **health-concern categories** (Diabetes, Heart Care, Stomach Care, Liver Care, Bone/Joint/Muscle Care, Kidney Care, Derma Care, Respiratory Care — photo tiles). These are two *different* ways to browse the same catalog.
- "Pathology Tests" section — lab test bookings (diagnostics marketplace, not a product SKU).
- Top nav: Medicines / Lab Tests / Consult Doctors / Cancer Care / Ayurveda / Partnerships / Corporates / **Care Plan** (paid membership: ₹165/3mo → free shipping, same-day delivery, extra discount).
- Pharmacovigilance banner — adverse-event reporting with a toll-free number + QR code (regulatory trust signal, government-linked program).
- Location/pincode selector in the header (serviceability check).

**Image 4 — 1mg mobile app**: a dense, colorful category grid ("Popular Categories — Delivery in a Flash") — Vitamins & Supplements, Homeopathy, Monitoring Devices, Protein Supplements, Sexual Wellness, Ayurvedic Wellness, Food & Nutrition, Pet Care, Skin Care, Men Care, Women Care, Elderly Care, plus "Best Seller"/"New"/"Trending"/"Must Have" ribbon badges on tiles.

## Scope reality check — three tiers

| Tier | Examples | What it actually requires |
|------|----------|---------------------------|
| **A. Pure UI + data** — buildable now | Health-concern browsing, colorful category tiles, ribbon badges (Best Seller/New/Trending), promo strip banners | Schema + admin UI + frontend only. No new business relationships. |
| **B. New subsystem, same business** — buildable, bigger lift | Care Plan membership (recurring billing), pharmacovigilance/adverse-event reporting flow | New tables, Razorpay subscriptions API, new pages — but still "you sell OTC/wellness products," no new licensing. |
| **C. New business line** — not just code | Lab Tests booking, Consult Doctors (telemedicine) | Needs a diagnostics lab partner (sample collection logistics) or registered-doctor network (India telemedicine rules require this), pricing/commission agreements, and probably regulatory review. This is a business decision, not an engineering one — flagging it, not planning it, until you confirm you actually want to go there. |

Given your earlier decision (**OTC & wellness only, no Rx**), I'd recommend Tier A now, Tier B next, and treat Tier C as an explicit later decision — not default it in.

---

## Current vs Optimized

| Area | Current state | Optimized |
|------|---------------|-----------|
| **Category browsing** | Single flat taxonomy (`categories` table: name/slug/parent_id/image_url/sort_order). Homepage shows one row of small circular icons, max 6, no visual distinction between category types. | Two independent taxonomies: existing product categories (upgraded to colored tile cards) **+** new "Shop by Health Concern" taxonomy (Diabetes, Heart Care, Skin Care, etc.), each its own homepage row + its own browse page. Both admin-manageable. |
| **Product merchandising badges** | None — no way to mark a product "Best Seller," "New," or "Trending" from admin. | `merchandising_tag` field on products (or a small tags table), admin-settable, rendered as a colored ribbon on product cards — matches the 1mg app grid. |
| **Homepage promo strip** | `banners` table + `AnnouncementBar` already exist and are admin-manageable (sort_order 0/1/2 slots). | Reuse as-is for a "Care Plan" or offer strip — no new backend needed, just content. |
| **Membership / Care Plan** | Doesn't exist. | New `memberships` + `subscriptions` tables, Razorpay Subscriptions API integration, perk-gating logic (free-shipping override, discount %) in checkout, admin page to configure plan price/perks. |
| **Pharmacovigilance / adverse event reporting** | Doesn't exist. | Static page/section + prominent link (India's PvPI toll-free 1800-180-3024 + reporting portal), possibly a simple in-app report form → email to your team. Pure content + one small form, no new schema required beyond an optional `adverse_event_reports` table if you want it logged in-app rather than just emailed. |
| **Location/serviceability check** | Doesn't exist — all products always shown regardless of delivery area. | Optional: pincode-serviceability field per product or per warehouse, checked at cart/checkout (you already have `DELHIVERY_PICKUP_PINCODE` env wiring, so serviceable-area logic could reuse Delhivery's pincode API). Recommend deferring unless you have real delivery-area restrictions today. |
| **Lab Tests / Doctor Consults** | Doesn't exist. | Tier C — not planned here, flagged for a separate business decision. |

---

## Phase 1 (Tier A) — Category system + merchandising badges

### Supabase (new migration)
```sql
-- Distinguish taxonomy type on the existing categories table instead of a parallel table,
-- so existing admin UI/queries mostly just get a new filter, not a rewrite.
alter table public.categories add column taxonomy text not null default 'product' check (taxonomy in ('product', 'health_concern'));
alter table public.categories add column accent_color text; -- tile background color, admin-settable, hex

-- Product merchandising ribbon
alter table public.products add column merchandising_tag text check (merchandising_tag in ('best_seller', 'new', 'trending', 'must_have'));
```
Existing `categories` rows default to `taxonomy='product'` (no backfill needed). Health-concern categories are just new rows with `taxonomy='health_concern'`.

### Backend
- `getStaticHomeData()` in `app/(store)/page.tsx`: add a second categories query filtered `taxonomy='health_concern'`, alongside the existing one (now filtered `taxonomy='product'`).
- Admin categories API (`app/api/admin/categories/route.ts` + `CategoryForm.tsx`): add `taxonomy` select and `accent_color` picker.
- Admin products API/form: add `merchandising_tag` select (None/Best Seller/New/Trending/Must Have).

### Frontend
- Homepage: add a "Shop by Health Concern" section (same `AnimatedGrid` pattern as existing categories, photo-tile style like image 3) below or above the existing "Shop by Category" row.
- Category tiles: upgrade from small circle+label to colored rounded-rect tiles (`accent_color` as background, category image overlaid) — matches images 1/4 styling, still using the same `categories.image_url`.
- `ProductCard`: render a small colored ribbon badge (top-left or top-right) when `merchandising_tag` is set — reuse the existing discount-badge pattern already in the card.
- New route `app/(store)/health-concern/[slug]/page.tsx` mirroring the existing `category/[slug]/page.tsx`, filtered by health-concern taxonomy.

### Admin
- Category list/form: taxonomy toggle + color picker — admin can create/edit both category types from the same screen.
- Product form: merchandising tag dropdown.

**Estimated size:** 1 migration, ~4-5 file edits/additions on frontend, 2 admin form updates. This is the highest-value, lowest-risk phase — pure extension of what already exists.

---

## Phase 2 (Tier B) — Care Plan membership

### Supabase (new migration)
```sql
create table public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,                    -- "Care Plan"
  price numeric not null,                -- 165.00
  duration_months int not null,          -- 3
  free_shipping boolean default true,
  discount_pct numeric default 0,        -- extra % off orders
  is_active boolean default true
);

create table public.user_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  plan_id uuid references public.membership_plans(id) not null,
  razorpay_subscription_id text,
  status text not null check (status in ('active','cancelled','expired')),
  started_at timestamptz default now(),
  expires_at timestamptz not null
);
-- RLS: users read/manage their own row; admin via service_role (same is_admin() pattern as everything else)
```

### Backend
- `app/api/membership/subscribe/route.ts` — creates a Razorpay Subscription, stores `user_memberships` row.
- `app/api/webhook/razorpay/route.ts` — extend to handle subscription lifecycle events (activated/charged/cancelled).
- Checkout logic (`app/api/checkout/route.ts` or wherever shipping fee is computed) — check for an active membership, waive shipping / apply discount_pct.

### Frontend
- `/care-plan` landing page (plan benefits, price, subscribe CTA).
- Account section: "My Membership" status card.
- Checkout: show "Member pricing applied" when active.

### Admin
- New admin page to edit plan price/perks (single-row form, no need for multiple plans initially unless you want tiers).

**Estimated size:** 2 migrations, 2-3 new API routes, 1 new landing page, checkout logic touch, 1 admin page. Bigger than Phase 1 — real payment/subscription logic, needs careful testing with Razorpay's subscription test mode before going live.

---

## Phase 3 (Tier B) — Pharmacovigilance / trust signal

Lightweight — a dedicated section (banner or footer link) directing customers to report adverse events, similar to the PvPI banner in image 3. Since Leomed Pharma isn't part of India's government PvPI program, this would point to **your own** support channel rather than PvPI's toll-free number (using PvPI's number/branding without being part of that program would be misrepresentation) — i.e., "Experienced a reaction? Contact our team immediately: [phone/email]" with same urgency styling. Pure content + maybe one simple form if you want it logged rather than just emailed.

---

## Not planned (Tier C) — flagged only

Lab Tests and Consult Doctors are full marketplace features needing external partners (diagnostics lab network, registered doctors) and likely regulatory review for telemedicine in India. Not included in this plan. Tell me if you actually want to pursue either and I'll scope it separately — it's a business-partnership conversation first, code second.

---

## Suggested order

1. **Phase 1** first — highest visual impact, matches what you screenshotted most closely, zero new business risk.
2. **Phase 3** next — cheap, builds trust, no dependencies.
3. **Phase 2** last — real money/subscription logic, worth doing once the storefront itself looks right and has real products in it.

Let me know which phase(s) to execute and I'll start.
