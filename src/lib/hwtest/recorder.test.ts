import { describe, expect, it, vi } from 'vitest';
import { HubProbe, type BluetoothLike, type HubProbeState } from '../ble/hub-probe';
import { HardwareTestRecorder } from './recorder';
import { createSession, type HardwareTestSession } from './session';
import {
  SESSION_STORAGE_KEY,
  isSession,
  loadSession,
  saveSession,
  type StorageLike,
} from './storage';
import { FULL_RUN, SUPPORTED_ENV, T0, play } from './test-fixtures';

class MemoryStorage implements StorageLike {
  readonly items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

function clock(start = T0) {
  let now = start.getTime();
  return () => new Date((now += 1000));
}

describe('session storage', () => {
  it('round-trips a session', () => {
    const storage = new MemoryStorage();
    const session = play(FULL_RUN);
    saveSession(storage, session);
    expect(loadSession(storage)).toEqual(session);
  });

  it('discards malformed, foreign, or older data', () => {
    const storage = new MemoryStorage();
    for (const raw of [
      'not json',
      'null',
      '[]',
      JSON.stringify({ ...createSession(T0), schema: 0 }),
      JSON.stringify({
        ...createSession(T0),
        uncaught: { errors: -1, rejections: 0, cspViolations: 0 },
      }),
      JSON.stringify({ ...createSession(T0), pickerAnswer: 'maybe' }),
      JSON.stringify({ ...createSession(T0), startedAt: 'yesterday' }),
      JSON.stringify({ ...createSession(T0), environment: { browser: 'Chrome' } }),
      JSON.stringify({ ...createSession(T0), log: [{ atMs: 1.5, text: 'x' }] }),
    ]) {
      storage.setItem(SESSION_STORAGE_KEY, raw);
      expect(loadSession(storage), raw).toBeNull();
    }
    expect(isSession(play(FULL_RUN))).toBe(true);
  });

  it('does nothing when storage is missing or throws', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(loadSession(undefined)).toBeNull();
    expect(loadSession(throwing)).toBeNull();
    expect(() => saveSession(throwing, createSession(T0))).not.toThrow();
  });
});

describe('HardwareTestRecorder', () => {
  it('records events, notifies subscribers, and saves to storage', () => {
    const storage = new MemoryStorage();
    const recorder = new HardwareTestRecorder({ now: clock() });
    recorder.connectStorage(storage);
    const seen: HardwareTestSession[] = [];
    recorder.subscribe((session) => seen.push(session));

    recorder.record({ type: 'environment', environment: SUPPORTED_ENV });

    expect(seen).toHaveLength(1);
    expect(recorder.getState().environment).toEqual(SUPPORTED_ENV);
    expect(loadSession(storage)).toEqual(recorder.getState());
  });

  it('restores a saved session when storage is connected', () => {
    const storage = new MemoryStorage();
    const saved = play(FULL_RUN);
    saveSession(storage, saved);
    const recorder = new HardwareTestRecorder({ now: clock() });
    recorder.connectStorage(storage);
    expect(recorder.getState()).toEqual(saved);
  });

  it('restarts with the browser facts kept and clears storage first', () => {
    const storage = new MemoryStorage();
    const recorder = new HardwareTestRecorder({ now: clock() });
    recorder.connectStorage(storage);
    for (const event of FULL_RUN) recorder.record(event);
    recorder.restart();
    const state = recorder.getState();
    expect(state.hub).toBeNull();
    expect(state.environment).toEqual(SUPPORTED_ENV);
    expect(loadSession(storage)).toEqual(state);
  });

  it('records every hub probe transition, including short-lived ones', async () => {
    const recorder = new HardwareTestRecorder({ now: clock() });
    const cancelled = Object.assign(new Error('User cancelled the requestDevice() chooser.'), {
      name: 'NotFoundError',
    });
    const bluetooth: BluetoothLike = { requestDevice: vi.fn(() => Promise.reject(cancelled)) };
    const probe = new HubProbe(bluetooth);
    const stop = recorder.attachProbe(probe);

    await probe.connect();
    const statuses = recorder.getState().log.map((entry) => entry.text);
    expect(statuses).toEqual([
      'Device picker opened',
      'Device picker closed without a hub: the app showed “No hub selected”',
    ]);
    expect(recorder.getState()).toMatchObject({ pickerOpened: true, cancelObserved: true });

    stop();
    const before = recorder.getState();
    await probe.connect();
    expect(recorder.getState()).toBe(before);
  });

  it('ignores probe states that change nothing', () => {
    const recorder = new HardwareTestRecorder({ now: clock() });
    const listener = vi.fn();
    recorder.subscribe(listener);
    const idle: HubProbeState = { status: 'idle' };
    recorder.record({ type: 'probe', state: idle });
    expect(listener).not.toHaveBeenCalled();
  });
});
