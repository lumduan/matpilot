/**
 * The block editor in the browser: one Blockly workspace per tab (ADR 0013), the generated
 * program and its problems kept up to date, and the program saved on every change (ADR 0008). It
 * also keeps the program's name and GitHub file (ADR 0011), and offers undo and redo.
 *
 * Every tab is its own workspace, so each keeps its own Undo history, scroll and zoom; only the
 * open tab is shown. Changes that touch the program as a whole (opening a file, starting over,
 * closing a tab, moving a function to another tab, deleting a shared variable that other tabs
 * use) are not in a tab's history: the editor keeps the program from before the change, and
 * `undoProgramChange()` puts it back. Ctrl+V and the Paste menu item paste into the open tab,
 * wherever the blocks were copied (./clipboard.ts). A tab's Python can be edited and turned back
 * into its blocks (ADR 0014, ./from-python/tab.ts): that is also a change undone from the notice.
 *
 * Browser-only: import it lazily (src/hooks/useBlocksEditor.ts).
 */
import * as Blockly from 'blockly/core';
import { registerClipboard } from './clipboard';
import { getPortHints, setPortHints, type PortHints } from './fields/hints';
import { splitPair } from './fields/port';
import {
  FUNCTION_BLOCKS,
  collectFunctions,
  functionsFlyout,
  syncFunctionBlocks,
} from './functions';
import {
  DEFAULT_MOVEMENT,
  generateTabs,
  listSetUpDevices,
  type GeneratedProgram,
} from './generator';
import type { ProgramTabState } from './program-file';
import { NEW_PROGRAM_META, sameMeta, type ProgramMeta } from './program-meta';
import { sameRobot } from '../robots/profile';
import { DEVICE_TYPES, type DeviceType, type PortName } from './pybricks';
import { ensureRequiredBlocks, registerBlocks } from './register';
import {
  deleteSharedVariable as deleteShared,
  syncSharedVariables,
  variablesFlyout,
  watchSharedVariables,
} from './shared';
import {
  controllerFlyout,
  motorsFlyout,
  movementFlyout,
  sensorsFlyout,
  type SimpleToolboxState,
} from './simple-toolbox';
import { STARTER_WORKSPACE } from './starter';
import {
  MAIN_TAB_ID,
  MAIN_TAB_NAME,
  MAX_TABS,
  checkTabName,
  linkTab,
  newTabName,
  programTabsOf,
  type ProgramTab,
  type TabNameCheck,
} from './tabs';
import { getThemes } from './theme';
import type { PythonEdit, PythonProblem } from './from-python/tab';

/** The Python-to-blocks converter, loaded the first time someone edits Python (ADR 0014). */
let pythonTools: Promise<typeof import('./from-python/tab')> | null = null;
const loadPythonTools = () => (pythonTools ??= import('./from-python/tab'));
import {
  TOOLBOX,
  inputFlyout,
  outputFlyout,
  setupFlyout,
  type FlyoutItem,
  type ToolboxState,
} from './toolbox';

/** Where Blockly's images and cursors are served from (scripts/vendor-assets.mjs). */
export const BLOCKLY_MEDIA_PATH = '/vendor/blockly-media/';

/** A program as the editor saves it: every tab, main first, and the tab that was open. */
export interface SavedProgram {
  readonly tabs: readonly ProgramTabState[];
  /** The open tab's name. */
  readonly active?: string;
}

/** The program before a change to the program as a whole, so it can be put back. */
export interface ProgramSnapshot {
  readonly program: SavedProgram;
  readonly meta: ProgramMeta;
}

export interface EditorTab {
  readonly id: string;
  readonly name: string;
}

