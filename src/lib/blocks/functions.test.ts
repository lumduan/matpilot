import * as Blockly from 'blockly/core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { compilePython } from '@/lib/pybricks/compiler';
import {
  FUNCTION_BLOCKS,
  callableFunctions,
  collectFunctions,
  functionsFlyout,
  syncFunctionBlocks,
  uniqueFunctionName,
} from './functions';
import { generateTabs, namesIn, topLevelNames, type GeneratedProgram } from './generator';
import { DEVICE_TYPES } from './pybricks';
import { loadWorkspace, registerBlocks } from './register';
import {
  SHARED_BLOCKS,
  SHARED_VARIABLE_TYPE,
  sharedNameTaken,
  syncSharedVariables,
  watchSharedVariables,
} from './shared';
import {
  MAIN_TAB_ID,
  checkTabName,
  linkTab,
  newTabName,
  type ProgramTab,
  type TabActions,
} from './tabs';

type State = Record<string, unknown>;

const num = (value: number) => ({ shadow: { type: 'math_number', fields: { NUM: value } } });
const turn = (value: number) => ({ shadow: { type: 'mp_turn_angle', fields: { ANGLE: value } } });
const percent = (value: number) => ({ shadow: { type: 'mp_percent', fields: { PERCENT: value } } });

function chain(blocks: State[]): State | undefined {
  return blocks.reduceRight<State | undefined>(
    (next, block) => (next ? { ...block, next: { block: next } } : block),
    undefined,
  );
}

/** A define block whose inputs have the ids `<id>-<name>`. */
const define = (id: string, name: string, inputs: string[], body: State[]): State => ({
  type: FUNCTION_BLOCKS.define,
  id,
  x: 0,
  y: 300,
  fields: {
    NAME: name,
    ...Object.fromEntries(inputs.map((input) => [`INPUT_${id}-${input}`, input])),
  },
  ...(inputs.length > 0
    ? { extraState: { inputs: inputs.map((input) => ({ id: `${id}-${input}`, name: input })) } }
    : {}),
  ...(body.length > 0 ? { inputs: { DO: { block: chain(body) } } } : {}),
});

const call = (fn: string, name: string, args: Record<string, State> = {}, id?: string): State => ({
  type: FUNCTION_BLOCKS.call,
  ...(id ? { id } : {}),
  fields: { FUNC: fn },
  extraState: {
    name,
    inputs: Object.keys(args).map((input) => ({ id: `${fn}-${input}`, name: input })),
  },
  inputs: Object.fromEntries(
    Object.entries(args).map(([input, value]) => [`ARG_${fn}-${input}`, value]),
  ),
});

const input = (fn: string, name: string): State => ({
  type: FUNCTION_BLOCKS.input,
  extraState: { input: `${fn}-${name}`, name },
});

const move = (amount: State): State => ({
  type: 'mp_move',
  fields: { DIRECTION: 'FORWARD', UNIT: 'MM' },
  inputs: { AMOUNT: { ...num(0), block: amount } },
});

const repeat = (times: number, body: State[]): State => ({
  type: 'controls_repeat_ext',
  inputs: { TIMES: num(times), DO: { block: chain(body) } },
});

interface TabState {
  readonly name: string;
  readonly blocks?: State[];
  /** Main only: blocks under "when the program starts". */
  readonly program?: State[];
  readonly variables?: State[];
}

const opened: Blockly.Workspace[] = [];

/** A program in tabs, in headless workspaces linked like the editor links them. */
function openProgram(tabs: TabState[], actions: TabActions | null = null): ProgramTab[] {
  const program: ProgramTab[] = [];
  for (const [index, tab] of tabs.entries()) {
    const workspace = new Blockly.Workspace();
    opened.push(workspace);
    program.push({ id: index === 0 ? MAIN_TAB_ID : `tab-${tab.name}`, name: tab.name, workspace });
    linkTab(workspace, () => program, actions);
  }
  for (const [index, tab] of tabs.entries()) {
    const body = chain(tab.program ?? []);
    const blocks = [
      ...(index === 0
        ? [{ type: 'mp_program', x: 0, y: 0, ...(body ? { next: { block: body } } : {}) }]
        : []),
      ...(tab.blocks ?? []),
    ];
    const state = {
      blocks: { languageVersion: 0, blocks },
      ...(tab.variables ? { variables: tab.variables } : {}),
    };
    const workspace = program[index]!.workspace;
    if (index === 0) loadWorkspace(workspace, state);
    else Blockly.serialization.workspaces.load(state, workspace);
  }
  return program;
}

