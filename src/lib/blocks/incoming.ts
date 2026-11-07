/**
 * Blocks handed to the Blocks page from another page (ADR 0016): a path drawn on the Mats page,
 * as the simple blocks "turn" and "move forward … mm". Kept in this browser until the Blocks
 * page adds them at the end of main or they are dismissed: nothing changes in a program unless
 * the child presses Add there.
 *
 * No Blockly here: the Mats page writes the steps, and the Blocks page makes them into blocks
 * with `stepsToBlocks`. The block types and their inputs are the simple blocks' own
 * (./simple-definitions.ts, ./simple-toolbox.ts); a test loads them into Blockly and checks the
 * Python they make.
 */
import type { PathStep } from '../mats/path';

export const INCOMING_KEY = 'matpilot.blocks.incoming.v1';
/** At most this many steps are accepted. */
export const MAX_INCOMING_STEPS = 200;

export interface IncomingBlocks {
  readonly from: 'mats';
  readonly name: string;
  readonly steps: readonly PathStep[];
}

export function incomingData(name: string, steps: readonly PathStep[]): string {
  return JSON.stringify({ from: 'mats', name, steps } satisfies IncomingBlocks);
}

const whole = (value: unknown, limit: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && Math.abs(value) <= limit;

export function readIncoming(raw: string | null): IncomingBlocks | null {
  if (raw === null) return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (data.from !== 'mats' || !Array.isArray(data.steps)) return null;
    const steps: PathStep[] = [];
    for (const step of (data.steps as unknown[]).slice(0, MAX_INCOMING_STEPS)) {
      if (typeof step !== 'object' || step === null) return null;
      const each = step as Record<string, unknown>;
      if (each.kind === 'turn' && whole(each.degrees, 180)) {
        steps.push({ kind: 'turn', degrees: each.degrees });
      } else if (each.kind === 'straight' && whole(each.mm, 100_000)) {
        steps.push({ kind: 'straight', mm: each.mm });
      } else {
        return null;
      }
    }
    if (steps.length === 0) return null;
    const name = typeof data.name === 'string' ? data.name.slice(0, 60) : 'A path';
    return { from: 'mats', name, steps };
  } catch {
    return null;
  }
}

/** Blockly's JSON for the steps as one stack of simple blocks. */
export interface BlockState {
  readonly type: string;
  readonly fields?: Record<string, string | number>;
  readonly inputs?: Record<string, { readonly shadow: BlockState }>;
  readonly next?: { readonly block: BlockState };
}

/** The turn block's angle picker (SHADOW.turn in ./simple-definitions.ts; a test checks). */
export const TURN_SHADOW = 'mp_turn_angle';

export function stepsToBlocks(steps: readonly PathStep[]): BlockState | null {
  let next: BlockState | null = null;
  for (const step of [...steps].reverse()) {
    const block: BlockState =
      step.kind === 'straight'
        ? {
            type: 'mp_move',
            fields: { DIRECTION: 'FORWARD', UNIT: 'MM' },
            inputs: { AMOUNT: { shadow: { type: 'math_number', fields: { NUM: step.mm } } } },
          }
        : {
            type: 'mp_move_turn',
            inputs: { ANGLE: { shadow: { type: TURN_SHADOW, fields: { ANGLE: step.degrees } } } },
          };
    next = next ? { ...block, next: { block: next } } : block;
  }
  return next;
}
