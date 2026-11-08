/**
 * What the Python editor suggests while typing, and what it shows when the pointer rests on a name
 * (ADR 0014): the Python each block makes, explained in plain words, with the block it becomes.
 * The units are the ones the blocks themselves show; the Pybricks calls are cited in
 * ../pybricks.ts. Each word's example is read back into its block by ./vocabulary.test.ts, so the
 * list cannot drift from what the converter accepts.
 */
import { XBOX_BUTTONS } from '../../controller/xbox';
import {
  BUTTON_OPTIONS,
  ICON_OPTIONS,
  LIGHT_COLOR_OPTIONS,
  PORTS,
  SENSOR_COLOR_OPTIONS,
  THEN_OPTIONS,
  type DeviceType,
} from '../pybricks';

export type WordKind =
  'function' | 'method' | 'variable' | 'constant' | 'keyword' | 'namespace' | 'property';

export interface Word {
  /** What is typed: `straight` after `robot.`, or `print` on its own. */
  readonly label: string;
  /** What goes into the editor; `${...}` marks a place to type next (a CodeMirror snippet). */
  readonly insert: string;
  readonly kind: WordKind;
  /** The shape of the call, shown next to the name: `(distance_mm)`. */
  readonly detail: string;
  /** What it does, in plain words. */
  readonly info: string;
  /** A line of Python that becomes the block (empty for names that are not a block alone). */
  readonly example: string;
  /** The block it becomes, as the block reads. */
  readonly block: string;
  /** That block's type, for the tests. */
  readonly blockType: string;
  /** Shown before others: the words a beginner needs most. */
  readonly boost?: number;
}

/** The names of this program, for suggestions: variables, devices, functions, tabs. */
export interface ProgramNames {
  /** The open tab's variables. */
  readonly variables: readonly string[];
  /** Shared variables (🌐), by Python name. */
  readonly shared: readonly string[];
  /** Devices set up in main. */
  readonly devices: readonly { readonly name: string; readonly type: DeviceType }[];
  /** Functions this tab may call: its own (tab null) and other tabs' (`tab.name`). */
  readonly functions: readonly {
    readonly name: string;
    readonly inputs: readonly string[];
    readonly tab: string | null;
  }[];
  /** The other tabs with functions, which this tab may use as `tab.function()`. */
  readonly tabs: readonly string[];
}

export const NO_NAMES: ProgramNames = {
  variables: [],
  shared: [],
  devices: [],
  functions: [],
  tabs: [],
};

const word = (
  label: string,
  kind: WordKind,
  detail: string,
  info: string,
  example: string,
  block: string,
  blockType: string,
  insert: string = label,
  boost?: number,
): Word => ({
  label,
  insert,
  kind,
  detail,
  info,
  example,
  block,
  blockType,
  ...(boost === undefined ? {} : { boost }),
});

const namespace = (label: string, info: string, boost?: number): Word =>
  word(label, 'namespace', '', info, '', '', '', label, boost);

// --- On its own (no dot before) ---------------------------------------------------------------

