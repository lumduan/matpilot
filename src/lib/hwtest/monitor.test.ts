import { describe, expect, it, vi } from 'vitest';
import {
  watchUncaught,
  type MonitorGlobalsLike,
  type ReportLike,
  type ReportingObserverConstructorLike,
  type UncaughtInfo,
} from './monitor';

function errorEvent(message: string, error?: unknown): Event {
  return Object.assign(new Event('error'), { message, error });
}

function rejectionEvent(reason: unknown): Event {
  return Object.assign(new Event('unhandledrejection'), { reason });
}

function violationEvent(blockedURL: string, effectiveDirective: string): Event {
  return Object.assign(new Event('securitypolicyviolation'), { blockedURL, effectiveDirective });
}

function fakeObserver() {
  const instances: Array<{
    callback: (reports: readonly ReportLike[]) => void;
    options: { types: string[]; buffered: boolean };
    observed: boolean;
    disconnected: boolean;
  }> = [];
  const Observer = class {
    readonly entry;
    constructor(
      callback: (reports: readonly ReportLike[]) => void,
      options: { types: string[]; buffered: boolean },
    ) {
      this.entry = { callback, options, observed: false, disconnected: false };
      instances.push(this.entry);
    }
    observe() {
      this.entry.observed = true;
    }
    disconnect() {
      this.entry.disconnected = true;
    }
  } satisfies ReportingObserverConstructorLike;
  return { Observer, instances };
}

describe('watchUncaught', () => {
  it('reports uncaught errors and unhandled rejections', () => {
    const target = new EventTarget();
    const seen: UncaughtInfo[] = [];
    const stop = watchUncaught((info) => seen.push(info), target);

    target.dispatchEvent(errorEvent('ReferenceError: x is not defined'));
    target.dispatchEvent(errorEvent('', new TypeError('bad type')));
    target.dispatchEvent(rejectionEvent(new Error('GATT operation failed')));
    target.dispatchEvent(rejectionEvent('plain reason'));
    target.dispatchEvent(rejectionEvent({ code: 7 }));

    expect(seen).toEqual([
      { kind: 'error', message: 'ReferenceError: x is not defined' },
      { kind: 'error', message: 'bad type' },
      { kind: 'rejection', message: 'GATT operation failed' },
      { kind: 'rejection', message: 'plain reason' },
      { kind: 'rejection', message: '{"code":7}' },
    ]);

    stop();
    target.dispatchEvent(errorEvent('after stop'));
    expect(seen).toHaveLength(5);
  });

  it('uses a buffered ReportingObserver for CSP violations when available', () => {
    const target = new EventTarget();
    const { Observer, instances } = fakeObserver();
    const globals: MonitorGlobalsLike = Object.assign(target, { ReportingObserver: Observer });
    const seen: UncaughtInfo[] = [];
    const stop = watchUncaught((info) => seen.push(info), globals);

    expect(instances).toHaveLength(1);
    expect(instances[0]?.options).toEqual({ types: ['csp-violation'], buffered: true });
    expect(instances[0]?.observed).toBe(true);

    instances[0]?.callback([
      {
        type: 'csp-violation',
        body: {
          blockedURL: 'https://static.example/beacon.min.js',
          effectiveDirective: 'script-src-elem',
        },
      },
      { type: 'deprecation', body: {} },
      { type: 'csp-violation', body: { blockedURL: '', effectiveDirective: 'style-src-attr' } },
    ]);
    // The event path is not used when the observer exists, so nothing is counted twice.
    target.dispatchEvent(violationEvent('https://static.example/other.js', 'script-src-elem'));

    expect(seen).toEqual([
      {
        kind: 'csp-violation',
        message: 'https://static.example/beacon.min.js (script-src-elem)',
      },
      { kind: 'csp-violation', message: 'inline content (style-src-attr)' },
    ]);

    stop();
    expect(instances[0]?.disconnected).toBe(true);
  });

  it('falls back to securitypolicyviolation events without ReportingObserver', () => {
    const target = new EventTarget();
    const onEvent = vi.fn();
    const stop = watchUncaught(onEvent, target);
    target.dispatchEvent(violationEvent('https://cdn.example/a.js', 'script-src-elem'));
    expect(onEvent).toHaveBeenCalledWith({
      kind: 'csp-violation',
      message: 'https://cdn.example/a.js (script-src-elem)',
    });
    stop();
    target.dispatchEvent(violationEvent('https://cdn.example/b.js', 'script-src-elem'));
    expect(onEvent).toHaveBeenCalledTimes(1);
  });
});
