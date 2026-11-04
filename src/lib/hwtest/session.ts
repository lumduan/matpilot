/**
 * Hardware test session: the pure state behind the /hardware-test page.
 *
 * The steps are the ones in docs/compatibility.md, "How to verify a row on hardware". Change both
 * together. The session is plain, serialisable data, so it can be kept in the browser's storage
 * and rebuilt into a report at any time.
 */

import type { DisconnectReason, HubProbeState } from '../ble/hub-probe';
import type { TestEnvironment } from './environment';

export const SESSION_SCHEMA = 1;

/** The event log keeps the first entries of a session; later entries are counted, not kept. */
export const MAX_LOG_ENTRIES = 100;

/** Uncaught error messages kept as samples for the report. */
export const MAX_UNCAUGHT_SAMPLES = 5;

export type PickerAnswer = 'yes' | 'no';

export type UncaughtKind = 'error' | 'rejection' | 'csp-violation';

export interface RecordedHub {
  readonly name: string | null;
  readonly firmwareRevision: string;
  readonly protocolRevision: string;
}

export interface CompatSummary {
  readonly ready: boolean;
  /** Titles of the required checks that failed. */
  readonly failedChecks: readonly string[];
}

export interface UncaughtCounts {
  readonly errors: number;
  readonly rejections: number;
  readonly cspViolations: number;
}

export interface LogEntry {
  /** Milliseconds since the session started. */
  readonly atMs: number;
  readonly text: string;
}

export interface HardwareTestSession {
  readonly schema: typeof SESSION_SCHEMA;
  /** ISO 8601 timestamps. */
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly environment: TestEnvironment | null;
  readonly compat: CompatSummary | null;
  readonly pickerOpened: boolean;
  readonly cancelObserved: boolean;
  readonly pickerAnswer: PickerAnswer | null;
  /** The most recent successful read of the hub information. */
  readonly hub: RecordedHub | null;
  /** The most recent probe error, as "Title: message". */
  readonly lastProbeError: string | null;
  /** The link dropped after the hub information was read (step 5). */
  readonly connectionLossObserved: boolean;
  readonly uncaught: UncaughtCounts;
  readonly uncaughtSamples: readonly string[];
  readonly log: readonly LogEntry[];
  readonly droppedLogEntries: number;
}

export type SessionEvent =
  | { readonly type: 'environment'; readonly environment: TestEnvironment }
  | { readonly type: 'compat'; readonly compat: CompatSummary }
  | { readonly type: 'probe'; readonly state: HubProbeState }
  | { readonly type: 'picker-answer'; readonly answer: PickerAnswer }
  | { readonly type: 'uncaught'; readonly kind: UncaughtKind; readonly message: string };

export function createSession(now: Date): HardwareTestSession {
  const iso = now.toISOString();
  return {
    schema: SESSION_SCHEMA,
    startedAt: iso,
    updatedAt: iso,
    environment: null,
    compat: null,
    pickerOpened: false,
    cancelObserved: false,
    pickerAnswer: null,
    hub: null,
    lastProbeError: null,
    connectionLossObserved: false,
    uncaught: { errors: 0, rejections: 0, cspViolations: 0 },
    uncaughtSamples: [],
    log: [],
    droppedLogEntries: 0,
  };
}

/** A fresh session that keeps what is known about the browser (environment, checks). */
export function restartSession(session: HardwareTestSession, now: Date): HardwareTestSession {
  return { ...createSession(now), environment: session.environment, compat: session.compat };
}

function hubLabel(name: string | null): string {
  return name ? `“${name}”` : 'the hub';
}

/** Applies one event. Returns the same object when the event changes nothing. */
export function applyEvent(
  session: HardwareTestSession,
  event: SessionEvent,
  now: Date,
): HardwareTestSession {
  const next = reduce(session, event);
  if (next === null) return session;
  const { changes, log } = next;
  let updated: HardwareTestSession = { ...session, ...changes, updatedAt: now.toISOString() };
  if (log) updated = appendLog(updated, log, now);
  return updated;
}

function reduce(
  session: HardwareTestSession,
  event: SessionEvent,
): { changes: Partial<HardwareTestSession>; log?: string } | null {
  switch (event.type) {
    case 'environment':
      return { changes: { environment: event.environment } };
    case 'compat':
      return {
        changes: { compat: event.compat },
        log: event.compat.ready
          ? 'Compatibility checks passed'
          : `Compatibility checks failed: ${event.compat.failedChecks.join(', ') || 'unknown'}`,
      };
    case 'picker-answer':
      return {
        changes: { pickerAnswer: event.answer },
        log: `Tester answered “${event.answer}”: the picker listed only Pybricks hubs`,
      };
    case 'uncaught':
      return {
        changes: {
          uncaught: countUncaught(session.uncaught, event.kind),
          uncaughtSamples:
            session.uncaughtSamples.length < MAX_UNCAUGHT_SAMPLES
              ? [...session.uncaughtSamples, `${uncaughtLabel(event.kind)}: ${event.message}`]
              : session.uncaughtSamples,
        },
        log: `${uncaughtLabel(event.kind)}: ${event.message}`,
      };
    case 'probe':
      return reduceProbe(event.state);
  }
}

