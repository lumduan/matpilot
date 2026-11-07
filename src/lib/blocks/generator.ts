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
 * A program in tabs (ADR 0013) becomes several files when a tab other than main holds functions:
 * setup.py has the Config, Setup, Shared variables and Helpers sections, every tab is a module of
 * its own, and main.py imports them and runs the Main section. A program with functions in main
 * only stays one file, with a Functions section before Main.
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
  type ControllerControl,
  type Needs,
  type PortUse,
} from './generator-context';
import {
  FUNCTION_BLOCKS,
  beginFunctionGeneration,
  collectFunctions,
  endFunctionGeneration,
  functionProblems,
  registerFunctionGenerators,
  type FunctionInfo,
} from './functions';
import { DEVICES, PORTS, isDeviceType, type DeviceType, type PortName } from './pybricks';
import { registerSharedGenerators, sharedProblems, usedSharedVariables } from './shared';
import { SETUP_MODULE, programTabsOf, type ProgramTab } from './tabs';
import { DEFAULT_CONTROLLER, controllerProfile, type ControllerId } from '../controller/layout';
import {
  controllerConfig,
  controllerSetup,
  registerControllerGenerators,
} from './controller-generator';
import { registerSimpleGenerators } from './simple-generator';

export interface Problem {
  /** The block to mark, or `null` for a problem with the program as a whole. */
  readonly blockId: string | null;
  readonly message: string;
  /** The tab the block is in (main for a problem with the program as a whole). */
  readonly tabId: string;
}

/** A problem before the generator knows which tab its block is in. */
type DraftProblem = Omit<Problem, 'tabId'> & { readonly tabId?: string };

/** One Python file of the program. */
export interface PythonFile {
  /** `main.py`, `setup.py`, or the tab's name and `.py`. */
  readonly name: string;
  /** The module the hub imports it as: main is `__main__` (./../pybricks/mpy.ts). */
  readonly module: string;
  /** The tab it is made from; `null` for setup.py. */
  readonly tabId: string | null;
  readonly code: string;
}

export interface GeneratedProgram {
  /** main.py: the whole program when it is one file. */
  readonly code: string;
  /** Every file, main.py first. One file unless a tab other than main holds functions. */
  readonly files: readonly PythonFile[];
  /** Anything that must be fixed before the program can run. */
  readonly problems: readonly Problem[];
  /** The program reads the Xbox controller, so the page offers its live view (ADR 0012). */
  readonly usesController: boolean;
  /** The controller it uses, when it uses one. */
  readonly controller: ControllerId | null;
  /** What each control does in this program, for the Controller pane. */
  readonly controls: readonly ControllerControl[];
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
  // The module every tab imports in a program of several files (ADR 0013).
  SETUP_MODULE,
  ...SIMPLE_RESERVED,
];

