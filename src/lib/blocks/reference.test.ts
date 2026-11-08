import * as Blockly from 'blockly/core';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NO_HINTS } from './fields/hints';
import { FUNCTION_BLOCKS } from './functions';
import { generateTabs } from './generator';
import { DEVICES, type DeviceType, type PortName } from './pybricks';
import {
  ALIKE,
  REFERENCE,
  entryId,
  referenceEntries,
  type BlockReference,
  type BlockShape,
} from './reference';
import { loadWorkspace, registerBlocks } from './register';
import { blockWords, normalise } from './search';
import { SHARED_BLOCKS, SHARED_VARIABLE_TYPE } from './shared';
import {
  CONTROL_CONTENTS,
  LIGHT_CONTENTS,
  OPERATOR_CONTENTS,
  SOUND_CONTENTS,
  conditionsFlyout,
  controllerFlyout,
  motorsFlyout,
  movementFlyout,
  sensorsFlyout,
} from './simple-toolbox';
import { MAIN_TAB_ID, linkTab, type ProgramTab } from './tabs';
import {
  inputFlyout,
  outputFlyout,
  setupFlyout,
  staticToolboxBlocks,
  type FlyoutItem,
  type ToolboxState,
} from './toolbox';

type State = Record<string, unknown>;

const DEVICE_LIST: { type: DeviceType; id: string; name: string; port: PortName }[] = [
  { type: 'Motor', id: 'd-motor', name: 'motor', port: 'C' },
  { type: 'ColorSensor', id: 'd-colour', name: 'colour sensor', port: 'D' },
  { type: 'UltrasonicSensor', id: 'd-distance', name: 'distance sensor', port: 'E' },
  { type: 'ForceSensor', id: 'd-touch', name: 'touch sensor', port: 'F' },
];

const STATE: ToolboxState = {
  devices: DEVICE_LIST.map((device) => ({
    type: device.type,
    variableId: device.id,
    name: device.name,
    port: device.port,
  })),
  variableNames: {
    Motor: ['motor'],
    ColorSensor: ['colour sensor'],
    UltrasonicSensor: ['distance sensor'],
    ForceSensor: ['touch sensor'],
  },
  hasSetupBlock: true,
};

const chain = (blocks: State[]): State | undefined =>
  blocks.reduceRight<State | undefined>(
    (next, block) => (next ? { ...block, next: { block: next } } : block),
    undefined,
  );

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

const DEVICE_VARIABLES = DEVICE_LIST.map(({ name, id, type }) => ({ name, id, type }));

/** Every block the toolbox offers, as each category would open with these devices set up. */
function toolboxItems(): FlyoutItem[] {
  const noHub = { hints: NO_HINTS, movement: null };
  return [
    movementFlyout(noHub),
    motorsFlyout(noHub),
    [...LIGHT_CONTENTS],
    [...SOUND_CONTENTS],
    [...CONTROL_CONTENTS],
    conditionsFlyout(noHub),
    sensorsFlyout(noHub),
    controllerFlyout(noHub),
    [...OPERATOR_CONTENTS],
    setupFlyout({ ...STATE, devices: [], hasSetupBlock: false }),
    outputFlyout(STATE),
    inputFlyout(STATE),
    staticToolboxBlocks(),
  ]
    .flat()
    .filter((item) => item.kind === 'block');
}

const opened: Blockly.Workspace[] = [];

/** The main file of a program with these blocks under "when the program starts". */
function mainFile(body: State[], extra: State[] = [], variables: State[] = []): string {
  const workspace = new Blockly.Workspace();
  opened.push(workspace);
  const program: ProgramTab[] = [{ id: MAIN_TAB_ID, name: 'main', workspace }];
  linkTab(workspace, () => program, null);
  const start = chain(body);
  loadWorkspace(workspace, {
    blocks: {
      languageVersion: 0,
      blocks: [
        { type: 'mp_program', x: 0, y: 0, ...(start ? { next: { block: start } } : {}) },
        SETUP,
        ...extra,
      ],
    },
    variables: [...DEVICE_VARIABLES, ...variables],
  });
  return generateTabs(program).files.find((file) => file.name === 'main.py')?.code ?? '';
}

