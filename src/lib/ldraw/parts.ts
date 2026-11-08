/**
 * What MatPilot knows about LDraw parts (ADR 0017): every part's size, from the size table made
 * from the LDraw parts library (third_party/ldraw/boxes.json, by scripts/ldraw-library.mjs), and
 * for the SPIKE Prime parts what they are: the hub, the motors and where their shaft comes out,
 * the sensors and which way they look, and the wheels.
 *
 * The SPIKE facts were read from the parts' LDraw files (LDraw Parts Update 2026-10, CC BY 4.0,
 * by Philippe Hurbain), in each part's own frame, in LDU:
 * - the angular motors (54675 large, 54696p01 medium, 68488 small, and their variants) place their
 *   turning hub (u9363, u9363p01, u9534p01c01) at (0, −50, 0): the shaft comes out on the −Y side;
 * - the sensors look along −Z: the colour sensor's front (u9407) ends at z = −49, the distance
 *   sensor's front assembly (u9467c01) at z = −69, the force sensor's button (u9462) at z = −70;
 *   the variants with a cable place the sensor itself further on (37308c01 at z = −49, 37316c01
 *   at z = −60), so their fronts are at z = −98 and z = −129;
 * - the wheels with integral tyres turn about Z: 39367p01 is 140 LDU across (56 mm) and 49295p01
 *   219.5 LDU (87.8 mm), both 35 LDU wide (14 mm).
 * The unit test reads these numbers from the size table, so a new release that moved them fails.
 */
import type { MotorType, SensorType } from '../robots/profile';
import type { Vec3 } from './model';

/** A part's size: the smallest box around its shape in its own frame, LDU. */
export interface PartBox {
  readonly min: Vec3;
  readonly max: Vec3;
  /** Its description starts with "Wheel" or "Tyre". */
  readonly wheel: boolean;
}

export interface BoxTable {
  /** The LDraw release it was made from. */
  readonly release: string;
  readonly parts: ReadonlyMap<string, PartBox>;
}

export const BOX_TABLE_URL = '/vendor/ldraw/boxes.json';
export const BOX_TABLE_FORMAT = 'matpilot-ldraw-boxes';

/** The size table from its file; `null` when it is not one. */
export function readBoxTable(data: unknown): BoxTable | null {
  if (typeof data !== 'object' || data === null) return null;
  const value = data as { format?: unknown; release?: unknown; unit?: unknown; parts?: unknown };
  if (value.format !== BOX_TABLE_FORMAT || value.unit !== 'LDU') return null;
  if (typeof value.parts !== 'object' || value.parts === null) return null;
  const parts = new Map<string, PartBox>();
  for (const [name, box] of Object.entries(value.parts as Record<string, unknown>)) {
    if (!Array.isArray(box) || box.length < 6) continue;
    const numbers = box.slice(0, 6) as unknown[];
    if (!numbers.every((each) => typeof each === 'number' && Number.isFinite(each))) continue;
    const [x0, y0, z0, x1, y1, z1] = numbers as number[];
    parts.set(name, {
      min: [x0!, y0!, z0!],
      max: [x1!, y1!, z1!],
      wheel: box[6] === 'wheel',
    });
  }
  return { release: typeof value.release === 'string' ? value.release : 'unknown', parts };
}

export type KnownPart =
  | { readonly kind: 'hub'; readonly label: string }
  | {
      readonly kind: 'motor';
      readonly label: string;
      readonly motor: MotorType;
      /** Where the shaft comes out and which way, in the part's frame. */
      readonly shaft: { readonly point: Vec3; readonly direction: Vec3 };
    }
  | {
      readonly kind: 'sensor';
      readonly label: string;
      readonly sensor: SensorType;
      /** Its front, and the way it looks, in the part's frame. */
      readonly front: { readonly point: Vec3; readonly direction: Vec3 };
    }
  | {
      readonly kind: 'wheel';
      readonly label: string;
      readonly diameterLdu: number;
      readonly widthLdu: number;
      /** The axis it turns about, in the part's frame. */
      readonly axis: Vec3;
    };

const shaft = { point: [0, -50, 0], direction: [0, -1, 0] } as const;
const ahead = (z: number) => ({ point: [0, 0, z], direction: [0, 0, -1] }) as const;

