/**
 * A robot profile worked out from a LEGO model (ADR 0017, route A): its size, its drive wheels
 * and axle track, which motors turn the wheels and which way they face, and where each sensor is
 * and which way it looks, in the ROBOT frame (ADR 0016 section 2: origin between the drive
 * wheels, +x forward, +y left; here also +z up from the floor), in millimetres.
 *
 * How:
 * - every part becomes the box around its shape (./parts.ts), placed as the model places it;
 * - the drive wheels are two wheels on one horizontal line (coaxial), preferring wheels on a
 *   motor's shaft; the origin is the middle between them and the floor is under them;
 * - forward is square to the wheels' axle. A model does not say which way is its front, so
 *   MatPilot guesses (the way a distance sensor looks, the side the colour sensors are on, or the
 *   longer side of the body) and the child can turn it round;
 * - the LDraw frame is right-handed with −Y up (https://www.ldraw.org/article/218.html), so up is
 *   (0, −1, 0) and the robot's left is up × forward;
 * - a drive motor whose shaft points to the robot's left is the one turned round: Pybricks
 *   defines clockwise "by looking at the motor shaft, just like looking at a clock"
 *   (https://github.com/pybricks/pybricks-api/blob/e610a0a9a3ca4dcdd79342bfe11becbdfefe0c8f/doc/main/parameters/direction.rst#L26-L27),
 *   and seen from its shaft on the robot's left, a wheel rolling forward turns counterclockwise.
 *   (On the right, seen from the right, it turns clockwise, the default.) With both shafts out
 *   that is the left motor, as in Pybricks' example: "the motor on the left must turn
 *   counterclockwise to make the robot go forward"
 *   (https://github.com/pybricks/pybricks-api/blob/e610a0a9a3ca4dcdd79342bfe11becbdfefe0c8f/examples/pup/robotics/drivebase_basics.py#L5-L8).
 */
import { LDU_MM, mulVec, place, type LdrawModel, type Vec3 } from './model';
import {
  boxCorners,
  knownPart,
  partBox,
  pointsBox,
  type BoxTable,
  type KnownPart,
  type PartBox,
} from './parts';
import type { Facing, MotorType, SensorType } from '../robots/profile';

export type DrawnKind = 'hub' | 'motor' | 'sensor' | 'drive-wheel' | 'part';

/** A part for drawing: its box's corners in the ROBOT frame, mm. */
export interface DrawnPart {
  readonly kind: DrawnKind;
  readonly corners: readonly Vec3[];
  /** Its number in `motors` or `sensors`, for a label. */
  readonly ref?: { readonly list: 'motors' | 'sensors'; readonly index: number };
}

export interface FoundMotor {
  readonly label: string;
  readonly motor: MotorType;
  /** Known only by its part number: its shaft may be elsewhere. */
  readonly guessed: boolean;
  readonly xMm: number;
  readonly yMm: number;
  /** The drive wheel it turns, if any. */
  readonly drives: 'left' | 'right' | null;
}

export interface FoundSensor {
  readonly label: string;
  readonly sensor: SensorType;
  readonly guessed: boolean;
  /** Its front, in the ROBOT frame. */
  readonly xMm: number;
  readonly yMm: number;
  readonly zMm: number;
  readonly facing: Facing;
  /** How far it looks away from `facing`, degrees. */
  readonly tiltDeg: number;
}

export interface ModelRobot {
  readonly body: {
    readonly widthMm: number;
    readonly lengthMm: number;
    readonly heightMm: number;
    readonly axleFromBackMm: number;
    /** How far the body reaches to each side of the middle. */
    readonly leftMm: number;
    readonly rightMm: number;
  };
  readonly wheels: {
    readonly label: string;
    readonly diameterMm: number;
    readonly widthMm: number;
    readonly trackMm: number;
  };
  readonly drive: {
    /** The drive motors' type, or `null` when no motor turns the wheels. */
    readonly motor: MotorType | null;
    readonly mirrored: 'left' | 'right';
  };
  /** Every motor: the drive motors first (left, then right), then the others. */
  readonly motors: readonly FoundMotor[];
  readonly sensors: readonly FoundSensor[];
  readonly hub: string | null;
  readonly front: {
    readonly turned: boolean;
    /** Why this way is the front. */
    readonly reason: string;
  };
  readonly parts: readonly DrawnPart[];
  readonly partCount: number;
  /** Parts MatPilot has no size for, by name. */
  readonly unknown: readonly { readonly name: string; readonly count: number }[];
  /** Things to check, in plain words. */
  readonly notes: readonly string[];
}

