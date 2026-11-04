/**
 * Keeps the hardware test session in the browser's local storage, so a reload does not lose the
 * results. This is a convenience only: storage can be missing, full, or blocked (private windows,
 * blocked site data), and every function here then quietly does nothing.
 */

import { SESSION_SCHEMA, type HardwareTestSession } from './session';

export const SESSION_STORAGE_KEY = 'matpilot.hardware-test.v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The browser's `localStorage`, or `undefined` outside a browser or when access is blocked. */
export function browserStorage(): StorageLike | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

export function loadSession(storage: StorageLike | undefined): HardwareTestSession | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SESSION_STORAGE_KEY);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return isSession(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveSession(storage: StorageLike | undefined, session: HardwareTestSession): void {
  try {
    storage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Full or blocked storage: the session simply is not kept across reloads.
  }
}

export function clearSession(storage: StorageLike | undefined): void {
  try {
    storage?.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringOrNull(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function isCount(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Structural check of stored data. Anything unexpected is discarded rather than trusted. */
export function isSession(value: unknown): value is HardwareTestSession {
  if (!isRecord(value) || value.schema !== SESSION_SCHEMA) return false;
  const { uncaught, compat, hub, environment, log } = value;
  return (
    typeof value.startedAt === 'string' &&
    !Number.isNaN(Date.parse(value.startedAt)) &&
    typeof value.updatedAt === 'string' &&
    !Number.isNaN(Date.parse(value.updatedAt)) &&
    (environment === null ||
      (isRecord(environment) &&
        typeof environment.browser === 'string' &&
        typeof environment.os === 'string' &&
        typeof environment.support === 'string' &&
        typeof environment.userAgent === 'string' &&
        isStringOrNull(environment.browserMajor) &&
        isStringOrNull(environment.browserVersion) &&
        isStringOrNull(environment.osVersion))) &&
    (compat === null ||
      (isRecord(compat) &&
        typeof compat.ready === 'boolean' &&
        Array.isArray(compat.failedChecks) &&
        compat.failedChecks.every((item) => typeof item === 'string'))) &&
    typeof value.pickerOpened === 'boolean' &&
    typeof value.cancelObserved === 'boolean' &&
    (value.pickerAnswer === null || value.pickerAnswer === 'yes' || value.pickerAnswer === 'no') &&
    (hub === null ||
      (isRecord(hub) &&
        isStringOrNull(hub.name) &&
        typeof hub.firmwareRevision === 'string' &&
        typeof hub.protocolRevision === 'string')) &&
    isStringOrNull(value.lastProbeError) &&
    typeof value.connectionLossObserved === 'boolean' &&
    isRecord(uncaught) &&
    isCount(uncaught.errors) &&
    isCount(uncaught.rejections) &&
    isCount(uncaught.cspViolations) &&
    Array.isArray(value.uncaughtSamples) &&
    value.uncaughtSamples.every((item) => typeof item === 'string') &&
    Array.isArray(log) &&
    log.every(
      (entry) => isRecord(entry) && isCount(entry.atMs) && typeof entry.text === 'string',
    ) &&
    isCount(value.droppedLogEntries)
  );
}
