'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { HubProbe, INITIAL_HUB_PROBE_STATE, type HubProbeState } from '@/lib/ble';
import {
  browserStorage,
  buildReport,
  collectTestEnvironment,
  copyText,
  createSession,
  downloadText,
  HardwareTestRecorder,
  reportFileName,
  watchUncaught,
  type HardwareTestSession,
  type PickerAnswer,
} from '@/lib/hwtest';
import { useCompatibility } from './useCompatibility';

/** Rendered on the server and during hydration: no time, no browser data. */
const SERVER_SESSION: HardwareTestSession = createSession(new Date(0));

function getServerSession(): HardwareTestSession {
  return SERVER_SESSION;
}

function getServerProbeState(): HubProbeState {
  return INITIAL_HUB_PROBE_STATE;
}

export interface HardwareTestControls {
  readonly session: HardwareTestSession;
  readonly probeState: HubProbeState;
  readonly checking: boolean;
  readonly report: string;
  /** Call from a click handler: the browser only opens its device picker on a user gesture. */
  readonly connect: () => void;
  readonly disconnect: () => void;
  readonly recheck: () => void;
  readonly answerPicker: (answer: PickerAnswer) => void;
  readonly restart: () => void;
  /** Resolves `false` when the browser would not copy (the user then copies by hand). */
  readonly copyReport: () => Promise<boolean>;
  readonly downloadReport: () => void;
}

/** React binding for the hardware test page: hub probe, compatibility check, and recorder. */
export function useHardwareTest(): HardwareTestControls {
  const { report: compatReport, checking, recheck } = useCompatibility();
  const [probe] = useState(() => new HubProbe());
  const [recorder] = useState(() => new HardwareTestRecorder());
  const probeState = useSyncExternalStore(probe.subscribe, probe.getState, getServerProbeState);
  const session = useSyncExternalStore(recorder.subscribe, recorder.getState, getServerSession);

  useEffect(() => {
    recorder.connectStorage(browserStorage());
    const detachProbe = recorder.attachProbe(probe);
    const stopWatching = watchUncaught((info) => recorder.record({ type: 'uncaught', ...info }));
    let active = true;
    void collectTestEnvironment().then((environment) => {
      if (active) recorder.record({ type: 'environment', environment });
    });
    return () => {
      active = false;
      stopWatching();
      detachProbe();
      probe.dispose();
    };
  }, [probe, recorder]);

  useEffect(() => {
    if (!compatReport) return;
    recorder.record({
      type: 'compat',
      compat: {
        ready: compatReport.ready,
        failedChecks: compatReport.checks
          .filter((check) => check.status === 'fail')
          .map((check) => check.title),
      },
    });
  }, [recorder, compatReport]);

  const report = useMemo(() => buildReport(session), [session]);

  const connect = useCallback(() => {
    void probe.connect();
  }, [probe]);
  const disconnect = useCallback(() => probe.disconnect(), [probe]);
  const answerPicker = useCallback(
    (answer: PickerAnswer) => recorder.record({ type: 'picker-answer', answer }),
    [recorder],
  );
  const restart = useCallback(() => {
    probe.dispose();
    recorder.restart();
  }, [probe, recorder]);
  const copyReport = useCallback(() => copyText(report), [report]);
  const downloadReport = useCallback(
    () => downloadText(reportFileName(session), report),
    [report, session],
  );

  return {
    session,
    probeState,
    checking,
    report,
    connect,
    disconnect,
    recheck,
    answerPicker,
    restart,
    copyReport,
    downloadReport,
  };
}
