import * as Blockly from 'blockly/core';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { compilePython } from '@/lib/pybricks/compiler';
import { INPUT_OPTIONS } from '../controller/layout';
import { parseControllerLine, XBOX_BUTTONS } from '../controller/xbox';
import { NOT_FOUND_HELP } from './controller-generator';
import { CHECKABLE_BUTTONS } from './fields/controller';
import { FieldMotorSet, describeMotorSet, parseMotorSet } from './fields/port';
import { generateProgram } from './generator';
import { loadWorkspace, registerBlocks } from './register';
import { controllerFlyout } from './simple-toolbox';

type State = Record<string, unknown>;

function chain(blocks: State[]): State | undefined {
  return blocks.reduceRight<State | undefined>(
    (next, block) => (next ? { ...block, next: { block: next } } : block),
    undefined,
  );
}

const forever = (blocks: State[]): State => ({
  type: 'mp_forever',
  inputs: { DO: { block: chain(blocks) } },
});

function generate(blocks: State[]) {
  const workspace = new Blockly.Workspace();
  try {
    const body = chain(blocks);
    loadWorkspace(workspace, {
      blocks: {
        languageVersion: 0,
        blocks: [{ type: 'mp_program', x: 0, y: 0, ...(body ? { next: { block: body } } : {}) }],
      },
    });
    return generateProgram(workspace);
  } finally {
    workspace.dispose();
  }
}

async function expectCompiles(code: string) {
  const outcome = await compilePython(code);
  expect(
    outcome.ok,
    outcome.ok ? '' : `${outcome.error.message} (line ${outcome.error.line})\n${code}`,
  ).toBe(true);
}

beforeAll(() => registerBlocks());

// The compiler's Emscripten loader reads the .wasm from disk only when fetch is absent.
beforeEach(() => {
  vi.stubGlobal('fetch', undefined);
});

