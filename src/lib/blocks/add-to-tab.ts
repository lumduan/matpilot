/**
 * Adding a stack of blocks to a tab where it runs (asked for on 2026-11-08: a path from the Mats
 * page goes into the tab the child chose, not only main):
 * - main: at the end of the program, under "when the program starts";
 * - another tab: blocks there run only inside a "define" block (ADR 0013), so at the end of its
 *   last "define" block; a tab with none gets a new one, "path", that main can call.
 * When the last block takes nothing after it (repeat forever), the stack goes below, on its own.
 */
import * as Blockly from 'blockly/core';
import { FUNCTION_BLOCKS, uniqueFunctionName } from './functions';

export interface AddedBlocks {
  /** The added blocks, without the new "define" block, if one was made. */
  readonly blocks: number;
  readonly attached: boolean;
  /** The block to show: the stack, or the new "define" block. */
  readonly shownId: string;
  /** For the notice. */
  readonly message: string;
}

/** The base name of the "define" block made for blocks added to a tab without one. */
export const ADDED_FUNCTION_NAME = 'path';

const plural = (count: number) => `${count} block${count === 1 ? '' : 's'}`;

/** The last block of the chain that starts at `first`. */
function lastOf(first: Blockly.Block): Blockly.Block {
  let last = first;
  while (last.getNextBlock()) last = last.getNextBlock()!;
  return last;
}

/**
 * Adds `state` (one stack) to the tab's workspace, as one Blockly event group, so Undo takes it
 * back at once. `isMain`: the tab holds "when the program starts".
 */
export function addToTab(
  workspace: Blockly.Workspace,
  tab: { readonly name: string; readonly isMain: boolean },
  state: Blockly.serialization.blocks.State,
  /** Where the blocks' bottom is, when the caller can measure it (a rendered workspace). */
  bottom?: number,
): AddedBlocks {
  const below =
    bottom ??
    Math.max(0, ...workspace.getTopBlocks(false).map((top) => top.getRelativeToSurfaceXY().y + 80));
  const at = { x: 24, y: below + 48 };
  const count = (block: Blockly.Block) =>
    block.getDescendants(false).filter((each) => !each.isShadow()).length;
  Blockly.Events.setGroup(true);
  try {
    if (tab.isMain) {
      const added = Blockly.serialization.blocks.append({ ...state, ...at }, workspace);
      const hat = workspace.getTopBlocks(true).find((block) => block.type === 'mp_program');
      const last = hat ? lastOf(hat) : null;
      const attached = Boolean(last?.nextConnection && added.previousConnection);
      if (attached) last!.nextConnection!.connect(added.previousConnection!);
      const blocks = count(added);
      return {
        blocks,
        attached,
        shownId: added.id,
        message: attached
          ? `Added ${plural(blocks)} at the end of main.`
          : `Added ${plural(blocks)} to main, below the other blocks: drag them where they should run.`,
      };
    }
    const defines = workspace
      .getTopBlocks(true)
      .filter((block) => block.type === FUNCTION_BLOCKS.define && block.isEnabled());
    const target = defines.at(-1);
    if (!target) {
      const name = uniqueFunctionName(ADDED_FUNCTION_NAME, workspace, null);
      const define = Blockly.serialization.blocks.append(
        {
          type: FUNCTION_BLOCKS.define,
          ...at,
          fields: { NAME: name },
          inputs: { DO: { block: state } },
        },
        workspace,
      );
      const blocks = count(define) - 1;
      return {
        blocks,
        attached: true,
        shownId: define.id,
        message: `Added ${plural(blocks)} in a new block of your own, “${name}”, in the tab ${tab.name}. Use it in main: Functions › ${name}.`,
      };
    }
    const added = Blockly.serialization.blocks.append({ ...state, ...at }, workspace);
    const name = target.getFieldValue('NAME') as string;
    const first = target.getInputTargetBlock('DO');
    const last = first ? lastOf(first) : null;
    let attached = false;
    if (!first && added.previousConnection) {
      target.getInput('DO')!.connection!.connect(added.previousConnection);
      attached = true;
    } else if (last?.nextConnection && added.previousConnection) {
      last.nextConnection.connect(added.previousConnection);
      attached = true;
    }
    const blocks = count(added);
    return {
      blocks,
      attached,
      shownId: added.id,
      message: attached
        ? `Added ${plural(blocks)} at the end of “${name}” in the tab ${tab.name}.`
        : `Added ${plural(blocks)} to the tab ${tab.name}, below the other blocks: drag them where they should run.`,
    };
  } finally {
    Blockly.Events.setGroup(false);
  }
}
