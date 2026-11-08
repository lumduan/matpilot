/**
 * LDraw models for the tests, written by hand (positions in LDU, LDraw's −Y up). The driving
 * base: a hub, two medium motors with their shafts pointing out to a 56 mm wheel each (280 LDU
 * apart), a colour sensor looking down and a distance sensor looking along −Z, its front.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readBoxTable, type BoxTable } from './parts';

/** The size table the page loads, read from the repository. */
export function realBoxTable(): BoxTable {
  const text = readFileSync(join(process.cwd(), 'third_party', 'ldraw', 'boxes.json'), 'utf8');
  const table = readBoxTable(JSON.parse(text));
  if (!table) throw new Error('third_party/ldraw/boxes.json is not a size table');
  return table;
}

/** The wheels turn about LDraw X: the part's Z axis goes to X. */
const WHEEL = '0 0 1 0 1 0 -1 0 0';
/** The left motor's shaft (its −Y) points to +X, the right one's to −X. */
const SHAFT_PLUS_X = '0 -1 0 1 0 0 0 0 1';
const SHAFT_MINUS_X = '0 1 0 1 0 0 0 0 -1';
/** The colour sensor's −Z (where it looks) goes to +Y: down. */
const LOOK_DOWN = '1 0 0 0 0 -1 0 1 0';
const IDENTITY = '1 0 0 0 1 0 0 0 1';

export const DRIVE_LINES = [
  `1 0 140 0 0 ${WHEEL} 39367p01.dat`,
  `1 0 -140 0 0 ${WHEEL} 39367p01.dat`,
  `1 16 70 0 0 ${SHAFT_PLUS_X} 54696p01.dat`,
  `1 16 -70 0 0 ${SHAFT_MINUS_X} 54696p01.dat`,
];

export const SENSOR_LINES = [
  `1 16 0 -4 -200 ${LOOK_DOWN} 37308.dat`,
  `1 16 0 -60 -180 ${IDENTITY} 37316.dat`,
];

export const HUB_LINE = `1 16 0 -40 0 ${IDENTITY} 45601.dat`;

/** The driving base as one `.ldr`. */
export const DRIVING_BASE = [
  '0 Driving base',
  '0 Name: base.ldr',
  HUB_LINE,
  ...DRIVE_LINES,
  ...SENSOR_LINES,
].join('\n');

/** The same robot as a `.mpd`: the drive in a submodel placed in colour 4. */
export const DRIVING_BASE_MPD = [
  '0 FILE base.ldr',
  '0 Driving base',
  HUB_LINE,
  `1 4 0 0 0 ${IDENTITY} drive.ldr`,
  ...SENSOR_LINES,
  '0 NOFILE',
  '0 FILE drive.ldr',
  '0 The drive',
  ...DRIVE_LINES,
  '0 NOFILE',
].join('\r\n');

export { IDENTITY, LOOK_DOWN, SHAFT_MINUS_X, SHAFT_PLUS_X, WHEEL };
