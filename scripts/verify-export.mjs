#!/usr/bin/env node
// Post-build guard for the static export (see docs/adr/0002-static-export-no-server-features.md).
//
// Fails (exit code 1) when:
//   1. out/index.html was not produced, or
//   2. any exported HTML or CSS file loads a resource from another origin
//      (MatPilot must make zero runtime requests to third-party origins), or
//   3. the self-hosted compiler binary (out/vendor/mpy-cross-v6.wasm, ADR 0006) or Blockly's
//      self-hosted media (out/vendor/blockly-media/, ADR 0008) is missing, or
//   4. an exported page lacks the Content-Security-Policy meta tag, or its policy allows any
//      origin but the page's own. The one exception is https://api.github.com in connect-src,
//      for Save and Load on GitHub (docs/adr/0011-save-load-github.md).
//
// Plain links (<a href="https://...">) are allowed: they are not loaded unless the user clicks.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const OUT_DIR = 'out';
const INDEX = join(OUT_DIR, 'index.html');
const COMPILER_WASM = join(OUT_DIR, 'vendor', 'mpy-cross-v6.wasm');
const BLOCKLY_SPRITES = join(OUT_DIR, 'vendor', 'blockly-media', 'sprites.svg');

/** Matches an absolute URL with a scheme, or a protocol-relative URL (`//host/...`). */
const EXTERNAL_URL = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;

/** Elements whose src/href/srcset/poster/data attributes make the browser fetch something. */
const FETCHING_TAG =
  /<(script|link|img|iframe|source|video|audio|embed|object|track|image|use)\b[^>]*>/gi;
const FETCHING_ATTR =
  /\b(src|href|srcset|poster|data|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const CSS_URL = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
const CSS_IMPORT = /@import\s+(['"])([^'"]+)\1/gi;

/** The CSP sources each directive may list besides the keywords below (ADR 0011). */
const CSP_EXTRA_SOURCES = {
  'img-src': ['data:'],
  'connect-src': ['https://api.github.com'],
};
const CSP_KEYWORDS = new Set(["'self'", "'none'", "'unsafe-inline'", "'wasm-unsafe-eval'"]);
const CSP_META = /<meta\b[^>]*\bhttp-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/gi;
const CSP_CONTENT = /\bcontent\s*=\s*"([^"]*)"/i;

const decodeEntities = (text) =>
  text
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

function cspProblems(html) {
  const metas = [...html.matchAll(CSP_META)];
  if (metas.length !== 1) {
    return [`has ${metas.length} Content-Security-Policy meta tags; expected exactly 1`];
  }
  const content = metas[0][0].match(CSP_CONTENT)?.[1];
  if (!content) return ['has a Content-Security-Policy meta tag without a policy'];
  const problems = [];
  const directives = new Map();
  for (const part of decodeEntities(content).split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) directives.set(name.toLowerCase(), sources);
  }
  if (directives.get('default-src')?.join(' ') !== "'self'") {
    problems.push("Content-Security-Policy default-src is not exactly 'self'");
  }
  for (const [name, sources] of directives) {
    for (const source of sources) {
      if (CSP_KEYWORDS.has(source) || (CSP_EXTRA_SOURCES[name] ?? []).includes(source)) continue;
      problems.push(`Content-Security-Policy ${name} allows ${source}`);
    }
  }
  return problems;
}

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

if (!existsSync(BLOCKLY_SPRITES)) {
  problems.push(
    `${BLOCKLY_SPRITES} is missing. Blockly's media must be self-hosted (ADR 0008); did scripts/vendor-assets.mjs run?`,
  );
}

if (!existsSync(INDEX)) {
  problems.push(`${INDEX} was not produced. Is \`output: 'export'\` still set in next.config.ts?`);
} else {
  for (const file of walk(OUT_DIR)) {
    const name = relative('.', file);
    if (file.endsWith('.html')) {
      const html = readFileSync(file, 'utf8');
      for (const url of externalUrlsInHtml(html)) {
        problems.push(`${name} loads a third-party resource: ${url}`);
      }
      for (const problem of cspProblems(html)) problems.push(`${name} ${problem}`);
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
  `Static export verified: ${INDEX} exists, no exported HTML/CSS loads a third-party origin, and every page's CSP allows only its own origin (plus GitHub's API for connect-src).`,
);
