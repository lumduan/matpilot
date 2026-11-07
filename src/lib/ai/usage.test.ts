import { describe, expect, it } from 'vitest';
import {
  JOURNAL_MAX,
  addEntry,
  addUsage,
  localDate,
  markHelped,
  parseJournal,
  parseUsage,
  type JournalEntry,
} from './usage';

const entry = (id: string): JournalEntry => ({
  id,
  time: 1,
  mode: 'explain',
  tab: 'main',
  prompt: 'What does it do?',
  answer: 'It drives.',
  provider: 'anthropic',
  model: 'claude-haiku-5-5',
  inputTokens: 10,
  outputTokens: 5,
  helped: null,
});

describe('the daily usage', () => {
  it('uses the local date', () => {
    expect(localDate(new Date(2026, 10, 7, 23, 59))).toBe('2026-11-07');
  });

  it('starts again at zero on a new day', () => {
    const stored = JSON.stringify({
      date: '2026-11-06',
      questions: 7,
      inputTokens: 1,
      outputTokens: 1,
    });
    expect(parseUsage(stored, '2026-11-07')).toEqual({
      date: '2026-11-07',
      questions: 0,
      inputTokens: 0,
      outputTokens: 0,
    });
  });

  it('adds one question and its tokens', () => {
    const today = parseUsage(null, '2026-11-07');
    expect(addUsage(addUsage(today, 100, 20), 50, 10)).toEqual({
      date: '2026-11-07',
      questions: 2,
      inputTokens: 150,
      outputTokens: 30,
    });
  });
});

describe('the prompt journal', () => {
  it('keeps the newest entries first, up to its size', () => {
    let journal: JournalEntry[] = [];
    for (let i = 0; i < JOURNAL_MAX + 5; i += 1) journal = addEntry(journal, entry(String(i)));
    expect(journal).toHaveLength(JOURNAL_MAX);
    expect(journal[0]!.id).toBe(String(JOURNAL_MAX + 4));
  });

  it('remembers whether an answer helped', () => {
    const journal = markHelped([entry('a'), entry('b')], 'b', true);
    expect(journal.map((each) => each.helped)).toEqual([null, true]);
  });

  it('reads back what was stored and skips broken entries', () => {
    const stored = JSON.stringify([
      entry('a'),
      { id: 'b' },
      'x',
      { ...entry('c'), mode: 'review' },
    ]);
    expect(parseJournal(stored).map((each) => [each.id, each.mode])).toEqual([
      ['a', 'explain'],
      ['c', 'review'],
    ]);
    expect(parseJournal('[')).toEqual([]);
  });
});
