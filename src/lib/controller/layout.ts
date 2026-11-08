/**
 * Controllers the blocks can use, and how each one looks (ADR 0012). One profile per controller;
 * the pickers on the blocks and the page's Controller pane draw from the same layout, so a button
 * is in the same place everywhere. Only the Xbox controller connects to a SPIKE Prime hub for now.
 *
 * Coordinates are in a 320 × 186 drawing, seen from the front, triggers and bumpers on top.
 */
import { XBOX_BUTTONS, type XboxButtonName } from './xbox';

export type ControllerId = 'XBOX';

/** Which finger reaches a control when you hold the controller. */
export type Finger = 'left thumb' | 'right thumb' | 'left index finger' | 'right index finger';

export interface PadKey {
  readonly button: XboxButtonName;
  readonly label: string;
  /** Short text on the key. */
  readonly text: string;
  readonly shape: 'face' | 'round' | 'bumper' | 'dpad';
  readonly x: number;
  readonly y: number;
  /** Face buttons: the colour printed on the controller. */
  readonly colour?: string;
  readonly finger: Finger | null;
}

export interface PadStick {
  readonly side: 'left' | 'right';
  readonly cx: number;
  readonly cy: number;
  /** Pressing the stick in. */
  readonly click: XboxButtonName;
  readonly finger: Finger;
}

export interface PadTrigger {
  readonly side: 'left' | 'right';
  readonly label: 'LT' | 'RT';
  readonly x: number;
  readonly y: number;
  readonly finger: Finger;
}

export interface ControllerProfile {
  readonly id: ControllerId;
  readonly name: string;
  readonly short: string;
  readonly pairing: string;
  readonly body: string;
  readonly keys: readonly PadKey[];
  readonly sticks: readonly PadStick[];
  readonly triggers: readonly PadTrigger[];
}

const label = (button: XboxButtonName) =>
  XBOX_BUTTONS.find((entry) => entry.python === button)?.label ?? button;

const DPAD_X = 128;
const DPAD_Y = 112;

export const XBOX_PROFILE: ControllerProfile = {
  id: 'XBOX',
  name: 'Xbox Wireless Controller',
  short: 'Xbox',
  pairing:
    'The first time: press Run, then hold its pair button until the Xbox button flashes fast. After that the hub remembers it: press Run and turn the controller on with its Xbox button. Used with something else since (a console, a phone, a computer)? Pair it again.',
  body: 'M92 40h136c34 0 58 20 64 54l10 54c3 22-20 32-35 17l-27-27H80l-27 27c-15 15-38 5-35-17l10-54c6-34 30-54 64-54z',
  keys: [
    {
      button: 'Y',
      text: 'Y',
      shape: 'face',
      x: 232,
      y: 60,
      colour: '#e2ad00',
      finger: 'right thumb',
    },
    {
      button: 'X',
      text: 'X',
      shape: 'face',
      x: 215,
      y: 77,
      colour: '#2f6fd6',
      finger: 'right thumb',
    },
    {
      button: 'B',
      text: 'B',
      shape: 'face',
      x: 249,
      y: 77,
      colour: '#d83b3b',
      finger: 'right thumb',
    },
    {
      button: 'A',
      text: 'A',
      shape: 'face',
      x: 232,
      y: 94,
      colour: '#2e9e44',
      finger: 'right thumb',
    },
    { button: 'LB', text: 'LB', shape: 'bumper', x: 90, y: 30, finger: 'left index finger' },
    { button: 'RB', text: 'RB', shape: 'bumper', x: 230, y: 30, finger: 'right index finger' },
    { button: 'VIEW', text: 'View', shape: 'round', x: 141, y: 66, finger: 'left thumb' },
    { button: 'MENU', text: '☰', shape: 'round', x: 179, y: 66, finger: 'right thumb' },
    { button: 'GUIDE', text: '', shape: 'round', x: 160, y: 52, finger: null },
    { button: 'UP', text: '▲', shape: 'dpad', x: DPAD_X, y: DPAD_Y - 15, finger: 'left thumb' },
    { button: 'DOWN', text: '▼', shape: 'dpad', x: DPAD_X, y: DPAD_Y + 15, finger: 'left thumb' },
    { button: 'LEFT', text: '◀', shape: 'dpad', x: DPAD_X - 15, y: DPAD_Y, finger: 'left thumb' },
    { button: 'RIGHT', text: '▶', shape: 'dpad', x: DPAD_X + 15, y: DPAD_Y, finger: 'left thumb' },
  ].map((key) => ({ ...key, label: label(key.button as XboxButtonName) })) as PadKey[],
  sticks: [
    { side: 'left', cx: 92, cy: 78, click: 'LJ', finger: 'left thumb' },
    { side: 'right', cx: 192, cy: 112, click: 'RJ', finger: 'right thumb' },
  ],
  triggers: [
    { side: 'left', label: 'LT', x: 66, y: 6, finger: 'left index finger' },
    { side: 'right', label: 'RT', x: 206, y: 6, finger: 'right index finger' },
  ],
};

export const CONTROLLER_PROFILES: Readonly<Record<ControllerId, ControllerProfile>> = {
  XBOX: XBOX_PROFILE,
};

