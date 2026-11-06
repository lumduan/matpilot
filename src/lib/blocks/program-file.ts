/**
 * The file a block program is saved in, on this computer or on GitHub (ADR 0011). It is JSON:
 * the Blockly workspace, the program's name, who saved it and when, and the Python the blocks
 * made, as lines, so the file can be read on GitHub. Loading uses only the workspace; the Python
 * is made again from the blocks.
 */

export const PROGRAM_FILE_FORMAT = 'matpilot-blocks';
export const PROGRAM_FILE_VERSION = 1;
export const PROGRAM_FILE_EXTENSION = '.matpilot.json';
export const PROGRAM_NAME_MAX_LENGTH = 60;
export const DEFAULT_PROGRAM_NAME = 'My program';

export interface ProgramFile {
  readonly name: string;
  readonly workspace: object;
  /** Who saved it, as they typed their name; empty when unknown. */
  readonly savedBy: string;
  /** ISO 8601 time, or empty when unknown. */
  readonly savedAt: string;
}

export type ParsedProgramFile =
  ({ readonly ok: true } & ProgramFile) | { readonly ok: false; readonly message: string };

/**
 * A name that is safe as a file name on every system and on GitHub: no path separators,
 * characters Windows refuses, or control characters; no leading dots; at most
 * PROGRAM_NAME_MAX_LENGTH characters. Letters in any script (Thai too) and spaces stay.
 */
export function cleanProgramName(name: string): string {
  const cleaned = Array.from(
    name
      .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+/, '')
      .trim(),
  )
    .slice(0, PROGRAM_NAME_MAX_LENGTH)
    .join('')
    .trim();
  return cleaned;
}

/** `Robot car` → `Robot car.matpilot.json`. */
export function programFileName(name: string): string {
  return `${cleanProgramName(name) || DEFAULT_PROGRAM_NAME}${PROGRAM_FILE_EXTENSION}`;
}

export function isProgramFileName(fileName: string): boolean {
  return (
    fileName.toLowerCase().endsWith(PROGRAM_FILE_EXTENSION) &&
    fileName.length > PROGRAM_FILE_EXTENSION.length
  );
}

/** `Robot car.matpilot.json` → `Robot car`; other names lose their last extension. */
export function programNameFromFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const stem = isProgramFileName(base)
    ? base.slice(0, -PROGRAM_FILE_EXTENSION.length)
    : base.replace(/\.[^.]*$/, '');
  return cleanProgramName(stem) || DEFAULT_PROGRAM_NAME;
}

export function serializeProgramFile(file: ProgramFile & { readonly python: string }): string {
  const python = file.python.replace(/\n$/, '');
  return `${JSON.stringify(
    {
      format: PROGRAM_FILE_FORMAT,
      version: PROGRAM_FILE_VERSION,
      name: cleanProgramName(file.name) || DEFAULT_PROGRAM_NAME,
      savedBy: file.savedBy.trim(),
      savedAt: file.savedAt,
      python: python === '' ? [] : python.split('\n'),
      workspace: file.workspace,
    },
    null,
    2,
  )}\n`;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Reads a saved program. `fallbackName` names it when the file does not (the file name, without
 * its extension). Blocks are checked when they are loaded into the editor, not here.
 */
export function parseProgramFile(text: string, fallbackName: string): ParsedProgramFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, message: 'This file is not a MatPilot program (it is not JSON).' };
  }
  if (!isObject(data) || data.format !== PROGRAM_FILE_FORMAT) {
    return { ok: false, message: 'This file is not a MatPilot block program.' };
  }
  if (typeof data.version !== 'number' || data.version > PROGRAM_FILE_VERSION) {
    return {
      ok: false,
      message:
        'This program was saved by a newer MatPilot. Reload the page to update, then try again.',
    };
  }
  if (!isObject(data.workspace)) {
    return { ok: false, message: 'This program file has no blocks in it.' };
  }
  const name = typeof data.name === 'string' ? cleanProgramName(data.name) : '';
  return {
    ok: true,
    name: name || cleanProgramName(fallbackName) || DEFAULT_PROGRAM_NAME,
    workspace: data.workspace,
    savedBy: typeof data.savedBy === 'string' ? data.savedBy.trim() : '',
    savedAt: typeof data.savedAt === 'string' ? data.savedAt : '',
  };
}
