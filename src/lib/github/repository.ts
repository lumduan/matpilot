/**
 * Names of a GitHub repository and of the folder programs are kept in (ADR 0011), and links to
 * them on github.com. Links are only followed when the user clicks them.
 */

export interface RepositoryName {
  readonly owner: string;
  readonly repo: string;
}

/** Account and organisation names: letters, digits and single hyphens, at most 39 characters. */
const OWNER = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
/** Repository names: letters, digits, `.`, `-` and `_`, at most 100 characters. */
const REPO = /^[\w.-]{1,100}$/;

/**
 * Reads what the user typed or pasted: `owner/repo`, a github.com link (with or without
 * `https://`, `.git` or a path after it), or an SSH address (`git@github.com:owner/repo.git`).
 */
export function parseRepository(input: string): RepositoryName | null {
  const text = input
    .trim()
    .replace(/^git@github\.com:/i, '')
    .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, '');
  const [owner = '', rawRepo = ''] = text.split(/[/?#]/);
  const repo = rawRepo.replace(/\.git$/i, '');
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === '.' || repo === '..') return null;
  return { owner, repo };
}

export const repositoryLabel = ({ owner, repo }: RepositoryName) => `${owner}/${repo}`;

export const DEFAULT_FOLDER = 'matpilot';

/**
 * A folder path inside the repository: segments split by `/`, without empty, `.` or `..`
 * segments, backslashes or control characters. `''` is the repository's top folder; `null` means
 * the path cannot be used.
 */
export function cleanFolder(input: string): string | null {
  const segments = input
    .trim()
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '');
  for (const segment of segments) {
    if (segment === '.' || segment === '..' || /[\u0000-\u001f\u007f\\]/.test(segment)) {
      return null;
    }
  }
  return segments.join('/');
}

/** `folder/file`, or `file` in the top folder. */
export const joinPath = (folder: string, fileName: string) =>
  folder === '' ? fileName : `${folder}/${fileName}`;

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

export const repositoryUrl = (name: RepositoryName) =>
  `https://github.com/${encodeURIComponent(name.owner)}/${encodeURIComponent(name.repo)}`;

/** The folder on github.com, on the repository's default branch (`HEAD`). */
export const folderUrl = (name: RepositoryName, folder: string) =>
  folder === '' ? repositoryUrl(name) : `${repositoryUrl(name)}/tree/HEAD/${encodePath(folder)}`;

/** A file's history on github.com: who saved it, and when. */
export const historyUrl = (name: RepositoryName, path: string) =>
  `${repositoryUrl(name)}/commits/HEAD/${encodePath(path)}`;

/**
 * GitHub's page for a new fine-grained personal access token, filled in for MatPilot: the
 * repository owner as the resource owner, "Contents: Read and write", one year. The user still
 * picks the one repository. Parameters:
 * https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#pre-filling-fine-grained-personal-access-token-details-using-url-parameters
 */
export function newTokenUrl(owner: string | null): string {
  const params = new URLSearchParams({
    name: 'MatPilot',
    description: 'Save and load MatPilot block programs',
    ...(owner ? { target_name: owner } : {}),
    expires_in: '366',
    contents: 'write',
  });
  return `https://github.com/settings/personal-access-tokens/new?${params.toString()}`;
}
