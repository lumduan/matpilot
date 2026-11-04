/**
 * Shared fixtures for the hardware test unit tests. Test-only: nothing in the app imports this.
 */

import type { HubProbeState } from '../ble/hub-probe';
import type { TestEnvironment } from './environment';
import { applyEvent, createSession, type SessionEvent } from './session';

export const T0 = new Date('2026-11-10T07:00:00.000Z');

export const SUPPORTED_ENV: TestEnvironment = {
  browser: 'Chrome',
  browserMajor: '142',
  browserVersion: '142.0.7444.60',
  os: 'Windows',
  osVersion: '11',
  support: 'supported',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/142.0.0.0',
};

export const UNSUPPORTED_ENV: TestEnvironment = {
  browser: 'Safari',
  browserMajor: '26',
  browserVersion: '26',
  os: 'iOS',
  osVersion: null,
  support: 'unsupported',
  userAgent: 'Mozilla/5.0 (iPhone)',
};

export const HUB = {
  name: 'Pybricks Hub',
  firmwareRevision: '4.0.1',
  firmwareVersion: null,
  protocolRevision: '1.5.0',
  protocolVersion: null,
} as const;

export function probe(state: HubProbeState): SessionEvent {
  return { type: 'probe', state };
}

/** Applies events one second apart. */
export function play(events: readonly SessionEvent[], start = createSession(T0)) {
  return events.reduce(
    (session, event, index) =>
      applyEvent(session, event, new Date(T0.getTime() + (index + 1) * 1000)),
    start,
  );
}

export const FULL_RUN: readonly SessionEvent[] = [
  { type: 'environment', environment: SUPPORTED_ENV },
  { type: 'compat', compat: { ready: true, failedChecks: [] } },
  probe({ status: 'requesting' }),
  probe({ status: 'no-device-selected' }),
  probe({ status: 'requesting' }),
  probe({ status: 'connecting', deviceName: 'Pybricks Hub' }),
  probe({ status: 'connected', hub: HUB }),
  { type: 'picker-answer', answer: 'yes' },
  probe({ status: 'disconnected', deviceName: 'Pybricks Hub', reason: 'connection-lost' }),
];
