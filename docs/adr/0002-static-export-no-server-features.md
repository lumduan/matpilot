# ADR 0002: Next.js static export, no server features

- Status: Accepted
- Date: 2026-11-04

## Context

[ADR 0001](0001-browser-only-web-bluetooth.md) rules out a backend. MatPilot still benefits from a
modern React framework: routing, a build pipeline, TypeScript, and code splitting. Next.js offers a
static export mode in which `next build` writes plain HTML, CSS, and JavaScript files.

During development the app is served from a home server through a Cloudflare HTTPS hostname. In
production it will be served from a static host behind Cloudflare. Neither should need a Node.js
process. Many Next.js features do need one at runtime, and some would fail only at deploy time if
used by accident.

## Decision

1. `next.config.ts` sets **`output: 'export'`**. The `out/` folder must be deployable to any static
   host unchanged.
2. The following are **not used**: API routes, Route Handlers, Server Actions, middleware,
   `getServerSideProps`, and the default `next/image` loader. `images.unoptimized` is set to `true`
   so any future `next/image` use stays static.
3. The build **fails** if `out/index.html` is not produced or if exported HTML or CSS loads a resource
   from another origin (`scripts/verify-export.mjs`, run by `pnpm build` and checked again in CI).
4. Production pages carry a `Content-Security-Policy` meta tag that only allows the page's own
   origin. Static export cannot use per-request nonces, so scripts need `'unsafe-inline'` for the
   inlined Next.js bootstrap.
5. No service worker yet. Offline support is a later milestone with its own decision.

## Consequences

- Any static host works, and a CDN can cache everything.
- No per-request rendering. Every route must be known at build time (dynamic routes need
  `generateStaticParams`).
- HTTP response headers (HSTS, `Permissions-Policy`, a header-based CSP) cannot be set by the app;
  they belong to the hosting configuration, which is out of scope for the app repository.
- A meta-tag CSP cannot use `frame-ancestors` or reporting; those also need the host.
- Contributors must not add server-dependent features. Reviewers check this, and the static build
  fails on several of them.