const HUB = { kind: 'hub', label: 'SPIKE Prime hub' } as const;
const INVENTOR_HUB = { kind: 'hub', label: 'Robot Inventor hub' } as const;
const LARGE = { kind: 'motor', label: 'Large motor', motor: 'spike-large', shaft } as const;
const MEDIUM = { kind: 'motor', label: 'Medium motor', motor: 'spike-medium', shaft } as const;
const SMALL = { kind: 'motor', label: 'Small motor', motor: 'spike-small', shaft } as const;
const sensor = (type: SensorType, z: number) =>
  ({
    kind: 'sensor',
    label: { color: 'Colour sensor', distance: 'Distance sensor', force: 'Force sensor' }[type],
    sensor: type,
    front: ahead(z),
  }) as const;
const wheel = (label: string, diameterLdu: number) =>
  ({ kind: 'wheel', label, diameterLdu, widthLdu: 35, axis: [0, 0, 1] }) as const;

/** The SPIKE Prime parts by their LDraw names. */
export const KNOWN_PARTS: ReadonlyMap<string, KnownPart> = new Map<string, KnownPart>([
  ['45601', HUB],
  ['45601c01', HUB],
  ['45601p01', HUB],
  ['45601p02', HUB],
  // Older names, kept in the library as "~Moved to" the ones above, placed the same way.
  ['u9393c01', HUB],
  ['u9393c02', HUB],
  ['u9393p01c01', HUB],
  ['67718', INVENTOR_HUB],
  ['67718c01', INVENTOR_HUB],
  ['54675', LARGE],
  ['54675c01', LARGE],
  ['69730', LARGE],
  ['69730c01', LARGE],
  ['54696p01', MEDIUM],
  ['54696p01c01', MEDIUM],
  ['54696p02', MEDIUM],
  ['54696p02c01', MEDIUM],
  ['54696', MEDIUM],
  ['54696c01', MEDIUM],
  ['68488', SMALL],
  ['68488c01', SMALL],
  ['37308', sensor('color', -49)],
  ['37308c01', sensor('color', -98)],
  ['37316', sensor('distance', -69)],
  ['37316c01', sensor('distance', -129)],
  ['37312', sensor('force', -70)],
  ['37312c01', sensor('force', -70)],
  ['39367p01', wheel('Wheel 56 mm', 140)],
  ['49295p01', wheel('Wheel 88 mm', 219.53)],
]);

/**
 * A part MatPilot knows by name, or by the number it starts with: another program may name a
 * print or a variant differently. A part known only by its number is `guessed`: its shaft or
 * front may be elsewhere.
 */
export function knownPart(
  name: string,
): { readonly part: KnownPart; readonly guessed: boolean } | null {
  const exact = KNOWN_PARTS.get(name);
  if (exact) return { part: exact, guessed: false };
  const base = /^(\d+)/.exec(name)?.[1];
  if (!base) return null;
  for (const [known, part] of KNOWN_PARTS) {
    if (/^(\d+)/.exec(known)?.[1] === base) return { part, guessed: true };
  }
  return null;
}

/**
 * A part's size: from the table, or for a variant the table does not have (a print another
 * program names differently) the size of the plain part it starts with.
 */
export function partBox(name: string, table: BoxTable): PartBox | null {
  const exact = table.parts.get(name);
  if (exact) return exact;
  // Drop pattern and assembly endings one at a time: 3001pb05 → 3001, 54675c01x → 54675c01 → …
  let shorter = name;
  for (let step = 0; step < 3; step += 1) {
    const next = shorter.replace(/(p[a-z0-9]{1,4}|c\d{1,2}|[a-z])$/, '');
    if (next === shorter || next === '') break;
    shorter = next;
    const found = table.parts.get(shorter);
    if (found) return found;
  }
  return null;
}

/** The box around some points, in the same frame; `null` for none. */
export function pointsBox(points: readonly number[]): PartBox | null {
  if (points.length < 3) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k + 2 < points.length; k += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis]!, points[k + axis]!);
      max[axis] = Math.max(max[axis]!, points[k + axis]!);
    }
  }
  return { min: min as unknown as Vec3, max: max as unknown as Vec3, wheel: false };
}

/** The eight corners of a box. */
export function boxCorners(box: PartBox): Vec3[] {
  const out: Vec3[] = [];
  for (const x of [box.min[0], box.max[0]])
    for (const y of [box.min[1], box.max[1]])
      for (const z of [box.min[2], box.max[2]]) out.push([x, y, z]);
  return out;
}
