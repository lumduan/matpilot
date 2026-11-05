/**
 * One-time registration of MatPilot's blocks, their Python, and Blockly's English messages.
 * Safe to call more than once (Blockly's registries outlive a hot-reloaded module).
 */
import * as Blockly from 'blockly/core';
import * as En from 'blockly/msg/en';
import { BLOCK_DEFINITIONS } from './definitions';
import { registerGenerators } from './generator';

let registered = false;

export function registerBlocks(): void {
  if (registered) return;
  registered = true;
  Blockly.setLocale(En as unknown as Record<string, string>);
  const missing = BLOCK_DEFINITIONS.filter((definition) => !Blockly.Blocks[definition.type]);
  Blockly.common.defineBlocksWithJsonArray(missing);
  registerGenerators();
}

/** Loads a saved workspace, adding the "set up" and "program" blocks if they are missing. */
export function loadWorkspace(workspace: Blockly.Workspace, state: object): void {
  Blockly.serialization.workspaces.load(state, workspace);
  ensureRequiredBlocks(workspace);
}

export function ensureRequiredBlocks(workspace: Blockly.Workspace): void {
  const required: [type: string, y: number][] = [
    ['mp_setup', 24],
    ['mp_program', 150],
  ];
  for (const [type, y] of required) {
    const existing = workspace.getBlocksByType(type, false);
    const block =
      existing[0] ??
      Blockly.serialization.blocks.append({ type, x: 24, y }, workspace, { recordUndo: false });
    for (const each of [block, ...existing.slice(1)]) each.setDeletable(false);
  }
}
