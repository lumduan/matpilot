'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * A per-viewer preference kept in this browser (a remembered panel or switch). The value is one
 * of `allowed`; anything else, or storage that cannot be read, gives `fallback`. The server render
 * and hydration use `fallback`, so they always agree.
 */

const listeners = new Set<() => void>();
/** This page's own choices, so a switch still works where storage is blocked. */
const memory = new Map<string, string>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function read(key: string): string | null {
  const own = memory.get(key);
  if (own !== undefined) return own;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function useStoredState<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[],
): readonly [T, (next: T) => void] {
  const stored = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const value =
    stored !== null && (allowed as readonly string[]).includes(stored) ? (stored as T) : fallback;
  const set = useCallback(
    (next: T) => {
      memory.set(key, next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Not remembered; the page still works.
      }
      for (const listener of [...listeners]) listener();
    },
    [key],
  );
  return [value, set] as const;
}
