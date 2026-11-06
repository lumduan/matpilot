'use client';

import { useState } from 'react';
import { Dialog } from '@/components/Dialog';
import type { BlocksEditor } from '@/hooks/useBlocksEditor';
import type { GitHubStore } from '@/hooks/useGitHub';
import {
  DEFAULT_PROGRAM_NAME,
  PROGRAM_NAME_MAX_LENGTH,
  cleanProgramName,
  programFileName,
} from '@/lib/blocks/program-file';
import { commitMessage, nextFreeName } from '@/lib/github/programs';
import {
  folderUrl,
  historyUrl,
  joinPath,
  repositoryLabel,
  type RepositoryName,
} from '@/lib/github/repository';
import { describeGitHubError } from './describe';

type SaveState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'downloaded'; readonly fileName: string }
  | { readonly kind: 'saved'; readonly name: string; readonly url: string | null }
  | {
      readonly kind: 'conflict';
      readonly reason: 'exists' | 'changed';
      readonly name: string;
      readonly path: string;
    }
  | { readonly kind: 'error'; readonly message: string };

/** Save: download a file, or save to the team's GitHub folder (ADR 0011). */
export function SaveDialog({
  editor,
  github,
  onClose,
  onSetUpGitHub,
}: {
  readonly editor: BlocksEditor;
  readonly github: GitHubStore;
  readonly onClose: () => void;
  readonly onSetUpGitHub: () => void;
}) {
  const [name, setName] = useState(editor.meta.name);
  const [note, setNote] = useState('');
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const programName = cleanProgramName(name) || DEFAULT_PROGRAM_NAME;
  const author = github.settings.author.trim();
  const repository = github.configured ? github.repository : null;
  const folder = github.folder ?? '';
  const busy = state.kind === 'busy';

  const saveToComputer = () => {
    const fileName = editor.saveToComputer(programName, author);
    editor.setMeta({ ...editor.meta, name: programName });
    setState({ kind: 'downloaded', fileName });
  };

  const saveToGitHub = async (
    target: RepositoryName,
    saveName: string,
    replace: boolean,
  ): Promise<void> => {
    const label = repositoryLabel(target);
    const path = joinPath(folder, programFileName(saveName));
    const link = editor.meta.github;
    const expectedSha =
      link && link.repository.toLowerCase() === label.toLowerCase() && link.path === path
        ? link.sha
        : null;
    setState({ kind: 'busy' });
    try {
      const outcome = await github.write({
        path,
        text: editor.fileText(saveName, author),
        message: (created) => commitMessage({ name: saveName, created, note, author }),
        expectedSha,
        replace,
      });
      if (outcome.kind === 'conflict') {
        setState({ kind: 'conflict', reason: outcome.reason, name: saveName, path });
        return;
      }
      editor.setMeta({ name: saveName, github: { repository: label, path, sha: outcome.sha } });
      setName(saveName);
      setNote('');
      setState({ kind: 'saved', name: saveName, url: outcome.commitUrl });
    } catch (error) {
      setState({ kind: 'error', message: describeGitHubError(error) });
    }
  };

  const saveCopy = async (target: RepositoryName, saveName: string) => {
    setState({ kind: 'busy' });
    try {
      const taken = (await github.list()).map((program) => program.name);
      await saveToGitHub(target, nextFreeName(saveName, taken), false);
    } catch (error) {
      setState({ kind: 'error', message: describeGitHubError(error) });
    }
  };

  return (
    <Dialog title="Save your program" onClose={onClose} testId="save-dialog">
      <label className="field">
        <span className="field-label">Name</span>
        <input
          className="field-input"
          value={name}
          maxLength={PROGRAM_NAME_MAX_LENGTH}
          onChange={(event) => {
            setName(event.target.value);
            if (state.kind !== 'busy') setState({ kind: 'idle' });
          }}
          spellCheck={false}
          data-testid="program-name"
        />
      </label>

      <section className="dialog-section" aria-labelledby="save-computer-heading">
        <h3 id="save-computer-heading">On this computer</h3>
        <p className="muted">
          Downloads <strong>{programFileName(programName)}</strong>. Keep it as a backup, or send it
          to a friend: <strong>Load</strong> opens it again.
        </p>
        <button
          type="button"
          className="button"
          onClick={saveToComputer}
          disabled={busy}
          data-testid="save-computer"
        >
          Save to this computer
        </button>
        {state.kind === 'downloaded' && (
          <p className="notice notice-ok" role="status">
            Your browser saved <strong>{state.fileName}</strong>, usually in Downloads.
          </p>
        )}
      </section>

      <section className="dialog-section" aria-labelledby="save-github-heading">
        <h3 id="save-github-heading">On GitHub</h3>
        {repository ? (
          <>
            <p className="muted">
              Saves into{' '}
              <a href={folderUrl(repository, folder)} target="_blank" rel="noreferrer">
                {repositoryLabel(repository)}
                {folder ? ` › ${folder}` : ''}
              </a>
              , where your team can load it.{' '}
              <button type="button" className="link-button" onClick={onSetUpGitHub}>
                Change
              </button>
            </p>
            {github.hasToken ? (
              <>
                <label className="field">
                  <span className="field-label">What did you change? (optional)</span>
                  <input
                    className="field-input"
                    value={note}
                    maxLength={100}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="for example: faster turns"
                    data-testid="save-note"
                  />
                </label>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => void saveToGitHub(repository, programName, false)}
                  disabled={busy}
                  data-testid="save-github"
                >
                  {busy ? 'Saving…' : 'Save to GitHub'}
                </button>
              </>
            ) : (
              <p className="notice notice-warn">
                Saving to GitHub needs a token.{' '}
                <button type="button" className="link-button" onClick={onSetUpGitHub}>
                  Add a token
                </button>
              </p>
            )}
          </>
        ) : (
          <>
            <p className="muted">
              Keep programs in a GitHub repository, so a team can share them and see who changed
              what.
            </p>
            <button type="button" className="button" onClick={onSetUpGitHub}>
              Set up GitHub…
            </button>
          </>
        )}

        {state.kind === 'saved' && repository && (
          <p className="notice notice-ok" role="status" data-testid="save-result">
            Saved <strong>{state.name}</strong> to GitHub.{' '}
            {state.url && (
              <a href={state.url} target="_blank" rel="noreferrer">
                See it on GitHub
              </a>
            )}
          </p>
        )}
        {state.kind === 'error' && (
          <p className="notice notice-error" role="alert" data-testid="save-result">
            {state.message}
          </p>
        )}
        {state.kind === 'conflict' && repository && (
          <div className="notice notice-warn" role="alert" data-testid="save-conflict">
            <p>
              {state.reason === 'exists' ? (
                <>
                  There is already a program called <strong>{state.name}</strong> in this folder.
                  Saving would replace it.
                </>
              ) : (
                <>
                  Someone saved <strong>{state.name}</strong> on GitHub after you opened it. Saving
                  now would replace their version.{' '}
                  <a href={historyUrl(repository, state.path)} target="_blank" rel="noreferrer">
                    See who changed it
                  </a>
                </>
              )}
            </p>
            <div className="button-row">
              <button
                type="button"
                className="button button-small"
                onClick={() => void saveCopy(repository, state.name)}
                data-testid="save-copy"
              >
                Save mine as a new program
              </button>
              <button
                type="button"
                className="button button-small"
                onClick={() => void saveToGitHub(repository, state.name, true)}
                data-testid="save-replace"
              >
                Replace it
              </button>
              <button
                type="button"
                className="button button-small"
                onClick={() => setState({ kind: 'idle' })}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </Dialog>
  );
}