const TOP: readonly Word[] = [
  word(
    'print',
    'function',
    '(value)',
    'Shows a value (a number or text) in the Monitor.',
    "print('hello')",
    'print …',
    'mp_print',
    'print(${value})',
    3,
  ),
  word(
    'print (plot)',
    'function',
    '("name:", value)',
    'Draws a value as a line called “name” in the Plotter. The name ends with a colon.',
    'print("speed:", 50)',
    'plot name = …',
    'mp_plot',
    'print("${name}:", ${value})',
  ),
  word(
    'wait',
    'function',
    '(milliseconds)',
    'Waits before the next line. 1000 milliseconds are 1 second.',
    'wait(1000)',
    'wait … seconds',
    'mp_wait_seconds',
    'wait(${1000})',
    3,
  ),
  namespace(
    'robot',
    'The robot’s two wheel motors together (their ports are in Config). Type robot. to drive.',
    3,
  ),
  namespace('hub', 'The hub: its button light, its 5×5 lights, speaker, buttons and tilt.', 3),
  namespace('timer', 'A stopwatch in milliseconds, from the start of the program.'),
  word(
    'drive_with_steering',
    'function',
    '(steering)',
    'Starts the robot driving in a curve: -100 spins left, 0 goes straight, 100 spins right. It keeps going until robot.brake().',
    'drive_with_steering(30)',
    'start moving, steering …',
    'mp_move_start_steering',
    'drive_with_steering(${30})',
  ),
  word(
    'set_movement_speed',
    'function',
    '(percent)',
    'Sets how fast the robot drives and turns, in % of its top speed (at least 5).',
    'set_movement_speed(50)',
    'set movement speed to …',
    'mp_move_speed',
    'set_movement_speed(${50})',
  ),
  word(
    'drive_with_controller',
    'function',
    '("one stick" | "tank" | "racing")',
    'Drives the robot with the controller, once: put it in “while True:”. Menu (☰) stops the program.',
    'drive_with_controller("one stick")',
    'drive with the controller',
    'mp_ctrl_drive',
    'drive_with_controller("${one stick}")',
  ),
  word(
    'controller_pressed',
    'function',
    '(Button.A)',
    'True while a controller button is held down.',
    'print(controller_pressed(Button.A))',
    'button … is pressed',
    'mp_ctrl_pressed',
    'controller_pressed(Button.${A})',
  ),
  word(
    'controller_just_pressed',
    'function',
    '(slot, Button.A)',
    'True once each time a controller button goes down. The first number keeps each block apart; MatPilot numbers them itself.',
    'print(controller_just_pressed(0, Button.A))',
    'button … was just pressed',
    'mp_ctrl_clicked',
    'controller_just_pressed(0, Button.${A})',
  ),
  word(
    'controller_value',
    'function',
    '(index)',
    'A stick or trigger, as a number: 0 left stick ↔, 1 left stick ↕, 2 right stick ↔, 3 right stick ↕ (-100 to 100); 4 LT, 5 RT (0 to 100).',
    'print(controller_value(1))',
    'controller …',
    'mp_ctrl_value',
    'controller_value(${1})',
  ),
  word(
    'controller_rumble',
    'function',
    '(duration_ms, times)',
    'Shakes the controller: (150, 1) short, (500, 1) long, (150, 2) twice.',
    'controller_rumble(150, 1)',
    'rumble the controller …',
    'mp_ctrl_rumble',
    'controller_rumble(${150}, ${1})',
  ),
  word(
    'round',
    'function',
    '(number)',
    'The nearest whole number.',
    'print(round(2.6))',
    'round …',
    'math_round',
    'round(${x})',
  ),
  word(
    'str',
    'function',
    '(value)',
    'A value as text, to join with other text: "score: " + str(points).',
    'print(str(5))',
    'create text with …',
    'text_join',
    'str(${x})',
  ),
  namespace('random', 'Random numbers: random.randint(1, 6) is a dice.'),
  namespace('math', 'math.ceil and math.floor round up and down.'),
  namespace('Color', 'Colours, for the hub light and the colour sensor: Color.GREEN.'),
  namespace('Icon', 'Pictures for the hub’s 5×5 lights: Icon.HAPPY.'),
  namespace('Button', 'Buttons of the hub and of the controller: Button.A.'),
  namespace('Stop', 'What a motor does when it arrives: Stop.HOLD, Stop.BRAKE or Stop.COAST.'),
  word(
    'for',
    'keyword',
    'count in range(times):',
    'Repeats the lines under it a number of times.',
    'for count in range(4):\n    wait(100)',
    'repeat … times',
    'controls_repeat_ext',
    'for count in range(${4}):\n    ${pass}',
    2,
  ),
  word(
    'while True',
    'keyword',
    ':',
    'Repeats the lines under it forever (until the program stops).',
    'while True:\n    wait(100)',
    'repeat forever',
    'mp_forever',
    'while True:\n    ${pass}',
    2,
  ),
  word(
    'while not',
    'keyword',
    'condition: wait(10)',
    'Waits until something is true, for example until a touch sensor is pressed.',
    'while not touch_sensor_f.pressed():\n    wait(10)',
    'wait until …',
    'mp_wait_until',
    'while not ${condition}:\n    wait(10)',
  ),
  word(
    'while',
    'keyword',
    'condition:',
    'Repeats the lines under it as long as something is true.',
    'while timer.time() < 1000:\n    wait(10)',
    'repeat while …',
    'controls_whileUntil',
    'while ${condition}:\n    ${pass}',
  ),
  word(
    'if',
    'keyword',
    'condition:',
    'Runs the lines under it only when something is true. Add elif and else for other cases.',
    'if timer.time() > 1000:\n    hub.light.on(Color.RED)',
    'if … do',
    'controls_if',
    'if ${condition}:\n    ${pass}',
    2,
  ),
  word(
    'elif',
    'keyword',
    'condition:',
    'Another case of the if above: “else if”.',
    '',
    'else if',
    'controls_if',
    'elif ${condition}:\n    ${pass}',
  ),
  word(
    'else',
    'keyword',
    ':',
    'What to do when none of the cases above is true.',
    '',
    'else',
    'controls_if',
    'else:\n    ${pass}',
  ),
  word(
    'switch_value',
    'keyword',
    ' = value',
    '“switch on”: checks one value once; the if … elif just under it picks the case the value equals, and else is “otherwise”.',
    'switch_value = colour_sensor_d.color()\nif switch_value == Color.RED:\n    wait(100)\nelif switch_value == Color.BLUE:\n    wait(200)',
    'switch on …',
    'mp_switch',
    'switch_value = ${value}\nif switch_value == ${1}:\n    ${pass}\nelif switch_value == ${2}:\n    ${pass}',
  ),
  word(
    'break',
    'keyword',
    '',
    'Leaves the loop it is in.',
    'while True:\n    break',
    'break out of loop',
    'controls_flow_statements',
  ),
  word(
    'def',
    'keyword',
    'name(inputs):',
    'Makes a block of your own (a function), in the Functions part above Main.',
    '',
    'define …',
    'mp_func_define',
    'def ${name}():\n    ${pass}',
  ),
  word(
    'raise SystemExit',
    'keyword',
    '',
    'Stops the program. Every motor stops too.',
    'raise SystemExit',
    'stop the program',
    'mp_stop_program',
  ),
  word(
    'True',
    'constant',
    '',
    'Yes: the opposite of False.',
    'print(True)',
    'true',
    'logic_boolean',
  ),
  word(
    'False',
    'constant',
    '',
    'No: the opposite of True.',
    'print(False)',
    'false',
    'logic_boolean',
  ),
  word(
    'and',
    'keyword',
    '',
    'True when both sides are true.',
    'print(True and False)',
    '… and …',
    'logic_operation',
  ),
  word(
    'or',
    'keyword',
    '',
    'True when either side is true.',
    'print(True or False)',
    '… or …',
    'logic_operation',
  ),
  word(
    'not',
    'keyword',
    '',
    'Turns true into false and false into true.',
    'print(not True)',
    'not …',
    'logic_negate',
  ),
  word('pass', 'keyword', '', 'Does nothing: a place holder where a line is needed.', '', '', ''),
];