const generate = (tabs: TabState[]) => generateTabs(openProgram(tabs));

async function expectFilesCompile(program: GeneratedProgram) {
  for (const file of program.files) {
    const outcome = await compilePython(file.code, { sourceName: file.name });
    expect(
      outcome.ok,
      outcome.ok
        ? ''
        : `${file.name}: ${outcome.error.message} (line ${outcome.error.line})\n${file.code}`,
    ).toBe(true);
  }
}

const file = (program: GeneratedProgram, name: string) =>
  program.files.find((each) => each.name === name)?.code ?? '';

const messages = (program: GeneratedProgram) =>
  program.problems.map((problem) => `${problem.tabId}: ${problem.message}`);

const SQUARE = define(
  'sq',
  'square',
  ['side'],
  [repeat(4, [move(input('sq', 'side')), { type: 'mp_move_turn', inputs: { ANGLE: turn(90) } }])],
);

const FLASH = define(
  'fl',
  'flash',
  [],
  [
    { type: 'mp_light_button', fields: { COLOR: 'RED' } },
    { type: 'mp_wait_seconds', inputs: { SECONDS: num(0.2) } },
    { type: 'mp_light_button_off' },
  ],
);

beforeAll(() => registerBlocks());

beforeEach(() => {
  // The compiler's Emscripten loader reads the .wasm from disk only when fetch is absent.
  vi.stubGlobal('fetch', undefined);
});

afterEach(() => {
  for (const workspace of opened.splice(0)) workspace.dispose();
});

describe('tab names', () => {
  it('are Python module names: lower case, letters, numbers and _', () => {
    expect(checkTabName('Dance moves!', [])).toEqual({ ok: true, name: 'dance_moves' });
    expect(checkTabName('  lights-2 ', [])).toEqual({ ok: true, name: 'lights_2' });
    expect(checkTabName('x'.repeat(40), [])).toEqual({ ok: true, name: 'x'.repeat(20) });
    expect(checkTabName('2fast', [])).toEqual({ ok: true, name: 'fast' });
    expect(checkTabName('ท่าเต้น', [])).toMatchObject({ ok: false, message: /English letters/ });
  });

  it('refuse main, setup, the hub’s modules, Python’s names, and names in use', () => {
    for (const name of ['main', 'setup', 'math', 'umath', 'random', 'pybricks', 'micropython']) {
      expect(checkTabName(name, [])).toMatchObject({ ok: false, message: /already a name/ });
    }
    for (const name of ['robot', 'hub', 'print', 'while', 'motor_a']) {
      expect(checkTabName(name, [])).toMatchObject({ ok: false, message: /already a name/ });
    }
    expect(checkTabName('Moves', ['moves'])).toMatchObject({ ok: false, message: /already a tab/ });
  });

  it('start as tab2, tab3, ...', () => {
    expect(newTabName(['main'])).toBe('tab2');
    expect(newTabName(['main', 'tab2', 'tab3'])).toBe('tab4');
  });
});

