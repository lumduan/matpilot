'use client';

import { useEffect, useState } from 'react';
import type { TokenKind } from '@/lib/blocks/python-colors';

type Pieces = readonly { readonly text: string; readonly kind: TokenKind | null }[];

/**
 * Read-only Python with line numbers, in VS Code-like colours (src/lib/blocks/python-colors.ts,
 * loaded after the page so the plain text shows first); the line of a compile error is marked.
 */
export function CodeView({
  code,
  errorLine,
  label = 'Python made from the blocks',
}: {
  code: string;
  errorLine: number | null;
  label?: string;
}) {
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
          <span key={i} className={i + 1 === errorLine ? 'code-gutter-error' : undefined}>
            {i + 1}
            {'\n'}
          </span>
        ))}
      </pre>
      <pre className="code-text" tabIndex={0} aria-label={label}>
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
