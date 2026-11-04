#!/usr/bin/env node
// Post-build guard for the static export (see docs/adr/0002-static-export-no-server-features.md).
//
// Fails (exit code 1) when:
//   1. out/index.html was not produced, or
//   2. any exported HTML or CSS file loads a resource from another origin
//      (MatPilot must make zero runtime requests to third-party origins), or
//   3. the self-hosted compiler binary (out/vendor/mpy-cross-v6.wasm, ADR 0006) is missing.
//
// Plain links (<a href="https://...">) are allowed: they are not loaded unless the user clicks.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const OUT_DIR = 'out';
const INDEX = join(OUT_DIR, 'index.html');
const COMPILER_WASM = join(OUT_DIR, 'vendor', 'mpy-cross-v6.wasm');

/** Matches an absolute URL with a scheme, or a protocol-relative URL (`//host/...`). */
const EXTERNAL_URL = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;

/** Elements whose src/href/srcset/poster/data attributes make the browser fetch something. */
const FETCHING_TAG =
  /<(script|link|img|iframe|source|video|audio|embed|object|track|image|use)\b[^>]*>/gi;
const FETCHING_ATTR =
  /\b(src|href|srcset|poster|data|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const CSS_URL = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
const CSS_IMPORT = /@import\s+(['"])([^'"]+)\1/gi;

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

function externalUrlsInHtml(html) {
  const found = [];
  for (const [tag] of html.matchAll(FETCHING_TAG)) {
    for (const match of tag.matchAll(FETCHING_ATTR)) {
      const value = match[2] ?? match[3] ?? match[4] ?? '';
      // srcset holds a comma-separated list of "url descriptor" pairs.
      const urls =
        match[1].toLowerCase() === 'srcset'
          ? value.split(',').map((s) => s.trim().split(/\s+/)[0] ?? '')
          : [value];
      for (const url of urls) if (EXTERNAL_URL.test(url)) found.push(url);
    }
  }
  return found.concat(externalUrlsInCss(html));
}

function externalUrlsInCss(css) {
  const found = [];
  for (const match of css.matchAll(CSS_URL)) if (EXTERNAL_URL.test(match[2])) found.push(match[2]);
  for (const match of css.matchAll(CSS_IMPORT))
    if (EXTERNAL_URL.test(match[2])) found.push(match[2]);
  return found;
}

const problems = [];

if (!existsSync(COMPILER_WASM)) {
  problems.push(
    `${COMPILER_WASM} is missing. Did scripts/vendor-assets.mjs run before next build?`,
  );
}

if (!existsSync(INDEX)) {
  problems.push(`${INDEX} was not produced. Is \`output: 'export'\` still set in next.config.ts?`);
} else {
  for (const file of walk(OUT_DIR)) {
    const name = relative('.', file);
    if (file.endsWith('.html')) {
      for (const url of externalUrlsInHtml(readFileSync(file, 'utf8'))) {
        problems.push(`${name} loads a third-party resource: ${url}`);
      }
    } else if (file.endsWith('.css')) {
      for (const url of externalUrlsInCss(readFileSync(file, 'utf8'))) {
        problems.push(`${name} loads a third-party resource: ${url}`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error('Static export verification failed:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `Static export verified: ${INDEX} exists and no exported HTML/CSS loads a third-party origin.`,
);