export type ModelRobotResult =
  | { readonly ok: true; readonly robot: ModelRobot }
  | { readonly ok: false; readonly message: string };

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const length = (a: Vec3) => Math.sqrt(dot(a, a));
const unit = (a: Vec3): Vec3 => {
  const n = length(a);
  return n === 0 ? [0, 0, 0] : scale(a, 1 / n);
};
/** LDraw's up. */
const UP: Vec3 = [0, -1, 0];
const round1 = (value: number) => Math.round(value * 10) / 10;

interface Wheel {
  readonly indices: number[];
  readonly label: string;
  readonly centre: Vec3;
  readonly axis: Vec3;
  readonly diameter: number;
  readonly width: number;
}

interface Motor {
  readonly index: number;
  readonly part: Extract<KnownPart, { kind: 'motor' }>;
  readonly guessed: boolean;
  readonly point: Vec3;
  readonly direction: Vec3;
}

/** A wheel from its box, when two of its sides are equal (its diameter) and the third is not. */
function wheelFromBox(
  box: PartBox,
): { centre: Vec3; axis: Vec3; diameter: number; width: number } | null {
  const size = [0, 1, 2].map((k) => box.max[k]! - box.min[k]!);
  for (let axis = 0; axis < 3; axis += 1) {
    const [p, q] = [0, 1, 2].filter((k) => k !== axis).map((k) => size[k]!);
    const across = (p! + q!) / 2;
    if (Math.abs(p! - q!) <= 0.05 * across && Math.abs(size[axis]! - across) > 0.1 * across) {
      const axisVec: Vec3 = [axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0];
      const centre: Vec3 = [0, 1, 2].map((k) => (box.min[k]! + box.max[k]!) / 2) as unknown as Vec3;
      return { centre, axis: axisVec, diameter: across, width: size[axis]! };
    }
  }
  return null;
}

/** The distance from a point to the line through `on` along `along` (a unit vector). */
const lineDistance = (point: Vec3, on: Vec3, along: Vec3) => {
  const d = sub(point, on);
  return length(sub(d, scale(along, dot(d, along))));
};

const FACING_AXES: readonly { readonly facing: Facing; readonly v: Vec3 }[] = [
  { facing: 'forward', v: [1, 0, 0] },
  { facing: 'backward', v: [-1, 0, 0] },
  { facing: 'left', v: [0, 1, 0] },
  { facing: 'right', v: [0, -1, 0] },
  { facing: 'up', v: [0, 0, 1] },
  { facing: 'down', v: [0, 0, -1] },
];

