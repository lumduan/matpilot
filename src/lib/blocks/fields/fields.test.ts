import * as Blockly from 'blockly/core';
import { beforeAll, describe, expect, it } from 'vitest';
import type { LiveReading } from '../../devices/live';
import { registerBlocks } from '../register';
import { hintsFromKey, hintsFromReading, hintsKey, NO_HINTS, portsWith } from './hints';
import { FieldMatrix } from './matrix';
import {
  BLANK_MATRIX,
  isMatrixValue,
  matrixFromLevels,
  matrixLevels,
  matrixRows,
  SMILE_MATRIX,
} from './matrix-value';
import { FieldPort, FieldPortPair, splitPair } from './port';
import { FieldThrottle } from './throttle';
import { describeSteering, describeTurn, FieldSteering, FieldTurnAngle } from './turn';

beforeAll(() => registerBlocks());

describe('the matrix value', () => {
  it('holds 25 brightness levels and turns them into rows of percent', () => {
    expect(isMatrixValue(SMILE_MATRIX)).toBe(true);
    expect(isMatrixValue(BLANK_MATRIX)).toBe(true);
    expect(isMatrixValue('0'.repeat(24))).toBe(false);
    expect(isMatrixValue('b'.repeat(25))).toBe(false);
    expect(matrixRows(SMILE_MATRIX)).toEqual([
      [0, 0, 0, 0, 0],
      [0, 100, 0, 100, 0],
      [0, 0, 0, 0, 0],
      [100, 0, 0, 0, 100],
      [0, 100, 100, 100, 0],
    ]);
    const levels = matrixLevels(SMILE_MATRIX);
    expect(matrixFromLevels(levels)).toBe(SMILE_MATRIX);
    expect(matrixFromLevels([5, 12, -1, ...Array(22).fill(0)])).toBe(`5a0${'0'.repeat(22)}`);
  });
});

describe('the picture fields', () => {
  it('keep ports in range and the two wheels apart', () => {
    const port = new FieldPort('D', 'color');
    expect(port.getValue()).toBe('D');
    port.setValue('G');
    expect(port.getValue()).toBe('D');
    const pair = new FieldPortPair('CE');
    expect(splitPair(pair.getValue() ?? '')).toEqual(['C', 'E']);
    pair.setValue('AA');
    expect(pair.getValue()).toBe('CE');
  });

  it('clamp numbers and describe them in words', () => {
    const angle = new FieldTurnAngle(90);
    angle.setValue(1000);
    expect(angle.getValue()).toBe(360);
    expect(describeTurn(-45)).toBe('left 45°');
    expect(describeTurn(0)).toBe('no turn');
    const steering = new FieldSteering(0);
    steering.setValue(-250);
    expect(steering.getValue()).toBe(-100);
    expect(describeSteering(30)).toBe('right 30');
    expect(describeSteering(0)).toBe('straight');
    const throttle = new FieldThrottle(50);
    throttle.setValue(140);
    expect(throttle.getValue()).toBe(100);
  });

  it('save and load their values with the workspace', () => {
    const arrow = ['00a00', '0aaa0', 'a0a0a', '00a00', '00a00'].join('');
    const workspace = new Blockly.Workspace();
    Blockly.serialization.blocks.append(
      { type: 'mp_light_show', fields: { PICTURE: arrow } },
      workspace,
    );
    Blockly.serialization.blocks.append(
      { type: 'mp_move_motors', fields: { PORTS: 'CE' } },
      workspace,
    );
    Blockly.serialization.blocks.append(
      { type: 'mp_turn_angle', fields: { ANGLE: -135 } },
      workspace,
    );
    const saved = Blockly.serialization.workspaces.save(workspace);
    workspace.dispose();
    const again = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(saved, again);
    expect(again.getBlocksByType('mp_light_show', false)[0]?.getFieldValue('PICTURE')).toBe(arrow);
    expect(again.getBlocksByType('mp_move_motors', false)[0]?.getFieldValue('PORTS')).toBe('CE');
    expect(again.getBlocksByType('mp_turn_angle', false)[0]?.getFieldValue('ANGLE')).toBe(-135);
    again.dispose();
  });

  it('refuse a broken picture', () => {
    const matrix = new FieldMatrix(SMILE_MATRIX);
    matrix.setValue('not a picture');
    expect(matrix.getValue()).toBe(SMILE_MATRIX);
    expect(new FieldMatrix('xyz').getValue()).toBe(SMILE_MATRIX);
  });
});

describe('port hints', () => {
  const reading: LiveReading = {
    ports: {
      A: { kind: 'motor', typeId: 49, angle: 10, speed: 0 },
      B: null,
      C: { kind: 'motor', typeId: 48, angle: 0, speed: 0 },
      D: { kind: 'color', typeId: 61, color: 'RED', reflection: 40 },
      E: { kind: 'distance', typeId: 62, distance: null },
      F: { kind: 'other', typeId: 64 },
    },
    tilt: { pitch: 0, roll: 0 },
  };

  it('change only when a device does', () => {
    const moved = {
      ...reading,
      ports: { ...reading.ports, A: { ...reading.ports.A!, angle: 99 } },
    };
    expect(hintsKey(moved as LiveReading)).toBe(hintsKey(reading));
    expect(hintsKey(null)).toBe('');
  });

  it('name what is plugged in', () => {
    const hints = hintsFromReading(reading);
    expect(hints).toEqual({
      A: { kind: 'motor', name: 'large motor' },
      B: null,
      C: { kind: 'motor', name: 'medium motor' },
      D: { kind: 'color', name: 'colour sensor' },
      E: { kind: 'distance', name: 'distance sensor' },
      F: { kind: 'other', name: 'light matrix' },
    });
    expect(portsWith(hints, 'motor')).toEqual(['A', 'C']);
    expect(hintsFromKey('')).toBe(NO_HINTS);
  });
});
