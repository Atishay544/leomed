import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// In dev: allow unsafe-eval (React needs it for debugging)
// In prod: strict CSP, no eval
const cspScriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://cdn.razorpay.com https://www.googletagmanager.com"
  : "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://cdn.razorpay.com https://www.googletagmanager.com";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // allow-popups is required for Razorpay checkout window
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      cspScriptSrc,
      "frame-src https://checkout.razorpay.com https://api.razorpay.com",
      "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://*.supabase.co wss://*.supabase.co https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com",
      "img-src 'self' data: blob: https://*.supabase.co https://*.razorpay.com https://www.googletagmanager.com",
      "style-src 'self' 'unsafe-inline'",
    ].join("; "),
  },
  // Only apply HSTS in production
  ...(!isDev ? [{
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  }] : []),
];

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    // Cache dynamic RSC pages in the browser router for 30s
    // Eliminates the 500ms skeleton flash when navigating back to /products, /category, etc.
    staleTimes: {
      dynamic: 30,  // dynamic pages (searchParams) cached 30s client-side
      static: 300,  // static pages cached 5min client-side
    },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "razorpay.com" },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 7,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
  },
};

export default nextConfig;
