import * as Blockly from 'blockly/core';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { registerBlocks } from './register';
import { MAX_CASES, addCase, nextCaseShadow, removeCase } from './switch';

let workspace: Blockly.Workspace;

beforeAll(() => registerBlocks());
afterEach(() => workspace?.dispose());

/** Lets Blockly fire the events it queued, so Undo sees them. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function colourSwitch(): Blockly.Block {
  workspace = new Blockly.Workspace();
  return Blockly.serialization.blocks.append(
    {
      type: 'mp_switch',
      extraState: { cases: 2 },
      inputs: {
        CASE0: { shadow: { type: 'mp_color', fields: { COLOR: 'RED' } } },
        CASE1: { shadow: { type: 'mp_color', fields: { COLOR: 'BLUE' } } },
        DO1: { block: { type: 'mp_light_off' } },
      },
    },
    workspace,
  );
}

const caseColour = (block: Blockly.Block, index: number) =>
  block.getInput(`CASE${index}`)?.connection?.targetBlock()?.getFieldValue('COLOR') as
    string | undefined;

describe('switch on', () => {
  it('adds a case with the next colour, and Undo takes it back', async () => {
    const block = colourSwitch();
    await settle();
    addCase(block);
    expect(Blockly.serialization.blocks.save(block)?.extraState).toEqual({ cases: 3 });
    expect([0, 1, 2].map((index) => caseColour(block, index))).toEqual(['RED', 'BLUE', 'YELLOW']);
    expect(block.getInput('DO2')).toBeTruthy();
    // "otherwise" stays last.
    expect(block.inputList.map((input) => input.name).slice(-2)).toEqual(['OTHERWISE', 'ELSE']);
    await settle();
    workspace.undo(false);
    await settle();
    expect(block.getInput('CASE2')).toBeNull();
  });

  it('removes the last case but keeps the blocks in it, loose', () => {
    const block = colourSwitch();
    removeCase(block);
    expect(block.getInput('CASE1')).toBeNull();
    const loose = workspace.getTopBlocks(false).filter((each) => each.type === 'mp_light_off');
    expect(loose).toHaveLength(1);
    // Never fewer than one case.
    removeCase(block);
    expect(block.getInput('CASE0')).toBeTruthy();
    expect(block.getField('REMOVE')).toBeNull();
  });

  it('stops adding at the most cases', () => {
    const block = colourSwitch();
    for (let i = 0; i < MAX_CASES + 2; i += 1) addCase(block);
    expect(Blockly.serialization.blocks.save(block)?.extraState).toEqual({ cases: MAX_CASES });
    expect(block.getField('ADD')).toBeNull();
    // Every colour the sensor knows, then red again.
    expect(caseColour(block, 5)).toBe('NONE');
    expect(caseColour(block, 6)).toBe('RED');
  });

  it('gives a new case the next number, an empty text, or nothing', () => {
    const number = (NUM: number) => ({ type: 'math_number', fields: { NUM } });
    expect(nextCaseShadow(number(2), [number(2), number(7)])).toEqual(number(8));
    expect(nextCaseShadow({ type: 'text', fields: { TEXT: 'a' } }, [])).toEqual({
      type: 'text',
      fields: { TEXT: '' },
    });
    expect(nextCaseShadow({ type: 'variables_get' }, [])).toBeNull();
    expect(nextCaseShadow(null, [])).toBeNull();
  });
});
