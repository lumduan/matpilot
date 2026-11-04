import type { CheckStatus } from '@/lib/compat';

const LABELS: Record<CheckStatus, { text: string; symbol: string }> = {
  pass: { text: 'Pass', symbol: '✓' },
  fail: { text: 'Fail', symbol: '✗' },
  skipped: { text: 'Skipped', symbol: '–' },
  info: { text: 'Info', symbol: 'i' },
};

/** Pass/fail badge. The text label carries the meaning; colour is only a secondary cue. */
export function StatusBadge({ status }: { status: CheckStatus }) {
  const { text, symbol } = LABELS[status];
  return (
    <span className={`badge badge-${status}`}>
      <span aria-hidden="true">{symbol}</span> {text}
    </span>
  );
}