export const DEFAULT_CONTROLLER: ControllerId = 'XBOX';

export function controllerProfile(id: string | null | undefined): ControllerProfile {
  return CONTROLLER_PROFILES[(id ?? DEFAULT_CONTROLLER) as ControllerId] ?? XBOX_PROFILE;
}

/** The finger that presses a button, including the stick clicks. */
export function buttonFinger(profile: ControllerProfile, button: XboxButtonName): Finger | null {
  const key = profile.keys.find((entry) => entry.button === button);
  if (key) return key.finger;
  return profile.sticks.find((stick) => stick.click === button)?.finger ?? null;
}

/**
 * Something on the controller that can run motors or give a number: a button pair (one way, the
 * other way), a stick axis, the two triggers together, or one trigger.
 */
export type ControllerInput =
  | {
      readonly kind: 'pair';
      readonly forward: XboxButtonName;
      readonly backward: XboxButtonName;
    }
  | { readonly kind: 'axis'; readonly side: 'left' | 'right'; readonly axis: 'x' | 'y' }
  | { readonly kind: 'triggers' }
  | { readonly kind: 'trigger'; readonly side: 'left' | 'right' };

export interface InputOption {
  readonly value: string;
  readonly label: string;
  readonly input: ControllerInput;
  /** Can run motors (one way and the other). */
  readonly drives: boolean;
  /** Is a number (stick or trigger). */
  readonly number: boolean;
}

/** Every input, in the order the pickers list them. Values are stored in saved programs. */
export const INPUT_OPTIONS: readonly InputOption[] = [
  {
    value: 'A_B',
    label: 'A ↻ and B ↺',
    input: { kind: 'pair', forward: 'A', backward: 'B' },
    drives: true,
    number: false,
  },
  {
    value: 'X_Y',
    label: 'X ↻ and Y ↺',
    input: { kind: 'pair', forward: 'X', backward: 'Y' },
    drives: true,
    number: false,
  },
  {
    value: 'RB_LB',
    label: 'RB ↻ and LB ↺',
    input: { kind: 'pair', forward: 'RB', backward: 'LB' },
    drives: true,
    number: false,
  },
  {
    value: 'UP_DOWN',
    label: 'D-pad ▲ ↻ and ▼ ↺',
    input: { kind: 'pair', forward: 'UP', backward: 'DOWN' },
    drives: true,
    number: false,
  },
  {
    value: 'RIGHT_LEFT',
    label: 'D-pad ▶ ↻ and ◀ ↺',
    input: { kind: 'pair', forward: 'RIGHT', backward: 'LEFT' },
    drives: true,
    number: false,
  },
  {
    value: 'LEFT_Y',
    label: 'left stick ↕',
    input: { kind: 'axis', side: 'left', axis: 'y' },
    drives: true,
    number: true,
  },
  {
    value: 'LEFT_X',
    label: 'left stick ↔',
    input: { kind: 'axis', side: 'left', axis: 'x' },
    drives: true,
    number: true,
  },
  {
    value: 'RIGHT_Y',
    label: 'right stick ↕',
    input: { kind: 'axis', side: 'right', axis: 'y' },
    drives: true,
    number: true,
  },
  {
    value: 'RIGHT_X',
    label: 'right stick ↔',
    input: { kind: 'axis', side: 'right', axis: 'x' },
    drives: true,
    number: true,
  },
  {
    value: 'TRIGGERS',
    label: 'triggers RT ↻ and LT ↺',
    input: { kind: 'triggers' },
    drives: true,
    number: false,
  },
  {
    value: 'LT',
    label: 'left trigger LT',
    input: { kind: 'trigger', side: 'left' },
    drives: false,
    number: true,
  },
  {
    value: 'RT',
    label: 'right trigger RT',
    input: { kind: 'trigger', side: 'right' },
    drives: false,
    number: true,
  },
];

export function inputOption(value: string | null | undefined): InputOption | undefined {
  return INPUT_OPTIONS.find((option) => option.value === value);
}

/** The fingers an input needs. */
export function inputFingers(profile: ControllerProfile, input: ControllerInput): Finger[] {
  switch (input.kind) {
    case 'pair':
      return [
        ...new Set(
          [buttonFinger(profile, input.forward), buttonFinger(profile, input.backward)].filter(
            (finger): finger is Finger => finger !== null,
          ),
        ),
      ];
    case 'axis':
      return [profile.sticks.find((stick) => stick.side === input.side)?.finger ?? 'left thumb'];
    case 'triggers':
      return profile.triggers.map((trigger) => trigger.finger);
    case 'trigger':
      return [
        profile.triggers.find((trigger) => trigger.side === input.side)?.finger ??
          'left index finger',
      ];
  }
}

/** Driving styles of "drive with the controller", and the fingers each one keeps busy. */
export const DRIVE_FINGERS: Readonly<Record<string, readonly Finger[]>> = {
  ONE_STICK: ['left thumb'],
  TANK: ['left thumb', 'right thumb'],
  RACING: ['left thumb', 'left index finger', 'right index finger'],
};
