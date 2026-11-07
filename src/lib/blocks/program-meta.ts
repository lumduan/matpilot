/**
 * The open program's name, the GitHub file it was opened from or saved to (ADR 0011), and the
 * robot it is for (ADR 0016, D4). Opening a program changes the blocks and these together;
 * putting the old program back (./editor.ts, `undoProgramChange`) puts back its name, GitHub file
 * and robot too (ADR 0013), so your blocks never keep another program's GitHub file.
 */
import { readRobot, robotData, sameRobot, type RobotProfile } from '../robots/profile';
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
  /** A copy of the robot the program is for, or `null`: the blocks set the drive base. */
  readonly robot: RobotProfile | null;
}

export const NEW_PROGRAM_META: ProgramMeta = {
  name: DEFAULT_PROGRAM_NAME,
  github: null,
  robot: null,
};

/** The meta as plain data, for storage. */
export const programMetaData = (meta: ProgramMeta) => ({
  name: meta.name,
  github: meta.github,
  robot: meta.robot ? robotData(meta.robot) : null,
});

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
  return { name: name || DEFAULT_PROGRAM_NAME, github, robot: readRobot(value.robot) };
}

export const sameMeta = (a: ProgramMeta, b: ProgramMeta) =>
  a.name === b.name &&
  a.github?.repository === b.github?.repository &&
  a.github?.path === b.github?.path &&
  a.github?.sha === b.github?.sha &&
  sameRobot(a.robot, b.robot);
