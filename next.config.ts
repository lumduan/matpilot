import type { NextConfig } from 'next';

/**
 * MatPilot is a browser-only static site. See:
 * - docs/adr/0001-browser-only-web-bluetooth.md
 * - docs/adr/0002-static-export-no-server-features.md
 *
 * `output: 'export'` makes `next build` write plain static files to `out/`, which must be
 * deployable to any static host unchanged. Do not add API routes, Route Handlers, Server
 * Actions, middleware, or anything else that needs a Node.js server at runtime.
 */
const nextConfig: NextConfig = {
  output: 'export',
  images: {
    // The default next/image loader optimises images on a server, which a static export does
    // not have. Keep images unoptimized so any future use of next/image stays static.
    unoptimized: true,
  },
  reactStrictMode: true,
};

export default nextConfig;
