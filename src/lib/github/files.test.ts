import { describe, expect, it } from 'vitest';
import { GitHubClient } from './client';
import { MAT_FILES, ROBOT_FILES, hasEnding, listFiles } from './files';

describe('MatPilot files on GitHub', () => {
  it('tells programs, robots and mats apart by their endings', () => {
    expect(hasEnding('Rover.matpilot-robot.json', ROBOT_FILES)).toBe(true);
    expect(hasEnding('Rover.matpilot.json', ROBOT_FILES)).toBe(false);
    expect(hasEnding('WRO.matpilot-mat.json', MAT_FILES)).toBe(true);
    expect(hasEnding('.matpilot-mat.json', MAT_FILES)).toBe(false);
  });

  it('lists only the files of one kind, by name', async () => {
    const fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify([
            {
              type: 'file',
              name: 'Zed.matpilot-robot.json',
              path: 'm/Zed.matpilot-robot.json',
              sha: '1',
              size: 900,
            },
            {
              type: 'file',
              name: 'car.matpilot.json',
              path: 'm/car.matpilot.json',
              sha: '2',
              size: 100,
            },
            {
              type: 'file',
              name: 'Ant.matpilot-robot.json',
              path: 'm/Ant.matpilot-robot.json',
              sha: '3',
              size: 800,
            },
            {
              type: 'dir',
              name: 'x.matpilot-robot.json',
              path: 'm/x.matpilot-robot.json',
              sha: '4',
              size: 0,
            },
          ]),
          { status: 200 },
        ),
      )) as unknown as typeof globalThis.fetch;
    const client = new GitHubClient({ repository: { owner: 'o', repo: 'r' }, token: null, fetch });
    expect(await listFiles(client, 'm', ROBOT_FILES)).toEqual([
      { name: 'Ant', path: 'm/Ant.matpilot-robot.json', sha: '3', size: 800 },
      { name: 'Zed', path: 'm/Zed.matpilot-robot.json', sha: '1', size: 900 },
    ]);
  });
});
