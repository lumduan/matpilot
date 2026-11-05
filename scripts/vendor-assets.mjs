// Copies third-party runtime files that must be served from this site into public/vendor/
// (gitignored). Runs before `next dev` and `next build`. Nothing is loaded from a CDN:
// - ADR 0006: the mpy-cross WebAssembly binary.
// - ADR 0008: Blockly's media (images and cursors). Its sounds are not copied: the editor is
//   created with `sounds: false`, and its `media` option points here.
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const vendorDir = join(root, 'public', 'vendor');

mkdirSync(vendorDir, { recursive: true });

const mpyCrossDir = dirname(require.resolve('@pybricks/mpy-cross-v6/package.json'));
copyFileSync(join(mpyCrossDir, 'build', 'mpy-cross-v6.wasm'), join(vendorDir, 'mpy-cross-v6.wasm'));
console.log('Vendored public/vendor/mpy-cross-v6.wasm from @pybricks/mpy-cross-v6.');

// Blockly's "exports" hide package.json; its main entry (index.js) sits in the package root.
const blocklyMedia = join(dirname(require.resolve('blockly')), 'media');
const mediaDir = join(vendorDir, 'blockly-media');
rmSync(mediaDir, { recursive: true, force: true });
mkdirSync(mediaDir, { recursive: true });
const media = readdirSync(blocklyMedia).filter((name) => !name.endsWith('.mp3'));
for (const name of media) copyFileSync(join(blocklyMedia, name), join(mediaDir, name));
console.log(`Vendored ${media.length} Blockly media files to public/vendor/blockly-media/.`);
