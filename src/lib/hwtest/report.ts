/**
 * Plain-text hardware test report, built from a session. Pure: the same session always gives the
 * same text, dated by the session's last update in the tester's local time zone.
 */

import { TESTED_FIRMWARE_VERSION } from '../pybricks/baseline';
import type { TestEnvironment } from './environment';
import {
  deriveSteps,
  summarize,
  testMode,
  uncaughtExceptionCount,
  type HardwareTestSession,
  type StepStatus,
} from './session';

const STATUS_LABELS: Record<StepStatus, string> = {
  pass: 'PASS',
  fail: 'FAIL',
  waiting: 'NOT DONE',
  'answer-needed': 'ANSWER NEEDED',
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Local calendar date, "YYYY-MM-DD". */
export function localDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Local date and time with the UTC offset, "YYYY-MM-DD HH:MM (UTC+07:00)". */
export function localDateTime(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${localDate(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())} (UTC${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)})`;
}

export function describeBrowser(env: TestEnvironment, full = false): string {
  if (env.browser === 'Unknown') return 'Unknown browser';
  const version = full ? env.browserVersion : env.browserMajor;
  return version ? `${env.browser} ${version}` : env.browser;
}

export function describeOs(env: TestEnvironment): string {
  if (env.os === 'Unknown') return 'Unknown OS';
  return env.osVersion ? `${env.os} ${env.osVersion}` : env.os;
}

/**
 * The text for the "Verified on hardware" cell of docs/compatibility.md, or `null` when this run
 * does not verify a row (a step failed or is not done yet).
 */
export function compatibilityCell(session: HardwareTestSession): string | null {
  const env = session.environment;
  if (!env || !summarize(session).allPassed) return null;
  const date = localDate(new Date(session.updatedAt));
  const parts = [describeBrowser(env), describeOs(env)];
  if (testMode(session) === 'supported' && session.hub) {
    parts.push(`Pybricks ${session.hub.firmwareRevision}`);
  }
  return `Verified ${date} (${parts.join(', ')})`;
}

function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(1).padStart(6, ' ');
}

export function buildReport(session: HardwareTestSession): string {
  const env = session.environment;
  const summary = summarize(session);
  const steps = deriveSteps(session);
  const lines: string[] = [];

  lines.push('MatPilot hardware test report');
  lines.push('');
  if (summary.mode === 'pending') {
    lines.push('Result: compatibility checks still running');
  } else {
    const kind = summary.mode === 'unsupported' ? 'Unsupported-browser check' : 'Hardware test';
    const state = summary.complete
      ? summary.allPassed
        ? 'all steps passed'
        : 'finished with failures'
      : 'not finished';
    lines.push(`Result: ${kind}, ${state} (${summary.passed} of ${summary.total} passed)`);
  }
  lines.push(`Date: ${localDateTime(new Date(session.updatedAt))}`);
  if (env) {
    lines.push(`Browser: ${describeBrowser(env, true)}`);
    lines.push(
      `OS: ${describeOs(env)}${env.osVersion ? '' : ' (version not reported by this browser; please add it)'}`,
    );
    lines.push(`Support policy: ${env.support}`);
  } else {
    lines.push('Browser: not detected yet');
  }

  if (session.hub) {
    lines.push(`Hub name: ${session.hub.name ?? '(none reported)'}`);
    lines.push(
      `Firmware revision: ${session.hub.firmwareRevision || '(empty)'} (tested baseline: ${TESTED_FIRMWARE_VERSION})`,
    );
    lines.push(`Protocol version: ${session.hub.protocolRevision || '(empty)'}`);
  }

  lines.push('');
  lines.push('Steps (docs/compatibility.md, "How to verify a row on hardware"):');
  for (const step of steps) {
    lines.push(`${step.number}. ${STATUS_LABELS[step.status]}  ${step.title}`);
    lines.push(`   ${step.detail}`);
  }

  lines.push('');
  lines.push(
    `Uncaught exceptions: ${uncaughtExceptionCount(session)} (errors ${session.uncaught.errors}, unhandled rejections ${session.uncaught.rejections})`,
  );
  lines.push(
    `Blocked by the Content Security Policy: ${session.uncaught.cspViolations}${session.uncaught.cspViolations > 0 ? ' (expected 0; usually a proxy such as a CDN injected a script)' : ''}`,
  );
  for (const sample of session.uncaughtSamples) lines.push(`  - ${sample}`);

  lines.push('');
  const cell = compatibilityCell(session);
  lines.push('Suggested docs/compatibility.md cell:');
  lines.push(cell ?? '(none: not every step passed)');

  lines.push('');
  lines.push('Event log (seconds since the test started):');
  for (const entry of session.log) lines.push(`${formatSeconds(entry.atMs)}  ${entry.text}`);
  if (session.droppedLogEntries > 0) {
    lines.push(`  (${session.droppedLogEntries} later entries not kept)`);
  }

  if (env) {
    lines.push('');
    lines.push(`User agent: ${env.userAgent || '(empty)'}`);
  }
  return `${lines.join('\n')}\n`;
}

export function reportFileName(session: HardwareTestSession): string {
  return `matpilot-hardware-test-${localDate(new Date(session.updatedAt))}.txt`;
}