// --- After a dot -------------------------------------------------------------------------------

const ROBOT: readonly Word[] = [
  word(
    'straight',
    'method',
    '(distance_mm)',
    'Drives straight for a distance in millimetres: positive forward, negative backward. The next line waits until it arrives.',
    'robot.straight(200)',
    'move forward for … mm',
    'mp_move',
    'straight(${200})',
    3,
  ),
  word(
    'turn',
    'method',
    '(degrees)',
    'Turns on the spot: positive turns right (clockwise seen from above), negative turns left.',
    'robot.turn(90)',
    'turn right …°',
    'mp_move_turn',
    'turn(${90})',
    3,
  ),
  word(
    'drive',
    'method',
    '(robot.settings()[0], 0)',
    'Starts driving forward and keeps going until robot.brake(). With -robot.settings()[0] it drives backward.',
    'robot.drive(robot.settings()[0], 0)',
    'start moving forward',
    'mp_move_start',
    'drive(robot.settings()[0], 0)',
  ),
  word(
    'brake',
    'method',
    '()',
    'Stops the robot.',
    'robot.brake()',
    'stop moving',
    'mp_move_stop',
    'brake()',
  ),
];

const HUB: readonly Word[] = [
  namespace('light', 'The light in the hub’s centre button: hub.light.on(Color.GREEN).'),
  namespace('display', 'The hub’s 5×5 lights: pictures, text and numbers.'),
  namespace('speaker', 'The hub’s speaker: beeps and notes.'),
  namespace('imu', 'The hub’s tilt: hub.imu.tilt()[0].'),
  namespace('buttons', 'The hub’s buttons: Button.LEFT in hub.buttons.pressed().'),
];

