// Copies third-party runtime files that must be served from this site into public/vendor/
// (gitignored). Runs before `next dev` and `next build`. Nothing is loaded from a CDN:
// - ADR 0006: the mpy-cross WebAssembly binary.
// - ADR 0008: Blockly's media (images and cursors). Its sounds are not copied: the editor is
//   created with `sounds: false`, and its `media` option points here.
// - ADR 0016: pdf.js's worker and the files it reads while drawing a mat PDF (its WebAssembly
//   image and colour decoders, the ICC profile for CMYK, and the character maps), each folder
//   with its licence files. Not copied: its scripting engine (QuickJS), because MatPilot never runs
//   a PDF's scripts, and its standard fonts (some under a GPL-based licence): a PDF that names a
//   font without carrying it is drawn with the computer's own fonts, which a mat's pictures do not
//   need.
import { copyFileSync, cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
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

// pdf.js (ADR 0016). Its "exports" hide package.json; build/pdf.mjs sits under the package root.
const pdfjsDir = join(dirname(require.resolve('pdfjs-dist')), '..');
const pdfjsOut = join(vendorDir, 'pdfjs');
rmSync(pdfjsOut, { recursive: true, force: true });
mkdirSync(join(pdfjsOut, 'wasm'), { recursive: true });
// Copied as .js: every static host serves .js as JavaScript, while some serve .mjs as plain bytes,
// which browsers refuse for a module worker.
copyFileSync(join(pdfjsDir, 'build', 'pdf.worker.min.mjs'), join(pdfjsOut, 'pdf.worker.min.js'));
copyFileSync(join(pdfjsDir, 'LICENSE'), join(pdfjsOut, 'LICENSE'));
const wasmFiles = readdirSync(join(pdfjsDir, 'wasm')).filter((name) => !/quickjs/i.test(name));
for (const name of wasmFiles) {
  copyFileSync(join(pdfjsDir, 'wasm', name), join(pdfjsOut, 'wasm', name));
}
for (const folder of ['iccs', 'cmaps']) {
  cpSync(join(pdfjsDir, folder), join(pdfjsOut, folder), { recursive: true });
}
console.log(
  `Vendored pdf.js's worker, ${wasmFiles.length} decoder files, and its ICC profile and character maps to public/vendor/pdfjs/.`,
);
