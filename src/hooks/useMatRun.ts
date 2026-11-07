'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { cleanProgramName, parseProgramFile, programPythonFiles } from '@/lib/blocks/program-file';
import type { Mat, MatPlacement } from '@/lib/mats/mat';
import { MOTOR_TOP_SPEED_DEG_S } from '@/lib/robots/motion';
import type { RobotProfile } from '@/lib/robots/profile';
import type { RulesProfile } from '@/lib/robots/rules';
import type { Frame, Pose } from '@/lib/sim/engine';
import { HANDOFF_KEY, readHandoff } from '@/lib/sim/handoff';
import { reviewRun, type RunReview } from '@/lib/sim/review';
import { runOnMat } from '@/lib/sim/run';
import type { SimFile, SimResult } from '@/lib/sim/runner';

/**
 * Running a program on the mat and playing it back (ADR 0016, step 7c). The program is the one
 * the Blocks page last made (handed over in this browser), or a program file loaded here.
 */

/** Without rules, a run stops after this long. */
export const DEFAULT_RUN_SECONDS = 120;

export type ProgramSource =
  | { readonly kind: 'blocks' }
  | { readonly kind: 'file'; readonly name: string; readonly files: readonly SimFile[] };

export type RunState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running' }
  | { readonly kind: 'done'; readonly result: SimResult; readonly review: RunReview }
  | { readonly kind: 'error'; readonly message: string };

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
    return window.localStorage.getItem(HANDOFF_KEY);
  } catch {
    return null;
  }
};

/** The pose at time `t`, between the two frames around it. */
export function poseAt(frames: readonly Frame[], t: number): Pose | null {
  if (frames.length === 0) return null;
  let low = 0;
  let high = frames.length - 1;
  if (t <= frames[0]!.t) return frames[0]!.pose;
  if (t >= frames[high]!.t) return frames[high]!.pose;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (frames[middle]!.t <= t) low = middle;
    else high = middle;
  }
  const a = frames[low]!;
  const b = frames[high]!;
  const k = (t - a.t) / (b.t - a.t || 1);
  return {
    xMm: a.pose.xMm + (b.pose.xMm - a.pose.xMm) * k,
    yMm: a.pose.yMm + (b.pose.yMm - a.pose.yMm) * k,
    headingDeg: a.pose.headingDeg + (b.pose.headingDeg - a.pose.headingDeg) * k,
  };
}

export function useMatRun(
  mat: Mat | null,
  robot: RobotProfile | null,
  placement: MatPlacement | null,
  rules: RulesProfile | null,
) {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const handoff = useMemo(() => readHandoff(raw), [raw]);
  const [source, setSource] = useState<ProgramSource>({ kind: 'blocks' });
  const [state, setState] = useState<RunState>({ kind: 'idle' });
  const [time, setTimeState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const frame = useRef(0);
  // The playhead, also kept here so the animation reads it without waiting for a render.
  const timeRef = useRef(0);
  const setTime = useCallback((t: number) => {
    timeRef.current = t;
    setTimeState(t);
  }, []);

  const files = source.kind === 'blocks' ? (handoff?.files ?? null) : source.files;
  const programName = source.kind === 'blocks' ? (handoff?.name ?? null) : source.name;
  const blocked =
    !mat || !robot || !placement
      ? 'Choose the robot and place it on the mat first.'
      : !files
        ? 'Open the Blocks page once, or load a program file, to have a program to run.'
        : source.kind === 'blocks' && (handoff?.problems ?? 0) > 0
          ? `The blocks have ${handoff!.problems === 1 ? 'a problem' : `${handoff!.problems} problems`} to fix on the Blocks page first.`
          : null;
  const seconds = rules?.runSeconds ?? DEFAULT_RUN_SECONDS;

  const run = useCallback(async () => {
    if (blocked || !mat || !robot || !placement || !files) return;
    setState({ kind: 'running' });
    setPlaying(false);
    setTime(0);
    try {
      const result = await runOnMat({
        files,
        robot: {
          wheelDiameterMm: robot.wheels.diameterMm,
          trackMm: robot.wheels.trackMm,
          left: robot.drive.left,
          right: robot.drive.right,
          mirrored: robot.drive.mirrored,
          motorTopSpeedDegS: MOTOR_TOP_SPEED_DEG_S[robot.drive.motor],
        },
        start: { xMm: placement.xMm, yMm: placement.yMm, headingDeg: placement.headingDeg },
        timeLimitMs: seconds * 1000,
        driveSpeed:
          robot.speed.mode === 'set'
            ? {
                straightSpeed: robot.speed.straightMmS,
                straightAcceleration: robot.speed.straightAccelerationMmS2,
                turnRate: robot.speed.turnRateDegS,
                turnAcceleration: robot.speed.turnAccelerationDegS2,
              }
            : null,
      });
      setState({ kind: 'done', result, review: reviewRun(result, robot, mat) });
      setPlaying(true);
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }, [blocked, mat, robot, placement, files, seconds, setTime]);

  const end = state.kind === 'done' ? state.result.timeMs : 0;

  // Playback: real time times the chosen speed.
  useEffect(() => {
    if (!playing || state.kind !== 'done') return;
    let last = performance.now();
    const tick = (now: number) => {
      const next = Math.min(end, timeRef.current + (now - last) * speed);
      last = now;
      setTime(next);
      if (next >= end) setPlaying(false);
      else frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [playing, speed, state.kind, end, setTime]);

  const loadFile = useCallback((text: string, fileName: string) => {
    const parsed = parseProgramFile(text, fileName);
    if (!parsed.ok) return parsed.message;
    const python = programPythonFiles(text);
    if (!python.some((file) => file.name === 'main.py')) {
      return 'This program file has no Python in it. Open it on the Blocks page and save it again.';
    }
    setSource({ kind: 'file', name: cleanProgramName(parsed.name), files: python });
    setState({ kind: 'idle' });
    return null;
  }, []);

  const reset = useCallback(() => {
    setState({ kind: 'idle' });
    setPlaying(false);
    setTime(0);
  }, [setTime]);

  const pose = state.kind === 'done' ? poseAt(state.result.frames, time) : null;

  return {
    source,
    setSource,
    handoff,
    programName,
    blocked,
    seconds,
    state,
    run,
    reset,
    loadFile,
    time,
    seek: (t: number) => {
      setPlaying(false);
      setTime(t);
    },
    playing,
    play: () => {
      if (timeRef.current >= end) setTime(0);
      setPlaying(true);
    },
    pause: () => setPlaying(false),
    speed,
    setSpeed,
    pose,
    end,
  };
}

export type MatRun = ReturnType<typeof useMatRun>;
