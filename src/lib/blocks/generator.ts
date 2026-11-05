/**
 * Turns a block workspace into a Pybricks MicroPython program (ADR 0008).
 *
 * The program always has the shape of the hub code rules in CLAUDE.md:
 * - every port is assigned once, in the Config section, and used by name (rules 3 and 4);
 * - devices are created once, in the Setup section, from the "set up" block;
 * - when any motor is set up, the main program runs inside `try`/`finally`, and `finally` stops
 *   every motor, so Stop, an error, or the end of the program never leaves a motor running
 *   (rule 1). Stop raises SystemExit in the program, so `finally` runs (./pybricks.ts).
 *
 * The Pybricks calls each block produces are cited in ./pybricks.ts.
 */
import * as Blockly from 'blockly/core';
// Importing the built-in blocks also registers them.
import { loops } from 'blockly/blocks';
import { Order, pythonGenerator } from 'blockly/python';
import { cleanPlotLabel } from './definitions';
import { DEVICES, isDeviceType, type DeviceType, type PortName } from './pybricks';

export interface Problem {
  /** The block to mark, or `null` for a problem with the program as a whole. */
  readonly blockId: string | null;
  readonly message: string;
}

export interface GeneratedProgram {
  readonly code: string;
  /** Anything that must be fixed before the program can run. */
  readonly problems: readonly Problem[];
}

export interface SetUpDevice {
  readonly blockId: string;
  readonly variableId: string;
  readonly type: DeviceType;
  /** The user's name for it, for example "left motor". */
  readonly name: string;
  readonly port: PortName;
  readonly counterclockwise: boolean;
}

/** Python names the generated program defines itself, so variables never shadow them. */
const RESERVED = [
  'hub',
  'timer',
  'wait',
  'PrimeHub',
  'Motor',
  'ColorSensor',
  'UltrasonicSensor',
  'ForceSensor',
  'Port',
  'Direction',
  'Stop',
  'Color',
  'Icon',
  'Button',
  'StopWatch',
  'math',
  'random',
];

const INDENT = '    ';

/** Section headings, in the same style as the hand-written examples. */
function rule(title: string): string {
  return `# --- ${title} `.padEnd(76, '-');
}

/** What the blocks being generated need, collected while generating. */
interface Needs {
  readonly from: Map<string, Set<string>>;
  hub: boolean;
  timer: boolean;
}

let needs: Needs | null = null;

function need(module: string, name: string): void {
  if (!needs) return;
  const names = needs.from.get(module) ?? new Set<string>();
  names.add(name);
  needs.from.set(module, names);
}

function hubName(): string {
  need('pybricks.hubs', 'PrimeHub');
  if (needs) needs.hub = true;
  return 'hub';
}

function timerName(): string {
  need('pybricks.tools', 'StopWatch');
  if (needs) needs.timer = true;
  return 'timer';
}

const name = (block: Blockly.Block, field: string) =>
  pythonGenerator.getVariableName(block.getFieldValue(field) as string);

const arg = (block: Blockly.Block, input: string, fallback = '0') =>
  pythonGenerator.valueToCode(block, input, Order.NONE) || fallback;

/** `then` and `wait` arguments of the motor moves, left out when they are the defaults. */
function moveOptions(block: Blockly.Block): string {
  const options: string[] = [];
  const then = block.getFieldValue('THEN') as string;
  if (then !== 'HOLD') {
    need('pybricks.parameters', 'Stop');
    options.push(`then=Stop.${then}`);
  }
  if (block.getFieldValue('WAIT') === 'FALSE') options.push('wait=False');
  return options.map((option) => `, ${option}`).join('');
}

let registered = false;

