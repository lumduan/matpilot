/**
 * A path on the mat, made into moves (ADR 0016; more moves added 2026-11-10). It is a list of
 * moves the child puts together on the Mats page's Path tab:
 * - a point clicked on the mat: the robot turns to face it (or, driving backward, to put its back
 *   to it), then drives straight to it;
 * - a move of its own: forward or backward so many millimetres, a turn, a wait, or a new speed.
 *
 * The moves are what the simple blocks "move … mm", "turn", "wait … seconds" and "set movement
 * speed" do (src/lib/blocks/incoming.ts makes them into those blocks), and what
 * `DriveBase.straight`, `turn`, `wait` and the blocks' `set_movement_speed` do in Python
 * (../robots/drive-program.ts, where the Pybricks names are cited).
 *
 * Turns and distances are whole degrees and millimetres, as a child would type them. Each point's
 * moves are worked out from where the robot really is after the moves before it (with their
 * rounding), so rounding does not add up along the path, and a move put in before a point changes
 * how the robot gets to it, not where the point is.
 *
 * MAT frame: counter-clockwise positive. Pybricks turns clockwise for a positive angle (cited in
 * ../robots/drive-program.ts), so a step's `degrees` is the MAT frame's turn negated.
 */
import type { RobotProfile } from '../robots/profile';
import {
  MOVEMENT_SPEED_FUNCTION,
  driveBaseProgram,
  movementSpeedHelper,
} from '../robots/drive-program';
import { normalHeading } from './pose';

export interface PathPoint {
  readonly xMm: number;
  readonly yMm: number;
}

/** One block's move. */
export type PathStep =
  /** Pybricks' sign: positive is clockwise (right). */
  | { readonly kind: 'turn'; readonly degrees: number }
  /** Negative drives backward. */
  | { readonly kind: 'straight'; readonly mm: number }
  | { readonly kind: 'wait'; readonly seconds: number }
  /** A share of the top speed, as the block "set movement speed" takes it. */
  | { readonly kind: 'speed'; readonly percent: number };

/** One move in the child's list: a point clicked on the mat, or a block's move. */
export type PathItem =
  | {
      readonly kind: 'point';
      readonly xMm: number;
      readonly yMm: number;
      /** Drive there backward: turn the robot's back to the point first. */
      readonly backward?: boolean;
    }
  | PathStep;

export type PathItemKind = PathItem['kind'];

interface Pose {
  readonly xMm: number;
  readonly yMm: number;
  readonly headingDeg: number;
}

/** Points closer than this to where the robot is are skipped, mm. */
export const MIN_SEGMENT_MM = 5;
/** At most this many moves in the list (a point makes at most two blocks). */
export const MAX_PATH_ITEMS = 60;

/** What a child may type for each move (the blocks take more; these keep a path sensible). */
export const PATH_LIMITS = {
  turnDegrees: { min: 1, max: 360 },
  straightMm: { min: 1, max: 5000 },
  waitSeconds: { min: 0.1, max: 60 },
  speedPercent: { min: 5, max: 100 },
} as const;

/**
 * The move each "add" button puts in. 40 % is the drive base's own straight speed (cited in
 * ../blocks/pybricks.ts).
 */
export const NEW_ITEMS = {
  forward: { kind: 'straight', mm: 100 },
  backward: { kind: 'straight', mm: -100 },
  turn: { kind: 'turn', degrees: 90 },
  wait: { kind: 'wait', seconds: 1 },
  speed: { kind: 'speed', percent: 40 },
} as const satisfies Record<string, PathStep>;

export type NewItemKind = keyof typeof NEW_ITEMS;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** A whole number of `limit` with the sign of `value`; NaN becomes the smallest. */
const signedWhole = (value: number, limit: { min: number; max: number }) => {
  const size = clamp(Math.round(Math.abs(value)) || limit.min, limit.min, limit.max);
  return value < 0 ? -size : size;
};

/** The move as the list keeps it: whole numbers where the blocks have them, inside the limits. */
export function cleanItem(item: PathItem): PathItem {
  switch (item.kind) {
    case 'point':
      return {
        kind: 'point',
        xMm: Math.round(item.xMm * 10) / 10,
        yMm: Math.round(item.yMm * 10) / 10,
        ...(item.backward ? { backward: true } : {}),
      };
    case 'turn':
      return { kind: 'turn', degrees: signedWhole(item.degrees, PATH_LIMITS.turnDegrees) };
    case 'straight':
      return { kind: 'straight', mm: signedWhole(item.mm, PATH_LIMITS.straightMm) };
    case 'wait': {
      const { min, max } = PATH_LIMITS.waitSeconds;
      const seconds = Number.isFinite(item.seconds) ? item.seconds : 1;
      return { kind: 'wait', seconds: Math.round(clamp(seconds, min, max) * 10) / 10 };
    }
    case 'speed': {
      const { min, max } = PATH_LIMITS.speedPercent;
      const percent = Number.isFinite(item.percent) ? Math.round(item.percent) : 40;
      return { kind: 'speed', percent: clamp(percent, min, max) };
    }
  }
}

