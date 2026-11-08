/**
 * Parses the live device values reader's output (./hub-source.ts) into readings, and keeps the
 * latest one for the page. Framework-agnostic; the hook in src/hooks/useHubRunner.ts feeds it.
 */

import { LineSplitter } from '../monitor/lines';
import { LIVE_COLORS, LIVE_PREFIX, TYPE_ID, type LiveColor } from './hub-source';

export const LIVE_PORTS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type LivePort = (typeof LIVE_PORTS)[number];

/**
 * UltrasonicSensor.distance() returns 2000 when nothing is in range:
 * https://github.com/pybricks/pybricks-micropython/blob/c860b6a00301fb7c6ecd429da11dcb5a6c557c7a/pybricks/pupdevices/pb_type_pupdevices_ultrasonicsensor.c#L36-L39
 */
export const NOTHING_IN_RANGE_MM = 2000;

export type LiveDevice =
  | {
      readonly kind: 'motor';
      readonly typeId: number;
      /** Degrees. */
      readonly angle: number;
      /** Degrees per second. */
      readonly speed: number;
    }
  | {
      readonly kind: 'color';
      readonly typeId: number;
      /** `null` when the sensor reported a colour outside the default list. */
      readonly color: LiveColor | null;
      /** Percent. */
      readonly reflection: number;
    }
  | {
      readonly kind: 'distance';
      readonly typeId: number;
      /** Millimetres, or `null` when nothing is in range. */
      readonly distance: number | null;
    }
  | {
      readonly kind: 'force';
      readonly typeId: number;
      /** Newtons. */
      readonly force: number;
      readonly pressed: boolean;
    }
  /** A device the reader can name by type but does not read. */
  | { readonly kind: 'other'; readonly typeId: number };

export interface LiveReading {
  readonly ports: Readonly<Record<LivePort, LiveDevice | null>>;
  /** Hub tilt in degrees: pitch and roll from hub.imu.tilt(). */
  readonly tilt: { readonly pitch: number; readonly roll: number };
}

export type LiveEvent =
  | { readonly type: 'start' }
  | { readonly type: 'reading'; readonly reading: LiveReading }
  | { readonly type: 'end'; readonly reason: 'timeout' }
  | { readonly type: 'error'; readonly message: string };

/**
 * Names by device type id, from FW lib/lego/lego/lump.h#L428-L486 at Pybricks v4.0.1
 * (https://github.com/pybricks/pybricks-micropython/blob/c860b6a00301fb7c6ecd429da11dcb5a6c557c7a/lib/lego/lego/lump.h#L428-L486).
 * "Touch sensor" is the block editor's name for the SPIKE force sensor.
 */
const TYPE_NAMES: Readonly<Record<number, string>> = {
  34: 'WeDo 2.0 tilt sensor',
  35: 'WeDo 2.0 motion sensor',
  37: 'colour and distance sensor',
  38: 'BOOST motor',
  46: 'Technic large motor',
  47: 'Technic XL motor',
  48: 'medium motor',
  49: 'large motor',
  61: 'colour sensor',
  62: 'distance sensor',
  63: 'touch sensor',
  64: 'light matrix',
  65: 'small motor',
  75: 'Technic medium angular motor',
  76: 'Technic large angular motor',
};

export function deviceName(typeId: number): string {
  return TYPE_NAMES[typeId] ?? `device ${typeId}`;
}

const INT = /^-?\d+$/;

function ints(text: string, count: number): number[] | null {
  const parts = text.split(',');
  if (parts.length !== count || !parts.every((part) => INT.test(part))) return null;
  return parts.map(Number);
}

/** One port token: `-` (empty), `<id>:` (not read), or `<id>:<values>`. */
export function parsePort(token: string): LiveDevice | null | undefined {
  if (token === '-') return null;
  const match = /^(\d+):(.*)$/.exec(token);
  if (!match) return undefined;
  const typeId = Number(match[1]);
  const values = match[2] ?? '';
  if (values === '') return { kind: 'other', typeId };
  if (typeId === TYPE_ID.COLOR_SENSOR) {
    const v = ints(values, 2);
    if (!v) return undefined;
    const [index = -1, reflection = 0] = v;
    return { kind: 'color', typeId, color: LIVE_COLORS[index] ?? null, reflection };
  }
  if (typeId === TYPE_ID.ULTRASONIC_SENSOR) {
    const v = ints(values, 1);
    if (!v) return undefined;
    const [mm = NOTHING_IN_RANGE_MM] = v;
    return { kind: 'distance', typeId, distance: mm >= NOTHING_IN_RANGE_MM || mm < 0 ? null : mm };
  }
  if (typeId === TYPE_ID.FORCE_SENSOR) {
    const v = ints(values, 2);
    if (!v) return undefined;
    const [tenths = 0, pressed = 0] = v;
    return { kind: 'force', typeId, force: tenths / 10, pressed: pressed === 1 };
  }
  const v = ints(values, 2);
  if (!v) return undefined;
  const [angle = 0, speed = 0] = v;
  return { kind: 'motor', typeId, angle, speed };
}

