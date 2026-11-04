/**
 * Records a hardware test session from live sources (the hub probe, the compatibility check, the
 * uncaught-error monitor) and notifies subscribers. Framework-agnostic; the React binding is
 * src/hooks/useHardwareTest.ts.
 *
 * It subscribes to the hub probe directly instead of reading probe state from React renders, so
 * short-lived states (the picker opening, then closing) are never missed.
 */

import type { HubProbeState } from '../ble/hub-probe';
import {
  applyEvent,
  createSession,
  restartSession,
  type HardwareTestSession,
  type SessionEvent,
} from './session';
import { clearSession, loadSession, saveSession, type StorageLike } from './storage';

export interface ProbeSourceLike {
  getState(): HubProbeState;
  subscribe(listener: (state: HubProbeState) => void): () => void;
}

type Listener = (session: HardwareTestSession) => void;

export class HardwareTestRecorder {
  #session: HardwareTestSession;
  #storage: StorageLike | undefined;
  readonly #listeners = new Set<Listener>();
  readonly #now: () => Date;

  constructor(options: { now?: () => Date } = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#session = createSession(this.#now());
  }

  /** Current session. Stable reference until the next change (safe for `useSyncExternalStore`). */
  readonly getState = (): HardwareTestSession => this.#session;

  readonly subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /**
   * Uses `storage` from now on and restores a session saved there earlier, if any. Call it in the
   * browser only (an effect), never while rendering on the server.
   */
  connectStorage(storage: StorageLike | undefined): void {
    this.#storage = storage;
    const saved = loadSession(storage);
    if (saved) this.#set(saved, false);
  }

  record(event: SessionEvent): void {
    this.#set(applyEvent(this.#session, event, this.#now()), true);
  }

  /** Records every probe state change. Returns a function that stops recording. */
  attachProbe(probe: ProbeSourceLike): () => void {
    return probe.subscribe((state) => this.record({ type: 'probe', state }));
  }

  /** Starts a new session. Keeps what is known about the browser (environment, checks). */
  restart(): void {
    clearSession(this.#storage);
    this.#set(restartSession(this.#session, this.#now()), true);
  }

  #set(next: HardwareTestSession, persist: boolean): void {
    if (next === this.#session) return;
    this.#session = next;
    if (persist) saveSession(this.#storage, next);
    for (const listener of [...this.#listeners]) listener(next);
  }
}
