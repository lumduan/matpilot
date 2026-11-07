import * as Blockly from 'blockly/core';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NO_HINTS } from '../fields/hints';
import { FUNCTION_BLOCKS } from '../functions';
import { generateTabs } from '../generator';
import { DEVICES, type DeviceType, type PortName } from '../pybricks';
import { loadWorkspace, registerBlocks } from '../register';
import { SHARED_BLOCKS, SHARED_VARIABLE_TYPE } from '../shared';
import {
  CONTROL_CONTENTS,
  LIGHT_CONTENTS,
  OPERATOR_CONTENTS,
  SOUND_CONTENTS,
  controllerFlyout,
  motorsFlyout,
  movementFlyout,
  sensorsFlyout,
} from '../simple-toolbox';
import { MAIN_TAB_ID, linkTab, type ProgramTab } from '../tabs';
import {
  inputFlyout,
  outputFlyout,
  staticToolboxBlocks,
  type FlyoutItem,
  type ToolboxState,
} from '../toolbox';
import { editableRanges, pythonForEditing, readTabPython } from './tab';

type State = Record<string, unknown>;

const num = (value: number) => ({ shadow: { type: 'math_number', fields: { NUM: value } } });

function chain(blocks: State[]): State | undefined {
  return blocks.reduceRight<State | undefined>(
    (next, block) => (next ? { ...block, next: { block: next } } : block),
    undefined,
  );
}

const DEVICE_LIST: { type: DeviceType; id: string; name: string; port: PortName }[] = [
  { type: 'Motor', id: 'd-arm', name: 'arm', port: 'C' },
  { type: 'ColorSensor', id: 'd-eye', name: 'eye', port: 'D' },
  { type: 'UltrasonicSensor', id: 'd-sonar', name: 'sonar', port: 'E' },
  { type: 'ForceSensor', id: 'd-button', name: 'button', port: 'F' },
];

const TOOLBOX_STATE: ToolboxState = {
  devices: DEVICE_LIST.map((device) => ({
    type: device.type,
    variableId: device.id,
    name: device.name,
    port: device.port,
  })),
  variableNames: {
    Motor: ['arm'],
    ColorSensor: ['eye'],
    UltrasonicSensor: ['sonar'],
    ForceSensor: ['button'],
  },
  hasSetupBlock: true,
};

const SETUP: State = {
  type: 'mp_setup',
  x: 400,
  y: 0,
  inputs: {
    DEVICES: {
      block: chain(
        DEVICE_LIST.map((device) => ({
          type: DEVICES[device.type].setupBlock,
          fields: { VAR: { id: device.id }, PORT: device.port },
        })),
      ),
    },
  },
};

const DEVICE_VARIABLES = DEVICE_LIST.map((device) => ({
  name: device.name,
  id: device.id,
  type: device.type,
}));

interface TabSpec {
  readonly name: string;
  readonly program?: State[];
  readonly blocks?: State[];
  readonly variables?: State[];
  /** Main without the "set up" block and its devices. */
  readonly bare?: boolean;
}

const opened: Blockly.Workspace[] = [];

function openProgram(specs: TabSpec[]): ProgramTab[] {
  const program: ProgramTab[] = [];
  for (const [index, spec] of specs.entries()) {
    const workspace = new Blockly.Workspace();
    opened.push(workspace);
    program.push({
      id: index === 0 ? MAIN_TAB_ID : `tab-${spec.name}`,
      name: spec.name,
      workspace,
    });
    linkTab(workspace, () => program, null);
  }
  for (const [index, spec] of specs.entries()) {
    const body = chain(spec.program ?? []);
    const blocks = [
      ...(index === 0
        ? [
            { type: 'mp_program', x: 0, y: 0, ...(body ? { next: { block: body } } : {}) },
            ...(spec.bare ? [] : [SETUP]),
          ]
        : []),
      ...(spec.blocks ?? []),
    ];
    const state = {
      blocks: { languageVersion: 0, blocks },
      variables: [...DEVICE_VARIABLES, ...(spec.variables ?? [])],
    };
    if (index === 0) loadWorkspace(program[index]!.workspace, state);
    else Blockly.serialization.workspaces.load(state, program[index]!.workspace);
  }
  return program;
}

const files = (program: ProgramTab[]) =>
  Object.fromEntries(generateTabs(program).files.map((file) => [file.name, file.code]));

