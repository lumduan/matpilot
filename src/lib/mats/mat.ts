/**
 * A mat (ADR 0016, step 7b): a picture at real size, in millimetres, with the areas a user marks
 * on it and where the robot stands. Drawn from a PDF (its real size comes from the file) or from
 * a picture (its size typed in). The picture itself is kept in this browser (./store.ts); this is
 * the part that describes it.
 *
 * MAT frame (ADR 0016, section 2, from lumduan/wro-2026): the origin at the mat's bottom-left
 * corner, +x right, +y up, headings in degrees from +x, counter-clockwise positive.
 */

export const MAT_FILE_FORMAT = 'matpilot-mat';
export const MAT_FILE_VERSION = 1;
export const MAT_FILE_EXTENSION = '.matpilot-mat.json';
export const MAT_NAME_MAX_LENGTH = 60;
export const DEFAULT_MAT_NAME = 'My mat';

/** A mat this size or smaller in either direction is refused as a typo. */
export const MAT_MIN_MM = 50;
export const MAT_MAX_MM = 10_000;

export type AreaKind = 'start' | 'target' | 'avoid' | 'other';

export const AREA_KINDS: readonly { readonly value: AreaKind; readonly label: string }[] = [
  { value: 'start', label: 'Start area' },
  { value: 'target', label: 'Target' },
  { value: 'avoid', label: 'Keep out' },
  { value: 'other', label: 'Other' },
];

/** A rectangle on the mat, square to its edges: (x, y) is its bottom-left corner. */
export interface MatArea {
  readonly id: string;
  readonly name: string;
  readonly kind: AreaKind;
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

/** Where the robot stands: the point between its drive wheels, and where its front points. */
export interface MatPlacement {
  readonly robotId: string | null;
  readonly xMm: number;
  readonly yMm: number;
  readonly headingDeg: number;
}

export interface MatSource {
  readonly kind: 'pdf' | 'image';
  readonly fileName: string;
  /** The PDF page, from 1. */
  readonly page: number;
  readonly pageCount: number;
  /** Where the size came from: the PDF's trim box, its visible page, or typed in. */
  readonly sizeFrom: 'trim' | 'page' | 'typed';
}

export interface Mat {
  readonly id: string;
  readonly name: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly source: MatSource;
  /** A rules profile (../robots/rules.ts), or `null`. */
  readonly rulesId: string | null;
  readonly areas: readonly MatArea[];
  readonly placement: MatPlacement | null;
}

export const newMatId = () =>
  `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export const newAreaId = () =>
  `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** A mat's name made safe for a file name, like a program's. */
export function cleanMatName(name: string): string {
  return Array.from(
    name
      .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+/, '')
      .trim(),
  )
    .slice(0, MAT_NAME_MAX_LENGTH)
    .join('')
    .trim();
}

/** `WRO-2026-GameMat.pdf` → `WRO-2026-GameMat`. */
export const matNameFromFileName = (fileName: string) =>
  cleanMatName(
    fileName
      .split(/[/\\]/)
      .pop()!
      .replace(/\.[^.]*$/, ''),
  ) || DEFAULT_MAT_NAME;

export const matFileName = (name: string) =>
  `${cleanMatName(name) || DEFAULT_MAT_NAME}${MAT_FILE_EXTENSION}`;

export const validMatSize = (mm: number) =>
  Number.isFinite(mm) && mm >= MAT_MIN_MM && mm <= MAT_MAX_MM;

// --- Reading and writing --------------------------------------------------------------------

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const num = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

function readArea(value: unknown): MatArea | null {
  if (!isObject(value)) return null;
  const width = num(value.widthMm, 0);
  const height = num(value.heightMm, 0);
  if (width <= 0 || height <= 0) return null;
  return {
    id: typeof value.id === 'string' && value.id !== '' ? value.id.slice(0, 64) : newAreaId(),
    name: typeof value.name === 'string' ? value.name.slice(0, 40) : '',
    kind: AREA_KINDS.some((each) => each.value === value.kind) ? (value.kind as AreaKind) : 'other',
    xMm: num(value.xMm, 0),
    yMm: num(value.yMm, 0),
    widthMm: width,
    heightMm: height,
  };
}

