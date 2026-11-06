/**
 * The Controller blocks (docs/adr/0012-controller-blocks.md): drive the robot, run a motor, or
 * check a button with an Xbox controller connected to the hub. Simple blocks (ADR 0010): one
 * block does one thing a child wants ("drive with the controller"), and they belong in a
 * "repeat forever" loop.
 *
 * The Python is in ./controller-generator.ts; the Pybricks names are cited in ./pybricks.ts.
 */
import { XBOX_BUTTONS } from '../controller/xbox';
import type { BlockJson } from './definitions';
import { FIELD_TYPES } from './fields';
import { controllerButton, icon } from './fields/images';
import type { Option } from './pybricks';

export const CONTROLLER_STYLE = 'mp_controller_blocks';

/** Driving styles: what the sticks and triggers do. */
export const DRIVE_STYLES: readonly Option[] = [
  ['one stick: the left stick drives', 'ONE_STICK'],
  ['two sticks: one for each side (tank)', 'TANK'],
  ['racing: RT go, LT back, left stick steers', 'RACING'],
];

/**
 * The values of the sticks and triggers, by index into the values the hub reads
 * (./controller-generator.ts): sticks -100 to 100 with up and right positive, triggers 0 to 100.
 */
export const CONTROLLER_VALUES = {
  LEFT_X: { label: 'left stick ↔', index: 0 },
  LEFT_Y: { label: 'left stick ↕', index: 1 },
  RIGHT_X: { label: 'right stick ↔', index: 2 },
  RIGHT_Y: { label: 'right stick ↕', index: 3 },
  LT: { label: 'left trigger LT', index: 4 },
  RT: { label: 'right trigger RT', index: 5 },
} as const;

export type ControllerValueName = keyof typeof CONTROLLER_VALUES;

/** What can run a motor: two buttons (forward and back), a stick, or the two triggers. */
export const MOTOR_SOURCES = {
  A_B: { label: 'A ↻ and B ↺', buttons: ['A', 'B'] },
  X_Y: { label: 'X ↻ and Y ↺', buttons: ['X', 'Y'] },
  RB_LB: { label: 'RB ↻ and LB ↺', buttons: ['RB', 'LB'] },
  UP_DOWN: { label: 'D-pad ↑ ↻ and ↓ ↺', buttons: ['UP', 'DOWN'] },
  RIGHT_LEFT: { label: 'D-pad → ↻ and ← ↺', buttons: ['RIGHT', 'LEFT'] },
  RIGHT_Y: { label: 'right stick ↕', value: 'RIGHT_Y' },
  RIGHT_X: { label: 'right stick ↔', value: 'RIGHT_X' },
  LEFT_Y: { label: 'left stick ↕', value: 'LEFT_Y' },
  LEFT_X: { label: 'left stick ↔', value: 'LEFT_X' },
  TRIGGERS: { label: 'triggers: RT ↻ and LT ↺', value: 'TRIGGERS' },
} as const;

export type MotorSourceName = keyof typeof MOTOR_SOURCES;

export const RUMBLES = {
  SHORT: { label: 'short', duration: 150, count: 1 },
  LONG: { label: 'long', duration: 500, count: 1 },
  TWICE: { label: 'twice', duration: 150, count: 2 },
} as const;

/**
 * Buttons a block may check. Menu always stops the program, and holding the Xbox button switches
 * the controller off, so neither is offered.
 */
export const CHECKABLE_BUTTONS = XBOX_BUTTONS.filter(
  (button) => button.python !== 'MENU' && button.python !== 'GUIDE',
);

const BUTTON_PICTURES = {
  type: 'field_dropdown',
  name: 'BUTTON',
  options: CHECKABLE_BUTTONS.map((button) => [
    controllerButton(button.python, button.label),
    button.python,
  ]),
};

const options = (name: string, entries: readonly (readonly [string, string])[]) => ({
  type: 'field_dropdown',
  name,
  options: entries.map(([label, value]) => [label, value]),
});

const statement = (block: BlockJson): BlockJson => ({
  previousStatement: null,
  nextStatement: null,
  inputsInline: true,
  style: CONTROLLER_STYLE,
  ...block,
});

const reporter = (block: BlockJson, check: 'Number' | 'Boolean'): BlockJson => ({
  output: check,
  inputsInline: true,
  style: CONTROLLER_STYLE,
  ...block,
});

export const CONTROLLER_BLOCK_DEFINITIONS: readonly BlockJson[] = [
  statement({
    type: 'mp_ctrl_drive',
    message0: '%1 drive with the controller: %2',
    args0: [icon('controller'), options('STYLE', DRIVE_STYLES)],
    tooltip:
      'Reads the controller and drives the robot (the movement motors) to match. Put it in “repeat forever”. Full stick is the movement speed; let go and the robot stops.',
  }),
  statement({
    type: 'mp_ctrl_motor',
    message0: '%1 motor %2 runs with %3',
    args0: [
      icon('controller'),
      { type: FIELD_TYPES.port, name: 'PORT', value: 'C', kind: 'motor' },
      options(
        'SOURCE',
        Object.entries(MOTOR_SOURCES).map(([value, source]) => [source.label, value] as const),
      ),
    ],
    tooltip:
      'Reads the controller and runs the motor at its speed: one way, the other way, or stopped and held. A stick or trigger runs it faster the further you push. Put it in “repeat forever”.',
  }),
  reporter(
    {
      type: 'mp_ctrl_pressed',
      message0: '%1 button %2 is pressed',
      args0: [icon('controller'), BUTTON_PICTURES],
      tooltip: 'True while the button is held down.',
    },
    'Boolean',
  ),
  reporter(
    {
      type: 'mp_ctrl_clicked',
      message0: '%1 button %2 was just pressed',
      args0: [icon('controller'), BUTTON_PICTURES],
      tooltip:
        'True once each time the button goes down, then false until it is let go and pressed again. Good for “press A to switch”.',
    },
    'Boolean',
  ),
  reporter(
    {
      type: 'mp_ctrl_value',
      message0: '%1 controller %2',
      args0: [
        icon('controller'),
        options(
          'VALUE',
          Object.entries(CONTROLLER_VALUES).map(([value, entry]) => [entry.label, value] as const),
        ),
      ],
      tooltip: 'A stick from -100 to 100 (up and right are positive), or a trigger from 0 to 100.',
    },
    'Number',
  ),
  statement({
    type: 'mp_ctrl_rumble',
    message0: '%1 rumble the controller %2',
    args0: [
      icon('controller'),
      options(
        'KIND',
        Object.entries(RUMBLES).map(([value, rumble]) => [rumble.label, value] as const),
      ),
    ],
    tooltip: 'Makes the controller shake in your hands.',
  }),
];

export const CONTROLLER_BLOCK_TYPES: readonly string[] = CONTROLLER_BLOCK_DEFINITIONS.map(
  (block) => block.type,
);
