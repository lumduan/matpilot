/**
 * A robot profile (ADR 0016, section 3): what MatPilot knows about one robot, so its drive base,
 * its picture to scale, and later its runs on a mat all agree. Lengths in millimetres
 * (ADR 0004), angles in degrees, times in seconds.
 *
 * ROBOT frame (ADR 0016, section 2): the origin is the midpoint between the two drive wheels,
 * the point the robot turns around; `+x` points forward and `+y` to the robot's left.
 *
 * Saved in this browser and as a `.matpilot-robot.json` file; a block program keeps a copy of
 * the robot it uses (./../blocks/program-file.ts).
 */
import { PORTS, type PortName } from '../blocks/pybricks';

export const ROBOT_FILE_FORMAT = 'matpilot-robot';
export const ROBOT_FILE_VERSION = 1;
export const ROBOT_FILE_EXTENSION = '.matpilot-robot.json';
export const ROBOT_NAME_MAX_LENGTH = 40;
export const DEFAULT_ROBOT_NAME = 'My robot';

/** The drive motor model, for its top speed (./motion.ts). */
export type MotorType = 'spike-large' | 'spike-medium' | 'spike-small';

export const MOTOR_TYPES: readonly { readonly value: MotorType; readonly label: string }[] = [
  { value: 'spike-large', label: 'SPIKE large motor' },
  { value: 'spike-medium', label: 'SPIKE medium motor' },
  { value: 'spike-small', label: 'SPIKE small motor' },
];

export type SensorType = 'color' | 'distance' | 'force';

export const SENSOR_TYPES: readonly { readonly value: SensorType; readonly label: string }[] = [
  { value: 'color', label: 'Colour sensor' },
  { value: 'distance', label: 'Distance sensor' },
  { value: 'force', label: 'Touch (force) sensor' },
];

/** Which way a sensor looks: the colour sensor usually looks down at the mat. */
export type Facing = 'down' | 'forward' | 'backward' | 'left' | 'right' | 'up';

export const FACINGS: readonly Facing[] = ['down', 'forward', 'backward', 'left', 'right', 'up'];

export interface RobotSensor {
  readonly type: SensorType;
  readonly port: PortName;
  /** Where it is, in the ROBOT frame: ahead of the wheels (+) or behind them (−). */
  readonly xMm: number;
  /** To the robot's left (+) or right (−) of the middle. */
  readonly yMm: number;
  readonly facing: Facing;
}

/** A motor that is not a drive wheel: an arm, a claw. */
export interface RobotMotor {
  readonly port: PortName;
  readonly name: string;
}

/**
 * The LEGO model a robot was made from (ADR 0017): the LDraw file as it was loaded, so it can be
 * shown again and saved with the robot. Programs keep their copy of a robot without it.
 */
export interface RobotModel {
  readonly fileName: string;
  /** The `.ldr` or `.mpd` text. */
  readonly text: string;
  /** The front is the other way round from MatPilot's guess. */
  readonly turned: boolean;
}

/** A model's text is at most this long (as ../ldraw/model.ts reads it). */
export const ROBOT_MODEL_MAX_LENGTH = 1_000_000;

/** Speeds as the drive base's `settings()` takes them. */
export interface RobotSpeed {
  /** Straight speed, mm/s. */
  readonly straightMmS: number;
  /** Straight acceleration, mm/s². */
  readonly straightAccelerationMmS2: number;
  /** Turn rate, °/s. */
  readonly turnRateDegS: number;
  /** Turn acceleration, °/s². */
  readonly turnAccelerationDegS2: number;
}

export interface RobotProfile {
  readonly id: string;
  readonly name: string;
  readonly notes: string;
  readonly body: {
    /** Left to right. */
    readonly widthMm: number;
    /** Back to front. */
    readonly lengthMm: number;
    readonly heightMm: number;
    /** From the back of the body to the wheels' axle. */
    readonly axleFromBackMm: number;
  };
  readonly wheels: {
    readonly diameterMm: number;
    readonly widthMm: number;
    /** Axle track: from the middle of one drive wheel to the middle of the other. */
    readonly trackMm: number;
  };
  readonly drive: {
    readonly left: PortName;
    readonly right: PortName;
    /** The motor that is mounted turned round, so it turns the other way to go forward. */
    readonly mirrored: 'left' | 'right';
    readonly motor: MotorType;
  };
  readonly motors: readonly RobotMotor[];
  readonly sensors: readonly RobotSensor[];
  /** `auto`: from the motors and the wheels (./motion.ts); `set`: typed in or measured. */
  readonly speed:
    ({ readonly mode: 'auto' } & Partial<RobotSpeed>) | ({ readonly mode: 'set' } & RobotSpeed);
  /** Grams, or `null` when not weighed. */
  readonly massG: number | null;
  /** Measured on the real robot; `null` when not measured. */
  readonly drift: {
    /** How far it ends from where it should after driving 1 metre, mm. */
    readonly perMetreMm: number | null;
    /** How far its heading is off after a 90° turn, degrees. */
    readonly per90Deg: number | null;
  };
  /** The LEGO model it was made from, or `null`. */
  readonly model: RobotModel | null;
}

