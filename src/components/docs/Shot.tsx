import Image from 'next/image';
import type { ReactNode } from 'react';
import { PICTURES, type PictureName } from './pictures';

export interface ShotMark {
  /** A place the picture script measured (./pictures.ts), e.g. `run`. */
  readonly at: string;
  readonly label: ReactNode;
}

/**
 * A screenshot of MatPilot from public/docs/ (taken by scripts/docs-pictures.py), with numbered
 * marks on it and, under it, what each number is. The marks are placed where the script found
 * each part of the page, so retaking the pictures moves them too. Tap the picture to see it full
 * size.
 */
export function Shot({
  name,
  alt,
  caption,
  marks = [],
}: {
  name: PictureName;
  alt: string;
  caption?: ReactNode;
  marks?: readonly ShotMark[];
}) {
  const picture = PICTURES[name];
  const src = `/docs/${picture.file}`;
  return (
    <figure className="doc-shot" data-picture={name}>
      <a className="doc-shot-frame" href={src} target="_blank" rel="noopener">
        <Image src={src} width={picture.width} height={picture.height} alt={alt} />
        {marks.map((mark, index) => {
          const point = (picture.marks as Record<string, readonly [number, number]>)[mark.at];
          if (!point) return null;
          return (
            <span
              key={mark.at}
              className="doc-mark"
              style={{ left: `${point[0]}%`, top: `${point[1]}%` }}
              aria-hidden="true"
            >
              {index + 1}
            </span>
          );
        })}
      </a>
      {(caption || marks.length > 0) && (
        <figcaption>
          {caption && <p>{caption}</p>}
          {marks.length > 0 && (
            <ol className="doc-legend">
              {marks.map((mark) => (
                <li key={mark.at}>{mark.label}</li>
              ))}
            </ol>
          )}
        </figcaption>
      )}
    </figure>
  );
}
