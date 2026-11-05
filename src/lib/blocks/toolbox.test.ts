import * as Blockly from 'blockly/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { registerBlocks } from './register';
import {
  TOOLBOX,
  inputFlyout,
  nextDeviceName,
  nextFreePort,
  outputFlyout,
  setupFlyout,
  type FlyoutItem,
  type ToolboxState,
} from './toolbox';

const EMPTY: ToolboxState = {
  devices: [],
  variableNames: { Motor: [], ColorSensor: [], UltrasonicSensor: [], ForceSensor: [] },
};

const blocksIn = (items: readonly FlyoutItem[]) => items.filter((item) => item.kind === 'block');

beforeAll(() => registerBlocks());

describe('nextDeviceName', () => {
  it('numbers further devices of a type', () => {
    expect(nextDeviceName('Motor', [])).toBe('motor');
    expect(nextDeviceName('Motor', ['motor'])).toBe('motor 2');
    expect(nextDeviceName('Motor', ['Motor', 'motor 2'])).toBe('motor 3');
  });
});

describe('nextFreePort', () => {
  it('follows the bench layout, then any free port', () => {
    expect(nextFreePort('Motor', [])).toBe('A');
    expect(nextFreePort('Motor', ['A'])).toBe('B');
    expect(nextFreePort('Motor', ['A', 'B', 'C'])).toBe('D');
    expect(nextFreePort('ColorSensor', [])).toBe('D');
    expect(nextFreePort('ColorSensor', ['D'])).toBe('A');
    expect(nextFreePort('UltrasonicSensor', [])).toBe('E');
    expect(nextFreePort('ForceSensor', [])).toBe('F');
  });
});

describe('setupFlyout', () => {
  it('offers each device with a fresh name and the next free port', () => {
    const state: ToolboxState = {
      devices: [{ type: 'Motor', variableId: 'm1', name: 'motor', port: 'A' }],
      variableNames: { ...EMPTY.variableNames, Motor: ['motor'] },
    };
    const motorBlock = blocksIn(setupFlyout(state)).find((b) => b.type === 'mp_setup_motor');
    expect(motorBlock?.fields).toEqual({ VAR: { name: 'motor 2', type: 'Motor' }, PORT: 'B' });
  });

  it('reuses a device name whose set-up block was removed', () => {
    const state: ToolboxState = {
      ...EMPTY,
      variableNames: { ...EMPTY.variableNames, ColorSensor: ['floor'] },
    };
    const colour = blocksIn(setupFlyout(state)).find((b) => b.type === 'mp_setup_color_sensor');
    expect(colour?.fields).toEqual({ VAR: { name: 'floor', type: 'ColorSensor' }, PORT: 'D' });
  });
});

describe('output and input flyouts', () => {
  it('point new blocks at the first device of each type', () => {
    const state: ToolboxState = {
      devices: [
        { type: 'Motor', variableId: 'm1', name: 'left', port: 'A' },
        { type: 'Motor', variableId: 'm2', name: 'right', port: 'B' },
      ],
      variableNames: { ...EMPTY.variableNames, Motor: ['left', 'right'] },
    };
    const run = blocksIn(outputFlyout(state)).find((b) => b.type === 'mp_motor_run');
    expect(run?.fields).toEqual({ MOTOR: { id: 'm1' } });
    const items = inputFlyout(state);
    expect(items).toContainEqual({
      kind: 'label',
      text: 'No colour sensor set up yet: add one under Setup first.',
    });
  });

  it('only use block types that exist', () => {
    const types = [
      ...blocksIn(setupFlyout(EMPTY)),
      ...blocksIn(outputFlyout(EMPTY)),
      ...blocksIn(inputFlyout(EMPTY)),
      ...TOOLBOX.contents.flatMap((category) =>
        'contents' in category ? blocksIn(category.contents as readonly FlyoutItem[]) : [],
      ),
    ].map((item) => item.type as string);
    expect(types.length).toBeGreaterThan(40);
    for (const type of types) expect(Blockly.Blocks[type], type).toBeDefined();
  });

  it('build blocks that load into a workspace', () => {
    const workspace = new Blockly.Workspace();
    for (const item of [
      ...blocksIn(setupFlyout(EMPTY)),
      ...blocksIn(outputFlyout(EMPTY)),
      ...blocksIn(inputFlyout(EMPTY)),
    ]) {
      const state: Record<string, unknown> = { ...item };
      delete state.kind;
      expect(() => Blockly.serialization.blocks.append(state as never, workspace)).not.toThrow();
    }
    workspace.dispose();
  });
});