export interface EditorOptions {
  readonly host: HTMLElement;
  readonly dark: boolean;
  /** A saved program, or `null` for the starter program. */
  readonly saved: SavedProgram | null;
  /** The saved program's name and GitHub file. */
  readonly meta: ProgramMeta;
  /** Called after every change with the program and what to save. */
  readonly onChange: (program: GeneratedProgram, state: SavedProgram) => void;
  /** Called when the program's name or GitHub file changes. */
  readonly onMeta: (meta: ProgramMeta) => void;
  /** Called when the open tab has, or stops having, something to undo or redo. */
  readonly onHistory: (history: EditorHistory) => void;
  /** Called when tabs are added, renamed, closed or opened. */
  readonly onTabs: (tabs: readonly EditorTab[], activeId: string) => void;
  /** Called after a change the user may want to take back with `undoProgramChange()`. */
  readonly onProgramChange: (message: string) => void;
}

export interface EditorHistory {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export type AddTabResult =
  { readonly ok: true; readonly tab: EditorTab } | { readonly ok: false; readonly message: string };

export interface EditorHandle {
  /** `true` when the saved program could not be loaded and the starter was used instead. */
  readonly restoredStarter: boolean;
  setDark(dark: boolean): void;
  /** What the hub says is plugged into each port, for the port pickers and new blocks. */
  setPortHints(hints: PortHints): void;
  /** Undo and Redo in the open tab. */
  undo(): void;
  redo(): void;
  /** Replaces everything with the starter program, as a new program. */
  reset(): void;
  /**
   * Opens a saved program. Throws, changing nothing, when the blocks cannot be loaded (unknown
   * blocks, or a file from a newer MatPilot).
   */
  open(tabs: readonly ProgramTabState[], meta: ProgramMeta): void;
  /** Puts back the program from before the last change to the program as a whole. */
  undoProgramChange(): void;
  /** The program now, to save in a file. */
  save(): SavedProgram;
  /** Changes the name or GitHub file (after saving). */
  setMeta(meta: ProgramMeta): void;
  /** The open program's meta. */
  meta(): ProgramMeta;
  selectTab(id: string): void;
  addTab(): AddTabResult;
  /** Renames a tab other than main; returns the name it got, or why not. */
  renameTab(id: string, text: string): TabNameCheck;
  /** Closes a tab other than main. */
  closeTab(id: string): void;
  /** Opens the block's tab and shows the block. */
  showBlock(tabId: string, blockId: string): void;
  /** The tab's Python to edit, and the parts of it that can change (ADR 0014). */
  pythonEdit(tabId: string): Promise<PythonEdit>;
  /** What in this Python cannot become the tab's blocks; empty when it all can. */
  checkPython(tabId: string, text: string): Promise<readonly PythonProblem[]>;
  /**
   * Replaces the tab's blocks with this Python's, as one change the notice can undo; or returns
   * the problems and changes nothing.
   */
  applyPython(tabId: string, text: string): Promise<readonly PythonProblem[]>;
  /** Locks the blocks of every tab while Python is being edited, and unlocks them. */
  setLocked(locked: boolean): void;
  dispose(): void;
}

interface Tab {
  readonly id: string;
  name: string;
  readonly element: HTMLDivElement;
  readonly workspace: Blockly.WorkspaceSvg;
}

/** The main tab's workspace: devices are set up there, for every tab. */
const mainWorkspace = (workspace: Blockly.Workspace) =>
  programTabsOf(workspace)[0]?.workspace ?? workspace;

function toolboxState(workspace: Blockly.Workspace): ToolboxState {
  const main = mainWorkspace(workspace);
  const variableNames = Object.fromEntries(
    DEVICE_TYPES.map((type) => [
      type,
      main
        .getVariableMap()
        .getVariablesOfType(type)
        .map((variable) => variable.getName()),
    ]),
  ) as Record<DeviceType, string[]>;
  return {
    devices: listSetUpDevices(main),
    variableNames,
    hasSetupBlock: main.getBlocksByType('mp_setup', false).length > 0,
  };
}

/** Blocks that drive the robot (all "mp_move…" blocks but the two settings, and the controller's). */
const isMovementBlock = (type: string) =>
  (type.startsWith('mp_move') && type !== 'mp_move_motors' && type !== 'mp_move_wheels') ||
  type === 'mp_ctrl_drive';

function simpleToolboxState(workspace: Blockly.Workspace): SimpleToolboxState {
  // Movement settings may be in any tab; they apply to the whole program.
  const blocks = programTabsOf(workspace).flatMap((tab) =>
    tab.workspace.getAllBlocks(false).filter((block) => block.isEnabled()),
  );
  const motors = blocks.find((block) => block.type === 'mp_move_motors');
  const movement: readonly [PortName, PortName] | null = motors
    ? splitPair(motors.getFieldValue('PORTS') as string)
    : blocks.some((block) => isMovementBlock(block.type))
      ? [DEFAULT_MOVEMENT.left, DEFAULT_MOVEMENT.right]
      : null;
  return { hints: getPortHints(), movement };
}

/** In other tabs, devices are set up in main; the Setup category says so. */
function tabSetupFlyout(workspace: Blockly.Workspace): FlyoutItem[] {
  return programTabsOf(workspace)[0]?.workspace === workspace
    ? setupFlyout(toolboxState(workspace))
    : [
        {
          kind: 'label',
          text: 'Devices are set up in the main tab. Blocks in every tab can use them.',
        },
      ];
}

/**
 * The detailed blocks name devices by Blockly variables, which belong to one workspace. Each tab
 * gets the main tab's device variables, with the same ids and names, so its blocks can name them.
 * Not recorded for Undo.
 */
function syncDeviceVariables(tabs: readonly Tab[]): void {
  const [main, ...others] = tabs;
  if (!main || others.length === 0) return;
  const devices = DEVICE_TYPES.flatMap((type) =>
    main.workspace.getVariableMap().getVariablesOfType(type),
  );
  if (devices.length === 0) return;
  const wasEnabled = Blockly.Events.isEnabled();
  if (wasEnabled) Blockly.Events.disable();
  try {
    for (const tab of others) {
      const map = tab.workspace.getVariableMap();
      for (const device of devices) {
        const existing = map.getVariableById(device.getId());
        try {
          if (!existing) map.createVariable(device.getName(), device.getType(), device.getId());
          else if (existing.getName() !== device.getName()) {
            map.renameVariable(existing, device.getName());
          }
        } catch {
          // The tab has another variable with this name; its blocks show a problem instead.
        }
      }
    }
  } finally {
    if (wasEnabled) Blockly.Events.enable();
  }
}

const STARTER_PROGRAM: SavedProgram = {
  tabs: [{ name: MAIN_TAB_NAME, workspace: STARTER_WORKSPACE }],
};

/** Loads every tab into scratch workspaces first, so a broken file changes nothing. */
function checkLoads(tabs: readonly ProgramTabState[]): void {
  const scratch = tabs.map((tab, index) => ({
    id: index === 0 ? MAIN_TAB_ID : `check-${index}`,
    name: tab.name,
    workspace: new Blockly.Workspace(),
  }));
  const wasEnabled = Blockly.Events.isEnabled();
  if (wasEnabled) Blockly.Events.disable();
  try {
    for (const tab of scratch) linkTab(tab.workspace, () => scratch);
    for (const [index, tab] of tabs.entries()) {
      Blockly.serialization.workspaces.load(tab.workspace, scratch[index]!.workspace);
    }
  } finally {
    if (wasEnabled) Blockly.Events.enable();
    for (const tab of scratch) tab.workspace.dispose();
  }
}

/** Tab names a saved program may use; damaged ones get a fresh name. */
function cleanTabNames(tabs: readonly ProgramTabState[]): ProgramTabState[] {
  const names: string[] = [];
  return tabs.map((tab, index) => {
    let name = MAIN_TAB_NAME;
    if (index > 0) {
      const check = checkTabName(tab.name, names);
      name = check.ok && check.name === tab.name ? check.name : newTabName(names);
    }
    names.push(name);
    return { name, workspace: tab.workspace };
  });
}

export function createEditor(options: EditorOptions): EditorHandle {
  registerBlocks();
  registerClipboard();
  const themes = getThemes();
  let dark = options.dark;
  let tabs: Tab[] = [];
  let programTabs: ProgramTab[] = [];
  let active: Tab | null = null;
  let previous: ProgramSnapshot | null = null;
  const markedBlocks = new Map<string, Tab>();
  // Tab ids stay the same while the page is open; they are not saved.
  let lastTabNumber = 1;
  const nextTabId = () => `tab-${(lastTabNumber += 1)}`;

  const listTabs = () => {
    programTabs = tabs.map((tab) => ({ id: tab.id, name: tab.name, workspace: tab.workspace }));
  };
  const reportTabs = () =>
    options.onTabs(
      tabs.map((tab) => ({ id: tab.id, name: tab.name })),
      active?.id ?? MAIN_TAB_ID,
    );

  let meta = options.meta;
  const applyMeta = (next: ProgramMeta) => {
    if (sameMeta(meta, next)) return;
    const robotChanged = !sameRobot(meta.robot, next.robot);
    meta = next;
    options.onMeta(next);
    // The robot sets the drive base, so the Python changes with it (ADR 0016, D4).
    if (robotChanged) schedule();
  };

  let history: EditorHistory = { canUndo: false, canRedo: false };
  const reportHistory = () => {
    const workspace = active?.workspace;
    const next = {
      canUndo: (workspace?.getUndoStack().length ?? 0) > 0,
      canRedo: (workspace?.getRedoStack().length ?? 0) > 0,
    };
    if (next.canUndo === history.canUndo && next.canRedo === history.canRedo) return;
    history = next;
    options.onHistory(next);
  };

  const save = (): SavedProgram => ({
    tabs: tabs.map((tab) => ({
      name: tab.name,
      workspace: Blockly.serialization.workspaces.save(tab.workspace),
    })),
    active: active?.name ?? MAIN_TAB_NAME,
  });

  const update = () => {
    syncDeviceVariables(tabs);
    syncSharedVariables(programTabs);
    syncFunctionBlocks(programTabs);
    const program = generateTabs(programTabs, { robot: meta.robot });
    const byBlock = new Map<string, { tab: Tab; messages: string[] }>();
    for (const problem of program.problems) {
      const tab = tabs.find((each) => each.id === problem.tabId);
      if (!problem.blockId || !tab) continue;
      const entry = byBlock.get(problem.blockId) ?? { tab, messages: [] };
      entry.messages.push(problem.message);
      byBlock.set(problem.blockId, entry);
    }
    for (const [id, tab] of markedBlocks) {
      if (!byBlock.has(id)) tab.workspace.getBlockById(id)?.setWarningText(null);
    }
    markedBlocks.clear();
    for (const [id, { tab, messages }] of byBlock) {
      tab.workspace.getBlockById(id)?.setWarningText(messages.join('\n'));
      markedBlocks.set(id, tab);
    }
    options.onChange(program, save());
  };

  // Regenerate once per frame at most, after real changes (not clicks, scrolls, or selection).
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      update();
    });
  };

  const show = (tab: Tab, visible: boolean) => {
    tab.element.dataset.active = String(visible);
    tab.element.inert = !visible;
    if (visible) Blockly.svgResize(tab.workspace);
  };

  const hidePopups = () => {
    active?.workspace.hideChaff();
    Blockly.WidgetDiv.hide();
    Blockly.DropDownDiv.hideWithoutAnimation();
  };

  const selectTab = (id: string) => {
    const next = tabs.find((tab) => tab.id === id);
    if (!next || next === active) return;
    hidePopups();
    if (active) show(active, false);
    active = next;
    show(next, true);
    reportTabs();
    reportHistory();
    schedule();
  };

  const actions = {
    moveToTab(block: Blockly.Block, tabId: string) {
      const from = tabs.find((tab) => tab.workspace === block.workspace);
      const to = tabs.find((tab) => tab.id === tabId);
      if (!from || !to || from === to) return;
      previous = { program: save(), meta };
      hidePopups();
      const name =
        block.type === FUNCTION_BLOCKS.define ? (block.getFieldValue('NAME') as string) : '';
      // Variables go along with their names; ids stay, so every call still finds the function.
      const state = Blockly.serialization.blocks.save(block, {
        addCoordinates: false,
        doFullSerialization: true,
        saveIds: true,
      });
      if (!state) return;
      const bottom = Math.max(
        0,
        ...to.workspace.getTopBlocks(false).map((top) => top.getBoundingRectangle().bottom),
      );
      Blockly.Events.disable();
      try {
        block.dispose(false);
        Blockly.serialization.blocks.append(
          { ...state, x: 24, y: bottom + 48 } as Blockly.serialization.blocks.State,
          to.workspace,
        );
      } finally {
        Blockly.Events.enable();
      }
      // Each tab's history may name the block in its old place.
      from.workspace.clearUndo();
      to.workspace.clearUndo();
      selectTab(to.id);
      to.workspace.centerOnBlock(state.id ?? null);
      reportHistory();
      schedule();
      options.onProgramChange(
        name
          ? `Moved “${name}” to the tab “${to.name}”.`
          : `Moved the blocks to the tab “${to.name}”.`,
      );
    },
    deleteSharedVariable(id: string) {
      const variable = tabs
        .map((tab) => tab.workspace.getVariableMap().getVariableById(id))
        .find((each) => each !== null);
      if (!variable) return;
      previous = { program: save(), meta };
      hidePopups();
      const blocks = deleteShared(programTabs, id);
      // Each tab's history may name the variable or the blocks that used it.
      for (const tab of tabs) tab.workspace.clearUndo();
      reportHistory();
      schedule();
      options.onProgramChange(
        `Deleted the shared variable “${variable.getName()}” and the ${blocks} block${blocks === 1 ? '' : 's'} that used it, in every tab.`,
      );
    },
  };

  const createTab = (id: string, name: string): Tab => {
    const element = document.createElement('div');
    element.className = 'blocks-tab';
    element.dataset.tab = id;
    options.host.append(element);
    const workspace = Blockly.inject(element, {
      toolbox: TOOLBOX as unknown as Blockly.utils.toolbox.ToolboxDefinition,
      theme: dark ? themes.dark : themes.light,
      renderer: 'zelos',
      media: BLOCKLY_MEDIA_PATH,
      sounds: false,
      trashcan: true,
      zoom: { controls: true, wheel: false, startScale: 0.75, maxScale: 2, minScale: 0.4 },
      move: { scrollbars: true, drag: true, wheel: true },
      grid: { spacing: 24, length: 2, colour: 'rgba(128, 128, 128, 0.25)', snap: false },
    });
    for (const [category, build] of [
      ['MP_OUTPUT', outputFlyout],
      ['MP_INPUT', inputFlyout],
    ] as const) {
      workspace.registerToolboxCategoryCallback(
        category,
        (ws) => build(toolboxState(ws)) as unknown as Blockly.utils.toolbox.FlyoutDefinition,
      );
    }
    workspace.registerToolboxCategoryCallback(
      'MP_SETUP',
      (ws) => tabSetupFlyout(ws) as unknown as Blockly.utils.toolbox.FlyoutDefinition,
    );
    for (const [category, build] of [
      ['MP_MOVEMENT', movementFlyout],
      ['MP_MOTORS', motorsFlyout],
      ['MP_SENSORS', sensorsFlyout],
      ['MP_CONTROLLER', controllerFlyout],
    ] as const) {
      workspace.registerToolboxCategoryCallback(
        category,
        (ws) => build(simpleToolboxState(ws)) as unknown as Blockly.utils.toolbox.FlyoutDefinition,
      );
    }
    workspace.registerToolboxCategoryCallback(
      'MP_FUNCTIONS',
      (ws) => functionsFlyout(ws) as unknown as Blockly.utils.toolbox.FlyoutDefinition,
    );
    workspace.registerToolboxCategoryCallback(
      'MP_VARIABLES',
      (ws) => variablesFlyout(ws) as unknown as Blockly.utils.toolbox.FlyoutDefinition,
    );
    linkTab(workspace, () => programTabs, actions);
    watchSharedVariables(workspace);
    workspace.addChangeListener(Blockly.Events.disableOrphans);
    workspace.addChangeListener((event) => {
      if (!event.isUiEvent) schedule();
    });
    workspace.addChangeListener(() => {
      if (workspace === active?.workspace) reportHistory();
    });
    const tab: Tab = { id, name, element, workspace };
    show(tab, false);
    return tab;
  };

  const disposeTabs = () => {
    hidePopups();
    for (const tab of tabs) {
      tab.workspace.dispose();
      tab.element.remove();
    }
    tabs = [];
    programTabs = [];
    active = null;
    markedBlocks.clear();
  };

  /** Builds every tab from a saved program; throws if a tab cannot be loaded. */
  const build = (program: SavedProgram) => {
    disposeTabs();
    const states = cleanTabNames(program.tabs.length > 0 ? program.tabs : STARTER_PROGRAM.tabs);
    tabs = states.map((state, index) =>
      createTab(index === 0 ? MAIN_TAB_ID : nextTabId(), state.name),
    );
    listTabs();
    Blockly.Events.disable();
    try {
      for (const [index, state] of states.entries()) {
        Blockly.serialization.workspaces.load(state.workspace, tabs[index]!.workspace);
      }
      ensureRequiredBlocks(tabs[0]!.workspace);
    } finally {
      Blockly.Events.enable();
    }
    syncDeviceVariables(tabs);
    syncSharedVariables(programTabs);
    syncFunctionBlocks(programTabs);
    active = tabs.find((tab) => tab.name === program.active) ?? tabs[0]!;
    show(active, true);
    reportTabs();
    reportHistory();
  };

  let restoredStarter = false;
  try {
    build(options.saved ?? STARTER_PROGRAM);
  } catch (error) {
    console.warn('The saved blocks could not be loaded.', error);
    build(STARTER_PROGRAM);
    restoredStarter = options.saved !== null;
  }
  if (restoredStarter || options.saved === null) applyMeta(NEW_PROGRAM_META);

  /** Replaces the whole program; the old one can be put back. */
  const replace = (program: SavedProgram, next: ProgramMeta) => {
    checkLoads(program.tabs);
    previous = { program: save(), meta };
    build(program);
    applyMeta(next);
    schedule();
  };

  const observer = new ResizeObserver(() => {
    for (const tab of tabs) Blockly.svgResize(tab.workspace);
  });
  observer.observe(options.host);
  update();

  return {
    restoredStarter,
    setDark(next) {
      dark = next;
      for (const tab of tabs) tab.workspace.setTheme(next ? themes.dark : themes.light);
    },
    setPortHints(hints) {
      setPortHints(hints);
    },
    undo() {
      const workspace = active?.workspace;
      if (!workspace) return;
      workspace.hideChaff();
      workspace.undo(false);
      // Undo itself records nothing, and its events may all be filtered away.
      setTimeout(reportHistory, 0);
    },
    redo() {
      const workspace = active?.workspace;
      if (!workspace) return;
      workspace.hideChaff();
      workspace.undo(true);
      setTimeout(reportHistory, 0);
    },
    reset() {
      // A new program for the same robot.
      replace(STARTER_PROGRAM, { ...NEW_PROGRAM_META, robot: meta.robot });
    },
    open(next, nextMeta) {
      replace({ tabs: next }, nextMeta);
    },
    undoProgramChange() {
      if (!previous) return;
      const back = previous;
      previous = null;
      build(back.program);
      applyMeta(back.meta);
      schedule();
    },
    save,
    setMeta: applyMeta,
    meta: () => meta,
    selectTab,
    addTab() {
      if (tabs.length >= MAX_TABS) {
        return {
          ok: false,
          message: `A program can have ${MAX_TABS} tabs. Close one you do not need first.`,
        };
      }
      const taken = [
        ...tabs.map((tab) => tab.name),
        ...[...collectFunctions(programTabs).values()].map((info) => info.name),
      ];
      const tab = createTab(nextTabId(), newTabName(taken));
      tabs.push(tab);
      listTabs();
      syncDeviceVariables(tabs);
      syncSharedVariables(programTabs);
      selectTab(tab.id);
      return { ok: true, tab: { id: tab.id, name: tab.name } };
    },
    renameTab(id, text) {
      const tab = tabs.find((each) => each.id === id);
      if (!tab || tab.id === MAIN_TAB_ID) {
        return { ok: false, message: 'The main tab keeps its name: the program starts there.' };
      }
      const taken = [
        ...tabs.filter((each) => each !== tab).map((each) => each.name),
        ...[...collectFunctions(programTabs).values()].map((info) => info.name),
      ];
      const check = checkTabName(text, taken);
      if (check.ok && check.name !== tab.name) {
        tab.name = check.name;
        listTabs();
        reportTabs();
        schedule();
      }
      return check;
    },
    closeTab(id) {
      const tab = tabs.find((each) => each.id === id);
      if (!tab || tab.id === MAIN_TAB_ID) return;
      const blocks = tab.workspace.getAllBlocks(false).length;
      previous = { program: save(), meta };
      const index = tabs.indexOf(tab);
      if (tab === active) selectTab((tabs[index - 1] ?? tabs[0]!).id);
      tab.workspace.dispose();
      tab.element.remove();
      tabs = tabs.filter((each) => each !== tab);
      for (const [blockId, owner] of markedBlocks) if (owner === tab) markedBlocks.delete(blockId);
      listTabs();
      reportTabs();
      schedule();
      if (blocks > 0) {
        options.onProgramChange(
          `Closed the tab “${tab.name}” and its ${blocks} block${blocks === 1 ? '' : 's'}.`,
        );
      }
    },
    showBlock(tabId, blockId) {
      selectTab(tabId);
      const block = active?.workspace.getBlockById(blockId) as Blockly.BlockSvg | null;
      if (!block || !active) return;
      active.workspace.centerOnBlock(blockId);
      Blockly.common.setSelected(block);
    },
    async pythonEdit(tabId) {
      const { pythonForEditing } = await loadPythonTools();
      return pythonForEditing(programTabs, tabId, { robot: meta.robot });
    },
    async checkPython(tabId, text) {
      const { readTabPython } = await loadPythonTools();
      return readTabPython(programTabs, tabId, text).problems;
    },
    async applyPython(tabId, text) {
      const { readTabPython } = await loadPythonTools();
      const tab = tabs.find((each) => each.id === tabId);
      if (!tab) return [{ from: 0, to: 0, message: 'This tab is gone.' }];
      const read = readTabPython(programTabs, tabId, text);
      if (read.problems.length > 0 || !read.state) return read.problems;
      previous = { program: save(), meta };
      hidePopups();
      const wasReadOnly = tab.workspace.isReadOnly();
      tab.workspace.setIsReadOnly(false);
      Blockly.Events.disable();
      try {
        Blockly.serialization.workspaces.load(read.state, tab.workspace);
        // New functions go below the other blocks.
        const unplaced = new Set(read.unplaced);
        let bottom = Math.max(
          0,
          ...tab.workspace
            .getTopBlocks(false)
            .filter((block) => !unplaced.has(block.id))
            .map((block) => block.getBoundingRectangle().bottom),
        );
        for (const id of read.unplaced) {
          const block = tab.workspace.getBlockById(id);
          if (!block) continue;
          block.moveTo(new Blockly.utils.Coordinate(24, bottom + 48));
          bottom = block.getBoundingRectangle().bottom;
        }
      } finally {
        Blockly.Events.enable();
        tab.workspace.setIsReadOnly(wasReadOnly);
      }
      tab.workspace.clearUndo();
      reportHistory();
      schedule();
      const dropped =
        read.droppedDisabled > 0
          ? ` The ${read.droppedDisabled} turned-off block${read.droppedDisabled === 1 ? ' was' : 's were'} not in the Python, so ${read.droppedDisabled === 1 ? 'it is' : 'they are'} gone.`
          : '';
      options.onProgramChange(`Updated the blocks of “${tab.name}” from its Python.${dropped}`);
      return [];
    },
    setLocked(locked) {
      hidePopups();
      for (const tab of tabs) tab.workspace.setIsReadOnly(locked);
    },
    dispose() {
      setPortHints({});
      cancelAnimationFrame(frame);
      observer.disconnect();
      disposeTabs();
    },
  };
}
