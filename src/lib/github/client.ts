/**
 * The few GitHub REST API calls MatPilot makes to save and load programs (ADR 0011): read a
 * repository, list a folder, read a file, and create or update a file. Requests go to
 * https://api.github.com only, only when the user asks, and carry the user's own token.
 *
 * API reference: https://docs.github.com/en/rest/repos/repos#get-a-repository and
 * https://docs.github.com/en/rest/repos/contents (get repository content; create or update file
 * contents: `sha` is required to replace a file; 409 is a conflict). The API allows requests from
 * any origin (`Access-Control-Allow-Origin: *`, checked 2026-11-06). Its GET responses may be
 * cached for 60 s, so every request bypasses the browser's cache.
 */
import { decodeBase64Utf8, encodeBase64Utf8 } from './base64';
import { repositoryLabel, type RepositoryName } from './repository';

export const GITHUB_API = 'https://api.github.com';
export const GITHUB_API_VERSION = '2022-11-28';

export type GitHubErrorKind =
  'network' | 'token' | 'not-found' | 'forbidden' | 'rate-limit' | 'conflict' | 'invalid' | 'other';

export class GitHubError extends Error {
  constructor(
    readonly kind: GitHubErrorKind,
    message: string,
    readonly status: number | null = null,
    /** For 'rate-limit': when GitHub allows requests again. */
    readonly retryAt: Date | null = null,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

export interface RepositoryInfo {
  readonly fullName: string;
  readonly private: boolean;
  /** Whether the token's owner may push; `null` without a token. */
  readonly canPush: boolean | null;
}

export interface FolderEntry {
  readonly name: string;
  readonly path: string;
  readonly sha: string;
  readonly size: number;
}

export interface RemoteFile {
  readonly path: string;
  readonly sha: string;
  readonly text: string;
}

export interface SavedFile {
  readonly sha: string;
  readonly commitUrl: string | null;
}

export interface GitHubClientOptions {
  readonly repository: RepositoryName;
  /** A personal access token, or `null` to read public repositories only. */
  readonly token: string | null;
  readonly fetch?: typeof fetch;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

export class GitHubClient {
  readonly repository: RepositoryName;
  private readonly token: string | null;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GitHubClientOptions) {
    this.repository = options.repository;
    this.token = options.token?.trim() || null;
    // Bound, so a mock or the browser's fetch is called with the right `this`.
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  get hasToken(): boolean {
    return this.token !== null;
  }

  private get base(): string {
    const { owner, repo } = this.repository;
    return `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  }

  private async request(
    method: 'GET' | 'PUT',
    url: string,
    body?: object,
  ): Promise<{ status: number; data: unknown; headers: Headers }> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (body) headers['Content-Type'] = 'application/json';
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch {
      throw new GitHubError('network', 'Could not reach GitHub. Check the internet connection.');
    }
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      // Some errors have no JSON body.
    }
    if (!response.ok) throw this.errorFor(response, data);
    return { status: response.status, data, headers: response.headers };
  }

  private errorFor(response: Response, data: unknown): GitHubError {
    const { status } = response;
    const said = isObject(data) && typeof data.message === 'string' ? data.message : '';
    const remaining = response.headers.get('x-ratelimit-remaining');
    const reset = Number(response.headers.get('x-ratelimit-reset'));
    if (status === 429 || (status === 403 && remaining === '0')) {
      const retryAt = Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000) : null;
      return new GitHubError(
        'rate-limit',
        this.token
          ? 'GitHub says too many requests were made. Wait a little and try again.'
          : 'GitHub allows only a few requests without a token. Add a token, or wait and try again.',
        status,
        retryAt,
      );
    }
    if (status === 401) {
      return new GitHubError(
        'token',
        'GitHub did not accept the token. It may be mistyped or expired: make a new one.',
        status,
      );
    }
    if (status === 403) {
      return new GitHubError(
        'forbidden',
        this.token
          ? 'The token is not allowed to do this. It needs “Contents: Read and write” for this repository.'
          : 'GitHub needs a token for this.',
        status,
      );
    }
    if (status === 404) {
      return new GitHubError('not-found', 'Not found on GitHub.', status);
    }
    if (status === 409 || (status === 422 && /\bsha\b/i.test(said))) {
      return new GitHubError(
        'conflict',
        'Someone else changed this file on GitHub at the same time.',
        status,
      );
    }
    if (status === 422) {
      return new GitHubError(
        'invalid',
        `GitHub did not accept this: ${said || 'invalid request'}.`,
        status,
      );
    }
    return new GitHubError(
      'other',
      `GitHub answered with an error (${status}${said ? `: ${said}` : ''}).`,
      status,
    );
  }

  /** The repository, to check its name and the token. */
  async getRepository(): Promise<RepositoryInfo> {
    try {
      const { data } = await this.request('GET', this.base);
      if (!isObject(data)) throw new GitHubError('other', 'GitHub sent an unexpected answer.');
      const permissions = isObject(data.permissions) ? data.permissions : null;
      return {
        fullName:
          typeof data.full_name === 'string' ? data.full_name : repositoryLabel(this.repository),
        private: data.private === true,
        canPush: this.token && permissions ? permissions.push === true : null,
      };
    } catch (error) {
      if (error instanceof GitHubError && error.kind === 'not-found') {
        throw new GitHubError(
          'not-found',
          this.token
            ? `GitHub has no repository ${repositoryLabel(this.repository)} that this token can open. Check the name, and that the token was made for this repository.`
            : `GitHub has no public repository ${repositoryLabel(this.repository)}. Check the name; a private repository needs a token.`,
          404,
        );
      }
      throw error;
    }
  }

  /**
   * The files in a folder (`''` for the top folder), or an empty list when the folder does not
   * exist yet. Throws 'not-found' when the repository itself cannot be opened.
   */
  async listFolder(folder: string): Promise<FolderEntry[]> {
    const url =
      folder === '' ? `${this.base}/contents` : `${this.base}/contents/${encodePath(folder)}`;
    let data: unknown;
    try {
      ({ data } = await this.request('GET', url));
    } catch (error) {
      if (error instanceof GitHubError && error.kind === 'not-found') {
        // The folder is missing, or the repository is empty or cannot be opened: tell them apart.
        await this.getRepository();
        return [];
      }
      throw error;
    }
    if (!Array.isArray(data)) {
      throw new GitHubError('invalid', `“${folder}” on GitHub is a file, not a folder.`);
    }
    return data
      .filter(isObject)
      .filter((entry) => entry.type === 'file')
      .map((entry) => ({
        name: String(entry.name),
        path: String(entry.path),
        sha: String(entry.sha),
        size: typeof entry.size === 'number' ? entry.size : 0,
      }));
  }

  /** A text file, or `null` when there is none at `path`. */
  async readFile(path: string): Promise<RemoteFile | null> {
    let data: unknown;
    try {
      ({ data } = await this.request('GET', `${this.base}/contents/${encodePath(path)}`));
    } catch (error) {
      if (error instanceof GitHubError && error.kind === 'not-found') return null;
      throw error;
    }
    if (!isObject(data) || data.type !== 'file' || typeof data.sha !== 'string') {
      throw new GitHubError('invalid', `“${path}” on GitHub is not a file.`);
    }
    if (data.encoding !== 'base64' || typeof data.content !== 'string') {
      throw new GitHubError('invalid', `“${path}” on GitHub is too large to open here.`);
    }
    let text: string;
    try {
      text = decodeBase64Utf8(data.content);
    } catch {
      throw new GitHubError('invalid', `“${path}” on GitHub is not a text file.`);
    }
    return { path: String(data.path ?? path), sha: data.sha, text };
  }

  /**
   * Creates the file at `path`, or replaces it when `sha` is the sha of the file there now.
   * Throws 'conflict' when the file changed (or appeared) since that sha was read.
   */
  async writeFile(args: {
    readonly path: string;
    readonly text: string;
    readonly message: string;
    readonly sha: string | null;
  }): Promise<SavedFile> {
    if (!this.token) throw new GitHubError('token', 'Saving to GitHub needs a token.');
    const { data } = await this.request('PUT', `${this.base}/contents/${encodePath(args.path)}`, {
      message: args.message,
      content: encodeBase64Utf8(args.text),
      ...(args.sha ? { sha: args.sha } : {}),
    });
    const content = isObject(data) && isObject(data.content) ? data.content : null;
    const commit = isObject(data) && isObject(data.commit) ? data.commit : null;
    if (!content || typeof content.sha !== 'string') {
      throw new GitHubError('other', 'GitHub saved the file but sent an unexpected answer.');
    }
    return {
      sha: content.sha,
      commitUrl: commit && typeof commit.html_url === 'string' ? commit.html_url : null,
    };
  }
}
