import { describe, expect, it } from 'vitest';
import {
  MAX_LOG_ENTRIES,
  MAX_UNCAUGHT_SAMPLES,
  applyEvent,
  createSession,
  currentStepId,
  deriveSteps,
  liveHint,
  restartSession,
  summarize,
  testMode,
  type HardwareTestSession,
  type SessionEvent,
  type StepId,
} from './session';
import { FULL_RUN, HUB, SUPPORTED_ENV, T0, UNSUPPORTED_ENV, play, probe } from './test-fixtures';

function statuses(session: HardwareTestSession): Record<string, string> {
  return Object.fromEntries(deriveSteps(session).map((step) => [step.id, step.status]));
}

function step(session: HardwareTestSession, id: StepId) {
  const found = deriveSteps(session).find((item) => item.id === id);
  if (!found) throw new Error(`no step ${id}`);
  return found;
}

describe('hardware test session', () => {
  it('starts with every step waiting and the mode pending', () => {
    const session = createSession(T0);
    expect(testMode(session)).toBe('pending');
    expect(statuses(session)).toEqual({
      checks: 'waiting',
      cancel: 'waiting',
      picker: 'waiting',
      'hub-info': 'waiting',
      'hub-off': 'waiting',
    });
    expect(summarize(session)).toMatchObject({ passed: 0, total: 5, complete: false });
  });

  it('passes all five steps for a complete run', () => {
    const session = play(FULL_RUN);
    expect(Object.values(statuses(session))).toEqual(['pass', 'pass', 'pass', 'pass', 'pass']);
    expect(summarize(session)).toEqual({
      mode: 'supported',
      passed: 5,
      total: 5,
      complete: true,
      allPassed: true,
    });
    expect(step(session, 'hub-info').detail).toBe(
      'Name “Pybricks Hub”, firmware 4.0.1, protocol 1.5.0.',
    );
  });

  it('asks for the picker answer once the picker has opened', () => {
    const session = play([
      { type: 'compat', compat: { ready: true, failedChecks: [] } },
      probe({ status: 'requesting' }),
    ]);
    expect(step(session, 'picker').status).toBe('answer-needed');
    expect(step(session, 'cancel').status).toBe('waiting');
  });

  it('fails the picker step when the tester saw other devices', () => {
    const session = play([...FULL_RUN, { type: 'picker-answer', answer: 'no' }]);
    expect(step(session, 'picker').status).toBe('fail');
    expect(summarize(session)).toMatchObject({ complete: true, allPassed: false, passed: 4 });
  });

  it('does not count a Disconnect click or a loss during setup as step 5', () => {
    const base = FULL_RUN.slice(0, -1);
    for (const reason of ['user', 'connection-lost-during-setup'] as const) {
      const session = play([
        ...base,
        probe({ status: 'disconnected', deviceName: 'Pybricks Hub', reason }),
      ]);
      expect(step(session, 'hub-off').status).toBe('waiting');
    }
  });

  it('fails step 5 when an uncaught exception was recorded', () => {
    const session = play([...FULL_RUN, { type: 'uncaught', kind: 'error', message: 'boom' }]);
    expect(step(session, 'hub-off')).toMatchObject({ status: 'fail' });
    expect(step(session, 'hub-off').detail).toContain('1 uncaught exception was recorded');
  });

  it('does not fail step 5 for CSP violations alone', () => {
    const session = play([
      ...FULL_RUN,
      { type: 'uncaught', kind: 'csp-violation', message: 'https://cdn.example/x.js' },
    ]);
    expect(step(session, 'hub-off').status).toBe('pass');
    expect(session.uncaught).toEqual({ errors: 0, rejections: 0, cspViolations: 1 });
  });

  it('reports a probe error on step 4 until a later connection succeeds', () => {
    const error = {
      kind: 'connect-failed',
      title: 'Could not connect to the hub',
      message: 'Try again.',
      detail: null,
    } as const;
    const failed = play([
      { type: 'compat', compat: { ready: true, failedChecks: [] } },
      probe({ status: 'error', error, deviceName: null }),
    ]);
    expect(step(failed, 'hub-info')).toMatchObject({ status: 'fail' });
    expect(step(failed, 'hub-info').detail).toContain('Could not connect to the hub: Try again.');

    const recovered = play([probe({ status: 'connected', hub: HUB })], failed);
    expect(step(recovered, 'hub-info').status).toBe('pass');
  });

  it('fails step 4 when the hub returns empty revision strings', () => {
    const session = play([
      { type: 'compat', compat: { ready: true, failedChecks: [] } },
      probe({ status: 'connected', hub: { ...HUB, firmwareRevision: '' } }),
    ]);
    expect(step(session, 'hub-info').status).toBe('fail');
  });

  it('keeps the supported test when a supported browser fails a check', () => {
    const session = play([
      { type: 'environment', environment: SUPPORTED_ENV },
      {
        type: 'compat',
        compat: { ready: false, failedChecks: ['Bluetooth adapter available'] },
      },
    ]);
    expect(testMode(session)).toBe('supported');
    expect(step(session, 'checks')).toMatchObject({ status: 'fail' });
    expect(step(session, 'checks').detail).toContain('Bluetooth adapter available');
  });

  it('switches to the one-step unsupported check on an unsupported browser', () => {
    const session = play([
      { type: 'environment', environment: UNSUPPORTED_ENV },
      {
        type: 'compat',
        compat: { ready: false, failedChecks: ['Web Bluetooth API'] },
      },
    ]);
    expect(testMode(session)).toBe('unsupported');
    expect(deriveSteps(session).map((item) => [item.id, item.status])).toEqual([
      ['unsupported', 'pass'],
    ]);
    expect(summarize(session)).toMatchObject({ allPassed: true, total: 1 });
  });

  it('logs events with their offset from the start', () => {
    const session = play(FULL_RUN);
    expect(session.log[0]).toEqual({ atMs: 2000, text: 'Compatibility checks passed' });
    expect(session.log.map((entry) => entry.text)).toContain(
      'Connection to “Pybricks Hub” lost: the app showed “Hub disconnected”',
    );
    expect(session.updatedAt).toBe(new Date(T0.getTime() + FULL_RUN.length * 1000).toISOString());
  });

  it('caps the log and the uncaught samples', () => {
    const events: SessionEvent[] = Array.from({ length: MAX_LOG_ENTRIES + 7 }, (_, index) => ({
      type: 'uncaught',
      kind: 'rejection',
      message: `r${index}`,
    }));
    const session = play(events);
    expect(session.log).toHaveLength(MAX_LOG_ENTRIES);
    expect(session.droppedLogEntries).toBe(7);
    expect(session.uncaughtSamples).toHaveLength(MAX_UNCAUGHT_SAMPLES);
    expect(session.uncaught.rejections).toBe(MAX_LOG_ENTRIES + 7);
  });

  it('ignores the idle state and returns the same object', () => {
    const session = createSession(T0);
    expect(applyEvent(session, probe({ status: 'idle' }), T0)).toBe(session);
  });

  it('restarts with the browser facts kept and the results cleared', () => {
    const restarted = restartSession(play(FULL_RUN), new Date('2026-11-11T00:00:00Z'));
    expect(restarted.environment).toEqual(SUPPORTED_ENV);
    expect(restarted.compat).toEqual({ ready: true, failedChecks: [] });
    expect(restarted.hub).toBeNull();
    expect(restarted.log).toEqual([]);
    expect(restarted.startedAt).toBe('2026-11-11T00:00:00.000Z');
    expect(summarize(restarted).passed).toBe(1);
  });
});

