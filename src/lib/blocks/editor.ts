/**
 * The block editor in the browser: creates the Blockly workspace, keeps the generated program
 * and its problems up to date, and saves the workspace on every change (ADR 0008). It also keeps
 * the program's name and GitHub file (ADR 0011), and offers undo and redo.
 *
 * Browser-only: import it lazily (src/hooks/useBlocksEditor.ts).
 */
import * as Blockly from 'blockly/core';
import { getPortHints, setPortHints, type PortHints } from './fields/hints';
import { splitPair } from './fields/port';
import {
  DEFAULT_MOVEMENT,
  generateProgram,
  listSetUpDevices,
  type GeneratedProgram,
} from './generator';
import { NEW_PROGRAM_META, replaceProgram, sameMeta, type ProgramMeta } from './program-meta';
import { DEVICE_TYPES, type DeviceType, type PortName } from './pybricks';
import { ensureRequiredBlocks, loadWorkspace, registerBlocks } from './register';
import {
  motorsFlyout,
  movementFlyout,
  sensorsFlyout,
  type SimpleToolboxState,
} from './simple-toolbox';
import { STARTER_WORKSPACE } from './starter';
import { getThemes } from './theme';
import { TOOLBOX, inputFlyout, outputFlyout, setupFlyout, type ToolboxState } from './toolbox';

/** Where Blockly's images and cursors are served from (scripts/vendor-assets.mjs). */
export const BLOCKLY_MEDIA_PATH = '/vendor/blockly-media/';

export interface EditorOptions {
  readonly host: HTMLElement;
  readonly dark: boolean;
  /** A saved workspace, or `null` for the starter program. */
  readonly saved: object | null;
  /** The saved program's name and GitHub file. */
  readonly meta: ProgramMeta;
  /** Called after every change with the program and the workspace to save. */
  readonly onChange: (program: GeneratedProgram, state: object) => void;
  /** Called when the program's name or GitHub file changes, Undo and Redo included. */
  readonly onMeta: (meta: ProgramMeta) => void;
  /** Called when there is, or stops being, something to undo or redo. */
  readonly onHistory: (history: EditorHistory) => void;
}

