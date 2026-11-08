/**
 * The robot's sensors on the mat (ADR 0016, step 7d).
 *
 * The colour sensor reads the mat's picture under it. From what it "sees" on, it follows the
 * firmware step by step, in the same whole-number steps, at pybricks-micropython v4.1.3
 * (FW = https://github.com/pybricks/pybricks-micropython/blob/c860b6a00301fb7c6ecd429da11dcb5a6c557c7a):
 * - reflection() is the average of the sensor's raw red, green and blue (0 to 1024 each), worked
 *   out in tenths of a percent and given with one decimal (45.6): FW
 *   lib/pbio/src/port_lump/sensors.c#L440-L445, pybricks/pupdevices/pb_type_pupdevices_colorsensor.c
 *   #L43-L49, pybricks/util_mp/pb_obj_helper.c#L112-L118 (whole numbers up to v4.0.1);
 * - color() turns the raw values into hue, saturation and value (FW lib/pbio/src/color/
 *   conversion.c#L49-L83), shifts low hues a little (FW lib/pbio/src/color/conversion.c#L95-L109),
 *   doubles low saturation and lifts low values (FW lib/pbio/src/port_lump/sensors.c#L339-L353),
 *   then picks the nearest of the colours it may detect, by default red, yellow, green, blue, white
 *   and none (FW lib/pbio/src/color/color_map.c#L50-L57, #L104-L122): a measurement with
 *   saturation 40 or less, or value 1 or
 *   less, matches the nearest grey by value, any other the nearest colour by hue
 *   (FW lib/pbio/src/color/util.c#L49-L83). The colours' own hue, saturation and value:
 *   FW pybricks/parameters/pb_type_color.c#L18-L80, FW lib/pbio/include/pbio/color.h#L72-L88.
 *
 * What the sensor would measure from a printed colour is an ESTIMATE, not the firmware: the
 * picture's red, green and blue (0 to 255) are taken as the raw values in proportion (255 → 1024),
 * averaged over a spot of SPOT_RADIUS_MM. A real sensor's readings depend on its height and on the
 * room's light; set thresholds on the real mat. Ambient light is not simulated.
 *
 * The distance sensor measures along where it looks to the nearest wall or solid object, with
 * walls at the mat's edges (a competition mat lies against the table's walls); beyond 2000 mm it
 * gives 2000, as the firmware does (FW pybricks/pupdevices/pb_type_pupdevices_ultrasonicsensor.c
 * #L36-L39). The touch sensor is pressed when the point just ahead of it is in a wall or a solid
 * object (an estimate: the robot does not stop at walls).
 */
import type { Point } from '../geometry/rect';

/** The sensor's spot on the mat, mm (an estimate). */
export const SPOT_RADIUS_MM = 4;
/** Beyond this the distance sensor gives 2000 (FW ultrasonicsensor.c#L36-L39). */
export const DISTANCE_MAX_MM = 2000;
/** How far ahead of a touch sensor a wall or object presses it, mm. */
export const TOUCH_REACH_MM = 5;

/** The mat's picture at 1 pixel per mm, row 0 at the mat's top (y = height). */
export interface MatPixels {
  readonly width: number;
  readonly height: number;
  /** RGBA, as canvas ImageData gives it. */
  readonly data: Uint8ClampedArray;
}

