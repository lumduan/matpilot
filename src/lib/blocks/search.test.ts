import type * as Blockly from 'blockly/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { NO_HINTS } from './fields/hints';
import { registerBlocks } from './register';
import { wordsAfter } from './from-python/vocabulary';
import {
  matchEntries,
  normalise,
  pythonNamesOf,
  searchFlyout,
  setPythonNames,
  toolboxEntries,
} from './search';
import {
  conditionsFlyout,
  controllerFlyout,
  motorsFlyout,
  movementFlyout,
  sensorsFlyout,
} from './simple-toolbox';
import { inputFlyout, outputFlyout, type ToolboxState } from './toolbox';

const NO_HUB = { hints: NO_HINTS, movement: null };
const NO_DEVICES: ToolboxState = {
  devices: [],
  variableNames: { Motor: [], ColorSensor: [], UltrasonicSensor: [], ForceSensor: [] },
  hasSetupBlock: false,
};
const FLYOUTS: Record<string, () => unknown> = {
  MP_MOVEMENT: () => movementFlyout(NO_HUB),
  MP_MOTORS: () => motorsFlyout(NO_HUB),
  MP_CONDITIONS: () => conditionsFlyout(NO_HUB),
  MP_SENSORS: () => sensorsFlyout(NO_HUB),
  MP_CONTROLLER: () => controllerFlyout(NO_HUB),
  MP_OUTPUT: () => outputFlyout(NO_DEVICES),
  MP_INPUT: () => inputFlyout(NO_DEVICES),
};
/** The toolbox's categories as they open with no hub and no devices set up. */
const workspace = {
  getToolboxCategoryCallback: (name: string) => FLYOUTS[name],
} as unknown as Blockly.WorkspaceSvg;

beforeAll(() => {
  registerBlocks();
  setPythonNames(pythonNamesOf((path) => wordsAfter(path)));
});

const find = (query: string) =>
  matchEntries(query, toolboxEntries(workspace)).map((entry) => [entry.category, entry.item.type]);

describe('searching the blocks', () => {
  it('reads each block’s words as it shows them', () => {
    const entries = toolboxEntries(workspace);
    expect(entries.find((entry) => entry.item.type === 'mp_wait_seconds')?.text).toBe(
      'wait 1 seconds',
    );
    expect(entries.length).toBeGreaterThan(80);
  });

  it('finds wait by "sleep", "pause" and "delay", Control’s first', () => {
    for (const word of ['sleep', 'pause', 'delay', 'SLEEP ']) {
      expect(find(word)[0], word).toEqual(['Control', 'mp_wait_seconds']);
    }
    expect(find('sleep')).toContainEqual(['Flow', 'mp_wait']);
    // Its own words first: "wait" finds the wait blocks, and the stop-then-wait pair.
    const wait = find('wait');
    expect(wait).toContainEqual(['Control', 'mp_wait_seconds']);
    expect(wait).toContainEqual(['Control', 'mp_wait_until']);
    expect(wait).toContainEqual(['Movement', 'mp_move_stop']);
  });

  it('matches every word, by the start of a word, in either spelling', () => {
    expect(find('color sensor')).toContainEqual(['Sensors', 'mp_sensor_color_is']);
    expect(find('colour')).toEqual(find('color'));
    expect(find('tur')).toContainEqual(['Movement', 'mp_move_turn']);
    expect(find('switch')).toContainEqual(['Conditions', 'mp_switch']);
    expect(find('if else')).toContainEqual(['Control', 'controls_if']);
    expect(find('xyzzy')).toEqual([]);
  });

  it('finds a block by the Python it makes', () => {
    expect(find('straight')).toContainEqual(['Movement', 'mp_move']);
    expect(find('run_angle')).toContainEqual(['Motors', 'mp_motor_run_for']);
    expect(find('print')).toContainEqual(['Sensors', 'mp_print']);
    expect(find('reflection')).toContainEqual(['Sensors', 'mp_sensor_reflection']);
  });

  it('shows the matches under their categories, or a hint', () => {
    const items = searchFlyout('sleep', toolboxEntries(workspace));
    expect(items[0]).toEqual({ kind: 'label', text: 'Control' });
    expect(items[1]?.type).toBe('mp_wait_seconds');
    expect(searchFlyout('', [])).toEqual([
      { kind: 'label', text: 'Type a word: wait, turn, colour, motor, if…' },
    ]);
    expect(searchFlyout('xyzzy', toolboxEntries(workspace))[0]?.text).toMatch(/No block matches/);
    expect(normalise('Colour-Sensor  Grey!')).toBe('color sensor gray');
  });
});
