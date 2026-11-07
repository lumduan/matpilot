'use client';

import { useEffect, useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { describeGitHubError } from '@/components/blocks/describe';
import type { GitHubStore } from '@/hooks/useGitHub';
import type { FileKind } from '@/lib/github/files';
import { commitMessage, nextFreeName } from '@/lib/github/programs';
import {
  folderUrl,
  historyUrl,
  joinPath,
  repositoryLabel,
  type RepositoryName,
} from '@/lib/github/repository';

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

/**
 * Save a robot or a mat (ADR 0016): download its file, or save it in the team's GitHub folder,
 * with the GitHub set up for programs (ADR 0011). As with programs, a teammate's newer version is
 * never replaced without asking.
 */
export function FileSaveDialog({
  title,
  kind,
  github,
  id,
  name: startName,
  maxLength,
  clean,
  fallbackName,
  onRename,
  saveToComputer,
  fileText,
  publicWarning,
  onClose,
  onSetUpGitHub,
}: {
  title: string;
  kind: FileKind;
  github: GitHubStore;
  /** The robot's or mat's id, for the GitHub file it is linked to. */
  id: string;
  name: string;
  maxLength: number;
  clean: (name: string) => string;
  fallbackName: string;
  /** The name was changed here: the robot or mat takes it. */
  onRename: (name: string) => void;
  /** Downloads the file; gives its name. */
  saveToComputer: (name: string) => Promise<string>;
  fileText: (name: string) => Promise<string>;
  /** Asked to agree to before saving into a public repository (mats: the organiser's work). */
  publicWarning?: string;
  onClose: () => void;
  onSetUpGitHub: () => void;
}) {
  const [name, setName] = useState(startName);
  const [note, setNote] = useState('');
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const [visibility, setVisibility] = useState<'private' | 'public' | 'unknown' | null>(null);
  const [agreed, setAgreed] = useState(false);
  const saveName = clean(name) || fallbackName;
  const author = github.settings.author.trim();
  const repository = github.configured ? github.repository : null;
  const folder = github.folder ?? '';
  const busy = state.kind === 'busy';
  const { check } = github;

  // Whether the repository is public, for the warning.
  useEffect(() => {
    if (!publicWarning || !repository) return;
    let current = true;
    check(repository, null).then(
      (info) => current && setVisibility(info.private ? 'private' : 'public'),
      () => current && setVisibility('unknown'),
    );
    return () => {
      current = false;
    };
  }, [publicWarning, repository, check]);
  const checking = Boolean(publicWarning) && repository !== null && visibility === null;
  const mustAgree = Boolean(publicWarning) && visibility !== null && visibility !== 'private';

  const toComputer = async () => {
    setState({ kind: 'busy' });
    try {
      onRename(saveName);
      setState({ kind: 'downloaded', fileName: await saveToComputer(saveName) });
    } catch (error) {
      setState({ kind: 'error', message: describeGitHubError(error) });
    }
  };

  const toGitHub = async (target: RepositoryName, as: string, replace: boolean) => {
    const label = repositoryLabel(target);
    const path = joinPath(folder, `${as}${kind.extension}`);
    const link = github.links[id];
    const expectedSha =
      link && link.repository.toLowerCase() === label.toLowerCase() && link.path === path
        ? link.sha
        : null;
    setState({ kind: 'busy' });
    try {
      const text = await fileText(as);
      const outcome = await github.write({
        path,
        text,
        message: (created) => commitMessage({ name: as, created, note, author }),
        expectedSha,
        replace,
      });
      if (outcome.kind === 'conflict') {
        setState({ kind: 'conflict', reason: outcome.reason, name: as, path });
        return;
      }
      onRename(as);
      github.setLink(id, { repository: label, path, sha: outcome.sha });
      setName(as);
      setNote('');
      setState({ kind: 'saved', name: as, url: outcome.commitUrl });
    } catch (error) {
      setState({ kind: 'error', message: describeGitHubError(error) });
    }
  };

  const saveCopy = async (target: RepositoryName, as: string) => {
    setState({ kind: 'busy' });
    try {
      const taken = (await github.listKind(kind)).map((entry) => entry.name);
      await toGitHub(target, nextFreeName(as, taken).slice(0, maxLength), false);
    } catch (error) {
      setState({ kind: 'error', message: describeGitHubError(error) });
    }
  };

  return (
    <Dialog title={title} onClose={onClose} testId="file-save-dialog">
      <label className="field">
        <span className="field-label">Name</span>
        <input
          className="field-input"
          value={name}
          maxLength={maxLength}
          onChange={(event) => {
            setName(event.target.value);
            if (state.kind !== 'busy') setState({ kind: 'idle' });
          }}
          spellCheck={false}
          data-testid="file-name"
        />
      </label>

      <section className="dialog-section" aria-labelledby="file-save-computer">
        <h3 id="file-save-computer">On this computer</h3>
        <p className="muted">
          Downloads <strong>{`${saveName}${kind.extension}`}</strong>. Load opens it again, here or
          on another computer.
        </p>
        <button
          type="button"
          className="button"
          onClick={() => void toComputer()}
          disabled={busy}
          data-testid="file-save-computer"
        >
          Save to this computer
        </button>
        {state.kind === 'downloaded' && (
          <p className="notice notice-ok" role="status" data-testid="file-save-result">
            Your browser saved <strong>{state.fileName}</strong>, usually in Downloads.
          </p>
        )}
      </section>

      <section className="dialog-section" aria-labelledby="file-save-github">
        <h3 id="file-save-github">On GitHub</h3>
        {repository ? (
          <>
            <p className="muted">
              Saves into{' '}
              <a href={folderUrl(repository, folder)} target="_blank" rel="noreferrer">
                {repositoryLabel(repository)}
                {folder ? ` › ${folder}` : ''}
              </a>
              , beside your team’s programs.{' '}
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
                    data-testid="file-note"
                  />
                </label>
                {checking && (
                  <p className="muted" data-testid="file-public-checking">
                    Checking whether this repository is private…
                  </p>
                )}
                {mustAgree && publicWarning && (
                  <label
                    className="field-check notice notice-warn"
                    data-testid="file-public-warning"
                  >
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(event) => setAgreed(event.target.checked)}
                      data-testid="file-public-agree"
                    />
                    <span>
                      {visibility === 'public'
                        ? 'This repository is public: anyone can download what is saved in it. '
                        : 'MatPilot could not tell whether this repository is public. '}
                      {publicWarning}
                    </span>
                  </label>
                )}
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => void toGitHub(repository, saveName, false)}
                  disabled={busy || checking || (mustAgree && !agreed)}
                  data-testid="file-save-github"
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
              Keep your {kind.noun}s in the GitHub repository your team uses for programs, so
              everyone can load them.
            </p>
            <button
              type="button"
              className="button"
              onClick={onSetUpGitHub}
              data-testid="file-setup-github"
            >
              Set up GitHub…
            </button>
          </>
        )}

        {state.kind === 'saved' && (
          <p className="notice notice-ok" role="status" data-testid="file-save-result">
            Saved <strong>{state.name}</strong> to GitHub.{' '}
            {state.url && (
              <a href={state.url} target="_blank" rel="noreferrer">
                See it on GitHub
              </a>
            )}
          </p>
        )}
        {state.kind === 'error' && (
          <p className="notice notice-error" role="alert" data-testid="file-save-result">
            {state.message}
          </p>
        )}
        {state.kind === 'conflict' && repository && (
          <div className="notice notice-warn" role="alert" data-testid="file-save-conflict">
            <p>
              {state.reason === 'exists' ? (
                <>
                  There is already a {kind.noun} called <strong>{state.name}</strong> in this
                  folder. Saving would replace it.
                </>
              ) : (
                <>
                  Someone saved <strong>{state.name}</strong> on GitHub after you last loaded or
                  saved it. Saving now would replace their version.{' '}
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
                data-testid="file-save-copy"
              >
                Save mine as a new {kind.noun}
              </button>
              <button
                type="button"
                className="button button-small"
                onClick={() => void toGitHub(repository, state.name, true)}
                data-testid="file-save-replace"
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
