/**
 * The Python of the Controller blocks (./controller-definitions.ts, ADR 0012). Every block reads
 * the controller through one helper, `read_controller()`, which also:
 * - stops the program when the controller is lost (an OSError, hub code rule 2) or Menu is
 *   pressed: `raise SystemExit`, so `finally` stops every motor;
 * - prints an `@xbx` line with the sticks, triggers and buttons every CONTROLLER_REPORT_MS, for the
 *   page's controller monitor (src/lib/controller/xbox.ts). The page only displays them.
 *
 * ./generator.ts adds the Config constants and connects the controller in Setup
 * (`controllerSetup`). The Pybricks names are cited in ./pybricks.ts.
 */
import type * as Blockly from 'blockly/core';
import { Order, pythonGenerator } from 'blockly/python';
import {
  DRIVE_FINGERS,
  XBOX_PROFILE,
  buttonFinger,
  inputFingers,
  inputOption,
  type ControllerInput,
} from '../controller/layout';
import { CONTROLLER_LINE_PREFIX, XBOX_BUTTONS, type XboxButtonName } from '../controller/xbox';
import { RUMBLES } from './controller-definitions';
import { describeMotorSet, parseMotorSet } from './fields/port';
import {
  CONTROLLER as C,
  INDENT,
  ROBOT,
  addControl,
  chooseController,
  controllerSlot,
  helper,
  hubName,
  markControllerUse,
  motorSpeedAt,
  need,
  portDeviceAt,
  robotName,
} from './generator-context';

/** How long one attempt to find the controller lasts, in ms (SPIKE Prime tries twice: ./pybricks.ts). */
export const CONTROLLER_SEARCH_MS = 20000;
/** How often the program reports the controller to the page, in ms. */
export const CONTROLLER_REPORT_MS = 100;

const LOST = `def ${C.lost}():
    hub.light.on(Color.RED)
    print("${CONTROLLER_LINE_PREFIX} lost")
    print("The controller was lost, so the program stopped.")
    raise SystemExit`;

const READ = `${C.buttons} = (
${XBOX_BUTTONS.map((button) => `${INDENT}Button.${button.python},`).join('\n')}
)


def ${C.read}():
    # Every controller block reads here. Losing the controller or pressing Menu ends the
    # program, and the page's controller monitor gets the values every ${C.reportMs}.
    try:
        left = ${C.controller}.joystick_left()
        right = ${C.controller}.joystick_right()
        triggers = ${C.controller}.triggers()
        pressed = ${C.controller}.buttons.pressed()
    except OSError:
        ${C.lost}()
    if Button.MENU in pressed:
        print("${CONTROLLER_LINE_PREFIX} menu")
        raise SystemExit
    if ${C.report}.time() >= ${C.reportMs}:
        ${C.report}.reset()
        bits = 0
        bit = 1
        for button in ${C.buttons}:
            if button in pressed:
                bits += bit
            bit *= 2
        print("${CONTROLLER_LINE_PREFIX}", left[0], left[1], right[0], right[1], triggers[0], triggers[1], bits)
    return left + right + triggers, pressed`;

const DRIVE = `def drive_with_controller(style):
    # "one stick": the left stick drives and turns. "tank": each stick drives one side.
    # "racing": RT goes, LT backs up, the left stick steers. Full stick is the movement speed.
    values = ${C.read}()[0]
    if style == "tank":
        speed = (values[1] + values[3]) / 2
        turn = (values[1] - values[3]) / 2
    elif style == "racing":
        speed = values[5] - values[4]
        turn = values[0]
    else:
        speed = values[1]
        turn = values[0]
    settings = ${ROBOT.robot}.settings()
    ${ROBOT.robot}.drive(speed * settings[0] / 100, turn * settings[2] / 100)`;

const RUN_MOTOR = `def run_motor_with_controller(slot, motor, speed, power):
    # power from -100 to 100. Near 0 the motor stops and holds where it is.
    if abs(power) < 10:
        if ${C.memory}.get(slot) != "hold":
            motor.hold()
            ${C.memory}[slot] = "hold"
    else:
        motor.run(speed * power / 100)
        ${C.memory}[slot] = "run"`;