/** The robot a model makes; `turned`: the front is the other way round from MatPilot's guess. */
export function robotFromModel(
  model: LdrawModel,
  table: BoxTable,
  options: { readonly turned?: boolean } = {},
): ModelRobotResult {
  const notes: string[] = [];
  const unknownCounts = new Map<string, number>();
  const boxes: (PartBox | null)[] = [];
  const known: ({ part: KnownPart; guessed: boolean } | null)[] = [];
  for (const part of model.parts) {
    const own = part.ownPoints ? pointsBox(part.ownPoints) : null;
    const box = own ?? partBox(part.name, table);
    boxes.push(box);
    known.push(knownPart(part.name));
    if (!box) unknownCounts.set(part.name, (unknownCounts.get(part.name) ?? 0) + 1);
  }

  // --- Wheels: the known ones, and parts the library calls a wheel or a tyre. ---------------------
  const loose: Wheel[] = [];
  model.parts.forEach((part, index) => {
    const k = known[index];
    const box = boxes[index];
    let local: { centre: Vec3; axis: Vec3; diameter: number; width: number } | null = null;
    let label = 'Wheel';
    if (k?.part.kind === 'wheel') {
      local = {
        centre: [0, 0, 0],
        axis: k.part.axis,
        diameter: k.part.diameterLdu,
        width: k.part.widthLdu,
      };
      label = k.part.label;
    } else if (box?.wheel) {
      local = wheelFromBox(box);
    }
    if (!local) return;
    loose.push({
      indices: [index],
      label,
      centre: place(part.m, part.t, local.centre),
      axis: unit(mulVec(part.m, local.axis)),
      diameter: local.diameter,
      width: local.width,
    });
  });
  // A rim and its tyre are one wheel: the same middle, the same axis; the tyre is the bigger.
  const wheels: Wheel[] = [];
  for (const wheel of loose) {
    const same = wheels.findIndex(
      (each) =>
        length(sub(each.centre, wheel.centre)) < 6 && Math.abs(dot(each.axis, wheel.axis)) > 0.98,
    );
    if (same < 0) {
      wheels.push(wheel);
      continue;
    }
    const other = wheels[same]!;
    const big = wheel.diameter > other.diameter ? wheel : other;
    wheels[same] = {
      ...big,
      indices: [...other.indices, ...wheel.indices],
      width: Math.max(wheel.width, other.width),
      label: other.label !== 'Wheel' ? other.label : wheel.label,
    };
  }
  const level = wheels.filter((wheel) => Math.abs(wheel.axis[1]) < 0.15);

  // --- Motors and their shafts. ---------------------------------------------------------------
  const motors: Motor[] = [];
  model.parts.forEach((part, index) => {
    const k = known[index];
    if (k?.part.kind !== 'motor') return;
    motors.push({
      index,
      part: k.part,
      guessed: k.guessed,
      point: place(part.m, part.t, k.part.shaft.point),
      direction: unit(mulVec(part.m, k.part.shaft.direction)),
    });
  });
  /** The motor whose shaft turns this wheel: on the wheel's axis line, pointing along it. */
  const motorOn = (wheel: Wheel, taken: ReadonlySet<number>) =>
    motors
      .filter(
        (motor) =>
          !taken.has(motor.index) &&
          Math.abs(dot(motor.direction, wheel.axis)) > 0.95 &&
          lineDistance(motor.point, wheel.centre, wheel.axis) < 12,
      )
      .sort((p, q) => length(sub(p.point, wheel.centre)) - length(sub(q.point, wheel.centre)))[0] ??
    null;

  // --- The drive wheels: two level wheels on one line, the same size. ----------------------------
  let best: { a: Wheel; b: Wheel; score: number } | null = null;
  for (let i = 0; i < level.length; i += 1) {
    for (let j = i + 1; j < level.length; j += 1) {
      const a = level[i]!;
      const b = level[j]!;
      const between = sub(b.centre, a.centre);
      const gap = length(between);
      if (gap < 20 || Math.abs(dot(a.axis, b.axis)) < 0.98) continue;
      if (Math.abs(dot(unit(between), a.axis)) < 0.95) continue;
      if (Math.abs(a.diameter - b.diameter) > 0.1 * Math.max(a.diameter, b.diameter)) continue;
      const motorA = motorOn(a, new Set());
      const motorB = motorOn(b, new Set(motorA ? [motorA.index] : []));
      const score = (motorA ? 2 : 0) + (motorB ? 2 : 0) + a.diameter / 1000 + gap / 100000;
      if (!best || score > best.score) best = { a, b, score };
    }
  }
  const pair = best;
  if (!pair) {
    return {
      ok: false,
      message:
        level.length === 0
          ? 'MatPilot found no wheels in this model. A robot that drives needs a wheel on each side, turning on one line.'
          : 'MatPilot found no two wheels on one axle. A robot that drives needs a wheel on each side, turning on one line.',
    };
  }

  // --- The ROBOT frame. ------------------------------------------------------------------------
  const axis = unit([pair.a.axis[0], 0, pair.a.axis[2]]);
  const ahead = unit(cross(UP, axis));
  const origin = scale(add(pair.a.centre, pair.b.centre), 0.5);
  const radius = Math.max(pair.a.diameter, pair.b.diameter) / 2;
  const frameOf = (forward: Vec3) => {
    const left = cross(UP, forward);
    /** A point in the ROBOT frame, mm: x forward, y left, z up from the floor under the wheels. */
    const robot = (p: Vec3): Vec3 => {
      const d = sub(p, origin);
      return [dot(d, forward) * LDU_MM, dot(d, left) * LDU_MM, (dot(d, UP) + radius) * LDU_MM];
    };
    /** A direction in the ROBOT frame. */
    const turn = (v: Vec3): Vec3 => [dot(v, forward), dot(v, left), dot(v, UP)];
    return { robot, turn };
  };

  // Which way is the front? MatPilot's guess, from the parts.
  const draft = frameOf(ahead);
  const sensorParts = model.parts
    .map((part, index) => ({ part, index, k: known[index] }))
    .filter(
      (
        each,
      ): each is typeof each & {
        k: { part: Extract<KnownPart, { kind: 'sensor' }>; guessed: boolean };
      } => each.k?.part.kind === 'sensor',
    );
  const looks = sensorParts
    .filter((each) => each.k.part.sensor === 'distance')
    .map((each) => draft.turn(unit(mulVec(each.part.m, each.k.part.front.direction)))[0])
    .filter((x) => Math.abs(x) > 0.7);
  const colours = sensorParts
    .filter((each) => each.k.part.sensor === 'color')
    .map((each) => draft.robot(place(each.part.m, each.part.t, each.k.part.front.point))[0]);
  const bodyX = model.parts.flatMap((part, index) => {
    if (pair.a.indices.includes(index) || pair.b.indices.includes(index)) return [];
    const box = boxes[index];
    return (box ? boxCorners(box) : [[0, 0, 0] as Vec3]).map(
      (c) => draft.robot(place(part.m, part.t, c))[0],
    );
  });
  const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
  let sign = 1;
  let reason = 'MatPilot could not tell which way is the front.';
  if (looks.length > 0 && sum(looks) !== 0) {
    sign = Math.sign(sum(looks));
    reason = 'The distance sensor looks this way.';
  } else if (colours.length > 0 && Math.abs(sum(colours)) > 1) {
    sign = Math.sign(sum(colours));
    reason =
      colours.length === 1
        ? 'The colour sensor is on this side.'
        : 'The colour sensors are on this side.';
  } else if (bodyX.length > 0) {
    const reach = Math.max(...bodyX) + Math.min(...bodyX);
    if (Math.abs(reach) > 1) {
      sign = Math.sign(reach);
      reason = 'The body is longer on this side of the wheels.';
    }
  }
  if (options.turned) sign = -sign;
  const frame = frameOf(scale(ahead, sign));

  // --- Where everything is. ------------------------------------------------------------------
  const cornersOf = (index: number): Vec3[] => {
    const part = model.parts[index]!;
    const box = boxes[index];
    return (box ? boxCorners(box) : [[0, 0, 0] as Vec3]).map((c) =>
      frame.robot(place(part.m, part.t, c)),
    );
  };
  const corners = model.parts.map((_, index) => cornersOf(index));
  const driveIndices = new Set([...pair.a.indices, ...pair.b.indices]);
  const bodyPoints = corners.filter((_, index) => !driveIndices.has(index)).flat();
  const allPoints = corners.flat();
  const minOf = (points: readonly Vec3[], k: 0 | 1 | 2) => Math.min(...points.map((p) => p[k]));
  const maxOf = (points: readonly Vec3[], k: 0 | 1 | 2) => Math.max(...points.map((p) => p[k]));
  const back = bodyPoints.length > 0 ? Math.min(minOf(bodyPoints, 0), 0) : 0;
  const front = bodyPoints.length > 0 ? Math.max(maxOf(bodyPoints, 0), 0) : 0;
  const leftMm = bodyPoints.length > 0 ? Math.max(maxOf(bodyPoints, 1), 0) : 0;
  const rightMm = bodyPoints.length > 0 ? Math.max(-minOf(bodyPoints, 1), 0) : 0;
  const top = maxOf(allPoints, 2);
  const bottom = minOf(allPoints, 2);
  if (bottom < -3) {
    notes.push(
      `Some parts reach ${round1(-bottom)} mm below the bottom of the wheels. Is the model upside down, or does it stand on something else?`,
    );
  }
  if (Math.abs(leftMm - rightMm) > 10) {
    notes.push(
      `The body reaches ${round1(leftMm)} mm to the left of the middle and ${round1(rightMm)} mm to the right. MatPilot draws it as wide on both sides, ${round1(2 * Math.max(leftMm, rightMm))} mm.`,
    );
  }

  // The wheels, left then right.
  const aSide = frame.robot(pair.a.centre)[1];
  const [leftWheel, rightWheel] = aSide > 0 ? [pair.a, pair.b] : [pair.b, pair.a];
  const trackMm = length(sub(pair.a.centre, pair.b.centre)) * LDU_MM;

  // The drive motors.
  const taken = new Set<number>();
  const driveMotor = (wheel: Wheel, side: 'left' | 'right'): Motor | null => {
    const on = motorOn(wheel, taken);
    if (on) {
      taken.add(on.index);
      return on;
    }
    const near = motors
      .filter((motor) => !taken.has(motor.index))
      .sort((p, q) => length(sub(p.point, wheel.centre)) - length(sub(q.point, wheel.centre)))[0];
    if (near) {
      taken.add(near.index);
      notes.push(
        `The ${side} wheel is not on a motor’s shaft (it may be geared, or on its own axle). MatPilot takes the motor nearest to it: check which way it turns.`,
      );
      return near;
    }
    return null;
  };
  const leftMotor = driveMotor(leftWheel, 'left');
  const rightMotor = driveMotor(rightWheel, 'right');
  if (!leftMotor || !rightMotor) {
    notes.push(
      'MatPilot found no motor for each drive wheel: choose the drive motors’ type on the Robots page.',
    );
  }
  if (leftMotor && rightMotor && leftMotor.part.motor !== rightMotor.part.motor) {
    notes.push(
      `The two drive motors are not the same (${leftMotor.part.label.toLowerCase()} and ${rightMotor.part.label.toLowerCase()}): MatPilot uses the left one’s speeds.`,
    );
  }
  let mirrored: 'left' | 'right' = 'left';
  if (leftMotor && rightMotor) {
    const l = frame.turn(leftMotor.direction)[1];
    const r = frame.turn(rightMotor.direction)[1];
    if (l > 0.5 && r < -0.5) mirrored = 'left';
    else if (l < -0.5 && r > 0.5) mirrored = 'right';
    else {
      notes.push(
        'Both drive motors face the same way, so MatPilot cannot tell which one must turn the other way round. Check that the robot drives forward.',
      );
    }
  }

  const middleOf = (points: readonly Vec3[]): Vec3 =>
    scale(
      points.reduce<Vec3>((total, p) => add(total, p), [0, 0, 0]),
      1 / points.length,
    );
  const motorOut = (motor: Motor, drives: 'left' | 'right' | null): FoundMotor => {
    const at = middleOf(cornersOf(motor.index));
    return {
      label: motor.part.label,
      motor: motor.part.motor,
      guessed: motor.guessed,
      xMm: round1(at[0]),
      yMm: round1(at[1]),
      drives,
    };
  };
  const otherMotors = motors.filter((motor) => !taken.has(motor.index));
  const foundMotors: FoundMotor[] = [
    ...(leftMotor ? [motorOut(leftMotor, 'left')] : []),
    ...(rightMotor ? [motorOut(rightMotor, 'right')] : []),
    ...otherMotors.map((motor) => motorOut(motor, null)),
  ];
  const motorIndices = [
    ...(leftMotor ? [leftMotor.index] : []),
    ...(rightMotor ? [rightMotor.index] : []),
    ...otherMotors.map((motor) => motor.index),
  ];

  const foundSensors: FoundSensor[] = sensorParts.map(({ part, k }) => {
    const at = frame.robot(place(part.m, part.t, k.part.front.point));
    const looksAt = unit(frame.turn(mulVec(part.m, k.part.front.direction)));
    const bestAxis = FACING_AXES.reduce((p, q) => (dot(q.v, looksAt) > dot(p.v, looksAt) ? q : p));
    const tiltDeg = (Math.acos(Math.min(1, dot(bestAxis.v, looksAt))) * 180) / Math.PI;
    return {
      label: k.part.label,
      sensor: k.part.sensor,
      guessed: k.guessed,
      xMm: round1(at[0]),
      yMm: round1(at[1]),
      zMm: round1(at[2]),
      facing: bestAxis.facing,
      tiltDeg: Math.round(tiltDeg),
    };
  });
  foundSensors.forEach((sensor) => {
    if (sensor.tiltDeg > 20) {
      notes.push(
        `The ${sensor.label.toLowerCase()} at ${sensor.xMm} mm, ${sensor.yMm} mm looks ${sensor.tiltDeg}° away from ${sensor.facing}: MatPilot treats it as looking ${sensor.facing}.`,
      );
    }
  });
  const guessed = [...foundMotors, ...foundSensors].filter((each) => each.guessed);
  if (guessed.length > 0) {
    notes.push(
      `MatPilot knows ${guessed.length === 1 ? 'one part' : `${guessed.length} parts`} (${guessed.map((each) => each.label.toLowerCase()).join(', ')}) only by its number, not its exact version: check where it is.`,
    );
  }
  const hubIndex = known.findIndex((k) => k?.part.kind === 'hub');
  const hub = hubIndex >= 0 ? known[hubIndex]!.part.label : null;
  if (!hub) notes.push('MatPilot found no hub in this model.');
  const unknown = [...unknownCounts].map(([name, count]) => ({ name, count }));
  if (unknown.length > 0) {
    const count = sum(unknown.map((each) => each.count));
    notes.push(
      `MatPilot does not know ${count === 1 ? 'one part' : `${count} parts`} in this model, so the size counts ${count === 1 ? 'only where it is' : 'only where they are'}, not how big.`,
    );
  }

  const sensorIndex = new Map(sensorParts.map((each, n) => [each.index, n]));
  const motorIndex = new Map(motorIndices.map((index, n) => [index, n]));
  const parts: DrawnPart[] = corners.map((c, index) => {
    const k = known[index]?.part.kind;
    if (driveIndices.has(index)) return { kind: 'drive-wheel', corners: c };
    if (motorIndex.has(index))
      return { kind: 'motor', corners: c, ref: { list: 'motors', index: motorIndex.get(index)! } };
    if (sensorIndex.has(index))
      return {
        kind: 'sensor',
        corners: c,
        ref: { list: 'sensors', index: sensorIndex.get(index)! },
      };
    if (k === 'hub') return { kind: 'hub', corners: c };
    return { kind: 'part', corners: c };
  });

  const halfWidth = Math.max(leftMm, rightMm);
  return {
    ok: true,
    robot: {
      body: {
        widthMm: round1(2 * halfWidth),
        lengthMm: round1(front - back),
        heightMm: round1(Math.max(top, radius * 2 * LDU_MM)),
        axleFromBackMm: round1(-back),
        leftMm: round1(leftMm),
        rightMm: round1(rightMm),
      },
      wheels: {
        label: leftWheel.label,
        diameterMm: round1(leftWheel.diameter * LDU_MM),
        widthMm: round1(Math.max(leftWheel.width, rightWheel.width) * LDU_MM),
        trackMm: round1(trackMm),
      },
      drive: { motor: leftMotor?.part.motor ?? rightMotor?.part.motor ?? null, mirrored },
      motors: foundMotors,
      sensors: foundSensors,
      hub,
      front: {
        turned: options.turned === true,
        reason: options.turned ? 'You turned it round.' : reason,
      },
      parts,
      partCount: model.parts.length,
      unknown,
      notes,
    },
  };
}
