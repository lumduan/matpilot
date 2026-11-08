/**
 * A LEGO model packed for the 3D view (ADR 0017, step 10a-2): one LDraw text holding the model's
 * own files and every library file it needs, so three.js's LDrawLoader never looks anywhere else.
 *
 * - The library files are the shapes subset served from this site (third_party/ldraw/library/,
 *   listed in shapes.json); a part the subset lacks becomes a box of its true size (the size
 *   table), and a part MatPilot has no size for becomes an empty part.
 * - Every file is named as LDrawLoader names a placed file (three.js r186,
 *   examples/jsm/loaders/LDrawLoader.js, line type 1): `\` becomes `/`, a name starting `s/`
 *   gets `parts/` in front and one starting `48/` gets `p/` in front; names are compared in lower
 *   case. A placed file it cannot find makes the whole model fail, so nothing is left to find.
 * - LDrawLoader reads the first file as the model only if its `0 FILE` line is the text's first
 *   line, so the packed text starts with it.
 */
import { partKey } from './model';
import type { BoxTable, PartBox } from './parts';

export const SHAPES_URL = '/vendor/ldraw/shapes.json';
/** Where the shapes' files are: `${SHAPES_FOLDER_URL}${path}`. */
export const SHAPES_FOLDER_URL = '/vendor/ldraw/library/';
/** The LDraw colours. */
export const LDCONFIG_URL = '/vendor/ldraw/LDConfig.ldr';
export const SHAPES_FORMAT = 'matpilot-ldraw-shapes';

export interface ShapeLibrary {
  readonly release: string;
  /** A placed name (as ./model.ts `partKey` makes it) to its file under the folder. */
  readonly files: ReadonlyMap<string, string>;
}

export function readShapeLibrary(data: unknown): ShapeLibrary | null {
  if (typeof data !== 'object' || data === null) return null;
  const value = data as { format?: unknown; release?: unknown; files?: unknown };
  if (value.format !== SHAPES_FORMAT || typeof value.files !== 'object' || value.files === null) {
    return null;
  }
  const files = new Map<string, string>();
  for (const [key, path] of Object.entries(value.files as Record<string, unknown>)) {
    // Only plain relative paths inside the folder.
    if (typeof path === 'string' && /^[a-z0-9_./-]+\.dat$/.test(path) && !path.includes('..')) {
      files.set(key, path);
    }
  }
  return { release: typeof value.release === 'string' ? value.release : 'unknown', files };
}