describe('controller blocks', () => {
  it('drive with one stick: the controller is connected in Setup and read in a helper', async () => {
    const { code, problems } = generate([
      forever([{ type: 'mp_ctrl_drive', fields: { STYLE: 'ONE_STICK' } }]),
    ]);
    expect(problems).toEqual([]);
    expect(code).toContain('from pybricks.iodevices import XboxController');
    expect(code).toContain('CONTROLLER_SEARCH_MS = 30000\nCONTROLLER_REPORT_MS = 100');
    // Setup: the drive base first, then the controller, so a missing controller moves nothing.
    expect(code).toMatch(
      /robot = DriveBase\([^\n]+\)\ncontroller_memory = \{\}\ncontroller_report = StopWatch\(\)\nhub\.light\.blink\(Color\.BLUE, \[300, 300\]\)\nprint\("@xbx searching"\)\nprint\("Looking for the controller\.\.\."\)\ntry:\n {4}controller = XboxController\(timeout=CONTROLLER_SEARCH_MS\)\nexcept OSError as controller_error:\n/,
    );
    expect(code).toContain('    print("@xbx notfound")\n');
    // The hub's own reason goes to the Monitor (Pybricks says when pairing mode is needed).
    expect(code).toContain(
      '    print("No Xbox controller connected. The hub said:", controller_error)\n',
    );
    expect(code).toContain(`    print("${NOT_FOUND_HELP}")\n    raise SystemExit\n`);
    // Connected: a steady green light, then two rising beeps.
    expect(code).toContain(
      'hub.light.on(Color.GREEN)\nprint("@xbx connected")\nprint("The controller is connected.")\nhub.speaker.beep(660, 100)\nhub.speaker.beep(990, 100)\n',
    );
    // Hub code rule 2: controller reads are guarded, and a lost controller ends the program.
    expect(code).toMatch(
      / {4}try:\n {8}left = controller\.joystick_left\(\)[\s\S]+ {4}except OSError:\n {8}controller_lost\(\)/,
    );
    expect(code).toContain(
      '    if Button.MENU in pressed:\n        print("@xbx menu")\n        raise SystemExit',
    );
    expect(code).toContain('drive_with_controller("one stick")');
    // Rule 1: every motor stops in finally, whichever way the program ends.
    expect(code).toMatch(
      /finally:\n {4}robot\.stop\(\)\n {4}left_wheel\.stop\(\)\n {4}right_wheel\.stop\(\)\n$/,
    );
    await expectCompiles(code);
  });

  it('reports the buttons in the order the page reads them', () => {
    const { code } = generate([forever([{ type: 'mp_ctrl_drive', fields: { STYLE: 'TANK' } }])]);
    const tuple = /CONTROLLER_BUTTONS = \(\n([\s\S]+?)\n\)/.exec(code)?.[1] ?? '';
    expect(tuple.split('\n').map((line) => line.trim())).toEqual(
      XBOX_BUTTONS.map((button) => `Button.${button.python},`),
    );
    // What the program prints parses back on the page: 1025 = bit 0 (A) + bit 10 (D-pad up).
    expect(parseControllerLine('@xbx 0 100 -5 0 0 37 1025')).toEqual({
      kind: 'values',
      values: {
        leftX: 0,
        leftY: 100,
        rightX: -5,
        rightY: 0,
        leftTrigger: 0,
        rightTrigger: 37,
        pressed: ['A', 'UP'],
      },
    });
  });

  it('runs motors with every input, and every other block compiles', async () => {
    const blocks: State[] = [
      ...INPUT_OPTIONS.filter((option) => option.drives).map((option) => ({
        type: 'mp_ctrl_motor',
        fields: { SOURCE: option.value, MOTORS: 'C+' },
      })),
      ...['ONE_STICK', 'TANK', 'RACING'].map((style) => ({
        type: 'mp_ctrl_drive',
        fields: { STYLE: style },
      })),
      ...['SHORT', 'LONG', 'TWICE'].map((kind) => ({
        type: 'mp_ctrl_rumble',
        fields: { KIND: kind },
      })),
      ...CHECKABLE_BUTTONS.flatMap((button) => [
        {
          type: 'controls_if',
          inputs: {
            IF0: { block: { type: 'mp_ctrl_pressed', fields: { BUTTON: button.python } } },
            DO0: { block: { type: 'mp_ctrl_rumble', fields: { KIND: 'SHORT' } } },
          },
        },
        {
          type: 'controls_if',
          inputs: {
            IF0: { block: { type: 'mp_ctrl_clicked', fields: { BUTTON: button.python } } },
            DO0: { block: { type: 'mp_move_stop' } },
          },
        },
      ]),
      ...INPUT_OPTIONS.filter((option) => option.number).map((option) => ({
        type: 'mp_plot',
        fields: { LABEL: option.value.toLowerCase() },
        inputs: { VALUE: { block: { type: 'mp_ctrl_value', fields: { VALUE: option.value } } } },
      })),
    ];
    const { code, problems, controls } = generate([forever(blocks)]);
    expect(problems).toEqual([]);
    expect(code).toContain(
      'run_motor_with_controller(0, motor_c, motor_c_speed, controller_pair(Button.A, Button.B))',
    );
    // INPUT_OPTIONS order: the eighth that runs motors is the right stick ↕ (value 3).
    expect(code).toContain(
      'run_motor_with_controller(7, motor_c, motor_c_speed, controller_value(3))',
    );
    expect(code).toContain(
      'run_motor_with_controller(9, motor_c, motor_c_speed, controller_value(5) - controller_value(4))',
    );
    expect(code).toContain('controller_just_pressed(10, Button.A)');
    expect(code).toContain('controller_rumble(150, 2)');
    expect(code).toContain('controller_pressed(Button.UP)');
    expect(code).toContain('print("lt:", controller_value(4))');
    // Each helper is defined once.
    expect(code.match(/def read_controller\(\)/g)).toHaveLength(1);
    expect(controls.at(-1)).toEqual({
      control: 'Menu ☰',
      action: 'stops the program',
      fingers: ['right thumb'],
    });
    await expectCompiles(code);
  });

  it('runs several motors from one reading, each its own way', async () => {
    const { code, problems, controls, controller } = generate([
      { type: 'mp_ctrl_use', fields: { CONTROLLER: 'XBOX' } },
      forever([
        { type: 'mp_ctrl_motor', fields: { SOURCE: 'LEFT_Y', MOTORS: 'B-A+' } },
        { type: 'mp_ctrl_motor', fields: { SOURCE: 'X_Y', MOTORS: 'D-' } },
      ]),
    ]);
    expect(problems).toEqual([]);
    expect(controller).toBe('XBOX');
    expect(code).toContain(
      [
        'controller_power = controller_value(1)',
        'run_motor_with_controller(0, motor_a, motor_a_speed, controller_power)',
        'run_motor_with_controller(1, motor_b, motor_b_speed, -controller_power)',
        'run_motor_with_controller(2, motor_d, motor_d_speed, -(controller_pair(Button.X, Button.Y)))',
      ].join('\n        '),
    );
    expect(controls.map((control) => `${control.control}: ${control.action}`)).toEqual([
      'left stick ↕: runs motors A ↻  B ↺',
      'X ↻ and Y ↺: runs motor D ↺',
      'Menu ☰: stops the program',
    ]);
    await expectCompiles(code);
  });

  it('adds nothing for the controller when no controller block is used', () => {
    const { code } = generate([{ type: 'mp_move_stop' }]);
    expect(code).not.toContain('XboxController');
    expect(code).not.toContain('@xbx');
  });

  it('flags a motor block on a wheel port the controller drives', () => {
    const { problems } = generate([
      forever([
        { type: 'mp_ctrl_drive', fields: { STYLE: 'ONE_STICK' } },
        { type: 'mp_ctrl_motor', fields: { SOURCE: 'A_B', MOTORS: 'A+' } },
      ]),
    ]);
    expect(problems.map((problem) => problem.message)).toEqual([
      expect.stringMatching(/Port A drives the robot’s left wheel/),
    ]);
  });
});

