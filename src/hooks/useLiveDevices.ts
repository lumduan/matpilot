'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useStoredState } from './useStoredState';
import type { ConnectionSnapshot, HubConnection } from '@/lib/ble/hub-connection';
import { KEEPALIVE_INTERVAL_MS, LIVE_VIEW_PASTE } from '@/lib/devices/hub-source';
import { EMPTY_LIVE_SNAPSHOT, LiveStore, type LiveSnapshot } from '@/lib/devices/live';

/** What the device bar shows (docs/adr/0009-live-device-values.md). */
export type LiveStatus =
  /** No hub connected. */
  | 'connect'
  /** The hub's firmware cannot run the reader (no REPL, or protocol older than 1.4). */
  | 'unsupported'
  /** Switched off by the user. */
  | 'off'
  /** The user's program runs; the reader waits for it to end. */
  | 'paused'
  | 'starting'
  | 'live'
  /** It ended on the hub (the stop button): the user resumes it. */
  | 'stopped'
  | 'error';

export interface LiveDevices {
  readonly status: LiveStatus;
  readonly snapshot: LiveSnapshot;
  readonly error: string | null;
  readonly enabled: boolean;
  readonly setEnabled: (enabled: boolean) => void;
  /** Starts the reader again after it stopped on the hub or failed. */
  readonly resume: () => void;
}

const STORAGE_KEY = 'matpilot.live.enabled.v1';
const ON_OFF = ['on', 'off'] as const;
/** Wait this long after the hub becomes idle, so back-to-back runs do not start it in between. */
const START_DELAY_MS = 400;
/** How long to wait for the reader's last line after the hub reports that it ended. */
const END_SETTLE_MS = 250;

const getServerSnapshot = () => EMPTY_LIVE_SNAPSHOT;

function useVisible(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      document.addEventListener('visibilitychange', onChange);
      return () => document.removeEventListener('visibilitychange', onChange);
    },
    () => document.visibilityState === 'visible',
    () => false,
  );
}

/**
 * Runs the live device values reader in the hub's REPL whenever the hub is connected and idle,
 * and only while the page is visible. The user's program always takes priority: HubConnection.run
 * stops the reader first, and the reader comes back when the program ends.
 */
export function useLiveDevices(
  hub: HubConnection,
  connection: ConnectionSnapshot,
  compiling: boolean,
  wanted: boolean,
): LiveDevices {
  const [store] = useState(() => new LiveStore());
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
  const visible = useVisible();
  const [stored, setStored] = useStoredState(STORAGE_KEY, 'on', ON_OFF);
  const enabled = stored === 'on';
  /** Set when the reader ended on the hub or failed; cleared by resume(). */
  const [blocked, setBlocked] = useState<'stopped' | 'error' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const offOutput = hub.onReplOutput((bytes) => store.push(bytes));
    return offOutput;
  }, [hub, store]);

  const { link, program, flags, repl } = connection;
  const ready = link.status === 'ready';
  const supported = ready && link.hub.supportsRepl;
  const userBusy = compiling || program.phase !== 'idle' || flags.userProgramRunning;

  // Follow the connection: how a session ended, and a reset when the hub goes away.
  useEffect(() => {
    let previous = hub.getSnapshot();
    let judge: ReturnType<typeof setTimeout> | undefined;
    const off = hub.subscribe((next) => {
      const before = previous;
      previous = next;
      if (before.link.status === 'ready' && next.link.status !== 'ready') {
        store.clear();
        setBlocked(null);
        setError(null);
        return;
      }
      if (before.repl.phase === 'off' || next.repl.phase !== 'off') return;
      const ended = next.repl.ended;
      if (ended === 'failed') {
        setBlocked('error');
        return;
      }
      if (ended !== 'ended') return;
      // The reader's last line can arrive just after the status report; wait a moment for it.
      clearTimeout(judge);
      judge = setTimeout(() => {
        const said = store.getSnapshot();
        if (said.ended === 'error') {
          setBlocked('error');
          setError(`The hub reported ${said.error ?? 'an error'}.`);
        } else if (said.ended !== 'timeout') {
          // Ended on the hub without timing out: its stop button was pressed.
          setBlocked('stopped');
        }
      }, END_SETTLE_MS);
    });
    return () => {
      clearTimeout(judge);
      off();
    };
  }, [hub, store]);

  const shouldRun = wanted && enabled && supported && visible && !userBusy && blocked === null;

  // Start when the hub is idle.
  useEffect(() => {
    if (!shouldRun || repl.phase !== 'off' || flags.userProgramRunning) return;
    const timer = setTimeout(() => {
      store.begin();
      void hub.runInRepl(LIVE_VIEW_PASTE).then((result) => {
        if (result.ok || result.error.kind === 'cancelled' || result.error.kind === 'busy') return;
        if (result.error.kind === 'not-connected') return;
        setBlocked('error');
        setError(
          result.error.kind === 'unsupported'
            ? 'This hub’s firmware cannot show live values.'
            : result.error.kind === 'timeout'
              ? 'The hub did not answer in time.'
              : `Sending to the hub failed: ${result.error.detail}`,
        );
      });
    }, START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [shouldRun, repl.phase, flags.userProgramRunning, hub, store]);

  // Stop when it should not run: switched off, page hidden. (A Run stops it in HubConnection.)
  useEffect(() => {
    if (!shouldRun && !userBusy && (repl.phase === 'starting' || repl.phase === 'running')) {
      void hub.stopRepl();
    }
  }, [shouldRun, userBusy, repl.phase, hub]);

  // Keep-alive while it runs: the reader exits by itself if these stop (hub-source.ts).
  useEffect(() => {
    if (repl.phase !== 'running') return;
    void hub.keepReplAlive();
    const timer = setInterval(() => void hub.keepReplAlive(), KEEPALIVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [repl.phase, hub]);

  const setEnabled = useCallback((next: boolean) => setStored(next ? 'on' : 'off'), [setStored]);

  const resume = useCallback(() => {
    setBlocked(null);
    setError(null);
  }, []);

  let status: LiveStatus;
  if (!ready) status = 'connect';
  else if (!supported) status = 'unsupported';
  else if (!enabled) status = 'off';
  else if (userBusy) status = 'paused';
  else if (blocked === 'stopped') status = 'stopped';
  else if (blocked === 'error') status = 'error';
  else if (repl.phase === 'running' && snapshot.reading) status = 'live';
  else status = 'starting';

  return { status, snapshot, error, enabled, setEnabled, resume };
}
