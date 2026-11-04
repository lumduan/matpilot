/**
 * Counts uncaught exceptions and Content Security Policy violations on the page, so a hardware
 * test can confirm "no uncaught exception" without the tester opening the developer console.
 *
 * CSP violations come from a `ReportingObserver` with `buffered: true` where available, which
 * also returns violations from before the page's scripts started (for example a script a proxy
 * injected into the HTML). Otherwise they come from `securitypolicyviolation` events.
 */

import type { UncaughtKind } from './session';

export interface UncaughtInfo {
  readonly kind: UncaughtKind;
  readonly message: string;
}

export interface EventTargetLike {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

/** The parts of a CSP violation report body this module reads. */
interface CspReportBodyLike {
  readonly blockedURL?: string | null;
  readonly effectiveDirective?: string;
}

export interface ReportLike {
  readonly type: string;
  readonly body?: unknown;
}

export interface ReportingObserverLike {
  observe(): void;
  disconnect(): void;
}

export type ReportingObserverConstructorLike = new (
  callback: (reports: readonly ReportLike[]) => void,
  options: { types: string[]; buffered: boolean },
) => ReportingObserverLike;

export interface MonitorGlobalsLike extends EventTargetLike {
  readonly ReportingObserver?: ReportingObserverConstructorLike;
}

function describeReason(reason: unknown): string {
  if (reason instanceof Error) return reason.message || reason.name;
  if (typeof reason === 'string') return reason;
  try {
    return JSON.stringify(reason) ?? String(reason);
  } catch {
    return String(reason);
  }
}

function describeCsp(body: CspReportBodyLike | undefined): string {
  const blocked = body?.blockedURL || 'inline content';
  const directive = body?.effectiveDirective ? ` (${body.effectiveDirective})` : '';
  return `${blocked}${directive}`;
}

/** Starts watching. Returns a function that stops watching. */
export function watchUncaught(
  onEvent: (info: UncaughtInfo) => void,
  globals: MonitorGlobalsLike = globalThis as unknown as MonitorGlobalsLike,
): () => void {
  const onError = (event: Event) => {
    const { message, error } = event as ErrorEvent;
    onEvent({ kind: 'error', message: message || describeReason(error) || 'unknown error' });
  };
  const onRejection = (event: Event) => {
    onEvent({
      kind: 'rejection',
      message: describeReason((event as PromiseRejectionEvent).reason),
    });
  };
  globals.addEventListener('error', onError);
  globals.addEventListener('unhandledrejection', onRejection);

  let stopCsp: () => void;
  const Observer = globals.ReportingObserver;
  if (typeof Observer === 'function') {
    const observer = new Observer(
      (reports) => {
        for (const report of reports) {
          if (report.type !== 'csp-violation') continue;
          onEvent({
            kind: 'csp-violation',
            message: describeCsp(report.body as CspReportBodyLike | undefined),
          });
        }
      },
      { types: ['csp-violation'], buffered: true },
    );
    observer.observe();
    stopCsp = () => observer.disconnect();
  } else {
    const onViolation = (event: Event) => {
      onEvent({
        kind: 'csp-violation',
        message: describeCsp(event as SecurityPolicyViolationEvent),
      });
    };
    globals.addEventListener('securitypolicyviolation', onViolation);
    stopCsp = () => globals.removeEventListener('securitypolicyviolation', onViolation);
  }

  return () => {
    globals.removeEventListener('error', onError);
    globals.removeEventListener('unhandledrejection', onRejection);
    stopCsp();
  };
}
