/**
 * What the AI helper used today, and the prompt journal (ADR 0015): both kept in this browser.
 * The daily limit counts questions that got an answer (a refused or failed request costs nothing
 * at most providers, and a mistyped key must not use up the day). Tokens come from the provider's
 * own usage fields.
 */
import type { ProviderId } from './providers';

export type AiMode = 'explain' | 'review';

export interface DayUsage {
  /** The local date, `YYYY-MM-DD`. */
  readonly date: string;
  readonly questions: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/** The local date of `now`, `YYYY-MM-DD`. */
export function localDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const count = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;

/** Today's usage as stored; a stored day that is not `date` starts again at zero. */
export function parseUsage(raw: string | null, date: string): DayUsage {
  const empty: DayUsage = { date, questions: 0, inputTokens: 0, outputTokens: 0 };
  if (raw === null) return empty;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (data.date !== date) return empty;
    return {
      date,
      questions: count(data.questions),
      inputTokens: count(data.inputTokens),
      outputTokens: count(data.outputTokens),
    };
  } catch {
    return empty;
  }
}

export function addUsage(usage: DayUsage, inputTokens: number, outputTokens: number): DayUsage {
  return {
    date: usage.date,
    questions: usage.questions + 1,
    inputTokens: usage.inputTokens + count(inputTokens),
    outputTokens: usage.outputTokens + count(outputTokens),
  };
}

export interface JournalEntry {
  readonly id: string;
  /** Milliseconds since 1970. */
  readonly time: number;
  readonly mode: AiMode;
  /** The tab the question was about. */
  readonly tab: string;
  /** What the child typed. */
  readonly prompt: string;
  readonly answer: string;
  readonly provider: ProviderId;
  /** The model that answered. */
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** The child's verdict: it helped, it did not, or not said yet. */
  readonly helped: boolean | null;
}

/** The journal keeps this many entries, newest first. */
export const JOURNAL_MAX = 30;

export function parseJournal(raw: string | null): JournalEntry[] {
  if (raw === null) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    const entries: JournalEntry[] = [];
    for (const item of data as Record<string, unknown>[]) {
      if (typeof item !== 'object' || item === null) continue;
      if (typeof item.id !== 'string' || typeof item.answer !== 'string') continue;
      entries.push({
        id: item.id,
        time: count(item.time),
        mode: item.mode === 'review' ? 'review' : 'explain',
        tab: typeof item.tab === 'string' ? item.tab : '',
        prompt: typeof item.prompt === 'string' ? item.prompt : '',
        answer: item.answer,
        provider:
          item.provider === 'openai' || item.provider === 'deepseek' ? item.provider : 'anthropic',
        model: typeof item.model === 'string' ? item.model : '',
        inputTokens: count(item.inputTokens),
        outputTokens: count(item.outputTokens),
        helped: item.helped === true ? true : item.helped === false ? false : null,
      });
    }
    return entries.slice(0, JOURNAL_MAX);
  } catch {
    return [];
  }
}

export function addEntry(journal: readonly JournalEntry[], entry: JournalEntry): JournalEntry[] {
  return [entry, ...journal.filter((each) => each.id !== entry.id)].slice(0, JOURNAL_MAX);
}

export function markHelped(
  journal: readonly JournalEntry[],
  id: string,
  helped: boolean | null,
): JournalEntry[] {
  return journal.map((entry) => (entry.id === id ? { ...entry, helped } : entry));
}
