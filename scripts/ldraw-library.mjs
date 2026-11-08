// Makes third_party/ldraw/ from an unpacked LDraw.org parts library (ADR 0017). A maintainer runs
// it when MatPilot moves to a newer LDraw release; its output is committed, so builds never
// download anything. Steps (the release's complete.zip, about 147 MB):
//
//   curl -LO https://library.ldraw.org/library/updates/complete.zip
//   sha256sum complete.zip          # record it in third_party/ldraw/README.md
//   unzip -q complete.zip -d /tmp/ldraw-release
//   docker compose run --rm -v /tmp/ldraw-release/ldraw:/ldraw:ro dev \
//     node scripts/ldraw-library.mjs /ldraw
//
// It writes:
// - boxes.json: every part's and primitive's size, as the smallest box around its shape in its own
//   frame, in LDraw units, so a model's size can be worked out from any part it uses; parts whose
//   description starts with "Wheel" or "Tyre" are marked, so a model's wheels can be found;
// - library/: the shapes the 3D view draws (ADR 0017, D2 as amended): the parts with the keyword
//   "Spike Prime", the Technic families SPIKE robots are built from (FAMILIES below, without
//   patterns, stickers, aliases and obsolete parts), the old names of those parts ("~Moved to"),
//   and every sub-part and primitive they use, each file unchanged; shapes.json maps each name a
//   model may place to its file; LDConfig.ldr holds the colours;
// - the library's licence files, which every copy must carry.
//
// The LDraw file format (https://www.ldraw.org/article/218.html): line type 1 places a sub-file
// with `1 <colour> x y z a b c d e f g h i <file>`, a point (u, v, w) of the sub-file going to
// (a·u + b·v + c·w + x, d·u + e·v + f·w + y, g·u + h·v + i·w + z); line types 2 to 5 draw lines,
// triangles, quadrilaterals and optional lines from 2, 3, 4 and 2 points. Sub-parts are found in
// parts/s/ (named `s\name.dat`), primitives in p/, and high- and low-resolution primitives in p/48/
// and p/8/ (named `48\name.dat`, `8\name.dat`).
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'third_party', 'ldraw');
const library = process.argv[2];

if (!library || !existsSync(join(library, 'parts')) || !existsSync(join(library, 'p'))) {
  console.error('Usage: node scripts/ldraw-library.mjs <unpacked complete.zip>/ldraw');
  process.exit(1);
}

/** Every file a line type 1 can name, by its name as written there (lowercase, `/` for `\`). */
const index = new Map();
for (const [folder, prefix] of [
  ['parts', ''],
  ['parts/s', 's/'],
  ['p', ''],
  ['p/48', '48/'],
  ['p/8', '8/'],
]) {
  const dir = join(library, folder);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (!name.toLowerCase().endsWith('.dat')) continue;
    const key = (prefix + name).toLowerCase();
    // A part wins over a primitive of the same name, as in LDraw's own tools.
    if (!index.has(key)) index.set(key, join(dir, name));
  }
}

const refKey = (name) => name.toLowerCase().replaceAll('\\', '/');

/** The Technic families the 3D view draws as shapes; any other part is drawn as a box. */
const FAMILIES = [
  'Technic Beam',
  'Technic Axle',
  'Technic Pin',
  'Technic Connector',
  'Technic Bush',
  'Technic Gear',
  'Technic Cross',
  'Technic Angle',
  'Technic Plate',
  'Technic Brick',
  'Technic Ball',
  'Technic Panel',
  'Technic Frame',
  'Technic Worm',
  'Technic Turntable',
];