/** Reads every tab's Python back into blocks, then checks the program makes the same Python. */
function expectRoundTrip(program: ProgramTab[]) {
  const before = files(program);
  for (const tab of program) {
    const edit = pythonForEditing(program, tab.id);
    const read = readTabPython(program, tab.id, edit.text);
    expect(read.problems, `${tab.name}:\n${edit.text}`).toEqual([]);
    Blockly.Events.disable();
    try {
      Blockly.serialization.workspaces.load(read.state!, tab.workspace);
    } finally {
      Blockly.Events.enable();
    }
  }
  expect(files(program)).toEqual(before);
}

/** The problems of reading `text` as the given tab. */
function problemsOf(program: ProgramTab[], tabId: string, text: string) {
  return readTabPython(program, tabId, text).problems.map(
    (problem) => `${text.slice(problem.from, problem.to)} | ${problem.message}`,
  );
}

/** The main tab's file with its Main section's body replaced by `body` (indented). */
function withMain(program: ProgramTab[], body: string): string {
  const edit = pythonForEditing(program, MAIN_TAB_ID);
  const [range] = edit.editable.slice(-1);
  const indent = edit.text.slice(range!.from - 5, range!.from) === 'try:\n' ? '    ' : '';
  const lines = body
    .split('\n')
    .map((line) => (line ? `${indent}${line}` : line))
    .join('\n');
  return `${edit.text.slice(0, range!.from)}${lines}\n${edit.text.slice(range!.to)}`;
}

const inIf = (block: State): State => ({
  type: 'controls_if',
  inputs: {
    IF0: { block: { type: 'logic_boolean', fields: { BOOL: 'TRUE' } } },
    DO0: { block },
  },
});

/** Statement blocks from a flyout; value blocks are printed. */
function asStatements(items: readonly FlyoutItem[]): State[] {
  const out: State[] = [];
  for (const item of items) {
    if (item.kind !== 'block') continue;
    const { kind: _kind, ...state } = item;
    void _kind;
    const type = String(state.type);
    if (
      ['mp_setup', 'mp_program', FUNCTION_BLOCKS.define, FUNCTION_BLOCKS.call].includes(type) ||
      type.startsWith('mp_setup_')
    ) {
      continue;
    }
    const block = Blockly.Blocks[type] as { init?: () => void } | undefined;
    if (!block) continue;
    const probe = new Blockly.Workspace();
    const made = probe.newBlock(type);
    const output = made.outputConnection !== null;
    const last = !output && made.nextConnection === null;
    probe.dispose();
    if (output) out.push({ type: 'mp_print', inputs: { VALUE: { block: state } } });
    // "break out of loop" belongs in a loop.
    else if (type === 'controls_flow_statements') {
      out.push({ type: 'controls_repeat_ext', inputs: { TIMES: num(2), DO: { block: state } } });
    }
    // A block nothing follows (repeat forever, stop) goes inside an "if" so the list goes on.
    else if (last) out.push(inIf(state));
    else out.push(state);
  }
  return out;
}

beforeAll(() => registerBlocks());

afterEach(() => {
  for (const workspace of opened.splice(0)) workspace.dispose();
});

describe('Python back to blocks', () => {
  it('reads every toolbox block back to the same Python', () => {
    const NO_HUB = { hints: NO_HINTS, movement: null };
    const groups: FlyoutItem[][] = [
      outputFlyout(TOOLBOX_STATE),
      inputFlyout(TOOLBOX_STATE),
      movementFlyout(NO_HUB),
      motorsFlyout(NO_HUB),
      sensorsFlyout(NO_HUB),
      controllerFlyout(NO_HUB),
      [...LIGHT_CONTENTS],
      [...SOUND_CONTENTS],
      [...CONTROL_CONTENTS],
      [...OPERATOR_CONTENTS],
      staticToolboxBlocks(),
    ];
    for (const group of groups) {
      const program = openProgram([{ name: 'main', program: asStatements(group) }]);
      expectRoundTrip(program);
    }
  });
});

const txt = (value: string) => ({ shadow: { type: 'text', fields: { TEXT: value } } });
const get = (id: string) => ({ block: { type: 'variables_get', fields: { VAR: { id } } } });
const turn = (value: number) => ({ shadow: { type: 'mp_turn_angle', fields: { ANGLE: value } } });
const percent = (value: number) => ({ shadow: { type: 'mp_percent', fields: { PERCENT: value } } });
const COUNT = [{ name: 'count', id: 'v-count', type: '' }];
const LAPS = [{ name: 'laps', id: 's-laps', type: SHARED_VARIABLE_TYPE }];

