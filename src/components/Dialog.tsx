'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * A modal dialog (the browser's own `<dialog>`): it opens when rendered, keeps keyboard focus
 * inside, and closes with ×, Escape, or a click outside it. Render it only while it is open.
 */
export function Dialog({
  title,
  onClose,
  children,
  testId,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly testId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the <dialog> itself, outside its content.
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      data-testid={testId}
    >
      <div className="dialog-inner">
        <div className="dialog-header">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="icon-button"
            onClick={() => ref.current?.close()}
            title="Close"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
              <path
                d="M4 4l8 8M12 4l-8 8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            <span className="visually-hidden">Close</span>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