describe('functions in the main tab', () => {
  it('become a Functions section before Main, in one file', async () => {
    const program = generate([
      {
        name: 'main',
        program: [
          call('sq', 'square', { side: num(200) }),
          call('sq', 'square', { side: num(100) }),
        ],
        blocks: [SQUARE],
      },
    ]);
    expect(program.problems).toEqual([]);
    expect(program.files.map((each) => each.name)).toEqual(['main.py']);
    expect(program.code)
      .toContain(`# --- Functions ------------------------------------------------------------
def square(side):
    for count in range(4):
        robot.straight(side)
        robot.turn(90)

# --- Main -----------------------------------------------------------------
try:
    square(200)
    square(100)
finally:
    robot.stop()`);
    await expectFilesCompile(program);
  });

  it('say `global` for the variables and motor speeds they change', async () => {
    const program = generate([
      {
        name: 'main',
        variables: [{ name: 'laps', id: 'v-laps', type: '' }],
        program: [call('go', 'go')],
        blocks: [
          define(
            'go',
            'go',
            [],
            [
              { type: 'math_change', fields: { VAR: { id: 'v-laps' } }, inputs: { DELTA: num(1) } },
              { type: 'mp_motor_set_speed', fields: { PORT: 'C' }, inputs: { SPEED: percent(75) } },
              { type: 'mp_motor_start', fields: { PORT: 'C', DIRECTION: 'CLOCKWISE' } },
            ],
          ),
        ],
      },
    ]);
    expect(program.code).toContain(`def go():
    global laps, motor_c_speed
    laps += 1
    motor_c_speed = motor_c.control.limits()[0] * 75 // 100`);
    await expectFilesCompile(program);
  });
});

