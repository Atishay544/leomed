# Deployment Guide

## Frontend → Vercel

1. Push code to GitHub
2. Connect repo to Vercel
3. Set environment variables in Vercel dashboard:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
   - SUPABASE_SERVICE_ROLE_KEY
   - NEXT_PUBLIC_TURNSTILE_SITE_KEY
   - TURNSTILE_SECRET_KEY
   - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
   - STRIPE_SECRET_KEY
   - STRIPE_WEBHOOK_SECRET
   - RESEND_API_KEY
   - NEXT_PUBLIC_BACKEND_URL (your Railway backend URL)
   - NEXT_PUBLIC_APP_URL (your Vercel URL)
4. Deploy

## Backend → Railway

1. Push code to GitHub
2. Create new Railway project → Deploy from GitHub
3. Set environment variables (copy from ecom-backend/.env)
4. Railway auto-detects Node.js via Nixpacks
5. Health check: GET /health

## ERP (field force / billing / inventory) → same deployment

The ERP at `/erp` ships inside this app and needs no extra hosting or env vars.

1. Apply the ERP migrations (`supabase db push`, or paste
   `supabase/migrations/20260904*_erp_*.sql` into the SQL editor in filename order).
   They only create `erp_`-prefixed objects — the storefront schema is untouched.
2. Create the first administrator (see `docs/ERP.md` §2.3). There is no self-signup for staff.
3. Optional, non-production only: `npm run erp:seed` for sample data.
4. Verify: `psql "$DATABASE_URL" -f supabase/tests/erp_business_rules.sql` should end with
   "All ERP business-rule tests passed."

## Post-deploy checklist
- [ ] Update Supabase Auth → Site URL to production URL
- [ ] Update Supabase Auth → Redirect URLs to include production URL
- [ ] Update Razorpay webhook URL to production backend URL
- [ ] Enable Realtime for chat_sessions and chat_messages tables
- [ ] Run SQL: ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
- [ ] Test login flow end-to-end
- [ ] Test checkout with Razorpay test mode
- [ ] Promote admin user via SQL UPDATE
- [ ] Apply the ERP migrations and create the first `erp_users` ADMIN row
- [ ] Confirm `/erp` redirects to `/erp/login` when signed out, and that a storefront
      customer account cannot reach it
