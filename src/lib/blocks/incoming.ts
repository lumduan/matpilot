/**
 * Blocks handed to the Blocks page from another page (ADR 0016): a path made on the Mats page,
 * as the simple blocks "move forward/backward … mm", "turn", "wait … seconds" and "set movement
 * speed" (more moves added 2026-11-10). Kept in this browser until the Blocks
 * page adds them to the open tab (./add-to-tab.ts) or they are dismissed: nothing changes in a
 * program unless the child presses Add there.
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
  typeof value === 'number' && Number.isInteger(value) && value !== 0 && Math.abs(value) <= limit;
const within = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** One step read back strictly: anything else refuses the whole hand-over. */
function readStep(step: unknown): PathStep | null {
  if (typeof step !== 'object' || step === null) return null;
  const each = step as Record<string, unknown>;
  if (each.kind === 'turn' && whole(each.degrees, 360)) {
    return { kind: 'turn', degrees: each.degrees };
  }
  if (each.kind === 'straight' && whole(each.mm, 100_000)) {
    return { kind: 'straight', mm: each.mm };
  }
  if (each.kind === 'wait' && within(each.seconds, 0, 600)) {
    return { kind: 'wait', seconds: each.seconds };
  }
  if (each.kind === 'speed' && Number.isInteger(each.percent) && within(each.percent, 0, 100)) {
    return { kind: 'speed', percent: each.percent };
  }
  return null;
}

export function readIncoming(raw: string | null): IncomingBlocks | null {
  if (raw === null) return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (data.from !== 'mats' || !Array.isArray(data.steps)) return null;
    const steps: PathStep[] = [];
    for (const step of (data.steps as unknown[]).slice(0, MAX_INCOMING_STEPS)) {
      const read = readStep(step);
      if (!read) return null;
      steps.push(read);
    }
    if (steps.length === 0) return null;
    const name = typeof data.name === 'string' ? data.name.slice(0, 60) : 'A path';
    return { from: 'mats', name, steps };
  } catch {
    return null;
  }
}

/** What the steps are, for the Blocks page's offer: "moves and turns", "moves, turns and a wait". */
export function describeSteps(steps: readonly PathStep[]): string {
  const count = (kind: PathStep['kind']) => steps.filter((step) => step.kind === kind).length;
  const words = [
    count('straight') > 0 && (count('straight') === 1 ? 'a move' : 'moves'),
    count('turn') > 0 && (count('turn') === 1 ? 'a turn' : 'turns'),
    count('wait') > 0 && (count('wait') === 1 ? 'a wait' : 'waits'),
    count('speed') > 0 && (count('speed') === 1 ? 'a speed' : 'speeds'),
  ].filter((word): word is string => Boolean(word));
  return words.length <= 1
    ? (words[0] ?? '')
    : `${words.slice(0, -1).join(', ')} and ${words.at(-1)!}`;
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
/** The speed block's percentage lever (SHADOW.percent; a test checks). */
export const PERCENT_SHADOW = 'mp_percent';

const numberShadow = (value: number) => ({
  shadow: { type: 'math_number', fields: { NUM: value } },
});

function stepBlock(step: PathStep): BlockState {
  switch (step.kind) {
    case 'straight':
      return {
        type: 'mp_move',
        fields: { DIRECTION: step.mm < 0 ? 'BACKWARD' : 'FORWARD', UNIT: 'MM' },
        inputs: { AMOUNT: numberShadow(Math.abs(step.mm)) },
      };
    case 'turn':
      return {
        type: 'mp_move_turn',
        inputs: { ANGLE: { shadow: { type: TURN_SHADOW, fields: { ANGLE: step.degrees } } } },
      };
    case 'wait':
      return { type: 'mp_wait_seconds', inputs: { SECONDS: numberShadow(step.seconds) } };
    case 'speed':
      return {
        type: 'mp_move_speed',
        inputs: { SPEED: { shadow: { type: PERCENT_SHADOW, fields: { PERCENT: step.percent } } } },
      };
  }
}

export function stepsToBlocks(steps: readonly PathStep[]): BlockState | null {
  let next: BlockState | null = null;
  for (const step of [...steps].reverse()) {
    const block = stepBlock(step);
    next = next ? { ...block, next: { block: next } } : block;
  }
  return next;
}
