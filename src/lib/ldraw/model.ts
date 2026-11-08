/**
 * Reading a LEGO model saved in the LDraw format (ADR 0017): a `.ldr` file (one model) or a
 * `.mpd` file (several files in one, each starting with a `0 FILE <name>` line), as BrickLink
 * Studio, LeoCAD and LDCad export them. The format (https://www.ldraw.org/article/218.html,
 * https://www.ldraw.org/article/47.html):
 * - line type 1, `1 <colour> x y z a b c d e f g h i <file>`, places a file: a point (u, v, w) of
 *   it goes to (a·u + b·v + c·w + x, d·u + e·v + f·w + y, g·u + h·v + i·w + z);
 * - line types 2 to 5 draw lines, triangles, quadrilaterals and optional lines from 2, 3, 4 and 2
 *   points (x y z each), after the colour;
 * - lengths are LDraw units (LDU), "1 LDU = 0.4 mm" (an approximation, the format page says); the
 *   frame is right-handed with −Y up;
 * - in a `.mpd`, the first file is the model; a placed file named in the document is one of its
 *   own files (a submodel, or a part the program that saved it did not find in the library).
 *
 * A placed file that is not in the document is a part from the LDraw library: the model only
 * names it. What a part is and how big it is comes from ./parts.ts.
 */

export type Vec3 = readonly [number, number, number];
/** Row-major 3 × 3 matrix: a b c / d e f / g h i. */
export type Mat3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** LDraw units to millimetres. */
export const LDU_MM = 0.4;
/** Larger files are refused before they are read. */
export const MAX_MODEL_BYTES = 1_000_000;
/** More placed parts than any LEGO robot has. */
export const MAX_PLACED_PARTS = 5000;
/** Submodels inside submodels. */
const MAX_DEPTH = 16;

/** A part as placed in the whole model. */
export interface PlacedPart {
  /** The part's name as the library knows it: lowercase, without `.dat`, `/` for `\`. */
  readonly name: string;
  readonly colour: number;
  /** From the part's own frame to the model's: `p_model = m · p_part + t`, in LDU. */
  readonly m: Mat3;
  readonly t: Vec3;
  /** Its shape's points in its own frame, when the document carries the part itself. */
  readonly ownPoints: readonly number[] | null;
}

export interface LdrawModel {
  /** The model's name: the first file's, or the file name for a `.ldr`. */
  readonly name: string;
  readonly parts: readonly PlacedPart[];
  /** How many submodels the document has (not counting the model). */
  readonly submodels: number;
}

export type ReadModelResult =
  | { readonly ok: true; readonly model: LdrawModel }
  | { readonly ok: false; readonly message: string };

/** A file name as line type 1 writes it, made into the form parts are known by. */
export const partKey = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replaceAll('\\', '/')
    .replace(/\.dat$/, '');

const docKey = (name: string) => name.trim().toLowerCase().replaceAll('\\', '/');

interface DocFile {
  readonly name: string;
  /** A part the document carries (its `!LDRAW_ORG` says so, or it is named `.dat`). */
  readonly isPart: boolean;
  readonly points: number[];
  readonly refs: {
    readonly colour: number;
    readonly m: Mat3;
    readonly t: Vec3;
    readonly name: string;
  }[];
}

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const ZERO: Vec3 = [0, 0, 0];

export const mulMat = (a: Mat3, b: Mat3): Mat3 => [
  a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
  a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
  a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
  a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
  a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
  a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
  a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
  a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
  a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
];

export const mulVec = (m: Mat3, v: Vec3): Vec3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

/** A point of a placed file in the frame it is placed in. */
export const place = (m: Mat3, t: Vec3, p: Vec3): Vec3 => {
  const q = mulVec(m, p);
  return [q[0] + t[0], q[1] + t[1], q[2] + t[2]];
};

const POINTS_OF_LINE: Record<string, number> = { '2': 2, '3': 3, '4': 4, '5': 2 };

