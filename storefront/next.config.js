/**
 * Next.js config — minimal.
 *
 * The storefront is a thin client over the Django backend at
 * `NEXT_PUBLIC_API_BASE` (browser-side). For server-rendered pages we
 * also expose `API_INTERNAL_BASE` so SSR can hit the backend over the
 * docker bridge network without going through nginx.
 *
 * Image hostnames are open by default — the backend serves /media/ over
 * the same origin in prod, so this only matters in dev.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "**" },
      { protocol: "https", hostname: "**" },
    ],
  },
};

module.exports = nextConfig;
