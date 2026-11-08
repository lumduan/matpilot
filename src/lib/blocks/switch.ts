/**
 * "switch on": one value checked once, then the blocks of the first case it equals, or those
 * under "otherwise" (docs/adr/0010-simple-blocks.md, amended 2026-11-08). ⊕ adds a case and ⊖
 * removes the last one; Undo takes either back.
 *
 * The Python is the if … elif … else the other blocks make, on a variable set once just before:
 *
 *     switch_value = colour_sensor_d.color()
 *     if switch_value == Color.RED:
 *         ...
 *     elif switch_value == Color.BLUE:
 *         ...
 *     else:
 *         ...
 *
 * Reading the value once matters for sensors: a colour that changes while the cases are checked
 * cannot match two of them, or none. A switch inside a case sets switch_value again, which is
 * safe: once a case is chosen, Python checks no more of them. ./from-python/reader.ts reads this
 * shape back into the block.
 */
import * as Blockly from 'blockly/core';
import { Order, pythonGenerator } from 'blockly/python';
import { ADD_PICTURE, REMOVE_PICTURE } from './functions';
import { SENSOR_COLOR_OPTIONS } from './pybricks';

export const SWITCH_BLOCK = 'mp_switch';
/** The variable the block sets; reserved, so no user variable takes the name. */
export const SWITCH_VALUE = 'switch_value';
/** The colour block a case holds (./simple-definitions.ts). */
export const COLOR_VALUE_BLOCK = 'mp_color';

export const MIN_CASES = 1;
export const MAX_CASES = 10;
const DEFAULT_CASES = 2;

type SwitchBlock = Blockly.Block & {
  cases_: number;
  updateShape_(): void;
};

/** Records a change of the number of cases, so Undo and Redo can replay it. */
function changeCases(block: SwitchBlock, cases: number): void {
  const before = Blockly.Events.BlockChange.getExtraBlockState_(
    block as unknown as Blockly.BlockSvg,
  );
  block.cases_ = cases;
  block.updateShape_();
  const after = Blockly.Events.BlockChange.getExtraBlockState_(
    block as unknown as Blockly.BlockSvg,
  );
  if (before !== after) {
    Blockly.Events.fire(new Blockly.Events.BlockChange(block, 'mutation', null, before, after));
  }
}

/**
 * The shadow for a new case: like the case before it, with the next colour or number, so ⊕ on a
 * colour switch gives a colour to choose.
 */
export function nextCaseShadow(
  previous: Blockly.serialization.blocks.State | null,
  used: readonly Blockly.serialization.blocks.State[],
): Blockly.serialization.blocks.State | null {
  if (!previous) return null;
  if (previous.type === COLOR_VALUE_BLOCK) {
    const taken = new Set(used.map((state) => state.fields?.COLOR as string | undefined));
    const next = SENSOR_COLOR_OPTIONS.find(([, value]) => !taken.has(value));
    return { type: COLOR_VALUE_BLOCK, fields: { COLOR: next?.[1] ?? 'RED' } };
  }
  if (previous.type === 'math_number') {
    const numbers = used
      .map((state) => Number(state.fields?.NUM))
      .filter((value) => Number.isFinite(value));
    return { type: 'math_number', fields: { NUM: Math.max(0, ...numbers) + 1 } };
  }
  if (previous.type === 'text') return { type: 'text', fields: { TEXT: '' } };
  return null;
}

/** The state of the block in a case's slot, shadow or not. */
function caseState(block: Blockly.Block, index: number): Blockly.serialization.blocks.State | null {
  const target = block.getInput(`CASE${index}`)?.connection?.targetBlock();
  return target ? Blockly.serialization.blocks.save(target, { addCoordinates: false }) : null;
}

export function addCase(target: Blockly.Block): void {
  const block = target as SwitchBlock;
  if (block.cases_ >= MAX_CASES) return;
  Blockly.Events.setGroup(true);
  try {
    const used = Array.from({ length: block.cases_ }, (_, index) => caseState(block, index)).filter(
      (state): state is Blockly.serialization.blocks.State => state !== null,
    );
    const shadow = nextCaseShadow(caseState(block, block.cases_ - 1), used);
    changeCases(block, block.cases_ + 1);
    const connection = block.getInput(`CASE${block.cases_ - 1}`)?.connection;
    if (shadow && connection) connection.setShadowState(shadow);
  } finally {
    Blockly.Events.setGroup(false);
  }
}