/** Registers the Python for MatPilot's blocks, and MicroPython fixes for built-in ones. */
export function registerGenerators(): void {
  if (registered) return;
  registered = true;
  const g = pythonGenerator;
  g.INDENT = INDENT;
  g.addReservedWords(RESERVED.join(','));
  const forBlock = g.forBlock;

  // Set-up blocks become the Config and Setup sections (generateProgram), not statements.
  for (const type of [
    'mp_setup',
    'mp_program',
    ...Object.values(DEVICES).map((device) => device.setupBlock),
  ]) {
    forBlock[type] = () => '';
  }

  // Motors
  forBlock['mp_motor_run'] = (block) => `${name(block, 'MOTOR')}.run(${arg(block, 'SPEED')})\n`;
  forBlock['mp_motor_run_angle'] = (block) =>
    `${name(block, 'MOTOR')}.run_angle(${arg(block, 'SPEED')}, ${arg(block, 'ANGLE')}${moveOptions(block)})\n`;
  forBlock['mp_motor_run_target'] = (block) =>
    `${name(block, 'MOTOR')}.run_target(${arg(block, 'SPEED')}, ${arg(block, 'TARGET')}${moveOptions(block)})\n`;
  forBlock['mp_motor_run_time'] = (block) =>
    `${name(block, 'MOTOR')}.run_time(${arg(block, 'SPEED')}, ${arg(block, 'TIME')}${moveOptions(block)})\n`;
  forBlock['mp_motor_dc'] = (block) => `${name(block, 'MOTOR')}.dc(${arg(block, 'DUTY')})\n`;
  forBlock['mp_motor_stop'] = (block) =>
    `${name(block, 'MOTOR')}.${block.getFieldValue('MODE') as string}()\n`;
  forBlock['mp_motor_reset_angle'] = (block) =>
    `${name(block, 'MOTOR')}.reset_angle(${arg(block, 'ANGLE')})\n`;

  // Hub
  forBlock['mp_hub_light_on'] = (block) => {
    need('pybricks.parameters', 'Color');
    return `${hubName()}.light.on(Color.${block.getFieldValue('COLOR') as string})\n`;
  };
  forBlock['mp_hub_light_off'] = () => `${hubName()}.light.off()\n`;
  forBlock['mp_hub_display_icon'] = (block) => {
    need('pybricks.parameters', 'Icon');
    return `${hubName()}.display.icon(Icon.${block.getFieldValue('ICON') as string})\n`;
  };
  forBlock['mp_hub_display_number'] = (block) =>
    `${hubName()}.display.number(${arg(block, 'NUMBER')})\n`;
  forBlock['mp_hub_display_text'] = (block) => {
    const text = arg(block, 'TEXT', "''");
    // display.text() takes a string; a number or sensor value is converted first.
    const asText = /^['"]/.test(text) ? text : `str(${text})`;
    return `${hubName()}.display.text(${asText})\n`;
  };
  forBlock['mp_hub_display_off'] = () => `${hubName()}.display.off()\n`;
  forBlock['mp_hub_beep'] = (block) =>
    `${hubName()}.speaker.beep(${arg(block, 'FREQUENCY', '500')}, ${arg(block, 'DURATION', '100')})\n`;

  // Inputs
  const call = (code: string): [string, Order] => [code, Order.FUNCTION_CALL];
  forBlock['mp_motor_angle'] = (block) => call(`${name(block, 'MOTOR')}.angle()`);
  forBlock['mp_motor_speed'] = (block) => call(`${name(block, 'MOTOR')}.speed()`);
  forBlock['mp_color_sees'] = (block) => {
    need('pybricks.parameters', 'Color');
    return [
      `${name(block, 'SENSOR')}.color() == Color.${block.getFieldValue('COLOR') as string}`,
      Order.RELATIONAL,
    ];
  };
  forBlock['mp_color_reflection'] = (block) => call(`${name(block, 'SENSOR')}.reflection()`);
  forBlock['mp_color_ambient'] = (block) => call(`${name(block, 'SENSOR')}.ambient()`);
  forBlock['mp_ultrasonic_distance'] = (block) => call(`${name(block, 'SENSOR')}.distance()`);
  forBlock['mp_force_force'] = (block) => call(`${name(block, 'SENSOR')}.force()`);
  forBlock['mp_force_pressed'] = (block) => call(`${name(block, 'SENSOR')}.pressed()`);
  forBlock['mp_force_touched'] = (block) => call(`${name(block, 'SENSOR')}.touched()`);
  forBlock['mp_hub_button'] = (block) => {
    need('pybricks.parameters', 'Button');
    return [
      `Button.${block.getFieldValue('BUTTON') as string} in ${hubName()}.buttons.pressed()`,
      Order.RELATIONAL,
    ];
  };
  forBlock['mp_hub_tilt'] = (block) => [
    `${hubName()}.imu.tilt()[${block.getFieldValue('AXIS') as string}]`,
    Order.MEMBER,
  ];
  forBlock['mp_timer'] = () => call(`${timerName()}.time()`);
  forBlock['mp_timer_reset'] = () => `${timerName()}.reset()\n`;

  // Flow
  forBlock['mp_wait'] = (block) => {
    need('pybricks.tools', 'wait');
    return `wait(${arg(block, 'TIME')})\n`;
  };
  forBlock['mp_wait_until'] = (block) => {
    need('pybricks.tools', 'wait');
    const condition = g.valueToCode(block, 'CONDITION', Order.LOGICAL_NOT) || 'False';
    return `while not ${condition}:\n${INDENT}wait(10)\n`;
  };
  forBlock['mp_forever'] = (block) => {
    const body = g.statementToCode(block, 'DO') || g.PASS;
    return `while True:\n${body}`;
  };
  forBlock['mp_stop_program'] = () => 'raise SystemExit\n';

  // Other
  forBlock['mp_print'] = (block) => `print(${arg(block, 'VALUE', "''")})\n`;
  forBlock['mp_plot'] = (block) =>
    `print("${cleanPlotLabel(block.getFieldValue('LABEL') as string)}:", ${arg(block, 'VALUE')})\n`;

  // Blockly's own Python for "change by" imports `numbers`, which MicroPython does not have.
  // Variables start at 0 (generateProgram), so a plain += is safe.
  forBlock['math_change'] = (block) =>
    `${name(block, 'VAR')} += ${g.valueToCode(block, 'DELTA', Order.NONE) || '0'}\n`;

  // "repeat forever" is a loop, so "break out of loop" may be used inside it.
  (loops as { loopTypes?: Set<string> }).loopTypes?.add('mp_forever');
}

/** The devices in the "set up" block, in order. */
export function listSetUpDevices(workspace: Blockly.Workspace): SetUpDevice[] {
  const devices: SetUpDevice[] = [];
  for (const setup of workspace.getBlocksByType('mp_setup', true)) {
    let block = setup.getInputTargetBlock('DEVICES');
    while (block) {
      const field = block.getField('VAR');
      const variable = field instanceof Blockly.FieldVariable ? field.getVariable() : null;
      if (variable && isDeviceType(variable.getType()) && block.isEnabled()) {
        devices.push({
          blockId: block.id,
          variableId: variable.getId(),
          type: variable.getType() as DeviceType,
          name: variable.getName(),
          port: block.getFieldValue('PORT') as PortName,
          counterclockwise: block.getFieldValue('DIRECTION') === 'COUNTERCLOCKWISE',
        });
      }
      block = block.getNextBlock();
    }
  }
  return devices;
}

/** Problems with the set-up devices themselves: duplicates and shared ports. */
function setupProblems(devices: readonly SetUpDevice[]): Problem[] {
  const problems: Problem[] = [];
  const byVariable = new Map<string, SetUpDevice>();
  const byPort = new Map<PortName, SetUpDevice>();
  for (const device of devices) {
    const twin = byVariable.get(device.variableId);
    if (twin) {
      problems.push({
        blockId: device.blockId,
        message: `“${device.name}” is set up twice. Remove one of the two set-up blocks.`,
      });
      continue;
    }
    byVariable.set(device.variableId, device);
    const other = byPort.get(device.port);
    if (other) {
      problems.push({
        blockId: device.blockId,
        message: `Port ${device.port} is already used by “${other.name}”. Choose another port.`,
      });
    } else {
      byPort.set(device.port, device);
    }
  }
  return problems;
}

/** Device blocks under the program that use a device nobody set up. */
function usageProblems(program: Blockly.Block, devices: readonly SetUpDevice[]): Problem[] {
  const known = new Set(devices.map((device) => device.variableId));
  const problems: Problem[] = [];
  for (const block of program.getDescendants(false)) {
    if (!block.isEnabled()) continue;
    for (const input of block.inputList) {
      for (const field of input.fieldRow) {
        if (!(field instanceof Blockly.FieldVariable)) continue;
        const variable = field.getVariable();
        if (!variable || !isDeviceType(variable.getType()) || known.has(variable.getId())) continue;
        const label = DEVICES[variable.getType() as DeviceType].label;
        problems.push({
          blockId: block.id,
          message: `“${variable.getName()}” is not set up. Add a ${label} for it in the “set up” block.`,
        });
      }
    }
  }
  return problems;
}

function importLines(from: Map<string, Set<string>>, extra: readonly string[]): string[] {
  const plain = [...new Set(extra.filter((line) => line.startsWith('import ')))].sort();
  const pybricks = [...from.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([module, names]) => `from ${module} import ${[...names].sort().join(', ')}`);
  return [...plain, ...pybricks];
}

/**
 * Generates the program. Problems never throw: the code is still returned so the user can see
 * it, and the page refuses to run it until the problems are fixed.
 */
export function generateProgram(workspace: Blockly.Workspace): GeneratedProgram {
  registerGenerators();
  const g = pythonGenerator;
  const problems: Problem[] = [];
  needs = { from: new Map(), hub: false, timer: false };
  try {
    g.init(workspace);
    const programs = workspace.getBlocksByType('mp_program', true);
    const setups = workspace.getBlocksByType('mp_setup', true);
    if (programs.length === 0) {
      problems.push({ blockId: null, message: 'Add a “when the program starts” block.' });
    }
    for (const extra of programs.slice(1)) {
      problems.push({
        blockId: extra.id,
        message: 'Use only one “when the program starts” block.',
      });
    }
    for (const extra of setups.slice(1)) {
      problems.push({ blockId: extra.id, message: 'Use only one “set up” block.' });
    }

    const devices = listSetUpDevices(workspace);
    problems.push(...setupProblems(devices));
    const program = programs[0];
    let body = '';
    if (program) {
      problems.push(...usageProblems(program, devices));
      body = g.blockToCode(program) as string;
    }

    // Variables the program uses start at 0, so "change by" works on a fresh variable.
    const variables = Blockly.Variables.allUsedVarModels(workspace)
      .filter((variable) => variable.getType() === '')
      .map((variable) => `${g.getVariableName(variable.getId())} = 0`);

    const unique = devices.filter(
      (device, index) => devices.findIndex((d) => d.variableId === device.variableId) === index,
    );
    const config: string[] = [];
    const setup: string[] = [];
    if (needs.hub) setup.push('hub = PrimeHub()');
    for (const device of unique) {
      const python = g.getVariableName(device.variableId);
      const constant = `${python.toUpperCase()}_PORT`;
      const { pythonClass } = DEVICES[device.type];
      need('pybricks.parameters', 'Port');
      need('pybricks.pupdevices', pythonClass);
      config.push(`${constant} = Port.${device.port}`);
      if (device.type === 'Motor' && device.counterclockwise) {
        need('pybricks.parameters', 'Direction');
        setup.push(
          `${python} = ${pythonClass}(${constant}, positive_direction=Direction.COUNTERCLOCKWISE)`,
        );
      } else {
        setup.push(`${python} = ${pythonClass}(${constant})`);
      }
    }
    if (needs.timer) setup.push('timer = StopWatch()');
    setup.push(...variables);

    const motors = unique
      .filter((device) => device.type === 'Motor')
      .map((device) => g.getVariableName(device.variableId));
    const main = body.trimEnd() === '' ? 'pass' : body.trimEnd();
    const mainLines =
      motors.length > 0
        ? [
            'try:',
            g.prefixLines(main, INDENT),
            'finally:',
            ...motors.map((motor) => `${INDENT}${motor}.stop()`),
          ]
        : [main];

    const definitions = Object.values(
      (g as unknown as { definitions_: Record<string, string> }).definitions_,
    );
    const sections = [
      ['# Generated by MatPilot from blocks.', ...importLines(needs.from, definitions)],
      config.length > 0 ? [rule('Config'), ...config] : [],
      setup.length > 0 ? [rule('Setup'), ...setup] : [],
      [rule('Main'), ...mainLines],
    ].filter((section) => section.length > 0);
    const code = `${sections.map((section) => section.join('\n')).join('\n\n')}\n`;
    return { code, problems };
  } finally {
    needs = null;
  }
}