/** Parses one line of the reader's output; `null` for anything else (the REPL's own text). */
export function parseLiveLine(line: string): LiveEvent | null {
  if (!line.startsWith(`${LIVE_PREFIX} `)) return null;
  const rest = line.slice(LIVE_PREFIX.length + 1).trim();
  if (rest === 'start 1') return { type: 'start' };
  if (rest === 'end timeout') return { type: 'end', reason: 'timeout' };
  if (rest.startsWith('error')) return { type: 'error', message: rest.slice(5).trim() };
  const tokens = rest.split(' ');
  if (tokens.length !== LIVE_PORTS.length + 1) return null;
  const ports = {} as Record<LivePort, LiveDevice | null>;
  for (const [index, port] of LIVE_PORTS.entries()) {
    const device = parsePort(tokens[index] ?? '');
    if (device === undefined) return null;
    ports[port] = device;
  }
  const tilt = ints(tokens[LIVE_PORTS.length] ?? '', 2);
  if (!tilt) return null;
  const [pitch = 0, roll = 0] = tilt;
  return { type: 'reading', reading: { ports, tilt: { pitch, roll } } };
}

export interface LiveSnapshot {
  /** The latest reading, kept after the reader stops so the page can show it greyed out. */
  readonly reading: LiveReading | null;
  /** The reader printed its first line. */
  readonly started: boolean;
  /** How the reader's own output said it ended, if it did. */
  readonly ended: 'timeout' | 'error' | null;
  readonly error: string | null;
}

export const EMPTY_LIVE_SNAPSHOT: LiveSnapshot = Object.freeze({
  reading: null,
  started: false,
  ended: null,
  error: null,
});

type Scheduler = (callback: () => void) => void;

const defaultScheduler: Scheduler = (callback) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => callback());
  else setTimeout(callback, 16);
};

/** Feeds the reader's output in; subscribers hear about it at most once per scheduled tick. */
export class LiveStore {
  #splitter = new LineSplitter();
  readonly #listeners = new Set<() => void>();
  readonly #schedule: Scheduler;
  #snapshot: LiveSnapshot = EMPTY_LIVE_SNAPSHOT;
  #scheduled = false;

  constructor(options: { schedule?: Scheduler } = {}) {
    this.#schedule = options.schedule ?? defaultScheduler;
  }

  readonly getSnapshot = (): LiveSnapshot => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** A new session begins: forget the line in progress and the end state, keep the last reading. */
  begin(): void {
    this.#splitter = new LineSplitter();
    this.#update({ ...this.#snapshot, started: false, ended: null, error: null });
  }

  push(bytes: Uint8Array): void {
    let next = this.#snapshot;
    for (const line of this.#splitter.push(bytes)) {
      const event = parseLiveLine(line);
      if (!event) continue;
      if (event.type === 'start') next = { ...next, started: true };
      else if (event.type === 'reading') next = { ...next, started: true, reading: event.reading };
      else if (event.type === 'end') next = { ...next, ended: 'timeout' };
      else next = { ...next, ended: 'error', error: event.message };
    }
    this.#update(next);
  }

  /** Forget everything, for example when the hub disconnects. */
  clear(): void {
    this.#splitter = new LineSplitter();
    this.#update(EMPTY_LIVE_SNAPSHOT);
  }

  #update(next: LiveSnapshot): void {
    if (next === this.#snapshot) return;
    this.#snapshot = next;
    if (this.#scheduled) return;
    this.#scheduled = true;
    this.#schedule(() => {
      this.#scheduled = false;
      for (const listener of [...this.#listeners]) listener();
    });
  }
}