/** A toolbox block in a program: a value is printed, "break" goes in a loop. */
function asStatement(item: FlyoutItem): State {
  const { kind: _kind, ...state } = item;
  void _kind;
  const probe = new Blockly.Workspace();
  const output = probe.newBlock(String(state.type)).outputConnection !== null;
  probe.dispose();
  if (output) return { type: 'mp_print', inputs: { VALUE: { block: state } } };
  if (state.type === 'controls_flow_statements') {
    return {
      type: 'controls_repeat_ext',
      inputs: {
        TIMES: { shadow: { type: 'math_number', fields: { NUM: 2 } } },
        DO: { block: state },
      },
    };
  }
  return state;
}

/** The Python an entry shows, as a pattern: "…" is anything, spaces are any spaces. */
function pythonPattern(python: string): RegExp {
  const parts = python
    .split('…')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
  return new RegExp(parts.join('[\\s\\S]*?'));
}

const wordList = (text: string) => normalise(text).split(' ').filter(Boolean);

/** True when `words` appear in `text` in the same order (other words may sit between). */
function inOrder(words: string, text: string): boolean {
  const have = wordList(text);
  let at = 0;
  for (const word of wordList(words)) {
    const found = have.indexOf(word, at);
    if (found < 0) return false;
    at = found + 1;
  }
  return true;
}

function shapeOf(type: string): BlockShape {
  const workspace = new Blockly.Workspace();
  try {
    const block = workspace.newBlock(type);
    if (block.outputConnection) {
      return block.outputConnection.getCheck()?.includes('Boolean') ? 'question' : 'value';
    }
    if (!block.previousConnection) return 'hat';
    const wraps = block.inputList.some(
      (input) => input.type === Blockly.inputs.inputTypes.STATEMENT,
    );
    return wraps ? 'wrap' : 'step';
  } finally {
    workspace.dispose();
  }
}

/** The toolbox block an entry describes: of its type, with its words, the shortest such. */
function toolboxBlockFor(entry: BlockReference, items: readonly FlyoutItem[]) {
  return items
    .filter((item) => item.type === entry.type && inOrder(entry.words, blockWords(item)))
    .sort((a, b) => wordList(blockWords(a)).length - wordList(blockWords(b)).length)[0];
}

beforeAll(() => registerBlocks());

afterEach(() => {
  for (const workspace of opened.splice(0)) workspace.dispose();
});

/** Blocks that are not in a fixed flyout: the start block, variables and functions. */
const PROGRAM_BLOCKS = new Set([
  'mp_program',
  'variables_set',
  'math_change',
  'variables_get',
  SHARED_BLOCKS.set,
  SHARED_BLOCKS.change,
  SHARED_BLOCKS.get,
  FUNCTION_BLOCKS.define,
  FUNCTION_BLOCKS.call,
  FUNCTION_BLOCKS.input,
]);

/** Blocks that change only the program's Config. */
const CONFIG_ONLY = new Set(['mp_move_motors', 'mp_move_wheels']);

