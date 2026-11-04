import { describe, expect, it } from 'vitest';
import { LineSplitter } from './lines';
import { formatClock, formatLog, MonitorLog } from './log';
import { parsePlotLine, PlotBuffer } from './plot';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('LineSplitter', () => {
  it('joins lines split across notifications and strips CR LF', () => {
    const splitter = new LineSplitter();
    expect(splitter.push(bytes('hel'))).toEqual([]);
    expect(splitter.push(bytes('lo\r\nwor'))).toEqual(['hello']);
    expect(splitter.partial).toBe('wor');
    expect(splitter.push(bytes('ld\n\n'))).toEqual(['world', '']);
    expect(splitter.flush()).toEqual([]);
  });

  it('keeps a multi-byte character split between notifications intact', () => {
    const splitter = new LineSplitter();
    const thai = bytes('สวัสดี\n');
    expect(splitter.push(thai.subarray(0, 4))).toEqual([]);
    expect(splitter.push(thai.subarray(4))).toEqual(['สวัสดี']);
  });

  it('returns the unfinished last line on flush', () => {
    const splitter = new LineSplitter();
    splitter.push(bytes('no newline'));
    expect(splitter.flush()).toEqual(['no newline']);
    expect(splitter.partial).toBe('');
  });
});

describe('MonitorLog', () => {
  it('keeps at most maxLines and counts dropped lines', () => {
    const log = new MonitorLog(3);
    for (let i = 1; i <= 5; i++) log.add('out', `line ${i}`, i);
    expect(log.lines().map((line) => line.text)).toEqual(['line 3', 'line 4', 'line 5']);
    expect(log.dropped).toBe(2);
    log.clear();
    expect(log.lines()).toEqual([]);
  });

  it('formats lines with optional local times and kind prefixes', () => {
    const time = new Date(2026, 10, 4, 14, 5, 9, 123).getTime();
    expect(formatClock(time)).toBe('14:05:09.123');
    const log = new MonitorLog();
    log.add('out', 'hello', time);
    log.add('in', 'yes', time);
    log.add('error', 'Traceback', time);
    expect(formatLog(log.lines(), false)).toBe('hello\n> yes\n! Traceback');
    expect(formatLog(log.lines(), true).split('\n')[0]).toBe('14:05:09.123  hello');
  });
});

describe('parsePlotLine', () => {
  it.each([
    [
      '12 -3.5 7',
      [
        ['1', 12],
        ['2', -3.5],
        ['3', 7],
      ],
    ],
    [
      '1e3,2.5;-.5',
      [
        ['1', 1000],
        ['2', 2.5],
        ['3', -0.5],
      ],
    ],
    [
      'angle:90 speed:-120.5',
      [
        ['angle', 90],
        ['speed', -120.5],
      ],
    ],
    [
      'angle = 90, speed: 4',
      [
        ['angle', 90],
        ['speed', 4],
      ],
    ],
    [
      'distance_mm:250\t12',
      [
        ['distance_mm', 250],
        ['2', 12],
      ],
    ],
  ])('plots %j', (line, expected) => {
    expect(parsePlotLine(line).map((sample) => [sample.label, sample.value])).toEqual(expected);
  });

  it.each(['hello', 'angle: ninety', '12 apples', '', 'Traceback (most recent call last):'])(
    'ignores %j',
    (line) => {
      expect(parsePlotLine(line)).toEqual([]);
    },
  );
});

describe('PlotBuffer', () => {
  it('keeps the latest points per series and at most 8 series', () => {
    const buffer = new PlotBuffer(3);
    for (let i = 1; i <= 5; i++) buffer.addLine(`a:${i} b:${i * 10}`, i);
    const [a, b] = buffer.snapshot();
    expect(a).toEqual({ label: 'a', times: [3, 4, 5], values: [3, 4, 5] });
    expect(b?.values).toEqual([30, 40, 50]);
    expect(buffer.addLine('not a number', 6)).toBe(false);
    buffer.addLine(Array.from({ length: 12 }, (_, i) => `s${i}:${i}`).join(' '), 7);
    expect(buffer.snapshot()).toHaveLength(8);
  });
});

describe('MonitorStore', () => {
  it('splits output into lines and plots, notifying once per tick', async () => {
    const { MonitorStore } = await import('./store');
    const ticks: Array<() => void> = [];
    let now = 1000;
    const store = new MonitorStore({
      schedule: (callback) => ticks.push(callback),
      now: () => now++,
    });
    let notified = 0;
    store.subscribe(() => notified++);

    store.pushOutput(bytes('angle:1\nangle:'));
    store.pushOutput(bytes('2\nhello\n'));
    store.note('info', 'Program stopped');
    expect(ticks).toHaveLength(1);
    ticks.shift()?.();
    expect(notified).toBe(1);

    const snapshot = store.getSnapshot();
    expect(snapshot.lines.map((line) => [line.kind, line.text])).toEqual([
      ['out', 'angle:1'],
      ['out', 'angle:2'],
      ['out', 'hello'],
      ['info', 'Program stopped'],
    ]);
    expect(snapshot.series).toEqual([{ label: 'angle', times: [1000, 1001], values: [1, 2] }]);
    expect(store.getSnapshot()).toBe(snapshot);
  });

  it('pauses the plot without pausing the text, and flushes a partial line', async () => {
    const { MonitorStore } = await import('./store');
    const store = new MonitorStore({ schedule: (callback) => callback() });
    store.setPlotPaused(true);
    store.pushOutput(bytes('1 2 3\nlast'));
    expect(store.getSnapshot().series).toEqual([]);
    expect(store.getSnapshot().partial).toBe('last');
    store.endOutput();
    expect(store.getSnapshot().lines.map((line) => line.text)).toEqual(['1 2 3', 'last']);
    store.clearText();
    expect(store.getSnapshot().lines).toEqual([]);
  });
});

describe('plot scale', () => {
  it('computes the visible window and pads a flat line', async () => {
    const { plotDomain } = await import('./scale');
    const series = [{ label: 'a', times: [0, 5000, 9000], values: [100, 5, 7] }];
    expect(plotDomain(series, 6000)).toEqual({ start: 3000, end: 9000, min: 5, max: 7 });
    expect(plotDomain([{ label: 'a', times: [1], values: [0] }], 1000)).toEqual({
      start: -999,
      end: 1,
      min: -1,
      max: 1,
    });
    expect(plotDomain([], 1000)).toBeNull();
  });

  it('makes round ticks, finds the nearest sample, and formats labels', async () => {
    const { formatTick, nearestIndex, niceTicks } = await import('./scale');
    expect(niceTicks(0, 100)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(-3, 7, 4)).toEqual([-2.5, 0, 2.5, 5]);
    expect(niceTicks(0.1, 0.35, 5)).toEqual([0.1, 0.15, 0.2, 0.25, 0.3, 0.35]);
    expect(nearestIndex([0, 10, 20], 14)).toBe(1);
    expect(nearestIndex([0, 10, 20], 16)).toBe(2);
    expect(nearestIndex([], 1)).toBe(-1);
    expect(formatTick(2500)).toBe('2500');
    expect(formatTick(12500)).toBe('12.5K');
    expect(formatTick(0.1 + 0.2)).toBe('0.3');
  });
});