describe('functions in tabs', () => {
  const PROGRAM: TabState[] = [
    {
      name: 'main',
      variables: [{ name: 'count', id: 'v-count', type: '' }],
      program: [
        { type: 'variables_set', fields: { VAR: { id: 'v-count' } }, inputs: { VALUE: num(3) } },
        call('sq', 'square', { side: num(200) }),
        call('fl', 'flash'),
      ],
    },
    {
      name: 'moves',
      variables: [{ name: 'laps', id: 'v-laps', type: '' }],
      blocks: [
        define(
          'sq',
          'square',
          ['side'],
          [
            { type: 'mp_motor_set_speed', fields: { PORT: 'C' }, inputs: { SPEED: percent(75) } },
            { type: 'math_change', fields: { VAR: { id: 'v-laps' } }, inputs: { DELTA: num(1) } },
            repeat(4, [
              move(input('sq', 'side')),
              { type: 'mp_move_turn', inputs: { ANGLE: turn(90) } },
              call('fl', 'flash'),
            ]),
          ],
        ),
      ],
    },
    { name: 'lights', blocks: [FLASH] },
  ];

  it('make a file per tab and setup.py; main imports every tab', async () => {
    const program = generate(PROGRAM);
    expect(program.problems).toEqual([]);
    expect(program.files.map((each) => [each.name, each.module])).toEqual([
      ['main.py', '__main__'],
      ['moves.py', 'moves'],
      ['lights.py', 'lights'],
      ['setup.py', 'setup'],
    ]);
    expect(program.code).toBe(file(program, 'main.py'));
    expect(file(program, 'main.py'))
      .toBe(`# Generated by MatPilot from blocks: the main tab, where the program starts.
from setup import left_wheel, motor_c, right_wheel, robot
import moves
import lights

# --- Variables ------------------------------------------------------------
count = 0

# --- Main -----------------------------------------------------------------
try:
    count = 3
    moves.square(200)
    lights.flash()
finally:
    robot.stop()
    motor_c.stop()
    left_wheel.stop()
    right_wheel.stop()
`);
    expect(file(program, 'moves.py')).toBe(`# Generated by MatPilot from blocks: the tab “moves”.
from setup import motor_c, robot
import setup
import lights

# --- Variables ------------------------------------------------------------
laps = 0

# --- Functions ------------------------------------------------------------
def square(side):
    global laps
    setup.motor_c_speed = motor_c.control.limits()[0] * 75 // 100
    laps += 1
    for count in range(4):
        robot.straight(side)
        robot.turn(90)
        lights.flash()
`);
    expect(file(program, 'lights.py')).toBe(`# Generated by MatPilot from blocks: the tab “lights”.
from pybricks.parameters import Color
from pybricks.tools import wait

from setup import hub

# --- Functions ------------------------------------------------------------
def flash():
    hub.light.on(Color.RED)
    wait(200)
    hub.light.off()
`);
    expect(file(program, 'setup.py')).toContain(
      '# Generated by MatPilot from blocks: the ports, devices and helpers every tab uses.\nfrom pybricks.hubs import PrimeHub\n',
    );
    expect(file(program, 'setup.py')).toContain(`hub = PrimeHub()
motor_c = Motor(MOTOR_C_PORT)
motor_c_speed = motor_c.control.limits()[0] * 50 // 100`);
    await expectFilesCompile(program);
  });

  it('stay one file while no tab but main has functions', () => {
    const program = generate([
      { name: 'main', program: [{ type: 'mp_light_button_off' }] },
      { name: 'empty' },
      { name: 'loose', blocks: [{ type: 'mp_light_button_off', x: 0, y: 0 }] },
    ]);
    expect(program.files.map((each) => each.name)).toEqual(['main.py']);
    expect(program.code.startsWith('# Generated by MatPilot from blocks.\n')).toBe(true);
  });

  it('may use each other; each imports the other, and calls go through the module', async () => {
    const program = generate([
      { name: 'main', program: [call('a', 'ping', { times: num(3) })] },
      {
        name: 'one',
        blocks: [
          define(
            'a',
            'ping',
            ['times'],
            [
              {
                type: 'controls_if',
                inputs: {
                  IF0: {
                    block: {
                      type: 'logic_compare',
                      fields: { OP: 'GT' },
                      inputs: { A: { block: input('a', 'times') }, B: num(0) },
                    },
                  },
                  DO0: { block: call('b', 'pong', { times: { block: input('a', 'times') } }) },
                },
              },
            ],
          ),
        ],
      },
      {
        name: 'two',
        blocks: [
          define(
            'b',
            'pong',
            ['times'],
            [
              { type: 'mp_print', inputs: { VALUE: { block: input('b', 'times') } } },
              call('a', 'ping', {
                times: {
                  block: {
                    type: 'math_arithmetic',
                    fields: { OP: 'MINUS' },
                    inputs: { A: { block: input('b', 'times') }, B: num(1) },
                  },
                },
              }),
            ],
          ),
        ],
      },
    ]);
    expect(program.problems).toEqual([]);
    expect(file(program, 'one.py')).toContain('import two\n');
    expect(file(program, 'one.py')).toContain('        two.pong(times)\n');
    expect(file(program, 'two.py')).toContain('import one\n');
    expect(file(program, 'two.py')).toContain('    one.ping(times - 1)\n');
    // Nothing on the hub is used: no setup.py.
    expect(program.files.map((each) => each.name)).toEqual(['main.py', 'one.py', 'two.py']);
    await expectFilesCompile(program);
  });

  it('can use the controller and the devices set up in main', async () => {
    const program = generate([
      {
        name: 'main',
        variables: [{ name: 'arm', id: 'v-arm', type: 'Motor' }],
        program: [
          { type: 'mp_ctrl_use', fields: { CONTROLLER: 'XBOX' } },
          { type: 'mp_forever', inputs: { DO: { block: call('dr', 'drive') } } },
        ],
        blocks: [
          {
            type: 'mp_setup',
            x: 300,
            y: 0,
            inputs: {
              DEVICES: {
                block: {
                  type: 'mp_setup_motor',
                  fields: { VAR: { id: 'v-arm' }, PORT: 'C', DIRECTION: 'CLOCKWISE' },
                },
              },
            },
          },
        ],
      },
      {
        name: 'driving',
        variables: [{ name: 'arm', id: 'v-arm', type: 'Motor' }],
        blocks: [
          define(
            'dr',
            'drive',
            [],
            [
              { type: 'mp_ctrl_drive', fields: { STYLE: 'ONE_STICK' } },
              {
                type: 'controls_if',
                inputs: {
                  IF0: { block: { type: 'mp_ctrl_pressed', fields: { BUTTON: 'A' } } },
                  DO0: {
                    block: {
                      type: 'mp_motor_run',
                      fields: { MOTOR: { id: 'v-arm' } },
                      inputs: { SPEED: num(300) },
                    },
                  },
                },
              },
            ],
          ),
        ],
      },
    ]);
    expect(program.problems).toEqual([]);
    expect(program.usesController).toBe(true);
    expect(file(program, 'setup.py')).toContain(
      'controller = XboxController(timeout=CONTROLLER_SEARCH_MS)',
    );
    expect(file(program, 'setup.py')).toContain('arm = Motor(ARM_PORT)');
    expect(file(program, 'driving.py')).toMatch(
      /^from setup import arm, controller_pressed, drive_with_controller$/m,
    );
    expect(file(program, 'driving.py')).toContain('from pybricks.parameters import Button');
    expect(file(program, 'main.py')).toContain('finally:\n    robot.stop()');
    await expectFilesCompile(program);
  });
});

