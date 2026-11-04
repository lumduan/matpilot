/**
 * Collects compatibility inputs from browser globals. Every function takes the globals as a
 * parameter (defaulting to `globalThis`) so tests can pass a mocked `navigator`.
 */

import {
  evaluateCompatibility,
  type AvailabilityResult,
  type CompatibilityEnvironment,
  type CompatibilityReport,
} from './checks';
import { detectPlatform, type UserAgentDataLike } from './platform';

/** The parts of `navigator.bluetooth` the compatibility check touches. */
export interface BluetoothAvailabilityLike {
  getAvailability?: () => Promise<boolean>;
  addEventListener?: (type: 'availabilitychanged', listener: () => void) => void;
  removeEventListener?: (type: 'availabilitychanged', listener: () => void) => void;
}

export interface NavigatorLike {
  readonly userAgent?: string;
  readonly userAgentData?: UserAgentDataLike;
  readonly maxTouchPoints?: number;
  readonly bluetooth?: BluetoothAvailabilityLike;
}

export interface GlobalsLike {
  readonly isSecureContext?: boolean;
  readonly navigator?: NavigatorLike;
}

/** `getAvailability()` should answer almost immediately; do not leave the UI stuck on it. */
export const AVAILABILITY_TIMEOUT_MS = 5000;

function defaultGlobals(): GlobalsLike {
  return globalThis as unknown as GlobalsLike;
}

export async function collectEnvironment(
  globals: GlobalsLike = defaultGlobals(),
  timeoutMs: number = AVAILABILITY_TIMEOUT_MS,
): Promise<CompatibilityEnvironment> {
  const nav = globals.navigator;
  const hasWebBluetooth = nav !== undefined && 'bluetooth' in nav;
  return {
    isSecureContext: globals.isSecureContext === true,
    hasWebBluetooth,
    availability: hasWebBluetooth
      ? await queryAvailability(nav.bluetooth, timeoutMs)
      : { kind: 'not-run' },
    platform: detectPlatform({
      userAgent: nav?.userAgent,
      userAgentData: nav?.userAgentData,
      maxTouchPoints: nav?.maxTouchPoints,
    }),
  };
}

/** Runs every compatibility check against the current browser. Never rejects. */
export async function runCompatibilityCheck(
  globals: GlobalsLike = defaultGlobals(),
  timeoutMs: number = AVAILABILITY_TIMEOUT_MS,
): Promise<CompatibilityReport> {
  return evaluateCompatibility(await collectEnvironment(globals, timeoutMs));
}

async function queryAvailability(
  bluetooth: BluetoothAvailabilityLike | undefined,
  timeoutMs: number,
): Promise<AvailabilityResult> {
  if (typeof bluetooth?.getAvailability !== 'function') return { kind: 'method-missing' };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`no answer within ${timeoutMs / 1000} seconds`)),
        timeoutMs,
      );
    });
    const available = await Promise.race([bluetooth.getAvailability(), timeout]);
    return available ? { kind: 'available' } : { kind: 'unavailable' };
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calls `onChange` when the browser fires `availabilitychanged` on `navigator.bluetooth`
 * (for example when Bluetooth is switched on). Browsers that never fire the event are fine:
 * the UI also offers a manual "Run checks again" button. Returns an unsubscribe function.
 */
export function watchBluetoothAvailability(
  onChange: () => void,
  globals: GlobalsLike = defaultGlobals(),
): () => void {
  const bluetooth = globals.navigator?.bluetooth;
  if (typeof bluetooth?.addEventListener !== 'function') return () => {};
  const listener = () => onChange();
  bluetooth.addEventListener('availabilitychanged', listener);
  return () => bluetooth.removeEventListener?.('availabilitychanged', listener);
}
