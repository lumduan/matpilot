import { describe, expect, it, vi } from 'vitest';
import { GitHubClient, GitHubError } from './client';
import { commitMessage, listPrograms, nextFreeName, saveProgram } from './programs';

function clientWith(overrides: Partial<Record<'listFolder' | 'readFile' | 'writeFile', unknown>>) {
  const client = new GitHubClient({
    repository: { owner: 'o', repo: 'r' },
    token: 'x',
    fetch: () => Promise.reject(new Error('no network in tests')),
  });
  return Object.assign(client, overrides);
}

const message = (created: boolean) => (created ? 'Add' : 'Update');

describe('listPrograms', () => {
  it('keeps program files, named and sorted like people sort', async () => {
    const client = clientWith({
      listFolder: vi.fn().mockResolvedValue([
        { name: 'robot 10.matpilot.json', path: 'm/robot 10.matpilot.json', sha: 'a', size: 3 },
        { name: 'README.md', path: 'm/README.md', sha: 'b', size: 1 },
        { name: 'Robot 9.matpilot.json', path: 'm/Robot 9.matpilot.json', sha: 'c', size: 2 },
        { name: 'arm.matpilot.json', path: 'm/arm.matpilot.json', sha: 'd', size: 1 },
      ]),
    });
    expect((await listPrograms(client, 'm')).map((p) => p.name)).toEqual([
      'arm',
      'Robot 9',
      'robot 10',
    ]);
  });
});

describe('saveProgram', () => {
  const base = { path: 'm/a.matpilot.json', text: '{}', message, replace: false };

  it('creates a new file', async () => {
    const writeFile = vi.fn().mockResolvedValue({ sha: 'new', commitUrl: 'u' });
    const client = clientWith({ readFile: vi.fn().mockResolvedValue(null), writeFile });
    await expect(saveProgram(client, { ...base, expectedSha: null })).resolves.toEqual({
      kind: 'saved',
      sha: 'new',
      commitUrl: 'u',
      created: true,
    });
    expect(writeFile).toHaveBeenCalledWith({
      path: base.path,
      text: '{}',
      message: 'Add',
      sha: null,
    });
  });

  it('replaces the version it was opened from', async () => {
    const writeFile = vi.fn().mockResolvedValue({ sha: 'new', commitUrl: null });
    const client = clientWith({
      readFile: vi.fn().mockResolvedValue({ path: base.path, sha: 'mine', text: '' }),
      writeFile,
    });
    await expect(saveProgram(client, { ...base, expectedSha: 'mine' })).resolves.toMatchObject({
      kind: 'saved',
      created: false,
    });
    expect(writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ sha: 'mine', message: 'Update' }),
    );
  });

  it('does not replace a file with the same name, or a teammate’s newer version', async () => {
    const writeFile = vi.fn();
    const client = clientWith({
      readFile: vi.fn().mockResolvedValue({ path: base.path, sha: 'theirs', text: '' }),
      writeFile,
    });
    await expect(saveProgram(client, { ...base, expectedSha: null })).resolves.toEqual({
      kind: 'conflict',
      reason: 'exists',
    });
    await expect(saveProgram(client, { ...base, expectedSha: 'mine' })).resolves.toEqual({
      kind: 'conflict',
      reason: 'changed',
    });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('replaces it when the user agreed', async () => {
    const writeFile = vi.fn().mockResolvedValue({ sha: 'new', commitUrl: null });
    const client = clientWith({
      readFile: vi.fn().mockResolvedValue({ path: base.path, sha: 'theirs', text: '' }),
      writeFile,
    });
    await saveProgram(client, { ...base, expectedSha: 'mine', replace: true });
    expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({ sha: 'theirs' }));
  });

  it('reports a save that raced another as a conflict', async () => {
    const client = clientWith({
      readFile: vi.fn().mockResolvedValue(null),
      writeFile: vi.fn().mockRejectedValue(new GitHubError('conflict', 'x', 422)),
    });
    await expect(saveProgram(client, { ...base, expectedSha: null })).resolves.toEqual({
      kind: 'conflict',
      reason: 'changed',
    });
  });

  it('passes other errors on', async () => {
    const client = clientWith({
      readFile: vi.fn().mockRejectedValue(new GitHubError('token', 'bad token', 401)),
    });
    await expect(saveProgram(client, { ...base, expectedSha: null })).rejects.toMatchObject({
      kind: 'token',
    });
  });
});

describe('commit messages and names', () => {
  it('uses the note, or Add/Update, and who saved it', () => {
    expect(commitMessage({ name: 'Car', created: true, note: '', author: '' })).toBe(
      'Add Car\n\nSaved from MatPilot.',
    );
    expect(
      commitMessage({ name: 'Car', created: false, note: ' faster\nturns ', author: ' Ploy ' }),
    ).toBe('faster turns (saved by Ploy)\n\nSaved from MatPilot.');
  });

  it('finds the next free name', () => {
    expect(nextFreeName('Car', ['car', 'Car 2'])).toBe('Car 3');
    expect(nextFreeName('Car 2', ['Car', 'Car 2'])).toBe('Car 3');
    expect(nextFreeName('x'.repeat(60), [])).toBe(`${'x'.repeat(58)} 2`);
  });
});
