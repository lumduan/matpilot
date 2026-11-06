/**
 * A block program in tabs (docs/adr/0013-block-tabs.md). The first tab is always "main": the
 * program starts there. Every other tab is a Python module named after the tab, holding functions
 * ("define" blocks, ./functions.ts) that main and the other tabs can use. The generator
 * (./generator.ts) turns each tab into its own file; main imports the others.
 *
 * This module holds the tab names' rules and a registry from a Blockly workspace to the program
 * it belongs to, so a block in one tab can look at the others (the functions it may call, the
 * controller the program uses, the robot's wheels).
 */
import * as Blockly from 'blockly/core';
import { pythonGenerator } from 'blockly/python';
import { MAIN_TAB_NAME, MAX_TABS } from './program-file';

/** The tab the program starts in (it cannot be renamed or closed), and the most tabs. */
export { MAIN_TAB_NAME, MAX_TABS };

/** The main tab's id (other tabs get a random id when they are made). */
export const MAIN_TAB_ID = 'main';

/** The module that holds the ports, devices and helpers every tab uses (multi-file programs). */
export const SETUP_MODULE = 'setup';

export const TAB_NAME_MAX_LENGTH = 20;

/**
 * Module names a tab may not take. The hub looks up a built-in module before a module of the
 * program, so a tab named like one would never be imported (pb_builtin_import, cited in
 * ./pybricks.ts). This list is wider than the hub's built-in modules on purpose: refusing a few
 * more names costs nothing.
 */
const MODULE_NAMES = [
  '__main__',
  'abc',
  'array',
  'asyncio',
  'binascii',
  'builtins',
  'cmath',
  'collections',
  'copy',
  'deflate',
  'errno',
  'framebuf',
  'functools',
  'gc',
  'hashlib',
  'heapq',
  'io',
  'itertools',
  'json',
  'machine',
  'math',
  'micropython',
  'network',
  'operator',
  'os',
  'platform',
  'pybricks',
  're',
  'random',
  'select',
  'socket',
  'ssl',
  'string',
  'struct',
  'sys',
  'time',
  'typing',
  'zlib',
];

const RESERVED_MODULES = new Set([
  MAIN_TAB_NAME,
  SETUP_MODULE,
  ...MODULE_NAMES,
  ...MODULE_NAMES.map((name) => `u${name}`),
]);

/**
 * Names Python or the generated program already uses: keywords, built-ins, and the names the
 * generator defines (`robot`, `hub`, `wait`, ...). Read from Blockly's Python generator, where
 * ./generator.ts adds MatPilot's own.
 */
export function isReservedName(name: string): boolean {
  const words = (pythonGenerator as unknown as { RESERVED_WORDS_: string }).RESERVED_WORDS_;
  return words.split(',').includes(name);
}

/** A Python name: an ASCII letter first, then letters, digits and `_`. */
export const PYTHON_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

/**
 * Turns typed text into a Python-style name: spaces and dashes become `_`, other characters go.
 * `Dance moves!` → `Dance_moves`. Returns '' when nothing usable is left.
 */
export function cleanPythonName(text: string, maxLength: number): string {
  return text
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .replace(/^[^A-Za-z]+/, '')
    .slice(0, maxLength);
}

export type TabNameCheck =
  { readonly ok: true; readonly name: string } | { readonly ok: false; readonly message: string };

/**
 * Checks a new tab name. Tab names are Python module names, so they are lower case:
 * `Dance moves` becomes `dance_moves`. `taken` are the other tabs' names.
 */
export function checkTabName(text: string, taken: readonly string[]): TabNameCheck {
  const name = cleanPythonName(text.toLowerCase(), TAB_NAME_MAX_LENGTH);
  if (name === '') {
    return {
      ok: false,
      message:
        'Start the name with a letter. Use English letters, numbers and _, because it becomes a Python file name.',
    };
  }
  if (RESERVED_MODULES.has(name) || isReservedName(name)) {
    return { ok: false, message: `“${name}” is already a name in Python or on the hub.` };
  }
  if (taken.includes(name)) {
    return { ok: false, message: `There is already a tab called “${name}”.` };
  }
  return { ok: true, name };
}

/** A name for a new tab: `tab2`, `tab3`, ... (the first free one). */
export function newTabName(taken: readonly string[]): string {
  for (let i = 2; ; i += 1) {
    const name = `tab${i}`;
    if (!taken.includes(name)) return name;
  }
}

/** One tab of a program, as the generator and the blocks see it. */
export interface ProgramTab {
  readonly id: string;
  readonly name: string;
  readonly workspace: Blockly.Workspace;
}

/** The tabs of a program, main first. A function, so it is always current. */
export type ProgramTabs = () => readonly ProgramTab[];

/** What the editor lets blocks do across tabs. */
export interface TabActions {
  /** Moves a block (a function) to another tab, keeping its id so its calls keep working. */
  moveToTab(block: Blockly.Block, tabId: string): void;
}

interface LinkedProgram {
  readonly tabs: ProgramTabs;
  readonly actions: TabActions | null;
}

const programs = new WeakMap<Blockly.Workspace, LinkedProgram>();

/** Links a tab's workspace to its program (the editor does this for every tab). */
export function linkTab(
  workspace: Blockly.Workspace,
  tabs: ProgramTabs,
  actions: TabActions | null = null,
): void {
  programs.set(workspace, { tabs, actions });
}

/** A flyout's blocks belong to the workspace the flyout belongs to. */
function owner(workspace: Blockly.Workspace): Blockly.Workspace {
  const target = (workspace as unknown as Partial<Blockly.WorkspaceSvg>).targetWorkspace;
  return workspace.isFlyout && target ? target : workspace;
}

/**
 * The tabs of the program `workspace` belongs to, main first. A workspace that belongs to no
 * program (a test, or a scratch workspace) is a program with one tab, main.
 */
export function programTabsOf(workspace: Blockly.Workspace): readonly ProgramTab[] {
  const own = owner(workspace);
  const tabs = programs.get(own)?.tabs();
  return tabs && tabs.length > 0
    ? tabs
    : [{ id: MAIN_TAB_ID, name: MAIN_TAB_NAME, workspace: own }];
}

/** What the editor lets blocks in `workspace` do across tabs, if anything. */
export function tabActionsOf(workspace: Blockly.Workspace): TabActions | null {
  return programs.get(owner(workspace))?.actions ?? null;
}

/** The tab `workspace` is, or its flyout belongs to. */
export function tabOf(workspace: Blockly.Workspace): ProgramTab {
  const own = owner(workspace);
  const tabs = programTabsOf(own);
  return tabs.find((tab) => tab.workspace === own) ?? tabs[0]!;
}

export function isMainTab(workspace: Blockly.Workspace): boolean {
  return tabOf(workspace).id === programTabsOf(workspace)[0]?.id;
}

/** Every block of the program, in all tabs (enabled ones only when `enabledOnly`). */
export function programBlocksByType(
  workspace: Blockly.Workspace,
  type: string,
  enabledOnly = true,
): Blockly.Block[] {
  return programTabsOf(workspace).flatMap((tab) =>
    tab.workspace.getBlocksByType(type, false).filter((block) => !enabledOnly || block.isEnabled()),
  );
}