function splitFiles(text: string, fallbackName: string): DocFile[] {
  const files: { name: string; lines: string[] }[] = [];
  let current: { name: string; lines: string[] } | null = null;
  const loose: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const file = /^0\s+FILE\s+(.+)$/i.exec(line);
    if (file) {
      current = { name: file[1]!.trim(), lines: [] };
      files.push(current);
      continue;
    }
    if (/^0\s+NOFILE\b/i.test(line)) {
      current = null;
      continue;
    }
    (current?.lines ?? loose).push(line);
  }
  // A .ldr: the whole text is the model.
  const all = files.length > 0 ? files : [{ name: fallbackName, lines: loose }];
  return all.map(({ name, lines }) => {
    const points: number[] = [];
    const refs: DocFile['refs'] = [];
    let org = '';
    for (const line of lines) {
      const t = line.split(/\s+/);
      if (t[0] === '0') {
        if (t[1]?.toUpperCase() === '!LDRAW_ORG') org = t.slice(2).join(' ');
        continue;
      }
      const count = POINTS_OF_LINE[t[0] ?? ''];
      if (count !== undefined) {
        const values = t.slice(2, 2 + count * 3).map(Number);
        if (values.length === count * 3 && values.every(Number.isFinite)) points.push(...values);
        continue;
      }
      if (t[0] === '1' && t.length >= 15) {
        const values = t.slice(1, 14).map(Number);
        if (!values.every(Number.isFinite)) continue;
        const [colour, x, y, z, a, b, c, d, e, f, g, h, i] = values as [
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
        ];
        refs.push({
          colour,
          t: [x, y, z],
          m: [a, b, c, d, e, f, g, h, i],
          name: t.slice(14).join(' '),
        });
      }
    }
    const isPart =
      /(^|\s|_)(part|subpart|primitive|shortcut)\b/i.test(org) || /\.dat$/i.test(name.trim());
    return { name, isPart, points, refs };
  });
}

/** Every point of a part the document carries, with the parts it carries placed inside it. */
function carriedPoints(
  file: DocFile,
  byName: ReadonlyMap<string, DocFile>,
  depth: number,
): number[] {
  const out = [...file.points];
  if (depth > MAX_DEPTH) return out;
  for (const ref of file.refs) {
    const child = byName.get(docKey(ref.name));
    if (!child) continue;
    const points = carriedPoints(child, byName, depth + 1);
    for (let k = 0; k + 2 < points.length; k += 3) {
      out.push(...place(ref.m, ref.t, [points[k]!, points[k + 1]!, points[k + 2]!]));
    }
  }
  return out;
}

/**
 * The parts of a model, each placed in the model's frame, through all its submodels. `fileName`
 * names a `.ldr`, whose text has no `0 FILE` line.
 */
export function readLdraw(text: string, fileName: string): ReadModelResult {
  if (text.length > MAX_MODEL_BYTES) {
    return { ok: false, message: 'This model file is too big (over 1 MB) for MatPilot.' };
  }
  const files = splitFiles(text, fileName);
  const byName = new Map<string, DocFile>();
  for (const file of files) if (!byName.has(docKey(file.name))) byName.set(docKey(file.name), file);
  const main = files[0]!;
  const parts: PlacedPart[] = [];
  const pointsCache = new Map<DocFile, number[]>();
  let tooMany = false;
  let tooDeep = false;
  const usedSubmodels = new Set<DocFile>();

  const walk = (
    file: DocFile,
    m: Mat3,
    t: Vec3,
    colour: number,
    depth: number,
    path: ReadonlySet<DocFile>,
  ) => {
    for (const ref of file.refs) {
      if (parts.length >= MAX_PLACED_PARTS) {
        tooMany = true;
        return;
      }
      const m2 = mulMat(m, ref.m);
      const t2 = place(m, t, ref.t);
      // Colour 16 is "the colour of the file that places it" (the format page, line type 1).
      const colour2 = ref.colour === 16 ? colour : ref.colour;
      const child = byName.get(docKey(ref.name));
      if (child && !child.isPart) {
        if (path.has(child) || depth >= MAX_DEPTH) {
          tooDeep = true;
          continue;
        }
        usedSubmodels.add(child);
        walk(child, m2, t2, colour2, depth + 1, new Set([...path, child]));
        continue;
      }
      let ownPoints: number[] | null = null;
      if (child) {
        ownPoints = pointsCache.get(child) ?? carriedPoints(child, byName, 0);
        pointsCache.set(child, ownPoints);
      }
      parts.push({ name: partKey(ref.name), colour: colour2, m: m2, t: t2, ownPoints });
    }
  };
  walk(main, IDENTITY, ZERO, 16, 0, new Set([main]));

  if (tooMany) {
    return {
      ok: false,
      message: `This model has more than ${MAX_PLACED_PARTS} parts: more than a robot. Is it the right file?`,
    };
  }
  if (parts.length === 0) {
    return {
      ok: false,
      message: tooDeep
        ? 'This model’s submodels place each other in a loop, so it cannot be read.'
        : 'MatPilot found no LEGO® parts in this file. Is it an LDraw model (.ldr or .mpd)?',
    };
  }
  return { ok: true, model: { name: main.name, parts, submodels: usedSubmodels.size } };
}

/** What a file looks like before it is read: Studio's own files are ZIP files. */
export function modelFileKind(fileName: string, firstBytes: string): 'ldraw' | 'studio' | 'other' {
  if (/\.io$/i.test(fileName) || firstBytes.startsWith('PK')) return 'studio';
  if (/\.(ldr|mpd|dat|l3b)$/i.test(fileName)) return 'ldraw';
  return 'other';
}