const square = (name = 'square'): State => ({
  type: FUNCTION_BLOCKS.define,
  id: `def-${name}`,
  x: 0,
  y: 300,
  fields: { NAME: name, [`INPUT_${name}-side`]: 'side' },
  extraState: { inputs: [{ id: `${name}-side`, name: 'side' }] },
  inputs: {
    DO: {
      block: chain([
        {
          type: 'controls_repeat_ext',
          inputs: {
            TIMES: num(4),
            DO: {
              block: chain([
                {
                  type: 'mp_move',
                  fields: { DIRECTION: 'FORWARD', UNIT: 'MM' },
                  inputs: {
                    AMOUNT: {
                      ...num(0),
                      block: {
                        type: FUNCTION_BLOCKS.input,
                        extraState: { input: `${name}-side`, name: 'side' },
                      },
                    },
                  },
                },
                { type: 'mp_move_turn', inputs: { ANGLE: turn(90) } },
              ]),
            },
          },
        },
        {
          type: SHARED_BLOCKS.change,
          fields: { VAR: { id: 's-laps' } },
          inputs: { DELTA: num(1) },
        },
      ]),
    },
  },
});

const callSquare = (side: number, name = 'square'): State => ({
  type: FUNCTION_BLOCKS.call,
  fields: { FUNC: `def-${name}` },
  extraState: { name, inputs: [{ id: `${name}-side`, name: 'side' }] },
  inputs: { [`ARG_${name}-side`]: num(side) },
});

