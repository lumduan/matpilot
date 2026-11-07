/**
 * A path drawn on the mat, made into moves (ADR 0016): the child clicks points; the robot turns
 * to face each point, then drives straight to it. The moves are what the simple blocks "turn"
 * and "move … mm" do (src/lib/blocks/incoming.ts makes them into those blocks), and what
 * `DriveBase.turn` and `straight` do in Python (../robots/drive-program.ts).
 *
 * Turns and distances are whole degrees and millimetres, as a child would type them. Each step is
 * worked out from where the robot really is after the steps before it (with their rounding), so
 * rounding does not add up along the path.
 *
 * MAT frame: counter-clockwise positive. Pybricks turns clockwise for a positive angle (cited in
 * ../robots/drive-program.ts), so a step's `degrees` is the MAT frame's turn negated.
 */
import type { RobotProfile } from '../robots/profile';
import { driveBaseProgram } from '../robots/drive-program';
import { normalHeading } from './pose';

export interface PathPoint {
  readonly xMm: number;
  readonly yMm: number;
}

export type PathStep =
  /** Pybricks' sign: positive is clockwise (right). */
  | { readonly kind: 'turn'; readonly degrees: number }
  | { readonly kind: 'straight'; readonly mm: number };

interface Pose {
  readonly xMm: number;
  readonly yMm: number;
  readonly headingDeg: number;
}

/** Points closer than this to where the robot is are skipped, mm. */
export const MIN_SEGMENT_MM = 5;
/** At most this many points. */
export const MAX_PATH_POINTS = 40;

export interface PathPlan {
  readonly steps: readonly PathStep[];
  /** Where the robot is after each point (rounding included): the drawn path. */
  readonly poses: readonly Pose[];
  /** How far it drives in all, mm. */
  readonly lengthMm: number;
}

export function planPath(start: Pose, points: readonly PathPoint[]): PathPlan {
  const steps: PathStep[] = [];
  const poses: Pose[] = [];
  let pose = start;
  let lengthMm = 0;
  for (const point of points.slice(0, MAX_PATH_POINTS)) {
    const dx = point.xMm - pose.xMm;
    const dy = point.yMm - pose.yMm;
    const distance = Math.hypot(dx, dy);
    if (distance < MIN_SEGMENT_MM) continue;
    const turn = Math.round(normalHeading((Math.atan2(dy, dx) * 180) / Math.PI - pose.headingDeg));
    const heading = pose.headingDeg + turn;
    if (turn !== 0) steps.push({ kind: 'turn', degrees: -turn });
    // Straight on along the heading it has, as far as the point is ahead of it.
    const along =
      dx * Math.cos((heading * Math.PI) / 180) + dy * Math.sin((heading * Math.PI) / 180);
    const mm = Math.round(along);
    if (mm >= MIN_SEGMENT_MM) {
      steps.push({ kind: 'straight', mm });
      lengthMm += mm;
    }
    pose = {
      xMm: pose.xMm + mm * Math.cos((heading * Math.PI) / 180),
      yMm: pose.yMm + mm * Math.sin((heading * Math.PI) / 180),
      headingDeg: heading,
    };
    poses.push(pose);
  }
  return { steps, poses, lengthMm };
}

/** A step as the blocks say it. */
export function stepText(step: PathStep): string {
  if (step.kind === 'straight') return `move forward ${step.mm} mm`;
  return `turn ${step.degrees > 0 ? 'right' : 'left'} ${Math.abs(step.degrees)}°`;
}

/** The path as a program to run on the mat (or the hub), with the robot's drive base. */
export function pathProgram(robot: RobotProfile, steps: readonly PathStep[]): string {
  return driveBaseProgram({
    robot,
    title: 'MatPilot: a path drawn on the mat',
    main: steps.map((step) =>
      step.kind === 'straight' ? `robot.straight(${step.mm})` : `robot.turn(${step.degrees})`,
    ),
  });
}
