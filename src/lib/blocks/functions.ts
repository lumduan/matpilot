/**
 * Functions: blocks of your own (docs/adr/0013-block-tabs.md). "define" makes one, with a name
 * and inputs; a call block runs it, from its own tab or from another; an input block reads one of
 * its inputs inside it. In Python they are `def square(side):`, `square(200)`, and
 * `moves.square(200)` when the function is in the tab "moves".
 *
 * A call block finds its function by the define block's id, so renaming a function or moving it
 * to another tab ("Move to tab") keeps every call working. Call and input blocks also keep the
 * function's name and inputs in their saved state, so a tab loads on its own; the editor brings
 * them up to date after every change (syncFunctionBlocks).
 *
 * Function and input names are Python names (English letters, numbers and _), so the Python reads
 * like the blocks. Variables belong to their tab, like a Python module's; a value goes into a
 * function through its inputs.
 */
import * as Blockly from 'blockly/core';
import { Order, pythonGenerator } from 'blockly/python';
import { ICONS } from './fields/images';
import { INDENT } from './generator-context';
import {
  MAIN_TAB_ID,
  cleanPythonName,
  isReservedName,
  programTabsOf,
  tabActionsOf,
  tabOf,
  type ProgramTab,
} from './tabs';
import type { FlyoutItem } from './toolbox';

export const FUNCTION_BLOCKS = {
  define: 'mp_func_define',
  call: 'mp_func_call',
  input: 'mp_func_input',
} as const;

export const FUNCTION_STYLE = 'mp_function_blocks';
export const FUNCTION_DEFINE_STYLE = 'mp_function_define_blocks';

export const FUNCTION_NAME_MAX_LENGTH = 30;
export const INPUT_NAME_MAX_LENGTH = 20;
export const MAX_FUNCTION_INPUTS = 5;
export const NEW_FUNCTION_NAME = 'my_function';
const NEW_INPUT_NAMES = ['x', 'y', 'z'];

export interface FunctionInput {
  readonly id: string;
  readonly name: string;
}

/** A "define" block, as calls and the generator see it. */
export interface FunctionInfo {
  /** The define block's id. */
  readonly id: string;
  readonly name: string;
  readonly inputs: readonly FunctionInput[];
  readonly tab: ProgramTab;
  /** `false` when its define block is turned off. */
  readonly enabled: boolean;
}

type DefineBlock = Blockly.Block & {
  inputs_: FunctionInput[];
  updateShape_(): void;
};

type CallBlock = Blockly.Block & {
  func_: { name: string; inputs: FunctionInput[] };
  updateShape_(withShadows: boolean): void;
};

type InputBlock = Blockly.Block & {
  input_: FunctionInput;
};

const ADD_PICTURE = svgButton('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>');
const REMOVE_PICTURE = svgButton('<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>');

