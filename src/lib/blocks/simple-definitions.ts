/**
 * The simple blocks (docs/adr/0010-simple-blocks.md): blocks for children who are starting out,
 * in the spirit of the LEGO SPIKE app's word blocks but MatPilot's own. They choose devices by
 * port instead of by name, and set angles, steering, speeds, colours and pictures with pictures
 * instead of bare numbers (./fields/).
 *
 * The Python each block makes is in ./simple-generator.ts; the Pybricks names it uses are cited
 * in ./pybricks.ts. The detailed blocks in ./definitions.ts stay as they are.
 */
import type { BlockJson } from './definitions';
import { FIELD_TYPES } from './fields';
import {
  BACKWARD,
  CLOCKWISE,
  COUNTERCLOCKWISE,
  FORWARD,
  icon,
  swatch,
  type Picture,
} from './fields/images';
import { SMILE_MATRIX } from './fields/matrix-value';
import { LIGHT_COLOR_OPTIONS, SENSOR_COLOR_OPTIONS, type Option } from './pybricks';

/** Block style names; the colours live in ./theme.ts. */
export const SIMPLE_STYLE = {
  movement: 'mp_movement_blocks',
  motor: 'mp_motor_blocks',
  light: 'mp_light_blocks',
  sound: 'mp_sound_blocks',
  sensor: 'mp_sensor_blocks',
  flow: 'loop_blocks',
} as const;

/** Shadow blocks that hold one picture number field. */
export const SHADOW = {
  turn: 'mp_turn_angle',
  steering: 'mp_steering',
  percent: 'mp_percent',
} as const;

/** Notes for "play note", middle C up an octave; equal temperament, A = 440 Hz, rounded. */
export const NOTE_OPTIONS: readonly Option[] = [
  ['C (do)', '262'],
  ['D (re)', '294'],
  ['E (mi)', '330'],
  ['F (fa)', '349'],
  ['G (sol)', '392'],
  ['A (la)', '440'],
  ['B (ti)', '494'],
  ['high C (do)', '523'],
];

const MOVE_UNITS: readonly Option[] = [
  ['rotations', 'ROTATIONS'],
  ['mm', 'MM'],
  ['seconds', 'SECONDS'],
];

const MOTOR_UNITS: readonly Option[] = [
  ['rotations', 'ROTATIONS'],
  ['degrees', 'DEGREES'],
  ['seconds', 'SECONDS'],
];

const pictures = (name: string, options: readonly (readonly [Picture, string])[]) => ({
  type: 'field_dropdown',
  name,
  options: options.map(([picture, value]) => [picture, value]),
});

const dropdown = (name: string, options: readonly Option[]) => ({
  type: 'field_dropdown',
  name,
  options: options.map(([label, value]) => [label, value]),
});

const port = (kind: 'motor' | 'color' | 'distance' | 'force', value: string) => ({
  type: FIELD_TYPES.port,
  name: 'PORT',
  value,
  kind,
});

const number = (name: string) => ({ type: 'input_value', name, check: 'Number' });

const statement = (block: BlockJson): BlockJson => ({
  previousStatement: null,
  nextStatement: null,
  inputsInline: true,
  ...block,
});

const reporter = (block: BlockJson, check: 'Number' | 'Boolean'): BlockJson => ({
  output: check,
  inputsInline: true,
  ...block,
});

const DIRECTION = pictures('DIRECTION', [
  [FORWARD, 'FORWARD'],
  [BACKWARD, 'BACKWARD'],
]);

const ROTATION = pictures('DIRECTION', [
  [CLOCKWISE, 'CLOCKWISE'],
  [COUNTERCLOCKWISE, 'COUNTERCLOCKWISE'],
]);

const LIGHT_SWATCHES = pictures(
  'COLOR',
  LIGHT_COLOR_OPTIONS.map(([label, value]) => [swatch(value, label), value] as const),
);

const SENSOR_SWATCHES = pictures(
  'COLOR',
  SENSOR_COLOR_OPTIONS.map(([label, value]) => [swatch(value, label), value] as const),
);