describe('saved programs', () => {
  it('opens a motor block saved before motor sets, on motor C', () => {
    const workspace = new Blockly.Workspace();
    try {
      loadWorkspace(workspace, {
        blocks: {
          languageVersion: 0,
          blocks: [{ type: 'mp_ctrl_motor', fields: { PORT: 'A', SOURCE: 'X_Y' } }],
        },
      });
      const [block] = workspace.getBlocksByType('mp_ctrl_motor', false);
      expect(block?.getFieldValue('SOURCE')).toBe('X_Y');
      expect(block?.getFieldValue('MOTORS')).toBe('C+');
    } finally {
      workspace.dispose();
    }
  });
});

describe('motor sets', () => {
  it('reads, orders and describes motors with their directions', () => {
    expect(parseMotorSet('B-A+')).toEqual([
      { port: 'A', reverse: false },
      { port: 'B', reverse: true },
    ]);
    expect(parseMotorSet('A+A-')).toEqual([{ port: 'A', reverse: true }]);
    expect(parseMotorSet('')).toEqual([]);
    expect(parseMotorSet('G+')).toEqual([]);
    expect(describeMotorSet('C+D-')).toBe('C ↻  D ↺');
  });

  it('keeps a valid value and refuses an empty or broken one', () => {
    const field = new FieldMotorSet('B-A+');
    expect(field.getValue()).toBe('A+B-');
    field.setValue('');
    expect(field.getValue()).toBe('A+B-');
    field.setValue('x');
    expect(field.getValue()).toBe('A+B-');
  });
});

describe('controllerFlyout', () => {
  it('starts with a ready-made driving loop, and its motor avoids the wheels', () => {
    const flyout = controllerFlyout({ hints: {}, movement: null });
    const first = flyout.find((item) => item.kind === 'block') as State;
    expect(first.type).toBe('mp_ctrl_use');
    expect(JSON.stringify(first)).toContain('"type":"mp_forever"');
    expect(JSON.stringify(first)).toContain('"MOTORS":"C+"');
    const types = flyout.flatMap((item) => (item.kind === 'block' ? [item.type] : []));
    expect(types).toEqual(
      expect.arrayContaining([
        'mp_ctrl_use',
        'mp_ctrl_drive',
        'mp_ctrl_motor',
        'mp_ctrl_pressed',
        'mp_ctrl_clicked',
        'mp_ctrl_value',
        'mp_ctrl_rumble',
      ]),
    );
  });
});
