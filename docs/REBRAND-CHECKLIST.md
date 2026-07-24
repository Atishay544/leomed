# Leomed Pharma Rebrand Checklist (leomedpharma.in)

Source: `pharma/` is an untracked copy of the old `ecom-frontend` project (Hi Fashion,
a clothing store owned by Parv Jain, domain hifashions.shop). Every item below currently
carries Hi Fashion branding/content and needs to change for Leomed Pharma. `ecom-frontend/`
shows as deleted in git — the rename to `pharma/` hasn't been staged/committed yet.

## 1. Branding find-and-replace (mechanical)
- [ ] Site name: "Hi Fashion" / "Hi-Fashions" → "Leomed Pharma" (`app/layout.tsx` title, OG, Twitter card, JSON-LD)
- [ ] Domain: `hifashions.shop` → `leomedpharma.in` (`NEXT_PUBLIC_APP_URL`, canonical, sitemap.ts, robots.ts, JSON-LD `sameAs`)
- [ ] Founder/publisher "Parv Jain" → actual Leomed Pharma owner/entity name
- [ ] Contact email `parvjain012@gmail.com` → new support email
- [ ] Contact phone `+918979013817` → new support phone
- [ ] Instagram handle `hi_fashions1985` → new social handles (or remove if none yet)
- [ ] `package.json` name `"ecom"` → `"leomed-pharma"`
- [ ] Logo files: `public/logo.jpeg`, `public/lf-logo.png` (favicon/apple-touch icon referenced in layout.tsx but not present in `public/` — needs adding), `app/opengraph-image.tsx`
- [ ] `public/QR.jpeg` — old payment QR, replace with Leomed Pharma UPI/payment QR
- [ ] Product taxonomy: "Men's/Women's/Kids' Fashion, Accessories" (JSON-LD `hasOfferCatalog`) → pharmacy categories (medicines, wellness, personal care, devices, etc. — TBD with you)
- [ ] `public/llms.txt` — rewrite for pharmacy business
- [ ] Footer (`components/storefront/Footer.tsx`) brand name, tagline, socials, email/phone
- [ ] Meta keywords/descriptions across layout.tsx, sitemap, robots

## 2. Theme — greenish redesign
- [ ] `app/globals.css` design tokens: `--primary`, `--primary-glow`, `--accent`, `--ring`, gradients, shadows — currently violet `hsl(250 84% 54%)`, swap to green palette
- [ ] 108 hardcoded Tailwind color utilities (`purple-`/`violet-`/`indigo-`/`fuchsia-`) across 21 files (Header, AdminNav, DashboardChart, DeliveryChart, checkout, orders, banners, product form, etc.) — replace with green or refactor to use the CSS variable tokens instead of hardcoded classes
- [ ] Admin dark-mode already has some green/emerald overrides in globals.css — verify these still make sense once storefront also goes green, avoid clashing
- [ ] Buttons/links/badges/focus-rings consistency pass after color swap
- [ ] Favicon/logo recolored to match new green identity

## 3. Legal & policy pages — pharmacy-specific rewrite (currently clothing-store copy, real compliance risk if left as-is)
- [ ] Privacy Policy — health/prescription data is "sensitive personal data" under India's DPDP Act; needs stronger language than a clothing store
- [ ] Refund/Return Policy — medicines are generally **non-returnable once dispensed** under Indian drug rules (exceptions: damaged/wrong/expired item on delivery) — cannot reuse the 7-day fashion-return copy
- [ ] Shipping Policy — cold-chain/temperature-sensitive items (if any), delivery timelines, pincode restrictions
- [ ] Terms of Service — prescription requirement disclaimers, age restriction, misuse/self-medication disclaimer
- [ ] FAQ — rewrite for medicines/health products instead of fashion
- [ ] Contact page — registered address, support hours, and (if applicable) Pharmacist-in-Charge name + registration number
- [ ] Mandatory e-pharmacy disclosures (India): Drug License number (Form 20B/21B), Registered Pharmacist name + reg. number, GSTIN, Grievance Officer name/contact (Consumer Protection E-commerce Rules, 2020)
- [ ] Prescription upload flow — only needed if selling Schedule H/H1/X drugs (see question below)

## 4. Business/contact info needed on-site
- [ ] Registered business name, address, support email/phone, WhatsApp (if used)
- [ ] UPI/bank details for the payment QR
- [ ] Google Maps embed if there's a physical pharmacy location
- [ ] Social media handles

## 5. Backend/infra (not cosmetic — real credentials)
- [ ] Supabase project — currently `.env.local` points at the old project; decide new vs reused
- [ ] Razorpay account — pharmacy is a different business category than fashion for KYC
- [ ] Cloudflare Turnstile — new site key scoped to leomedpharma.in
- [ ] Resend — verify sending domain for leomedpharma.in (`RESEND_FROM_EMAIL`)
- [ ] Google Analytics GA4 property + Search Console verification for new domain
- [ ] Vercel project + custom domain `leomedpharma.in` + DNS + SSL
- [ ] `vercel.json` region `bom1` (Mumbai) — fine to keep for India traffic

## 6. Mobile responsiveness audit (stated priority)
- [ ] Re-test storefront at 360–430px widths: header/logo, hero, product grid, filters drawer, product gallery, checkout flow, account pages
- [ ] Admin dashboard on tablet/mobile widths
- [ ] Sticky nav/announcement bar behavior on mobile (recent commits already touched this — revalidate after theme swap)
- [ ] Logo legibility/sizing in mobile header

## 7. SEO/meta
- [ ] `sitemap.ts` / `robots.ts` base URL
- [ ] `opengraph-image.tsx` redesigned with new logo + green branding
- [ ] JSON-LD type — consider `Pharmacy`/`MedicalBusiness` schema.org type instead of generic `OnlineStore`, include license info as `additionalProperty`

## 8. Git housekeeping
- [ ] `ecom-frontend/` shows fully deleted, `pharma/` is untracked — stage this as a rename (`git add -A` will let git detect it) rather than losing history, once content is confirmed final