/** A file's own points and the sub-files it places. */
const parsed = new Map();
function parse(path) {
  let file = parsed.get(path);
  if (file) return file;
  const points = [];
  const refs = [];
  let description = null;
  let org = '';
  let keywords = '';
  for (const raw of readFileSync(path, 'latin1').split(/\r?\n/)) {
    const t = raw.trim().split(/\s+/);
    if (t[0] === '' || t[0] === undefined) continue;
    if (t[0] === '0') {
      if (description === null) description = t.slice(1).join(' ');
      else if (t[1] === '!LDRAW_ORG') org = t.slice(2).join(' ');
      else if (t[1] === '!KEYWORDS') keywords += ` ${t.slice(2).join(' ')}`;
      continue;
    }
    const count = { 2: 2, 3: 3, 4: 4, 5: 2 }[t[0]];
    if (count) {
      for (let k = 0; k < count * 3; k += 1) points.push(Number(t[2 + k]));
    } else if (t[0] === '1' && t.length >= 15) {
      refs.push({ m: t.slice(2, 14).map(Number), name: t.slice(14).join(' ') });
    }
  }
  file = { points, refs, description: description ?? '', org, keywords };
  parsed.set(path, file);
  return file;
}

/**
 * All the points of a file and its sub-files, in its own frame, without repeats. Kept for every
 * file, because primitives and sub-parts are placed thousands of times. A box can not be turned
 * and still be the smallest box, so the points themselves are kept, not a box.
 */