/** Limits for typed numbers: wide enough for any LEGO robot, narrow enough to catch typos. */
export const LIMITS = {
  bodyMm: { min: 20, max: 1000 },
  axleFromBackMm: { min: 0, max: 1000 },
  wheelDiameterMm: { min: 10, max: 300 },
  wheelWidthMm: { min: 1, max: 100 },
  trackMm: { min: 20, max: 1000 },
  sensorMm: { min: -1000, max: 1000 },
  straightMmS: { min: 5, max: 2000 },
  accelerationMmS2: { min: 10, max: 20000 },
  turnRateDegS: { min: 5, max: 2000 },
  turnAccelerationDegS2: { min: 10, max: 20000 },
  massG: { min: 1, max: 10000 },
  driftMm: { min: 0, max: 1000 },
  driftDeg: { min: 0, max: 90 },
} as const;

export const newRobotId = () =>
  `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * A new robot: the drive base MatPilot's blocks assume without one (ports A and B, 56 mm wheels,
 * 112 mm axle track: ../blocks/generator.ts DEFAULT_MOVEMENT), in a body that fits them.
 */
export function newRobot(name = DEFAULT_ROBOT_NAME): RobotProfile {
  return {
    id: newRobotId(),
    name,
    notes: '',
    body: { widthMm: 160, lengthMm: 200, heightMm: 120, axleFromBackMm: 70 },
    wheels: { diameterMm: 56, widthMm: 14, trackMm: 112 },
    drive: { left: 'A', right: 'B', mirrored: 'left', motor: 'spike-medium' },
    motors: [],
    sensors: [],
    speed: { mode: 'auto' },
    massG: null,
    drift: { perMetreMm: null, per90Deg: null },
    model: null,
  };
}

/** A robot's name made safe for a file name, like a program's. */
export function cleanRobotName(name: string): string {
  return Array.from(
    name
      .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+/, '')
      .trim(),
  )
    .slice(0, ROBOT_NAME_MAX_LENGTH)
    .join('')
    .trim();
}

export function robotFileName(name: string): string {
  return `${cleanRobotName(name) || DEFAULT_ROBOT_NAME}${ROBOT_FILE_EXTENSION}`;
}

export interface RobotProblem {
  /** The field it is about, for the form: `wheels.trackMm`. */
  readonly field: string;
  readonly message: string;
}

const inRange = (value: number, limit: { readonly min: number; readonly max: number }) =>
  Number.isFinite(value) && value >= limit.min && value <= limit.max;

/** What is wrong with a robot, so the form can say it. An empty list: it can be used. */
export function robotProblems(robot: RobotProfile): RobotProblem[] {
  const problems: RobotProblem[] = [];
  const check = (
    field: string,
    value: number,
    limit: { readonly min: number; readonly max: number },
    unit: string,
  ) => {
    if (!inRange(value, limit)) {
      problems.push({
        field,
        message: `Use a number from ${limit.min} to ${limit.max} ${unit}.`,
      });
    }
  };
  if (cleanRobotName(robot.name) === '')
    problems.push({ field: 'name', message: 'Give the robot a name.' });
  check('body.widthMm', robot.body.widthMm, LIMITS.bodyMm, 'mm');
  check('body.lengthMm', robot.body.lengthMm, LIMITS.bodyMm, 'mm');
  check('body.heightMm', robot.body.heightMm, LIMITS.bodyMm, 'mm');
  check('body.axleFromBackMm', robot.body.axleFromBackMm, LIMITS.axleFromBackMm, 'mm');
  if (
    inRange(robot.body.axleFromBackMm, LIMITS.axleFromBackMm) &&
    robot.body.axleFromBackMm > robot.body.lengthMm
  ) {
    problems.push({
      field: 'body.axleFromBackMm',
      message: 'The axle is behind the back of the body: it must be within the length.',
    });
  }
  check('wheels.diameterMm', robot.wheels.diameterMm, LIMITS.wheelDiameterMm, 'mm');
  check('wheels.widthMm', robot.wheels.widthMm, LIMITS.wheelWidthMm, 'mm');
  check('wheels.trackMm', robot.wheels.trackMm, LIMITS.trackMm, 'mm');
  if (
    inRange(robot.wheels.trackMm, LIMITS.trackMm) &&
    inRange(robot.wheels.widthMm, LIMITS.wheelWidthMm) &&
    robot.wheels.trackMm <= robot.wheels.widthMm
  ) {
    problems.push({
      field: 'wheels.trackMm',
      message: 'The wheels overlap: the axle track must be wider than a wheel.',
    });
  }
  if (robot.drive.left === robot.drive.right) {
    problems.push({ field: 'drive.right', message: 'The two drive motors need different ports.' });
  }
  const used = new Map<PortName, string>([
    [robot.drive.left, 'the left drive motor'],
    [robot.drive.right, 'the right drive motor'],
  ]);
  robot.motors.forEach((motor, index) => {
    const other = used.get(motor.port);
    if (other) {
      problems.push({
        field: `motors.${index}.port`,
        message: `Port ${motor.port} is already ${other}.`,
      });
    }
    used.set(motor.port, `“${motor.name || 'a motor'}”`);
    if (motor.name.trim() === '') {
      problems.push({
        field: `motors.${index}.name`,
        message: 'Give the motor a name, such as “arm”.',
      });
    }
  });
  robot.sensors.forEach((sensor, index) => {
    const other = used.get(sensor.port);
    if (other) {
      problems.push({
        field: `sensors.${index}.port`,
        message: `Port ${sensor.port} is already ${other}.`,
      });
    }
    used.set(sensor.port, `a ${sensor.type === 'color' ? 'colour' : sensor.type} sensor`);
    check(`sensors.${index}.xMm`, sensor.xMm, LIMITS.sensorMm, 'mm');
    check(`sensors.${index}.yMm`, sensor.yMm, LIMITS.sensorMm, 'mm');
  });
  if (robot.speed.mode === 'set') {
    check('speed.straightMmS', robot.speed.straightMmS, LIMITS.straightMmS, 'mm/s');
    check(
      'speed.straightAccelerationMmS2',
      robot.speed.straightAccelerationMmS2,
      LIMITS.accelerationMmS2,
      'mm/s²',
    );
    check('speed.turnRateDegS', robot.speed.turnRateDegS, LIMITS.turnRateDegS, '°/s');
    check(
      'speed.turnAccelerationDegS2',
      robot.speed.turnAccelerationDegS2,
      LIMITS.turnAccelerationDegS2,
      '°/s²',
    );
  }
  if (robot.massG !== null) check('massG', robot.massG, LIMITS.massG, 'g');
  if (robot.drift.perMetreMm !== null)
    check('drift.perMetreMm', robot.drift.perMetreMm, LIMITS.driftMm, 'mm');
  if (robot.drift.per90Deg !== null)
    check('drift.per90Deg', robot.drift.per90Deg, LIMITS.driftDeg, '°');
  return problems;
}

// --- Reading and writing --------------------------------------------------------------------

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const num = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const numOrNull = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const port = (value: unknown, fallback: PortName): PortName =>
  typeof value === 'string' && (PORTS as readonly string[]).includes(value)
    ? (value as PortName)
    : fallback;

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;

/**
 * A robot from stored or loaded data, with anything missing or unreadable at its default; `null`
 * when it is not a robot at all. Values out of range are kept, so the form can show the problem.
 */
export function readRobot(value: unknown): RobotProfile | null {
  if (!isObject(value)) return null;
  const base = newRobot();
  const body = isObject(value.body) ? value.body : {};
  const wheels = isObject(value.wheels) ? value.wheels : {};
  const drive = isObject(value.drive) ? value.drive : {};
  const speed = isObject(value.speed) ? value.speed : {};
  const drift = isObject(value.drift) ? value.drift : {};
  if (!isObject(value.body) || !isObject(value.wheels)) return null;
  const motors: RobotMotor[] = Array.isArray(value.motors)
    ? (value.motors as unknown[])
        .filter(isObject)
        .slice(0, PORTS.length)
        .map((motor) => ({
          port: port(motor.port, 'C'),
          name: typeof motor.name === 'string' ? motor.name.slice(0, ROBOT_NAME_MAX_LENGTH) : '',
        }))
    : [];
  const sensors: RobotSensor[] = Array.isArray(value.sensors)
    ? (value.sensors as unknown[])
        .filter(isObject)
        .slice(0, PORTS.length)
        .map((sensor) => ({
          type: oneOf(sensor.type, ['color', 'distance', 'force'] as const, 'color'),
          port: port(sensor.port, 'C'),
          xMm: num(sensor.xMm, 0),
          yMm: num(sensor.yMm, 0),
          facing: oneOf(sensor.facing, FACINGS, 'down'),
        }))
    : [];
  const mode = speed.mode === 'set' ? 'set' : 'auto';
  return {
    id: typeof value.id === 'string' && value.id !== '' ? value.id.slice(0, 64) : base.id,
    name:
      typeof value.name === 'string'
        ? cleanRobotName(value.name) || DEFAULT_ROBOT_NAME
        : DEFAULT_ROBOT_NAME,
    notes: typeof value.notes === 'string' ? value.notes.slice(0, 2000) : '',
    body: {
      widthMm: num(body.widthMm, base.body.widthMm),
      lengthMm: num(body.lengthMm, base.body.lengthMm),
      heightMm: num(body.heightMm, base.body.heightMm),
      axleFromBackMm: num(body.axleFromBackMm, base.body.axleFromBackMm),
    },
    wheels: {
      diameterMm: num(wheels.diameterMm, base.wheels.diameterMm),
      widthMm: num(wheels.widthMm, base.wheels.widthMm),
      trackMm: num(wheels.trackMm, base.wheels.trackMm),
    },
    drive: {
      left: port(drive.left, base.drive.left),
      right: port(drive.right, base.drive.right),
      mirrored: drive.mirrored === 'right' ? 'right' : 'left',
      motor: oneOf(
        drive.motor,
        MOTOR_TYPES.map((each) => each.value),
        base.drive.motor,
      ),
    },
    motors,
    sensors,
    speed:
      mode === 'set'
        ? {
            mode: 'set',
            straightMmS: num(speed.straightMmS, 200),
            straightAccelerationMmS2: num(speed.straightAccelerationMmS2, 700),
            turnRateDegS: num(speed.turnRateDegS, 150),
            turnAccelerationDegS2: num(speed.turnAccelerationDegS2, 700),
          }
        : { mode: 'auto' },
    massG: numOrNull(value.massG),
    drift: { perMetreMm: numOrNull(drift.perMetreMm), per90Deg: numOrNull(drift.per90Deg) },
    model: readModel(value.model),
  };
}

function readModel(value: unknown): RobotModel | null {
  if (!isObject(value)) return null;
  if (typeof value.text !== 'string' || value.text === '') return null;
  if (value.text.length > ROBOT_MODEL_MAX_LENGTH) return null;
  return {
    fileName: typeof value.fileName === 'string' ? value.fileName.slice(0, 200) : 'model.ldr',
    text: value.text,
    turned: value.turned === true,
  };
}

/**
 * The robot as plain data without its LEGO model: the copy a program keeps, and how two robots are
 * compared (a model changes nothing a program uses).
 */
export function robotData(robot: RobotProfile): Record<string, unknown> {
  return {
    id: robot.id,
    name: robot.name,
    notes: robot.notes,
    body: { ...robot.body },
    wheels: { ...robot.wheels },
    drive: { ...robot.drive },
    motors: robot.motors.map((motor) => ({ ...motor })),
    sensors: robot.sensors.map((sensor) => ({ ...sensor })),
    speed:
      robot.speed.mode === 'set'
        ? {
            mode: 'set',
            straightMmS: robot.speed.straightMmS,
            straightAccelerationMmS2: robot.speed.straightAccelerationMmS2,
            turnRateDegS: robot.speed.turnRateDegS,
            turnAccelerationDegS2: robot.speed.turnAccelerationDegS2,
          }
        : { mode: 'auto' },
    massG: robot.massG,
    drift: { ...robot.drift },
  };
}

/** The robot as plain data with its LEGO model: for this browser's storage and robot files. */
export function robotRecord(robot: RobotProfile): Record<string, unknown> {
  return robot.model ? { ...robotData(robot), model: { ...robot.model } } : robotData(robot);
}

export const sameRobot = (a: RobotProfile | null, b: RobotProfile | null) =>
  a === b ||
  (a !== null && b !== null && JSON.stringify(robotData(a)) === JSON.stringify(robotData(b)));

export function serializeRobotFile(robot: RobotProfile): string {
  return `${JSON.stringify(
    { format: ROBOT_FILE_FORMAT, version: ROBOT_FILE_VERSION, robot: robotRecord(robot) },
    null,
    2,
  )}\n`;
}

export type ParsedRobotFile =
  | { readonly ok: true; readonly robot: RobotProfile }
  | { readonly ok: false; readonly message: string };

export function parseRobotFile(text: string): ParsedRobotFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, message: 'This file is not a MatPilot robot (it is not JSON).' };
  }
  if (!isObject(data) || data.format !== ROBOT_FILE_FORMAT) {
    return { ok: false, message: 'This file is not a MatPilot robot.' };
  }
  if (typeof data.version !== 'number' || data.version > ROBOT_FILE_VERSION) {
    return {
      ok: false,
      message:
        'This robot was saved by a newer MatPilot. Reload the page to update, then try again.',
    };
  }
  const robot = readRobot(data.robot);
  return robot ? { ok: true, robot } : { ok: false, message: 'The robot in this file is damaged.' };
}