describe('problems with functions', () => {
  it('a tab cannot use a function in main', () => {
    const program = generate([
      { name: 'main', program: [call('t', 'twice')], blocks: [define('beep', 'beep', [], [])] },
      {
        name: 'tunes',
        blocks: [define('t', 'twice', [], [call('beep', 'beep'), call('beep', 'beep')])],
      },
    ]);
    expect(messages(program)).toContain(
      'tab-tunes: “beep” is in the main tab, so other tabs cannot use it. Move it to a tab: right-click its “define” block.',
    );
  });

  it('a call to a function that is gone, or turned off', () => {
    const program = generate([
      {
        name: 'main',
        program: [call('gone', 'dance'), call('off', 'spin')],
        blocks: [{ ...define('off', 'spin', [], []), enabled: false }],
      },
    ]);
    expect(messages(program)).toEqual([
      'main: There is no function “dance” any more. Remove this block, or tap its name to choose another.',
      'main: The function “spin” is turned off. Turn its “define” block back on.',
    ]);
  });

  it('an input outside its function, or of another function', () => {
    const program = generate([
      {
        name: 'main',
        program: [{ type: 'mp_print', inputs: { VALUE: { block: input('sq', 'side') } } }],
        blocks: [
          SQUARE,
          define(
            'other',
            'other',
            ['size'],
            [{ type: 'mp_print', inputs: { VALUE: { block: input('sq', 'side') } } }],
          ),
        ],
      },
    ]);
    expect(messages(program)).toEqual([
      'main: “side” is an input of a function. Use it inside that function’s “define” block.',
      'main: “other” has no input “side”. Use one of its own inputs.',
    ]);
  });

  it('a variable named like a function, and blocks that belong in main', () => {
    const program = generate([
      {
        name: 'main',
        variables: [{ name: 'square', id: 'v-sq', type: '' }],
        program: [
          { type: 'variables_set', fields: { VAR: { id: 'v-sq' } }, inputs: { VALUE: num(1) } },
          call('sq', 'square', { side: num(10) }),
        ],
        blocks: [SQUARE],
      },
      { name: 'extra', blocks: [{ type: 'mp_program', x: 0, y: 0 }, FLASH] },
    ]);
    expect(messages(program)).toEqual(
      expect.arrayContaining([
        'tab-extra: “when the program starts” belongs in the main tab. Delete this one.',
        'main: The variable “square” has the same name as the function “square”. Rename one of them.',
      ]),
    );
  });
});

describe('function names', () => {
  it('stay unique in the whole program, and never take a tab’s name', () => {
    const tabs = openProgram([
      { name: 'main', blocks: [SQUARE] },
      { name: 'moves', blocks: [define('copy', 'square', [], []), define('m', 'moves', [], [])] },
    ]);
    const names = [...collectFunctions(tabs).values()].map((info) => info.name);
    expect(names).toEqual(['square', 'square2', 'moves2']);
    expect(uniqueFunctionName('my_function', tabs[0]!.workspace, null)).toBe('my_function');
    expect(uniqueFunctionName('square', tabs[0]!.workspace, null)).toBe('square3');
  });
});

