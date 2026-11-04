/**
 * Best-effort browser and operating-system detection.
 *
 * This is INFORMATIONAL ONLY. Whether MatPilot can run is decided by feature detection
 * (src/lib/compat/checks.ts), never by the browser name, because user-agent strings are
 * easy to spoof and Chromium forks share Chrome's user agent.
 */

export type BrowserName =
  | 'Chrome'
  | 'Edge'
  | 'Opera'
  | 'Brave'
  | 'Samsung Internet'
  | 'Chromium'
  | 'Firefox'
  | 'Safari'
  | 'Unknown';

export type OsName =
  'Windows' | 'macOS' | 'ChromeOS' | 'Android' | 'iOS' | 'iPadOS' | 'Linux' | 'Unknown';

/** Subset of `NavigatorUAData` (User-Agent Client Hints, Chromium only). */
export interface UserAgentDataLike {
  readonly brands?: ReadonlyArray<{ readonly brand: string; readonly version: string }>;
  readonly platform?: string;
  readonly mobile?: boolean;
}

export interface PlatformInput {
  readonly userAgent?: string;
  readonly userAgentData?: UserAgentDataLike;
  /** Used to tell iPadOS (which reports a Mac user agent by default) from macOS. */
  readonly maxTouchPoints?: number;
}

export interface PlatformInfo {
  readonly browser: BrowserName;
  /** Major version as reported by the browser, or `null` when unknown. */
  readonly browserVersion: string | null;
  readonly os: OsName;
}

export type PlatformSupport = 'supported' | 'unsupported' | 'untested';

export interface PlatformAssessment {
  readonly support: PlatformSupport;
  readonly reason: string;
}

const BRAND_NAMES: ReadonlyArray<readonly [string, BrowserName]> = [
  ['Microsoft Edge', 'Edge'],
  ['Opera', 'Opera'],
  ['Opera GX', 'Opera'],
  ['Brave', 'Brave'],
  ['Samsung Internet', 'Samsung Internet'],
  ['Google Chrome', 'Chrome'],
  ['Chromium', 'Chromium'],
];

/** Order matters: Chromium forks include "Chrome/" in their user agent, so test them first. */
const UA_BROWSER_PATTERNS: ReadonlyArray<readonly [RegExp, BrowserName]> = [
  [/\bEdg(?:e|A|iOS)?\/(\d+)/, 'Edge'],
  [/\b(?:OPR|OPT)\/(\d+)/, 'Opera'],
  [/\bSamsungBrowser\/(\d+)/, 'Samsung Internet'],
  [/\bFxiOS\/(\d+)/, 'Firefox'],
  [/\bFirefox\/(\d+)/, 'Firefox'],
  [/\bCriOS\/(\d+)/, 'Chrome'],
  [/\bChrome\/(\d+)/, 'Chrome'],
  [/\bVersion\/(\d+)(?:[.\d]*)? (?:Mobile\/\S+ )?Safari\//, 'Safari'],
];

const UA_DATA_PLATFORMS: Readonly<Record<string, OsName>> = {
  Windows: 'Windows',
  macOS: 'macOS',
  'Chrome OS': 'ChromeOS',
  'Chromium OS': 'ChromeOS',
  Android: 'Android',
  Linux: 'Linux',
  iOS: 'iOS',
};

export function detectPlatform(input: PlatformInput): PlatformInfo {
  const ua = input.userAgent ?? '';
  const { browser, browserVersion } = detectBrowser(ua, input.userAgentData);
  return { browser, browserVersion, os: detectOs(ua, input.userAgentData, input.maxTouchPoints) };
}

function detectBrowser(
  ua: string,
  uaData: UserAgentDataLike | undefined,
): { browser: BrowserName; browserVersion: string | null } {
  const brands = uaData?.brands ?? [];
  for (const [brandName, browser] of BRAND_NAMES) {
    const brand = brands.find((b) => b.brand === brandName);
    if (brand) return { browser, browserVersion: majorVersion(brand.version) };
  }
  for (const [pattern, browser] of UA_BROWSER_PATTERNS) {
    const match = pattern.exec(ua);
    if (match) return { browser, browserVersion: match[1] ?? null };
  }
  return { browser: 'Unknown', browserVersion: null };
}

function detectOs(ua: string, uaData: UserAgentDataLike | undefined, maxTouchPoints = 0): OsName {
  const fromHints = uaData?.platform ? UA_DATA_PLATFORMS[uaData.platform] : undefined;
  if (fromHints) return fromHints;
  if (/\biPad\b/.test(ua)) return 'iPadOS';
  if (/\b(?:iPhone|iPod)\b/.test(ua)) return 'iOS';
  // iPadOS Safari requests the desktop site by default and reports a Mac user agent.
  if (/\bMacintosh\b/.test(ua) && maxTouchPoints > 1) return 'iPadOS';
  if (/\bAndroid\b/.test(ua)) return 'Android';
  if (/\bCrOS\b/.test(ua)) return 'ChromeOS';
  if (/\bWindows\b/.test(ua)) return 'Windows';
  if (/\b(?:Macintosh|Mac OS X)\b/.test(ua)) return 'macOS';
  if (/\bLinux\b/.test(ua)) return 'Linux';
  return 'Unknown';
}

function majorVersion(version: string): string | null {
  const major = /^\d+/.exec(version);
  return major ? major[0] : null;
}

const SUPPORTED_COMBINATIONS: Readonly<Record<string, readonly OsName[]>> = {
  Chrome: ['Windows', 'macOS', 'ChromeOS', 'Android'],
  Edge: ['Windows', 'macOS', 'Android'],
};

/** Compares a detected platform with the project support policy. Informational only. */
export function assessPlatform(info: PlatformInfo): PlatformAssessment {
  if (info.os === 'iOS' || info.os === 'iPadOS') {
    return {
      support: 'unsupported',
      reason:
        'Browsers on iPhone and iPad are built on Apple WebKit, which does not implement Web Bluetooth.',
    };
  }
  if (info.browser === 'Firefox') {
    return { support: 'unsupported', reason: 'Firefox does not implement Web Bluetooth.' };
  }
  if (info.browser === 'Safari') {
    return { support: 'unsupported', reason: 'Safari does not implement Web Bluetooth.' };
  }
  if (info.os === 'Linux') {
    return {
      support: 'untested',
      reason:
        'Linux is not a supported platform: Chromium on Linux keeps Web Bluetooth behind an experimental flag.',
    };
  }
  if (SUPPORTED_COMBINATIONS[info.browser]?.includes(info.os)) {
    return { support: 'supported', reason: 'This is a supported browser and platform.' };
  }
  return {
    support: 'untested',
    reason: 'This browser or platform is not on the supported list, so it has not been tested.',
  };
}

export function describePlatform(info: PlatformInfo): string {
  const browser =
    info.browser === 'Unknown'
      ? 'an unknown browser'
      : `${info.browser}${info.browserVersion ? ` ${info.browserVersion}` : ''}`;
  const os = info.os === 'Unknown' ? 'an unknown operating system' : info.os;
  return `${browser} on ${os}`;
}
