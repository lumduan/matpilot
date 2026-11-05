/**
 * MatPilot's own blocks (ADR 0008), as Blockly JSON definitions. Each block is one Pybricks call;
 * the calls and their sources are listed in ./pybricks.ts, and the Python each block produces is
 * in ./generator.ts. Blockly's built-in blocks (logic, loops, maths, text, variables) are used
 * as they are, except where ./generator.ts overrides their Python.
 */
import {
  BUTTON_OPTIONS,
  DEVICES,
  DIRECTION_OPTIONS,
  ICON_OPTIONS,
  LIGHT_COLOR_OPTIONS,
  PORTS,
  SENSOR_COLOR_OPTIONS,
  THEN_OPTIONS,
  TILT_OPTIONS,
  type DeviceType,
  type Option,
} from './pybricks';

/** Block style names; the colours live in ./theme.ts. */
export const STYLE = {
  setup: 'mp_setup_blocks',
  start: 'mp_start_blocks',
  output: 'mp_output_blocks',
  input: 'mp_input_blocks',
  flow: 'loop_blocks',
  other: 'mp_other_blocks',
} as const;

/** Connection check that keeps device set-up blocks inside the "set up" block. */
export const SETUP_CHECK = 'mp_setup';

export type BlockJson = Record<string, unknown> & { readonly type: string };

const dropdown = (name: string, options: readonly Option[]) => ({
  type: 'field_dropdown',
  name,
  options: options.map(([label, value]) => [label, value]),
});

const deviceField = (name: string, type: DeviceType) => ({
  type: 'field_variable',
  name,
  variable: DEVICES[type].defaultName,
  variableTypes: [type],
  defaultType: type,
});

const portField = () =>
  dropdown(
    'PORT',
    PORTS.map((port) => [port, port] as const),
  );

const number = (name: string) => ({ type: 'input_value', name, check: 'Number' });

const statement = (block: BlockJson): BlockJson => ({
  previousStatement: null,
  nextStatement: null,
  inputsInline: true,
  ...block,
});

const value = (block: BlockJson, check: 'Number' | 'Boolean'): BlockJson => ({
  output: check,
  inputsInline: true,
  ...block,
});

const setup = (type: string, device: DeviceType, label: string, extra: object[] = []) => ({
  type,
  // Reads like the Python it makes: `motor = Motor(MOTOR_PORT)`.
  message0: `%1 = ${label} on port %2${extra.length > 0 ? ' forward %3' : ''}`,
  args0: [deviceField('VAR', device), portField(), ...extra],
  previousStatement: SETUP_CHECK,
  nextStatement: SETUP_CHECK,
  style: STYLE.setup,
  tooltip: `Creates the ${label} once, before the program starts. Other blocks use it by name.`,
});

