/**
 * Shared variables (docs/adr/0013-block-tabs.md, decision 11): variables every tab can use, made
 * with "Create shared variable..." in the Variables category and used with the 🌐 blocks.
 *
 * A variable of the tab is the better way to keep a value, and an input is the better way to give
 * a function one; a shared variable is there for when a value really belongs to the whole program.
 * The plain variable blocks list the tab's own variables only, so a shared variable is always
 * shown with the 🌐.
 *
 * A shared variable is a Blockly variable of the type "shared". Variables belong to one workspace,
 * so every tab has its own copy, with the same id and name: `syncSharedVariables` adds the ones a
 * tab is missing, and `watchSharedVariables` renames or deletes it in every tab when it is renamed
 * or deleted in one.
 *
 * In Python a shared variable is a module-level name. In a program of one file it is in main.py's
 * Setup section, and a function that changes it says `global`. In a program of several files it
 * is in setup.py's "Shared variables" section, and every file uses it as `setup.score`: an
 * imported name (`from setup import score`) is a copy taken once, so a change would not be seen
 * (mp_import_from, cited in ./pybricks.ts).
 */
import * as Blockly from 'blockly/core';
import { Order, pythonGenerator } from 'blockly/python';
import type { BlockJson } from './definitions';
import { ICONS } from './fields/images';
import type { FunctionInfo } from './functions';
import { sharedVariableName } from './generator-context';
import { DEVICE_TYPES } from './pybricks';
import { programTabsOf, tabActionsOf, type ProgramTab } from './tabs';
import type { FlyoutItem } from './toolbox';

export const SHARED_VARIABLE_TYPE = 'shared';

export const SHARED_BLOCKS = {
  set: 'mp_shared_set',
  change: 'mp_shared_change',
  get: 'mp_shared_get',
} as const;

const CREATE_SHARED_VARIABLE = 'MP_CREATE_SHARED_VARIABLE';

/** Blockly's own variable blocks: they list the tab's variables (and devices), not shared ones. */
const PLAIN_VARIABLE_BLOCKS = ['variables_get', 'variables_set', 'math_change'];

type Variable = Blockly.IVariableModel<Blockly.IVariableState>;

export interface SharedVariable {
  readonly id: string;
  readonly name: string;
}

export const isShared = (variable: Variable | null | undefined): boolean =>
  variable?.getType() === SHARED_VARIABLE_TYPE;

const sharedField = {
  type: 'field_variable',
  name: 'VAR',
  variableTypes: [SHARED_VARIABLE_TYPE],
  defaultType: SHARED_VARIABLE_TYPE,
};
const icon = { type: 'field_image', src: ICONS.shared, width: 24, height: 24, alt: 'shared' };
const SHARED_TOOLTIP =
  'Every tab can use a shared variable. When you can, give a function its values through its inputs instead.';