const COLUMNS: readonly Option[] = ['1', '2', '3', '4', '5'].map((n) => [n, n] as const);

export const SIMPLE_BLOCK_DEFINITIONS: readonly BlockJson[] = [
  // --- Shadows with a picture field ------------------------------------------
  reporter(
    {
      type: SHADOW.turn,
      message0: '%1',
      args0: [{ type: FIELD_TYPES.turn, name: 'ANGLE', value: 90 }],
      style: SIMPLE_STYLE.movement,
      tooltip: 'How far to turn. Tap to set it on a dial.',
    },
    'Number',
  ),
  reporter(
    {
      type: SHADOW.steering,
      message0: '%1',
      args0: [{ type: FIELD_TYPES.steering, name: 'STEERING', value: 30 }],
      style: SIMPLE_STYLE.movement,
      tooltip: 'Steering from -100 (spin left) to 100 (spin right). Tap to see the path.',
    },
    'Number',
  ),
  reporter(
    {
      type: SHADOW.percent,
      message0: '%1',
      args0: [{ type: FIELD_TYPES.throttle, name: 'PERCENT', value: 50 }],
      style: SIMPLE_STYLE.motor,
      tooltip: 'A percentage. Tap to set it with a lever.',
    },
    'Number',
  ),

  // --- Movement ----------------------------------------------------------------
  statement({
    type: 'mp_move_motors',
    message0: '%1 set movement motors %2',
    args0: [icon('movement'), { type: FIELD_TYPES.portPair, name: 'PORTS', value: 'AB' }],
    style: SIMPLE_STYLE.movement,
    tooltip:
      'Which ports the left and right wheel motors are plugged into. Without this block, left is A and right is B.',
  }),
  statement({
    type: 'mp_move_wheels',
    message0: '%1 set wheel size %2 mm, wheels %3 mm apart',
    args0: [
      icon('movement'),
      { type: 'field_number', name: 'WHEEL', value: 56, min: 10, max: 300, precision: 1 },
      { type: 'field_number', name: 'TRACK', value: 112, min: 10, max: 500, precision: 1 },
    ],
    style: SIMPLE_STYLE.movement,
    tooltip:
      'Measure your robot: the wheel from edge to edge, and the distance between the middles of the two wheels. Turns and millimetres are only right when these are.',
  }),
  statement({
    type: 'mp_move',
    message0: '%1 move %2 for %3 %4',
    args0: [icon('movement'), DIRECTION, number('AMOUNT'), dropdown('UNIT', MOVE_UNITS)],
    style: SIMPLE_STYLE.movement,
    tooltip: 'Drives straight, then stops. The program waits until the robot has stopped.',
  }),
  statement({
    type: 'mp_move_turn',
    message0: '%1 turn %2',
    args0: [icon('movement'), number('ANGLE')],
    style: SIMPLE_STYLE.movement,
    tooltip:
      'Turns on the spot by this angle: right is clockwise seen from above. The program waits until the turn is done.',
  }),
  statement({
    type: 'mp_move_start',
    message0: '%1 start moving %2',
    args0: [icon('movement'), DIRECTION],
    style: SIMPLE_STYLE.movement,
    tooltip: 'Starts driving straight and keeps going while the next blocks run.',
  }),
  statement({
    type: 'mp_move_start_steering',
    message0: '%1 start moving, steering %2',
    args0: [icon('movement'), number('STEERING')],
    style: SIMPLE_STYLE.movement,
    tooltip:
      'Starts driving in a curve and keeps going while the next blocks run. 0 is straight, 50 stops the inner wheel, 100 spins on the spot.',
  }),
  statement({
    type: 'mp_move_stop',
    message0: '%1 stop moving',
    args0: [icon('movement')],
    style: SIMPLE_STYLE.movement,
    tooltip: 'Stops the robot.',
  }),
  // The drive base's own default is 40 % of its top speed (cited in ./pybricks.ts).
  statement({
    type: 'mp_move_speed',
    message0: '%1 set movement speed to %2',
    args0: [icon('movement'), number('SPEED')],
    style: SIMPLE_STYLE.movement,
    tooltip:
      'How fast the robot drives and turns, as a share of its top speed (at least 5 %). Until this block runs, it drives at 40 %.',
  }),

  // --- Motors ------------------------------------------------------------------
  statement({
    type: 'mp_motor_run_for',
    message0: '%1 motor %2 run %3 for %4 %5',
    args0: [
      icon('motor'),
      port('motor', 'A'),
      ROTATION,
      number('AMOUNT'),
      dropdown('UNIT', MOTOR_UNITS),
    ],
    style: SIMPLE_STYLE.motor,
    tooltip: 'Turns the motor, then stops it. The program waits until it is done.',
  }),
  statement({
    type: 'mp_motor_start',
    message0: '%1 motor %2 start %3',
    args0: [icon('motor'), port('motor', 'A'), ROTATION],
    style: SIMPLE_STYLE.motor,
    tooltip: 'Starts the motor and keeps it turning while the next blocks run.',
  }),
  statement({
    type: 'mp_motor_stop_simple',
    message0: '%1 motor %2 stop',
    args0: [icon('motor'), port('motor', 'A')],
    style: SIMPLE_STYLE.motor,
    tooltip: 'Stops the motor.',
  }),
  statement({
    type: 'mp_motor_set_speed',
    message0: '%1 set motor %2 speed to %3',
    args0: [icon('motor'), port('motor', 'A'), number('SPEED')],
    style: SIMPLE_STYLE.motor,
    tooltip:
      'How fast this motor turns from now on, as a share of its top speed. Until this block runs, it turns at 50 %.',
  }),
  reporter(
    {
      type: 'mp_motor_position',
      message0: '%1 motor %2 position (°)',
      args0: [icon('motor'), port('motor', 'A')],
      style: SIMPLE_STYLE.motor,
      tooltip: 'How far the motor has turned, in degrees.',
    },
    'Number',
  ),
  statement({
    type: 'mp_motor_reset_position',
    message0: '%1 set motor %2 position to 0',
    args0: [icon('motor'), port('motor', 'A')],
    style: SIMPLE_STYLE.motor,
    tooltip: 'Counts the position from here.',
  }),

  // --- Light -------------------------------------------------------------------
  statement({
    type: 'mp_light_show_for',
    message0: '%1 show %2 for %3 seconds',
    args0: [
      icon('light'),
      { type: FIELD_TYPES.matrix, name: 'PICTURE', value: SMILE_MATRIX },
      number('SECONDS'),
    ],
    style: SIMPLE_STYLE.light,
    tooltip: 'Shows the picture on the hub’s lights, waits, then turns the lights off.',
  }),
  statement({
    type: 'mp_light_show',
    message0: '%1 show %2',
    args0: [icon('light'), { type: FIELD_TYPES.matrix, name: 'PICTURE', value: SMILE_MATRIX }],
    style: SIMPLE_STYLE.light,
    tooltip: 'Shows the picture on the hub’s lights. Tap the picture to draw your own.',
  }),
  statement({
    type: 'mp_light_write',
    message0: '%1 write %2',
    args0: [icon('light'), { type: 'input_value', name: 'TEXT' }],
    style: SIMPLE_STYLE.light,
    tooltip: 'Scrolls the text across the hub’s lights. The program waits until it has scrolled.',
  }),
  statement({
    type: 'mp_light_off',
    message0: '%1 turn off the lights',
    args0: [icon('light')],
    style: SIMPLE_STYLE.light,
    tooltip: 'Turns the hub’s 5×5 lights off.',
  }),
  statement({
    type: 'mp_light_pixel',
    message0: '%1 light column %2 row %3 at %4',
    args0: [
      icon('light'),
      dropdown('COLUMN', COLUMNS),
      dropdown('ROW', COLUMNS),
      number('BRIGHTNESS'),
    ],
    style: SIMPLE_STYLE.light,
    tooltip: 'Lights one light. Column 1 is on the left, row 1 at the top.',
  }),
  statement({
    type: 'mp_light_button',
    message0: '%1 set button light to %2',
    args0: [icon('light'), LIGHT_SWATCHES],
    style: SIMPLE_STYLE.light,
    tooltip: 'Lights the hub’s centre button in this colour.',
  }),
  statement({
    type: 'mp_light_button_off',
    message0: '%1 turn off the button light',
    args0: [icon('light')],
    style: SIMPLE_STYLE.light,
    tooltip: 'Turns the centre button’s light off.',
  }),

  // --- Sound -------------------------------------------------------------------
  statement({
    type: 'mp_sound_note',
    message0: '%1 play note %2 for %3 seconds',
    args0: [icon('sound'), dropdown('NOTE', NOTE_OPTIONS), number('SECONDS')],
    style: SIMPLE_STYLE.sound,
    tooltip: 'Plays a note on the hub. The program waits until it ends.',
  }),
  statement({
    type: 'mp_sound_beep',
    message0: '%1 beep',
    args0: [icon('sound')],
    style: SIMPLE_STYLE.sound,
    tooltip: 'A short beep.',
  }),
  statement({
    type: 'mp_sound_volume',
    message0: '%1 set volume to %2',
    args0: [icon('sound'), number('VOLUME')],
    style: SIMPLE_STYLE.sound,
    tooltip: 'How loud the hub plays, from 0 to 100 %.',
  }),

  // --- Control -----------------------------------------------------------------
  statement({
    type: 'mp_wait_seconds',
    message0: 'wait %1 seconds',
    args0: [number('SECONDS')],
    style: SIMPLE_STYLE.flow,
    tooltip: 'Pauses the program. 0.5 is half a second.',
  }),

  // --- Sensors -----------------------------------------------------------------
  reporter(
    {
      type: 'mp_sensor_color_is',
      message0: '%1 colour sensor %2 sees %3',
      args0: [icon('colour'), port('color', 'D'), SENSOR_SWATCHES],
      style: SIMPLE_STYLE.sensor,
      tooltip: 'True when the colour sensor sees this colour.',
    },
    'Boolean',
  ),
  reporter(
    {
      type: 'mp_sensor_reflection',
      message0: '%1 colour sensor %2 reflection (%%)',
      args0: [icon('colour'), port('color', 'D')],
      style: SIMPLE_STYLE.sensor,
      tooltip: 'How much light the surface reflects: 0 is black, 100 is bright white.',
    },
    'Number',
  ),
  reporter(
    {
      type: 'mp_sensor_distance',
      message0: '%1 distance sensor %2 distance (mm)',
      args0: [icon('distance'), port('distance', 'E')],
      style: SIMPLE_STYLE.sensor,
      tooltip: 'Distance to the nearest thing in millimetres; 2000 when nothing is in range.',
    },
    'Number',
  ),
  reporter(
    {
      type: 'mp_sensor_closer',
      message0: '%1 distance sensor %2 is closer than %3 mm',
      args0: [icon('distance'), port('distance', 'E'), number('DISTANCE')],
      style: SIMPLE_STYLE.sensor,
      tooltip: 'True when something is closer than this many millimetres.',
    },
    'Boolean',
  ),
  reporter(
    {
      type: 'mp_sensor_pressed',
      message0: '%1 touch sensor %2 is pressed',
      args0: [icon('touch'), port('force', 'F')],
      style: SIMPLE_STYLE.sensor,
      tooltip: 'True while the button is pressed.',
    },
    'Boolean',
  ),
  reporter(
    {
      type: 'mp_sensor_force',
      message0: '%1 touch sensor %2 force (N)',
      args0: [icon('touch'), port('force', 'F')],
      style: SIMPLE_STYLE.sensor,
      tooltip: 'How hard the button is pressed, in newtons.',
    },
    'Number',
  ),
];

export const SIMPLE_BLOCK_TYPES: readonly string[] = SIMPLE_BLOCK_DEFINITIONS.map(
  (block) => block.type,
);