describe('Python back to blocks: shapes the generator varies', () => {
  it('keeps directions, units, signs and expressions', () => {
    const amount = (value: State) => ({ ...num(1), block: value });
    const sum = {
      type: 'math_arithmetic',
      fields: { OP: 'ADD' },
      inputs: { A: get('v-count'), B: num(1) },
    };
    const statements: State[] = [];
    for (const direction of ['FORWARD', 'BACKWARD']) {
      for (const unit of ['ROTATIONS', 'MM', 'SECONDS']) {
        statements.push({
          type: 'mp_move',
          fields: { DIRECTION: direction, UNIT: unit },
          inputs: { AMOUNT: num(2.5) },
        });
        statements.push({
          type: 'mp_move',
          fields: { DIRECTION: direction, UNIT: unit },
          inputs: { AMOUNT: amount(sum) },
        });
      }
      statements.push({ type: 'mp_move_start', fields: { DIRECTION: direction } });
    }
    for (const direction of ['CLOCKWISE', 'COUNTERCLOCKWISE']) {
      for (const unit of ['ROTATIONS', 'DEGREES', 'SECONDS']) {
        statements.push({
          type: 'mp_motor_run_for',
          fields: { PORT: 'C', DIRECTION: direction, UNIT: unit },
          inputs: { AMOUNT: num(3) },
        });
        statements.push({
          type: 'mp_motor_run_for',
          fields: { PORT: 'C', DIRECTION: direction, UNIT: unit },
          inputs: { AMOUNT: amount(sum) },
        });
      }
      statements.push({ type: 'mp_motor_start', fields: { PORT: 'D', DIRECTION: direction } });
    }
    statements.push(
      { type: 'mp_motor_set_speed', fields: { PORT: 'C' }, inputs: { SPEED: percent(75) } },
      {
        type: 'mp_motor_set_speed',
        fields: { PORT: 'D' },
        inputs: { SPEED: { ...percent(10), block: sum } },
      },
      { type: 'mp_wait_seconds', inputs: { SECONDS: amount(sum) } },
      { type: 'mp_wait', inputs: { TIME: amount(sum) } },
      { type: 'mp_sound_note', fields: { NOTE: '440' }, inputs: { SECONDS: num(0.25) } },
      { type: 'mp_hub_beep', inputs: { FREQUENCY: num(1000), DURATION: num(50) } },
      {
        type: 'mp_light_pixel',
        fields: { ROW: '5', COLUMN: '2' },
        inputs: { BRIGHTNESS: num(40) },
      },
      {
        type: 'mp_move_start_steering',
        inputs: { STEERING: { shadow: { type: 'mp_steering', fields: { STEERING: -40 } } } },
      },
      { type: 'mp_move_turn', inputs: { ANGLE: { ...turn(90), block: sum } } },
      { type: 'mp_hub_display_text', inputs: { TEXT: { ...txt('x'), block: sum } } },
      { type: 'math_change', fields: { VAR: { id: 'v-count' } }, inputs: { DELTA: num(-2) } },
      {
        type: 'controls_if',
        extraState: { elseIfCount: 2, hasElse: true },
        inputs: {
          IF0: {
            block: {
              type: 'logic_compare',
              fields: { OP: 'GTE' },
              inputs: { A: get('v-count'), B: num(3) },
            },
          },
          DO0: { block: { type: 'mp_print', inputs: { VALUE: txt('big') } } },
          IF1: {
            block: {
              type: 'logic_negate',
              inputs: { BOOL: { block: { type: 'mp_sensor_pressed', fields: { PORT: 'F' } } } },
            },
          },
          IF2: {
            block: {
              type: 'mp_sensor_closer',
              fields: { PORT: 'E' },
              inputs: { DISTANCE: num(80) },
            },
          },
          DO2: { block: { type: 'controls_flow_statements', fields: { FLOW: 'BREAK' } } },
          ELSE: {
            block: {
              type: 'mp_plot',
              fields: { LABEL: 'count' },
              inputs: { VALUE: get('v-count') },
            },
          },
        },
      },
    );
    const texts: State[] = [0, 1, 2, 3].map((items): State => ({
      type: 'mp_print',
      inputs: {
        VALUE: {
          block: {
            type: 'text_join',
            extraState: { itemCount: items },
            inputs: Object.fromEntries(
              [txt('a'), get('v-count'), num(3)].slice(0, items).map((value, index) => [
                `ADD${index}`,
                {
                  block:
                    (value as { shadow?: State; block?: State }).shadow ??
                    (value as { block: State }).block,
                },
              ]),
            ),
          },
        },
      },
    }));
    for (const op of ['ROUND', 'ROUNDUP', 'ROUNDDOWN']) {
      texts.push({
        type: 'mp_print',
        inputs: {
          VALUE: {
            block: { type: 'math_round', fields: { OP: op }, inputs: { NUM: get('v-count') } },
          },
        },
      });
    }
    for (const op of ['ADD', 'MINUS', 'MULTIPLY', 'DIVIDE', 'POWER']) {
      texts.push({
        type: 'mp_print',
        inputs: {
          VALUE: {
            block: {
              type: 'math_arithmetic',
              fields: { OP: op },
              inputs: { A: { block: sum }, B: num(-2) },
            },
          },
        },
      });
    }
    const program = openProgram([
      {
        name: 'main',
        variables: COUNT,
        program: [
          {
            type: 'controls_repeat_ext',
            inputs: { TIMES: get('v-count'), DO: { block: chain([...statements, ...texts]) } },
          },
        ],
      },
    ]);
    expectRoundTrip(program);
  });

  it('reads the controller blocks: several motors, a stick, the buttons, the styles', () => {
    const program = openProgram([
      {
        name: 'main',
        program: [
          { type: 'mp_ctrl_use', fields: { CONTROLLER: 'XBOX' } },
          {
            type: 'mp_forever',
            inputs: {
              DO: {
                block: chain([
                  ...['ONE_STICK', 'TANK', 'RACING'].map((style) => ({
                    type: 'mp_ctrl_drive',
                    fields: { STYLE: style },
                  })),
                  { type: 'mp_ctrl_motor', fields: { SOURCE: 'A_B', MOTORS: 'C+D-' } },
                  { type: 'mp_ctrl_motor', fields: { SOURCE: 'RIGHT_Y', MOTORS: 'E-' } },
                  { type: 'mp_ctrl_motor', fields: { SOURCE: 'TRIGGERS', MOTORS: 'F+' } },
                  ...['SHORT', 'LONG', 'TWICE'].map((kind) => ({
                    type: 'mp_ctrl_rumble',
                    fields: { KIND: kind },
                  })),
                  {
                    type: 'controls_if',
                    inputs: {
                      IF0: {
                        block: {
                          type: 'logic_operation',
                          fields: { OP: 'OR' },
                          inputs: {
                            A: { block: { type: 'mp_ctrl_pressed', fields: { BUTTON: 'X' } } },
                            B: { block: { type: 'mp_ctrl_clicked', fields: { BUTTON: 'UP' } } },
                          },
                        },
                      },
                      DO0: {
                        block: {
                          type: 'mp_print',
                          inputs: {
                            VALUE: { block: { type: 'mp_ctrl_value', fields: { VALUE: 'RT' } } },
                          },
                        },
                      },
                    },
                  },
                ]),
              },
            },
          },
        ],
      },
    ]);
    expectRoundTrip(program);
    // "use the controller" makes no Python of its own; it stays first in the program.
    expect(program[0]!.workspace.getBlocksByType('mp_ctrl_use', false)).toHaveLength(1);
  });

  it('reads functions in tabs, calls between tabs, and shared variables (several files)', () => {
    const program = openProgram([
      {
        name: 'main',
        variables: [...COUNT, ...LAPS],
        program: [
          { type: SHARED_BLOCKS.set, fields: { VAR: { id: 's-laps' } }, inputs: { VALUE: num(0) } },
          callSquare(200),
          {
            type: 'mp_print',
            inputs: {
              VALUE: { block: { type: SHARED_BLOCKS.get, fields: { VAR: { id: 's-laps' } } } },
            },
          },
          { type: 'mp_motor_set_speed', fields: { PORT: 'D' }, inputs: { SPEED: percent(30) } },
        ],
        blocks: [
          {
            type: FUNCTION_BLOCKS.define,
            id: 'def-hello',
            x: 0,
            y: 600,
            fields: { NAME: 'hello' },
            inputs: {
              DO: {
                block: {
                  type: 'variables_set',
                  fields: { VAR: { id: 'v-count' } },
                  inputs: { VALUE: num(5) },
                },
              },
            },
          },
        ],
      },
      { name: 'shapes', variables: LAPS, blocks: [square()] },
    ]);
    expect(generateTabs(program).files.map((file) => file.name)).toEqual([
      'main.py',
      'shapes.py',
      'setup.py',
    ]);
    expectRoundTrip(program);
    // The define block kept its id, so main's call still finds it.
    expect(program[1]!.workspace.getBlockById('def-square')).not.toBeNull();
  });

  it('reads shared variables and functions in a program of one file', () => {
    const program = openProgram([
      {
        name: 'main',
        variables: [...COUNT, ...LAPS],
        program: [
          callSquare(150),
          { type: 'mp_motor_set_speed', fields: { PORT: 'C' }, inputs: { SPEED: percent(30) } },
        ],
        blocks: [square()],
      },
    ]);
    expect(generateTabs(program).files).toHaveLength(1);
    expectRoundTrip(program);
  });

  it('keeps the kind of block the tab used when two make the same Python', () => {
    const program = openProgram([
      {
        name: 'main',
        program: [
          { type: 'mp_hub_light_on', fields: { COLOR: 'BLUE' } },
          { type: 'mp_wait', inputs: { TIME: num(1500) } },
          {
            type: 'mp_motor_run_for',
            fields: { PORT: 'C', DIRECTION: 'CLOCKWISE', UNIT: 'DEGREES' },
            inputs: { AMOUNT: num(720) },
          },
        ],
      },
    ]);
    expectRoundTrip(program);
    const types = program[0]!.workspace.getAllBlocks(true).map((block) => block.type);
    expect(types).toContain('mp_hub_light_on');
    expect(types).toContain('mp_wait');
    expect(types).not.toContain('mp_light_button');
    const run = program[0]!.workspace.getBlocksByType('mp_motor_run_for', false)[0]!;
    expect(run.getFieldValue('UNIT')).toBe('DEGREES');
  });
});