const pointsOf = new Map();
const inProgress = new Set();
function allPoints(path) {
  const known = pointsOf.get(path);
  if (known) return known;
  if (inProgress.has(path)) return new Float64Array(0); // a loop: never in the library, but safe
  inProgress.add(path);
  const file = parse(path);
  const seen = new Set();
  const out = [];
  const add = (x, y, z) => {
    const key = `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(x, y, z);
  };
  for (let k = 0; k < file.points.length; k += 3) {
    add(file.points[k], file.points[k + 1], file.points[k + 2]);
  }
  for (const ref of file.refs) {
    const child = index.get(refKey(ref.name));
    if (!child) continue;
    const p = allPoints(child);
    const [x, y, z, a, b, c, d, e, f, g, h, i] = ref.m;
    for (let k = 0; k < p.length; k += 3) {
      const u = p[k];
      const v = p[k + 1];
      const w = p[k + 2];
      add(a * u + b * v + c * w + x, d * u + e * v + f * w + y, g * u + h * v + i * w + z);
    }
  }
  inProgress.delete(path);
  const result = Float64Array.from(out);
  pointsOf.set(path, result);
  return result;
}

const started = Date.now();
const parts = {};
let empty = 0;
/**
 * The parts, then the primitives (a model may place a primitive such as `box.dat` itself), each
 * by the name a model places it with; a part wins over a primitive of the same name.
 */
for (const [folder, prefix] of [
  ['parts', ''],
  ['p', ''],
  ['p/48', '48/'],
  ['p/8', '8/'],
]) {
  const dir = join(library, folder);
  if (!existsSync(dir)) continue;
  const names = readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.dat'))
    .sort();
  for (const name of names) {
    const key = (prefix + name).toLowerCase().replace(/\.dat$/, '');
    if (key in parts) continue;
    const path = join(dir, name);
    const p = allPoints(path);
    if (p.length === 0) {
      empty += 1;
      continue;
    }
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < p.length; k += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        lo[axis] = Math.min(lo[axis], p[k + axis]);
        hi[axis] = Math.max(hi[axis], p[k + axis]);
      }
    }
    // Whole LDraw units (0.4 mm), rounded outwards; `+ 0` turns -0 into 0.
    const box = [
      ...lo.map((v) => Math.floor(v + 0.01) + 0),
      ...hi.map((v) => Math.ceil(v - 0.01) + 0),
    ];
    const description = parse(path).description;
    if (folder === 'parts' && /^(Wheel|Tyre) /.test(description)) box.push('wheel');
    parts[key] = box;
    // A part's points are not kept: only sub-parts and primitives are placed again and again.
    if (folder === 'parts') pointsOf.delete(path);
  }
}

// --- The shapes the 3D view draws. ---------------------------------------------------------------
const chosen = new Set();
const allParts = readdirSync(join(library, 'parts')).filter((name) =>
  name.toLowerCase().endsWith('.dat'),
);
for (const name of allParts) {
  const file = parse(join(library, 'parts', name));
  if (/spike prime/i.test(file.keywords)) {
    chosen.add(name.toLowerCase());
    continue;
  }
  if (/^[~=_]/.test(file.description) || /Alias|Physical_Colour/.test(file.org)) continue;
  if (/Pattern|Sticker|Obsolete/.test(file.description)) continue;
  if (FAMILIES.some((family) => file.description.startsWith(family)))
    chosen.add(name.toLowerCase());
}
// Old names that only place a chosen part ("~Moved to …").
for (const name of allParts) {
  const file = parse(join(library, 'parts', name));
  if (!file.description.startsWith('~Moved to') || file.refs.length !== 1) continue;
  if (chosen.has(refKey(file.refs[0].name))) chosen.add(name.toLowerCase());
}
/** Every file the chosen parts need, by the name a model or a part places it with. */
const shapes = new Map();
const keyOf = (path) => {
  const rel = path.slice(library.length + 1).replaceAll('\\', '/');
  const lower = rel.toLowerCase();
  if (lower.startsWith('parts/s/')) return `s/${lower.slice(8)}`;
  if (lower.startsWith('p/48/')) return `48/${lower.slice(5)}`;
  if (lower.startsWith('p/8/')) return `8/${lower.slice(4)}`;
  return lower.replace(/^(parts|p)\//, '');
};
const need = (path) => {
  const key = keyOf(path).replace(/\.dat$/, '');
  if (shapes.has(key)) return;
  shapes.set(key, path);
  for (const ref of parse(path).refs) {
    const child = index.get(refKey(ref.name));
    if (child) need(child);
  }
};
for (const name of [...chosen].sort()) need(index.get(name));

const shapesDir = join(outDir, 'library');
rmSync(shapesDir, { recursive: true, force: true });
const files = {};
let shapeBytes = 0;
for (const [key, path] of [...shapes].sort(([a], [b]) => a.localeCompare(b))) {
  const rel = path
    .slice(library.length + 1)
    .replaceAll('\\', '/')
    .toLowerCase();
  mkdirSync(dirname(join(shapesDir, rel)), { recursive: true });
  const text = readFileSync(path);
  writeFileSync(join(shapesDir, rel), text);
  shapeBytes += text.length;
  files[key] = rel;
}

const note = readdirSync(join(library, 'models'))
  .filter((name) => /^note\d{4}ca\.txt$/i.test(name))
  .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
  .at(-1);
const release = note
  ? readFileSync(join(library, 'models', note), 'latin1')
      .split(/\r?\n/)[0]
      .trim()
  : 'unknown release';

mkdirSync(outDir, { recursive: true });
const lines = Object.entries(parts).map(
  ([name, box]) => `${JSON.stringify(name)}:${JSON.stringify(box)}`,
);
writeFileSync(
  join(outDir, 'boxes.json'),
  `{"format":"matpilot-ldraw-boxes","version":1,"release":${JSON.stringify(release)},"unit":"LDU","parts":{\n${lines.join(',\n')}\n}}\n`,
);
writeFileSync(
  join(outDir, 'shapes.json'),
  `${JSON.stringify({ format: 'matpilot-ldraw-shapes', version: 1, release, parts: [...chosen].sort().map((name) => name.replace(/\.dat$/, '')), files }, null, 0)}\n`,
);
for (const name of ['CAreadme.txt', 'CAlicense.txt', 'CAlicense4.txt', 'LDConfig.ldr']) {
  copyFileSync(join(library, name), join(outDir, name));
}
console.log(
  `${release}: ${chosen.size} parts drawn as shapes, ${shapes.size} files (${Math.round(shapeBytes / 1000)} kB) with what they use.`,
);
console.log(
  `${release}: ${Object.keys(parts).length} part and primitive sizes (${empty} without a shape left out) in ${Math.round((Date.now() - started) / 1000)} s, written to third_party/ldraw/.`,
);
