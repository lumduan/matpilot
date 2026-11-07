'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  INCOMING_KEY,
  incomingData,
  readIncoming,
  type IncomingBlocks,
} from '@/lib/blocks/incoming';

/**
 * Blocks another page handed to the Blocks page (src/lib/blocks/incoming.ts): a path drawn on
 * the Mats page. It shows up when the page opens or comes back into view.
 */
function subscribe(listener: () => void): () => void {
  window.addEventListener('storage', listener);
  window.addEventListener('focus', listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener('focus', listener);
  };
}

const readRaw = () => {
  try {
    return window.localStorage.getItem(INCOMING_KEY);
  } catch {
    return null;
  }
};

export function useIncomingBlocks(): {
  readonly incoming: IncomingBlocks | null;
  readonly clear: () => void;
} {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const incoming = useMemo(() => readIncoming(raw), [raw]);
  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(INCOMING_KEY);
    } catch {
      // Storage is blocked: nothing was kept, so there is nothing to clear.
    }
    // The storage event fires only in other pages: tell this one too.
    window.dispatchEvent(new StorageEvent('storage', { key: INCOMING_KEY }));
  }, []);
  return { incoming, clear };
}

/** Hands blocks to the Blocks page (the Mats page's path): it offers them when it opens. */
export function useSendToBlocks(): (name: string, steps: IncomingBlocks['steps']) => boolean {
  return useCallback((name, steps) => {
    try {
      window.localStorage.setItem(INCOMING_KEY, incomingData(name, steps));
      return true;
    } catch {
      return false;
    }
  }, []);
}
