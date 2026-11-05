/**
 * What the blocks being generated need, collected while ./generator.ts generates a program:
 * imports, the hub, the timer, and, for the simple blocks (./simple-definitions.ts), the devices
 * they use by port, the drive base, and helper functions. ./generator.ts turns this into the
 * Config, Setup and Helpers sections.
 */
import * as Blockly from 'blockly/core';
import { Order, pythonGenerator } from 'blockly/python';
import { PORTS, type PortName } from './pybricks';

export const INDENT = '    ';

/** Devices the simple blocks create by port. */
export const PORT_DEVICES = {
  Motor: { pythonClass: 'Motor', prefix: 'motor', label: 'motor' },
  ColorSensor: { pythonClass: 'ColorSensor', prefix: 'colour_sensor', label: 'colour sensor' },
  UltrasonicSensor: {
    pythonClass: 'UltrasonicSensor',
    prefix: 'distance_sensor',
    label: 'distance sensor',
  },
  ForceSensor: { pythonClass: 'ForceSensor', prefix: 'touch_sensor', label: 'touch sensor' },
} as const;

export type PortDeviceKind = keyof typeof PORT_DEVICES;

/** The Python name of a device the simple blocks create: `motor_a`, `colour_sensor_d`, ... */
export function portDeviceName(kind: PortDeviceKind, port: PortName): string {
  return `${PORT_DEVICES[kind].prefix}_${port.toLowerCase()}`;
}

/** The Python name of a motor's speed, in degrees per second: `motor_a_speed`. */
export function motorSpeedName(port: PortName): string {
  return `${portDeviceName('Motor', port)}_speed`;
}

/** Names the drive base code defines. */
export const ROBOT = {
  robot: 'robot',
  left: 'left_wheel',
  right: 'right_wheel',
  leftPort: 'LEFT_WHEEL_PORT',
  rightPort: 'RIGHT_WHEEL_PORT',
  wheelDiameter: 'WHEEL_DIAMETER_MM',
  axleTrack: 'AXLE_TRACK_MM',
} as const;

/** Every Python name the simple blocks may define, so user variables never take one. */
export const SIMPLE_RESERVED: readonly string[] = [
  ...Object.values(ROBOT),
  ...PORTS.flatMap((port) => [
    ...(Object.keys(PORT_DEVICES) as PortDeviceKind[]).map((kind) => portDeviceName(kind, port)),
    motorSpeedName(port),
  ]),
  'DriveBase',
  'set_movement_speed',
  'drive_with_steering',
];

export interface PortUse {
  readonly port: PortName;
  readonly kind: PortDeviceKind;
  readonly blockId: string;
}

export interface Needs {
  /** `from <module> import <names>` lines. */
  readonly from: Map<string, Set<string>>;
  /** Plain `import <module>` lines. */
  readonly imports: Set<string>;
  hub: boolean;
  timer: boolean;
  /** Every block that uses a device by port, in generation order. */
  readonly portUses: PortUse[];
  /** Motors whose speed variable is used. */
  readonly speeds: Set<PortName>;
  /** Blocks that use the drive base. */
  readonly robotUses: string[];
  /** Helper functions by name, in the order first needed. */
  readonly helpers: Map<string, string>;
}

let needs: Needs | null = null;

export function beginNeeds(): Needs {
  needs = {
    from: new Map(),
    imports: new Set(),
    hub: false,
    timer: false,
    portUses: [],
    speeds: new Set(),
    robotUses: [],
    helpers: new Map(),
  };
  return needs;
}

export function endNeeds(): void {
  needs = null;
}

export function need(module: string, name: string): void {
  if (!needs) return;
  const names = needs.from.get(module) ?? new Set<string>();
  names.add(name);
  needs.from.set(module, names);
}

export function needImport(module: string): void {
  needs?.imports.add(module);
}

export function hubName(): string {
  need('pybricks.hubs', 'PrimeHub');
  if (needs) needs.hub = true;
  return 'hub';
}

export function timerName(): string {
  need('pybricks.tools', 'StopWatch');
  if (needs) needs.timer = true;
  return 'timer';
}

/** A device the block uses by port; returns its Python name. */
export function portDevice(block: Blockly.Block, field: string, kind: PortDeviceKind): string {
  const port = block.getFieldValue(field) as PortName;
  needs?.portUses.push({ port, kind, blockId: block.id });
  return portDeviceName(kind, port);
}

/** The speed variable of the motor on the block's port; registers the motor too. */
export function motorSpeed(block: Blockly.Block, field: string): string {
  const port = block.getFieldValue(field) as PortName;
  portDevice(block, field, 'Motor');
  needs?.speeds.add(port);
  return motorSpeedName(port);
}

/** The drive base; returns its Python name. */
export function robotName(block: Blockly.Block): string {
  needs?.robotUses.push(block.id);
  return ROBOT.robot;
}

/** Adds a helper function (once) and returns its name. */
export function helper(name: string, code: string): string {
  if (needs && !needs.helpers.has(name)) needs.helpers.set(name, code);
  return name;
}

export const variableName = (block: Blockly.Block, field: string) =>
  pythonGenerator.getVariableName(block.getFieldValue(field) as string);

export const arg = (block: Blockly.Block, input: string, fallback = '0', order = Order.NONE) =>
  pythonGenerator.valueToCode(block, input, order) || fallback;

/** A number literal, if the code is one. */
export function literal(code: string): number | null {
  return /^-?\d+(\.\d+)?$/.test(code.trim()) ? Number(code) : null;
}

/** Formats a number for Python without float noise: 0.1 * 3 → 0.3. */
export function formatNumber(value: number): string {
  return String(Number.parseFloat(value.toFixed(6)));
}

/** `-code`, folded into the literal when it is one. */
export function negated(code: string): string {
  const value = literal(code);
  return value === null ? `-(${code})` : formatNumber(-value);
}

/** `code * factor`, folded when the code is a literal. `code` must bind at least as tight as `*`. */
export function scaled(code: string, factor: number): string {
  const value = literal(code);
  return value === null ? `${code} * ${factor}` : formatNumber(value * factor);
}

/** Seconds in a block to milliseconds for `wait()` and friends. */
export function milliseconds(block: Blockly.Block, input: string, fallback = '1'): string {
  return scaled(arg(block, input, fallback, Order.MULTIPLICATIVE), 1000);
}