const PAIR = `def controller_pair(forward, backward):
    pressed = ${C.read}()[1]
    if forward in pressed:
        return 100
    if backward in pressed:
        return -100
    return 0`;

const VALUE = `def controller_value(index):
    return ${C.read}()[0][index]`;

const PRESSED = `def controller_pressed(button):
    return button in ${C.read}()[1]`;

const JUST_PRESSED = `def controller_just_pressed(slot, button):
    # True once per press: now down, and up the last time this block looked.
    now = button in ${C.read}()[1]
    before = ${C.memory}.get(slot, False)
    ${C.memory}[slot] = now
    return now and not before`;

const RUMBLE = `def controller_rumble(duration, count):
    try:
        ${C.controller}.rumble(power=80, duration=duration, count=count, delay=150)
    except OSError:
        ${C.lost}()`;

/** Marks the controller as used and adds the helpers every controller block needs. */
function controller(block: Blockly.Block): void {
  markControllerUse(block);
  hubName();
  need('pybricks.parameters', 'Button');
  need('pybricks.parameters', 'Color');
  helper(C.lost, LOST);
  helper(C.read, READ);
}

/** The Config lines when the program uses the controller. */
export function controllerConfig(): string[] {
  return [`${C.searchMs} = ${CONTROLLER_SEARCH_MS}`, `${C.reportMs} = ${CONTROLLER_REPORT_MS}`];
}

/**
 * The Setup lines: look for the controller (blue light), give up with a message if it is not
 * found (red light), say so when it is (green light).
 */
export function controllerSetup(): string[] {
  need('pybricks.iodevices', 'XboxController');
  need('pybricks.tools', 'StopWatch');
  return [
    `${C.memory} = {}`,
    `${C.report} = StopWatch()`,
    'hub.light.on(Color.BLUE)',
    `print("${CONTROLLER_LINE_PREFIX} searching")`,
    'try:',
    `${INDENT}${C.controller} = XboxController(timeout=${C.searchMs})`,
    'except OSError:',
    `${INDENT}hub.light.on(Color.RED)`,
    `${INDENT}print("${CONTROLLER_LINE_PREFIX} notfound")`,
    `${INDENT}print("No Xbox controller found. Turn it on, hold its pair button until the Xbox button flashes fast, then press Run again.")`,
    `${INDENT}raise SystemExit`,
    'hub.light.on(Color.GREEN)',
    `print("${CONTROLLER_LINE_PREFIX} connected")`,
  ];
}

/** Where each stick axis and trigger is in the values `read_controller()` returns. */
const VALUE_INDEX = {
  'left x': 0,
  'left y': 1,
  'right x': 2,
  'right y': 3,
  'left trigger': 4,
  'right trigger': 5,
} as const;

/** The Python number for an input: ±100 for a button pair, else the stick or trigger value. */
function inputCode(input: ControllerInput): string {
  const value = helper('controller_value', VALUE);
  switch (input.kind) {
    case 'pair':
      return `${helper('controller_pair', PAIR)}(Button.${input.forward}, Button.${input.backward})`;
    case 'axis':
      return `${value}(${VALUE_INDEX[`${input.side} ${input.axis}`]})`;
    case 'triggers':
      return `${value}(${VALUE_INDEX['right trigger']}) - ${value}(${VALUE_INDEX['left trigger']})`;
    case 'trigger':
      return `${value}(${VALUE_INDEX[`${input.side} trigger`]})`;
  }
}

const buttonLabel = (name: string) =>
  XBOX_BUTTONS.find((entry) => entry.python === name)?.label ?? name;

/** What "drive with the controller" does with each control, by style. */
const DRIVE_CONTROLS: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  ONE_STICK: [['left stick', 'drives and turns the robot']],
  TANK: [
    ['left stick ↕', 'drives the left side'],
    ['right stick ↕', 'drives the right side'],
  ],
  RACING: [
    ['RT', 'drives forward'],
    ['LT', 'backs up'],
    ['left stick ↔', 'steers'],
  ],
};

