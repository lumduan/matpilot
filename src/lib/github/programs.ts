/**
 * Block programs in a GitHub folder (ADR 0011): list them, and save one without silently
 * replacing a teammate's newer version.
 */
import {
  isProgramFileName,
  programNameFromFileName,
  PROGRAM_NAME_MAX_LENGTH,
} from '../blocks/program-file';
import { GitHubError, type GitHubClient } from './client';

export interface RemoteProgram {
  readonly name: string;
  readonly path: string;
  readonly sha: string;
  readonly size: number;
}

/** The programs in `folder`, by name. */
export async function listPrograms(client: GitHubClient, folder: string): Promise<RemoteProgram[]> {
  const entries = await client.listFolder(folder);
  return entries
    .filter((entry) => isProgramFileName(entry.name))
    .map((entry) => ({
      name: programNameFromFileName(entry.name),
      path: entry.path,
      sha: entry.sha,
      size: entry.size,
    }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
    );
}

export type SaveOutcome =
  | {
      readonly kind: 'saved';
      readonly sha: string;
      readonly commitUrl: string | null;
      readonly created: boolean;
    }
  | {
      readonly kind: 'conflict';
      /** 'exists': a file with this name is there already; 'changed': it changed since it was opened. */
      readonly reason: 'exists' | 'changed';
    };

/**
 * Saves `text` at `path`. The file there is replaced only when it is the version this program
 * was opened from or last saved as (`expectedSha`), or when `replace` is set after the user
 * agreed to it; otherwise the outcome is a conflict and nothing is written.
 */
export async function saveProgram(
  client: GitHubClient,
  args: {
    readonly path: string;
    readonly text: string;
    /** The commit message, given whether the file is new. */
    readonly message: (created: boolean) => string;
    readonly expectedSha: string | null;
    readonly replace: boolean;
  },
): Promise<SaveOutcome> {
  const current = await client.readFile(args.path);
  if (current && !args.replace && current.sha !== args.expectedSha) {
    return { kind: 'conflict', reason: args.expectedSha ? 'changed' : 'exists' };
  }
  try {
    const saved = await client.writeFile({
      path: args.path,
      text: args.text,
      message: args.message(current === null),
      sha: current?.sha ?? null,
    });
    return { kind: 'saved', ...saved, created: current === null };
  } catch (error) {
    // Someone saved between our read and our write.
    if (error instanceof GitHubError && error.kind === 'conflict') {
      return { kind: 'conflict', reason: 'changed' };
    }
    throw error;
  }
}

/** The commit message: the user's note, or "Add/Update <name>", and who saved it. */
export function commitMessage(args: {
  readonly name: string;
  readonly created: boolean;
  readonly note: string;
  readonly author: string;
}): string {
  const note = args.note.replace(/\s+/g, ' ').trim();
  const author = args.author.replace(/\s+/g, ' ').trim();
  const subject = note || `${args.created ? 'Add' : 'Update'} ${args.name}`;
  return `${subject}${author ? ` (saved by ${author})` : ''}\n\nSaved from MatPilot.`;
}

/** `name 2`, `name 3`, ...: the first that is not taken (names compare without case). */
export function nextFreeName(name: string, taken: readonly string[]): string {
  const used = new Set(taken.map((existing) => existing.toLowerCase()));
  const base = name.replace(/ \d+$/, '');
  for (let number = 2; ; number += 1) {
    const suffix = ` ${number}`;
    const candidate = `${base.slice(0, PROGRAM_NAME_MAX_LENGTH - suffix.length).trim()}${suffix}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}