describe('Python back to blocks: changes', () => {
  it('changes a number, adds lines and a variable, and adds a function', () => {
    const program = openProgram([
      {
        name: 'main',
        program: [
          {
            type: 'mp_move',
            fields: { DIRECTION: 'FORWARD', UNIT: 'MM' },
            inputs: { AMOUNT: num(200) },
          },
        ],
      },
    ]);
    const text = withMain(
      program,
      [
        'robot.straight(300)',
        'speed = 3',
        'for count in range(speed):',
        '    robot.turn(90)',
        'wiggle()',
      ].join('\n'),
    ).replace(/(# --- Functions -+\n)\n/, '$1\ndef wiggle():\n    hub.light.on(Color.RED)\n');
    const read = readTabPython(program, MAIN_TAB_ID, text);
    expect(read.problems).toEqual([]);
    Blockly.serialization.workspaces.load(read.state!, program[0]!.workspace);
    expect(read.unplaced).toHaveLength(1);
    const main = generateTabs(program).code;
    expect(main).toContain(
      '    robot.straight(300)\n    speed = 3\n    for count in range(int(speed)):\n        robot.turn(90)\n    wiggle()\n',
    );
    expect(main).toContain('def wiggle():\n    hub.light.on(Color.RED)\n');
    expect(main).toContain('speed = 0');
  });

  it('marks what it cannot read, where it is, and changes nothing', () => {
    const program = openProgram([
      {
        name: 'main',
        variables: COUNT,
        program: [{ type: 'mp_print', inputs: { VALUE: txt('hi') } }],
      },
    ]);
    const check = (body: string) => problemsOf(program, MAIN_TAB_ID, withMain(program, body));
    expect(check('robot.straight(300')[0]).toMatch(/syntax error/);
    expect(check('x = [1, 2]')).toEqual(['[1, 2] | There is no block for this yet.']);
    expect(check('print(speed)')).toEqual([
      'speed | There is no variable called “speed”. Set it first, for example speed = 0.',
    ]);
    expect(check('dance()')).toEqual(['dance() | There is no block or function called “dance”.']);
    expect(check('robot.straigt(300)')).toEqual([
      'robot.straigt(300) | There is no block for robot.straigt(). Did you mean robot.straight()?',
    ]);
    expect(check('prnt(1)')).toEqual([
      'prnt(1) | There is no block for prnt(). Did you mean print()?',
    ]);
    expect(check('return')).toEqual([
      'return | Function blocks do not give back a value, so there is no block for return.',
    ]);
    expect(check('break')).toEqual(['break | “break” only works inside a loop.']);
    expect(check('robot = 5')).toEqual([
      'robot | “robot” is a name the program uses itself. Choose another name.',
    ]);
    expect(check('count -= count')[0]).toMatch(/change by/);
    expect(check('motor_a.run(500)')[0]).toMatch(/motor_a_speed/);
    expect(check('print("a b:", 1)')[0]).toMatch(/plot name/);
    expect(check('hub.display.icon([[0, 5, 0, 0, 0]] * 5)')[0]).toMatch(/5 rows/);
  });

  it('only takes functions in the Functions part, and checks their names', () => {
    const program = openProgram([{ name: 'main' }, { name: 'moves', blocks: [square('hop')] }]);
    const edit = pythonForEditing(program, MAIN_TAB_ID);
    const functionsAt = edit.editable[0]!.from;
    const put = (code: string) =>
      `${edit.text.slice(0, functionsAt)}${code}\n${edit.text.slice(functionsAt)}`;
    const problems = (code: string) => problemsOf(program, MAIN_TAB_ID, put(code));
    expect(problems('x = 1')).toEqual([
      'x = 1 | Only functions (def …) go in the “Functions” part. Put this under Main.',
    ]);
    expect(problems('def hop():\n    pass')).toEqual([
      'hop | The tab “moves” already has a function “hop”.',
    ]);
    expect(problems('def moves():\n    pass')).toEqual([
      'moves | “moves” is already a name the program uses. Choose another name.',
    ]);
    expect(problems('def go(a, a):\n    pass')).toEqual(['a | Two inputs are called “a”.']);
    expect(problems('def go(a=1):\n    pass')[0]).toMatch(/without default values/);
  });
});

describe('the parts of a file that can be edited', () => {
  it('are the Functions section and, in main, the program inside try', () => {
    const program = openProgram([{ name: 'main', program: [{ type: 'mp_move_stop' }] }]);
    const edit = pythonForEditing(program, MAIN_TAB_ID);
    expect(edit.fileName).toBe('main.py');
    expect(edit.editable.map((range) => edit.text.slice(range.from, range.to))).toEqual([
      '\n\n',
      '    robot.brake()\n',
    ]);
  });

  it('is everything under Main when there is no motor, and a tab gets a Functions section', () => {
    const program = openProgram([
      { name: 'main', bare: true, program: [{ type: 'mp_print', inputs: { VALUE: txt('hi') } }] },
      { name: 'empty' },
    ]);
    const main = pythonForEditing(program, MAIN_TAB_ID);
    expect(main.editable.map((range) => main.text.slice(range.from, range.to))).toEqual([
      '\n\n',
      "print('hi')\n",
    ]);
    const tab = pythonForEditing(program, 'tab-empty');
    expect(tab.fileName).toBe('empty.py');
    expect(tab.editable.map((range) => tab.text.slice(range.from, range.to))).toEqual(['\n\n']);
    expect(editableRanges(tab.text, false)).toEqual(tab.editable);
  });
});
