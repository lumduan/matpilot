/**
 * Turns a block workspace into a Pybricks MicroPython program (ADR 0008, ADR 0010).
 *
 * The program always has the shape of the hub code rules in CLAUDE.md:
 * - every port is assigned once, in the Config section, and used by name (rules 3 and 4);
 * - devices are created once, in the Setup section: from the "set up" block, and, for the simple
 *   blocks, one per port they use (`motor_a`) plus the drive base;
 * - when any motor is created, the main program runs inside `try`/`finally`, and `finally` stops
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
import {
  INDENT,
  PORT_DEVICES,
  ROBOT,
  SIMPLE_RESERVED,
  beginNeeds,
  endNeeds,
  hubName,
  motorSpeedName,
  need,
  portDeviceName,
  timerName,
  variableName as name,
  arg,
  type Needs,
  type PortUse,
} from './generator-context';
import { DEVICES, isDeviceType, type DeviceType, type PortName } from './pybricks';
import { registerSimpleGenerators } from './simple-generator';

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
  ...SIMPLE_RESERVED,
];

/** Section headings, in the same style as the hand-written examples. */
function rule(title: string): string {
  return `# --- ${title} `.padEnd(76, '-');
}

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
  registerSimpleGenerators();

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

/** The drive base of the simple blocks: ports from "set movement motors", sizes in mm. */
interface Movement {
  readonly left: PortName;
  readonly right: PortName;
  readonly wheelDiameterMm: number;
  readonly axleTrackMm: number;
  /** The "set movement motors" block, if there is one. */
  readonly blockId: string | null;
}

/** MatPilot's defaults: the bench layout's A and B; the wheels of the SPIKE Prime set. */
export const DEFAULT_MOVEMENT: Movement = {
  left: 'A',
  right: 'B',
  wheelDiameterMm: 56,
  axleTrackMm: 112,
  blockId: null,
};

/** Reads "set movement motors" and "set wheel size" from the program; they apply to all of it. */
function movementSettings(program: Blockly.Block, problems: Problem[]): Movement {
  let movement = DEFAULT_MOVEMENT;
  let motors: Blockly.Block | null = null;
  let wheels: Blockly.Block | null = null;
  for (const block of program.getDescendants(true)) {
    if (!block.isEnabled()) continue;
    if (block.type === 'mp_move_motors') {
      const ports = block.getFieldValue('PORTS') as string;
      if (!motors) {
        motors = block;
        movement = {
          ...movement,
          left: ports[0] as PortName,
          right: ports[1] as PortName,
          blockId: block.id,
        };
      } else if (ports !== motors.getFieldValue('PORTS')) {
        problems.push({
          blockId: block.id,
          message:
            'The movement motors are set twice, to different ports. Keep one “set movement motors” block.',
        });
      }
    } else if (block.type === 'mp_move_wheels') {
      const wheel = Number(block.getFieldValue('WHEEL'));
      const track = Number(block.getFieldValue('TRACK'));
      if (!wheels) {
        wheels = block;
        movement = { ...movement, wheelDiameterMm: wheel, axleTrackMm: track };
      } else if (
        wheel !== Number(wheels.getFieldValue('WHEEL')) ||
        track !== Number(wheels.getFieldValue('TRACK'))
      ) {
        problems.push({
          blockId: block.id,
          message:
            'The wheel size is set twice, to different sizes. Keep one “set wheel size” block.',
        });
      }
    }
  }
  return movement;
}

/**
 * Problems with the ports the simple blocks use: a port the "set up" block already uses, a drive
 * motor's port, or one port used for two kinds of device. Returns the problems and the devices to
 * create, one per port.
 */