const HUB_LIGHT: readonly Word[] = [
  word(
    'on',
    'method',
    '(Color.GREEN)',
    'Turns on the light in the centre button, in a colour.',
    'hub.light.on(Color.GREEN)',
    'set button light to …',
    'mp_light_button',
    'on(Color.${GREEN})',
  ),
  word(
    'off',
    'method',
    '()',
    'Turns off the light in the centre button.',
    'hub.light.off()',
    'turn off the button light',
    'mp_light_button_off',
    'off()',
  ),
];

const PICTURE = [
  '[',
  '        [0, 0, 0, 0, 0],',
  '        [0, 100, 0, 100, 0],',
  '        [0, 0, 0, 0, 0],',
  '        [100, 0, 0, 0, 100],',
  '        [0, 100, 100, 100, 0],',
  '    ]',
].join('\n');

const HUB_DISPLAY: readonly Word[] = [
  word(
    'icon',
    'method',
    '(Icon.HAPPY)',
    'Shows a ready-made picture on the 5×5 lights.',
    'hub.display.icon(Icon.HAPPY)',
    'hub display …',
    'mp_hub_display_icon',
    'icon(Icon.${HAPPY})',
  ),
  word(
    'icon (picture)',
    'method',
    '([5 rows of 5 numbers])',
    'Shows your own picture: 5 rows of 5 lights, each 0 (off) to 100 (bright), in steps of 10. The first row is the top.',
    `hub.display.icon(${PICTURE})`,
    'show picture',
    'mp_light_show',
    `icon(${PICTURE})`,
  ),
  word(
    'text',
    'method',
    "('text')",
    'Scrolls text across the 5×5 lights.',
    "hub.display.text('Hi')",
    'write …',
    'mp_light_write',
    "text('${Hi}')",
  ),
  word(
    'number',
    'method',
    '(number)',
    'Shows a number on the 5×5 lights.',
    'hub.display.number(42)',
    'hub display number …',
    'mp_hub_display_number',
    'number(${42})',
  ),
  word(
    'pixel',
    'method',
    '(row, column, brightness)',
    'Turns on one light: row 0 (top) to 4, column 0 (left) to 4, brightness 0 to 100.',
    'hub.display.pixel(0, 0, 100)',
    'light column … row … at …',
    'mp_light_pixel',
    'pixel(${0}, ${0}, ${100})',
  ),
  word(
    'off',
    'method',
    '()',
    'Turns off the 5×5 lights.',
    'hub.display.off()',
    'turn off the lights',
    'mp_light_off',
    'off()',
  ),
];

const HUB_SPEAKER: readonly Word[] = [
  word(
    'beep',
    'method',
    '()',
    'A short beep.',
    'hub.speaker.beep()',
    'beep',
    'mp_sound_beep',
    'beep()',
  ),
  word(
    'beep (note)',
    'method',
    '(frequency_hz, milliseconds)',
    'Plays a sound: 262 is C (do), 440 is A (la). 1000 milliseconds are 1 second.',
    'hub.speaker.beep(440, 500)',
    'play note … for … seconds',
    'mp_sound_note',
    'beep(${440}, ${500})',
  ),
  word(
    'volume',
    'method',
    '(percent)',
    'Sets how loud the speaker is, 0 to 100.',
    'hub.speaker.volume(50)',
    'set volume to …',
    'mp_sound_volume',
    'volume(${50})',
  ),
];

const HUB_IMU: readonly Word[] = [
  word(
    'tilt',
    'method',
    '()[0 or 1]',
    'How far the hub tips, in degrees: [0] forward and back (pitch), [1] to the side (roll).',
    'print(hub.imu.tilt()[0])',
    'hub tilt pitch (°)',
    'mp_hub_tilt',
    'tilt()[${0}]',
  ),
];

