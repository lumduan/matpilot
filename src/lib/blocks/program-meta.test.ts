import * as Blockly from 'blockly/core';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  NEW_PROGRAM_META,
  parseProgramMeta,
  replaceProgram,
  type ProgramMeta,
} from './program-meta';
import { ensureRequiredBlocks, loadWorkspace, registerBlocks } from './register';
import { STARTER_WORKSPACE } from './starter';

/** Blockly fires events after the current task. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const OTHER_PROGRAM = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: 'mp_program',
        x: 24,
        y: 24,
        next: { block: { type: 'mp_move_stop' } },
      },
    ],
  },
};

const TEAM_META: ProgramMeta = {
  name: 'Team car',
  github: { repository: 'robot-team/programs', path: 'matpilot/Team car.matpilot.json', sha: 's1' },
};

const types = (workspace: Blockly.Workspace) =>
  workspace
    .getAllBlocks(true)
    .map((block) => block.type)
    .filter((type) => !type.startsWith('math_'));

function setUp() {
  const workspace = new Blockly.Workspace();
  Blockly.Events.disable();
  loadWorkspace(workspace, STARTER_WORKSPACE);
  Blockly.Events.enable();
  let meta = NEW_PROGRAM_META;
  const apply = (next: ProgramMeta) => {
    meta = next;
  };
  const open = (state: object, next: ProgramMeta) =>
    replaceProgram(workspace, state, { before: meta, after: next }, apply, (ws) =>
      ensureRequiredBlocks(ws, { recordUndo: true }),
    );
  return { workspace, open, meta: () => meta };
}

beforeAll(() => registerBlocks());

describe('opening a program', () => {
  it('replaces the blocks and the meta as one step that Undo and Redo reverse', async () => {
    const { workspace, open, meta } = setUp();
    const starter = types(workspace);
    expect(workspace.getUndoStack()).toHaveLength(0);

    open(OTHER_PROGRAM, TEAM_META);
    await flush();
    expect(types(workspace)).toEqual(['mp_program', 'mp_move_stop']);
    expect(meta()).toEqual(TEAM_META);

    workspace.undo(false);
    await flush();
    expect(types(workspace)).toEqual(starter);
    expect(meta()).toEqual(NEW_PROGRAM_META);
    expect(workspace.getUndoStack()).toHaveLength(0);

    workspace.undo(true);
    await flush();
    expect(types(workspace)).toEqual(['mp_program', 'mp_move_stop']);
    expect(meta()).toEqual(TEAM_META);
    workspace.dispose();
  });

  it('adds the program block, undoably, when a file has none', async () => {
    const { workspace, open } = setUp();
    open(
      { blocks: { languageVersion: 0, blocks: [{ type: 'mp_move_stop', x: 0, y: 0 }] } },
      TEAM_META,
    );
    await flush();
    expect(types(workspace).sort()).toEqual(['mp_move_stop', 'mp_program']);
    workspace.undo(false);
    await flush();
    expect(workspace.getBlocksByType('mp_program', false)).toHaveLength(1);
    expect(types(workspace)).not.toContain('mp_move_stop');
    workspace.dispose();
  });

  it('changes nothing when the blocks cannot be loaded', async () => {
    const { workspace, open, meta } = setUp();
    const before = types(workspace);
    expect(() =>
      open({ blocks: { languageVersion: 0, blocks: [{ type: 'no_such_block' }] } }, TEAM_META),
    ).toThrow();
    await flush();
    expect(types(workspace)).toEqual(before);
    expect(meta()).toEqual(NEW_PROGRAM_META);
    expect(workspace.getUndoStack()).toHaveLength(0);
    workspace.dispose();
  });
});

describe('parseProgramMeta', () => {
  it('reads stored meta and falls back to a new program', () => {
    expect(parseProgramMeta(JSON.parse(JSON.stringify(TEAM_META)))).toEqual(TEAM_META);
    expect(parseProgramMeta({ name: '  ', github: { path: 1 } })).toEqual(NEW_PROGRAM_META);
    expect(parseProgramMeta(null)).toEqual(NEW_PROGRAM_META);
  });
});