/** The name LDrawLoader gives a placed file. */
export function loaderName(name: string): string {
  const slashed = name.trim().replaceAll('\\', '/');
  if (/^s\//i.test(slashed)) return `parts/${slashed}`;
  if (/^48\//.test(slashed)) return `p/${slashed}`;
  return slashed;
}

interface RawFile {
  readonly name: string;
  readonly lines: readonly string[];
}

function splitRaw(text: string, fileName: string): RawFile[] {
  const files: { name: string; lines: string[] }[] = [];
  let current: { name: string; lines: string[] } | null = null;
  const loose: string[] = [];
  for (const raw of text.split(/\r?\n|\r/)) {
    const line = raw.trim();
    if (line === '') continue;
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
  return files.length > 0 ? files : [{ name: fileName, lines: loose }];
}

/** The files a file places, as written. */
const placed = (lines: readonly string[]) =>
  lines.flatMap((line) => {
    const t = line.split(/\s+/);
    return t[0] === '1' && t.length >= 15 ? [t.slice(14).join(' ')] : [];
  });

/** A part drawn as its box: six faces in the colour it is placed in, and its edges. */
function boxPart(box: PartBox): string[] {
  const [x0, y0, z0] = box.min;
  const [x1, y1, z1] = box.max;
  const c = (x: number, y: number, z: number) => `${x} ${y} ${z}`;
  const faces = [
    [c(x0, y0, z0), c(x1, y0, z0), c(x1, y0, z1), c(x0, y0, z1)],
    [c(x0, y1, z0), c(x0, y1, z1), c(x1, y1, z1), c(x1, y1, z0)],
    [c(x0, y0, z0), c(x0, y0, z1), c(x0, y1, z1), c(x0, y1, z0)],
    [c(x1, y0, z0), c(x1, y1, z0), c(x1, y1, z1), c(x1, y0, z1)],
    [c(x0, y0, z0), c(x0, y1, z0), c(x1, y1, z0), c(x1, y0, z0)],
    [c(x0, y0, z1), c(x1, y0, z1), c(x1, y1, z1), c(x0, y1, z1)],
  ];
  const edges: [string, string][] = [];
  for (const face of faces.slice(0, 2)) {
    for (let k = 0; k < 4; k += 1) edges.push([face[k]!, face[(k + 1) % 4]!]);
  }
  edges.push(
    [c(x0, y0, z0), c(x0, y1, z0)],
    [c(x1, y0, z0), c(x1, y1, z0)],
    [c(x1, y0, z1), c(x1, y1, z1)],
    [c(x0, y0, z1), c(x0, y1, z1)],
  );
  return [
    ...faces.map((face) => `4 16 ${face.join(' ')}`),
    ...edges.map(([a, b]) => `2 24 ${a} ${b}`),
  ];
}

export interface PackedModel {
  readonly text: string;
  /** Library parts drawn with their shapes. */
  readonly shapes: number;
  /** Library parts drawn as boxes: not in the shapes MatPilot serves. */
  readonly boxes: readonly string[];
  /** Parts not drawn at all: MatPilot has neither their shape nor their size. */
  readonly missing: readonly string[];
}

/**
 * The model with every file it needs. `fetchText(path)` reads a file of the shapes folder; it is
 * called once per file, the files of one level at a time.
 */
export async function packModel(
  text: string,
  fileName: string,
  shapes: ShapeLibrary,
  boxes: BoxTable,
  fetchText: (path: string) => Promise<string>,
): Promise<PackedModel> {
  const own = splitRaw(text, fileName);
  const out: string[] = [];
  const have = new Set<string>();
  const add = (name: string, lines: readonly string[]) => {
    have.add(name.toLowerCase());
    out.push(`0 FILE ${name}`, ...lines);
  };
  own.forEach((file, index) => add(index === 0 ? file.name : loaderName(file.name), file.lines));

  const drawn = new Set<string>();
  const asBoxes: string[] = [];
  const missing: string[] = [];
  let wanted = own.flatMap((file) => placed(file.lines));
  /** The library parts the model places itself (not the sub-parts and primitives they use). */
  const direct = new Set(
    wanted.filter((name) => !have.has(loaderName(name).toLowerCase())).map(partKey),
  );
  while (wanted.length > 0) {
    const level = new Map<string, string>();
    for (const name of wanted) {
      const loader = loaderName(name);
      if (!have.has(loader.toLowerCase()) && !level.has(loader.toLowerCase())) {
        level.set(loader.toLowerCase(), name);
      }
    }
    const fetched = await Promise.all(
      [...level.values()].map(async (name) => {
        const key = partKey(name);
        const path = shapes.files.get(key);
        if (path) {
          try {
            return { name, key, lines: splitRaw(await fetchText(path), name)[0]!.lines };
          } catch {
            // Drawn as a box below, as if the subset did not have it.
          }
        }
        return { name, key, lines: null };
      }),
    );
    wanted = [];
    for (const { name, key, lines } of fetched) {
      const loader = loaderName(name);
      if (lines) {
        add(loader, lines);
        drawn.add(key);
        wanted.push(...placed(lines));
        continue;
      }
      const box = boxes.parts.get(key);
      if (box) asBoxes.push(key);
      else missing.push(key);
      add(loader, [
        `0 ${box ? 'Box' : 'Unknown'} for ${name}`,
        '0 !LDRAW_ORG Unofficial_Part',
        ...(box ? boxPart(box) : []),
      ]);
    }
  }
  return {
    text: `${out.join('\n')}\n`,
    shapes: [...direct].filter((key) => drawn.has(key)).length,
    boxes: asBoxes.filter((key) => direct.has(key)).sort(),
    missing: missing.sort(),
  };
}
