/**
 * Live plotter data, in the spirit of the Arduino IDE's Serial Plotter: every printed line that
 * contains numbers becomes one sample per series.
 *
 * Accepted line formats:
 * - plain numbers separated by spaces, commas, or tabs: `12 -3.5 7` → series "1", "2", "3"
 * - labelled values: `angle:90 speed:-120.5` (or `angle=90, speed=-120.5`) → series "angle", "speed"
 * Lines without a number are ignored by the plotter (they still show in the text monitor).
 */

export interface Sample {
  readonly label: string;
  readonly value: number;
}

const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
const LABEL = /^[A-Za-z_][\w.-]*$/;

/**
 * Parses one line. Tokens are separated by spaces, commas, semicolons, or tabs; each token is a
 * number or `label:number` (`=` also works, and spaces around it are allowed). An unlabelled
 * number is named after its position, "1", "2", .... A line with any other token, or without a
 * number, is not plottable.
 */
export function parsePlotLine(line: string): Sample[] {
  const tokens = line
    .trim()
    .replace(/\s*[:=]\s*/g, ':')
    .split(/[\s,;]+/)
    .filter((token) => token !== '');
  const samples: Sample[] = [];
  for (const [index, token] of tokens.entries()) {
    const colon = token.indexOf(':');
    if (colon === -1) {
      if (!NUMBER.test(token)) return [];
      samples.push({ label: String(index + 1), value: Number(token) });
      continue;
    }
    const label = token.slice(0, colon);
    const value = token.slice(colon + 1);
    if (!LABEL.test(label) || !NUMBER.test(value)) return [];
    samples.push({ label, value: Number(value) });
  }
  return samples;
}

export interface SeriesData {
  readonly label: string;
  /** Sample times, ms since the Unix epoch. */
  readonly times: readonly number[];
  readonly values: readonly number[];
}

export const DEFAULT_MAX_POINTS = 600;
export const MAX_SERIES = 8;

/** Keeps the latest points of each series, up to `maxPoints` and `MAX_SERIES` series. */
export class PlotBuffer {
  readonly #series = new Map<string, { times: number[]; values: number[] }>();
  readonly #maxPoints: number;

  constructor(maxPoints: number = DEFAULT_MAX_POINTS) {
    this.#maxPoints = maxPoints;
  }

  /** Adds the samples of one line. Returns true when anything was added. */
  addLine(line: string, time: number): boolean {
    let added = false;
    for (const sample of parsePlotLine(line)) {
      let series = this.#series.get(sample.label);
      if (!series) {
        if (this.#series.size >= MAX_SERIES) continue;
        series = { times: [], values: [] };
        this.#series.set(sample.label, series);
      }
      series.times.push(time);
      series.values.push(sample.value);
      if (series.times.length > this.#maxPoints) {
        series.times.shift();
        series.values.shift();
      }
      added = true;
    }
    return added;
  }

  clear(): void {
    this.#series.clear();
  }

  snapshot(): readonly SeriesData[] {
    return [...this.#series].map(([label, data]) => ({
      label,
      times: data.times.slice(),
      values: data.values.slice(),
    }));
  }
}
