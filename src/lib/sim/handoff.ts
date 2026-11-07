/**
 * The Blocks page's program, handed to the Mats page (ADR 0016, step 7c): its Python files as the
 * generator last made them, its name, its robot's id and how many problems it has. Kept in this
 * browser; the Mats page runs these files, so it needs no block editor of its own.
 */
import type { SimFile } from './runner';

export const HANDOFF_KEY = 'matpilot.blocks.python.v1';

export interface ProgramHandoff {
  readonly name: string;
  readonly files: readonly SimFile[];
  /** Problems the blocks still have: such a program does not run on the hub either. */
  readonly problems: number;
  /** The id of the program's robot, or `null`. */
  readonly robotId: string | null;
}

export function readHandoff(raw: string | null): ProgramHandoff | null {
  if (raw === null) return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!Array.isArray(data.files)) return null;
    const files = (data.files as unknown[])
      .filter(
        (file): file is SimFile =>
          typeof file === 'object' &&
          file !== null &&
          typeof (file as SimFile).name === 'string' &&
          typeof (file as SimFile).code === 'string',
      )
      .map((file) => ({ name: file.name, code: file.code }));
    if (!files.some((file) => file.name === 'main.py')) return null;
    return {
      name: typeof data.name === 'string' ? data.name : 'My program',
      files,
      problems: typeof data.problems === 'number' ? data.problems : 0,
      robotId: typeof data.robotId === 'string' ? data.robotId : null,
    };
  } catch {
    return null;
  }
}
