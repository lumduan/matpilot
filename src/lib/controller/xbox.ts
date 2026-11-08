/**
 * The Xbox controller as the block programs use it (ADR 0012): its buttons, and the `@xbx` lines a
 * program prints so the page can show the controller live. The hub reads the controller itself
 * (ADR 0003); these lines only report what it read. The browser is never in the control loop.
 *
 * Line format, one per line on the program's stdout:
 * - `@xbx searching`, `@xbx connected`, `@xbx notfound`, `@xbx lost`, `@xbx menu`
 * - `@xbx <left x> <left y> <right x> <right y> <left trigger> <right trigger> <buttons>`: sticks
 *   -100 to 100 (up and right are positive), triggers 0 to 100, and the pressed buttons as bits
 *   in XBOX_BUTTONS order.
 */

export const CONTROLLER_LINE_PREFIX = '@xbx';

export interface XboxButton {
  /** The Pybricks `Button` member. */
  readonly python: string;
  /** What the page and the blocks show. */
  readonly label: string;
}

/** Bit order of the `@xbx` buttons field. Never reorder: programs already running depend on it. */
export const XBOX_BUTTONS = [
  { python: 'A', label: 'A' },
  { python: 'B', label: 'B' },
  { python: 'X', label: 'X' },
  { python: 'Y', label: 'Y' },
  { python: 'LB', label: 'LB' },
  { python: 'RB', label: 'RB' },
  { python: 'VIEW', label: 'View' },
  { python: 'MENU', label: 'Menu' },
  { python: 'LJ', label: 'Left stick press (LS)' },
  { python: 'RJ', label: 'Right stick press (RS)' },
  { python: 'UP', label: 'D-pad up' },
  { python: 'DOWN', label: 'D-pad down' },
  { python: 'LEFT', label: 'D-pad left' },
  { python: 'RIGHT', label: 'D-pad right' },
  { python: 'GUIDE', label: 'Xbox button' },
] as const satisfies readonly XboxButton[];

export type XboxButtonName = (typeof XBOX_BUTTONS)[number]['python'];

export interface ControllerValues {
  readonly leftX: number;
  readonly leftY: number;
  readonly rightX: number;
  readonly rightY: number;
  readonly leftTrigger: number;
  readonly rightTrigger: number;
  readonly pressed: readonly XboxButtonName[];
}

/**
 * - idle: no program has used the controller since the page loaded.
 * - searching: the program is looking for the controller.
 * - connected: values arrive.
 * - notfound: the program gave up looking and stopped.
 * - lost: the controller went away, so the program stopped.
 * - menu: Menu was pressed, so the program stopped.
 * - ended: the program ended or was stopped some other way.
 */
export type ControllerStatus =
  'idle' | 'searching' | 'connected' | 'notfound' | 'lost' | 'menu' | 'ended';

export type ControllerLine =
  | { readonly kind: 'status'; readonly status: Exclude<ControllerStatus, 'idle' | 'ended'> }
  | { readonly kind: 'values'; readonly values: ControllerValues };

const STATUS_WORDS = new Set(['searching', 'connected', 'notfound', 'lost', 'menu']);

/** Reads one stdout line; `null` when it is not an `@xbx` line. */
export function parseControllerLine(line: string): ControllerLine | null {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== CONTROLLER_LINE_PREFIX) return null;
  const rest = tokens.slice(1);
  if (rest.length === 1 && STATUS_WORDS.has(rest[0] ?? '')) {
    return {
      kind: 'status',
      status: rest[0] as Exclude<ControllerStatus, 'idle' | 'ended'>,
    };
  }
  if (rest.length !== 7 || !rest.every((token) => /^-?\d+$/.test(token))) return null;
  const [leftX, leftY, rightX, rightY, leftTrigger, rightTrigger, bits] = rest.map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return {
    kind: 'values',
    values: {
      leftX,
      leftY,
      rightX,
      rightY,
      leftTrigger,
      rightTrigger,
      pressed: XBOX_BUTTONS.filter((_, index) => (bits >> index) & 1).map(
        (button) => button.python,
      ),
    },
  };
}

export interface ControllerSnapshot {
  readonly status: ControllerStatus;
  readonly values: ControllerValues | null;
  /** When the last values arrived, ms since the Unix epoch; 0 before any. */
  readonly valuesAt: number;
  /** For `ended`: what the controller was doing when the program ended. */
  readonly endedFrom?: 'searching' | 'connected';
}

export const IDLE_CONTROLLER: ControllerSnapshot = Object.freeze({
  status: 'idle',
  values: null,
  valuesAt: 0,
});

/** The controller as the latest `@xbx` lines describe it. */
export class ControllerTracker {
  #snapshot: ControllerSnapshot = IDLE_CONTROLLER;

  get snapshot(): ControllerSnapshot {
    return this.#snapshot;
  }

  /**
   * Takes one stdout line. Returns true for every `@xbx` line, which belongs to the controller and
   * not to the text monitor (a malformed one is dropped); false for any other line.
   */
  push(line: string, time: number): boolean {
    const parsed = parseControllerLine(line);
    if (!parsed) return line.trim().split(/\s+/)[0] === CONTROLLER_LINE_PREFIX;
    if (parsed.kind === 'values') {
      this.#snapshot = { status: 'connected', values: parsed.values, valuesAt: time };
    } else if (parsed.status === 'searching') {
      this.#snapshot = { status: 'searching', values: null, valuesAt: 0 };
    } else {
      this.#snapshot = { ...this.#snapshot, status: parsed.status };
    }
    return true;
  }

  /** The program stopped: a connected or searching controller is no longer read. */
  end(): void {
    const { status } = this.#snapshot;
    if (status === 'connected' || status === 'searching') {
      this.#snapshot = { ...this.#snapshot, status: 'ended', endedFrom: status };
    }
  }
}