function reduceProbe(
  state: HubProbeState,
): { changes: Partial<HardwareTestSession>; log?: string } | null {
  switch (state.status) {
    case 'idle':
      return null;
    case 'requesting':
      return { changes: { pickerOpened: true }, log: 'Device picker opened' };
    case 'no-device-selected':
      return {
        changes: { cancelObserved: true },
        log: 'Device picker closed without a hub: the app showed “No hub selected”',
      };
    case 'connecting':
      return { changes: {}, log: `Connecting to ${hubLabel(state.deviceName)}` };
    case 'connected':
      return {
        changes: {
          hub: {
            name: state.hub.name,
            firmwareRevision: state.hub.firmwareRevision,
            protocolRevision: state.hub.protocolRevision,
          },
        },
        log: `Connected to ${hubLabel(state.hub.name)}: firmware “${state.hub.firmwareRevision}”, protocol “${state.hub.protocolRevision}”`,
      };
    case 'disconnected':
      return reduceDisconnect(state.reason, state.deviceName);
    case 'error': {
      const text = `${state.error.title}: ${state.error.message}`;
      return { changes: { lastProbeError: text }, log: `Error: ${text}` };
    }
  }
}

function reduceDisconnect(
  reason: DisconnectReason,
  deviceName: string | null,
): { changes: Partial<HardwareTestSession>; log: string } {
  switch (reason) {
    case 'connection-lost':
      return {
        changes: { connectionLossObserved: true },
        log: `Connection to ${hubLabel(deviceName)} lost: the app showed “Hub disconnected”`,
      };
    case 'connection-lost-during-setup':
      return {
        changes: {},
        log: `Connection to ${hubLabel(deviceName)} lost before its information was read`,
      };
    case 'user':
      return { changes: {}, log: 'Disconnected by the tester (Disconnect button)' };
  }
}

function countUncaught(counts: UncaughtCounts, kind: UncaughtKind): UncaughtCounts {
  switch (kind) {
    case 'error':
      return { ...counts, errors: counts.errors + 1 };
    case 'rejection':
      return { ...counts, rejections: counts.rejections + 1 };
    case 'csp-violation':
      return { ...counts, cspViolations: counts.cspViolations + 1 };
  }
}

function uncaughtLabel(kind: UncaughtKind): string {
  switch (kind) {
    case 'error':
      return 'Uncaught error';
    case 'rejection':
      return 'Unhandled promise rejection';
    case 'csp-violation':
      return 'Blocked by the Content Security Policy';
  }
}

function appendLog(session: HardwareTestSession, text: string, now: Date): HardwareTestSession {
  if (session.log.length >= MAX_LOG_ENTRIES) {
    return { ...session, droppedLogEntries: session.droppedLogEntries + 1 };
  }
  const atMs = Math.max(0, now.getTime() - Date.parse(session.startedAt));
  return { ...session, log: [...session.log, { atMs, text }] };
}

// ---------------------------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------------------------

export type TestMode =
  /** The compatibility checks have not finished yet. */
  | 'pending'
  /** The five-step test for a supported (or untested) browser and platform. */
  | 'supported'
  /** The browser cannot use Web Bluetooth: verify the unsupported-browser behaviour instead. */
  | 'unsupported';

export type StepId = 'checks' | 'cancel' | 'picker' | 'hub-info' | 'hub-off' | 'unsupported';

export type StepStatus = 'pass' | 'fail' | 'waiting' | 'answer-needed';

export interface StepResult {
  readonly id: StepId;
  readonly number: number;
  readonly title: string;
  readonly status: StepStatus;
  /** What happened, or what to do next. */
  readonly detail: string;
}

export function testMode(session: HardwareTestSession): TestMode {
  if (session.compat === null) return 'pending';
  if (session.compat.ready) return 'supported';
  // A supported browser can fail a check for a fixable reason (Bluetooth switched off): keep the
  // supported test, where step 1 shows the failure and "Run checks again" can recover.
  return session.environment?.support === 'supported' ? 'supported' : 'unsupported';
}

export function uncaughtExceptionCount(session: HardwareTestSession): number {
  return session.uncaught.errors + session.uncaught.rejections;
}

