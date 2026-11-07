/**
 * The shadow block each value input gets in the toolbox (a number, a text, a turn angle, ...), so
 * blocks made from Python look like blocks dragged from the toolbox: a number typed in Python
 * fills the shadow, and anything else is a block placed over it. Read from the toolbox itself, so
 * it follows any change there.
 */
import type * as Blockly from 'blockly/core';
import { NO_HINTS } from '../fields/hints';
import { DEVICE_TYPES, type DeviceType } from '../pybricks';
import {
  CONTROL_CONTENTS,
  LIGHT_CONTENTS,
  OPERATOR_CONTENTS,
  SOUND_CONTENTS,
  controllerFlyout,
  motorsFlyout,
  movementFlyout,
  sensorsFlyout,
  type SimpleToolboxState,
} from '../simple-toolbox';
import {
  inputFlyout,
  outputFlyout,
  staticToolboxBlocks,
  type FlyoutItem,
  type ToolboxState,
} from '../toolbox';

export type BlockState = Blockly.serialization.blocks.State;

/** One device of each type, so the device categories list their blocks. */
const WITH_DEVICES: ToolboxState = {
  devices: DEVICE_TYPES.map((type: DeviceType) => ({
    type,
    variableId: `shadow-${type}`,
    name: type,
    port: 'A' as const,
  })),
  variableNames: Object.fromEntries(DEVICE_TYPES.map((type) => [type, [type]])) as Record<
    DeviceType,
    string[]
  >,
  hasSetupBlock: true,
};

const NO_HUB: SimpleToolboxState = { hints: NO_HINTS, movement: null };

const number = (value: number): BlockState => ({ type: 'math_number', fields: { NUM: value } });

/** Inputs the toolbox does not show with a shadow, but blocks made in the editor get one. */
const EXTRA: Record<string, Record<string, BlockState>> = {
  variables_set: { VALUE: number(0) },
  math_change: { DELTA: number(1) },
};

let table: Map<string, Map<string, BlockState>> | null = null;

function build(): Map<string, Map<string, BlockState>> {
  const items: FlyoutItem[] = [
    ...outputFlyout(WITH_DEVICES),
    ...inputFlyout(WITH_DEVICES),
    ...movementFlyout(NO_HUB),
    ...motorsFlyout(NO_HUB),
    ...sensorsFlyout(NO_HUB),
    ...controllerFlyout(NO_HUB),
    ...LIGHT_CONTENTS,
    ...SOUND_CONTENTS,
    ...CONTROL_CONTENTS,
    ...OPERATOR_CONTENTS,
    ...staticToolboxBlocks(),
  ];
  const out = new Map<string, Map<string, BlockState>>();
  const visit = (state: Record<string, unknown>) => {
    const type = state.type;
    const inputs = state.inputs as Record<string, { shadow?: BlockState; block?: BlockState }>;
    if (typeof type !== 'string' || !inputs) return;
    const byInput = out.get(type) ?? new Map<string, BlockState>();
    for (const [name, input] of Object.entries(inputs)) {
      if (input.shadow && !byInput.has(name)) byInput.set(name, input.shadow);
      if (input.block) visit(input.block as unknown as Record<string, unknown>);
    }
    out.set(type, byInput);
    const next = (state.next as { block?: Record<string, unknown> } | undefined)?.block;
    if (next) visit(next);
  };
  for (const item of items) if (item.kind === 'block') visit(item);
  for (const [type, inputs] of Object.entries(EXTRA)) {
    const byInput = out.get(type) ?? new Map<string, BlockState>();
    for (const [name, shadow] of Object.entries(inputs)) {
      if (!byInput.has(name)) byInput.set(name, shadow);
    }
    out.set(type, byInput);
  }
  return out;
}

/** The shadow the toolbox puts in this input, if any. */
export function shadowFor(type: string, input: string): BlockState | undefined {
  table ??= build();
  return table.get(type)?.get(input);
}
