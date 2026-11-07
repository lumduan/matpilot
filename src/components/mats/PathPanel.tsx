'use client';

import Link from 'next/link';
import { stepText, type PathPlan } from '@/lib/mats/path';

/**
 * A path drawn on the mat (ADR 0016): its moves, and what to do with them: run them on the mat,
 * or send them to the Blocks page as blocks.
 */
export function PathPanel({
  plan,
  points,
  ready,
  sent,
  onUndo,
  onClear,
  onRun,
  onSend,
}: {
  plan: PathPlan | null;
  points: number;
  /** A robot stands on the mat, so the path has a start. */
  ready: boolean;
  /** The path was sent to the Blocks page. */
  sent: 'ok' | 'failed' | null;
  onUndo: () => void;
  onClear: () => void;
  onRun: () => void;
  onSend: () => void;
}) {
  const steps = plan?.steps ?? [];
  return (
    <section className="mats-section" aria-label="Path" data-testid="path-panel">
      <h2 className="mats-heading">Path</h2>
      {!ready ? (
        <p className="field-hint">Choose a robot and place it: the path starts where it stands.</p>
      ) : points === 0 ? (
        <p className="field-hint">
          With the <strong>Path</strong> tool, click on the mat where the robot should drive, point
          by point. It turns to face each point, then drives straight to it.
        </p>
      ) : (
        <>
          <ol className="path-steps" data-testid="path-steps">
            {steps.map((step, index) => (
              <li key={index}>{stepText(step)}</li>
            ))}
          </ol>
          <p className="field-hint" data-testid="path-length">
            {steps.length} block{steps.length === 1 ? '' : 's'}, {Math.round(plan?.lengthMm ?? 0)}{' '}
            mm of driving.
          </p>
        </>
      )}
      {points > 0 && (
        <div className="button-row">
          <button
            type="button"
            className="button button-small"
            onClick={onUndo}
            data-testid="path-undo"
          >
            Undo point
          </button>
          <button
            type="button"
            className="button button-small"
            onClick={onClear}
            data-testid="path-clear"
          >
            Clear
          </button>
          <button
            type="button"
            className="button button-small"
            disabled={steps.length === 0}
            onClick={onRun}
            data-testid="path-run"
          >
            Run it on the mat
          </button>
          <button
            type="button"
            className="button button-small button-primary"
            disabled={steps.length === 0}
            onClick={onSend}
            data-testid="path-send"
          >
            Send to Blocks
          </button>
        </div>
      )}
      {sent === 'ok' && (
        <p className="notice notice-ok" role="status" data-testid="path-sent">
          Sent. Open <Link href="/blocks">Blocks</Link>: it offers to add these blocks at the end of
          main.
        </p>
      )}
      {sent === 'failed' && (
        <p className="notice notice-error" role="alert">
          This browser would not keep the path for the Blocks page (its storage is blocked).
        </p>
      )}
    </section>
  );
}