const HUB_BUTTONS: readonly Word[] = [
  word(
    'pressed',
    'method',
    '()',
    'The hub buttons held down now. Ask with “in”: Button.LEFT in hub.buttons.pressed().',
    'print(Button.LEFT in hub.buttons.pressed())',
    'hub … button is pressed',
    'mp_hub_button',
    'pressed()',
  ),
];

const TIMER: readonly Word[] = [
  word(
    'time',
    'method',
    '()',
    'Milliseconds since the program started, or since timer.reset().',
    'print(timer.time())',
    'timer (ms)',
    'mp_timer',
    'time()',
  ),
  word(
    'reset',
    'method',
    '()',
    'Starts the timer again from 0.',
    'timer.reset()',
    'reset timer',
    'mp_timer_reset',
    'reset()',
  ),
];

const RANDOM: readonly Word[] = [
  word(
    'randint',
    'function',
    '(lowest, highest)',
    'A random whole number from lowest to highest, both included: random.randint(1, 6) is a dice.',
    'print(random.randint(1, 6))',
    'random integer from … to …',
    'math_random_int',
    'randint(${1}, ${6})',
  ),
];

const MATH: readonly Word[] = [
  word(
    'ceil',
    'function',
    '(number)',
    'Rounds up: 2.1 becomes 3.',
    'print(math.ceil(2.1))',
    'round up …',
    'math_round',
    'ceil(${x})',
  ),
  word(
    'floor',
    'function',
    '(number)',
    'Rounds down: 2.9 becomes 2.',
    'print(math.floor(2.9))',
    'round down …',
    'math_round',
    'floor(${x})',
  ),
];

/** The simple blocks' motor on a port (`motor_a`). */
function simpleMotor(name: string): Word[] {
  const speed = `${name}_speed`;
  return [
    word(
      'run_angle',
      'method',
      `(${speed}, degrees)`,
      'Turns the motor by an angle, in degrees: 360 is one turn; negative turns the other way.',
      `${name}.run_angle(${speed}, 90)`,
      `motor ${name.slice(-1).toUpperCase()} run clockwise for … °`,
      'mp_motor_run_for',
      `run_angle(${speed}, \${90})`,
      2,
    ),
    word(
      'run_time',
      'method',
      `(${speed}, milliseconds)`,
      'Turns the motor for a time: 1000 milliseconds are 1 second. -speed turns the other way.',
      `${name}.run_time(${speed}, 1000)`,
      `motor ${name.slice(-1).toUpperCase()} run clockwise for … seconds`,
      'mp_motor_run_for',
      `run_time(${speed}, \${1000})`,
    ),
    word(
      'run',
      'method',
      `(${speed})`,
      'Starts the motor; it keeps turning until brake(). -speed turns the other way.',
      `${name}.run(${speed})`,
      `motor ${name.slice(-1).toUpperCase()} start clockwise`,
      'mp_motor_start',
      `run(${speed})`,
    ),
    word(
      'brake',
      'method',
      '()',
      'Stops the motor.',
      `${name}.brake()`,
      `motor ${name.slice(-1).toUpperCase()} stop`,
      'mp_motor_stop_simple',
      'brake()',
    ),
    word(
      'reset_angle',
      'method',
      '(0)',
      'Counts the motor’s position from 0 again.',
      `${name}.reset_angle(0)`,
      `set motor ${name.slice(-1).toUpperCase()} position to 0`,
      'mp_motor_reset_position',
      'reset_angle(0)',
    ),
    word(
      'angle',
      'method',
      '()',
      'Where the motor is, in degrees (360 per turn).',
      `print(${name}.angle())`,
      `motor ${name.slice(-1).toUpperCase()} position (°)`,
      'mp_motor_position',
      'angle()',
    ),
  ];
}

