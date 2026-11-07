import * as Blockly from 'blockly/core';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { compilePython } from '@/lib/pybricks/compiler';
import { planPath } from '../mats/path';
import { generateProgram } from './generator';
import { TURN_SHADOW, incomingData, readIncoming, stepsToBlocks } from './incoming';
import { loadWorkspace, registerBlocks } from './register';
import { SHADOW } from './simple-definitions';

beforeAll(() => registerBlocks());

const steps = planPath({ xMm: 200, yMm: 200, headingDeg: 0 }, [
  { xMm: 800, yMm: 200 },
  { xMm: 800, yMm: 500 },
]).steps;

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
    const body = stepsToBlocks(steps)!;
    const workspace = new Blockly.Workspace();
    try {
      loadWorkspace(workspace, {
        blocks: {
          languageVersion: 0,
          blocks: [{ type: 'mp_program', x: 0, y: 0, next: { block: body } }],
        },
      });
      expect(workspace.getAllBlocks(false).map((block) => block.type)).toEqual([
        'mp_program',
        'mp_move',
        'math_number',
        'mp_move_turn',
        'mp_turn_angle',
        'mp_move',
        'math_number',
      ]);
      const { code } = generateProgram(workspace);
      expect(code).toMatch(
        /robot\.straight\(600\)\n\s*robot\.turn\(-90\)\n\s*robot\.straight\(300\)/,
      );
      vi.stubGlobal('fetch', undefined);
      try {
        const outcome = await compilePython(code);
        expect(outcome.ok, outcome.ok ? '' : outcome.error.message).toBe(true);
      } finally {
        vi.unstubAllGlobals();
      }
    } finally {
      workspace.dispose();
    }
  });
});
