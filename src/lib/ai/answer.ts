/**
 * An AI answer cut into lines for the page: a line that starts with "Line N:" (or the Thai
 * "บรรทัด N") points at that line of the open file, and the page makes it a link (ADR 0015,
 * review mode). The answer is otherwise plain text; nothing in it runs.
 */

export interface AnswerLine {
  /** The text after any "Line N:" mark. */
  readonly text: string;
  /** The line it points at in the open file, or `null`. */
  readonly line: number | null;
  /** A bullet ("- ", "* ", "• ", "1. "). */
  readonly bullet: boolean;
}

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;
const LINE_MARK =
  /^(?:\*\*)?(?:line|บรรทัด(?:ที่)?)\s*(\d{1,4})(?:\*\*)?\s*[:：.)\-–—]?\s*(?:\*\*)?\s*/i;

/** The answer's lines, with blank lines between paragraphs kept as empty text. */
export function answerLines(answer: string, lineCount: number): AnswerLine[] {
  const out: AnswerLine[] = [];
  for (const raw of answer.replace(/\r\n?/g, '\n').trim().split('\n')) {
    const bulletMatch = BULLET.exec(raw);
    const rest = bulletMatch ? raw.slice(bulletMatch[0].length) : raw.trim();
    const mark = LINE_MARK.exec(rest);
    const number = mark ? Number(mark[1]) : null;
    const line = number !== null && number >= 1 && number <= lineCount ? number : null;
    out.push({
      text: line !== null && mark ? rest.slice(mark[0].length) : rest,
      line,
      bullet: bulletMatch !== null,
    });
  }
  // Two blank lines in a row say no more than one.
  return out.filter(
    (each, i) => !(each.text === '' && each.line === null && out[i - 1]?.text === ''),
  );
}

export interface InlinePiece {
  readonly kind: 'text' | 'strong' | 'code';
  readonly text: string;
}

/** `**bold**` and `` `code` `` in a line, which models write even when asked for plain text. */
export function inlinePieces(text: string): InlinePiece[] {
  const pieces: InlinePiece[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > at) pieces.push({ kind: 'text', text: text.slice(at, match.index) });
    pieces.push(
      match[1] !== undefined
        ? { kind: 'strong', text: match[1] }
        : { kind: 'code', text: match[2] ?? '' },
    );
    at = match.index + match[0].length;
  }
  if (at < text.length) pieces.push({ kind: 'text', text: text.slice(at) });
  return pieces;
}