describe('live guidance', () => {
  const connectedFirst = play([
    { type: 'compat', compat: { ready: true, failedChecks: [] } },
    probe({ status: 'requesting' }),
    probe({ status: 'connecting', deviceName: 'Pybricks Hub' }),
    probe({ status: 'connected', hub: HUB }),
  ]);

  it('points to the first open step when no hub is connected', () => {
    expect(currentStepId(deriveSteps(connectedFirst), 'idle')).toBe('cancel');
    expect(liveHint('cancel', 'idle')).toBeNull();
  });

  it('points to step 5 while connected, because step 2 needs the picker', () => {
    expect(currentStepId(deriveSteps(connectedFirst), 'connected')).toBe('hub-off');
    expect(liveHint('hub-off', 'connected')).toBe(
      'Connected. Now turn the hub off with its button.',
    );
  });

  it('asks for Disconnect before step 2 once step 5 has passed while connected', () => {
    const afterLoss = play(
      [
        probe({ status: 'disconnected', deviceName: 'Pybricks Hub', reason: 'connection-lost' }),
        probe({ status: 'requesting' }),
        probe({ status: 'connected', hub: HUB }),
      ],
      connectedFirst,
    );
    expect(currentStepId(deriveSteps(afterLoss), 'connected')).toBe('cancel');
    expect(liveHint('cancel', 'connected')).toContain('Click Disconnect first');
  });

  it('tells the tester not to choose the hub in step 2', () => {
    expect(step(createSession(T0), 'cancel').detail).toContain('do not choose the hub');
  });

  it('logs repeated identical compatibility results only once', () => {
    const compat: SessionEvent = { type: 'compat', compat: { ready: true, failedChecks: [] } };
    const once = play([compat]);
    expect(applyEvent(once, compat, T0)).toBe(once);
    const changed = applyEvent(
      once,
      { type: 'compat', compat: { ready: false, failedChecks: ['Secure context'] } },
      T0,
    );
    expect(changed.log.map((entry) => entry.text)).toEqual([
      'Compatibility checks passed',
      'Compatibility checks failed: Secure context',
    ]);
  });
});
