'use client';

import { useState, type FormEvent } from 'react';
import { Dialog } from '@/components/Dialog';
import type { GitHubStore } from '@/hooks/useGitHub';
import {
  DEFAULT_FOLDER,
  cleanFolder,
  newTokenUrl,
  parseRepository,
  repositoryLabel,
} from '@/lib/github/repository';
import { describeGitHubError } from './describe';

type CheckState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'ok'; readonly message: string; readonly warn: boolean }
  | { readonly kind: 'error'; readonly message: string };

/** Where on GitHub programs are kept, and the token to save them (ADR 0011). */
export function GitHubSettingsDialog({
  github,
  onClose,
}: {
  readonly github: GitHubStore;
  readonly onClose: () => void;
}) {
  const [repository, setRepository] = useState(github.settings.repository);
  const [folder, setFolder] = useState(github.settings.folder);
  const [author, setAuthor] = useState(github.settings.author);
  const [token, setToken] = useState('');
  const [remember, setRemember] = useState(github.settings.rememberToken);
  const [state, setState] = useState<CheckState>({ kind: 'idle' });
  const parsed = parseRepository(repository);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!parsed) {
      setState({
        kind: 'error',
        message:
          'Type the repository as owner/name (for example robot-team/programs), or paste its link from GitHub.',
      });
      return;
    }
    const cleanedFolder = cleanFolder(folder);
    if (cleanedFolder === null) {
      setState({
        kind: 'error',
        message: 'The folder name cannot contain “..”, “.” on its own, or backslashes.',
      });
      return;
    }
    const newToken = token.trim() || null;
    setState({ kind: 'checking' });
    try {
      const info = await github.check(parsed, newToken);
      github.save(
        {
          repository: repositoryLabel(parsed),
          folder: cleanedFolder,
          author: author.trim(),
          rememberToken: remember,
        },
        newToken,
      );
      setToken('');
      const hasToken = newToken !== null || github.hasToken;
      const where = `${info.fullName}${info.private ? ' (private)' : ''}`;
      setState(
        !hasToken
          ? {
              kind: 'ok',
              warn: true,
              message: `Found ${where}. You can load programs from it; add a token to save.`,
            }
          : info.canPush === false
            ? {
                kind: 'ok',
                warn: true,
                message: `Found ${where}, but your GitHub account cannot change it. Ask its owner to add you.`,
              }
            : {
                kind: 'ok',
                warn: false,
                message: `Connected to ${where}. You can save and load programs.`,
              },
      );
    } catch (error) {
      setState({ kind: 'error', message: describeGitHubError(error) });
    }
  };

  return (
    <Dialog title="GitHub for your team" onClose={onClose} testId="github-dialog">
      <form className="dialog-form" onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span className="field-label">Repository</span>
          <input
            className="field-input"
            value={repository}
            onChange={(event) => setRepository(event.target.value)}
            placeholder="owner/name, or its link"
            autoComplete="off"
            spellCheck={false}
            required
            data-testid="github-repository"
          />
        </label>
        <label className="field">
          <span className="field-label">Folder for programs</span>
          <input
            className="field-input"
            value={folder}
            onChange={(event) => setFolder(event.target.value)}
            placeholder={`${DEFAULT_FOLDER} (empty: the top folder)`}
            autoComplete="off"
            spellCheck={false}
            data-testid="github-folder"
          />
          <span className="field-hint">
            GitHub makes the folder when the first program is saved.
          </span>
        </label>
        <label className="field">
          <span className="field-label">Your name (optional)</span>
          <input
            className="field-input"
            value={author}
            maxLength={40}
            onChange={(event) => setAuthor(event.target.value)}
            autoComplete="off"
            data-testid="github-author"
          />
          <span className="field-hint">
            Shown on GitHub with each save, so the team can see who saved what.
          </span>
        </label>
        <label className="field">
          <span className="field-label">Token</span>
          <input
            className="field-input"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={github.hasToken ? 'A token is saved; type to replace it' : 'github_pat_…'}
            autoComplete="off"
            spellCheck={false}
            data-testid="github-token"
          />
          <span className="field-hint">
            Needed to save, and to load from a private repository. Public repositories load without
            one.
          </span>
        </label>
        <label className="field-check">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          <span>
            Remember the token on this computer. Untick on a shared computer: the token is then
            forgotten when this page closes.
          </span>
        </label>

        <div className="button-row">
          <button
            type="submit"
            className="button button-primary"
            disabled={state.kind === 'checking'}
            data-testid="github-save"
          >
            {state.kind === 'checking' ? 'Checking…' : 'Check and save'}
          </button>
          {github.hasToken && (
            <button
              type="button"
              className="button"
              onClick={() => {
                github.forgetToken();
                setState({ kind: 'idle' });
              }}
            >
              Forget the token
            </button>
          )}
        </div>
        {state.kind === 'ok' && (
          <p
            className={state.warn ? 'notice notice-warn' : 'notice notice-ok'}
            role="status"
            data-testid="github-result"
          >
            {state.message}
          </p>
        )}
        {state.kind === 'error' && (
          <p className="notice notice-error" role="alert" data-testid="github-result">
            {state.message}
          </p>
        )}
      </form>

      <details className="dialog-help">
        <summary>How to get a token</summary>
        <ol>
          <li>Sign in to GitHub with an account that can change the repository.</li>
          <li>
            Open{' '}
            <a href={newTokenUrl(parsed?.owner ?? null)} target="_blank" rel="noreferrer">
              GitHub’s new token page
            </a>
            . It opens with MatPilot’s choices filled in: a fine-grained token, for one year, with
            “Contents: Read and write”.
          </li>
          <li>
            Under <strong>Repository access</strong>, choose{' '}
            <strong>Only select repositories</strong> and pick your team’s repository.
          </li>
          <li>
            Press <strong>Generate token</strong>, copy it, and paste it above.
          </li>
        </ol>
        <p>
          The token works like a password for that one repository: do not post it in a chat. If it
          leaks, delete it on GitHub and make a new one.
        </p>
        <p>
          <strong>Working as a team:</strong> these tokens open repositories you own, or that belong
          to an organisation you are a member of, but not repositories you were only invited to.
          Make a free GitHub organisation for the team, put the repository in it, and make each
          teammate a member.
        </p>
      </details>
    </Dialog>
  );
}