export interface Rect {
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface Hsv {
  readonly h: number;
  readonly s: number;
  readonly v: number;
}

/** Pybricks' colours (pb_type_color.c#L18-L80): all "idealised", as the heuristic needs. */
export const COLOR_HSV: Readonly<Record<string, Hsv>> = {
  RED: { h: 0, s: 100, v: 100 },
  ORANGE: { h: 30, s: 100, v: 100 },
  YELLOW: { h: 60, s: 100, v: 100 },
  GREEN: { h: 120, s: 100, v: 100 },
  CYAN: { h: 180, s: 100, v: 100 },
  BLUE: { h: 240, s: 100, v: 100 },
  VIOLET: { h: 270, s: 100, v: 100 },
  MAGENTA: { h: 300, s: 100, v: 100 },
  NONE: { h: 0, s: 0, v: 0 },
  BLACK: { h: 0, s: 0, v: 10 },
  GRAY: { h: 0, s: 0, v: 50 },
  WHITE: { h: 0, s: 0, v: 100 },
};

/** The colours color() may give unless a program says otherwise (lib/pbio/src/color/color_map.c#L50-L57). */
export const DEFAULT_COLORS = ['RED', 'YELLOW', 'GREEN', 'BLUE', 'WHITE', 'NONE'] as const;

const trunc = Math.trunc;

/** The average colour (0 to 255) of the mat in a spot around `at`; black off the mat. */
export function spotColor(pixels: MatPixels, at: Point, radiusMm = SPOT_RADIUS_MM) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const reach = Math.ceil(radiusMm);
  for (let dy = -reach; dy <= reach; dy += 1) {
    for (let dx = -reach; dx <= reach; dx += 1) {
      if (dx * dx + dy * dy > radiusMm * radiusMm) continue;
      const col = Math.floor(at.x + dx);
      const row = Math.floor(pixels.height - (at.y + dy));
      n += 1;
      if (col < 0 || row < 0 || col >= pixels.width || row >= pixels.height) continue;
      const i = (row * pixels.width + col) * 4;
      r += pixels.data[i]!;
      g += pixels.data[i + 1]!;
      b += pixels.data[i + 2]!;
    }
  }
  return n === 0 ? { r: 0, g: 0, b: 0 } : { r: r / n, g: g / n, b: b / n };
}

/** The estimate: a picture colour as the sensor's raw values, 0 to 1024. */
export const rawFromColor = (c: { r: number; g: number; b: number }) => ({
  r: Math.round((c.r / 255) * 1024),
  g: Math.round((c.g / 255) * 1024),
  b: Math.round((c.b / 255) * 1024),
});

/** reflection(): tenths of a percent, cut, then divided by 10 (FW sensors.c#L440-L445). */
export const reflection = (raw: { r: number; g: number; b: number }) =>
  trunc(((raw.r + raw.g + raw.b) * 1000) / 3072) / 10;

/** The standard conversion, in whole numbers: conversion.c#L49-L83. */
function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  let h = 0;
  let s = 0;
  if (chroma > 0) {
    let a: number;
    let bb: number;
    let c: number;
    if (max === r) [a, bb, c] = [g, b, 0];
    else if (max === g) [a, bb, c] = [b, r, 120];
    else [a, bb, c] = [r, g, 240];
    h = trunc((60 * (a - bb)) / chroma) + c;
    if (h < 0) h += 360;
    s = trunc((100 * chroma) / max);
  }
  return { h, s, v: trunc((101 * max) / 256) };
}

/** The reflected hue, saturation and value the firmware works out: FW sensors.c#L339-L353. */
export function hsvReflected(raw: { r: number; g: number; b: number }): Hsv {
  const eight = (value: number) => (value === 1024 ? 255 : value >> 2);
  const hsv = rgbToHsv(eight(raw.r), eight(raw.g), eight(raw.b));
  // A slight shift for lower hues: FW lib/pbio/src/color/conversion.c#L95-L109.
  let { h } = hsv;
  if (h >= 350) h = (350 + 2 * (h - 350)) % 360;
  else if (h < 40) h += 10;
  else if (h < 60) h = 50 + trunc((h - 40) / 2);
  const s = trunc((hsv.s * (200 - hsv.s)) / 100);
  const v = trunc((hsv.v * (150 - trunc(hsv.v / 2))) / 100);
  return { h, s, v };
}

/** The saturation heuristic: util.c#L49-L83. */
function distance(measurement: Hsv, candidate: Hsv): number {
  const grey = candidate.s === 0 && candidate.h === 0;
  let hue = Math.abs(candidate.h - measurement.h);
  if (hue > 180) hue = 360 - hue;
  const value = Math.abs(candidate.v - measurement.v);
  const penalty = 1000;
  if (measurement.s <= 40 || measurement.v <= 1) return grey ? value : penalty + hue;
  return grey ? penalty + value : hue;
}

