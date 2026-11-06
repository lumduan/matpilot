/**
 * The open program's name, and the GitHub file it was opened from or saved to (ADR 0011). Opening
 * a program or starting over changes the blocks and these together, as one step that Undo
 * reverses, so Undo never leaves another program's GitHub file attached to your blocks.
 */
import * as Blockly from 'blockly/core';
import { DEFAULT_PROGRAM_NAME, cleanProgramName } from './program-file';

export interface GitHubLink {
  /** `owner/repo`, as the user typed it. */
  readonly repository: string;
  readonly path: string;
  /** The file's blob sha when it was opened or last saved. */
  readonly sha: string;
}

export interface ProgramMeta {
  readonly name: string;
  readonly github: GitHubLink | null;
}

export const NEW_PROGRAM_META: ProgramMeta = { name: DEFAULT_PROGRAM_NAME, github: null };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads stored meta; anything unexpected gives a new program's. */
export function parseProgramMeta(value: unknown): ProgramMeta {
  if (!isObject(value)) return NEW_PROGRAM_META;
  const name = typeof value.name === 'string' ? cleanProgramName(value.name) : '';
  const link = isObject(value.github) ? value.github : null;
  const github =
    link &&
    typeof link.repository === 'string' &&
    typeof link.path === 'string' &&
    typeof link.sha === 'string'
      ? { repository: link.repository, path: link.path, sha: link.sha }
      : null;
  return { name: name || DEFAULT_PROGRAM_NAME, github };
}

export const sameMeta = (a: ProgramMeta, b: ProgramMeta) =>
  a.name === b.name &&
  a.github?.repository === b.github?.repository &&
  a.github?.path === b.github?.path &&
  a.github?.sha === b.github?.sha;

export const META_EVENT_TYPE = 'mp_program_meta';

/**
 * A Blockly event that changes the program's meta, so it sits in the undo stack beside the block
 * changes of the same step. Blockly runs it backwards on Undo and forwards on Redo.
 */
export class ProgramMetaChange extends Blockly.Events.Abstract {
  override isBlank = false;
  override type = META_EVENT_TYPE;

  constructor(
    workspace: Blockly.Workspace,
    readonly before: ProgramMeta,
    readonly after: ProgramMeta,
    private readonly apply: (meta: ProgramMeta) => void,
  ) {
    super();
    this.workspaceId = workspace.id;
  }

  override isNull(): boolean {
    return sameMeta(this.before, this.after);
  }

  override run(forward: boolean): void {
    this.apply(forward ? this.after : this.before);
  }
}

/**
 * Replaces the blocks with `state` and the meta with `meta`, as one undoable step. The state is
 * first loaded into a scratch workspace, so a file with unknown blocks changes nothing and
 * throws instead.
 */
export function replaceProgram(
  workspace: Blockly.Workspace,
  state: object,
  meta: { readonly before: ProgramMeta; readonly after: ProgramMeta },
  apply: (meta: ProgramMeta) => void,
  finish: (workspace: Blockly.Workspace) => void,
): void {
  const scratch = new Blockly.Workspace();
  const wasEnabled = Blockly.Events.isEnabled();
  if (wasEnabled) Blockly.Events.disable();
  try {
    Blockly.serialization.workspaces.load(state, scratch);
  } finally {
    if (wasEnabled) Blockly.Events.enable();
    scratch.dispose();
  }

  const outerGroup = Blockly.Events.getGroup();
  if (!outerGroup) Blockly.Events.setGroup(true);
  try {
    Blockly.Events.fire(new ProgramMetaChange(workspace, meta.before, meta.after, apply));
    apply(meta.after);
    Blockly.serialization.workspaces.load(state, workspace, { recordUndo: true });
    finish(workspace);
  } finally {
    if (!outerGroup) Blockly.Events.setGroup(false);
  }
}