describe('every block, explained', () => {
  it('has an entry for every block the toolbox offers, and only real blocks', () => {
    const listed = new Set(referenceEntries().map((entry) => entry.block.type));
    const offered = new Set(toolboxItems().map((item) => String(item.type)));
    expect([...offered].filter((type) => !listed.has(type))).toEqual([]);
    for (const type of listed) {
      expect(Blockly.Blocks[type], type).toBeDefined();
      if (!offered.has(type)) expect(PROGRAM_BLOCKS.has(type), type).toBe(true);
    }
  });

  it('says each block’s own words and draws its shape', () => {
    const items = toolboxItems();
    for (const { block } of referenceEntries()) {
      if (PROGRAM_BLOCKS.has(block.type)) continue;
      expect(toolboxBlockFor(block, items), `${block.type}: “${block.words}”`).toBeDefined();
    }
    for (const { block } of referenceEntries()) {
      expect(shapeOf(block.type), block.type).toBe(block.shape);
    }
  });

  it('shows the Python each toolbox block really makes', () => {
    const items = toolboxItems();
    for (const { block } of referenceEntries()) {
      if (PROGRAM_BLOCKS.has(block.type)) continue;
      const item = toolboxBlockFor(block, items)!;
      // The drive base's settings show only in a program that drives.
      const drive = CONFIG_ONLY.has(block.type) ? [{ type: 'mp_move' }] : [];
      const code = mainFile(block.type.startsWith('mp_setup') ? [] : [asStatement(item), ...drive]);
      expect(code, `${block.type}: ${block.python}`).toMatch(pythonPattern(block.python));
    }
  });

  it('shows the Python of the start block, variables and functions', () => {
    const num = (value: number) => ({ shadow: { type: 'math_number', fields: { NUM: value } } });
    const square: State = {
      type: FUNCTION_BLOCKS.define,
      id: 'def-square',
      x: 0,
      y: 400,
      fields: { NAME: 'square', 'INPUT_square-side': 'side' },
      extraState: { inputs: [{ id: 'square-side', name: 'side' }] },
      inputs: {
        DO: {
          block: {
            type: 'mp_print',
            inputs: {
              VALUE: {
                block: {
                  type: FUNCTION_BLOCKS.input,
                  extraState: { input: 'square-side', name: 'side' },
                },
              },
            },
          },
        },
      },
    };
    const program = [
      { type: 'variables_set', fields: { VAR: { id: 'v-count' } }, inputs: { VALUE: num(0) } },
      { type: 'math_change', fields: { VAR: { id: 'v-count' } }, inputs: { DELTA: num(1) } },
      {
        type: 'mp_print',
        inputs: { VALUE: { block: { type: 'variables_get', fields: { VAR: { id: 'v-count' } } } } },
      },
      { type: SHARED_BLOCKS.set, fields: { VAR: { id: 's-laps' } }, inputs: { VALUE: num(0) } },
      { type: SHARED_BLOCKS.change, fields: { VAR: { id: 's-laps' } }, inputs: { DELTA: num(1) } },
      {
        type: 'mp_print',
        inputs: {
          VALUE: { block: { type: SHARED_BLOCKS.get, fields: { VAR: { id: 's-laps' } } } },
        },
      },
      {
        type: FUNCTION_BLOCKS.call,
        fields: { FUNC: 'def-square' },
        extraState: { name: 'square', inputs: [{ id: 'square-side', name: 'side' }] },
        inputs: { 'ARG_square-side': num(200) },
      },
    ];
    const code = mainFile(
      program,
      [square],
      [
        { name: 'count', id: 'v-count', type: '' },
        { name: 'laps', id: 's-laps', type: SHARED_VARIABLE_TYPE },
      ],
    );
    for (const { block } of referenceEntries()) {
      if (!PROGRAM_BLOCKS.has(block.type)) continue;
      expect(code, `${block.type}: ${block.python}`).toMatch(pythonPattern(block.python));
    }
    // Their words, from the blocks themselves.
    const workspace = new Blockly.Workspace();
    opened.push(workspace);
    linkTab(workspace, () => [{ id: MAIN_TAB_ID, name: 'main', workspace }], null);
    loadWorkspace(workspace, {
      blocks: {
        languageVersion: 0,
        blocks: [{ type: 'mp_program', x: 0, y: 0, next: { block: chain(program) } }, square],
      },
      variables: [
        { name: 'count', id: 'v-count', type: '' },
        { name: 'laps', id: 's-laps', type: SHARED_VARIABLE_TYPE },
      ],
    });
    const texts = workspace.getAllBlocks(false).map((made) => [made.type, made.toString()]);
    for (const { block } of referenceEntries()) {
      if (!PROGRAM_BLOCKS.has(block.type)) continue;
      const shown = texts.filter(([type]) => type === block.type).map(([, text]) => text!);
      expect(
        shown.some((text) => inOrder(block.words, text)),
        `${block.type}: “${block.words}” in ${JSON.stringify(shown)}`,
      ).toBe(true);
    }
  });

  it('links each look-alike to entries, and gives every entry its own id', () => {
    const listed = new Set(referenceEntries().map((entry) => entry.block.type));
    for (const pair of ALIKE)
      for (const type of pair.types) expect(listed.has(type), type).toBe(true);
    const ids = referenceEntries().map((entry) => entryId(entry.block));
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(REFERENCE.map((category) => category.id)).size).toBe(REFERENCE.length);
  });
});