function portProblems(
  uses: readonly PortUse[],
  devices: readonly SetUpDevice[],
  movement: Movement | null,
  robotBlockId: string | null,
): { problems: Problem[]; ports: Map<PortName, PortUse> } {
  const problems: Problem[] = [];
  const seen = new Set<string>();
  const add = (blockId: string | null, message: string) => {
    const key = `${blockId ?? ''}|${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    problems.push({ blockId, message });
  };
  const setUp = new Map<PortName, SetUpDevice>();
  for (const device of devices) if (!setUp.has(device.port)) setUp.set(device.port, device);
  const wheels = movement
    ? new Map<PortName, string>([
        [movement.left, 'left'],
        [movement.right, 'right'],
      ])
    : new Map<PortName, string>();
  if (movement) {
    for (const [port, side] of wheels) {
      const device = setUp.get(port);
      if (device) {
        add(
          movement.blockId ?? robotBlockId,
          `Port ${port} is set up as “${device.name}”, so it cannot also drive the ${side} wheel. Choose other movement motors.`,
        );
      }
    }
  }
  const ports = new Map<PortName, PortUse>();
  for (const use of uses) {
    const label = PORT_DEVICES[use.kind].label;
    const device = setUp.get(use.port);
    const side = wheels.get(use.port);
    const earlier = ports.get(use.port);
    if (device) {
      add(
        use.blockId,
        `Port ${use.port} is set up as “${device.name}” in the “set up” block. Use the “${device.name}” blocks, or choose another port.`,
      );
    } else if (movement && side) {
      add(
        use.blockId,
        `Port ${use.port} drives the robot’s ${side} wheel (movement motors ${movement.left} + ${movement.right}). Choose another port for this ${label}, or change “set movement motors”.`,
      );
    } else if (!earlier) {
      ports.set(use.port, use);
    } else if (earlier.kind !== use.kind) {
      add(
        use.blockId,
        `Port ${use.port} is used for a ${PORT_DEVICES[earlier.kind].label} in another block. One port holds one device.`,
      );
    }
  }
  return { problems, ports };
}

function importLines(needs: Needs, extra: readonly string[]): string[] {
  const plain = [
    ...new Set([
      ...extra.filter((line) => line.startsWith('import ')),
      ...[...needs.imports].map((module) => `import ${module}`),
    ]),
  ].sort();
  const pybricks = [...needs.from.entries()]
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
  const needs = beginNeeds();
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
    let movement = DEFAULT_MOVEMENT;
    if (program) {
      problems.push(...usageProblems(program, devices));
      movement = movementSettings(program, problems);
      body = g.blockToCode(program) as string;
    }
    const robot = needs.robotUses.length > 0;
    const ports = portProblems(
      needs.portUses,
      devices,
      robot ? movement : null,
      needs.robotUses[0] ?? null,
    );
    problems.push(...ports.problems);

    // Variables the program uses start at 0, so "change by" works on a fresh variable.
    const variables = Blockly.Variables.allUsedVarModels(workspace)
      .filter((variable) => variable.getType() === '')
      .map((variable) => `${g.getVariableName(variable.getId())} = 0`);

    const unique = devices.filter(
      (device, index) => devices.findIndex((d) => d.variableId === device.variableId) === index,
    );
    const config: string[] = [];
    const setup: string[] = [];
    const motors: string[] = [];
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
      if (device.type === 'Motor') motors.push(python);
    }

    // The simple blocks' devices, one per port, in port order.
    for (const use of [...ports.ports.values()].sort((a, b) => a.port.localeCompare(b.port))) {
      const python = portDeviceName(use.kind, use.port);
      const constant = `${python.toUpperCase()}_PORT`;
      const { pythonClass } = PORT_DEVICES[use.kind];
      need('pybricks.parameters', 'Port');
      need('pybricks.pupdevices', pythonClass);
      config.push(`${constant} = Port.${use.port}`);
      setup.push(`${python} = ${pythonClass}(${constant})`);
      if (use.kind === 'Motor') {
        motors.push(python);
        // Until "set motor speed" runs, half the motor's top speed (degrees per second).
        if (needs.speeds.has(use.port)) {
          setup.push(`${motorSpeedName(use.port)} = ${python}.control.limits()[0] * 50 // 100`);
        }
      }
    }

    // The drive base. The left motor is mounted mirrored, so it counts counterclockwise as forward.
    if (robot) {
      need('pybricks.parameters', 'Port');
      need('pybricks.parameters', 'Direction');
      need('pybricks.pupdevices', 'Motor');
      need('pybricks.robotics', 'DriveBase');
      config.push(
        `${ROBOT.leftPort} = Port.${movement.left}`,
        `${ROBOT.rightPort} = Port.${movement.right}`,
        `${ROBOT.wheelDiameter} = ${movement.wheelDiameterMm}`,
        `${ROBOT.axleTrack} = ${movement.axleTrackMm}`,
      );
      setup.push(
        `${ROBOT.left} = Motor(${ROBOT.leftPort}, positive_direction=Direction.COUNTERCLOCKWISE)`,
        `${ROBOT.right} = Motor(${ROBOT.rightPort})`,
        `${ROBOT.robot} = DriveBase(${ROBOT.left}, ${ROBOT.right}, ${ROBOT.wheelDiameter}, ${ROBOT.axleTrack})`,
      );
      motors.push(ROBOT.left, ROBOT.right);
    }
    if (needs.timer) setup.push('timer = StopWatch()');
    setup.push(...variables);

    const main = body.trimEnd() === '' ? 'pass' : body.trimEnd();
    const stops = [
      ...(robot ? [`${INDENT}${ROBOT.robot}.stop()`] : []),
      ...motors.map((motor) => `${INDENT}${motor}.stop()`),
    ];
    const mainLines =
      motors.length > 0 ? ['try:', g.prefixLines(main, INDENT), 'finally:', ...stops] : [main];

    const definitions = Object.values(
      (g as unknown as { definitions_: Record<string, string> }).definitions_,
    );
    const helpers = [...needs.helpers.values()];
    const sections = [
      ['# Generated by MatPilot from blocks.', ...importLines(needs, definitions)],
      config.length > 0 ? [rule('Config'), ...config] : [],
      setup.length > 0 ? [rule('Setup'), ...setup] : [],
      helpers.length > 0 ? [rule('Helpers'), helpers.join('\n\n\n')] : [],
      [rule('Main'), ...mainLines],
    ].filter((section) => section.length > 0);
    const code = `${sections.map((section) => section.join('\n')).join('\n\n')}\n`;
    return { code, problems };
  } finally {
    endNeeds();
  }
}