function svgButton(body: string): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round">${body}</svg>`,
  )}`;
}

const isInputList = (value: unknown): value is FunctionInput[] =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as FunctionInput).id === 'string' &&
      typeof (item as FunctionInput).name === 'string',
  );

const sameInputs = (a: readonly FunctionInput[], b: readonly FunctionInput[]) =>
  a.length === b.length && a.every((item, i) => item.id === b[i]?.id && item.name === b[i]?.name);

// --- The program's functions -------------------------------------------------------------

/** Every define block of the program, by id, in tab order. */
export function collectFunctions(tabs: readonly ProgramTab[]): Map<string, FunctionInfo> {
  const functions = new Map<string, FunctionInfo>();
  for (const tab of tabs) {
    for (const block of tab.workspace.getBlocksByType(FUNCTION_BLOCKS.define, true)) {
      functions.set(block.id, {
        id: block.id,
        name: block.getFieldValue('NAME') as string,
        inputs: [...(block as DefineBlock).inputs_],
        tab,
        enabled: block.isEnabled(),
      });
    }
  }
  return functions;
}

/** `name`, or `name2`, `name3`... if another function or a tab already has it. */
export function uniqueFunctionName(
  name: string,
  workspace: Blockly.Workspace,
  exceptBlockId: string | null,
): string {
  const tabs = programTabsOf(workspace);
  const taken = new Set([
    ...[...collectFunctions(tabs).values()]
      .filter((info) => info.id !== exceptBlockId)
      .map((info) => info.name),
    ...tabs.map((tab) => tab.name),
  ]);
  if (!taken.has(name)) return name;
  const base = name.replace(/\d+$/, '') || name;
  for (let i = 2; ; i += 1) {
    const candidate = `${base}${i}`.slice(-FUNCTION_NAME_MAX_LENGTH);
    if (!taken.has(candidate)) return candidate;
  }
}

/** Function names and the program's other names they may not take. */
function functionNameValidator(this: Blockly.FieldTextInput, text: string): string | null {
  const name = cleanPythonName(text, FUNCTION_NAME_MAX_LENGTH);
  if (name === '' || isReservedName(name)) return null;
  const block = this.getSourceBlock();
  return block ? uniqueFunctionName(name, block.workspace, block.id) : name;
}

function inputNameValidator(this: Blockly.FieldTextInput, text: string): string | null {
  const name = cleanPythonName(text, INPUT_NAME_MAX_LENGTH);
  if (name === '' || isReservedName(name)) return null;
  const block = this.getSourceBlock() as DefineBlock | null;
  const id = (this.name ?? '').slice('INPUT_'.length);
  if (!block) return name;
  if (block.inputs_.some((input) => input.id !== id && input.name === name)) return null;
  block.inputs_ = block.inputs_.map((input) => (input.id === id ? { ...input, name } : input));
  return name;
}

/** The define block around `block`, if any. */
function enclosingDefinition(block: Blockly.Block): DefineBlock | null {
  let parent = block.getSurroundParent();
  while (parent) {
    if (parent.type === FUNCTION_BLOCKS.define) return parent as DefineBlock;
    parent = parent.getSurroundParent();
  }
  return null;
}

/** The current name of an input block's input: from its define block, else as saved. */
function inputName(block: InputBlock): string {
  const definition = enclosingDefinition(block);
  return (
    definition?.inputs_.find((input) => input.id === block.input_.id)?.name ?? block.input_.name
  );
}

// --- The blocks --------------------------------------------------------------------------

/** Records a change of a define block's inputs, so Undo and Redo can replay it. */
function changeInputs(block: DefineBlock, next: FunctionInput[]): void {
  const before = Blockly.Events.BlockChange.getExtraBlockState_(
    block as unknown as Blockly.BlockSvg,
  );
  block.inputs_ = next;
  block.updateShape_();
  const after = Blockly.Events.BlockChange.getExtraBlockState_(
    block as unknown as Blockly.BlockSvg,
  );
  if (before !== after) {
    Blockly.Events.fire(new Blockly.Events.BlockChange(block, 'mutation', null, before, after));
  }
}

const DEFINE_BLOCK = {
  init(this: DefineBlock) {
    this.inputs_ = [];
    this.appendDummyInput('HEAD')
      .appendField(new Blockly.FieldImage(ICONS.function, 24, 24, ''), 'ICON')
      .appendField('define', 'DEFINE')
      .appendField(new Blockly.FieldTextInput(NEW_FUNCTION_NAME, functionNameValidator), 'NAME');
    this.appendStatementInput('DO');
    this.setStyle(FUNCTION_DEFINE_STYLE);
    this.setTooltip(
      'A block of your own. Name it, add inputs with ⊕, and put blocks inside. Use it from the Functions blocks, in this tab or in another.',
    );
    this.updateShape_();
  },
  saveExtraState(this: DefineBlock) {
    return this.inputs_.length > 0 ? { inputs: this.inputs_.map((input) => ({ ...input })) } : null;
  },
  loadExtraState(this: DefineBlock, state: unknown) {
    const inputs = (state as { inputs?: unknown } | null)?.inputs;
    this.inputs_ = isInputList(inputs) ? inputs.map((input) => ({ ...input })) : [];
    this.updateShape_();
  },
  updateShape_(this: DefineBlock) {
    const head = this.getInput('HEAD');
    if (!head) return;
    for (const field of [...head.fieldRow]) {
      const name = field.name ?? '';
      if (name.startsWith('INPUT_') || ['WITH', 'ADD', 'REMOVE'].includes(name)) {
        head.removeField(name, true);
      }
    }
    if (this.inputs_.length > 0) head.appendField('with', 'WITH');
    for (const input of this.inputs_) {
      head.appendField(
        new Blockly.FieldTextInput(input.name, inputNameValidator),
        `INPUT_${input.id}`,
      );
    }
    if (this.inputs_.length < MAX_FUNCTION_INPUTS) {
      head.appendField(
        new Blockly.FieldImage(ADD_PICTURE, 20, 20, 'Add an input', () => addInput(this)),
        'ADD',
      );
    }
    if (this.inputs_.length > 0) {
      head.appendField(
        new Blockly.FieldImage(REMOVE_PICTURE, 20, 20, 'Remove the last input', () =>
          removeInput(this),
        ),
        'REMOVE',
      );
    }
  },
  customContextMenu(
    this: DefineBlock,
    options: (
      | Blockly.ContextMenuRegistry.ContextMenuOption
      | Blockly.ContextMenuRegistry.LegacyContextMenuOption
    )[],
  ) {
    if (this.isInFlyout) return;
    const actions = tabActionsOf(this.workspace);
    if (!actions) return;
    const own = tabOf(this.workspace);
    for (const tab of programTabsOf(this.workspace)) {
      if (tab.id === own.id) continue;
      options.push({
        text: `Move to the tab “${tab.name}”`,
        enabled: true,
        callback: () => actions.moveToTab(this, tab.id),
      });
    }
  },
};

function addInput(block: DefineBlock): void {
  if (block.isInFlyout || block.inputs_.length >= MAX_FUNCTION_INPUTS) return;
  const taken = new Set(block.inputs_.map((input) => input.name));
  const name =
    NEW_INPUT_NAMES.find((candidate) => !taken.has(candidate)) ??
    Array.from({ length: MAX_FUNCTION_INPUTS + 1 }, (_, i) => `input${i + 1}`).find(
      (candidate) => !taken.has(candidate),
    ) ??
    'input';
  changeInputs(block, [...block.inputs_, { id: Blockly.utils.idGenerator.genUid(), name }]);
}

function removeInput(block: DefineBlock): void {
  if (block.isInFlyout || block.inputs_.length === 0) return;
  changeInputs(block, block.inputs_.slice(0, -1));
}

/**
 * The function a call block runs, as a dropdown of the functions this tab may use. The value is
 * the define block's id; the text is the function's current name.
 */
export class FieldFunction extends Blockly.FieldDropdown {
  constructor(validator?: Blockly.FieldDropdownValidator) {
    super(function (this: Blockly.FieldDropdown) {
      return (this as FieldFunction).menuOptions();
    }, validator);
  }

  /** Functions this block's tab may use, and the current one even if it is gone. */
  menuOptions(): Blockly.MenuOption[] {
    const block = this.getSourceBlock() as CallBlock | null;
    if (!block) return [[NEW_FUNCTION_NAME, '']];
    const options: Blockly.MenuOption[] = callableFunctions(block.workspace).map((info) => [
      info.tab.id === tabOf(block.workspace).id ? info.name : `${info.name} (tab ${info.tab.name})`,
      info.id,
    ]);
    const value = this.getValue();
    if (value && !options.some((option) => option[1] === value)) {
      options.push([block.func_.name, value]);
    }
    return options.length > 0 ? options : [[block.func_.name, value ?? '']];
  }

  /** Any id: the function may be in a tab that is not loaded yet, or gone (a problem). */
  protected override doClassValidation_(value?: unknown): string | null {
    return typeof value === 'string' ? value : null;
  }

  protected override getText_(): string {
    const block = this.getSourceBlock() as CallBlock | null;
    if (!block) return NEW_FUNCTION_NAME;
    const info = collectFunctions(programTabsOf(block.workspace)).get(this.getValue() ?? '');
    return info?.name ?? block.func_.name;
  }
}

/** Functions a block in `workspace`'s tab may call: its own tab's, and other tabs' but main's. */
export function callableFunctions(workspace: Blockly.Workspace): FunctionInfo[] {
  const tab = tabOf(workspace);
  const functions = [...collectFunctions(programTabsOf(workspace)).values()].filter(
    (info) => info.enabled,
  );
  const mainId = programTabsOf(workspace)[0]?.id ?? MAIN_TAB_ID;
  return [
    ...functions.filter((info) => info.tab.id === tab.id),
    ...functions.filter((info) => info.tab.id !== tab.id && info.tab.id !== mainId),
  ];
}

const CALL_BLOCK = {
  init(this: CallBlock) {
    this.func_ = { name: NEW_FUNCTION_NAME, inputs: [] };
    this.appendDummyInput('HEAD')
      .appendField(new Blockly.FieldImage(ICONS.function, 24, 24, ''), 'ICON')
      .appendField(
        new FieldFunction(function (this: Blockly.FieldDropdown, id: string) {
          const block = this.getSourceBlock() as CallBlock | null;
          const info = block ? collectFunctions(programTabsOf(block.workspace)).get(id) : undefined;
          if (block && info && !block.isDeadOrDying()) {
            block.func_ = { name: info.name, inputs: [...info.inputs] };
            block.updateShape_(true);
          }
          return id;
        }) as unknown as Blockly.Field,
        'FUNC',
      );
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.setStyle(FUNCTION_STYLE);
    this.setTooltip(() => {
      const info = collectFunctions(programTabsOf(this.workspace)).get(
        this.getFieldValue('FUNC') as string,
      );
      return info
        ? `Runs the blocks in “define ${info.name}” (tab ${info.tab.name}), then carries on.`
        : `Runs a function of your own.`;
    });
  },
  saveExtraState(this: CallBlock) {
    return { name: this.func_.name, inputs: this.func_.inputs.map((input) => ({ ...input })) };
  },
  loadExtraState(this: CallBlock, state: unknown) {
    const saved = (state ?? {}) as { name?: unknown; inputs?: unknown };
    this.func_ = {
      name: typeof saved.name === 'string' ? saved.name : NEW_FUNCTION_NAME,
      inputs: isInputList(saved.inputs) ? saved.inputs.map((input) => ({ ...input })) : [],
    };
    // While loading, the saved inputs bring their own blocks.
    this.updateShape_(false);
  },
  updateShape_(this: CallBlock, withShadows: boolean) {
    const wanted = this.func_.inputs;
    for (const input of [...this.inputList]) {
      if (
        input.name.startsWith('ARG_') &&
        !wanted.some((item) => `ARG_${item.id}` === input.name)
      ) {
        this.removeInput(input.name);
      }
    }
    for (const item of wanted) {
      const name = `ARG_${item.id}`;
      const existing = this.getInput(name);
      if (existing) {
        this.setFieldValue(item.name, `LABEL_${item.id}`);
        continue;
      }
      const input = this.appendValueInput(name).appendField(item.name, `LABEL_${item.id}`);
      if (withShadows)
        input.connection?.setShadowState({ type: 'math_number', fields: { NUM: 0 } });
    }
    // Inputs in the function's order.
    for (let i = wanted.length - 1; i >= 0; i -= 1) {
      const next = wanted[i + 1];
      this.moveInputBefore(`ARG_${wanted[i]!.id}`, next ? `ARG_${next.id}` : null);
    }
  },
};

const INPUT_BLOCK = {
  init(this: InputBlock) {
    this.input_ = { id: '', name: 'x' };
    this.appendDummyInput().appendField('x', 'NAME');
    this.setOutput(true);
    this.setStyle(FUNCTION_STYLE);
    this.setTooltip(
      'An input of a function of your own: the value the call block gives it. Use it inside that function’s “define” block.',
    );
  },
  saveExtraState(this: InputBlock) {
    return { input: this.input_.id, name: this.input_.name };
  },
  loadExtraState(this: InputBlock, state: unknown) {
    const saved = (state ?? {}) as { input?: unknown; name?: unknown };
    this.input_ = {
      id: typeof saved.input === 'string' ? saved.input : '',
      name: typeof saved.name === 'string' ? saved.name : 'x',
    };
    this.setFieldValue(this.input_.name, 'NAME');
  },
};

let registered = false;

export function registerFunctionBlocks(): void {
  if (registered) return;
  registered = true;
  for (const [type, definition] of [
    [FUNCTION_BLOCKS.define, DEFINE_BLOCK],
    [FUNCTION_BLOCKS.call, CALL_BLOCK],
    [FUNCTION_BLOCKS.input, INPUT_BLOCK],
  ] as const) {
    if (!Blockly.Blocks[type]) Blockly.Blocks[type] = definition;
  }
}

// --- Keeping call and input blocks up to date ----------------------------------------------

/**
 * Brings every call block's name and inputs, and every input block's name, in line with the
 * define blocks, in all tabs. Not recorded for Undo: the define block's own change is, and this
 * follows it both ways. Returns whether anything changed.
 */
export function syncFunctionBlocks(tabs: readonly ProgramTab[]): boolean {
  const functions = collectFunctions(tabs);
  let changed = false;
  const wasEnabled = Blockly.Events.isEnabled();
  if (wasEnabled) Blockly.Events.disable();
  try {
    for (const tab of tabs) {
      for (const block of tab.workspace.getBlocksByType(FUNCTION_BLOCKS.call, false)) {
        const call = block as CallBlock;
        const info = functions.get(call.getFieldValue('FUNC') as string);
        if (!info || (call as unknown as Partial<Blockly.BlockSvg>).isDragging?.()) continue;
        if (info.name === call.func_.name && sameInputs(info.inputs, call.func_.inputs)) continue;
        call.func_ = { name: info.name, inputs: [...info.inputs] };
        call.updateShape_(true);
        call.getField('FUNC')?.forceRerender();
        changed = true;
      }
      for (const block of tab.workspace.getBlocksByType(FUNCTION_BLOCKS.input, false)) {
        const input = block as InputBlock;
        const name = inputName(input);
        if (name === input.input_.name) continue;
        input.input_ = { ...input.input_, name };
        input.setFieldValue(name, 'NAME');
        changed = true;
      }
    }
  } finally {
    if (wasEnabled) Blockly.Events.enable();
  }
  return changed;
}

// --- Python ----------------------------------------------------------------------------------

/** What the function blocks need to know while one tab is generated (set by ./generator.ts). */
export interface FunctionGeneration {
  readonly functions: ReadonlyMap<string, FunctionInfo>;
  readonly tab: ProgramTab;
  /** Module-level names of this tab's file a function may assign: they need `global`. */
  readonly moduleNames: readonly string[];
  /** Tabs this file imports, because it calls their functions. */
  readonly imports: Set<string>;
}

let generation: FunctionGeneration | null = null;

export function beginFunctionGeneration(context: FunctionGeneration): void {
  generation = context;
}

export function endFunctionGeneration(): void {
  generation = null;
}

/** Whether `name` appears in `code` as a name of its own (not `x.name`, not inside a word). */
export function usesName(code: string, name: string): boolean {
  return new RegExp(`(?<![\\w.])${name}\\b`).test(code);
}

export function registerFunctionGenerators(): void {
  const g = pythonGenerator;
  g.forBlock[FUNCTION_BLOCKS.define] = (block) => {
    const name = block.getFieldValue('NAME') as string;
    const inputs = (block as DefineBlock).inputs_.map((input) => input.name);
    const body = g.statementToCode(block, 'DO') || g.PASS;
    const globals = (generation?.moduleNames ?? []).filter(
      (moduleName) => !inputs.includes(moduleName) && usesName(body, moduleName),
    );
    const globalLine = globals.length > 0 ? `${INDENT}global ${globals.join(', ')}\n` : '';
    return `def ${name}(${inputs.join(', ')}):\n${globalLine}${body}`;
  };
  g.forBlock[FUNCTION_BLOCKS.call] = (block) => {
    const call = block as CallBlock;
    const info = generation?.functions.get(call.getFieldValue('FUNC') as string);
    if (!info) return `pass  # ${call.func_.name} is missing\n`;
    const args = info.inputs.map(
      (input) => g.valueToCode(call, `ARG_${input.id}`, Order.NONE) || '0',
    );
    const own = info.tab.id === generation?.tab.id;
    if (!own) generation?.imports.add(info.tab.name);
    return `${own ? '' : `${info.tab.name}.`}${info.name}(${args.join(', ')})\n`;
  };
  g.forBlock[FUNCTION_BLOCKS.input] = (block) => [inputName(block as InputBlock), Order.ATOMIC];
}

