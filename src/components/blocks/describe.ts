import { GitHubError } from '@/lib/github/client';

/** A message for the user from anything a GitHub call threw. */
export function describeGitHubError(error: unknown): string {
  if (error instanceof GitHubError) {
    if (error.kind === 'rate-limit' && error.retryAt) {
      const time = error.retryAt.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${error.message} (GitHub allows it again at ${time}.)`;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

/** "Ploy, 6 Nov 10:42": who saved a program and when, from its file; empty when unknown. */
export function describeSaved(savedBy: string, savedAt: string): string {
  const time = savedAt ? new Date(savedAt) : null;
  const when =
    time && !Number.isNaN(time.getTime())
      ? time.toLocaleString(undefined, {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';
  return [savedBy, when].filter(Boolean).join(', ');
}

/** "2.3 KB", "12.6 MB". */
export function describeSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
