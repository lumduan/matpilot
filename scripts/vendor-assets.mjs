// Copies third-party runtime files that must be served from this site into public/vendor/
// (gitignored). Runs before `next dev` and `next build`. ADR 0006: the mpy-cross WebAssembly
// binary is served from MatPilot's own origin, never from a CDN.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const packageDir = dirname(require.resolve('@pybricks/mpy-cross-v6/package.json'));
const vendorDir = join(root, 'public', 'vendor');

mkdirSync(vendorDir, { recursive: true });
copyFileSync(join(packageDir, 'build', 'mpy-cross-v6.wasm'), join(vendorDir, 'mpy-cross-v6.wasm'));
console.log('Vendored public/vendor/mpy-cross-v6.wasm from @pybricks/mpy-cross-v6.');
