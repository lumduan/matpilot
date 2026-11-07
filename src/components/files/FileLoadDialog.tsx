'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { describeGitHubError, describeSize } from '@/components/blocks/describe';
import type { GitHubStore } from '@/hooks/useGitHub';
import type { FileKind, RemoteEntry } from '@/lib/github/files';
import { folderUrl, repositoryLabel } from '@/lib/github/repository';

type RemoteState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly entries: readonly RemoteEntry[] }
  | { readonly kind: 'error'; readonly message: string };

export type OpenResult =
  | { readonly ok: true; readonly id: string; readonly name: string }
  | { readonly ok: false; readonly message: string };

/**
 * Load a robot or a mat (ADR 0016): a file on this computer, or one in the team's GitHub folder,
 * with the GitHub set up for programs (ADR 0011).
 */
export function FileLoadDialog({
  title,
  kind,
  github,
  maxBytes,
  open,
  onOpened,
  onClose,
  onSetUpGitHub,
}: {
  title: string;
  kind: FileKind;
  github: GitHubStore;
  /** Larger files on this computer are refused before they are read. */
  maxBytes: number;
  /** Opens a file's text; the robot or mat it became. */
  open: (text: string) => Promise<OpenResult>;
  onOpened: (message: string) => void;
  onClose: () => void;
  onSetUpGitHub: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [remote, setRemote] = useState<RemoteState>({ kind: 'loading' });
  const [request, setRequest] = useState(0);
  const repository = github.configured ? github.repository : null;
  const folder = github.folder ?? '';
  const { listKind } = github;

  useEffect(() => {
    if (!repository) return;
    let current = true;
    listKind(kind).then(
      (entries) => current && setRemote({ kind: 'ready', entries }),
      (failure: unknown) =>
        current && setRemote({ kind: 'error', message: describeGitHubError(failure) }),
    );
    return () => {
      current = false;
    };
  }, [repository, listKind, kind, request]);

  const fromComputer = async (file: File) => {
    setError(null);
    if (file.size > maxBytes) {
      setError(`This file is too large to be a MatPilot ${kind.noun}.`);
      return;
    }
    setOpening('computer');
    try {
      const result = await open(await file.text());
      if (result.ok) onOpened(`Opened the ${kind.noun} “${result.name}”.`);
      else setError(result.message);
    } catch (failure) {
      setError(describeGitHubError(failure));
    } finally {
      setOpening(null);
    }
  };

  const fromGitHub = async (entry: RemoteEntry) => {
    if (!repository) return;
    setError(null);
    setOpening(entry.path);
    try {
      const file = await github.read(entry.path);
      if (!file) {
        setError(`“${entry.name}” is no longer on GitHub. Refresh the list.`);
        return;
      }
      const result = await open(file.text);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      github.setLink(result.id, {
        repository: repositoryLabel(repository),
        path: file.path,
        sha: file.sha,
      });
      onOpened(`Opened the ${kind.noun} “${result.name}” from GitHub.`);
    } catch (failure) {
      setError(describeGitHubError(failure));
    } finally {
      setOpening(null);
    }
  };

  return (
    <Dialog title={title} onClose={onClose} testId="file-load-dialog">
      {error && (
        <p className="notice notice-error" role="alert" data-testid="file-load-error">
          {error}
        </p>
      )}
      <section className="dialog-section" aria-labelledby="file-load-computer">
        <h3 id="file-load-computer">From this computer</h3>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void fromComputer(file);
          }}
          data-testid="file-load-input"
        />
        <button
          type="button"
          className="button"
          onClick={() => fileInput.current?.click()}
          disabled={opening !== null}
        >
          {opening === 'computer' ? 'Opening…' : 'Choose a file…'}
        </button>
      </section>

      <section className="dialog-section" aria-labelledby="file-load-github">
        <h3 id="file-load-github">From GitHub</h3>
        {repository ? (
          <>
            <p className="muted">
              <a href={folderUrl(repository, folder)} target="_blank" rel="noreferrer">
                {repositoryLabel(repository)}
                {folder ? ` › ${folder}` : ''}
              </a>{' '}
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setRemote({ kind: 'loading' });
                  setRequest((count) => count + 1);
                }}
              >
                Refresh
              </button>{' '}
              <button type="button" className="link-button" onClick={onSetUpGitHub}>
                Change
              </button>
            </p>
            {remote.kind === 'loading' && <p className="muted">Looking on GitHub…</p>}
            {remote.kind === 'error' && (
              <p className="notice notice-error" role="alert">
                {remote.message}
              </p>
            )}
            {remote.kind === 'ready' &&
              (remote.entries.length === 0 ? (
                <p className="muted" data-testid="file-github-empty">
                  No {kind.noun}s here yet. Save one to GitHub to start.
                </p>
              ) : (
                <ul className="program-list" data-testid="file-github-list">
                  {remote.entries.map((entry) => (
                    <li key={entry.path}>
                      <button
                        type="button"
                        className="program-list-item"
                        onClick={() => void fromGitHub(entry)}
                        disabled={opening !== null}
                      >
                        <span className="program-list-name">{entry.name}</span>
                        <span className="program-list-meta">
                          {opening === entry.path ? 'Opening…' : describeSize(entry.size)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ))}
          </>
        ) : (
          <>
            <p className="muted">Open {kind.noun}s your team saved in its GitHub repository.</p>
            <button
              type="button"
              className="button"
              onClick={onSetUpGitHub}
              data-testid="file-load-setup-github"
            >
              Set up GitHub…
            </button>
          </>
        )}
      </section>
    </Dialog>
  );
}