function simpleSensor(kind: string, name: string): Word[] {
  const port = name.slice(-1).toUpperCase();
  switch (kind) {
    case 'colour_sensor':
      return [
        word(
          'color',
          'method',
          '()',
          'The colour the sensor sees: Color.RED, YELLOW, GREEN, BLUE, WHITE or NONE. Check it with “switch on”, or compare it.',
          `print(${name}.color())`,
          `colour sensor ${port} colour`,
          'mp_sensor_color',
          'color()',
        ),
        word(
          'color',
          'method',
          '() == Color.RED',
          'The colour the sensor sees. Compare it: colour_sensor_d.color() == Color.RED.',
          `print(${name}.color() == Color.RED)`,
          `colour sensor ${port} sees …`,
          'mp_sensor_color_is',
          'color() == Color.${RED}',
        ),
        word(
          'reflection',
          'method',
          '()',
          'How much light comes back from the surface, in %.',
          `print(${name}.reflection())`,
          `colour sensor ${port} reflection (%)`,
          'mp_sensor_reflection',
          'reflection()',
        ),
      ];
    case 'distance_sensor':
      return [
        word(
          'distance',
          'method',
          '()',
          'How far away something is, in millimetres (2000 when nothing is in range). Compare it: distance() < 100.',
          `print(${name}.distance())`,
          `distance sensor ${port} distance (mm)`,
          'mp_sensor_distance',
          'distance()',
        ),
      ];
    default:
      return [
        word(
          'pressed',
          'method',
          '()',
          'True while the touch sensor is pressed.',
          `print(${name}.pressed())`,
          `touch sensor ${port} is pressed`,
          'mp_sensor_pressed',
          'pressed()',
        ),
        word(
          'force',
          'method',
          '()',
          'How hard the touch sensor is pressed, in newtons (N).',
          `print(${name}.force())`,
          `touch sensor ${port} force (N)`,
          'mp_sensor_force',
          'force()',
        ),
      ];
  }
}

/** A device set up in the "set up" block, by its type. */
function setUpDevice(name: string, type: DeviceType): Word[] {
  const value = (
    label: string,
    info: string,
    block: string,
    blockType: string,
    insert = `${label}()`,
  ) => word(label, 'method', '()', info, `print(${name}.${insert})`, block, blockType, insert);
  switch (type) {
    case 'Motor': {
      const move = (
        label: string,
        detail: string,
        info: string,
        args: string,
        block: string,
        blockType: string,
      ) =>
        word(
          label,
          'method',
          detail,
          info,
          `${name}.${label}(${args})`,
          block,
          blockType,
          `${label}(${args.replace(/(\d+)/g, '${$1}')})`,
        );
      return [
        move(
          'run',
          '(speed)',
          'Turns at a speed in °/s until it is stopped.',
          '500',
          'motor run at … °/s',
          'mp_motor_run',
        ),
        move(
          'run_angle',
          '(speed, degrees)',
          'Turns by an angle at a speed (°/s); then it holds. then=Stop.BRAKE or wait=False change that.',
          '500, 360',
          'motor run at … °/s for … °',
          'mp_motor_run_angle',
        ),
        move(
          'run_target',
          '(speed, angle)',
          'Turns to an angle (°) at a speed (°/s).',
          '500, 0',
          'motor run at … °/s to angle … °',
          'mp_motor_run_target',
        ),
        move(
          'run_time',
          '(speed, milliseconds)',
          'Turns for a time at a speed (°/s).',
          '500, 1000',
          'motor run at … °/s for … ms',
          'mp_motor_run_time',
        ),
        move(
          'dc',
          '(power)',
          'Runs at a power, in %, without speed control.',
          '50',
          'motor power … %',
          'mp_motor_dc',
        ),
        move(
          'reset_angle',
          '(degrees)',
          'Sets what angle the motor counts from.',
          '0',
          'set motor angle to … °',
          'mp_motor_reset_angle',
        ),
        word(
          'stop',
          'method',
          '()',
          'Stops the motor and lets it spin freely.',
          `${name}.stop()`,
          'motor stop (coast)',
          'mp_motor_stop',
          'stop()',
        ),
        word(
          'brake',
          'method',
          '()',
          'Stops the motor, braking.',
          `${name}.brake()`,
          'motor stop (brake)',
          'mp_motor_stop',
          'brake()',
        ),
        word(
          'hold',
          'method',
          '()',
          'Stops the motor and holds it where it is.',
          `${name}.hold()`,
          'motor stop (hold)',
          'mp_motor_stop',
          'hold()',
        ),
        value('angle', 'The motor’s angle, in degrees.', 'motor angle (°)', 'mp_motor_angle'),
        value('speed', 'The motor’s speed, in °/s.', 'motor speed (°/s)', 'mp_motor_speed'),
      ];
    }
    case 'ColorSensor':
      return [
        value(
          'color',
          'The colour the sensor sees; compare it with == Color.RED.',
          'colour sensor sees …',
          'mp_color_sees',
          'color() == Color.RED',
        ),
        value(
          'reflection',
          'How much light comes back from the surface, in %.',
          'colour sensor reflection (%)',
          'mp_color_reflection',
        ),
        value(
          'ambient',
          'How much light there is around, in %.',
          'colour sensor ambient light (%)',
          'mp_color_ambient',
        ),
      ];
    case 'UltrasonicSensor':
      return [
        value(
          'distance',
          'How far away something is, in millimetres (2000 when nothing is in range).',
          'distance sensor distance (mm)',
          'mp_ultrasonic_distance',
        ),
      ];
    case 'ForceSensor':
      return [
        value(
          'force',
          'How hard it is pressed, in newtons (N).',
          'touch sensor force (N)',
          'mp_force_force',
        ),
        value(
          'pressed',
          'True while it is pressed.',
          'touch sensor is pressed',
          'mp_force_pressed',
        ),
        value(
          'touched',
          'True when it is touched, even lightly.',
          'touch sensor is touched',
          'mp_force_touched',
        ),
      ];
  }
}

