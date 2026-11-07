/**
 * How sure is the robot (ADR 0016): where the real robot may end, from its measured drift. The
 * run on the mat is exact; a real robot is not. This replays the run's path many times, each
 * time as a slightly different robot, and counts where those pretend runs end.
 *
 * The model (a choice, not a measurement; the robot's drift fields are typical errors):
 * - "drift per metre" d mm: each pretend run drives (1 + a) times as far as the program asks,
 *   with a drawn from a normal distribution of spread d / 1000, and creeps sideways while it
 *   drives, by a heading change that grows with the distance so that after 1 metre straight it
 *   ends, typically, d mm to one side. After 1 metre it is off by about d mm forward or back, and
 *   about d mm to the side.
 * - "drift per 90°" e degrees: each pretend run turns (1 + b) times as far as asked, with b of
 *   spread e / 90, so a 90° turn ends about e degrees off.
 * A missing field adds no error. Each pretend run keeps its own error from start to end, as a
 * robot with slightly wrong wheels would. The replay follows the path the program made: it does
 * not run the program again, so a program that steers by its sensors (following a line, squaring
 * up on a wall) would correct some of this, and the real spread would be smaller.
 */
import type { Mat } from '../mats/mat';
import { contains, overlaps, rectCorners } from '../geometry/rect';
import { areaPolygon, matPolygon, normalHeading } from '../mats/pose';
import type { RobotProfile } from '../robots/profile';
import { footprint } from '../robots/shape';
import type { Frame, Pose } from './engine';

/** How many pretend runs. */
export const SPREAD_RUNS = 100;
/** How many of them are drawn on the mat. */
export const SPREAD_DRAWN = 30;
/** "9 in 10". */
const SHARE = 0.9;

export interface Spread {
  readonly runs: number;
  /** Where each pretend run ended. */
  readonly ends: readonly Pose[];
  /** The first SPREAD_DRAWN pretend runs' paths, thinned, for drawing. */
  readonly paths: readonly (readonly Pose[])[];
  /** 9 in 10 pretend runs end within this distance of the run's end, mm. */
  readonly radiusMm: number;
  /** 9 in 10 end facing within ± this of the run's end, degrees. */
  readonly headingDeg: number;
  /** Pretend runs that ended wholly inside each target. */
  readonly targets: readonly { readonly name: string; readonly count: number }[];
  /** Pretend runs that touched each keep-out area or ran into each solid object. */
  readonly touched: readonly { readonly name: string; readonly count: number }[];
  /** Pretend runs that went (partly) off the mat. */
  readonly leftMat: number;
  /** The drift it used (`null`: not measured, so no error). */
  readonly drift: { readonly perMetreMm: number | null; readonly per90Deg: number | null };
}