export const SHARED_BLOCK_DEFINITIONS: readonly BlockJson[] = [
  {
    type: SHARED_BLOCKS.set,
    message0: '%1 set shared %2 to %3',
    args0: [icon, sharedField, { type: 'input_value', name: 'VALUE' }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'variable_blocks',
    tooltip: `Sets a shared variable. ${SHARED_TOOLTIP}`,
  },
  {
    type: SHARED_BLOCKS.change,
    message0: '%1 change shared %2 by %3',
    args0: [icon, sharedField, { type: 'input_value', name: 'DELTA', check: 'Number' }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'variable_blocks',
    tooltip: `Adds a number to a shared variable. ${SHARED_TOOLTIP}`,
  },
  {
    type: SHARED_BLOCKS.get,
    message0: '%1 %2',
    args0: [icon, sharedField],
    output: null,
    style: 'variable_blocks',
    tooltip: `The value of a shared variable. ${SHARED_TOOLTIP}`,
  },
];

let registered = false;

/** Registers the 🌐 blocks, and keeps shared variables out of the plain variable blocks. */
export function registerSharedBlocks(): void {
  if (registered) return;
  registered = true;
  Blockly.common.defineBlocksWithJsonArray(
    SHARED_BLOCK_DEFINITIONS.filter((definition) => !Blockly.Blocks[definition.type]),
  );
  for (const type of PLAIN_VARIABLE_BLOCKS) {
    const definition = Blockly.Blocks[type] as
      { init?: (this: Blockly.Block) => void; mpTabOnly?: boolean } | undefined;
    if (!definition?.init || definition.mpTabOnly) continue;
    const init = definition.init;
    definition.init = function (this: Blockly.Block) {
      init.call(this);
      const field = this.getField('VAR');
      if (field instanceof Blockly.FieldVariable) field.variableTypes = ['', ...DEVICE_TYPES];
    };
    definition.mpTabOnly = true;
  }
}

export function registerSharedGenerators(): void {
  const g = pythonGenerator;
  const name = (block: Blockly.Block) => sharedVariableName(block.getFieldValue('VAR') as string);
  g.forBlock[SHARED_BLOCKS.set] = (block) =>
    `${name(block)} = ${g.valueToCode(block, 'VALUE', Order.NONE) || '0'}\n`;
  g.forBlock[SHARED_BLOCKS.change] = (block) =>
    `${name(block)} += ${g.valueToCode(block, 'DELTA', Order.NONE) || '0'}\n`;
  g.forBlock[SHARED_BLOCKS.get] = (block) => {
    const code = name(block);
    return [code, code.includes('.') ? Order.MEMBER : Order.ATOMIC];
  };
}

// --- The program's shared variables -----------------------------------------------------------

/** Every shared variable of the program, by id. The first tab that has one names it. */
export function sharedVariables(tabs: readonly ProgramTab[]): Map<string, SharedVariable> {
  const all = new Map<string, SharedVariable>();
  for (const tab of tabs) {
    for (const variable of tab.workspace
      .getVariableMap()
      .getVariablesOfType(SHARED_VARIABLE_TYPE)) {
      if (!all.has(variable.getId())) {
        all.set(variable.getId(), { id: variable.getId(), name: variable.getName() });
      }
    }
  }
  return all;
}

/** The shared variables a block uses, in any tab, by name. */
export function usedSharedVariables(tabs: readonly ProgramTab[]): SharedVariable[] {
  return [...sharedVariables(tabs).values()]
    .filter((variable) =>
      tabs.some(
        (tab) => Blockly.Variables.getVariableUsesById(tab.workspace, variable.id).length > 0,
      ),
    )
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

let mirroring = false;

/** Runs `change` in other tabs: not recorded for Undo, and not mirrored again. */
function mirror(change: () => void): void {
  const wasEnabled = Blockly.Events.isEnabled();
  mirroring = true;
  if (wasEnabled) Blockly.Events.disable();
  try {
    change();
  } finally {
    if (wasEnabled) Blockly.Events.enable();
    mirroring = false;
  }
}

/** Gives every tab every shared variable, with the same id and name. Not recorded for Undo. */
export function syncSharedVariables(tabs: readonly ProgramTab[]): void {
  const all = sharedVariables(tabs);
  if (all.size === 0) return;
  mirror(() => {
    for (const tab of tabs) {
      const map = tab.workspace.getVariableMap();
      for (const variable of all.values()) {
        const existing = map.getVariableById(variable.id);
        try {
          if (!existing) map.createVariable(variable.name, SHARED_VARIABLE_TYPE, variable.id);
          else if (existing.getName() !== variable.name)
            map.renameVariable(existing, variable.name);
        } catch {
          // Two shared variables with one name: a problem says so (sharedProblems).
        }
      }
    }
  });
}

/**
 * Deletes a shared variable, and the blocks that use it, in `tabs`. Not recorded for Undo.
 * Returns how many blocks used it.
 */
export function deleteSharedVariable(tabs: readonly ProgramTab[], id: string): number {
  let blocks = 0;
  mirror(() => {
    for (const tab of tabs) {
      const map = tab.workspace.getVariableMap();
      const variable = map.getVariableById(id);
      if (!variable) continue;
      blocks += Blockly.Variables.getVariableUsesById(tab.workspace, id).length;
      map.deleteVariable(variable);
    }
  });
  return blocks;
}

/**
 * Renaming or deleting a shared variable in this tab does it in every tab (the editor calls this
 * for each tab's workspace). When other tabs have blocks that use it, deleting it is a change to
 * the program as a whole (the editor's `deleteSharedVariable` action); Undo or Redo inside one
 * tab never takes blocks from another, so then the variable stays.
 */
export function watchSharedVariables(workspace: Blockly.Workspace): void {
  const map = workspace.getVariableMap();
  const rename = map.renameVariable.bind(map);
  const remove = map.deleteVariable.bind(map);
  const userChange = (variable: Variable) =>
    isShared(variable) && !mirroring && Blockly.Events.isEnabled() && !workspace.isClearing;
  const others = () => programTabsOf(workspace).filter((tab) => tab.workspace !== workspace);

  map.renameVariable = (variable, newName) => {
    const renamed = rename(variable, newName);
    if (userChange(variable)) {
      mirror(() => {
        for (const tab of others()) {
          const twin = tab.workspace.getVariableMap().getVariableById(variable.getId());
          if (twin) tab.workspace.getVariableMap().renameVariable(twin, newName);
        }
      });
    }
    return renamed;
  };

  map.deleteVariable = (variable) => {
    if (!userChange(variable)) {
      remove(variable);
      return;
    }
    const id = variable.getId();
    const usedElsewhere = others().some(
      (tab) => Blockly.Variables.getVariableUsesById(tab.workspace, id).length > 0,
    );
    if (!usedElsewhere) {
      remove(variable);
      deleteSharedVariable(others(), id);
      return;
    }
    if (!Blockly.Events.getRecordUndo()) return;
    const actions = tabActionsOf(workspace);
    if (actions) {
      actions.deleteSharedVariable(id);
    } else {
      remove(variable);
      deleteSharedVariable(others(), id);
    }
  };
}

// --- Making one ---------------------------------------------------------------------------

/** Why `name` cannot be a new shared variable's name, or `null` if it can. */
export function sharedNameTaken(name: string, tabs: readonly ProgramTab[]): string | null {
  for (const tab of tabs) {
    const existing = Blockly.Variables.nameUsedWithAnyType(name, tab.workspace);
    if (!existing) continue;
    if (isShared(existing))
      return `There is already a shared variable called “${existing.getName()}”.`;
    if (existing.getType() !== '') return `“${existing.getName()}” is the name of a device.`;
    return `The tab “${tab.name}” has a variable called “${existing.getName()}”. Choose another name.`;
  }
  return null;
}

/** Asks for a name and makes a shared variable in `workspace` (the other tabs get it too). */
export function createSharedVariable(workspace: Blockly.WorkspaceSvg): void {
  const ask = (defaultName: string) => {
    Blockly.Variables.promptName('Name of the new shared variable:', defaultName, (text) => {
      if (!text) return;
      const taken = sharedNameTaken(text, programTabsOf(workspace));
      if (taken) {
        Blockly.dialog.alert(taken, () => ask(text));
        return;
      }
      workspace.getVariableMap().createVariable(text, SHARED_VARIABLE_TYPE);
    });
  };
  ask('');
}

// --- Toolbox ------------------------------------------------------------------------------

const label = (text: string): FlyoutItem => ({ kind: 'label', text });

const variableField = (variable: Variable) => ({
  VAR: { name: variable.getName(), type: variable.getType() },
});

/** The Variables category: the tab's own variables, then the shared ones. */
export function variablesFlyout(workspace: Blockly.WorkspaceSvg): FlyoutItem[] {
  workspace.registerButtonCallback(CREATE_SHARED_VARIABLE, (button) =>
    createSharedVariable(button.getTargetWorkspace()),
  );
  // Blockly's own: "Create variable..." and the blocks for this tab's variables.
  const own = Blockly.Variables.flyoutCategory(workspace) as unknown as FlyoutItem[];
  const shared = workspace.getVariableMap().getVariablesOfType(SHARED_VARIABLE_TYPE);
  const items: FlyoutItem[] = [
    label('Variables of this tab: only blocks in this tab can use them.'),
    ...own,
    label('Shared variables: every tab can use them.'),
    label('When you can, give a function its values through its inputs instead.'),
    { kind: 'button', text: 'Create shared variable...', callbackkey: CREATE_SHARED_VARIABLE },
  ];
  // Like Blockly's: "set" and "change" with the newest variable, then one block for each.
  const newest = shared[shared.length - 1];
  if (newest) {
    items.push(
      {
        kind: 'block',
        type: SHARED_BLOCKS.set,
        fields: variableField(newest),
        inputs: { VALUE: { shadow: { type: 'math_number', fields: { NUM: 0 } } } },
      },
      {
        kind: 'block',
        type: SHARED_BLOCKS.change,
        fields: variableField(newest),
        inputs: { DELTA: { shadow: { type: 'math_number', fields: { NUM: 1 } } } },
      },
      ...[...shared].sort(Blockly.Variables.compareByName).map((variable): FlyoutItem => ({
        kind: 'block',
        type: SHARED_BLOCKS.get,
        fields: variableField(variable),
      })),
    );
  }
  return items;
}

// --- Problems -----------------------------------------------------------------------------

export interface SharedProblem {
  readonly tabId: string;
  readonly blockId: string | null;
  readonly message: string;
}

/**
 * A shared variable's name is used by nothing else: no variable of a tab (Blockly compares
 * variable names without case) and no function (`pythonNames`: the shared variables' Python
 * names, by id).
 */
export function sharedProblems(
  tabs: readonly ProgramTab[],
  functions: ReadonlyMap<string, FunctionInfo>,
  pythonNames: ReadonlyMap<string, string>,
): SharedProblem[] {
  const problems: SharedProblem[] = [];
  const shared = [...sharedVariables(tabs).values()];
  for (const tab of tabs) {
    for (const variable of tab.workspace.getVariableMap().getVariablesOfType('')) {
      const twin = shared.find(
        (each) => each.name.toLowerCase() === variable.getName().toLowerCase(),
      );
      if (!twin) continue;
      problems.push({
        tabId: tab.id,
        blockId: null,
        message: `“${twin.name}” is a shared variable and a variable of the tab “${tab.name}”. Rename one of them.`,
      });
    }
  }
  const names = new Set(pythonNames.values());
  for (const info of functions.values()) {
    if (!info.enabled || !names.has(info.name)) continue;
    problems.push({
      tabId: info.tab.id,
      blockId: info.id,
      message: `“${info.name}” is a shared variable and a function. Rename one of them.`,
    });
  }
  return problems;
}
