import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluateCompatibility, type CheckId, type CompatibilityEnvironment } from './checks';
import {
  collectEnvironment,
  runCompatibilityCheck,
  watchBluetoothAvailability,
  type GlobalsLike,
} from './environment';
import { SUPPORT_STATEMENT, SUPPORTED_BROWSERS, SUPPORTED_PLATFORMS } from './support';

const CHROME_MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const FIREFOX_WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0';

function statusOf(report: ReturnType<typeof evaluateCompatibility>, id: CheckId) {
  return report.checks.find((check) => check.id === id)?.status;
}

const GOOD_ENV: CompatibilityEnvironment = {
  isSecureContext: true,
  hasWebBluetooth: true,
  availability: { kind: 'available' },
  platform: { browser: 'Chrome', browserVersion: '140', os: 'macOS' },
};

describe('evaluateCompatibility', () => {
  it('is ready when every required check passes', () => {
    const report = evaluateCompatibility(GOOD_ENV);
    expect(report.ready).toBe(true);
    expect(report.checks.map((check) => [check.id, check.status])).toEqual([
      ['secure-context', 'pass'],
      ['web-bluetooth-api', 'pass'],
      ['bluetooth-availability', 'pass'],
      ['platform', 'info'],
    ]);
  });

  it('gives every check a human-readable explanation', () => {
    for (const check of evaluateCompatibility(GOOD_ENV).checks) {
      expect(check.title.length).toBeGreaterThan(0);
      expect(check.explanation.length).toBeGreaterThan(20);
    }
  });

  it('fails on an insecure context and points at HTTPS', () => {
    const report = evaluateCompatibility({
      ...GOOD_ENV,
      isSecureContext: false,
      hasWebBluetooth: false,
      availability: { kind: 'not-run' },
    });
    expect(report.ready).toBe(false);
    expect(statusOf(report, 'secure-context')).toBe('fail');
    expect(statusOf(report, 'web-bluetooth-api')).toBe('fail');
    expect(statusOf(report, 'bluetooth-availability')).toBe('skipped');
    expect(report.checks[0]?.explanation).toMatch(/HTTPS/);
    expect(report.checks[1]?.explanation).toMatch(/secure context/);
  });

  it('fails when the browser has no Web Bluetooth', () => {
    const report = evaluateCompatibility({
      ...GOOD_ENV,
      hasWebBluetooth: false,
      availability: { kind: 'not-run' },
      platform: { browser: 'Firefox', browserVersion: '145', os: 'Windows' },
    });
    expect(report.ready).toBe(false);
    expect(statusOf(report, 'web-bluetooth-api')).toBe('fail');
    expect(report.checks.find((c) => c.id === 'platform')?.explanation).toMatch(/Firefox/);
  });

  it.each([
    [{ kind: 'unavailable' } as const],
    [{ kind: 'method-missing' } as const],
    [{ kind: 'error', message: 'boom' } as const],
  ])('fails when availability is %o', (availability) => {
    const report = evaluateCompatibility({ ...GOOD_ENV, availability });
    expect(report.ready).toBe(false);
    expect(statusOf(report, 'bluetooth-availability')).toBe('fail');
  });

  it('never blocks on the informational platform check', () => {
    const report = evaluateCompatibility({
      ...GOOD_ENV,
      platform: { browser: 'Unknown', browserVersion: null, os: 'Unknown' },
    });
    expect(report.ready).toBe(true);
  });
});