/** color(): the nearest of `colors` (lib/pbio/src/color/color_map.c#L104-L122; the first of equals wins). */
export function matchColor(hsv: Hsv, colors: readonly string[] = DEFAULT_COLORS): string {
  let best = 'NONE';
  let min = Number.POSITIVE_INFINITY;
  for (const name of colors) {
    const candidate = COLOR_HSV[name];
    if (!candidate) continue;
    const cost = distance(hsv, candidate);
    if (cost < min) {
      min = cost;
      best = name;
    }
  }
  return best;
}

/** Where a ray from `from` at `degrees` (MAT frame) first meets a wall or object, mm. */
export function rayDistance(
  from: Point,
  degrees: number,
  mat: { readonly widthMm: number; readonly heightMm: number },
  objects: readonly Rect[],
): number {
  const a = (degrees * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const inside = (x: number, y: number, rect: Rect) =>
    x >= rect.xMm && x <= rect.xMm + rect.widthMm && y >= rect.yMm && y <= rect.yMm + rect.heightMm;
  if (!inside(from.x, from.y, { xMm: 0, yMm: 0, widthMm: mat.widthMm, heightMm: mat.heightMm }))
    return 0;
  if (objects.some((rect) => inside(from.x, from.y, rect))) return 0;
  // The walls: where the ray leaves the mat.
  let nearest = Number.POSITIVE_INFINITY;
  if (dx > 1e-12) nearest = Math.min(nearest, (mat.widthMm - from.x) / dx);
  if (dx < -1e-12) nearest = Math.min(nearest, -from.x / dx);
  if (dy > 1e-12) nearest = Math.min(nearest, (mat.heightMm - from.y) / dy);
  if (dy < -1e-12) nearest = Math.min(nearest, -from.y / dy);
  // Objects: where the ray enters them (the slab method).
  for (const rect of objects) {
    let t0 = 0;
    let t1 = Number.POSITIVE_INFINITY;
    for (const [o, d, lo, hi] of [
      [from.x, dx, rect.xMm, rect.xMm + rect.widthMm],
      [from.y, dy, rect.yMm, rect.yMm + rect.heightMm],
    ] as const) {
      if (Math.abs(d) < 1e-12) {
        if (o < lo || o > hi) t0 = Number.POSITIVE_INFINITY;
      } else {
        const ta = (lo - o) / d;
        const tb = (hi - o) / d;
        t0 = Math.max(t0, Math.min(ta, tb));
        t1 = Math.min(t1, Math.max(ta, tb));
      }
    }
    if (t0 <= t1 && t0 < nearest) nearest = t0;
  }
  return Math.min(DISTANCE_MAX_MM, nearest);
}

/** A touch sensor is pressed when the point just ahead of it is in a wall or a solid object. */
export function touching(
  at: Point,
  degrees: number,
  mat: { readonly widthMm: number; readonly heightMm: number },
  objects: readonly Rect[],
): boolean {
  const a = (degrees * Math.PI) / 180;
  const x = at.x + Math.cos(a) * TOUCH_REACH_MM;
  const y = at.y + Math.sin(a) * TOUCH_REACH_MM;
  if (x < 0 || y < 0 || x > mat.widthMm || y > mat.heightMm) return true;
  return objects.some(
    (rect) =>
      x >= rect.xMm &&
      x <= rect.xMm + rect.widthMm &&
      y >= rect.yMm &&
      y <= rect.yMm + rect.heightMm,
  );
}

/** Which way a sensor looks, in the ROBOT frame, degrees counter-clockwise from forward; `null`: down or up. */
export function facingAngle(facing: string): number | null {
  switch (facing) {
    case 'forward':
      return 0;
    case 'left':
      return 90;
    case 'backward':
      return 180;
    case 'right':
      return -90;
    default:
      return null;
  }
}
