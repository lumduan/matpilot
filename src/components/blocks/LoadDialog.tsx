'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog } from '@/components/Dialog';
import type { BlocksEditor } from '@/hooks/useBlocksEditor';
import type { GitHubStore } from '@/hooks/useGitHub';
import { PROGRAM_FILE_EXTENSION } from '@/lib/blocks/program-file';
import type { RemoteProgram } from '@/lib/github/programs';
import { folderUrl, repositoryLabel } from '@/lib/github/repository';
import { describeGitHubError, describeSaved, describeSize } from './describe';

/** Program files are a few kilobytes; anything this large is not one. */
const MAX_FILE_BYTES = 2_000_000;

type RemoteState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly programs: readonly RemoteProgram[] }
  | { readonly kind: 'error'; readonly message: string };

/** Load: open a program file from this computer or from the team's GitHub folder (ADR 0011). */
export function LoadDialog({
  editor,
  github,
  onClose,
  onOpened,
  onSetUpGitHub,
}: {
  readonly editor: BlocksEditor;
  readonly github: GitHubStore;
  readonly onClose: () => void;
  /** After a program was opened, with a message for the page. */
  readonly onOpened: (message: string) => void;
  readonly onSetUpGitHub: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const repository = github.configured ? github.repository : null;
  const folder = github.folder ?? '';
  const [remote, setRemote] = useState<RemoteState>({ kind: 'loading' });
  const [listRequest, setListRequest] = useState(0);
  const { list } = github;

  useEffect(() => {
    if (!repository) return;
    let current = true;
    list().then(
      (programs) => current && setRemote({ kind: 'ready', programs }),
      (failure: unknown) =>
        current && setRemote({ kind: 'error', message: describeGitHubError(failure) }),
    );
    return () => {
      current = false;
    };
  }, [repository, list, listRequest]);

  const refresh = () => {
    setRemote({ kind: 'loading' });
    setListRequest((count) => count + 1);
  };

  const opened = (name: string, savedBy: string, savedAt: string, from: string) => {
    const saved = describeSaved(savedBy, savedAt);
    onOpened(
      `Opened “${name}”${from}${saved ? ` (saved by ${saved})` : ''}. Press Undo to go back to the blocks you had.`,
    );
  };

  const openFromComputer = async (file: File) => {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError('This file is too large to be a MatPilot program.');
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      setError('This file could not be read.');
      return;
    }
    const result = editor.openFile(text, file.name, null);
    if (!result.ok) setError(result.message);
    else opened(result.file.name, result.file.savedBy, result.file.savedAt, '');
  };

  const openFromGitHub = async (program: RemoteProgram) => {
    if (!repository) return;
    setError(null);
    setOpening(program.path);
    try {
      const file = await github.read(program.path);
      if (!file) {
        setError(`“${program.name}” is no longer on GitHub. Refresh the list.`);
        return;
      }
      const result = editor.openFile(file.text, `${program.name}${PROGRAM_FILE_EXTENSION}`, {
        repository: repositoryLabel(repository),
        path: file.path,
        sha: file.sha,
      });
      if (!result.ok) setError(result.message);
      else opened(result.file.name, result.file.savedBy, result.file.savedAt, ' from GitHub');
    } catch (failure) {
      setError(describeGitHubError(failure));
    } finally {
      setOpening(null);
    }
  };

  return (
    <Dialog title="Load a program" onClose={onClose} testId="load-dialog">
      <p className="muted">
        Loading replaces the blocks on the page. Changed your mind? Press <strong>Undo</strong>.
      </p>
      {error && (
        <p className="notice notice-error" role="alert" data-testid="load-error">
          {error}
        </p>
      )}

      <section className="dialog-section" aria-labelledby="load-computer-heading">
        <h3 id="load-computer-heading">From this computer</h3>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void openFromComputer(file);
          }}
          data-testid="load-file-input"
        />
        <button type="button" className="button" onClick={() => fileInput.current?.click()}>
          Choose a file…
        </button>
      </section>

      <section className="dialog-section" aria-labelledby="load-github-heading">
        <h3 id="load-github-heading">From GitHub</h3>
        {repository ? (
          <>
            <p className="muted">
              <a href={folderUrl(repository, folder)} target="_blank" rel="noreferrer">
                {repositoryLabel(repository)}
                {folder ? ` › ${folder}` : ''}
              </a>{' '}
              <button type="button" className="link-button" onClick={refresh}>
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
              (remote.programs.length === 0 ? (
                <p className="muted" data-testid="github-empty">
                  No programs here yet. Save one to start the folder.
                </p>
              ) : (
                <ul className="program-list" data-testid="github-programs">
                  {remote.programs.map((program) => (
                    <li key={program.path}>
                      <button
                        type="button"
                        className="program-list-item"
                        onClick={() => void openFromGitHub(program)}
                        disabled={opening !== null}
                      >
                        <span className="program-list-name">{program.name}</span>
                        <span className="program-list-meta">
                          {opening === program.path ? 'Opening…' : describeSize(program.size)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ))}
          </>
        ) : (
          <>
            <p className="muted">Open programs your team saved in a GitHub repository.</p>
            <button type="button" className="button" onClick={onSetUpGitHub}>
              Set up GitHub…
            </button>
          </>
        )}
      </section>
    </Dialog>
  );
}