let registered = false;

export function registerControllerGenerators(): void {
  if (registered) return;
  registered = true;
  const forBlock = pythonGenerator.forBlock;

  forBlock['mp_ctrl_use'] = (block) => {
    controller(block);
    chooseController(block, block.getFieldValue('CONTROLLER') as string);
    return '';
  };

  forBlock['mp_ctrl_drive'] = (block) => {
    controller(block);
    robotName(block);
    const styleName = block.getFieldValue('STYLE') as string;
    const style = { ONE_STICK: 'one stick', TANK: 'tank', RACING: 'racing' }[styleName];
    const fingers = DRIVE_FINGERS[styleName] ?? [];
    for (const [control, action] of DRIVE_CONTROLS[styleName] ?? []) {
      addControl({ control, action, fingers });
    }
    return `${helper('drive_with_controller', DRIVE)}("${style ?? 'one stick'}")\n`;
  };

  forBlock['mp_ctrl_motor'] = (block) => {
    controller(block);
    const option = inputOption(block.getFieldValue('SOURCE') as string) ?? inputOption('A_B')!;
    const motors = parseMotorSet(block.getFieldValue('MOTORS') as string);
    const power = inputCode(option.input);
    addControl({
      control: option.label,
      action: `runs motor${motors.length > 1 ? 's' : ''} ${describeMotorSet(block.getFieldValue('MOTORS') as string)}`,
      fingers: inputFingers(XBOX_PROFILE, option.input),
    });
    const run = helper('run_motor_with_controller', RUN_MOTOR);
    // One reading for every motor, so they move together.
    const shared = motors.length > 1 ? 'controller_power' : power;
    const lines = motors.map((motor) => {
      const name = portDeviceAt(block, motor.port, 'Motor');
      const speed = motorSpeedAt(block, motor.port);
      const signed = motor.reverse ? `-${motors.length > 1 ? shared : `(${shared})`}` : shared;
      return `${run}(${controllerSlot()}, ${name}, ${speed}, ${signed})`;
    });
    return `${motors.length > 1 ? `controller_power = ${power}\n` : ''}${lines.join('\n')}\n`;
  };

  const button = (block: Blockly.Block) => {
    const name = block.getFieldValue('BUTTON') as XboxButtonName;
    const finger = buttonFinger(XBOX_PROFILE, name);
    addControl({
      control: buttonLabel(name),
      action: 'is checked by your blocks',
      fingers: finger ? [finger] : [],
    });
    return name;
  };

  forBlock['mp_ctrl_pressed'] = (block) => {
    controller(block);
    return [
      `${helper('controller_pressed', PRESSED)}(Button.${button(block)})`,
      Order.FUNCTION_CALL,
    ];
  };

  forBlock['mp_ctrl_clicked'] = (block) => {
    controller(block);
    return [
      `${helper('controller_just_pressed', JUST_PRESSED)}(${controllerSlot()}, Button.${button(block)})`,
      Order.FUNCTION_CALL,
    ];
  };

  forBlock['mp_ctrl_value'] = (block) => {
    controller(block);
    const option = inputOption(block.getFieldValue('VALUE') as string) ?? inputOption('LEFT_Y')!;
    addControl({
      control: option.label,
      action: 'is read as a number',
      fingers: inputFingers(XBOX_PROFILE, option.input),
    });
    // A pair is not a number; the field never offers one, but a saved file could.
    const code = option.input.kind === 'pair' ? '0' : inputCode(option.input);
    return [code, code.includes(' - ') ? Order.ADDITIVE : Order.FUNCTION_CALL];
  };

  forBlock['mp_ctrl_rumble'] = (block) => {
    controller(block);
    const rumble = RUMBLES[block.getFieldValue('KIND') as keyof typeof RUMBLES] ?? RUMBLES.SHORT;
    return `${helper('controller_rumble', RUMBLE)}(${rumble.duration}, ${rumble.count})\n`;
  };
}
