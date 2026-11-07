/**
 * MatPilot's files in the team's GitHub folder (ADR 0011, extended by ADR 0016): block programs,
 * robots and mats, side by side in the one folder set up for programs, told apart by their
 * endings. Listing and saving work the same for each; saving never silently replaces a
 * teammate's newer version (./programs.ts, saveProgram).
 */
import type { GitHubClient } from './client';

export interface FileKind {
  /** `.matpilot-robot.json`. */
  readonly extension: string;
  /** For messages: "robot". */
  readonly noun: string;
}

export const ROBOT_FILES: FileKind = { extension: '.matpilot-robot.json', noun: 'robot' };
export const MAT_FILES: FileKind = { extension: '.matpilot-mat.json', noun: 'mat' };

export interface RemoteEntry {
  /** The file's name without its ending. */
  readonly name: string;
  readonly path: string;
  readonly sha: string;
  readonly size: number;
}

export const hasEnding = (fileName: string, kind: FileKind) =>
  fileName.toLowerCase().endsWith(kind.extension) && fileName.length > kind.extension.length;

/** The files of this kind in `folder`, by name. */
export async function listFiles(
  client: GitHubClient,
  folder: string,
  kind: FileKind,
): Promise<RemoteEntry[]> {
  const entries = await client.listFolder(folder);
  return entries
    .filter((entry) => hasEnding(entry.name, kind))
    .map((entry) => ({
      name: entry.name.slice(0, -kind.extension.length),
      path: entry.path,
      sha: entry.sha,
      size: entry.size,
    }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
    );
}