/** Removes the last case. Blocks in it are kept, loose on the workspace, not deleted. */
export function removeCase(target: Blockly.Block): void {
  const block = target as SwitchBlock;
  if (block.cases_ <= MIN_CASES) return;
  const last = block.cases_ - 1;
  Blockly.Events.setGroup(true);
  try {
    for (const name of [`CASE${last}`, `DO${last}`]) {
      const target = block.getInput(name)?.connection?.targetBlock();
      if (target && !target.isShadow()) target.unplug();
    }
    changeCases(block, last);
  } finally {
    Blockly.Events.setGroup(false);
  }
}

const SWITCH = {
  init(this: SwitchBlock) {
    this.cases_ = DEFAULT_CASES;
    this.appendValueInput('VALUE').appendField('switch on');
    this.appendDummyInput('OTHERWISE').appendField('otherwise');
    this.appendStatementInput('ELSE');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(false);
    this.setStyle('loop_blocks');
    this.setTooltip(
      'Checks one thing once, then does the blocks of the first case it matches, or the blocks under “otherwise”. ⊕ adds a case, ⊖ removes the last one.',
    );
    this.updateShape_();
  },
  saveExtraState(this: SwitchBlock) {
    return { cases: this.cases_ };
  },
  loadExtraState(this: SwitchBlock, state: unknown) {
    const cases = Number((state as { cases?: unknown } | null)?.cases);
    this.cases_ = Number.isInteger(cases)
      ? Math.min(MAX_CASES, Math.max(MIN_CASES, cases))
      : DEFAULT_CASES;
    this.updateShape_();
  },
  updateShape_(this: SwitchBlock) {
    // Add the cases that are missing, before "otherwise", and remove the ones past the count.
    for (let index = 0; index < this.cases_; index += 1) {
      if (this.getInput(`CASE${index}`)) continue;
      this.appendValueInput(`CASE${index}`).appendField('case');
      this.appendStatementInput(`DO${index}`).appendField('do');
      this.moveInputBefore(`CASE${index}`, 'OTHERWISE');
      this.moveInputBefore(`DO${index}`, 'OTHERWISE');
    }
    for (let index = this.cases_; this.getInput(`CASE${index}`); index += 1) {
      this.removeInput(`CASE${index}`);
      this.removeInput(`DO${index}`);
    }
    const otherwise = this.getInput('OTHERWISE')!;
    for (const name of ['ADD', 'REMOVE']) {
      if (otherwise.fieldRow.some((field) => field.name === name)) otherwise.removeField(name);
    }
    if (this.cases_ < MAX_CASES) {
      otherwise.appendField(
        new Blockly.FieldImage(ADD_PICTURE, 20, 20, 'Add a case', () => addCase(this)),
        'ADD',
      );
    }
    if (this.cases_ > MIN_CASES) {
      otherwise.appendField(
        new Blockly.FieldImage(REMOVE_PICTURE, 20, 20, 'Remove the last case', () =>
          removeCase(this),
        ),
        'REMOVE',
      );
    }
  },
};

export function registerSwitchBlock(): void {
  if (!Blockly.Blocks[SWITCH_BLOCK]) Blockly.Blocks[SWITCH_BLOCK] = SWITCH;
}

export function registerSwitchGenerator(): void {
  pythonGenerator.forBlock[SWITCH_BLOCK] = (block) => {
    const g = pythonGenerator;
    const cases = (block as SwitchBlock).cases_;
    const value = g.valueToCode(block, 'VALUE', Order.NONE) || 'None';
    let code = `${SWITCH_VALUE} = ${value}\n`;
    for (let index = 0; index < cases; index += 1) {
      const test = g.valueToCode(block, `CASE${index}`, Order.RELATIONAL) || 'None';
      const body = g.statementToCode(block, `DO${index}`) || g.PASS;
      code += `${index === 0 ? 'if' : 'elif'} ${SWITCH_VALUE} == ${test}:\n${body}`;
    }
    const otherwise = g.statementToCode(block, 'ELSE');
    if (otherwise) code += `else:\n${otherwise}`;
    return code;
  };
}
