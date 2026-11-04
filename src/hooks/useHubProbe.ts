'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { HubProbe, INITIAL_HUB_PROBE_STATE, type HubProbeState } from '@/lib/ble';

export interface HubProbeControls {
  readonly state: HubProbeState;
  /** Call from a click handler: the browser only opens its device picker on a user gesture. */
  readonly connect: () => void;
  readonly disconnect: () => void;
}

function getServerSnapshot(): HubProbeState {
  return INITIAL_HUB_PROBE_STATE;
}

/** React binding for the framework-agnostic `HubProbe` in src/lib/ble/. */
export function useHubProbe(): HubProbeControls {
  const [probe] = useState(() => new HubProbe());
  const state = useSyncExternalStore(probe.subscribe, probe.getState, getServerSnapshot);

  useEffect(() => () => probe.dispose(), [probe]);

  const connect = useCallback(() => {
    void probe.connect();
  }, [probe]);
  const disconnect = useCallback(() => probe.disconnect(), [probe]);

  return { state, connect, disconnect };
}
