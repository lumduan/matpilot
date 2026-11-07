import { describe, expect, it } from 'vitest';
import { newRobot } from '../robots/profile';
import {
  NEW_PROGRAM_META,
  parseProgramMeta,
  programMetaData,
  sameMeta,
  type ProgramMeta,
} from './program-meta';

const TEAM_META: ProgramMeta = {
  name: 'Team car',
  github: { repository: 'robot-team/programs', path: 'matpilot/Team car.matpilot.json', sha: 's1' },
  robot: null,
};

describe('parseProgramMeta', () => {
  it('reads stored meta and falls back to a new program', () => {
    expect(parseProgramMeta(JSON.parse(JSON.stringify(TEAM_META)))).toEqual(TEAM_META);
    expect(parseProgramMeta({ name: '  ', github: { path: 1 } })).toEqual(NEW_PROGRAM_META);
    expect(parseProgramMeta(null)).toEqual(NEW_PROGRAM_META);
  });

  it('compares the name and every part of the GitHub file', () => {
    expect(sameMeta(TEAM_META, { ...TEAM_META })).toBe(true);
    expect(sameMeta(TEAM_META, { ...TEAM_META, name: 'Other' })).toBe(false);
    expect(sameMeta(TEAM_META, { ...TEAM_META, github: { ...TEAM_META.github!, sha: 's2' } })).toBe(
      false,
    );
    expect(sameMeta(TEAM_META, NEW_PROGRAM_META)).toBe(false);
  });

  it('keeps and compares the program’s robot (ADR 0016)', () => {
    const robot = { ...newRobot('Rover'), id: 'r-1' };
    const withRobot = { ...TEAM_META, robot };
    expect(parseProgramMeta(JSON.parse(JSON.stringify(programMetaData(withRobot))))).toEqual(
      withRobot,
    );
    expect(sameMeta(withRobot, { ...withRobot, robot: { ...robot } })).toBe(true);
    expect(
      sameMeta(withRobot, {
        ...withRobot,
        robot: { ...robot, wheels: { ...robot.wheels, diameterMm: 62 } },
      }),
    ).toBe(false);
    expect(sameMeta(withRobot, TEAM_META)).toBe(false);
  });
});