/** A mat from stored or loaded data; `null` when it is not one. */
export function readMat(value: unknown): Mat | null {
  if (!isObject(value) || !isObject(value.source)) return null;
  const width = num(value.widthMm, NaN);
  const height = num(value.heightMm, NaN);
  if (!validMatSize(width) || !validMatSize(height)) return null;
  const source = value.source;
  const placement = isObject(value.placement)
    ? {
        robotId: typeof value.placement.robotId === 'string' ? value.placement.robotId : null,
        xMm: num(value.placement.xMm, width / 2),
        yMm: num(value.placement.yMm, height / 2),
        headingDeg: num(value.placement.headingDeg, 0),
      }
    : null;
  return {
    id: typeof value.id === 'string' && value.id !== '' ? value.id.slice(0, 64) : newMatId(),
    name:
      typeof value.name === 'string'
        ? cleanMatName(value.name) || DEFAULT_MAT_NAME
        : DEFAULT_MAT_NAME,
    widthMm: width,
    heightMm: height,
    source: {
      kind: source.kind === 'image' ? 'image' : 'pdf',
      fileName: typeof source.fileName === 'string' ? source.fileName.slice(0, 200) : '',
      page: Math.max(1, Math.round(num(source.page, 1))),
      pageCount: Math.max(1, Math.round(num(source.pageCount, 1))),
      sizeFrom:
        source.sizeFrom === 'trim' || source.sizeFrom === 'typed' ? source.sizeFrom : 'page',
    },
    rulesId: typeof value.rulesId === 'string' ? value.rulesId : null,
    areas: Array.isArray(value.areas)
      ? (value.areas as unknown[])
          .map(readArea)
          .filter((area): area is MatArea => area !== null)
          .slice(0, 50)
      : [],
    placement,
  };
}

/** The mat as plain data, for storage and files. */
export function matData(mat: Mat): Record<string, unknown> {
  return {
    id: mat.id,
    name: mat.name,
    widthMm: mat.widthMm,
    heightMm: mat.heightMm,
    source: { ...mat.source },
    rulesId: mat.rulesId,
    areas: mat.areas.map((area) => ({ ...area })),
    placement: mat.placement ? { ...mat.placement } : null,
  };
}

/**
 * A mat file: the description and the file it was drawn from (the PDF or the picture), so it can
 * be drawn again on another computer. The file can be large: a WRO mat PDF is about 9 MB.
 */
export function serializeMatFile(mat: Mat, sourceBase64: string, mediaType: string): string {
  return `${JSON.stringify({
    format: MAT_FILE_FORMAT,
    version: MAT_FILE_VERSION,
    mat: matData(mat),
    source: { mediaType, base64: sourceBase64 },
  })}\n`;
}

export type ParsedMatFile =
  | { readonly ok: true; readonly mat: Mat; readonly mediaType: string; readonly base64: string }
  | { readonly ok: false; readonly message: string };

export function parseMatFile(text: string): ParsedMatFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, message: 'This file is not a MatPilot mat (it is not JSON).' };
  }
  if (!isObject(data) || data.format !== MAT_FILE_FORMAT) {
    return { ok: false, message: 'This file is not a MatPilot mat.' };
  }
  if (typeof data.version !== 'number' || data.version > MAT_FILE_VERSION) {
    return {
      ok: false,
      message: 'This mat was saved by a newer MatPilot. Reload the page to update, then try again.',
    };
  }
  const mat = readMat(data.mat);
  const source = isObject(data.source) ? data.source : null;
  if (
    !mat ||
    !source ||
    typeof source.base64 !== 'string' ||
    typeof source.mediaType !== 'string'
  ) {
    return { ok: false, message: 'The mat in this file is damaged.' };
  }
  return { ok: true, mat, mediaType: source.mediaType, base64: source.base64 };
}
