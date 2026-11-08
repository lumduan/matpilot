import * as Blockly from 'blockly/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { NO_HINTS, hintsFromKey } from './fields/hints';
import { registerBlocks } from './register';
import {
  conditionsFlyout,
  defaultMotorPort,
  defaultMovementPorts,
  defaultSensorPort,
  motorsFlyout,
  movementFlyout,
  sensorsFlyout,
  type SimpleToolboxState,
} from './simple-toolbox';
import {
  TOOLBOX,
  inputFlyout,
  nextDeviceName,
  nextFreePort,
  outputFlyout,
  setupFlyout,
  staticToolboxBlocks,
  type FlyoutItem,
  type ToolboxState,
} from './toolbox';

const EMPTY: ToolboxState = {
  devices: [],
  variableNames: { Motor: [], ColorSensor: [], UltrasonicSensor: [], ForceSensor: [] },
  hasSetupBlock: true,
};

const NO_HUB: SimpleToolboxState = { hints: NO_HINTS, movement: null };

/** The maintainer's bench, as the live values report it. */
const BENCH = hintsFromKey('A=motor:49 B=motor:49 C=motor:48 D=color:61 E=distance:62 F=force:63');

const blocksIn = (items: readonly FlyoutItem[]) => items.filter((item) => item.kind === 'block');

/** Every block any category offers, static or filled when opened. */
function allFlyoutBlocks(): FlyoutItem[] {
  return [
    ...blocksIn(setupFlyout({ ...EMPTY, hasSetupBlock: false })),
    ...blocksIn(outputFlyout(EMPTY)),
    ...blocksIn(inputFlyout(EMPTY)),
    ...blocksIn(movementFlyout(NO_HUB)),
    ...blocksIn(motorsFlyout(NO_HUB)),
    ...blocksIn(sensorsFlyout(NO_HUB)),
    ...staticToolboxBlocks(),
  ];
}

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
      ...EMPTY,
      devices: [{ type: 'Motor', variableId: 'm1', name: 'motor', port: 'A' }],
      variableNames: { ...EMPTY.variableNames, Motor: ['motor'] },
    };
    const motorBlock = blocksIn(setupFlyout(state)).find((b) => b.type === 'mp_setup_motor');
    expect(motorBlock?.fields).toEqual({ VAR: { name: 'motor 2', type: 'Motor' }, PORT: 'B' });
  });

  it('offers the “set up” block itself when the workspace has none', () => {
    const items = blocksIn(setupFlyout({ ...EMPTY, hasSetupBlock: false }));
    expect(items[0]?.type).toBe('mp_setup');
    expect(blocksIn(setupFlyout(EMPTY)).some((item) => item.type === 'mp_setup')).toBe(false);
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
      ...EMPTY,
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
    const types = allFlyoutBlocks().map((item) => item.type as string);
    expect(types.length).toBeGreaterThan(90);
    for (const type of types) expect(Blockly.Blocks[type], type).toBeDefined();
  });

  it('build blocks that load into a workspace', () => {
    const workspace = new Blockly.Workspace();
    for (const item of allFlyoutBlocks()) {
      const state: Record<string, unknown> = { ...item };
      delete state.kind;
      expect(() => Blockly.serialization.blocks.append(state as never, workspace)).not.toThrow();
    }
    workspace.dispose();
  });
});

describe('the toolbox', () => {
  it('lists the simple categories first and folds the detailed ones under Advanced', () => {
    const names = TOOLBOX.contents.map((item) => ('name' in item ? item.name : item.kind));
    expect(names).toEqual([
      'Movement',
      'Motors',
      'Light',
      'Sound',
      'Control',
      'Conditions',
      'Sensors',
      'Controller',
      'Operators',
      'Variables',
      'Functions',
      'sep',
      'Advanced',
    ]);
    const advanced = TOOLBOX.contents.find((item) => 'name' in item && item.name === 'Advanced');
    expect(
      advanced && 'contents' in advanced
        ? advanced.contents.map((item) => ('name' in item ? item.name : ''))
        : [],
    ).toEqual(['Setup', 'Output', 'Input', 'Flow', 'Data', 'Other']);
  });
});

describe('simple flyouts', () => {
  const port = (items: readonly FlyoutItem[], type: string) =>
    (blocksIn(items).find((item) => item.type === type)?.fields as Record<string, unknown>)?.PORT;

  it('use the bench layout without a hub', () => {
    expect(defaultMovementPorts(NO_HINTS)).toBe('AB');
    expect(defaultMotorPort(NO_HUB)).toBe('A');
    expect(defaultSensorPort(NO_HINTS, 'color')).toBe('D');
    expect(defaultSensorPort(NO_HINTS, 'distance')).toBe('E');
    expect(defaultSensorPort(NO_HINTS, 'force')).toBe('F');
  });

  it('keep motor blocks off the robot’s wheels', () => {
    expect(defaultMotorPort({ hints: NO_HINTS, movement: ['A', 'B'] })).toBe('C');
    expect(defaultMotorPort({ hints: BENCH, movement: ['A', 'B'] })).toBe('C');
    expect(port(motorsFlyout({ hints: BENCH, movement: ['A', 'B'] }), 'mp_motor_start')).toBe('C');
  });

  it('follow what the hub sees', () => {
    const moved = hintsFromKey('A=- B=color:61 C=motor:48 D=- E=motor:49 F=distance:62');
    expect(defaultMovementPorts(moved)).toBe('CE');
    expect(defaultMotorPort({ hints: moved, movement: null })).toBe('C');
    const sensors = sensorsFlyout({ hints: moved, movement: null });
    expect(port(sensors, 'mp_sensor_color_is')).toBe('B');
    expect(port(sensors, 'mp_sensor_distance')).toBe('F');
    expect(port(sensors, 'mp_sensor_pressed')).toBe('F');
    const movement = blocksIn(movementFlyout({ hints: moved, movement: null }));
    expect(movement[0]?.fields).toEqual({ PORTS: 'CE' });
  });

  it('give the Conditions blocks the sensors the hub sees', () => {
    const moved = hintsFromKey('A=- B=color:61 C=motor:48 D=- E=motor:49 F=distance:62');
    const items = conditionsFlyout({ hints: moved, movement: null });
    const types = blocksIn(items).map((item) => item.type);
    expect(types.slice(0, 5)).toEqual([
      'controls_if',
      'controls_if',
      'controls_if',
      'mp_switch',
      'mp_switch',
    ]);
    expect(JSON.stringify(blocksIn(items)[3])).toContain(
      '"VALUE":{"block":{"type":"mp_sensor_color","fields":{"PORT":"B"}}}',
    );
    expect(port(items, 'mp_sensor_closer')).toBe('F');
  });

  it('skip ports the hub sees a sensor on when choosing a motor port', () => {
    const sensorsOnly = hintsFromKey('A=color:61 B=distance:62 C=- D=- E=- F=-');
    expect(defaultMotorPort({ hints: sensorsOnly, movement: null })).toBe('C');
  });
});
