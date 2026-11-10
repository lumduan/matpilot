import * as Blockly from 'blockly/core';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { compilePython } from '@/lib/pybricks/compiler';
import { planPath } from '../mats/path';
import { generateProgram } from './generator';
import {
  PERCENT_SHADOW,
  TURN_SHADOW,
  describeSteps,
  incomingData,
  readIncoming,
  stepsToBlocks,
} from './incoming';
import { loadWorkspace, registerBlocks } from './register';
import { SHADOW } from './simple-definitions';

beforeAll(() => registerBlocks());

const steps = planPath({ xMm: 200, yMm: 200, headingDeg: 0 }, [
  { kind: 'point', xMm: 800, yMm: 200 },
  { kind: 'point', xMm: 800, yMm: 500 },
]).steps;

/** Loads the blocks under "when the program starts" and gives their types and the Python. */
async function blocksOf(body: NonNullable<ReturnType<typeof stepsToBlocks>>) {
  const workspace = new Blockly.Workspace();
  try {
    loadWorkspace(workspace, {
      blocks: {
        languageVersion: 0,
        blocks: [{ type: 'mp_program', x: 0, y: 0, next: { block: body } }],
      },
    });
    const types = workspace.getAllBlocks(false).map((block) => block.type);
    const { code } = generateProgram(workspace);
    vi.stubGlobal('fetch', undefined);
    try {
      const outcome = await compilePython(code);
      expect(outcome.ok, outcome.ok ? '' : outcome.error.message).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
    return { types, code };
  } finally {
    workspace.dispose();
  }
}

describe('blocks handed over from the Mats page', () => {
  it('read back what was written, and nothing else', () => {
    expect(readIncoming(incomingData('Path 1', steps))).toEqual({
      from: 'mats',
      name: 'Path 1',
      steps,
    });
    expect(readIncoming(null)).toBeNull();
    expect(readIncoming('not json')).toBeNull();
    expect(readIncoming(JSON.stringify({ from: 'mats', steps: [] }))).toBeNull();
    expect(
      readIncoming(JSON.stringify({ from: 'mats', steps: [{ kind: 'turn', degrees: 1.5 }] })),
    ).toBeNull();
    expect(
      readIncoming(JSON.stringify({ from: 'mats', steps: [{ kind: 'jump', mm: 10 }] })),
    ).toBeNull();
    expect(readIncoming(JSON.stringify({ from: 'elsewhere', steps }))).toBeNull();
  });

  it('become the simple blocks, which make the same moves in Python and compile', async () => {
    expect(TURN_SHADOW).toBe(SHADOW.turn);
    const { types, code } = await blocksOf(stepsToBlocks(steps)!);
    expect(types).toEqual([
      'mp_program',
      'mp_move',
      'math_number',
      'mp_move_turn',
      'mp_turn_angle',
      'mp_move',
      'math_number',
    ]);
    expect(code).toMatch(
      /robot\.straight\(600\)\n\s*robot\.turn\(-90\)\n\s*robot\.straight\(300\)/,
    );
  });

  it('take backward drives, waits and speeds too, as their own blocks', async () => {
    expect(PERCENT_SHADOW).toBe(SHADOW.percent);
    const more = [
      { kind: 'speed', percent: 60 },
      { kind: 'straight', mm: -300 },
      { kind: 'wait', seconds: 1.5 },
      { kind: 'turn', degrees: 180 },
    ] as const;
    expect(readIncoming(incomingData('More', more))?.steps).toEqual(more);
    for (const bad of [
      { kind: 'speed', percent: 1.5 },
      { kind: 'speed', percent: 101 },
      { kind: 'wait', seconds: -1 },
      { kind: 'wait', seconds: 'long' },
      { kind: 'straight', mm: 0 },
      { kind: 'turn', degrees: 361 },
    ]) {
      expect(
        readIncoming(JSON.stringify({ from: 'mats', steps: [bad] })),
        JSON.stringify(bad),
      ).toBeNull();
    }
    const { types, code } = await blocksOf(stepsToBlocks(more)!);
    expect(types).toEqual([
      'mp_program',
      'mp_move_speed',
      'mp_percent',
      'mp_move',
      'math_number',
      'mp_wait_seconds',
      'math_number',
      'mp_move_turn',
      'mp_turn_angle',
    ]);
    expect(code).toMatch(
      /set_movement_speed\(60\)\n\s*robot\.straight\(-300\)\n\s*wait\(1500\)\n\s*robot\.turn\(180\)/,
    );
  });

  it('say what they are on the Blocks page', () => {
    expect(describeSteps(steps)).toBe('moves and a turn');
    expect(
      describeSteps([
        { kind: 'straight', mm: 10 },
        { kind: 'wait', seconds: 1 },
        { kind: 'wait', seconds: 1 },
        { kind: 'speed', percent: 50 },
      ]),
    ).toBe('a move, waits and a speed');
    expect(describeSteps([{ kind: 'turn', degrees: 90 }])).toBe('a turn');
  });
});
