/**
 * Pure evaluation of the browser compatibility checks. No globals are read here; see
 * src/lib/compat/environment.ts for collecting the inputs from the real browser.
 */

import { assessPlatform, describePlatform, type PlatformInfo } from './platform';

export type CheckId =
  'secure-context' | 'web-bluetooth-api' | 'bluetooth-availability' | 'platform';

/**
 * - `pass` / `fail`: a required check.
 * - `skipped`: a required check that could not run because an earlier one failed.
 * - `info`: informational only; never blocks the app.
 */
export type CheckStatus = 'pass' | 'fail' | 'skipped' | 'info';

export interface CheckResult {
  readonly id: CheckId;
  readonly title: string;
  readonly status: CheckStatus;
  readonly explanation: string;
}

export type AvailabilityResult =
  /** `getAvailability()` resolved `true`. */
  | { readonly kind: 'available' }
  /** `getAvailability()` resolved `false`. */
  | { readonly kind: 'unavailable' }
  /** Not called because `navigator.bluetooth` does not exist. */
  | { readonly kind: 'not-run' }
  /** `navigator.bluetooth` exists but has no `getAvailability()` method. */
  | { readonly kind: 'method-missing' }
  /** `getAvailability()` rejected or did not settle in time. */
  | { readonly kind: 'error'; readonly message: string };

export interface CompatibilityEnvironment {
  readonly isSecureContext: boolean;
  readonly hasWebBluetooth: boolean;
  readonly availability: AvailabilityResult;
  readonly platform: PlatformInfo;
}

export interface CompatibilityReport {
  readonly checks: readonly CheckResult[];
  /** True only when every required check passed. Gates the "Connect to hub" button. */
  readonly ready: boolean;
}

export function evaluateCompatibility(env: CompatibilityEnvironment): CompatibilityReport {
  const checks: CheckResult[] = [
    checkSecureContext(env.isSecureContext),
    checkWebBluetoothApi(env.hasWebBluetooth, env.isSecureContext),
    checkAvailability(env.availability),
    checkPlatform(env.platform),
  ];
  const ready = checks.every((check) => check.status === 'pass' || check.status === 'info');
  return { checks, ready };
}

function checkSecureContext(isSecureContext: boolean): CheckResult {
  return {
    id: 'secure-context',
    title: 'Secure context (HTTPS or localhost)',
    status: isSecureContext ? 'pass' : 'fail',
    explanation: isSecureContext
      ? 'This page is served over HTTPS or from localhost, so the browser allows Web Bluetooth.'
      : 'This page is not a secure context. Browsers only allow Web Bluetooth on pages served over HTTPS or from localhost. Open MatPilot through an https:// address.',
  };
}

function checkWebBluetoothApi(hasWebBluetooth: boolean, isSecureContext: boolean): CheckResult {
  if (hasWebBluetooth) {
    return {
      id: 'web-bluetooth-api',
      title: 'Web Bluetooth API',
      status: 'pass',
      explanation: 'This browser provides the Web Bluetooth API (navigator.bluetooth).',
    };
  }
  return {
    id: 'web-bluetooth-api',
    title: 'Web Bluetooth API',
    status: 'fail',
    explanation: isSecureContext
      ? 'This browser does not provide the Web Bluetooth API (navigator.bluetooth).'
      : 'navigator.bluetooth is missing. Browsers hide Web Bluetooth on pages that are not a secure context, so fix the secure-context check first.',
  };
}

function checkAvailability(availability: AvailabilityResult): CheckResult {
  const base = { id: 'bluetooth-availability', title: 'Bluetooth adapter available' } as const;
  switch (availability.kind) {
    case 'available':
      return {
        ...base,
        status: 'pass',
        explanation: 'The browser reports that a Bluetooth adapter is available.',
      };
    case 'unavailable':
      return {
        ...base,
        status: 'fail',
        explanation:
          'The browser reports that no Bluetooth adapter is available. Check that this device has Bluetooth, that Bluetooth is turned on, and that the browser is allowed to use it, then run the checks again.',
      };
    case 'not-run':
      return {
        ...base,
        status: 'skipped',
        explanation: 'Not checked, because the Web Bluetooth API is not available.',
      };
    case 'method-missing':
      return {
        ...base,
        status: 'fail',
        explanation:
          'This browser provides navigator.bluetooth but not getAvailability(), so MatPilot cannot confirm that a Bluetooth adapter is available.',
      };
    case 'error':
      return {
        ...base,
        status: 'fail',
        explanation: `Asking the browser for Bluetooth availability failed: ${availability.message}`,
      };
  }
}

function checkPlatform(platform: PlatformInfo): CheckResult {
  const assessment = assessPlatform(platform);
  return {
    id: 'platform',
    title: 'Browser and operating system',
    status: 'info',
    explanation: `Detected ${describePlatform(platform)} (best effort, informational only). ${assessment.reason}`,
  };
}