/** Section headings, in the same style as the hand-written examples (read by ./from-python). */
export function rule(title: string): string {
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
  registerControllerGenerators();
  registerFunctionGenerators();
  registerSharedGenerators();

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
function setupProblems(devices: readonly SetUpDevice[]): DraftProblem[] {
  const problems: DraftProblem[] = [];
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

/** Device blocks in the program and its functions that use a device nobody set up. */
function usageProblems(
  roots: readonly Blockly.Block[],
  devices: readonly SetUpDevice[],
): DraftProblem[] {
  const known = new Set(devices.map((device) => device.variableId));
  const problems: DraftProblem[] = [];
  for (const block of roots.flatMap((root) => root.getDescendants(false))) {
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

/**
 * Reads "set movement motors" and "set wheel size" from the program and its functions, in every
 * tab; they apply to all of it.
 */
function movementSettings(roots: readonly Blockly.Block[], problems: DraftProblem[]): Movement {
  let movement = DEFAULT_MOVEMENT;
  let motors: Blockly.Block | null = null;
  let wheels: Blockly.Block | null = null;
  for (const block of roots.flatMap((root) => root.getDescendants(true))) {
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
): { problems: DraftProblem[]; ports: Map<PortName, PortUse> } {
  const problems: DraftProblem[] = [];
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

/** `code` with its strings and comments blanked out, so only names are left to find. */
function withoutStrings(code: string): string {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < code.length; i += 1) {
    const char = code[i]!;
    if (quote) {
      if (char === '\\') {
        i += 1;
      } else if (char === quote || char === '\n') {
        quote = null;
        out += char === '\n' ? '\n' : ' ';
      }
      continue;
    }
    if (char === '#') {
      while (i + 1 < code.length && code[i + 1] !== '\n') i += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      out += ' ';
      continue;
    }
    out += char;
  }
  return out;
}

/** The names `code` uses on their own (not `x.name`), outside strings and comments. */
export function namesIn(code: string): Set<string> {
  return new Set(withoutStrings(code).match(/(?<![\w.])[A-Za-z_]\w*/g) ?? []);
}

/**
 * The names a file defines at module level: assignments outside functions (also inside a
 * module-level `try:`), and `def` names. Lines inside brackets continue the line before.
 */
export function topLevelNames(code: string): string[] {
  const names: string[] = [];
  let depth = 0;
  let inDef = false;
  for (const line of withoutStrings(code).split('\n')) {
    const trimmed = line.trim();
    if (depth === 0 && trimmed !== '') {
      const indented = /^\s/.test(line);
      if (!indented) {
        const def = /^def\s+([A-Za-z_]\w*)/.exec(trimmed);
        inDef = def !== null;
        if (def) names.push(def[1]!);
      }
      const assign = inDef ? null : /^([A-Za-z_]\w*)\s*=(?!=)/.exec(trimmed);
      if (assign) names.push(assign[1]!);
    }
    for (const char of line) {
      if ('([{'.includes(char)) depth += 1;
      else if (')]}'.includes(char)) depth = Math.max(0, depth - 1);
    }
  }
  return [...new Set(names)];
}

/** The import lines of one file of a multi-file program, from the names it uses. */
function fileImports(
  code: string,
  needs: Needs,
  blocklyImports: readonly string[],
  setupNames: readonly string[] | null,
  tabModules: readonly string[],
): string[] {
  const names = namesIn(code);
  const usesModule = (module: string) =>
    new RegExp(`(?<![\\w.])${module}\\.`).test(withoutStrings(code));
  const plain = [
    ...new Set([
      ...blocklyImports.filter((line) => line.startsWith('import ')),
      ...[...needs.imports].filter(usesModule).map((module) => `import ${module}`),
    ]),
  ].sort();
  const pybricks = [...needs.from.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([module, all]) => [module, [...all].filter((name) => names.has(name)).sort()] as const)
    .filter(([, used]) => used.length > 0)
    .map(([module, used]) => `from ${module} import ${used.join(', ')}`);
  const local: string[] = [];
  if (setupNames) {
    const used = setupNames.filter((name) => names.has(name)).sort();
    if (used.length > 0) local.push(`from ${SETUP_MODULE} import ${used.join(', ')}`);
    if (usesModule(SETUP_MODULE)) local.push(`import ${SETUP_MODULE}`);
  }
  local.push(...tabModules.map((module) => `import ${module}`));
  const outside = [...plain, ...pybricks];
  return outside.length > 0 && local.length > 0
    ? [...outside, '', ...local]
    : [...outside, ...local];
}

/** Sections of a file, each a heading and its lines; empty sections are left out. */
function joinSections(sections: readonly (readonly string[])[]): string {
  return `${sections
    .filter((section) => section.length > 0)
    .map((section) => section.join('\n'))
    .join('\n\n')}\n`;
}

/** What one tab made: its functions, its variables, and what it imports. */
interface TabCode {
  readonly tab: ProgramTab;
  readonly functions: readonly string[];
  readonly functionNames: readonly string[];
  /** `x = 0` for each variable the tab uses. */
  readonly variables: readonly string[];
  readonly variableNames: readonly string[];
  /** `import ...` lines Blockly's own blocks asked for. */
  readonly blocklyImports: readonly string[];
  /** Tabs whose functions it calls. */
  readonly tabImports: ReadonlySet<string>;
}

const enabledDefinitions = (tab: ProgramTab) =>
  tab.workspace.getBlocksByType(FUNCTION_BLOCKS.define, true).filter((block) => block.isEnabled());

/**
 * Generates one tab: `g.init`, then `generateMore` (the main tab's program), then its functions.
 * The tab's variables start at 0. `globals` are the file's other module names a function may
 * change, so it says `global` for them: when the program is one file, the motor speeds and the
 * shared variables.
 */
function generateTab(
  tab: ProgramTab,
  functions: ReadonlyMap<string, FunctionInfo>,
  globals: readonly string[],
  generateMore: () => void = () => undefined,
): TabCode {
  const g = pythonGenerator;
  g.init(tab.workspace);
  const variableIds = Blockly.Variables.allUsedVarModels(tab.workspace)
    .filter((variable) => variable.getType() === '')
    .map((variable) => variable.getId());
  const variableNames = variableIds.map((id) => g.getVariableName(id));
  const imports = new Set<string>();
  beginFunctionGeneration({
    functions,
    tab,
    moduleNames: [...variableNames, ...globals],
    imports,
  });
  try {
    generateMore();
    const definitions = enabledDefinitions(tab);
    const code = definitions.map((block) => (g.blockToCode(block) as string).trimEnd());
    const blocklyImports = Object.values(
      (g as unknown as { definitions_: Record<string, string> }).definitions_,
    ).filter((line) => line.startsWith('import '));
    imports.delete(tab.name);
    return {
      tab,
      functions: code,
      functionNames: definitions.map((block) => block.getFieldValue('NAME') as string),
      variables: variableNames.map((name) => `${name} = 0`),
      variableNames,
      blocklyImports,
      tabImports: imports,
    };
  } finally {
    endFunctionGeneration();
  }
}

/** A variable with the name of a function or a tab the same file uses. */
function nameClashes(code: TabCode, modules: readonly string[]): DraftProblem[] {
  const problems: DraftProblem[] = [];
  for (const name of code.variableNames) {
    if (code.functionNames.includes(name)) {
      problems.push({
        tabId: code.tab.id,
        blockId: null,
        message: `The variable “${name}” has the same name as the function “${name}”. Rename one of them.`,
      });
    }
    if (modules.includes(name)) {
      problems.push({
        tabId: code.tab.id,
        blockId: null,
        message: `The variable “${name}” has the same name as the tab “${name}”. Rename one of them.`,
      });
    }
  }
  return problems;
}

/** Puts each problem in the tab its block is in. */
function placeProblems(drafts: readonly DraftProblem[], tabs: readonly ProgramTab[]): Problem[] {
  const mainId = tabs[0]?.id ?? 'main';
  return drafts.map((draft) => ({
    blockId: draft.blockId,
    message: draft.message,
    tabId:
      draft.tabId ??
      (draft.blockId
        ? tabs.find((tab) => tab.workspace.getBlockById(draft.blockId!))?.id
        : undefined) ??
      mainId,
  }));
}

/**
 * Generates the program of the tab `workspace` belongs to (./tabs.ts): every tab, main first.
 * A workspace on its own is a program with one tab.
 */
export function generateProgram(workspace: Blockly.Workspace): GeneratedProgram {
  return generateTabs(programTabsOf(workspace));
}

/**
 * Generates a program in tabs, main first. Problems never throw: the code is still returned so
 * the user can see it, and the page refuses to run it until the problems are fixed.
 */
export function generateTabs(tabs: readonly ProgramTab[]): GeneratedProgram {
  registerGenerators();
  const g = pythonGenerator;
  const problems: DraftProblem[] = [];
  const needs = beginNeeds();
  const main = tabs[0];
  if (!main) throw new Error('A program has at least the main tab.');
  const others = tabs.slice(1);
  try {
    const functions = collectFunctions(tabs);
    // Tabs with functions become modules; with none, the program stays one file.
    const moduleTabs = others.filter((tab) => enabledDefinitions(tab).length > 0);
    const multi = moduleTabs.length > 0;
    needs.qualifySetup = multi;

    // Shared variables: named once, in main's names (./shared.ts).
    const shared = usedSharedVariables(tabs);
    g.init(main.workspace);
    for (const variable of shared) {
      needs.sharedNames.set(
        variable.id,
        main.workspace.getVariableMap().getVariableById(variable.id)
          ? g.getVariableName(variable.id)
          : g.nameDB_!.getDistinctName(variable.name, Blockly.Names.NameType.VARIABLE),
      );
    }
    const sharedLines = [...needs.sharedNames.values()].map((name) => `${name} = 0`);
    const globals = multi ? [] : [...PORTS.map(motorSpeedName), ...needs.sharedNames.values()];

    // Blocks that belong in main only.
    for (const tab of others) {
      for (const block of tab.workspace.getBlocksByType('mp_program', false)) {
        problems.push({
          tabId: tab.id,
          blockId: block.id,
          message: '“when the program starts” belongs in the main tab. Delete this one.',
        });
      }
      for (const block of tab.workspace.getBlocksByType('mp_setup', false)) {
        problems.push({
          tabId: tab.id,
          blockId: block.id,
          message:
            'The “set up” block belongs in the main tab. Every tab can use the devices set up there.',
        });
      }
    }

    // --- main: the program, its functions, and the set-up devices' names --------------------
    const programs = main.workspace.getBlocksByType('mp_program', true);
    const setups = main.workspace.getBlocksByType('mp_setup', true);
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

    const devices = listSetUpDevices(main.workspace);
    problems.push(...setupProblems(devices));
    const unique = devices.filter(
      (device, index) => devices.findIndex((d) => d.variableId === device.variableId) === index,
    );
    const program = programs[0];
    // The program and every function, in every tab: what the program may run.
    const roots = [
      ...(program ? [program] : []),
      ...tabs.flatMap((tab) => enabledDefinitions(tab)),
    ];
    problems.push(...usageProblems(roots, devices));
    const movement = movementSettings(roots, problems);
    let body = '';
    const deviceNames = new Map<string, string>();
    const mainCode = generateTab(main, functions, globals, () => {
      if (program) body = g.blockToCode(program) as string;
      for (const device of unique) {
        deviceNames.set(device.variableId, g.getVariableName(device.variableId));
      }
    });
    const tabCodes = moduleTabs.map((tab) => generateTab(tab, functions, globals));
    problems.push(...functionProblems(tabs, functions));
    problems.push(...sharedProblems(tabs, functions, needs.sharedNames));

    const robot = needs.robotUses.length > 0;
    const ports = portProblems(
      needs.portUses,
      devices,
      robot ? movement : null,
      needs.robotUses[0] ?? null,
    );
    problems.push(...ports.problems);

    const config: string[] = [];
    const setup: string[] = [];
    const motors: string[] = [];
    if (needs.hub) setup.push('hub = PrimeHub()');
    for (const device of unique) {
      const python = deviceNames.get(device.variableId) ?? g.getVariableName(device.variableId);
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
    // The controller last: if it is not found, nothing has moved yet (ADR 0012).
    const usesController = needs.controllerUses.length > 0;
    const chosen = needs.controllerChoices[0]?.id ?? DEFAULT_CONTROLLER;
    for (const other of needs.controllerChoices.slice(1)) {
      if (other.id !== chosen) {
        problems.push({
          blockId: other.blockId,
          message: `The program uses the ${controllerProfile(chosen).short} controller in another “use the controller” block. Use one controller.`,
        });
      }
    }
    if (usesController) {
      config.push(...controllerConfig());
      setup.push(...controllerSetup());
    }

    // A function may not share a name with a set-up device either.
    for (const info of functions.values()) {
      if (info.enabled && [...deviceNames.values()].includes(info.name)) {
        problems.push({
          tabId: info.tab.id,
          blockId: info.id,
          message: `“${info.name}” is also the name of a device in the “set up” block. Rename the function.`,
        });
      }
    }

    const main_ = body.trimEnd() === '' ? 'pass' : body.trimEnd();
    const stops = [
      ...(robot ? [`${INDENT}${ROBOT.robot}.stop()`] : []),
      ...motors.map((motor) => `${INDENT}${motor}.stop()`),
    ];
    const mainLines =
      motors.length > 0 ? ['try:', g.prefixLines(main_, INDENT), 'finally:', ...stops] : [main_];
    const helpers = [...needs.helpers.values()];
    const configSection = config.length > 0 ? [rule('Config'), ...config] : [];
    const helperSection = helpers.length > 0 ? [rule('Helpers'), helpers.join('\n\n\n')] : [];
    const functionSection = (code: TabCode) =>
      code.functions.length > 0 ? [rule('Functions'), code.functions.join('\n\n\n')] : [];

    const files: PythonFile[] = [];
    const moduleNames = moduleTabs.map((tab) => tab.name);
    if (!multi) {
      // One file, as before tabs: Config, Setup (with the variables), Helpers, Functions, Main.
      setup.push(...mainCode.variables, ...sharedLines);
      const code = joinSections([
        ['# Generated by MatPilot from blocks.', ...importLines(needs, mainCode.blocklyImports)],
        configSection,
        setup.length > 0 ? [rule('Setup'), ...setup] : [],
        helperSection,
        functionSection(mainCode),
        [rule('Main'), ...mainLines],
      ]);
      files.push({ name: 'main.py', module: '__main__', tabId: main.id, code });
      problems.push(...nameClashes(mainCode, []));
    } else {
      // setup.py: what every tab uses.
      const setupBody = joinSections([
        configSection,
        setup.length > 0 ? [rule('Setup'), ...setup] : [],
        sharedLines.length > 0 ? [rule('Shared variables'), ...sharedLines] : [],
        helperSection,
      ]);
      const setupNames = topLevelNames(setupBody);
      const setupFile: PythonFile = {
        name: `${SETUP_MODULE}.py`,
        module: SETUP_MODULE,
        tabId: null,
        code: joinSections([
          [
            sharedLines.length > 0
              ? '# Generated by MatPilot from blocks: the ports, devices, helpers and shared variables every tab uses.'
              : '# Generated by MatPilot from blocks: the ports, devices and helpers every tab uses.',
            ...fileImports(setupBody, needs, [], null, []),
          ],
          [setupBody.trimEnd()],
        ]),
      };

      const tabFile = (code: TabCode, isMain: boolean): string => {
        const bodyText = joinSections([
          code.variables.length > 0 ? [rule('Variables'), ...code.variables] : [],
          functionSection(code),
          isMain ? [rule('Main'), ...mainLines] : [],
        ]);
        // Main imports every tab with functions; a tab imports the tabs it uses.
        const tabImports = isMain
          ? moduleNames
          : moduleNames.filter((name) => code.tabImports.has(name));
        const header = isMain
          ? '# Generated by MatPilot from blocks: the main tab, where the program starts.'
          : `# Generated by MatPilot from blocks: the tab “${code.tab.name}”.`;
        return joinSections([
          [header, ...fileImports(bodyText, needs, code.blocklyImports, setupNames, tabImports)],
          [bodyText.trimEnd()],
        ]);
      };
      // main.py first: the hub runs the first module (../pybricks/mpy.ts).
      files.push({
        name: 'main.py',
        module: '__main__',
        tabId: main.id,
        code: tabFile(mainCode, true),
      });
      problems.push(...nameClashes(mainCode, moduleNames));
      for (const code of tabCodes) {
        files.push({
          name: `${code.tab.name}.py`,
          module: code.tab.name,
          tabId: code.tab.id,
          code: tabFile(code, false),
        });
        problems.push(...nameClashes(code, moduleNames));
      }
      // A program with no ports, devices, helpers or shared variables needs no setup.py.
      if (setupBody.trim() !== '') files.push(setupFile);
    }

    const controls = usesController
      ? [
          ...needs.controllerControls,
          { control: 'Menu ☰', action: 'stops the program', fingers: ['right thumb'] },
        ]
      : [];
    return {
      code: files[0]!.code,
      files,
      problems: placeProblems(problems, tabs),
      usesController,
      controller: usesController ? controllerProfile(chosen).id : null,
      controls,
    };
  } finally {
    endNeeds();
  }
}
