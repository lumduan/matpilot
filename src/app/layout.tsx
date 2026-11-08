import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AI_ORIGINS } from '@/lib/ai/providers';
import { PROJECT_NAME } from '@/lib/project';
import './globals.css';

export const metadata: Metadata = {
  title: PROJECT_NAME,
  description:
    'Browser-only block-based programming and control for LEGO® SPIKE Prime hubs running Pybricks firmware.',
  applicationName: PROJECT_NAME,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
};

/**
 * Production builds carry a Content Security Policy that only allows this page's own origin, with
 * two exceptions in connect-src: GitHub's API, which the page calls only when the user saves or
 * loads a program on GitHub (ADR 0011), and the AI helper's providers, which it calls only after
 * an adult has turned the helper on with a key, when a question is asked (ADR 0015). It enforces
 * the "no runtime requests to third-party origins" rule in the browser itself;
 * scripts/verify-export.mjs fails the build if any other origin appears here. 'unsafe-inline' is required for scripts because a static export inlines Next.js
 * bootstrap scripts and cannot use per-request nonces. Skipped in development, where Next.js
 * needs eval and a WebSocket for hot reloading.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // 'wasm-unsafe-eval' lets the page compile WebAssembly (the mpy-cross compiler, ADR 0006). It
  // does not allow JavaScript eval().
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  // GitHub's REST API, for Save and Load on GitHub only (ADR 0011), and the AI providers, for the
  // AI helper only (ADR 0015; the list is src/lib/ai/providers.ts).
  ["connect-src 'self' https://api.github.com", ...AI_ORIGINS].join(' '),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {process.env.NODE_ENV === 'production' && (
          <meta httpEquiv="Content-Security-Policy" content={CONTENT_SECURITY_POLICY} />
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