describe('keeping calls up to date', () => {
  it('renames calls and inputs, and adds and removes call inputs, in every tab', () => {
    const tabs = openProgram([
      { name: 'main', program: [call('sq', 'square', { side: num(50) }, 'c1')] },
      { name: 'moves', blocks: [SQUARE] },
    ]);
    const [main, moves] = tabs;
    const definition = moves!.workspace.getBlockById('sq')!;
    Blockly.Events.disable();
    try {
      definition.setFieldValue('box', 'NAME');
      definition.loadExtraState!({
        inputs: [
          { id: 'sq-side', name: 'length' },
          { id: 'sq-speed', name: 'speed' },
        ],
      });
    } finally {
      Blockly.Events.enable();
    }
    expect(syncFunctionBlocks(tabs)).toBe(true);
    const caller = main!.workspace.getBlockById('c1')!;
    expect(caller.getField('FUNC')!.getText()).toBe('box');
    expect(
      caller.inputList.filter((each) => each.name.startsWith('ARG_')).map((each) => each.name),
    ).toEqual(['ARG_sq-side', 'ARG_sq-speed']);
    expect(caller.getFieldValue('LABEL_sq-side')).toBe('length');
    // The kept input keeps its value; the new one gets a 0.
    expect(caller.getInputTargetBlock('ARG_sq-side')?.getFieldValue('NUM')).toBe(50);
    expect(caller.getInputTargetBlock('ARG_sq-speed')?.getFieldValue('NUM')).toBe(0);
    const reporter = moves!.workspace.getBlocksByType(FUNCTION_BLOCKS.input, false)[0]!;
    expect(reporter.getFieldValue('NAME')).toBe('length');
    expect(generateTabs(tabs).code).toContain('moves.box(50, 0)');
    // Nothing more to do the second time.
    expect(syncFunctionBlocks(tabs)).toBe(false);
  });

  it('finds a cut and pasted function by its name: it has a new id', () => {
    const tabs = openProgram([
      { name: 'main', program: [call('sq', 'square', { side: num(50) }, 'c1')] },
      { name: 'moves', blocks: [SQUARE] },
      { name: 'other' },
    ]);
    const [main, moves, other] = tabs;
    // Cut from "moves", paste into "other", as Blockly's clipboard does it (no ids saved).
    const definition = moves!.workspace.getBlockById('sq')!;
    const copied = Blockly.serialization.blocks.save(definition, { saveIds: false })!;
    definition.dispose(false);
    expect(messages(generateTabs(tabs))).toEqual([
      'main: There is no function “square” any more. Remove this block, or tap its name to choose another.',
    ]);
    const pasted = Blockly.serialization.blocks.append(copied, other!.workspace);
    expect(pasted.id).not.toBe('sq');
    expect(syncFunctionBlocks(tabs)).toBe(true);
    const caller = main!.workspace.getBlockById('c1')!;
    expect(caller.getFieldValue('FUNC')).toBe(pasted.id);
    expect(caller.getInputTargetBlock('ARG_sq-side')?.getFieldValue('NUM')).toBe(50);
    const program = generateTabs(tabs);
    expect(program.problems).toEqual([]);
    expect(program.code).toContain('other.square(50)');
  });

  it('leaves a call alone when no function has its name', () => {
    const tabs = openProgram([
      { name: 'main', program: [call('gone', 'dance', {}, 'c1')] },
      { name: 'one', blocks: [define('a', 'square', [], [])] },
    ]);
    expect(syncFunctionBlocks(tabs)).toBe(false);
    expect(tabs[0]!.workspace.getBlockById('c1')!.getFieldValue('FUNC')).toBe('gone');
  });

  it('lets each tab call its own and other tabs’ functions, and only main call main’s', () => {
    const tabs = openProgram([
      { name: 'main', blocks: [define('m', 'in_main', [], [])] },
      { name: 'one', blocks: [define('a', 'in_one', [], [])] },
      { name: 'two', blocks: [define('b', 'in_two', [], [])] },
    ]);
    const names = (tab: ProgramTab) => callableFunctions(tab.workspace).map((info) => info.name);
    expect(names(tabs[0]!)).toEqual(['in_main', 'in_one', 'in_two']);
    expect(names(tabs[1]!)).toEqual(['in_one', 'in_two']);
    expect(names(tabs[2]!)).toEqual(['in_two', 'in_one']);
  });

  it('offers a new function, the functions to call, and this tab’s inputs', () => {
    const tabs = openProgram([
      { name: 'main', blocks: [define('m', 'in_main', [], [])] },
      { name: 'moves', blocks: [SQUARE] },
    ]);
    const summary = (tab: ProgramTab) =>
      functionsFlyout(tab.workspace).map((item) =>
        item.kind === 'label'
          ? `label: ${item.text as string}`
          : `${item.type as string}${item.fields ? ` ${JSON.stringify(item.fields)}` : ''}`,
      );
    expect(summary(tabs[1]!)).toEqual([
      'label: Make a block of your own: name it, add inputs with ⊕, put blocks inside.',
      'mp_func_define {"NAME":"my_function"}',
      'label: Functions in this tab',
      'mp_func_call {"FUNC":"sq"}',
      'label: Inputs: use each inside its own “define” block',
      'mp_func_input',
      'label: Functions in main can be used only in main.',
    ]);
    expect(summary(tabs[0]!)).toEqual([
      'label: Make a block of your own: name it, add inputs with ⊕, put blocks inside.',
      'mp_func_define {"NAME":"my_function"}',
      'label: Functions in main',
      'mp_func_call {"FUNC":"m"}',
      'label: From the tab “moves”',
      'mp_func_call {"FUNC":"sq"}',
    ]);
  });
});

