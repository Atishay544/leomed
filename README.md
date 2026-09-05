# Leomed Pharma

One Next.js application serving two systems that share a Supabase database:

| | Path | Who uses it |
|---|---|---|
| **Storefront** | `/` and `/admin` | Customers, and the shop administrator |
| **Field force ERP** | `/erp` | Medical representatives, accounts, management |

The ERP covers doctor and chemist visits, field orders, distributor sales, purchase billing,
batch inventory, follow-ups, targets and reporting — see **[docs/ERP.md](docs/ERP.md)** for setup,
roles and daily use, and
[docs/plans/2026-09-04-erp-field-force-implementation.md](docs/plans/2026-09-04-erp-field-force-implementation.md)
for the schema and the reasoning behind it.

The two systems share `auth.users` and nothing else. Every ERP table is prefixed `erp_`, so the
storefront's `products`, `orders` and `profiles` are untouched by it.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
