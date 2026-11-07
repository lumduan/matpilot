import { describe, expect, it } from 'vitest';
import { answerLines, inlinePieces } from './answer';

describe('an AI answer', () => {
  it('links "Line N:" bullets to the open file’s lines', () => {
    const lines = answerLines(
      'Two things:\n\n- Line 12: the loop never ends.\n- **Line 3** – check the port.\n- บรรทัดที่ 4: รอนานไป\n- Line 99: not in the file',
      20,
    );
    expect(lines).toEqual([
      { text: 'Two things:', line: null, bullet: false },
      { text: '', line: null, bullet: false },
      { text: 'the loop never ends.', line: 12, bullet: true },
      { text: 'check the port.', line: 3, bullet: true },
      { text: 'รอนานไป', line: 4, bullet: true },
      { text: 'Line 99: not in the file', line: null, bullet: true },
    ]);
  });

  it('keeps one blank line between paragraphs', () => {
    expect(answerLines('a\n\n\n\nb', 5).map((line) => line.text)).toEqual(['a', '', 'b']);
  });

  it('shows **bold** and `code` without the marks', () => {
    expect(inlinePieces('Use **repeat** with `wait(1000)`.')).toEqual([
      { kind: 'text', text: 'Use ' },
      { kind: 'strong', text: 'repeat' },
      { kind: 'text', text: ' with ' },
      { kind: 'code', text: 'wait(1000)' },
      { kind: 'text', text: '.' },
    ]);
  });
});
