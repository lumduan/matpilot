/**
 * The value of the 5×5 light picker: 25 characters, row by row from the top left, each a
 * brightness level from 0 (off) to 10 (100 %), written in base 11 ("0"–"9", "a").
 */

export const MATRIX_SIZE = 5;
export const MATRIX_LEVELS = 10;
const CELLS = MATRIX_SIZE * MATRIX_SIZE;
const PATTERN = /^[0-9a]{25}$/;

export const BLANK_MATRIX = '0'.repeat(CELLS);
/** A smile, the default picture. */
export const SMILE_MATRIX = ['00000', '0a0a0', '00000', 'a000a', '0aaa0'].join('');

export function isMatrixValue(value: unknown): value is string {
  return typeof value === 'string' && PATTERN.test(value);
}

/** Brightness levels, 0 to 10, row by row. */
export function matrixLevels(value: string): number[] {
  return [...value].map((char) => Number.parseInt(char, 11));
}

export function matrixFromLevels(levels: readonly number[]): string {
  return levels
    .map((level) => Math.max(0, Math.min(MATRIX_LEVELS, Math.round(level))).toString(11))
    .join('');
}

/** Brightness in percent, as rows, for `hub.display.icon()`. */
export function matrixRows(value: string): number[][] {
  const levels = matrixLevels(value);
  return Array.from({ length: MATRIX_SIZE }, (_, row) =>
    levels.slice(row * MATRIX_SIZE, (row + 1) * MATRIX_SIZE).map((level) => level * 10),
  );
}