export function deriveSteps(session: HardwareTestSession): readonly StepResult[] {
  if (testMode(session) === 'unsupported') {
    const failed = session.compat?.failedChecks.join(', ') || 'unknown';
    return [
      {
        id: 'unsupported',
        number: 1,
        title: 'Unsupported browser: message shown and Connect to hub disabled',
        status: 'pass',
        detail: `The page shows the unsupported-browser message naming the supported browsers and platforms, and Connect to hub is disabled. Failed checks: ${failed}.`,
      },
    ];
  }
  return [
    checksStep(session),
    cancelStep(session),
    pickerStep(session),
    hubInfoStep(session),
    hubOffStep(session),
  ];
}

function checksStep(session: HardwareTestSession): StepResult {
  const base = { id: 'checks', number: 1, title: 'Compatibility checks pass' } as const;
  if (session.compat === null) {
    return { ...base, status: 'waiting', detail: 'Checking this browser…' };
  }
  if (session.compat.ready) {
    return { ...base, status: 'pass', detail: 'Every required check passed.' };
  }
  return {
    ...base,
    status: 'fail',
    detail: `Failed: ${session.compat.failedChecks.join(', ')}. Fix this, then click Run checks again.`,
  };
}

function cancelStep(session: HardwareTestSession): StepResult {
  const base = {
    id: 'cancel',
    number: 2,
    title: 'Cancel in the device picker shows “No hub selected”',
  } as const;
  return session.cancelObserved
    ? { ...base, status: 'pass', detail: 'The app showed “No hub selected”.' }
    : {
        ...base,
        status: 'waiting',
        detail: 'Click Connect to hub, then click Cancel in the browser’s device picker.',
      };
}

function pickerStep(session: HardwareTestSession): StepResult {
  const base = {
    id: 'picker',
    number: 3,
    title: 'The device picker lists only Pybricks hubs',
  } as const;
  if (session.pickerAnswer === 'yes') {
    return { ...base, status: 'pass', detail: 'Tester confirmed: only Pybricks hubs were listed.' };
  }
  if (session.pickerAnswer === 'no') {
    return { ...base, status: 'fail', detail: 'Tester reported other devices in the picker.' };
  }
  if (session.pickerOpened) {
    return {
      ...base,
      status: 'answer-needed',
      detail:
        'The page cannot see the browser’s picker. Did it list only Pybricks hubs, and no other Bluetooth devices?',
    };
  }
  return { ...base, status: 'waiting', detail: 'Open the device picker with Connect to hub.' };
}

function hubInfoStep(session: HardwareTestSession): StepResult {
  const base = {
    id: 'hub-info',
    number: 4,
    title: 'Choosing the hub shows its name, firmware, and protocol version',
  } as const;
  const { hub } = session;
  if (hub) {
    if (!hub.firmwareRevision || !hub.protocolRevision) {
      return {
        ...base,
        status: 'fail',
        detail: 'The hub returned an empty firmware revision or protocol version.',
      };
    }
    return {
      ...base,
      status: 'pass',
      detail: `Name ${hub.name ? `“${hub.name}”` : '(none reported)'}, firmware ${hub.firmwareRevision}, protocol ${hub.protocolRevision}.`,
    };
  }
  if (session.lastProbeError) {
    return {
      ...base,
      status: 'fail',
      detail: `${session.lastProbeError} Click Connect to hub to try again.`,
    };
  }
  return {
    ...base,
    status: 'waiting',
    detail: 'Click Connect to hub and choose your hub in the device picker.',
  };
}

function hubOffStep(session: HardwareTestSession): StepResult {
  const base = {
    id: 'hub-off',
    number: 5,
    title: 'Turning the hub off shows “Hub disconnected”, with no uncaught exception',
  } as const;
  const exceptions = uncaughtExceptionCount(session);
  if (!session.connectionLossObserved) {
    return {
      ...base,
      status: 'waiting',
      detail:
        'While connected, turn the hub off with its button. Do not click Disconnect: that tests something else.',
    };
  }
  return exceptions === 0
    ? {
        ...base,
        status: 'pass',
        detail: 'The app showed “Hub disconnected”, and no uncaught exception was recorded.',
      }
    : {
        ...base,
        status: 'fail',
        detail: `The app showed “Hub disconnected”, but ${exceptions} uncaught exception${exceptions === 1 ? ' was' : 's were'} recorded during the test.`,
      };
}

export interface TestSummary {
  readonly mode: TestMode;
  readonly passed: number;
  readonly total: number;
  /** Every step has a final result (pass or fail). */
  readonly complete: boolean;
  /** Every step passed. */
  readonly allPassed: boolean;
}

export function summarize(session: HardwareTestSession): TestSummary {
  const steps = deriveSteps(session);
  const passed = steps.filter((step) => step.status === 'pass').length;
  const complete = steps.every((step) => step.status === 'pass' || step.status === 'fail');
  return {
    mode: testMode(session),
    passed,
    total: steps.length,
    complete,
    allPassed: complete && passed === steps.length,
  };
}
