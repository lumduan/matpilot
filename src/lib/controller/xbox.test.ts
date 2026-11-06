import { describe, expect, it } from 'vitest';
import { MonitorStore } from '../monitor/store';
import { ControllerTracker, IDLE_CONTROLLER, parseControllerLine } from './xbox';

describe('parseControllerLine', () => {
  it('reads status words and value lines', () => {
    expect(parseControllerLine('@xbx searching')).toEqual({ kind: 'status', status: 'searching' });
    expect(parseControllerLine(' @xbx lost \r')).toEqual({ kind: 'status', status: 'lost' });
    expect(parseControllerLine('@xbx -100 0 3 -7 0 100 0')).toMatchObject({
      kind: 'values',
      values: { leftX: -100, leftY: 0, rightX: 3, rightY: -7, rightTrigger: 100, pressed: [] },
    });
    // Bit 4 is LB, bit 14 the Xbox button.
    expect(parseControllerLine('@xbx 0 0 0 0 0 0 16400')).toMatchObject({
      values: { pressed: ['LB', 'GUIDE'] },
    });
  });

  it('ignores other lines and malformed ones', () => {
    expect(parseControllerLine('left_x: 1 left_y: 2')).toBeNull();
    expect(parseControllerLine('@xbxx 1 2 3 4 5 6 7')).toBeNull();
    expect(parseControllerLine('@xbx 1 2 3')).toBeNull();
    expect(parseControllerLine('@xbx 1 2 3 4 5 6 x')).toBeNull();
    expect(parseControllerLine('@xbx dancing')).toBeNull();
  });
});

describe('ControllerTracker', () => {
  it('follows a run: searching, values, then how it ended', () => {
    const tracker = new ControllerTracker();
    expect(tracker.snapshot).toBe(IDLE_CONTROLLER);
    expect(tracker.push('@xbx searching', 1)).toBe(true);
    expect(tracker.snapshot.status).toBe('searching');
    tracker.push('@xbx connected', 2);
    tracker.push('@xbx 0 50 0 0 0 0 1', 3);
    expect(tracker.snapshot).toMatchObject({ status: 'connected', valuesAt: 3 });
    expect(tracker.snapshot.values?.pressed).toEqual(['A']);
    tracker.push('@xbx menu', 4);
    tracker.end();
    expect(tracker.snapshot.status).toBe('menu');
    // A new run clears the old values.
    tracker.push('@xbx searching', 5);
    expect(tracker.snapshot).toEqual({ status: 'searching', values: null, valuesAt: 0 });
    tracker.end();
    expect(tracker.snapshot.status).toBe('ended');
  });

  it('consumes malformed @xbx lines without changing anything', () => {
    const tracker = new ControllerTracker();
    expect(tracker.push('@xbx 1 2', 1)).toBe(true);
    expect(tracker.push('hello', 1)).toBe(false);
    expect(tracker.snapshot).toBe(IDLE_CONTROLLER);
  });
});

describe('MonitorStore and the controller', () => {
  it('keeps @xbx lines out of the text monitor and the plotter', () => {
    const store = new MonitorStore({ schedule: (callback) => callback(), now: () => 1000 });
    store.pushOutput(
      new TextEncoder().encode('@xbx searching\nhi\n@xbx 1 2 3 4 5 6 0\nangle: 5\n'),
    );
    const snapshot = store.getSnapshot();
    expect(snapshot.lines.map((line) => line.text)).toEqual(['hi', 'angle: 5']);
    expect(snapshot.series.map((series) => series.label)).toEqual(['angle']);
    expect(snapshot.controller).toMatchObject({ status: 'connected', values: { leftY: 2 } });
    store.endOutput();
    expect(store.getSnapshot().controller.status).toBe('ended');
  });
});
