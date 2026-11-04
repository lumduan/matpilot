import { describe, expect, it } from 'vitest';
import { collectTestEnvironment, describeTestEnvironment, osVersionFromHints } from './environment';

const CHROME_WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const SAFARI_IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';

const CHROME_BRANDS = [
  { brand: 'Chromium', version: '142' },
  { brand: 'Google Chrome', version: '142' },
  { brand: 'Not_A Brand', version: '99' },
];

describe('osVersionFromHints', () => {
  it('maps Windows platform versions to Windows 10 and 11', () => {
    expect(osVersionFromHints('Windows', '15.0.0')).toBe('11');
    expect(osVersionFromHints('Windows', '13.0.0')).toBe('11');
    expect(osVersionFromHints('Windows', '10.0.0')).toBe('10');
    expect(osVersionFromHints('Windows', '1.0.0')).toBe('10');
    expect(osVersionFromHints('Windows', '0.3.0')).toBe('earlier than 10');
  });

  it('trims trailing zeros for macOS and Android', () => {
    expect(osVersionFromHints('macOS', '15.1.0')).toBe('15.1');
    expect(osVersionFromHints('macOS', '26.0.0')).toBe('26');
    expect(osVersionFromHints('Android', '14.0.0')).toBe('14');
  });

  it('labels the ChromeOS platform build', () => {
    expect(osVersionFromHints('ChromeOS', '16093.68.0')).toBe('platform 16093.68.0');
  });

  it('returns null for missing, empty, or malformed versions and for Linux', () => {
    expect(osVersionFromHints('Windows', undefined)).toBeNull();
    expect(osVersionFromHints('macOS', '')).toBeNull();
    expect(osVersionFromHints('Android', 'fourteen')).toBeNull();
    expect(osVersionFromHints('Linux', '6.8.0')).toBeNull();
  });
});

describe('describeTestEnvironment', () => {
  it('uses the full version and platform version from client hints', () => {
    const env = describeTestEnvironment({
      userAgent: CHROME_WINDOWS_UA,
      userAgentData: { brands: CHROME_BRANDS, platform: 'Windows', mobile: false },
      highEntropy: {
        platformVersion: '15.0.0',
        fullVersionList: [
          { brand: 'Chromium', version: '142.0.7444.60' },
          { brand: 'Google Chrome', version: '142.0.7444.60' },
        ],
      },
    });
    expect(env).toEqual({
      browser: 'Chrome',
      browserMajor: '142',
      browserVersion: '142.0.7444.60',
      os: 'Windows',
      osVersion: '11',
      support: 'supported',
      userAgent: CHROME_WINDOWS_UA,
    });
  });

  it('leaves the OS version unknown without client hints instead of reading the UA', () => {
    const env = describeTestEnvironment({ userAgent: SAFARI_IPHONE_UA, maxTouchPoints: 5 });
    expect(env).toMatchObject({
      browser: 'Safari',
      browserMajor: '26',
      browserVersion: '26',
      os: 'iOS',
      osVersion: null,
      support: 'unsupported',
    });
  });
});

describe('collectTestEnvironment', () => {
  it('requests only the platform version and full version list', async () => {
    const requested: string[][] = [];
    const env = await collectTestEnvironment({
      navigator: {
        userAgent: CHROME_WINDOWS_UA,
        userAgentData: {
          brands: CHROME_BRANDS,
          platform: 'Windows',
          getHighEntropyValues: (hints) => {
            requested.push(hints);
            return Promise.resolve({ platformVersion: '10.0.0' });
          },
        },
      },
    });
    expect(requested).toEqual([['platformVersion', 'fullVersionList']]);
    expect(env.osVersion).toBe('10');
  });

  it('survives a rejecting getHighEntropyValues and a missing navigator', async () => {
    const env = await collectTestEnvironment({
      navigator: {
        userAgent: CHROME_WINDOWS_UA,
        userAgentData: {
          brands: CHROME_BRANDS,
          platform: 'Windows',
          getHighEntropyValues: () => Promise.reject(new Error('blocked')),
        },
      },
    });
    expect(env).toMatchObject({ browser: 'Chrome', osVersion: null });
    expect(await collectTestEnvironment({})).toMatchObject({ browser: 'Unknown', os: 'Unknown' });
  });
});
