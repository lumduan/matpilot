/** Pure geometry for the live plotter: visible window, y range, ticks, nearest sample. */

import type { SeriesData } from './plot';

export interface PlotDomain {
  readonly start: number;
  readonly end: number;
  readonly min: number;
  readonly max: number;
}

/** The last `windowMs` of data, ending at the newest sample; `null` when there is none. */
export function plotDomain(series: readonly SeriesData[], windowMs: number): PlotDomain | null {
  let end = -Infinity;
  for (const s of series) {
    const last = s.times.at(-1);
    if (last !== undefined && last > end) end = last;
  }
  if (!Number.isFinite(end)) return null;
  const start = end - windowMs;
  let min = Infinity;
  let max = -Infinity;
  for (const s of series) {
    s.times.forEach((time, index) => {
      if (time < start) return;
      const value = s.values[index] ?? 0;
      if (value < min) min = value;
      if (value > max) max = value;
    });
  }
  if (!Number.isFinite(min)) return null;
  if (min === max) {
    const pad = min === 0 ? 1 : Math.abs(min) * 0.1;
    return { start, end, min: min - pad, max: max + pad };
  }
  return { start, end, min, max };
}

/** Round tick values covering [min, max], about `target` of them, steps of 1, 2, 2.5 or 5 × 10^n. */
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (!(max > min)) return [min];
  const rough = (max - min) / Math.max(1, target);
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * power >= rough) ?? 10) * power;
  const ticks: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step * 1e-9; value += step) {
    ticks.push(Number(value.toPrecision(12)));
  }
  return ticks;
}

/** Index of the time closest to `time` in an ascending array, or -1 when empty. */
export function nearestIndex(times: readonly number[], time: number): number {
  if (times.length === 0) return -1;
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((times[mid] ?? 0) < time) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs((times[lo - 1] ?? 0) - time) <= Math.abs((times[lo] ?? 0) - time)) {
    return lo - 1;
  }
  return lo;
}

/** Axis label: full numbers below 10,000, compact (12.5K) above, at most 3 decimals. */
export function formatTick(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 10_000) {
    return `${Number((value / 1000).toPrecision(3))}K`;
  }
  return String(Number(value.toFixed(3)));
}
