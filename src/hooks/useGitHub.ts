'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { GitHubClient, type RemoteFile, type RepositoryInfo } from '@/lib/github/client';
import {
  listPrograms,
  saveProgram,
  type RemoteProgram,
  type SaveOutcome,
} from '@/lib/github/programs';
import {
  DEFAULT_FOLDER,
  cleanFolder,
  parseRepository,
  type RepositoryName,
} from '@/lib/github/repository';

/**
 * Saving and loading block programs in a GitHub repository (ADR 0011). The settings are kept in
 * this browser. The token is kept in this browser only when the user ticks "Remember"; otherwise
 * it lives in this page's memory until the page is closed or reloaded.
 */

const SETTINGS_KEY = 'matpilot.github.v1';
const TOKEN_KEY = 'matpilot.github.token.v1';

export interface GitHubSettings {
  /** As typed: `owner/repo` or a github.com link. */
  readonly repository: string;
  readonly folder: string;
  /** The name put in commit messages ("saved by ..."); may be empty. */
  readonly author: string;
  readonly rememberToken: boolean;
}

export const DEFAULT_GITHUB_SETTINGS: GitHubSettings = {
  repository: '',
  folder: DEFAULT_FOLDER,
  author: '',
  rememberToken: true,
};

interface Snapshot {
  readonly settings: GitHubSettings;
  readonly token: string | null;
}

const SERVER_SNAPSHOT: Snapshot = { settings: DEFAULT_GITHUB_SETTINGS, token: null };

function parseSettings(raw: string | null): GitHubSettings {
  if (raw === null) return DEFAULT_GITHUB_SETTINGS;
  try {
    const data = JSON.parse(raw) as Partial<Record<keyof GitHubSettings, unknown>>;
    return {
      repository: typeof data.repository === 'string' ? data.repository : '',
      folder: typeof data.folder === 'string' ? data.folder : DEFAULT_FOLDER,
      author: typeof data.author === 'string' ? data.author : '',
      rememberToken: data.rememberToken !== false,
    };
  } catch {
    return DEFAULT_GITHUB_SETTINGS;
  }
}

const listeners = new Set<() => void>();
/** The token when it is not remembered, and everything when storage is blocked. */
let memoryToken: string | null = null;
let memorySettings: string | null = null;
let cache: { raw: string | null; token: string | null; snapshot: Snapshot } | null = null;

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): boolean {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function getSnapshot(): Snapshot {
  const raw = memorySettings ?? readStorage(SETTINGS_KEY);
  const token = memoryToken ?? readStorage(TOKEN_KEY);
  if (!cache || cache.raw !== raw || cache.token !== token) {
    cache = { raw, token, snapshot: { settings: parseSettings(raw), token } };
  }
  return cache.snapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function notify(): void {
  for (const listener of [...listeners]) listener();
}

/** Stores the settings; `token` replaces the token, `null` keeps it, `''` forgets it. */
function store(settings: GitHubSettings, token: string | null): void {
  const raw = JSON.stringify(settings);
  memorySettings = writeStorage(SETTINGS_KEY, raw) ? null : raw;
  const current = memoryToken ?? readStorage(TOKEN_KEY);
  const next = token === null ? current : token.trim() || null;
  writeStorage(TOKEN_KEY, null);
  memoryToken = null;
  if (next !== null) {
    if (!(settings.rememberToken && writeStorage(TOKEN_KEY, next))) memoryToken = next;
  }
  notify();
}

export interface GitHubStore {
  readonly settings: GitHubSettings;
  readonly hasToken: boolean;
  /** The repository, when the settings name one. */
  readonly repository: RepositoryName | null;
  /** The folder, cleaned; `null` when it cannot be used. */
  readonly folder: string | null;
  /** A repository and a usable folder are set. */
  readonly configured: boolean;
  readonly save: (settings: GitHubSettings, token: string | null) => void;
  readonly forgetToken: () => void;
  /** Checks a repository and token before they are saved. */
  readonly check: (repository: RepositoryName, token: string | null) => Promise<RepositoryInfo>;
  readonly list: () => Promise<RemoteProgram[]>;
  readonly read: (path: string) => Promise<RemoteFile | null>;
  readonly write: (args: Parameters<typeof saveProgram>[1]) => Promise<SaveOutcome>;
}

const notConfigured = () => Promise.reject(new Error('GitHub is not set up.'));

export function useGitHub(): GitHubStore {
  const { settings, token } = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
  const repository = useMemo(() => parseRepository(settings.repository), [settings.repository]);
  const folder = cleanFolder(settings.folder);
  const client = useMemo(
    () => (repository ? new GitHubClient({ repository, token }) : null),
    [repository, token],
  );

  const forgetToken = useCallback(() => store(getSnapshot().settings, ''), []);
  const check = useCallback(
    (name: RepositoryName, candidate: string | null) =>
      new GitHubClient({
        repository: name,
        token: candidate ?? getSnapshot().token,
      }).getRepository(),
    [],
  );
  const list = useCallback(
    () => (client && folder !== null ? listPrograms(client, folder) : notConfigured()),
    [client, folder],
  );
  const read = useCallback(
    (path: string) => (client ? client.readFile(path) : notConfigured()),
    [client],
  );
  const write = useCallback(
    (args: Parameters<typeof saveProgram>[1]) =>
      client ? saveProgram(client, args) : notConfigured(),
    [client],
  );

  return {
    settings,
    hasToken: token !== null,
    repository,
    folder,
    configured: repository !== null && folder !== null,
    save: store,
    forgetToken,
    check,
    list,
    read,
    write,
  };
}
