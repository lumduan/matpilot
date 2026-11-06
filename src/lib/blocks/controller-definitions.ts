/**
 * The Controller blocks (docs/adr/0012-controller-blocks.md): drive the robot, run motors, or
 * check a button with a controller connected to the hub. Simple blocks (ADR 0010): one block does
 * one thing a child wants ("drive with the controller"), and they belong in "repeat forever".
 *
 * Buttons, sticks and triggers are picked on a drawing of the controller (./fields/controller.ts),
 * which also says which finger reaches them. "use the controller" chooses the controller; only
 * the Xbox controller connects to a SPIKE Prime hub for now (../controller/layout.ts).
 *
 * The Python is in ./controller-generator.ts; the Pybricks names are cited in ./pybricks.ts.
 */
import { DEFAULT_CONTROLLER } from '../controller/layout';
import type { BlockJson } from './definitions';
import { FIELD_TYPES } from './fields';
import { icon } from './fields/images';
import type { Option } from './pybricks';

export const CONTROLLER_STYLE = 'mp_controller_blocks';

/** Driving styles: what the sticks and triggers do. */
export const DRIVE_STYLES: readonly Option[] = [
  ['one stick: the left stick drives', 'ONE_STICK'],
  ['two sticks: one for each side (tank)', 'TANK'],
  ['racing: RT go, LT back, left stick steers', 'RACING'],
];

export const RUMBLES = {
  SHORT: { label: 'short', duration: 150, count: 1 },
  LONG: { label: 'long', duration: 500, count: 1 },
  TWICE: { label: 'twice', duration: 150, count: 2 },
} as const;

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

const buttonField = { type: FIELD_TYPES.controllerButton, name: 'BUTTON', value: 'A' };

export const CONTROLLER_BLOCK_DEFINITIONS: readonly BlockJson[] = [
  statement({
    type: 'mp_ctrl_use',
    message0: '%1 use the controller %2',
    args0: [
      icon('controller'),
      { type: FIELD_TYPES.controller, name: 'CONTROLLER', value: DEFAULT_CONTROLLER },
    ],
    tooltip:
      'Which controller the program connects to. Tap it to see the controller. Without this block, the program uses the Xbox controller.',
  }),
  statement({
    type: 'mp_ctrl_drive',
    message0: '%1 drive with the controller: %2',
    args0: [
      icon('controller'),
      {
        type: 'field_dropdown',
        name: 'STYLE',
        options: DRIVE_STYLES.map(([label, value]) => [label, value]),
      },
    ],
    tooltip:
      'Reads the controller and drives the robot (the movement motors) to match. Put it in “repeat forever”. Full stick is the movement speed; let go and the robot stops.',
  }),
  statement({
    type: 'mp_ctrl_motor',
    message0: '%1 %2 runs motors %3',
    args0: [
      icon('controller'),
      { type: FIELD_TYPES.controllerInput, name: 'SOURCE', value: 'A_B', mode: 'drives' },
      { type: FIELD_TYPES.motorSet, name: 'MOTORS', value: 'C+' },
    ],
    tooltip:
      'Reads the controller and runs the motors at their speed: one way, the other way, or stopped and held. A stick or trigger runs them faster the further you push. Tap the motors to choose them and their direction. Put it in “repeat forever”.',
  }),
  reporter(
    {
      type: 'mp_ctrl_pressed',
      message0: '%1 button %2 is pressed',
      args0: [icon('controller'), buttonField],
      tooltip: 'True while the button is held down. Tap the button to see where it is.',
    },
    'Boolean',
  ),
  reporter(
    {
      type: 'mp_ctrl_clicked',
      message0: '%1 button %2 was just pressed',
      args0: [icon('controller'), buttonField],
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
        { type: FIELD_TYPES.controllerInput, name: 'VALUE', value: 'LEFT_Y', mode: 'number' },
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
      {
        type: 'field_dropdown',
        name: 'KIND',
        options: Object.entries(RUMBLES).map(([value, rumble]) => [rumble.label, value]),
      },
    ],
    tooltip: 'Makes the controller shake in your hands.',
  }),
];

export const CONTROLLER_BLOCK_TYPES: readonly string[] = CONTROLLER_BLOCK_DEFINITIONS.map(
  (block) => block.type,
);
