/**
 * Rectangles that may be turned, and whether one lies inside another or touches it (ADR 0016).
 * Ported from lumduan/wro-2026's `sim/geometry.py` (commit 46d8f28, MIT, by MatPilot's author):
 * every footprint and area is a convex polygon, so the separating-axis test is exact.
 *
 * Millimetres and degrees, counter-clockwise positive, in whatever frame the caller uses (the
 * MAT frame or the ROBOT frame, ADR 0016 section 2).
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type Polygon = readonly Point[];

/** Distances below this are treated as zero. */
const EPS = 1e-9;

export const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** A point turned counter-clockwise by `degrees` about the origin, then moved by `offset`. */
export function place(point: Point, degrees: number, offset: Point = { x: 0, y: 0 }): Point {
  const a = toRadians(degrees);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return {
    x: offset.x + point.x * cos - point.y * sin,
    y: offset.y + point.x * sin + point.y * cos,
  };
}

/**
 * The corners of a rectangle from `minX..maxX` and `minY..maxY` in its own frame, turned by
 * `degrees` and moved by `offset`, counter-clockwise.
 */
export function rectCorners(
  box: {
    readonly minX: number;
    readonly maxX: number;
    readonly minY: number;
    readonly maxY: number;
  },
  degrees = 0,
  offset: Point = { x: 0, y: 0 },
): Point[] {
  return [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY },
    { x: box.minX, y: box.maxY },
  ].map((corner) => place(corner, degrees, offset));
}

/** Twice the signed area: positive when the corners go counter-clockwise. */
function signedArea2(polygon: Polygon): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum;
}

/** The polygon's edge normals: the axes to test. */
function axes(polygon: Polygon): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length > EPS) out.push({ x: -(b.y - a.y) / length, y: (b.x - a.x) / length });
  }
  return out;
}

function project(polygon: Polygon, axis: Point): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of polygon) {
    const value = p.x * axis.x + p.y * axis.y;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return [min, max];
}

/** The two convex polygons share some area (touching edges do not count). */
export function overlaps(a: Polygon, b: Polygon): boolean {
  for (const axis of [...axes(a), ...axes(b)]) {
    const [aMin, aMax] = project(a, axis);
    const [bMin, bMax] = project(b, axis);
    if (aMax <= bMin + EPS || bMax <= aMin + EPS) return false;
  }
  return true;
}

/** Every corner of `inner` is inside the convex polygon `outer` (on its edge counts as inside). */
export function contains(outer: Polygon, inner: Polygon): boolean {
  const turn = signedArea2(outer) >= 0 ? 1 : -1;
  return inner.every((p) => {
    for (let i = 0; i < outer.length; i += 1) {
      const a = outer[i]!;
      const b = outer[(i + 1) % outer.length]!;
      const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      if (cross * turn < -EPS) return false;
    }
    return true;
  });
}
