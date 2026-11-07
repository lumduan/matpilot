/**
 * The file a block program is saved in, on this computer or on GitHub (ADR 0011). It is JSON:
 * the program's name, who saved it and when, each tab's Blockly workspace (ADR 0013), and the
 * Python files the blocks made, as lines, so the file can be read on GitHub. Loading uses only
 * the tabs; the Python is made again from the blocks.
 *
 * Version 1 (before tabs) had one `workspace` and the Python as one list of lines; it opens as a
 * program with only the main tab. Version 2 has `tabs` and `python` as a list of files. Version 3
 * adds `robot`, a copy of the robot the program is for (ADR 0016, D4); a program with no robot is
 * still written as version 2, so older MatPilot pages can open it.
 */
import { readRobot, robotData, type RobotProfile } from '../robots/profile';

export const PROGRAM_FILE_FORMAT = 'matpilot-blocks';
/** The newest version this page reads and writes. */
export const PROGRAM_FILE_VERSION = 3;
/** The version written when a program has no robot. */
const VERSION_WITHOUT_ROBOT = 2;

/** The tab the program starts in (./tabs.ts). */
export const MAIN_TAB_NAME = 'main';

/** How many tabs a program may have, main included. */
export const MAX_TABS = 10;
export const PROGRAM_FILE_EXTENSION = '.matpilot.json';
export const PROGRAM_NAME_MAX_LENGTH = 60;
export const DEFAULT_PROGRAM_NAME = 'My program';

/** One tab of a saved program: its name and its blocks. */
export interface ProgramTabState {
  readonly name: string;
  readonly workspace: object;
}

export interface ProgramFile {
  readonly name: string;
  /** Every tab, main first. */
  readonly tabs: readonly ProgramTabState[];
  /** Who saved it, as they typed their name; empty when unknown. */
  readonly savedBy: string;
  /** ISO 8601 time, or empty when unknown. */
  readonly savedAt: string;
  /** The robot the program is for (version 3), or `null`. */
  readonly robot: RobotProfile | null;
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

/** A Python file the blocks made, as the file shows it. */
export interface ProgramPythonFile {
  readonly name: string;
  readonly code: string;
}

const lines = (code: string) => {
  const text = code.replace(/\n$/, '');
  return text === '' ? [] : text.split('\n');
};

export function serializeProgramFile(
  file: ProgramFile & { readonly python: readonly ProgramPythonFile[] },
): string {
  return `${JSON.stringify(
    {
      format: PROGRAM_FILE_FORMAT,
      version: file.robot ? PROGRAM_FILE_VERSION : VERSION_WITHOUT_ROBOT,
      name: cleanProgramName(file.name) || DEFAULT_PROGRAM_NAME,
      savedBy: file.savedBy.trim(),
      savedAt: file.savedAt,
      ...(file.robot ? { robot: robotData(file.robot) } : {}),
      python: file.python.map((each) => ({ file: each.name, lines: lines(each.code) })),
      tabs: file.tabs.map((tab) => ({ name: tab.name, workspace: tab.workspace })),
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
  const tabs = readTabs(data);
  if (typeof tabs === 'string') return { ok: false, message: tabs };
  const name = typeof data.name === 'string' ? cleanProgramName(data.name) : '';
  return {
    ok: true,
    name: name || cleanProgramName(fallbackName) || DEFAULT_PROGRAM_NAME,
    tabs,
    savedBy: typeof data.savedBy === 'string' ? data.savedBy.trim() : '',
    savedAt: typeof data.savedAt === 'string' ? data.savedAt : '',
    robot: readRobot(data.robot),
  };
}

/**
 * The Python files a saved program carries (version 2 and 3; version 1 has one, main.py), so the
 * Mats page can run a program file without a block editor (ADR 0016, step 7c). Empty when the file
 * is not a program or has none.
 */
export function programPythonFiles(text: string): ProgramPythonFile[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!isObject(data) || data.format !== PROGRAM_FILE_FORMAT || !Array.isArray(data.python))
    return [];
  const asLines = (value: unknown) =>
    Array.isArray(value) && value.every((line) => typeof line === 'string')
      ? `${(value as string[]).join('\n')}\n`
      : null;
  if (data.python.every((line) => typeof line === 'string')) {
    const code = asLines(data.python);
    return code ? [{ name: 'main.py', code }] : [];
  }
  const files: ProgramPythonFile[] = [];
  for (const item of data.python as unknown[]) {
    if (!isObject(item) || typeof item.file !== 'string') continue;
    const code = asLines(item.lines);
    if (code !== null) files.push({ name: item.file, code });
  }
  return files;
}

/** The tabs of a parsed file, main first, or what is wrong with them. */
function readTabs(data: Record<string, unknown>): ProgramTabState[] | string {
  const empty = 'This program file has no blocks in it.';
  const damaged = 'The tabs in this program file are damaged, so it cannot be opened.';
  // Version 1: one workspace, which is the main tab.
  if (data.version === 1 || !('tabs' in data)) {
    return isObject(data.workspace) ? [{ name: MAIN_TAB_NAME, workspace: data.workspace }] : empty;
  }
  if (!Array.isArray(data.tabs) || data.tabs.length === 0) return empty;
  if (data.tabs.length > MAX_TABS) return damaged;
  const tabs: ProgramTabState[] = [];
  for (const [index, tab] of (data.tabs as unknown[]).entries()) {
    if (!isObject(tab) || !isObject(tab.workspace) || typeof tab.name !== 'string') return damaged;
    // The first tab is always main, whatever it was called.
    const tabName = index === 0 ? MAIN_TAB_NAME : tab.name;
    if (tabName === '' || tabs.some((other) => other.name === tabName)) return damaged;
    tabs.push({ name: tabName, workspace: tab.workspace });
  }
  return tabs;
}
