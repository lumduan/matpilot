/**
 * The Path tab's handles on the mat (asked for on 2026-11-10: "make it pictures"): a turn's dial
 * round the robot and a drive's handle past its nose. Pure arithmetic, so the mat view only
 * passes the pointer in. MAT frame: degrees counter-clockwise; a turn's Pybricks degrees are
 * the MAT frame's turn negated (./path.ts).
 */
import { normalHeading } from './pose';

/**
 * Where the dial's handle is pointed: `pointerDeg` is the pointer's direction from the robot,
 * `wasDeg` the way the robot faced before the turn, `previous` the turn so far (MAT frame). The
 * turn follows the handle past 180° up to a full turn either way: of raw, raw + 360 and raw - 360,
 * the one nearest `previous`. `degrees` is in Pybricks' sign, in steps of `step`; null at 0 (a
 * turn is never nothing).
 */
export function turnOnDial(
  pointerDeg: number,
  wasDeg: number,
  previous: number,
  step = 5,
): { readonly turn: number; readonly degrees: number | null } {
  const raw = normalHeading(pointerDeg - wasDeg);
  const turn = [raw, raw + 360, raw - 360]
    .filter((angle) => Math.abs(angle) <= 360)
    .reduce((a, b) => (Math.abs(b - previous) < Math.abs(a - previous) ? b : a));
  const snapped = Math.round(turn / step) * step;
  return { turn, degrees: snapped === 0 ? null : -snapped };
}

/**
 * A drive's millimetres for its handle dragged `along` mm from where the drive starts (along the
 * way the robot faces); `offset` is how far the handle sits past the drive's end. Steps of `step`;
 * a drive forward stays forward and backward backward, at least one step long.
 */
export function driveFromHandle(
  along: number,
  offset: number,
  backward: boolean,
  step = 10,
): number {
  const reach = along - offset;
  const size = Math.max(step, Math.round((backward ? -reach : reach) / step) * step);
  return backward ? -size : size;
}
