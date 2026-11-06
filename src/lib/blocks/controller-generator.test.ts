import * as Blockly from 'blockly/core';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { compilePython } from '@/lib/pybricks/compiler';
import { parseControllerLine, XBOX_BUTTONS } from '../controller/xbox';
import { CHECKABLE_BUTTONS, CONTROLLER_VALUES, MOTOR_SOURCES } from './controller-definitions';
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
    expect(code).toContain('CONTROLLER_SEARCH_MS = 20000\nCONTROLLER_REPORT_MS = 100');
    // Setup: the drive base first, then the controller, so a missing controller moves nothing.
    expect(code).toMatch(
      /robot = DriveBase\([^\n]+\)\ncontroller_memory = \{\}\ncontroller_report = StopWatch\(\)\nhub\.light\.on\(Color\.BLUE\)\nprint\("@xbx searching"\)\ntry:\n {4}controller = XboxController\(timeout=CONTROLLER_SEARCH_MS\)\nexcept OSError:\n/,
    );
    expect(code).toContain('    print("@xbx notfound")\n');
    expect(code).toContain('hub.light.on(Color.GREEN)\nprint("@xbx connected")');
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

  it('runs a motor with every source, and every other block compiles', async () => {
    const blocks: State[] = [
      ...Object.keys(MOTOR_SOURCES).map((source) => ({
        type: 'mp_ctrl_motor',
        fields: { PORT: 'C', SOURCE: source },
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
      ...Object.keys(CONTROLLER_VALUES).map((value) => ({
        type: 'mp_plot',
        fields: { LABEL: value.toLowerCase() },
        inputs: { VALUE: { block: { type: 'mp_ctrl_value', fields: { VALUE: value } } } },
      })),
    ];
    const { code, problems } = generate([forever(blocks)]);
    expect(problems).toEqual([]);
    expect(code).toContain(
      'run_motor_with_controller(0, motor_c, motor_c_speed, controller_pair(Button.A, Button.B))',
    );
    expect(code).toContain(
      'run_motor_with_controller(5, motor_c, motor_c_speed, controller_value(3))',
    );
    expect(code).toContain(
      'run_motor_with_controller(9, motor_c, motor_c_speed, controller_value(5) - controller_value(4))',
    );
    expect(code).toContain('controller_just_pressed(10, Button.A)');
    expect(code).toContain('controller_rumble(150, 2)');
    expect(code).toContain('controller_pressed(Button.UP)');
    // Each helper is defined once.
    expect(code.match(/def read_controller\(\)/g)).toHaveLength(1);
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
        { type: 'mp_ctrl_motor', fields: { PORT: 'A', SOURCE: 'A_B' } },
      ]),
    ]);
    expect(problems.map((problem) => problem.message)).toEqual([
      expect.stringMatching(/Port A drives the robot’s left wheel/),
    ]);
  });
});

describe('controllerFlyout', () => {
  it('starts with a ready-made driving loop, and its motor avoids the wheels', () => {
    const flyout = controllerFlyout({ hints: {}, movement: null });
    const first = flyout.find((item) => item.kind === 'block') as State;
    expect(first.type).toBe('mp_forever');
    expect(JSON.stringify(first)).toContain('"PORT":"C"');
    const types = flyout.flatMap((item) => (item.kind === 'block' ? [item.type] : []));
    expect(types).toEqual(
      expect.arrayContaining([
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
