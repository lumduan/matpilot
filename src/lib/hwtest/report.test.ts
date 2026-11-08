import { describe, expect, it, vi } from 'vitest';
import { buildReport, compatibilityCell, localDateTime, reportFileName } from './report';
import { createSession, type SessionEvent } from './session';
import { FULL_RUN, SUPPORTED_ENV, play } from './test-fixtures';

describe('hardware test report', () => {
  it('produces the compatibility cell only when every step passed', () => {
    vi.stubEnv('TZ', 'Asia/Bangkok');
    expect(compatibilityCell(play(FULL_RUN))).toBe(
      'Verified 2026-11-10 (Chrome 142, Windows 11, Pybricks 4.1.3)',
    );
    expect(compatibilityCell(play(FULL_RUN.slice(0, -1)))).toBeNull();
    expect(compatibilityCell(createSession(new Date()))).toBeNull();
  });

  it('omits the firmware from the cell for an unsupported browser', () => {
    const events: SessionEvent[] = [
      {
        type: 'environment',
        environment: {
          ...SUPPORTED_ENV,
          browser: 'Firefox',
          browserMajor: '144',
          browserVersion: '144',
          os: 'macOS',
          osVersion: null,
          support: 'unsupported',
        },
      },
      { type: 'compat', compat: { ready: false, failedChecks: ['Web Bluetooth API'] } },
    ];
    expect(compatibilityCell(play(events))).toMatch(
      /^Verified \d{4}-\d\d-\d\d \(Firefox 144, macOS\)$/,
    );
  });

  it('lists the result, environment, hub, steps, counters, and log', () => {
    const text = buildReport(play(FULL_RUN));
    expect(text).toContain('Result: Hardware test, all steps passed (5 of 5 passed)');
    expect(text).toContain('Browser: Chrome 142.0.7444.60');
    expect(text).toContain('OS: Windows 11\n');
    expect(text).toContain('Hub name: Pybricks Hub');
    expect(text).toContain('Firmware revision: 4.1.3 (tested baseline: 4.1.3)');
    expect(text).toContain('Protocol version: 1.7.0');
    expect(text).toContain('5. PASS  Turning the hub off shows “Hub disconnected”');
    expect(text).toContain('Uncaught exceptions: 0 (errors 0, unhandled rejections 0)');
    expect(text).toContain('Blocked by the Content Security Policy: 0\n');
    expect(text).toContain('   9.0  Connection to “Pybricks Hub” lost');
    expect(text).toContain(`User agent: ${SUPPORTED_ENV.userAgent}`);
    expect(text.endsWith('\n')).toBe(true);
  });

  it('marks unfinished steps and explains CSP violations', () => {
    const text = buildReport(
      play([
        { type: 'environment', environment: { ...SUPPORTED_ENV, osVersion: null } },
        { type: 'compat', compat: { ready: true, failedChecks: [] } },
        { type: 'uncaught', kind: 'csp-violation', message: 'https://cdn.example/beacon.js' },
      ]),
    );
    expect(text).toContain('Result: Hardware test, not finished (1 of 5 passed)');
    expect(text).toContain('OS: Windows (version not reported by this browser; please add it)');
    expect(text).toContain('2. NOT DONE  Cancel in the device picker');
    expect(text).toContain('Blocked by the Content Security Policy: 1 (expected 0;');
    expect(text).toContain(
      '  - Blocked by the Content Security Policy: https://cdn.example/beacon.js',
    );
    expect(text).toContain('(none: not every step passed)');
  });

  it('formats local time with the UTC offset and names the file by date', () => {
    vi.stubEnv('TZ', 'Asia/Bangkok');
    expect(localDateTime(new Date('2026-11-10T07:05:00Z'))).toBe('2026-11-10 14:05 (UTC+07:00)');
    expect(reportFileName(play(FULL_RUN))).toBe('matpilot-hardware-test-2026-11-10.txt');
  });
});