const constant = (label: string, info: string): Word =>
  word(label, 'constant', '', info, '', '', '');

function colors(): Word[] {
  const names = new Map<string, string[]>();
  for (const [label, value] of LIGHT_COLOR_OPTIONS)
    names.set(value, [`${label}: for the hub light`]);
  for (const [label, value] of SENSOR_COLOR_OPTIONS) {
    names.set(value, [...(names.get(value) ?? [label]), 'the colour sensor knows it']);
  }
  return [...names].map(([value, about]) => constant(value, about.join('; ') + '.'));
}

const ICONS = ICON_OPTIONS.map(([label, value]) => constant(value, `A picture: ${label}.`));
const BUTTONS = [
  ...BUTTON_OPTIONS.map(([label, value]) => constant(value, `The hub’s ${label} button.`)),
  ...XBOX_BUTTONS.map((button) =>
    constant(button.python, `The controller’s ${button.label} button.`),
  ),
].filter((each, index, all) => all.findIndex((other) => other.label === each.label) === index);
const STOPS = THEN_OPTIONS.map(([label, value]) => constant(value, `After moving: ${label}.`));

const SIMPLE_DEVICE = /^(motor|colour_sensor|distance_sensor|touch_sensor)_([a-f])$/;

/** The simple blocks' device and speed names, on every port. */
function portNames(): Word[] {
  const out: Word[] = [];
  for (const port of PORTS) {
    const p = port.toLowerCase();
    out.push(
      namespace(
        `motor_${p}`,
        `The motor on port ${port}, for the simple motor blocks. Type motor_${p}. to move it.`,
      ),
      word(
        `motor_${p}_speed`,
        'variable',
        '',
        `The speed the simple blocks use for motor ${port}. Set it in % of the top speed: motor_${p}_speed = motor_${p}.control.limits()[0] * 50 // 100.`,
        `motor_${p}_speed = motor_${p}.control.limits()[0] * 50 // 100`,
        `set motor ${port} speed to …`,
        'mp_motor_set_speed',
        `motor_${p}_speed = motor_${p}.control.limits()[0] * \${50} // 100`,
      ),
      namespace(`colour_sensor_${p}`, `The colour sensor on port ${port}.`),
      namespace(`distance_sensor_${p}`, `The distance sensor on port ${port}.`),
      namespace(`touch_sensor_${p}`, `The touch sensor on port ${port}.`),
    );
  }
  return out;
}

const DEVICE_LABEL: Record<DeviceType, string> = {
  Motor: 'motor',
  ColorSensor: 'colour sensor',
  UltrasonicSensor: 'distance sensor',
  ForceSensor: 'touch sensor',
};

