'use client';

import { useEffect, useRef, useState } from 'react';
import type { TokenKind } from '@/lib/blocks/python-colors';

type Pieces = readonly { readonly text: string; readonly kind: TokenKind | null }[];

/**
 * Read-only Python with line numbers, in VS Code-like colours (src/lib/blocks/python-colors.ts,
 * loaded after the page so the plain text shows first); the line of a compile error is marked, and
 * so is a line the AI helper points at (`mark`), which is scrolled into view.
 */
export function CodeView({
  code,
  errorLine,
  mark = null,
  label = 'Python made from the blocks',
}: {
  code: string;
  errorLine: number | null;
  /** A line to show; `at` changes each time it is asked for, so the same line scrolls again. */
  mark?: { readonly line: number; readonly at: number } | null;
  label?: string;
}) {
  const markRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (mark) markRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [mark]);
  const [coloured, setColoured] = useState<{
    readonly code: string;
    readonly pieces: Pieces;
  } | null>(null);
  useEffect(() => {
    let current = true;
    import('@/lib/blocks/python-colors').then(
      ({ colouredPieces }) => {
        if (current) setColoured({ code, pieces: colouredPieces(code) });
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [code]);
  const pieces = coloured?.code === code ? coloured.pieces : null;
  const lines = code === '' ? [''] : code.replace(/\n$/, '').split('\n');
  return (
    <div className="code-view" data-testid="python-code">
      <pre className="code-gutter" aria-hidden="true">
        {lines.map((_, i) => (
          <span
            key={i}
            className={
              i + 1 === errorLine
                ? 'code-gutter-error'
                : i + 1 === mark?.line
                  ? 'code-gutter-mark'
                  : undefined
            }
          >
            {i + 1}
            {'\n'}
          </span>
        ))}
      </pre>
      <pre className="code-text" tabIndex={0} aria-label={label}>
        {mark && mark.line <= lines.length && (
          <span
            key={mark.at}
            ref={markRef}
            className="code-mark"
            style={{ top: `calc(0.6rem + ${mark.line - 1} * 1lh)` }}
            data-testid="code-mark"
            aria-hidden="true"
          />
        )}
        {pieces
          ? pieces.map((piece, i) =>
              piece.kind ? (
                <span key={i} className={`py-${piece.kind}`}>
                  {piece.text}
                </span>
              ) : (
                piece.text
              ),
            )
          : code}
      </pre>
    </div>
  );
}
