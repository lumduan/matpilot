'use client';

import type { ShownProblem } from '@/hooks/usePythonEditing';

/**
 * The open tab's Python, editable (ADR 0014): the editor, then whether the Python can become
 * blocks or, if not, each problem with its line (pressing one shows it in the editor).
 */
export function PythonEditPane({
  host,
  problems,
  checking,
  lockedHint,
  onReveal,
}: {
  /** Where the editor goes (a callback ref). */
  host: (element: HTMLDivElement | null) => void;
  problems: readonly ShownProblem[];
  checking: boolean;
  lockedHint: boolean;
  onReveal: (problem: ShownProblem) => void;
}) {
  const count = problems.length;
  return (
    <div className="python-edit" data-testid="python-edit-pane">
      <p className="python-edit-help">
        Change the Python in the white parts. The grey parts come from the blocks and the devices.{' '}
        <strong>Update blocks</strong> turns your Python into blocks.
      </p>
      <div className="python-editor" ref={host} data-testid="python-editor" />
      <div className="python-edit-status" aria-live="polite" data-testid="python-edit-status">
        {lockedHint && (
          <p className="notice notice-warn" data-testid="python-locked">
            The grey parts are made from the blocks and the devices. Change them with the blocks.
          </p>
        )}
        {count > 0 ? (
          <div className="notice notice-error" data-testid="python-problems">
            <strong>
              {count === 1 ? 'One problem' : `${count} problems`}: the blocks stay as they are until
              it is fixed.
            </strong>
            <ul>
              {problems.map((problem, index) => (
                <li key={`${problem.from}-${index}`}>
                  <button
                    type="button"
                    className="problem-link"
                    onClick={() => onReveal(problem)}
                    title="Show it in the Python"
                  >
                    Line {problem.line}: {problem.message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : checking ? (
          <p className="muted">Checking…</p>
        ) : (
          <p className="notice notice-ok" data-testid="python-ok">
            This Python can become blocks. Press Update blocks.
          </p>
        )}
      </div>
    </div>
  );
}
