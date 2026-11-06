/**
 * One-time registration of MatPilot's blocks, their picture fields, their Python, and Blockly's
 * English messages. Safe to call more than once (Blockly's registries outlive a hot-reloaded
 * module).
 */
import * as Blockly from 'blockly/core';
import * as En from 'blockly/msg/en';
import { CONTROLLER_BLOCK_DEFINITIONS } from './controller-definitions';
import { BLOCK_DEFINITIONS } from './definitions';
import { registerFields } from './fields';
import { registerFunctionBlocks } from './functions';
import { registerGenerators } from './generator';
import { registerSharedBlocks } from './shared';
import { SIMPLE_BLOCK_DEFINITIONS } from './simple-definitions';

let registered = false;

export function registerBlocks(): void {
  if (registered) return;
  registered = true;
  Blockly.setLocale(En as unknown as Record<string, string>);
  registerFields();
  const missing = [
    ...BLOCK_DEFINITIONS,
    ...SIMPLE_BLOCK_DEFINITIONS,
    ...CONTROLLER_BLOCK_DEFINITIONS,
  ].filter((definition) => !Blockly.Blocks[definition.type]);
  Blockly.common.defineBlocksWithJsonArray(missing);
  registerFunctionBlocks();
  registerSharedBlocks();
  registerGenerators();
}

/** Loads a saved workspace, adding the "when the program starts" block if it is missing. */
export function loadWorkspace(workspace: Blockly.Workspace, state: object): void {
  Blockly.serialization.workspaces.load(state, workspace);
  ensureRequiredBlocks(workspace);
}

/**
 * Every program has one "when the program starts" block, which cannot be deleted. The "set up"
 * block is only needed for the detailed blocks, so it may be deleted; older saved workspaces
 * stored it as undeletable (ADR 0010). Only the main tab has one (ADR 0013).
 */
export function ensureRequiredBlocks(workspace: Blockly.Workspace): void {
  const existing = workspace.getBlocksByType('mp_program', false);
  const program =
    existing[0] ??
    Blockly.serialization.blocks.append({ type: 'mp_program', x: 24, y: 24 }, workspace);
  program.setDeletable(false);
  // A second one is a problem to fix (./generator.ts), so it must be deletable.
  for (const extra of existing.slice(1)) extra.setDeletable(true);
  for (const setup of workspace.getBlocksByType('mp_setup', false)) setup.setDeletable(true);
}