describe('reading generated code', () => {
  it('finds names, not words in strings, comments or after a dot', () => {
    expect([...namesIn('robot.stop()  # hub\nprint("wait", x.wait)\nwait(1)')].sort()).toEqual([
      'print',
      'robot',
      'wait',
      'x',
    ]);
  });

  it('finds what a file defines at module level, also inside try', () => {
    const code = `A = 1
def helper(x):
    inside = 2
    return x
B = (
    c,
)
try:
    controller = 3
except OSError:
    raise SystemExit
print("x = 1")`;
    expect(topLevelNames(code)).toEqual(['A', 'helper', 'B', 'controller']);
  });
});

describe('shared variables', () => {
  /** Every tab's saved blocks carry the shared variables, as the editor saves them. */
  const SCORE = [{ name: 'score', id: 's-score', type: SHARED_VARIABLE_TYPE }];
  const setScore = (value: number): State => ({
    type: SHARED_BLOCKS.set,
    fields: { VAR: { id: 's-score' } },
    inputs: { VALUE: num(value) },
  });
  const addScore: State = {
    type: SHARED_BLOCKS.change,
    fields: { VAR: { id: 's-score' } },
    inputs: { DELTA: num(1) },
  };
  const printScore: State = {
    type: 'mp_print',
    inputs: { VALUE: { block: { type: SHARED_BLOCKS.get, fields: { VAR: { id: 's-score' } } } } },
  };

  it('are module variables in a program of one file; a function says `global`', async () => {
    const program = generate([
      {
        name: 'main',
        variables: SCORE,
        program: [setScore(0), call('go', 'go')],
        blocks: [define('go', 'go', [], [addScore, printScore])],
      },
    ]);
    expect(program.problems).toEqual([]);
    expect(program.code).toBe(`# Generated by MatPilot from blocks.

# --- Setup ----------------------------------------------------------------
score = 0

# --- Functions ------------------------------------------------------------
def go():
    global score
    score += 1
    print(score)

# --- Main -----------------------------------------------------------------
score = 0
go()
`);
    await expectFilesCompile(program);
  });

  it('live in setup.py in a program of several files, used as setup.score', async () => {
    const program = generate([
      { name: 'main', variables: SCORE, program: [setScore(0), call('go', 'go'), printScore] },
      {
        name: 'game',
        variables: SCORE,
        blocks: [define('go', 'go', [], [addScore, { type: 'mp_light_button_off' }])],
      },
    ]);
    expect(program.problems).toEqual([]);
    expect(file(program, 'main.py'))
      .toBe(`# Generated by MatPilot from blocks: the main tab, where the program starts.
import setup
import game

# --- Main -----------------------------------------------------------------
setup.score = 0
game.go()
print(setup.score)
`);
    expect(file(program, 'game.py')).toBe(`# Generated by MatPilot from blocks: the tab “game”.
from setup import hub
import setup

# --- Functions ------------------------------------------------------------
def go():
    setup.score += 1
    hub.light.off()
`);
    expect(file(program, 'setup.py'))
      .toBe(`# Generated by MatPilot from blocks: the ports, devices, helpers and shared variables every tab uses.
from pybricks.hubs import PrimeHub

# --- Setup ----------------------------------------------------------------
hub = PrimeHub()

# --- Shared variables -----------------------------------------------------
score = 0
`);
    await expectFilesCompile(program);
  });

  it('need a name of their own: not a tab’s variable, not a function', () => {
    const program = generate([
      { name: 'main', variables: SCORE, program: [setScore(1), call('sc', 'score')] },
      {
        name: 'moves',
        variables: [...SCORE, { name: 'Score', id: 'v-score', type: '' }],
        blocks: [define('sc', 'score', [], [addScore])],
      },
    ]);
    expect(messages(program)).toEqual([
      'tab-moves: “score” is a shared variable and a variable of the tab “moves”. Rename one of them.',
      'tab-moves: “score” is a shared variable and a function. Rename one of them.',
    ]);
    const tabs = openProgram([{ name: 'main', variables: SCORE }, { name: 'moves' }]);
    expect(sharedNameTaken('SCORE', tabs)).toBe(
      'There is already a shared variable called “score”.',
    );
    tabs[1]!.workspace.getVariableMap().createVariable('laps', '');
    expect(sharedNameTaken('laps', tabs)).toBe(
      'The tab “moves” has a variable called “laps”. Choose another name.',
    );
    expect(sharedNameTaken('speed', tabs)).toBeNull();
  });

  it('are in every tab, renamed and deleted in every tab', () => {
    const tabs = openProgram([
      { name: 'main', variables: SCORE },
      { name: 'moves' },
      { name: 'x' },
    ]);
    for (const tab of tabs) watchSharedVariables(tab.workspace);
    syncSharedVariables(tabs);
    const twin = (tab: ProgramTab) => tab.workspace.getVariableMap().getVariableById('s-score');
    expect(tabs.map((tab) => twin(tab)?.getName())).toEqual(['score', 'score', 'score']);

    const moves = tabs[1]!.workspace.getVariableMap();
    moves.renameVariable(twin(tabs[1]!)!, 'points');
    expect(tabs.map((tab) => twin(tab)?.getName())).toEqual(['points', 'points', 'points']);

    // Not used anywhere else: deleting it in one tab deletes it in every tab.
    moves.deleteVariable(twin(tabs[1]!)!);
    expect(tabs.map((tab) => twin(tab) ?? null)).toEqual([null, null, null]);
  });

  it('used by another tab: deleting it is a change to the whole program', () => {
    const deleted: string[] = [];
    const actions: TabActions = {
      moveToTab: () => undefined,
      deleteSharedVariable: (id) => deleted.push(id),
    };
    const tabs = openProgram(
      [
        { name: 'main', variables: SCORE, program: [setScore(1)] },
        { name: 'game', variables: SCORE },
      ],
      actions,
    );
    for (const tab of tabs) watchSharedVariables(tab.workspace);
    const game = tabs[1]!.workspace.getVariableMap();
    game.deleteVariable(game.getVariableById('s-score')!);
    expect(deleted).toEqual(['s-score']);
    // The editor's action does the deleting; until then nothing has changed.
    expect(game.getVariableById('s-score')).not.toBeNull();

    // Undo in one tab never takes blocks from another: the variable stays.
    Blockly.Events.setRecordUndo(false);
    try {
      game.deleteVariable(game.getVariableById('s-score')!);
    } finally {
      Blockly.Events.setRecordUndo(true);
    }
    expect(deleted).toEqual(['s-score']);
    expect(tabs[0]!.workspace.getBlocksByType(SHARED_BLOCKS.set, false)).toHaveLength(1);
  });

  it('are kept out of the plain variable blocks', () => {
    const [main] = openProgram([{ name: 'main', variables: SCORE }]);
    const block = main!.workspace.newBlock('variables_get');
    const field = block.getField('VAR') as Blockly.FieldVariable;
    expect(field.variableTypes).toEqual(['', ...DEVICE_TYPES]);
    const shared = main!.workspace.newBlock(SHARED_BLOCKS.get);
    expect((shared.getField('VAR') as Blockly.FieldVariable).variableTypes).toEqual([
      SHARED_VARIABLE_TYPE,
    ]);
  });
});
