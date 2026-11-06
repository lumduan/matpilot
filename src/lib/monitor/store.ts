/**
 * Monitor state for one page: the hub's output as text lines and as plot series, and the Xbox
 * controller as the program's `@xbx` lines report it (src/lib/controller/xbox.ts, ADR 0012).
 * Those lines go to the controller only, not to the text monitor or the plotter.
 *
 * Output can arrive hundreds of times a second, so subscribers are notified at most once per
 * scheduled tick (an animation frame in the browser) and read a cached snapshot.
 */

import { ControllerTracker, IDLE_CONTROLLER, type ControllerSnapshot } from '../controller/xbox';
import { LineSplitter } from './lines';
import { MonitorLog, type LogKind, type LogLine } from './log';
import { PlotBuffer, type SeriesData } from './plot';

export interface MonitorSnapshot {
  readonly lines: readonly LogLine[];
  readonly dropped: number;
  /** Text after the last newline that is still waiting for its newline. */
  readonly partial: string;
  readonly series: readonly SeriesData[];
  readonly plotPaused: boolean;
  readonly controller: ControllerSnapshot;
}

export type Scheduler = (callback: () => void) => void;

const defaultScheduler: Scheduler = (callback) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => callback());
  else setTimeout(callback, 16);
};

export const EMPTY_MONITOR_SNAPSHOT: MonitorSnapshot = Object.freeze({
  lines: [],
  dropped: 0,
  partial: '',
  series: [],
  plotPaused: false,
  controller: IDLE_CONTROLLER,
});

export class MonitorStore {
  readonly #splitter = new LineSplitter();
  readonly #log: MonitorLog;
  readonly #plot: PlotBuffer;
  readonly #controller = new ControllerTracker();
  readonly #listeners = new Set<() => void>();
  readonly #schedule: Scheduler;
  readonly #now: () => number;
  #snapshot: MonitorSnapshot = EMPTY_MONITOR_SNAPSHOT;
  #dirty = false;
  #scheduled = false;
  #plotPaused = false;

  constructor(
    options: {
      maxLines?: number;
      maxPoints?: number;
      schedule?: Scheduler;
      now?: () => number;
    } = {},
  ) {
    this.#log = new MonitorLog(options.maxLines);
    this.#plot = new PlotBuffer(options.maxPoints);
    this.#schedule = options.schedule ?? defaultScheduler;
    this.#now = options.now ?? Date.now;
  }

  readonly getSnapshot = (): MonitorSnapshot => {
    if (this.#dirty) {
      this.#dirty = false;
      this.#snapshot = {
        lines: this.#log.lines(),
        dropped: this.#log.dropped,
        partial: this.#splitter.partial,
        series: this.#plot.snapshot(),
        plotPaused: this.#plotPaused,
        controller: this.#controller.snapshot,
      };
    }
    return this.#snapshot;
  };

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Raw stdout bytes from the hub. */
  pushOutput(bytes: Uint8Array): void {
    const time = this.#now();
    for (const line of this.#splitter.push(bytes)) this.#addOut(line, time);
    this.#changed();
  }

  /** Ends the current output (program stopped): keeps an unfinished last line. */
  endOutput(): void {
    const time = this.#now();
    for (const line of this.#splitter.flush()) this.#addOut(line, time);
    this.#controller.end();
    this.#changed();
  }

  /** A line that did not come from the program: typed input, notes, errors. */
  note(kind: Exclude<LogKind, 'out'>, text: string): void {
    this.#log.add(kind, text, this.#now());
    this.#changed();
  }

  clearText(): void {
    this.#log.clear();
    this.#changed();
  }

  clearPlot(): void {
    this.#plot.clear();
    this.#changed();
  }

  setPlotPaused(paused: boolean): void {
    this.#plotPaused = paused;
    this.#changed();
  }

  #addOut(text: string, time: number): void {
    if (this.#controller.push(text, time)) return;
    this.#log.add('out', text, time);
    if (!this.#plotPaused) this.#plot.addLine(text, time);
  }

  #changed(): void {
    this.#dirty = true;
    if (this.#scheduled) return;
    this.#scheduled = true;
    this.#schedule(() => {
      this.#scheduled = false;
      for (const listener of [...this.#listeners]) listener();
    });
  }
}
