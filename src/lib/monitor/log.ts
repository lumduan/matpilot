/** A bounded log of monitor lines with arrival times, framework-agnostic. */

export type LogKind = 'out' | 'in' | 'info' | 'error';

export interface LogLine {
  readonly id: number;
  /** Milliseconds since the Unix epoch, when the line completed. */
  readonly time: number;
  readonly kind: LogKind;
  readonly text: string;
}

export const DEFAULT_MAX_LINES = 5000;

export class MonitorLog {
  #lines: LogLine[] = [];
  #nextId = 1;
  #dropped = 0;
  readonly #max: number;

  constructor(maxLines: number = DEFAULT_MAX_LINES) {
    this.#max = maxLines;
  }

  add(kind: LogKind, text: string, time: number): LogLine {
    const line: LogLine = { id: this.#nextId++, time, kind, text };
    this.#lines.push(line);
    if (this.#lines.length > this.#max) {
      const excess = this.#lines.length - this.#max;
      this.#lines.splice(0, excess);
      this.#dropped += excess;
    }
    return line;
  }

  clear(): void {
    this.#lines = [];
    this.#dropped = 0;
  }

  /** A new array on every call; callers cache it per version. */
  lines(): readonly LogLine[] {
    return this.#lines.slice();
  }

  /** Lines removed because the log was full. */
  get dropped(): number {
    return this.#dropped;
  }
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/** "14:05:09.123" in local time. */
export function formatClock(time: number): string {
  const date = new Date(time);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/** Plain-text export of the log, one line per entry. */
export function formatLog(lines: readonly LogLine[], withTimes: boolean): string {
  const prefix: Record<LogKind, string> = { out: '', in: '> ', info: '# ', error: '! ' };
  return lines
    .map(
      (line) => `${withTimes ? `${formatClock(line.time)}  ` : ''}${prefix[line.kind]}${line.text}`,
    )
    .join('\n');
}