describe('collectEnvironment with a mocked navigator', () => {
  it('passes everything for a Chrome-like navigator with an adapter', async () => {
    const getAvailability = vi.fn().mockResolvedValue(true);
    const env = await collectEnvironment({
      isSecureContext: true,
      navigator: { userAgent: CHROME_MAC_UA, bluetooth: { getAvailability } },
    });
    expect(getAvailability).toHaveBeenCalledOnce();
    expect(env).toEqual({
      isSecureContext: true,
      hasWebBluetooth: true,
      availability: { kind: 'available' },
      platform: { browser: 'Chrome', browserVersion: '140', os: 'macOS' },
    });
  });

  it('reports an unavailable adapter', async () => {
    const env = await collectEnvironment({
      isSecureContext: true,
      navigator: { bluetooth: { getAvailability: vi.fn().mockResolvedValue(false) } },
    });
    expect(env.availability).toEqual({ kind: 'unavailable' });
  });

  it('uses the `in` operator, so a present-but-undefined bluetooth still counts as present', async () => {
    const env = await collectEnvironment({
      isSecureContext: true,
      navigator: { bluetooth: undefined },
    });
    expect(env.hasWebBluetooth).toBe(true);
    expect(env.availability).toEqual({ kind: 'method-missing' });
  });

  it('does not call getAvailability when navigator.bluetooth is missing', async () => {
    const env = await collectEnvironment({
      isSecureContext: true,
      navigator: { userAgent: FIREFOX_WINDOWS_UA },
    });
    expect(env.hasWebBluetooth).toBe(false);
    expect(env.availability).toEqual({ kind: 'not-run' });
  });

  it('turns a rejected getAvailability into a failed check', async () => {
    const env = await collectEnvironment({
      isSecureContext: true,
      navigator: { bluetooth: { getAvailability: vi.fn().mockRejectedValue(new Error('denied')) } },
    });
    expect(env.availability).toEqual({ kind: 'error', message: 'denied' });
  });

  it('times out a getAvailability that never settles', async () => {
    const env = await collectEnvironment(
      {
        isSecureContext: true,
        navigator: { bluetooth: { getAvailability: () => new Promise<boolean>(() => {}) } },
      },
      10,
    );
    expect(env.availability.kind).toBe('error');
  });

  it('treats a missing secure-context flag as insecure', async () => {
    const env = await collectEnvironment({ navigator: {} });
    expect(env.isSecureContext).toBe(false);
  });

  it('handles a missing navigator', async () => {
    const env = await collectEnvironment({ isSecureContext: true });
    expect(env.hasWebBluetooth).toBe(false);
    expect(env.platform.browser).toBe('Unknown');
  });
});

describe('runCompatibilityCheck against stubbed globals', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads window.isSecureContext and navigator from globalThis by default', async () => {
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      userAgent: CHROME_MAC_UA,
      bluetooth: { getAvailability: () => Promise.resolve(true) },
    });
    const report = await runCompatibilityCheck();
    expect(report.ready).toBe(true);
  });

  it('is not ready in a Firefox-like browser', async () => {
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { userAgent: FIREFOX_WINDOWS_UA });
    const report = await runCompatibilityCheck();
    expect(report.ready).toBe(false);
    expect(statusOf(report, 'web-bluetooth-api')).toBe('fail');
  });
});

describe('watchBluetoothAvailability', () => {
  it('subscribes to availabilitychanged and unsubscribes', () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const globals: GlobalsLike = {
      navigator: { bluetooth: { addEventListener, removeEventListener } },
    };
    const onChange = vi.fn();

    const unsubscribe = watchBluetoothAvailability(onChange, globals);
    expect(addEventListener).toHaveBeenCalledWith('availabilitychanged', expect.any(Function));
    const listener = addEventListener.mock.calls[0]?.[1] as () => void;
    listener();
    expect(onChange).toHaveBeenCalledOnce();

    unsubscribe();
    expect(removeEventListener).toHaveBeenCalledWith('availabilitychanged', listener);
  });

  it('is a no-op without Web Bluetooth', () => {
    expect(() => watchBluetoothAvailability(() => {}, { navigator: {} })()).not.toThrow();
  });
});

describe('SUPPORT_STATEMENT', () => {
  it('names every supported browser and platform, and the unsupported ones', () => {
    for (const name of [...SUPPORTED_BROWSERS, ...SUPPORTED_PLATFORMS]) {
      expect(SUPPORT_STATEMENT).toContain(name);
    }
    for (const name of ['Firefox', 'Safari', 'iPhone', 'iPad', 'iOS', 'iPadOS']) {
      expect(SUPPORT_STATEMENT).toContain(name);
    }
  });
});