/** This program's own names, for the top level. */
function programWords(names: ProgramNames): Word[] {
  return [
    ...names.variables.map((name) =>
      word(
        name,
        'variable',
        '',
        'A variable of this tab.',
        `${name} = 0`,
        `set ${name} to …`,
        'variables_set',
        name,
        1,
      ),
    ),
    ...names.shared.map((name) =>
      word(
        name,
        'variable',
        '',
        'A shared variable 🌐: every tab sees the same value.',
        `${name} = 0`,
        `🌐 set shared ${name} to …`,
        'mp_shared_set',
        name,
        1,
      ),
    ),
    ...names.devices.map((device) =>
      namespace(
        device.name,
        `The ${DEVICE_LABEL[device.type]} set up as “${device.name}” in the “set up” block. Type ${device.name}. to use it.`,
        1,
      ),
    ),
    ...names.functions
      .filter((fn) => fn.tab === null)
      .map((fn) =>
        word(
          fn.name,
          'function',
          `(${fn.inputs.join(', ')})`,
          'A function of this tab: your own block.',
          '',
          fn.name,
          'mp_func_call',
          `${fn.name}(${fn.inputs.map((input) => `\${${input}}`).join(', ')})`,
          1,
        ),
      ),
    ...names.tabs.map((tab) =>
      namespace(tab, `The tab “${tab}”: type ${tab}. to use its functions.`, 1),
    ),
  ];
}

/** The words that may follow `path.` (`''`: words on their own). */
export function wordsAfter(path: string, names: ProgramNames = NO_NAMES): readonly Word[] {
  switch (path) {
    case '':
      return [...programWords(names), ...TOP, ...portNames()];
    case 'robot':
      return ROBOT;
    case 'hub':
      return HUB;
    case 'hub.light':
      return HUB_LIGHT;
    case 'hub.display':
      return HUB_DISPLAY;
    case 'hub.speaker':
      return HUB_SPEAKER;
    case 'hub.imu':
      return HUB_IMU;
    case 'hub.buttons':
      return HUB_BUTTONS;
    case 'timer':
      return TIMER;
    case 'random':
      return RANDOM;
    case 'math':
      return MATH;
    case 'Color':
      return colors();
    case 'Icon':
      return ICONS;
    case 'Button':
      return BUTTONS;
    case 'Stop':
      return STOPS;
    case 'setup':
      return [
        ...names.shared.map((name) =>
          word(
            name,
            'variable',
            '',
            'A shared variable 🌐: every tab sees the same value.',
            '',
            '',
            '',
            name,
          ),
        ),
        ...PORTS.map((port) =>
          word(
            `motor_${port.toLowerCase()}_speed`,
            'variable',
            '',
            `The speed the simple blocks use for motor ${port}.`,
            '',
            '',
            '',
          ),
        ),
      ];
    default:
      break;
  }
  const simple = SIMPLE_DEVICE.exec(path);
  if (simple) return simple[1] === 'motor' ? simpleMotor(path) : simpleSensor(simple[1]!, path);
  const device = names.devices.find((each) => each.name === path);
  if (device) return setUpDevice(device.name, device.type);
  if (names.tabs.includes(path)) {
    return names.functions
      .filter((fn) => fn.tab === path)
      .map((fn) =>
        word(
          fn.name,
          'function',
          `(${fn.inputs.join(', ')})`,
          `A function in the tab “${path}”.`,
          '',
          fn.name,
          'mp_func_call',
          `${fn.name}(${fn.inputs.map((input) => `\${${input}}`).join(', ')})`,
        ),
      );
  }
  return [];
}

/** The word a dotted name means (`['robot', 'straight']`), for the help that shows on hover. */
export function wordFor(path: readonly string[], names: ProgramNames = NO_NAMES): Word | null {
  if (path.length === 0) return null;
  const last = path[path.length - 1]!;
  const before = path.slice(0, -1).join('.');
  const found = wordsAfter(before, names).filter(
    (each) =>
      each.label === last ||
      each.label.startsWith(`${last} `) ||
      each.insert.startsWith(`${last}(`),
  );
  return found[0] ?? null;
}