// --- Problems --------------------------------------------------------------------------------

export interface FunctionProblem {
  readonly tabId: string;
  readonly blockId: string;
  readonly message: string;
}

/** Calls and inputs that cannot work, and functions with the same name. */
export function functionProblems(
  tabs: readonly ProgramTab[],
  functions: ReadonlyMap<string, FunctionInfo>,
): FunctionProblem[] {
  const problems: FunctionProblem[] = [];
  const mainId = tabs[0]?.id;
  const byName = new Map<string, FunctionInfo>();
  for (const info of functions.values()) {
    if (!info.enabled) continue;
    const twin = byName.get(info.name);
    if (twin) {
      problems.push({
        tabId: info.tab.id,
        blockId: info.id,
        message: `Two functions are called “${info.name}” (tabs ${twin.tab.name} and ${info.tab.name}). Rename one.`,
      });
    } else {
      byName.set(info.name, info);
    }
    if (tabs.some((tab) => tab.name === info.name)) {
      problems.push({
        tabId: info.tab.id,
        blockId: info.id,
        message: `“${info.name}” is also the name of a tab. Rename the function or the tab.`,
      });
    }
  }
  for (const tab of tabs) {
    for (const block of tab.workspace.getBlocksByType(FUNCTION_BLOCKS.call, false)) {
      if (!block.isEnabled()) continue;
      const call = block as CallBlock;
      const info = functions.get(call.getFieldValue('FUNC') as string);
      const name = info?.name ?? call.func_.name;
      if (!info) {
        problems.push({
          tabId: tab.id,
          blockId: block.id,
          message: `There is no function “${name}” any more. Remove this block, or tap its name to choose another.`,
        });
      } else if (!info.enabled) {
        problems.push({
          tabId: tab.id,
          blockId: block.id,
          message: `The function “${name}” is turned off. Turn its “define” block back on.`,
        });
      } else if (info.tab.id === mainId && tab.id !== mainId) {
        problems.push({
          tabId: tab.id,
          blockId: block.id,
          message: `“${name}” is in the main tab, so other tabs cannot use it. Move it to a tab: right-click its “define” block.`,
        });
      }
    }
    for (const block of tab.workspace.getBlocksByType(FUNCTION_BLOCKS.input, false)) {
      if (!block.isEnabled()) continue;
      const input = block as InputBlock;
      const definition = enclosingDefinition(block);
      if (!definition) {
        problems.push({
          tabId: tab.id,
          blockId: block.id,
          message: `“${input.input_.name}” is an input of a function. Use it inside that function’s “define” block.`,
        });
      } else if (!definition.inputs_.some((item) => item.id === input.input_.id)) {
        problems.push({
          tabId: tab.id,
          blockId: block.id,
          message: `“${definition.getFieldValue('NAME') as string}” has no input “${input.input_.name}”. Use one of its own inputs.`,
        });
      }
    }
  }
  return problems;
}