/** A small seeded random number generator (mulberry32), so the same run shows the same spread. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A normal distribution's draw (Box–Muller). */
function normal(next: () => number) {
  const u = Math.max(next(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
}

const RAD = Math.PI / 180;

/** The run's path as a different robot: distance, sideways creep and turn errors. */
function replay(frames: readonly Frame[], a: number, creepDegPerMm: number, b: number): Pose[] {
  const first = frames[0]!.pose;
  let x = first.xMm;
  let y = first.yMm;
  let h = first.headingDeg;
  const out: Pose[] = [{ xMm: x, yMm: y, headingDeg: h }];
  for (let i = 1; i < frames.length; i += 1) {
    const p0 = frames[i - 1]!.pose;
    const p1 = frames[i]!.pose;
    const turned = p1.headingDeg - p0.headingDeg;
    const middle = ((p0.headingDeg + p1.headingDeg) / 2) * RAD;
    const ds = (p1.xMm - p0.xMm) * Math.cos(middle) + (p1.yMm - p0.yMm) * Math.sin(middle);
    const next = h + turned * (1 + b) + creepDegPerMm * Math.abs(ds);
    const along = ((h + next) / 2) * RAD;
    x += ds * (1 + a) * Math.cos(along);
    y += ds * (1 + a) * Math.sin(along);
    h = next;
    out.push({ xMm: x, yMm: y, headingDeg: h });
  }
  return out;
}

const share = (values: number[]) => {
  const sorted = [...values].sort((p, q) => p - q);
  return sorted[Math.max(0, Math.ceil(sorted.length * SHARE) - 1)] ?? 0;
};

/** Where the real robot may end, or `null` when its drift was never measured or typed. */
export function runSpread(
  frames: readonly Frame[],
  robot: RobotProfile,
  mat: Mat,
  options: { readonly runs?: number; readonly seed?: number } = {},
): Spread | null {
  const { perMetreMm, per90Deg } = robot.drift;
  if ((perMetreMm === null && per90Deg === null) || frames.length < 2) return null;
  const runs = options.runs ?? SPREAD_RUNS;
  const next = random(options.seed ?? 1);
  const d = (perMetreMm ?? 0) / 1000;
  // Sideways after 1 m straight with a steady creep k (rad/mm) is about k × 1000² / 2.
  const creep = (2 * (perMetreMm ?? 0)) / 1000 ** 2 / RAD;
  const e = (per90Deg ?? 0) / 90;

  const end = frames.at(-1)!.pose;
  const matShape = matPolygon(mat);
  // The robot's outline, worked out once: only its pose changes (as ../mats/pose.ts places it).
  const box = footprint(robot);
  const outlineAt = (pose: Pose) => rectCorners(box, pose.headingDeg, { x: pose.xMm, y: pose.yMm });
  const targets = mat.areas.filter((area) => area.kind === 'target');
  const avoid = mat.areas
    .filter((area) => area.kind === 'avoid' || area.kind === 'object')
    .map((area) => ({ ...area, polygon: areaPolygon(area) }));
  const nameOf = (area: Mat['areas'][number]) =>
    area.name ||
    (area.kind === 'target' ? 'Target' : area.kind === 'object' ? 'Object' : 'Keep out');
  const inTarget = new Map<string, number>(targets.map((area) => [nameOf(area), 0]));
  const touched = new Map<string, number>(avoid.map((area) => [nameOf(area), 0]));
  // Checked every 100 ms of the run (and at its end): enough for a robot at its top speed.
  const every = 5;
  const thin = Math.max(1, Math.ceil(frames.length / 150));

  const ends: Pose[] = [];
  const paths: Pose[][] = [];
  const distances: number[] = [];
  const headings: number[] = [];
  let leftMat = 0;
  for (let run = 0; run < runs; run += 1) {
    const path = replay(frames, d * normal(next), creep * normal(next), e * normal(next));
    const last = path.at(-1)!;
    ends.push(last);
    distances.push(Math.hypot(last.xMm - end.xMm, last.yMm - end.yMm));
    headings.push(Math.abs(normalHeading(last.headingDeg - end.headingDeg)));
    if (run < SPREAD_DRAWN) {
      const drawn = path.filter((_, index) => index % thin === 0);
      if (drawn.at(-1) !== last) drawn.push(last);
      paths.push(drawn);
    }
    let off = false;
    const hit = new Set<string>();
    for (let i = 0; i < path.length; i += 1) {
      if (i % every !== 0 && i !== path.length - 1) continue;
      const outline = outlineAt(path[i]!);
      if (!off && !contains(matShape, outline)) off = true;
      if (avoid.length > 0) {
        for (const area of avoid) {
          if (!hit.has(nameOf(area)) && overlaps(area.polygon, outline)) hit.add(nameOf(area));
        }
      }
    }
    if (off) leftMat += 1;
    for (const name of hit) touched.set(name, (touched.get(name) ?? 0) + 1);
    const outline = outlineAt(last);
    for (const area of targets) {
      if (contains(areaPolygon(area), outline)) {
        inTarget.set(nameOf(area), (inTarget.get(nameOf(area)) ?? 0) + 1);
      }
    }
  }
  return {
    runs,
    ends,
    paths,
    radiusMm: share(distances),
    headingDeg: share(headings),
    targets: [...inTarget].map(([name, count]) => ({ name, count })),
    touched: [...touched].map(([name, count]) => ({ name, count })),
    leftMat,
    drift: { perMetreMm, per90Deg },
  };
}
