import { Fragment, type CSSProperties } from 'react';
import type { BlockShape } from '@/lib/blocks/reference';

/**
 * A block drawn in HTML for the Docs: its words on its category's colour, in its shape (a hat, a
 * step, a block that holds others, a value, a question). "…" in the words is a place for another
 * block.
 */
export function BlockChip({
  words,
  shape,
  colour,
}: {
  readonly words: string;
  readonly shape: BlockShape;
  readonly colour: string;
}) {
  const parts = words.split('…');
  return (
    <span
      className="block-chip"
      data-shape={shape}
      style={{ '--block-colour': colour } as CSSProperties}
    >
      {parts.map((part, index) => (
        <Fragment key={index}>
          {/* Spaces keep the words apart in the text a search reads; flex layout ignores them. */}
          {index > 0 && (
            <>
              {' '}
              <span className="block-hole">…</span>{' '}
            </>
          )}
          {part.trim() && <span>{part.trim()}</span>}
        </Fragment>
      ))}
    </span>
  );
}