// --- Toolbox ---------------------------------------------------------------------------------

const label = (text: string): FlyoutItem => ({ kind: 'label', text });

/** A call block for the toolbox. */
function callItem(info: FunctionInfo): FlyoutItem {
  return {
    kind: 'block',
    type: FUNCTION_BLOCKS.call,
    extraState: { name: info.name, inputs: info.inputs.map((input) => ({ ...input })) },
    fields: { FUNC: info.id },
    inputs: Object.fromEntries(
      info.inputs.map((input) => [
        `ARG_${input.id}`,
        { shadow: { type: 'math_number', fields: { NUM: 0 } } },
      ]),
    ),
  };
}

/** The Functions category: a new define block, the functions this tab may use, its inputs. */
export function functionsFlyout(workspace: Blockly.Workspace): FlyoutItem[] {
  const tabs = programTabsOf(workspace);
  const tab = tabOf(workspace);
  const main = tabs[0];
  const functions = [...collectFunctions(tabs).values()].filter((info) => info.enabled);
  const items: FlyoutItem[] = [
    label('Make a block of your own: name it, add inputs with ⊕, put blocks inside.'),
    {
      kind: 'block',
      type: FUNCTION_BLOCKS.define,
      fields: { NAME: uniqueFunctionName(NEW_FUNCTION_NAME, workspace, null) },
    },
  ];
  const own = functions.filter((info) => info.tab.id === tab.id);
  if (own.length > 0) {
    items.push(label(tab.id === main?.id ? 'Functions in main' : `Functions in this tab`));
    items.push(...own.map(callItem));
    const inputs = own.flatMap((info) => info.inputs.map((input) => ({ info, input })));
    if (inputs.length > 0) {
      items.push(label('Inputs: use each inside its own “define” block'));
      for (const { input } of inputs) {
        items.push({
          kind: 'block',
          type: FUNCTION_BLOCKS.input,
          extraState: { input: input.id, name: input.name },
        });
      }
    }
  }
  for (const other of tabs) {
    if (other.id === tab.id || other.id === main?.id) continue;
    const theirs = functions.filter((info) => info.tab.id === other.id);
    if (theirs.length === 0) continue;
    items.push(label(`From the tab “${other.name}”`));
    items.push(...theirs.map(callItem));
  }
  if (tab.id !== main?.id && functions.some((info) => info.tab.id === main?.id)) {
    items.push(label('Functions in main can be used only in main.'));
  }
  return items;
}
