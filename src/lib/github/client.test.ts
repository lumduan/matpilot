import { describe, expect, it, vi } from 'vitest';
import { GitHubClient, GitHubError } from './client';

const REPO = { owner: 'robot-team', repo: 'programs' };

interface Reply {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}

/** A fetch that answers with `replies` in order and records every request. */
function fakeFetch(...replies: (Reply | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const reply = replies.shift();
    if (!reply) throw new Error('unexpected request');
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve(
      new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
        status: reply.status,
        headers: reply.headers,
      }),
    );
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

const fileReply = (path: string, text: string, sha = 'sha-1'): Reply => ({
  status: 200,
  body: {
    type: 'file',
    path,
    sha,
    encoding: 'base64',
    content: Buffer.from(text)
      .toString('base64')
      .replace(/(.{60})/g, '$1\n'),
  },
});

describe('GitHubClient requests', () => {
  it('sends the token, the API version, and bypasses the browser cache', async () => {
    const { fetch, calls } = fakeFetch({
      status: 200,
      body: { full_name: 'robot-team/programs', private: true, permissions: { push: true } },
    });
    const client = new GitHubClient({ repository: REPO, token: ' github_pat_x ', fetch });
    await expect(client.getRepository()).resolves.toEqual({
      fullName: 'robot-team/programs',
      private: true,
      canPush: true,
    });
    expect(calls[0]?.url).toBe('https://api.github.com/repos/robot-team/programs');
    expect(calls[0]?.init).toMatchObject({
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: 'Bearer github_pat_x',
      },
    });
  });

  it('sends no Authorization header without a token', async () => {
    const { fetch, calls } = fakeFetch({ status: 200, body: { full_name: 'a/b' } });
    const client = new GitHubClient({ repository: REPO, token: '  ', fetch });
    await expect(client.getRepository()).resolves.toMatchObject({ canPush: null });
    expect(calls[0]?.init.headers).not.toHaveProperty('Authorization');
    expect(client.hasToken).toBe(false);
  });
});

describe('listing and reading', () => {
  it('lists the files of a folder, encoding the path', async () => {
    const { fetch, calls } = fakeFetch({
      status: 200,
      body: [
        {
          type: 'file',
          name: 'a.matpilot.json',
          path: 'team 1/a.matpilot.json',
          sha: 's1',
          size: 10,
        },
        { type: 'dir', name: 'old', path: 'team 1/old', sha: 's2', size: 0 },
      ],
    });
    const client = new GitHubClient({ repository: REPO, token: null, fetch });
    await expect(client.listFolder('team 1')).resolves.toEqual([
      { name: 'a.matpilot.json', path: 'team 1/a.matpilot.json', sha: 's1', size: 10 },
    ]);
    expect(calls[0]?.url).toBe(
      'https://api.github.com/repos/robot-team/programs/contents/team%201',
    );
  });

  it('treats a missing folder as empty when the repository exists', async () => {
    const { fetch } = fakeFetch({ status: 404 }, { status: 200, body: { full_name: 'a/b' } });
    const client = new GitHubClient({ repository: REPO, token: null, fetch });
    await expect(client.listFolder('matpilot')).resolves.toEqual([]);
  });

  it('says when the repository cannot be opened', async () => {
    const { fetch } = fakeFetch({ status: 404 }, { status: 404 });
    const client = new GitHubClient({ repository: REPO, token: 'x', fetch });
    await expect(client.listFolder('matpilot')).rejects.toMatchObject({
      kind: 'not-found',
      message: expect.stringMatching(/no repository robot-team\/programs that this token can open/),
    });
  });

  it('reads a file as UTF-8, or null when it is missing', async () => {
    const { fetch } = fakeFetch(fileReply('m/รถ.matpilot.json', '{"name":"รถ"}'), { status: 404 });
    const client = new GitHubClient({ repository: REPO, token: null, fetch });
    await expect(client.readFile('m/รถ.matpilot.json')).resolves.toEqual({
      path: 'm/รถ.matpilot.json',
      sha: 'sha-1',
      text: '{"name":"รถ"}',
    });
    await expect(client.readFile('m/gone.matpilot.json')).resolves.toBeNull();
  });

  it('refuses a folder where a file is expected, and the reverse', async () => {
    const { fetch } = fakeFetch(
      { status: 200, body: [] },
      { status: 200, body: { type: 'file', path: 'x', sha: 's' } },
    );
    const client = new GitHubClient({ repository: REPO, token: null, fetch });
    await expect(client.readFile('x')).rejects.toMatchObject({ kind: 'invalid' });
    await expect(client.listFolder('x')).rejects.toMatchObject({ kind: 'invalid' });
  });
});

describe('writing', () => {
  it('creates or replaces a file with Base64 content and the sha', async () => {
    const { fetch, calls } = fakeFetch({
      status: 200,
      body: { content: { sha: 'new-sha' }, commit: { html_url: 'https://github.com/c/1' } },
    });
    const client = new GitHubClient({ repository: REPO, token: 'x', fetch });
    await expect(
      client.writeFile({ path: 'm/a b.json', text: 'รถ', message: 'Update a', sha: 'old-sha' }),
    ).resolves.toEqual({ sha: 'new-sha', commitUrl: 'https://github.com/c/1' });
    expect(calls[0]?.url).toBe(
      'https://api.github.com/repos/robot-team/programs/contents/m/a%20b.json',
    );
    expect(calls[0]?.init.method).toBe('PUT');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      message: 'Update a',
      content: Buffer.from('รถ').toString('base64'),
      sha: 'old-sha',
    });
  });

  it('needs a token', async () => {
    const { fetch } = fakeFetch();
    const client = new GitHubClient({ repository: REPO, token: null, fetch });
    await expect(
      client.writeFile({ path: 'a', text: '', message: 'm', sha: null }),
    ).rejects.toMatchObject({ kind: 'token' });
  });
});

describe('errors', () => {
  const cases: [string, Reply | Error, string][] = [
    ['network', new TypeError('Failed to fetch'), 'network'],
    ['401', { status: 401, body: { message: 'Bad credentials' } }, 'token'],
    [
      '403 rate limit',
      { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1800000000' } },
      'rate-limit',
    ],
    ['429', { status: 429 }, 'rate-limit'],
    [
      '403',
      { status: 403, body: { message: 'Resource not accessible by personal access token' } },
      'forbidden',
    ],
    ['409', { status: 409, body: { message: 'x does not match y' } }, 'conflict'],
    [
      '422 sha',
      { status: 422, body: { message: 'Invalid request.\n\n"sha" wasn\'t supplied.' } },
      'conflict',
    ],
    ['422', { status: 422, body: { message: 'path is invalid' } }, 'invalid'],
    ['500', { status: 500 }, 'other'],
  ];
  for (const [label, reply, kind] of cases) {
    it(`maps ${label} to '${kind}'`, async () => {
      const { fetch } = fakeFetch(reply);
      const client = new GitHubClient({ repository: REPO, token: 'x', fetch });
      const error = await client
        .writeFile({ path: 'a', text: '', message: 'm', sha: null })
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(GitHubError);
      expect(error).toMatchObject({ kind });
    });
  }

  it('says when GitHub allows requests again', async () => {
    const { fetch } = fakeFetch({
      status: 403,
      headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1800000000' },
    });
    const client = new GitHubClient({ repository: REPO, token: null, fetch });
    const error = (await client.getRepository().catch((caught: unknown) => caught)) as GitHubError;
    expect(error.retryAt?.toISOString()).toBe('2027-01-15T08:00:00.000Z');
    expect(error.message).toMatch(/without a token/);
  });
});