export interface EditorHistory {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export interface EditorHandle {
  /** `true` when the saved workspace could not be loaded and the starter was used instead. */
  readonly restoredStarter: boolean;
  setDark(dark: boolean): void;
  /** What the hub says is plugged into each port, for the port pickers and new blocks. */
  setPortHints(hints: PortHints): void;
  undo(): void;
  redo(): void;
  /** Replaces everything with the starter program, as a new program; Undo brings it back. */
  reset(): void;
  /**
   * Opens a saved program as one undoable step. Throws, changing nothing, when the blocks
   * cannot be loaded (unknown blocks, or a file from a newer MatPilot).
   */
  open(state: object, meta: ProgramMeta): void;
  /** The workspace now, to save in a file. */
  save(): object;
  /** Changes the name or GitHub file without an undo step (after saving). */
  setMeta(meta: ProgramMeta): void;
  dispose(): void;
}

function toolboxState(workspace: Blockly.Workspace): ToolboxState {
  const variableNames = Object.fromEntries(
    DEVICE_TYPES.map((type) => [
      type,
      workspace
        .getVariableMap()
        .getVariablesOfType(type)
        .map((variable) => variable.getName()),
    ]),
  ) as Record<DeviceType, string[]>;
  return {
    devices: listSetUpDevices(workspace),
    variableNames,
    hasSetupBlock: workspace.getBlocksByType('mp_setup', false).length > 0,
  };
}

/** Blocks that drive the robot (all "mp_move…" blocks but the two settings). */
const isMovementBlock = (type: string) =>
  type.startsWith('mp_move') && type !== 'mp_move_motors' && type !== 'mp_move_wheels';

function simpleToolboxState(workspace: Blockly.Workspace): SimpleToolboxState {
  const blocks = workspace.getAllBlocks(false).filter((block) => block.isEnabled());
  const motors = blocks.find((block) => block.type === 'mp_move_motors');
  const movement: readonly [PortName, PortName] | null = motors
    ? splitPair(motors.getFieldValue('PORTS') as string)
    : blocks.some((block) => isMovementBlock(block.type))
      ? [DEFAULT_MOVEMENT.left, DEFAULT_MOVEMENT.right]
      : null;
  return { hints: getPortHints(), movement };
}

export function createEditor(options: EditorOptions): EditorHandle {
  registerBlocks();
  const themes = getThemes();
  const workspace = Blockly.inject(options.host, {
    toolbox: TOOLBOX as unknown as Blockly.utils.toolbox.ToolboxDefinition,
    theme: options.dark ? themes.dark : themes.light,
    renderer: 'zelos',
    media: BLOCKLY_MEDIA_PATH,
    sounds: false,
    trashcan: true,
    zoom: { controls: true, wheel: false, startScale: 0.75, maxScale: 2, minScale: 0.4 },
    move: { scrollbars: true, drag: true, wheel: true },
    grid: { spacing: 24, length: 2, colour: 'rgba(128, 128, 128, 0.25)', snap: false },
  });

  for (const [name, build] of [
    ['MP_SETUP', setupFlyout],
    ['MP_OUTPUT', outputFlyout],
    ['MP_INPUT', inputFlyout],
  ] as const) {
    workspace.registerToolboxCategoryCallback(
      name,
      (ws) => build(toolboxState(ws)) as unknown as Blockly.utils.toolbox.FlyoutDefinition,
    );
  }
  for (const [name, build] of [
    ['MP_MOVEMENT', movementFlyout],
    ['MP_MOTORS', motorsFlyout],
    ['MP_SENSORS', sensorsFlyout],
  ] as const) {
    workspace.registerToolboxCategoryCallback(
      name,
      (ws) => build(simpleToolboxState(ws)) as unknown as Blockly.utils.toolbox.FlyoutDefinition,
    );
  }

  let meta = options.meta;
  const applyMeta = (next: ProgramMeta) => {
    if (sameMeta(meta, next)) return;
    meta = next;
    options.onMeta(next);
  };

  let restoredStarter = false;
  Blockly.Events.disable();
  try {
    try {
      loadWorkspace(workspace, options.saved ?? STARTER_WORKSPACE);
    } catch {
      workspace.clear();
      loadWorkspace(workspace, STARTER_WORKSPACE);
      restoredStarter = options.saved !== null;
    }
  } finally {
    Blockly.Events.enable();
  }
  if (restoredStarter || options.saved === null) applyMeta(NEW_PROGRAM_META);

  const markedBlocks = new Set<string>();
  const update = () => {
    const program = generateProgram(workspace);
    const byBlock = new Map<string, string[]>();
    for (const problem of program.problems) {
      if (problem.blockId) {
        byBlock.set(problem.blockId, [...(byBlock.get(problem.blockId) ?? []), problem.message]);
      }
    }
    for (const id of markedBlocks) {
      if (!byBlock.has(id)) workspace.getBlockById(id)?.setWarningText(null);
    }
    markedBlocks.clear();
    for (const [id, messages] of byBlock) {
      workspace.getBlockById(id)?.setWarningText(messages.join('\n'));
      markedBlocks.add(id);
    }
    options.onChange(program, Blockly.serialization.workspaces.save(workspace));
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
  workspace.addChangeListener(Blockly.Events.disableOrphans);
  workspace.addChangeListener((event) => {
    if (!event.isUiEvent) schedule();
  });

  let history: EditorHistory = { canUndo: false, canRedo: false };
  const reportHistory = () => {
    const next = {
      canUndo: workspace.getUndoStack().length > 0,
      canRedo: workspace.getRedoStack().length > 0,
    };
    if (next.canUndo === history.canUndo && next.canRedo === history.canRedo) return;
    history = next;
    options.onHistory(next);
  };
  workspace.addChangeListener(reportHistory);

  const undo = (redo: boolean) => {
    workspace.hideChaff();
    workspace.undo(redo);
    // Undo itself records nothing, and its events may all be filtered away.
    setTimeout(reportHistory, 0);
  };

  const replace = (state: object, next: ProgramMeta) => {
    workspace.hideChaff();
    replaceProgram(workspace, state, { before: meta, after: next }, applyMeta, (ws) =>
      ensureRequiredBlocks(ws, { recordUndo: true }),
    );
    // Show "when the program starts" if it is out of view; otherwise leave the view alone.
    const program = workspace.getBlocksByType('mp_program', false)[0] as
      Blockly.BlockSvg | undefined;
    if (program) workspace.scrollBoundsIntoView(program.getBoundingRectangle(), 24);
    schedule();
  };

  const observer = new ResizeObserver(() => Blockly.svgResize(workspace));
  observer.observe(options.host);
  update();

  return {
    restoredStarter,
    setDark(dark) {
      workspace.setTheme(dark ? themes.dark : themes.light);
    },
    setPortHints(hints) {
      setPortHints(hints);
    },
    undo: () => undo(false),
    redo: () => undo(true),
    reset() {
      replace(STARTER_WORKSPACE, NEW_PROGRAM_META);
    },
    open(state, next) {
      replace(state, next);
    },
    save: () => Blockly.serialization.workspaces.save(workspace),
    setMeta: applyMeta,
    dispose() {
      setPortHints({});
      cancelAnimationFrame(frame);
      observer.disconnect();
      workspace.dispose();
    },
  };
}