/** A straight drive drawn on the mat. */
export interface PathSegment {
  readonly from: PathPoint;
  readonly to: PathPoint;
  readonly backward: boolean;
}

export interface PlannedItem {
  /** The blocks this move becomes (a point: a turn and a drive; a point on the robot: none). */
  readonly steps: readonly PathStep[];
  /** Where the robot is after it. */
  readonly pose: Pose;
}

export interface PathPlan {
  /** Every block, in order. */
  readonly steps: readonly PathStep[];
  /** One for each move in the list. */
  readonly items: readonly PlannedItem[];
  /** The straight drives, for the mat. */
  readonly segments: readonly PathSegment[];
  /** Where the robot ends. */
  readonly end: Pose;
  /** How far it drives in all, forward and backward, mm. */
  readonly lengthMm: number;
}

const radians = (degrees: number) => (degrees * Math.PI) / 180;

export function planPath(start: Pose, list: readonly PathItem[]): PathPlan {
  const steps: PathStep[] = [];
  const items: PlannedItem[] = [];
  const segments: PathSegment[] = [];
  let pose = start;
  let lengthMm = 0;
  const drive = (mm: number): PathStep => {
    const to = {
      xMm: pose.xMm + mm * Math.cos(radians(pose.headingDeg)),
      yMm: pose.yMm + mm * Math.sin(radians(pose.headingDeg)),
      headingDeg: pose.headingDeg,
    };
    segments.push({ from: pose, to, backward: mm < 0 });
    lengthMm += Math.abs(mm);
    pose = to;
    return { kind: 'straight', mm };
  };
  for (const item of list.slice(0, MAX_PATH_ITEMS)) {
    const made: PathStep[] = [];
    if (item.kind === 'point') {
      const dx = item.xMm - pose.xMm;
      const dy = item.yMm - pose.yMm;
      if (Math.hypot(dx, dy) >= MIN_SEGMENT_MM) {
        const facing = (Math.atan2(dy, dx) * 180) / Math.PI + (item.backward ? 180 : 0);
        const turn = Math.round(normalHeading(facing - pose.headingDeg));
        if (turn !== 0) {
          made.push({ kind: 'turn', degrees: -turn });
          pose = { ...pose, headingDeg: pose.headingDeg + turn };
        }
        // Straight on along the heading it has, as far as the point is ahead of it (or behind).
        const along =
          dx * Math.cos(radians(pose.headingDeg)) + dy * Math.sin(radians(pose.headingDeg));
        const mm = Math.round(along);
        if (Math.abs(mm) >= MIN_SEGMENT_MM) made.push(drive(mm));
      }
    } else if (item.kind === 'turn') {
      made.push(item);
      pose = { ...pose, headingDeg: pose.headingDeg - item.degrees };
    } else if (item.kind === 'straight') {
      made.push(drive(item.mm));
    } else {
      made.push(item);
    }
    steps.push(...made);
    items.push({ steps: made, pose });
  }
  return { steps, items, segments, end: pose, lengthMm };
}

/** A step as the blocks say it. */
export function stepText(step: PathStep): string {
  switch (step.kind) {
    case 'straight':
      return `move ${step.mm < 0 ? 'backward' : 'forward'} ${Math.abs(step.mm)} mm`;
    case 'turn':
      return `turn ${step.degrees > 0 ? 'right' : 'left'} ${Math.abs(step.degrees)}°`;
    case 'wait':
      return `wait ${step.seconds} seconds`;
    case 'speed':
      return `set movement speed to ${step.percent} %`;
  }
}

/** The path as a program to run on the mat (or the hub), with the robot's drive base. */
export function pathProgram(robot: RobotProfile, steps: readonly PathStep[]): string {
  const speeds = steps.some((step) => step.kind === 'speed');
  return driveBaseProgram({
    robot,
    title: 'MatPilot: a path drawn on the mat',
    waits: steps.some((step) => step.kind === 'wait'),
    helpers: speeds ? [movementSpeedHelper('robot')] : [],
    main: steps.map((step) => {
      switch (step.kind) {
        case 'straight':
          return `robot.straight(${step.mm})`;
        case 'turn':
          return `robot.turn(${step.degrees})`;
        case 'wait':
          return `wait(${Math.round(step.seconds * 1000)})`;
        case 'speed':
          return `${MOVEMENT_SPEED_FUNCTION}(${step.percent})`;
      }
    }),
  });
}
