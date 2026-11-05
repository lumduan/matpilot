/**
 * The block editor in the browser: creates the Blockly workspace, keeps the generated program
 * and its problems up to date, and saves the workspace on every change (ADR 0008).
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
  /** Called after every change with the program and the workspace to save. */
  readonly onChange: (program: GeneratedProgram, state: object) => void;
}

export interface EditorHandle {
  /** `true` when the saved workspace could not be loaded and the starter was used instead. */
  readonly restoredStarter: boolean;
  setDark(dark: boolean): void;
  /** What the hub says is plugged into each port, for the port pickers and new blocks. */
  setPortHints(hints: PortHints): void;
  /** Replaces everything with the starter program. */
  reset(): void;
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
    reset() {
      workspace.clear();
      loadWorkspace(workspace, STARTER_WORKSPACE);
      ensureRequiredBlocks(workspace);
      schedule();
    },
    dispose() {
      setPortHints({});
      cancelAnimationFrame(frame);
      observer.disconnect();
      workspace.dispose();
    },
  };
}
