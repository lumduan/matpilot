'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  runCompatibilityCheck,
  watchBluetoothAvailability,
  type CompatibilityReport,
} from '@/lib/compat';

export interface CompatibilityState {
  /** `null` until the first check finishes. */
  readonly report: CompatibilityReport | null;
  readonly checking: boolean;
  readonly recheck: () => void;
}

/** Runs the compatibility check on mount, on `availabilitychanged`, and on request. */
export function useCompatibility(): CompatibilityState {
  const [report, setReport] = useState<CompatibilityReport | null>(null);
  const [checking, setChecking] = useState(true);
  const latestRun = useRef(0);

  // Only the most recent run may update state, so a slow earlier run cannot overwrite it.
  const start = useCallback(() => {
    const run = ++latestRun.current;
    void runCompatibilityCheck().then((next) => {
      if (run !== latestRun.current) return;
      setReport(next);
      setChecking(false);
    });
  }, []);

  useEffect(() => {
    start();
    return watchBluetoothAvailability(start);
  }, [start]);

  const recheck = useCallback(() => {
    setChecking(true);
    start();
  }, [start]);

  return { report, checking, recheck };
}
