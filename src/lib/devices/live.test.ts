import { describe, expect, it } from 'vitest';
import { deviceName, LiveStore, parseLiveLine, parsePort } from './live';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('parsePort', () => {
  it('reads each kind of device', () => {
    expect(parsePort('-')).toBeNull();
    expect(parsePort('49:-90,360')).toEqual({ kind: 'motor', typeId: 49, angle: -90, speed: 360 });
    expect(parsePort('61:0,45')).toEqual({
      kind: 'color',
      typeId: 61,
      color: 'RED',
      reflection: 45,
    });
    expect(parsePort('61:5,3')).toMatchObject({ color: 'NONE' });
    expect(parsePort('61:-1,3')).toMatchObject({ color: null });
    expect(parsePort('62:340')).toEqual({ kind: 'distance', typeId: 62, distance: 340 });
    expect(parsePort('62:2000')).toEqual({ kind: 'distance', typeId: 62, distance: null });
    expect(parsePort('63:25,1')).toEqual({ kind: 'force', typeId: 63, force: 2.5, pressed: true });
    expect(parsePort('64:')).toEqual({ kind: 'other', typeId: 64 });
  });

  it('rejects malformed tokens', () => {
    expect(parsePort('')).toBeUndefined();
    expect(parsePort('49:1')).toBeUndefined();
    expect(parsePort('62:1,2')).toBeUndefined();
    expect(parsePort('x:1,2')).toBeUndefined();
    expect(parsePort('49:1.5,2')).toBeUndefined();
  });
});

describe('parseLiveLine', () => {
  it('parses a full reading', () => {
    expect(parseLiveLine('@mpv 49:12,0 48:0,0 - 61:3,80 62:2000 63:0,0 -3,7')).toEqual({
      type: 'reading',
      reading: {
        ports: {
          A: { kind: 'motor', typeId: 49, angle: 12, speed: 0 },
          B: { kind: 'motor', typeId: 48, angle: 0, speed: 0 },
          C: null,
          D: { kind: 'color', typeId: 61, color: 'BLUE', reflection: 80 },
          E: { kind: 'distance', typeId: 62, distance: null },
          F: { kind: 'force', typeId: 63, force: 0, pressed: false },
        },
        tilt: { pitch: -3, roll: 7 },
      },
    });
  });

  it('parses the start, end and error lines', () => {
    expect(parseLiveLine('@mpv start 1')).toEqual({ type: 'start' });
    expect(parseLiveLine('@mpv end timeout')).toEqual({ type: 'end', reason: 'timeout' });
    expect(parseLiveLine('@mpv error OSError(19,)')).toEqual({
      type: 'error',
      message: 'OSError(19,)',
    });
  });

  it('ignores the REPL’s own text, including the echo of the reader’s source', () => {
    for (const line of [
      '>>> ',
      '=== ',
      '    print("@mpv start 1")',
      'print("@mpv", " ".join(parts))',
      '@mpv - - - - - -',
      '@mpv 49:1,2 - - - - - 1,2 extra',
    ]) {
      expect(parseLiveLine(line), line).toBeNull();
    }
  });
});

describe('LiveStore', () => {
  it('keeps the latest reading across split notifications and REPL noise', () => {
    const ticks: (() => void)[] = [];
    const store = new LiveStore({ schedule: (callback) => ticks.push(callback) });
    let heard = 0;
    store.subscribe(() => heard++);

    store.push(bytes('>>> \r\npaste mode\r\n=== x = 1\r\n\r\n@mpv sta'));
    store.push(bytes('rt 1\r\n@mpv 49:5,0 - - - - - 0,0\r\n@mpv 49:6'));
    expect(store.getSnapshot().started).toBe(true);
    expect(store.getSnapshot().reading?.ports.A).toMatchObject({ angle: 5 });
    store.push(bytes(',0 - - - - - 0,0\r\n'));
    expect(store.getSnapshot().reading?.ports.A).toMatchObject({ angle: 6 });

    for (const tick of ticks.splice(0)) tick();
    expect(heard).toBe(1);

    store.push(bytes('@mpv end timeout\r\n'));
    expect(store.getSnapshot().ended).toBe('timeout');
    store.begin();
    expect(store.getSnapshot()).toMatchObject({ started: false, ended: null });
    expect(store.getSnapshot().reading?.ports.A).toMatchObject({ angle: 6 });

    store.push(bytes('@mpv error OSError(5,)\n'));
    expect(store.getSnapshot()).toMatchObject({ ended: 'error', error: 'OSError(5,)' });
    store.clear();
    expect(store.getSnapshot().reading).toBeNull();
  });
});

describe('deviceName', () => {
  it('names known devices and numbers unknown ones', () => {
    expect(deviceName(49)).toBe('large motor');
    expect(deviceName(63)).toBe('touch sensor');
    expect(deviceName(200)).toBe('device 200');
  });
});
