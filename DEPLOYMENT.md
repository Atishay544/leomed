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

## Post-deploy checklist
- [ ] Update Supabase Auth → Site URL to production URL
- [ ] Update Supabase Auth → Redirect URLs to include production URL
- [ ] Update Razorpay webhook URL to production backend URL
- [ ] Enable Realtime for chat_sessions and chat_messages tables
- [ ] Run SQL: ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
- [ ] Test login flow end-to-end
- [ ] Test checkout with Razorpay test mode
- [ ] Promote admin user via SQL UPDATE
