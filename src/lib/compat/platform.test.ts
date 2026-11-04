import { describe, expect, it } from 'vitest';
import { assessPlatform, describePlatform, detectPlatform } from './platform';

const UA = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  edgeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  chromeOs:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  chromeLinux:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  firefoxWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  chromeIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1',
  firefoxIpad:
    'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/145.0 Mobile/15E148 Safari/605.1.15',
  samsungAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  operaWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/125.0.0.0',
};

describe('detectPlatform from the user-agent string', () => {
  it.each([
    [UA.chromeWindows, 'Chrome', '140', 'Windows'],
    [UA.edgeMac, 'Edge', '140', 'macOS'],
    [UA.chromeOs, 'Chrome', '140', 'ChromeOS'],
    [UA.chromeAndroid, 'Chrome', '140', 'Android'],
    [UA.chromeLinux, 'Chrome', '140', 'Linux'],
    [UA.firefoxWindows, 'Firefox', '145', 'Windows'],
    [UA.safariMac, 'Safari', '26', 'macOS'],
    [UA.safariIphone, 'Safari', '18', 'iOS'],
    [UA.chromeIphone, 'Chrome', '140', 'iOS'],
    [UA.firefoxIpad, 'Firefox', '145', 'iPadOS'],
    [UA.samsungAndroid, 'Samsung Internet', '28', 'Android'],
    [UA.operaWindows, 'Opera', '125', 'Windows'],
  ])('%s', (userAgent, browser, browserVersion, os) => {
    expect(detectPlatform({ userAgent })).toEqual({ browser, browserVersion, os });
  });

  it('treats a Mac user agent with a touch screen as iPadOS', () => {
    expect(detectPlatform({ userAgent: UA.safariMac, maxTouchPoints: 5 }).os).toBe('iPadOS');
    expect(detectPlatform({ userAgent: UA.safariMac, maxTouchPoints: 0 }).os).toBe('macOS');
  });

  it('returns Unknown for an empty user agent', () => {
    expect(detectPlatform({})).toEqual({ browser: 'Unknown', browserVersion: null, os: 'Unknown' });
  });
});

describe('detectPlatform from User-Agent Client Hints', () => {
  it('prefers the specific brand over the generic Chromium brand', () => {
    const info = detectPlatform({
      userAgent: UA.chromeWindows,
      userAgentData: {
        brands: [
          { brand: 'Chromium', version: '140' },
          { brand: 'Microsoft Edge', version: '140' },
          { brand: 'Not=A?Brand', version: '24' },
        ],
        platform: 'Windows',
        mobile: false,
      },
    });
    expect(info).toEqual({ browser: 'Edge', browserVersion: '140', os: 'Windows' });
  });

  it('uses the client-hint platform, which is right when Android requests a desktop site', () => {
    const info = detectPlatform({
      userAgent: UA.chromeLinux,
      userAgentData: {
        brands: [{ brand: 'Google Chrome', version: '140' }],
        platform: 'Android',
      },
    });
    expect(info.os).toBe('Android');
  });

  it('maps "Chrome OS" to ChromeOS', () => {
    expect(detectPlatform({ userAgentData: { platform: 'Chrome OS' } }).os).toBe('ChromeOS');
  });
});

describe('assessPlatform', () => {
  it.each([
    [UA.chromeWindows, 'supported'],
    [UA.edgeMac, 'supported'],
    [UA.chromeOs, 'supported'],
    [UA.chromeAndroid, 'supported'],
    [UA.firefoxWindows, 'unsupported'],
    [UA.safariMac, 'unsupported'],
    [UA.chromeIphone, 'unsupported'],
    [UA.firefoxIpad, 'unsupported'],
    [UA.chromeLinux, 'untested'],
    [UA.samsungAndroid, 'untested'],
    [UA.operaWindows, 'untested'],
  ])('%s is %s', (userAgent, support) => {
    expect(assessPlatform(detectPlatform({ userAgent })).support).toBe(support);
  });

  it('explains why iOS browsers are unsupported even when they are Chrome', () => {
    expect(assessPlatform(detectPlatform({ userAgent: UA.chromeIphone })).reason).toMatch(/WebKit/);
  });
});

describe('describePlatform', () => {
  it('names the browser, version and OS', () => {
    expect(describePlatform({ browser: 'Chrome', browserVersion: '140', os: 'macOS' })).toBe(
      'Chrome 140 on macOS',
    );
    expect(describePlatform({ browser: 'Unknown', browserVersion: null, os: 'Unknown' })).toBe(
      'an unknown browser on an unknown operating system',
    );
  });
});
