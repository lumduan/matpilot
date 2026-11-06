import { describe, expect, it } from 'vitest';
import {
  cleanFolder,
  folderUrl,
  historyUrl,
  joinPath,
  newTokenUrl,
  parseRepository,
} from './repository';

describe('parseRepository', () => {
  it('reads owner/repo, links and SSH addresses', () => {
    const expected = { owner: 'robot-team', repo: 'programs' };
    for (const input of [
      'robot-team/programs',
      ' robot-team/programs ',
      'https://github.com/robot-team/programs',
      'https://github.com/robot-team/programs.git',
      'github.com/robot-team/programs/tree/main/matpilot',
      'http://www.github.com/robot-team/programs?tab=readme',
      'git@github.com:robot-team/programs.git',
    ]) {
      expect(parseRepository(input), input).toEqual(expected);
    }
    expect(parseRepository('lumduan/my.repo_1')).toEqual({ owner: 'lumduan', repo: 'my.repo_1' });
  });

  it('refuses what cannot be a repository', () => {
    for (const input of [
      '',
      'robot-team',
      '-team/x',
      'team-/x',
      'te--am/x',
      'a/..',
      'a b/c',
      'a/b c',
    ]) {
      expect(parseRepository(input), input).toBeNull();
    }
  });
});

describe('folders and links', () => {
  it('cleans folder paths and refuses unsafe ones', () => {
    expect(cleanFolder(' matpilot ')).toBe('matpilot');
    expect(cleanFolder('/team/robot 1/')).toBe('team/robot 1');
    expect(cleanFolder('')).toBe('');
    expect(cleanFolder('a/../b')).toBeNull();
    expect(cleanFolder('./a')).toBeNull();
    expect(cleanFolder('a\\b')).toBeNull();
    expect(joinPath('', 'x.json')).toBe('x.json');
    expect(joinPath('a/b', 'x.json')).toBe('a/b/x.json');
  });

  it('links to the folder, a file history and a prefilled token page', () => {
    const name = { owner: 'robot-team', repo: 'programs' };
    expect(folderUrl(name, '')).toBe('https://github.com/robot-team/programs');
    expect(folderUrl(name, 'team/robot 1')).toBe(
      'https://github.com/robot-team/programs/tree/HEAD/team/robot%201',
    );
    expect(historyUrl(name, 'matpilot/รถ.matpilot.json')).toBe(
      'https://github.com/robot-team/programs/commits/HEAD/matpilot/%E0%B8%A3%E0%B8%96.matpilot.json',
    );
    const url = new URL(newTokenUrl('robot-team'));
    expect(url.origin + url.pathname).toBe(
      'https://github.com/settings/personal-access-tokens/new',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      name: 'MatPilot',
      description: 'Save and load MatPilot block programs',
      target_name: 'robot-team',
      expires_in: '366',
      contents: 'write',
    });
    expect(new URL(newTokenUrl(null)).searchParams.has('target_name')).toBe(false);
  });
});
