'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  newRobotId,
  parseRobotFile,
  readRobot,
  robotRecord,
  robotFileName,
  sameRobot,
  serializeRobotFile,
  type RobotProfile,
} from '@/lib/robots/profile';
import { downloadTextFile } from './downloadFile';

/**
 * The robots made on the Robots page (ADR 0016), kept in this browser. A block program keeps its
 * own copy of the robot it uses (program meta), so changing or deleting a robot here never
 * changes a program until it is chosen again.
 */

const STORAGE_KEY = 'matpilot.robots.v1';

interface Stored {
  readonly robots: readonly RobotProfile[];
  /** The robot open on the Robots page. */
  readonly openId: string | null;
}

const EMPTY: Stored = { robots: [], openId: null };

const listeners = new Set<() => void>();
/** What could not be stored (storage blocked), kept in this page's memory instead. */
let memory: string | null = null;
let cache: { raw: string | null; value: Stored } | null = null;

function readRaw(): string | null {
  if (memory !== null) return memory;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): Stored {
  if (raw === null) return EMPTY;
  try {
    const data = JSON.parse(raw) as { robots?: unknown; openId?: unknown };
    const robots: RobotProfile[] = [];
    for (const item of Array.isArray(data.robots) ? (data.robots as unknown[]) : []) {
      const robot = readRobot(item);
      if (robot && !robots.some((each) => each.id === robot.id)) robots.push(robot);
    }
    const openId =
      typeof data.openId === 'string' && robots.some((robot) => robot.id === data.openId)
        ? data.openId
        : (robots[0]?.id ?? null);
    return { robots, openId };
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): Stored {
  const raw = readRaw();
  if (cache?.raw !== raw) cache = { raw, value: parse(raw) };
  return cache.value;
}

function write(next: Stored): void {
  const raw = JSON.stringify({ robots: next.robots.map(robotRecord), openId: next.openId });
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
    memory = null;
  } catch {
    memory = raw;
  }
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

export interface RobotLibrary {
  readonly robots: readonly RobotProfile[];
  readonly openId: string | null;
  readonly open: RobotProfile | null;
  readonly setOpen: (id: string) => void;
  /** Adds the robot, or replaces the one with its id. */
  readonly save: (robot: RobotProfile) => void;
  readonly remove: (id: string) => void;
  /** Saves the robot as a `.matpilot-robot.json` file; gives the file's name. */
  readonly exportFile: (robot: RobotProfile) => string;
  /** Adds the robot in a file and opens it; a robot already here is opened, not added twice. */
  readonly importFile: (
    text: string,
  ) => { ok: true; robot: RobotProfile } | { ok: false; message: string };
}

export function useRobots(): RobotLibrary {
  const stored = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const setOpen = useCallback((id: string) => {
    write({ ...getSnapshot(), openId: id });
  }, []);
  const save = useCallback((robot: RobotProfile) => {
    const now = getSnapshot();
    const exists = now.robots.some((each) => each.id === robot.id);
    write({
      robots: exists
        ? now.robots.map((each) => (each.id === robot.id ? robot : each))
        : [...now.robots, robot],
      openId: robot.id,
    });
  }, []);
  const remove = useCallback((id: string) => {
    const now = getSnapshot();
    const index = now.robots.findIndex((each) => each.id === id);
    const robots = now.robots.filter((each) => each.id !== id);
    write({
      robots,
      openId:
        now.openId === id ? (robots[Math.min(index, robots.length - 1)]?.id ?? null) : now.openId,
    });
  }, []);
  const exportFile = useCallback((robot: RobotProfile) => {
    const fileName = robotFileName(robot.name);
    downloadTextFile(fileName, serializeRobotFile(robot));
    return fileName;
  }, []);
  const importFile = useCallback((text: string) => {
    const parsed = parseRobotFile(text);
    if (!parsed.ok) return parsed;
    const now = getSnapshot();
    const same = now.robots.find(
      (each) => sameRobot(each, parsed.robot) && each.model?.text === parsed.robot.model?.text,
    );
    if (same) {
      write({ ...now, openId: same.id });
      return { ok: true as const, robot: same };
    }
    // Another robot with this id (an older or newer copy) stays; this one gets its own id.
    const robot = now.robots.some((each) => each.id === parsed.robot.id)
      ? { ...parsed.robot, id: newRobotId() }
      : parsed.robot;
    write({ robots: [...now.robots, robot], openId: robot.id });
    return { ok: true as const, robot };
  }, []);
  return {
    robots: stored.robots,
    openId: stored.openId,
    open: stored.robots.find((robot) => robot.id === stored.openId) ?? null,
    setOpen,
    save,
    remove,
    exportFile,
    importFile,
  };
}
