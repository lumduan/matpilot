/**
 * Browser and operating-system versions for a hardware test report.
 *
 * The classic user-agent string freezes the OS version (macOS always reports 10_15_7, and Windows
 * 10 and 11 both report "Windows NT 10.0"), so exact versions come only from User-Agent Client
 * Hints (`navigator.userAgentData.getHighEntropyValues`, Chromium only). When the hints are
 * missing, the version is left unknown rather than guessed. Nothing leaves the browser.
 */

import {
  assessPlatform,
  detectPlatform,
  type BrowserName,
  type OsName,
  type PlatformSupport,
  type UserAgentDataLike,
} from '../compat/platform';

/** The subset of `UADataValues` this module requests. */
export interface HighEntropyValuesLike {
  readonly platformVersion?: string;
  readonly fullVersionList?: ReadonlyArray<{ readonly brand: string; readonly version: string }>;
}

export interface UserAgentDataWithHintsLike extends UserAgentDataLike {
  getHighEntropyValues?: (hints: string[]) => Promise<HighEntropyValuesLike>;
}

export interface TestEnvironmentInput {
  readonly userAgent?: string;
  readonly userAgentData?: UserAgentDataLike;
  readonly maxTouchPoints?: number;
  readonly highEntropy?: HighEntropyValuesLike;
}

export interface TestEnvironment {
  readonly browser: BrowserName;
  /** Major version, e.g. "142", or `null` when unknown. */
  readonly browserMajor: string | null;
  /** Full version from the client hints, e.g. "142.0.7444.60"; otherwise the major version. */
  readonly browserVersion: string | null;
  readonly os: OsName;
  /** e.g. "11" for Windows 11, "15.1" for macOS; `null` when the browser does not report it. */
  readonly osVersion: string | null;
  /** Where this browser and OS stand in the project support policy. */
  readonly support: PlatformSupport;
  readonly userAgent: string;
}

/** Client-hint brand names for the browsers `detectPlatform()` recognises. */
const BRANDS: Partial<Record<BrowserName, string>> = {
  Chrome: 'Google Chrome',
  Edge: 'Microsoft Edge',
  Opera: 'Opera',
  Brave: 'Brave',
  'Samsung Internet': 'Samsung Internet',
  Chromium: 'Chromium',
};

export function describeTestEnvironment(input: TestEnvironmentInput): TestEnvironment {
  const platform = detectPlatform(input);
  const brand = BRANDS[platform.browser];
  const fullVersion = brand
    ? input.highEntropy?.fullVersionList?.find((entry) => entry.brand === brand)?.version
    : undefined;
  return {
    browser: platform.browser,
    browserMajor: platform.browserVersion,
    browserVersion: fullVersion ?? platform.browserVersion,
    os: platform.os,
    osVersion: osVersionFromHints(platform.os, input.highEntropy?.platformVersion),
    support: assessPlatform(platform).support,
    userAgent: input.userAgent ?? '',
  };
}

/**
 * Maps the `platformVersion` client hint to a human version.
 *
 * Windows: 13.0.0 and above is Windows 11, 1.0.0 to 10.0.0 is Windows 10, and 0.x is an earlier
 * release (https://learn.microsoft.com/en-us/microsoft-edge/web-platform/how-to-detect-win11).
 * ChromeOS reports its platform build number, not a marketing version, so it is labelled.
 */
export function osVersionFromHints(os: OsName, platformVersion: string | undefined): string | null {
  if (!platformVersion || !/^\d+(?:\.\d+)*$/.test(platformVersion)) return null;
  const major = Number(platformVersion.split('.')[0]);
  switch (os) {
    case 'Windows':
      if (major >= 13) return '11';
      if (major >= 1) return '10';
      return 'earlier than 10';
    case 'macOS':
    case 'Android':
    case 'iOS':
    case 'iPadOS':
      return trimZeros(platformVersion);
    case 'ChromeOS':
      return `platform ${platformVersion}`;
    case 'Linux':
    case 'Unknown':
      return null;
  }
}

/** "15.1.0" -> "15.1", "14.0.0" -> "14". */
function trimZeros(version: string): string {
  return version.replace(/(?:\.0)+$/, '');
}

export interface EnvironmentGlobalsLike {
  readonly navigator?: {
    readonly userAgent?: string;
    readonly userAgentData?: UserAgentDataWithHintsLike;
    readonly maxTouchPoints?: number;
  };
}

/** Reads the current browser's environment. Never rejects. */
export async function collectTestEnvironment(
  globals: EnvironmentGlobalsLike = globalThis as unknown as EnvironmentGlobalsLike,
): Promise<TestEnvironment> {
  const nav = globals.navigator;
  let highEntropy: HighEntropyValuesLike | undefined;
  try {
    highEntropy = await nav?.userAgentData?.getHighEntropyValues?.([
      'platformVersion',
      'fullVersionList',
    ]);
  } catch {
    // The hints are optional: versions stay unknown.
  }
  return describeTestEnvironment({
    userAgent: nav?.userAgent,
    userAgentData: nav?.userAgentData,
    maxTouchPoints: nav?.maxTouchPoints,
    highEntropy,
  });
}
