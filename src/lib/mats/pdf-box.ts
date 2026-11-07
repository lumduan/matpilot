/**
 * A mat PDF's real size (ADR 0016, section 5), following lumduan/wro-2026's measurement
 * (commit 46d8f28, tools/pdf_extract.py and docs/EXTRACTION_REPORT.md): a printed page's finished
 * size is its TrimBox; without one, the page as shown (pdf.js's view, its CropBox). PDF lengths are
 * points of 1/72 inch. The WRO 2026 Elementary mat's TrimBox is 6695.43 × 3240 pt: 2361.999 ×
 * 1143.000 mm.
 *
 * pdf.js does not give the TrimBox, so it is read from the file's bytes when it is written as
 * plain text (as in the WRO mat, a PDF 1.3 file). A TrimBox kept inside a compressed object
 * stream is not found; then the visible page is used, and the page says so.
 */

/** Millimetres in one PDF point. */
export const MM_PER_PT = 25.4 / 72;

export type Box = readonly [number, number, number, number];

const BOX = /\/TrimBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/g;

/**
 * Every TrimBox written as plain text in the file, in order. With one page there is at most
 * one, and it belongs to that page.
 */
export function trimBoxesInBytes(bytes: Uint8Array): Box[] {
  // Latin-1 keeps every byte as one character, so binary streams cannot break the search.
  const text = new TextDecoder('latin1').decode(bytes);
  const boxes: Box[] = [];
  for (const match of text.matchAll(BOX)) {
    const numbers = match.slice(1, 5).map(Number);
    if (numbers.every(Number.isFinite)) boxes.push(numbers as unknown as Box);
  }
  return boxes;
}

const normal = (box: Box): Box => [
  Math.min(box[0], box[2]),
  Math.min(box[1], box[3]),
  Math.max(box[0], box[2]),
  Math.max(box[1], box[3]),
];

export interface PageSize {
  readonly widthMm: number;
  readonly heightMm: number;
  /** The part of the page to keep, in points from the view's top-left (as drawn), or `null`. */
  readonly crop: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  } | null;
  readonly sizeFrom: 'trim' | 'page';
}

/**
 * The page's real size: the trim box when there is one inside the view (and the page is not
 * turned), else the view. `rotate` is the page's own rotation, a multiple of 90°.
 */
export function pageSize(view: Box, rotate: number, trim: Box | null): PageSize {
  const v = normal(view);
  const turned = ((rotate % 360) + 360) % 360 === 90 || ((rotate % 360) + 360) % 360 === 270;
  const viewWidth = v[2] - v[0];
  const viewHeight = v[3] - v[1];
  if (trim && !turned && ((rotate % 360) + 360) % 360 === 0) {
    const t = normal(trim);
    const inside =
      t[0] >= v[0] - 0.01 && t[1] >= v[1] - 0.01 && t[2] <= v[2] + 0.01 && t[3] <= v[3] + 0.01;
    const smaller = t[2] - t[0] < viewWidth - 0.01 || t[3] - t[1] < viewHeight - 0.01;
    if (inside && t[2] > t[0] && t[3] > t[1]) {
      return {
        widthMm: (t[2] - t[0]) * MM_PER_PT,
        heightMm: (t[3] - t[1]) * MM_PER_PT,
        // Drawn with y down from the view's top.
        crop: smaller
          ? { x: t[0] - v[0], y: v[3] - t[3], width: t[2] - t[0], height: t[3] - t[1] }
          : null,
        sizeFrom: 'trim',
      };
    }
  }
  return {
    widthMm: (turned ? viewHeight : viewWidth) * MM_PER_PT,
    heightMm: (turned ? viewWidth : viewHeight) * MM_PER_PT,
    crop: null,
    sizeFrom: 'page',
  };
}

/**
 * Pixels per millimetre for the mat's picture: `wanted`, or less when the picture would pass
 * `maxPixels` (phones limit a canvas to about 16.7 million pixels).
 */
export function pixelsPerMm(
  widthMm: number,
  heightMm: number,
  wanted = 2,
  maxPixels = 16_000_000,
): number {
  const fit = Math.sqrt(maxPixels / (widthMm * heightMm));
  return Math.min(wanted, fit);
}