export const BLOCK_DEFINITIONS: readonly BlockJson[] = [
  // --- Setup ---------------------------------------------------------------
  {
    type: 'mp_setup',
    message0: 'set up %1 %2',
    args0: [
      { type: 'input_dummy' },
      { type: 'input_statement', name: 'DEVICES', check: SETUP_CHECK },
    ],
    style: STYLE.setup,
    tooltip: 'Put your motors and sensors here. They are created once, before the program starts.',
  },
  setup('mp_setup_motor', 'Motor', 'motor', [dropdown('DIRECTION', DIRECTION_OPTIONS)]),
  setup('mp_setup_color_sensor', 'ColorSensor', 'colour sensor'),
  setup('mp_setup_ultrasonic_sensor', 'UltrasonicSensor', 'distance sensor'),
  setup('mp_setup_force_sensor', 'ForceSensor', 'touch sensor'),
  {
    type: 'mp_program',
    message0: 'when the program starts',
    nextStatement: null,
    style: STYLE.start,
    tooltip:
      'The program runs these blocks from top to bottom. When it ends, or you press Stop, every motor stops.',
  },

  // --- Output: motors --------------------------------------------------------
  statement({
    type: 'mp_motor_run',
    message0: '%1 run at %2 °/s',
    args0: [deviceField('MOTOR', 'Motor'), number('SPEED')],
    style: STYLE.output,
    tooltip: 'Keeps turning at this speed (degrees per second) until another motor block.',
  }),
  statement({
    type: 'mp_motor_run_angle',
    message0: '%1 run at %2 °/s for %3 ° then %4 %5',
    args0: [
      deviceField('MOTOR', 'Motor'),
      number('SPEED'),
      number('ANGLE'),
      dropdown('THEN', THEN_OPTIONS),
      dropdown('WAIT', [
        ['and wait', 'TRUE'],
        ['without waiting', 'FALSE'],
      ]),
    ],
    style: STYLE.output,
    tooltip: 'Turns by this many degrees. "and wait" waits until the move is done.',
  }),
  statement({
    type: 'mp_motor_run_target',
    message0: '%1 run at %2 °/s to angle %3 ° then %4 %5',
    args0: [
      deviceField('MOTOR', 'Motor'),
      number('SPEED'),
      number('TARGET'),
      dropdown('THEN', THEN_OPTIONS),
      dropdown('WAIT', [
        ['and wait', 'TRUE'],
        ['without waiting', 'FALSE'],
      ]),
    ],
    style: STYLE.output,
    tooltip: 'Turns to this angle (degrees), measured from where the angle was last reset.',
  }),
  statement({
    type: 'mp_motor_run_time',
    message0: '%1 run at %2 °/s for %3 ms then %4 %5',
    args0: [
      deviceField('MOTOR', 'Motor'),
      number('SPEED'),
      number('TIME'),
      dropdown('THEN', THEN_OPTIONS),
      dropdown('WAIT', [
        ['and wait', 'TRUE'],
        ['without waiting', 'FALSE'],
      ]),
    ],
    style: STYLE.output,
    tooltip: 'Turns for this many milliseconds.',
  }),
  statement({
    type: 'mp_motor_dc',
    message0: '%1 power %2 %%',
    args0: [deviceField('MOTOR', 'Motor'), number('DUTY')],
    style: STYLE.output,
    tooltip: 'Drives the motor at a power from -100 to 100 %, without speed control.',
  }),
  statement({
    type: 'mp_motor_stop',
    message0: '%1 %2',
    args0: [
      deviceField('MOTOR', 'Motor'),
      dropdown('MODE', [
        ['stop (coast)', 'stop'],
        ['brake', 'brake'],
        ['hold position', 'hold'],
      ]),
    ],
    style: STYLE.output,
    tooltip:
      'Coast lets the motor spin freely, brake slows it down passively, hold keeps it in place.',
  }),
  statement({
    type: 'mp_motor_reset_angle',
    message0: 'set %1 angle to %2 °',
    args0: [deviceField('MOTOR', 'Motor'), number('ANGLE')],
    style: STYLE.output,
    tooltip: 'Makes the current position count as this angle.',
  }),

  // --- Output: hub -----------------------------------------------------------
  statement({
    type: 'mp_hub_light_on',
    message0: 'hub light %1',
    args0: [dropdown('COLOR', LIGHT_COLOR_OPTIONS)],
    style: STYLE.output,
    tooltip: 'Turns the hub’s button light on in this colour.',
  }),
  statement({
    type: 'mp_hub_light_off',
    message0: 'hub light off',
    style: STYLE.output,
    tooltip: 'Turns the hub’s button light off.',
  }),
  statement({
    type: 'mp_hub_display_icon',
    message0: 'hub display %1',
    args0: [dropdown('ICON', ICON_OPTIONS)],
    style: STYLE.output,
    tooltip: 'Shows a picture on the hub’s 5×5 lights.',
  }),
  statement({
    type: 'mp_hub_display_number',
    message0: 'hub display number %1',
    args0: [number('NUMBER')],
    style: STYLE.output,
    tooltip: 'Shows a number from -99 to 99 on the hub’s lights.',
  }),
  statement({
    type: 'mp_hub_display_text',
    message0: 'hub display text %1',
    args0: [{ type: 'input_value', name: 'TEXT' }],
    style: STYLE.output,
    tooltip: 'Scrolls text across the hub’s lights. The program waits until it has scrolled.',
  }),
  statement({
    type: 'mp_hub_display_off',
    message0: 'hub display off',
    style: STYLE.output,
    tooltip: 'Turns the hub’s 5×5 lights off.',
  }),
  statement({
    type: 'mp_hub_beep',
    message0: 'beep %1 Hz for %2 ms',
    args0: [number('FREQUENCY'), number('DURATION')],
    style: STYLE.output,
    tooltip: 'Plays a tone. The program waits until it ends.',
  }),

  // --- Input -------------------------------------------------------------------
  value(
    {
      type: 'mp_motor_angle',
      message0: '%1 angle (°)',
      args0: [deviceField('MOTOR', 'Motor')],
      style: STYLE.input,
      tooltip: 'The motor’s angle in degrees.',
    },
    'Number',
  ),
  value(
    {
      type: 'mp_motor_speed',
      message0: '%1 speed (°/s)',
      args0: [deviceField('MOTOR', 'Motor')],
      style: STYLE.input,
      tooltip: 'The motor’s speed in degrees per second.',
    },
    'Number',
  ),
  value(
    {
      type: 'mp_color_sees',
      message0: '%1 sees %2',
      args0: [deviceField('SENSOR', 'ColorSensor'), dropdown('COLOR', SENSOR_COLOR_OPTIONS)],
      style: STYLE.input,
      tooltip: 'True when the colour sensor sees this colour.',
    },
    'Boolean',
  ),
  value(
    {
      type: 'mp_color_reflection',
      message0: '%1 reflection (%%)',
      args0: [deviceField('SENSOR', 'ColorSensor')],
      style: STYLE.input,
      tooltip: 'How much light a surface reflects, 0 to 100 %.',
    },
    'Number',
  ),
  value(
    {
      type: 'mp_color_ambient',
      message0: '%1 ambient light (%%)',
      args0: [deviceField('SENSOR', 'ColorSensor')],
      style: STYLE.input,
      tooltip: 'How bright the surroundings are, 0 to 100 %.',
    },
    'Number',
  ),
  value(
    {
      type: 'mp_ultrasonic_distance',
      message0: '%1 distance (mm)',
      args0: [deviceField('SENSOR', 'UltrasonicSensor')],
      style: STYLE.input,
      tooltip: 'Distance to the nearest object in millimetres; 2000 when nothing is in range.',
    },
    'Number',
  ),
  value(
    {
      type: 'mp_force_force',
      message0: '%1 force (N)',
      args0: [deviceField('SENSOR', 'ForceSensor')],
      style: STYLE.input,
      tooltip: 'How hard the button is pressed, in newtons.',
    },
    'Number',
  ),
  value(
    {
      type: 'mp_force_pressed',
      message0: '%1 is pressed',
      args0: [deviceField('SENSOR', 'ForceSensor')],
      style: STYLE.input,
      tooltip: 'True when the button is pressed with at least 3 newtons.',
    },
    'Boolean',
  ),
  value(
    {
      type: 'mp_force_touched',
      message0: '%1 is touched',
      args0: [deviceField('SENSOR', 'ForceSensor')],
      style: STYLE.input,
      tooltip: 'True when the button is touched, however lightly.',
    },
    'Boolean',
  ),
  value(
    {
      type: 'mp_hub_button',
      message0: 'hub %1 button is pressed',
      args0: [dropdown('BUTTON', BUTTON_OPTIONS)],
      style: STYLE.input,
      tooltip: 'True while the button is held. The centre button stops the program.',
    },
    'Boolean',
  ),
  value(
    {
      type: 'mp_hub_tilt',
      message0: 'hub tilt %1 (°)',
      args0: [dropdown('AXIS', TILT_OPTIONS)],
      style: STYLE.input,
      tooltip:
        'How far the hub is tilted, in degrees. Pitch is forward and back, roll is sideways.',
    },
    'Number',
  ),
  value(
    {
      type: 'mp_timer',
      message0: 'timer (ms)',
      style: STYLE.input,
      tooltip: 'Milliseconds since the program started, or since the timer was reset.',
    },
    'Number',
  ),
  statement({
    type: 'mp_timer_reset',
    message0: 'reset timer',
    style: STYLE.input,
    tooltip: 'Starts the timer again from 0.',
  }),

  // --- Flow --------------------------------------------------------------------
  statement({
    type: 'mp_wait',
    message0: 'wait %1 ms',
    args0: [number('TIME')],
    style: STYLE.flow,
    tooltip: 'Pauses the program for this many milliseconds (1000 ms = 1 second).',
  }),
  statement({
    type: 'mp_wait_until',
    message0: 'wait until %1',
    args0: [{ type: 'input_value', name: 'CONDITION', check: 'Boolean' }],
    style: STYLE.flow,
    tooltip: 'Pauses the program until the condition is true. It checks every 10 ms.',
  }),
  {
    type: 'mp_forever',
    message0: 'repeat forever %1 %2',
    args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
    previousStatement: null,
    style: STYLE.flow,
    tooltip: 'Repeats the blocks inside until the program is stopped.',
  },
  {
    type: 'mp_stop_program',
    message0: 'stop the program',
    previousStatement: null,
    style: STYLE.flow,
    tooltip: 'Ends the program here. Every motor stops.',
  },

  // --- Other -------------------------------------------------------------------
  statement({
    type: 'mp_print',
    message0: 'print %1',
    args0: [{ type: 'input_value', name: 'VALUE' }],
    style: STYLE.other,
    tooltip: 'Shows the value in the Monitor.',
  }),
  statement({
    type: 'mp_plot',
    message0: 'plot %1 = %2',
    args0: [
      { type: 'field_input', name: 'LABEL', text: 'value' },
      { type: 'input_value', name: 'VALUE', check: 'Number' },
    ],
    style: STYLE.other,
    tooltip:
      'Prints "name: value". The Plotter draws one line per name; the Monitor shows the text.',
  }),
];

/** Every block type MatPilot defines. */
export const MATPILOT_BLOCK_TYPES: readonly string[] = BLOCK_DEFINITIONS.map((block) => block.type);

/**
 * Plot labels must survive the plotter's parser (src/lib/monitor/plot.ts), which splits on
 * spaces, commas and semicolons, and treats ":" and "=" as the separator.
 */
export function cleanPlotLabel(text: string): string {
  const cleaned = text
    .trim()
    .replace(/[\s,;:=]+/g, '_')
    .replace(/["\\]/g, '');
  return cleaned === '' ? 'value' : cleaned.slice(0, 24);
}
