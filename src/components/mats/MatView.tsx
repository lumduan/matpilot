'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { contains, type Point, type Polygon } from '@/lib/geometry/rect';
import type { Mat, MatArea, MatPlacement } from '@/lib/mats/mat';
import { driveFromHandle, turnOnDial } from '@/lib/mats/path-handles';
import { normalHeading, robotOnMat, sensorOnMat } from '@/lib/mats/pose';
import type { RobotProfile } from '@/lib/robots/profile';
import type { Frame } from '@/lib/sim/engine';
import type { PathSegment } from '@/lib/mats/path';
import type { Spread } from '@/lib/sim/spread';

export type MatTool = 'move' | 'ruler' | 'area' | 'path';

/** A path being made on the Path tab, as the mat shows it. */
export interface PlanView {
  /** The straight drives; backward ones are drawn differently. */
  readonly segments: readonly PathSegment[];
  /**
   * Numbered marks: a point clicked on the mat (it can be dragged), or where a drive ends; and
   * badges for a turn, a wait or a speed where the robot is then.
   */
  readonly marks: readonly {
    readonly id: string;
    readonly label: string;
    readonly kind: 'point' | 'end' | 'badge';
    readonly xMm: number;
    readonly yMm: number;
    readonly selected: boolean;
  }[];
  /** The robot where the highlighted move leaves it, drawn faint. */
  readonly ghost: MatPlacement | null;
  /**
   * The highlighted move's handle: a turn's dial round the robot (degrees in Pybricks' sign), or
   * a drive's end (mm, negative backward). `from` is where the move starts.
   */
  readonly editor:
    | { readonly kind: 'turn'; readonly from: MatPlacement; readonly degrees: number }
    | { readonly kind: 'straight'; readonly from: MatPlacement; readonly mm: number }
    | null;
}

/** A badge's place: beside where the robot is, the next one at the same place above it. */
function badgeSpots(
  marks: PlanView['marks'],
  px: (pixels: number) => number,
): Map<string, { x: number; y: number; width: number }> {
  const spots = new Map<string, { x: number; y: number; width: number }>();
  const stacked = new Map<string, number>();
  for (const mark of marks) {
    if (mark.kind !== 'badge') continue;
    const key = `${Math.round(mark.xMm)},${Math.round(mark.yMm)}`;
    const k = stacked.get(key) ?? 0;
    stacked.set(key, k + 1);
    spots.set(mark.id, {
      x: mark.xMm + px(14),
      y: mark.yMm + px(14) + k * px(24),
      width: px(14 + mark.label.length * 7.4),
    });
  }
  return spots;
}

/** Degrees, counter-clockwise from +x (the MAT frame), to a point at `r` from `c`. */
const around = (c: Point, degrees: number, r: number): Point => ({
  x: c.x + r * Math.cos((degrees * Math.PI) / 180),
  y: c.y + r * Math.sin((degrees * Math.PI) / 180),
});

interface View {
  /** Screen pixels per millimetre. */
  readonly scale: number;
  /** Where the mat's top-left corner is on screen, in pixels. */
  readonly x: number;
  readonly y: number;
}

type Drag =
  | {
      readonly kind: 'pan';
      readonly start: Point;
      readonly view: View;
      /** With the Path tool: the point on the mat, added if the pointer does not move. */
      readonly click?: Point;
    }
  | { readonly kind: 'robot'; readonly offset: Point }
  | { readonly kind: 'turn' }
  /** A mark of the path: a click highlights its move; a point can be dragged. */
  | { readonly kind: 'mark'; readonly id: string; readonly start: Point; moved: boolean }
  /** The highlighted turn's dial (`turn`: the MAT frame's turn so far, to follow it round). */
  | { readonly kind: 'dial'; turn: number }
  /** The highlighted drive's handle (`offset`: from where it ends to the handle, mm). */
  | { readonly kind: 'stretch'; readonly offset: number; readonly backward: boolean }
  | { readonly kind: 'ruler' | 'area'; readonly from: Point };

const MIN_SCALE = 0.02;
const MAX_SCALE = 40;
const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
const round = (value: number) => Math.round(value * 10) / 10;

/**
 * A mat at real size (ADR 0016, step 7b): its picture on a canvas, and over it, in millimetres,
 * a grid, the areas, the robot (drag it, or turn it by its handle), and a ruler. Drag the mat to
 * move it, the wheel or two fingers to zoom. Coordinates are in the MAT frame (origin bottom-left,
 * y up); the screen's y points down, and only this view flips it.
 */
export function MatView({
  mat,
  picture,
  robot,
  placement,
  tool,
  selectedArea,
  onPlace,
  onArea,
  onSelectArea,
  path = null,
  playhead = 0,
  locked = false,
  spread = null,
  plan = null,
  onPathPoint,
  onPlanMark,
  onPlanDrag,
  onPlanEdit,
}: {
  mat: Mat;
  picture: ImageBitmap | null;
  robot: RobotProfile | null;
  placement: MatPlacement | null;
  tool: MatTool;
  selectedArea: string | null;
  /** The robot moved; `done` when the drag ends (then it is saved). */
  onPlace: (placement: MatPlacement, done: boolean) => void;
  /** A rectangle was drawn with the area tool (MAT frame). */
  onArea: (area: Omit<MatArea, 'id' | 'name' | 'kind'>) => void;
  onSelectArea: (id: string | null) => void;
  /** A run's frames: its path is drawn, the part up to `playhead` (ms) darker. */
  path?: readonly Frame[] | null;
  playhead?: number;
  /** The robot cannot be dragged (a run is shown). */
  locked?: boolean;
  /** Where the real robot may end: pretend runs' paths and ends, and the 9-in-10 circle. */
  spread?: Spread | null;
  /** A path being made (the Path tab). */
  plan?: PlanView | null;
  /** A click on the mat with the Path tool. */
  onPathPoint?: (point: Point) => void;
  /** A click on one of the path's marks. */
  onPlanMark?: (id: string) => void;
  /** A point of the path dragged to `point`; `done` when the drag ends. */
  onPlanDrag?: (id: string, point: Point, done: boolean) => void;
  /** The highlighted move's handle moved: a turn's degrees or a drive's mm. */
  onPlanEdit?: (value: number, done: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View | null>(null);
  const [fitted, setFitted] = useState<string | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  const [ruler, setRuler] = useState<{ from: Point; to: Point } | null>(null);
  const [drawing, setDrawing] = useState<{ from: Point; to: Point } | null>(null);
  const drag = useRef<Drag | null>(null);
  const touches = useRef(new Map<number, Point>());
  const pinch = useRef<{ distance: number; view: View; middle: Point } | null>(null);

  const H = mat.heightMm;
  const W = mat.widthMm;
  // A run's path, worked out once per run; playback only cuts it at the playhead.
  const pathShape = useMemo(() => (path && path.length > 1 ? pathOf(path, H) : null), [path, H]);
  const spreadShape = useMemo(
    () =>
      spread
        ? spread.paths.map((each) =>
            each.map((pose) => `${round(pose.xMm)},${round(H - pose.yMm)}`).join(' '),
          )
        : null,
    [spread, H],
  );

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setSize({ width: element.clientWidth, height: element.clientHeight }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fit = (): View | null => {
    if (size.width === 0 || size.height === 0) return null;
    const scale = clampScale(Math.min(size.width / W, size.height / H) * 0.96);
    return { scale, x: (size.width - W * scale) / 2, y: (size.height - H * scale) / 2 };
  };
  // A new mat, or the first size: show all of it.
  if (fitted !== mat.id && size.width > 0) {
    const next = fit();
    if (next) {
      setFitted(mat.id);
      setView(next);
    }
  }

  // The picture, drawn with the same transform as the overlay.
  useEffect(() => {
    const element = canvas.current;
    if (!element || !view) return;
    const dpr = window.devicePixelRatio || 1;
    element.width = Math.round(size.width * dpr);
    element.height = Math.round(size.height * dpr);
    const context = element.getContext('2d');
    if (!context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, element.width, element.height);
    context.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.x, dpr * view.y);
    context.imageSmoothingQuality = 'high';
    if (picture) context.drawImage(picture, 0, 0, W, H);
    else {
      context.fillStyle = '#e8ebef';
      context.fillRect(0, 0, W, H);
    }
  }, [picture, view, size, W, H]);

  if (!view) {
    return <div className="mat-view" ref={host} data-testid="mat-view" />;
  }

  /** Screen pixels (in the view) to the MAT frame. */
  const toMat = (sx: number, sy: number): Point => ({
    x: (sx - view.x) / view.scale,
    y: H - (sy - view.y) / view.scale,
  });
  /** The MAT frame to the overlay's coordinates (mm, y down from the mat's top). */
  const s = (p: Point) => ({ x: p.x, y: H - p.y });
  const points = (polygon: Polygon) =>
    polygon.map((p) => `${round(s(p).x)},${round(s(p).y)}`).join(' ');
  const local = (event: { clientX: number; clientY: number }) => {
    const box = host.current!.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const px = (pixels: number) => pixels / view.scale;

  const onRobot = robot && placement ? robotOnMat(robot, placement) : null;
  const handle =
    onRobot && placement
      ? (() => {
          const dx = onRobot.front.x - placement.xMm;
          const dy = onRobot.front.y - placement.yMm;
          const length = Math.hypot(dx, dy) || 1;
          const extra = px(28);
          return {
            x: onRobot.front.x + (dx / length) * extra,
            y: onRobot.front.y + (dy / length) * extra,
          };
        })()
      : null;

  // The Path tab: its badges, and the highlighted move's handle.
  const spots = plan ? badgeSpots(plan.marks, px) : new Map<string, never>();
  const editor = tool === 'path' && robot ? (plan?.editor ?? null) : null;
  const dial =
    editor?.kind === 'turn' && robot
      ? (() => {
          const c = { x: editor.from.xMm, y: editor.from.yMm };
          const reach = Math.max(
            ...robotOnMat(robot, editor.from).outline.map((p) => Math.hypot(p.x - c.x, p.y - c.y)),
          );
          const r = reach + px(26);
          const was = editor.from.headingDeg;
          const turn = -editor.degrees;
          return { c, r, was, turn, handle: around(c, was + turn, r) };
        })()
      : null;
  const stretch =
    editor?.kind === 'straight' && robot
      ? (() => {
          const c = { x: editor.from.xMm, y: editor.from.yMm };
          const heading = editor.from.headingDeg;
          const end = around(c, heading, editor.mm);
          // The handle is past the robot's front (its back when backing up): pull it by its nose.
          const h = (heading * Math.PI) / 180;
          const along = robotOnMat(robot, { ...editor.from, xMm: end.x, yMm: end.y }).outline.map(
            (p) => (p.x - end.x) * Math.cos(h) + (p.y - end.y) * Math.sin(h),
          );
          const offset = editor.mm < 0 ? Math.min(...along) - px(22) : Math.max(...along) + px(22);
          return { c, heading, mm: editor.mm, end, offset, handle: around(end, heading, offset) };
        })()
      : null;
  /** The mark under `m`: a numbered one near it, else a badge it is on. */
  const markAt = (m: Point) =>
    plan?.marks
      .filter(
        (each) => each.kind !== 'badge' && Math.hypot(each.xMm - m.x, each.yMm - m.y) < px(14),
      )
      .sort(
        (a, b) => Math.hypot(a.xMm - m.x, a.yMm - m.y) - Math.hypot(b.xMm - m.x, b.yMm - m.y),
      )[0] ??
    plan?.marks.find((each) => {
      const spot = spots.get(each.id);
      return (
        spot &&
        m.x >= spot.x - px(2) &&
        m.x <= spot.x + spot.width &&
        Math.abs(m.y - spot.y) <= px(11)
      );
    });

  const zoomAt = (factor: number, at: Point) => {
    setView((current) => {
      if (!current) return current;
      const scale = clampScale(current.scale * factor);
      const k = scale / current.scale;
      return { scale, x: at.x - (at.x - current.x) * k, y: at.y - (at.y - current.y) * k };
    });
  };

  /**
   * The highlighted move's value for a handle dragged to `m` (../../lib/mats/path-handles.ts):
   * a turn's degrees in steps of 5° (1° with Shift), or a drive's mm in steps of 10 mm (1 mm
   * with Shift). Null: no change.
   */
  const handleValue = (
    current: Extract<Drag, { kind: 'dial' | 'stretch' }>,
    m: Point,
    fine: boolean,
  ): number | null => {
    if (current.kind === 'dial') {
      if (!dial) return null;
      const pointer = (Math.atan2(m.y - dial.c.y, m.x - dial.c.x) * 180) / Math.PI;
      const { turn, degrees } = turnOnDial(pointer, dial.was, current.turn, fine ? 1 : 5);
      current.turn = turn;
      return degrees;
    }
    if (!stretch) return null;
    const h = (stretch.heading * Math.PI) / 180;
    const along = (m.x - stretch.c.x) * Math.cos(h) + (m.y - stretch.c.y) * Math.sin(h);
    return driveFromHandle(along, current.offset, current.backward, fine ? 1 : 10);
  };

  const down = (event: ReactPointerEvent<SVGSVGElement>) => {
    const p = local(event);
    touches.current.set(event.pointerId, p);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()] as [Point, Point];
      pinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        view,
        middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      drag.current = null;
      return;
    }
    const m = toMat(p.x, p.y);
    if (tool === 'path') {
      if (dial && Math.hypot(m.x - dial.handle.x, m.y - dial.handle.y) < px(18)) {
        drag.current = { kind: 'dial', turn: dial.turn };
        return;
      }
      if (stretch && Math.hypot(m.x - stretch.handle.x, m.y - stretch.handle.y) < px(18)) {
        drag.current = { kind: 'stretch', offset: stretch.offset, backward: stretch.mm < 0 };
        return;
      }
      const mark = markAt(m);
      drag.current = mark
        ? { kind: 'mark', id: mark.id, start: p, moved: false }
        : { kind: 'pan', start: p, view, click: m };
      return;
    }
    if (tool === 'ruler' || tool === 'area') {
      drag.current = { kind: tool, from: m };
      if (tool === 'ruler') setRuler({ from: m, to: m });
      else setDrawing({ from: m, to: m });
      return;
    }
    if (!locked && handle && Math.hypot(m.x - handle.x, m.y - handle.y) < px(16)) {
      drag.current = { kind: 'turn' };
      return;
    }
    if (!locked && onRobot && placement && contains(onRobot.outline, [m])) {
      drag.current = { kind: 'robot', offset: { x: placement.xMm - m.x, y: placement.yMm - m.y } };
      return;
    }
    const hit = [...mat.areas]
      .reverse()
      .find(
        (area) =>
          m.x >= area.xMm &&
          m.x <= area.xMm + area.widthMm &&
          m.y >= area.yMm &&
          m.y <= area.yMm + area.heightMm,
      );
    onSelectArea(hit?.id ?? null);
    drag.current = { kind: 'pan', start: p, view };
  };

  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const p = local(event);
    setPointer(toMat(p.x, p.y));
    if (touches.current.has(event.pointerId)) touches.current.set(event.pointerId, p);
    if (pinch.current && touches.current.size === 2) {
      const [a, b] = [...touches.current.values()] as [Point, Point];
      const start = pinch.current;
      const scale = clampScale(
        start.view.scale * (Math.hypot(a.x - b.x, a.y - b.y) / (start.distance || 1)),
      );
      const k = scale / start.view.scale;
      const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      setView({
        scale,
        x: middle.x - (start.middle.x - start.view.x) * k,
        y: middle.y - (start.middle.y - start.view.y) * k,
      });
      return;
    }
    const current = drag.current;
    if (!current) return;
    const m = toMat(p.x, p.y);
    if (current.kind === 'dial' || current.kind === 'stretch') {
      const value = handleValue(current, m, event.shiftKey);
      if (value !== null) onPlanEdit?.(value, false);
      return;
    }
    if (current.kind === 'mark') {
      if (!current.moved && Math.hypot(p.x - current.start.x, p.y - current.start.y) < 5) return;
      const point = plan?.marks.find((each) => each.id === current.id);
      if (point?.kind !== 'point') return;
      current.moved = true;
      onPlanDrag?.(current.id, { x: round(m.x), y: round(m.y) }, false);
    } else if (current.kind === 'pan') {
      setView({
        ...current.view,
        x: current.view.x + p.x - current.start.x,
        y: current.view.y + p.y - current.start.y,
      });
    } else if (current.kind === 'robot' && placement) {
      onPlace(
        { ...placement, xMm: round(m.x + current.offset.x), yMm: round(m.y + current.offset.y) },
        false,
      );
    } else if (current.kind === 'turn' && placement) {
      const heading = (Math.atan2(m.y - placement.yMm, m.x - placement.xMm) * 180) / Math.PI;
      // Steps of 1°, or 15° with Shift.
      const step = event.shiftKey ? 15 : 1;
      onPlace(
        { ...placement, headingDeg: normalHeading(Math.round(heading / step) * step) },
        false,
      );
    } else if (current.kind === 'ruler') {
      setRuler({ from: current.from, to: m });
    } else if (current.kind === 'area') {
      setDrawing({ from: current.from, to: m });
    }
  };

  const up = (event: ReactPointerEvent<SVGSVGElement>) => {
    touches.current.delete(event.pointerId);
    if (touches.current.size < 2) pinch.current = null;
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    // A cancelled pointer (the browser took it over) has no position: keep what the drag did.
    const cancelled = event.type === 'pointercancel';
    if (current.kind === 'dial' || current.kind === 'stretch') {
      // Where it was let go: the browser may merge the last moves into this. This ends the drag
      // (Undo takes all of it back at once).
      const p = local(event);
      const value = cancelled ? null : handleValue(current, toMat(p.x, p.y), event.shiftKey);
      const last = plan?.editor?.kind === 'turn' ? plan.editor.degrees : plan?.editor?.mm;
      if (value !== null || last !== undefined) onPlanEdit?.(value ?? last!, true);
    }
    if (current.kind === 'mark') {
      if (current.moved) {
        const p = local(event);
        const m = toMat(p.x, p.y);
        const kept = plan?.marks.find((each) => each.id === current.id);
        const at =
          cancelled && kept ? { x: kept.xMm, y: kept.yMm } : { x: round(m.x), y: round(m.y) };
        onPlanDrag?.(current.id, at, true);
      } else if (!cancelled) onPlanMark?.(current.id);
    }
    if (current.kind === 'pan' && current.click && onPathPoint && !cancelled) {
      const p = local(event);
      // A click, not a drag to look around.
      if (Math.hypot(p.x - current.start.x, p.y - current.start.y) < 5) onPathPoint(current.click);
    }
    if ((current.kind === 'robot' || current.kind === 'turn') && placement)
      onPlace(placement, true);
    if (current.kind === 'area' && drawing) {
      const x = Math.min(drawing.from.x, drawing.to.x);
      const y = Math.min(drawing.from.y, drawing.to.y);
      const width = Math.abs(drawing.to.x - drawing.from.x);
      const height = Math.abs(drawing.to.y - drawing.from.y);
      setDrawing(null);
      if (width >= 5 && height >= 5)
        onArea({ xMm: round(x), yMm: round(y), widthMm: round(width), heightMm: round(height) });
    }
  };

  const key = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    if (!placement || locked) return;
    const step = event.shiftKey ? 10 : 1;
    const moves: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: step },
      ArrowDown: { x: 0, y: -step },
    };
    if (moves[event.key]) {
      event.preventDefault();
      onPlace(
        {
          ...placement,
          xMm: round(placement.xMm + moves[event.key]!.x),
          yMm: round(placement.yMm + moves[event.key]!.y),
        },
        true,
      );
    } else if (event.key === '[' || event.key === ']') {
      event.preventDefault();
      const turn = (event.key === '[' ? 1 : -1) * (event.shiftKey ? 15 : 1);
      onPlace({ ...placement, headingDeg: normalHeading(placement.headingDeg + turn) }, true);
    }
  };

  const grid: number[] = [];
  const gridStep = view.scale * 100 >= 12 ? 100 : 500;
  for (let x = gridStep; x < W; x += gridStep) grid.push(x);
  const gridY: number[] = [];
  for (let y = gridStep; y < H; y += gridStep) gridY.push(y);
  const font = px(12);
  const rulerLength = ruler ? Math.hypot(ruler.to.x - ruler.from.x, ruler.to.y - ruler.from.y) : 0;
  const rulerAngle = ruler
    ? (Math.atan2(ruler.to.y - ruler.from.y, ruler.to.x - ruler.from.x) * 180) / Math.PI
    : 0;

  return (
    <div className="mat-view" ref={host} data-testid="mat-view" data-tool={tool}>
      <canvas
        ref={canvas}
        className="mat-canvas"
        style={{ width: size.width, height: size.height }}
        aria-hidden="true"
      />
      <svg
        className="mat-overlay"
        viewBox={`${-view.x / view.scale} ${-view.y / view.scale} ${size.width / view.scale} ${size.height / view.scale}`}
        width={size.width}
        height={size.height}
        tabIndex={0}
        role="application"
        aria-label={`The mat “${mat.name}”, ${Math.round(W)} × ${Math.round(H)} mm. Arrow keys move the robot (Shift: 10 mm), [ and ] turn it (Shift: 15°).`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={() => setPointer(null)}
        onWheel={(event) => zoomAt(Math.exp(-event.deltaY * 0.0015), local(event))}
        onKeyDown={key}
        data-testid="mat-overlay"
      >
        <rect className="mat-edge" x={0} y={0} width={W} height={H} />
        <g className="mat-grid">
          {grid.map((x) => (
            <line key={`x${x}`} x1={x} y1={0} x2={x} y2={H} />
          ))}
          {gridY.map((y) => (
            <line key={`y${y}`} x1={0} y1={H - y} x2={W} y2={H - y} />
          ))}
        </g>
        {mat.areas.map((area) => (
          <g
            key={area.id}
            className="mat-area"
            data-kind={area.kind}
            data-selected={area.id === selectedArea}
            data-testid="mat-area"
          >
            <rect
              x={area.xMm}
              y={H - area.yMm - area.heightMm}
              width={area.widthMm}
              height={area.heightMm}
            />
            <text
              x={area.xMm + px(4)}
              y={H - area.yMm - area.heightMm + font * 1.2}
              fontSize={font}
            >
              {area.name || area.kind}
            </text>
          </g>
        ))}
        {drawing && (
          <rect
            className="mat-drawing"
            x={Math.min(drawing.from.x, drawing.to.x)}
            y={H - Math.max(drawing.from.y, drawing.to.y)}
            width={Math.abs(drawing.to.x - drawing.from.x)}
            height={Math.abs(drawing.to.y - drawing.from.y)}
          />
        )}
        {spread && spreadShape && path && path.length > 0 && (
          <g className="mat-spread" data-testid="mat-spread">
            {spreadShape.map((points, index) => (
              <polyline key={index} className="mat-spread-path" points={points} />
            ))}
          </g>
        )}
        {plan && robot && plan.ghost && (
          <g className="mat-ghost" data-testid="mat-ghost">
            {(() => {
              const ghost = robotOnMat(robot, plan.ghost);
              return (
                <>
                  <polygon className="mat-ghost-outline" points={points(ghost.outline)} />
                  <line
                    className="mat-ghost-heading"
                    x1={plan.ghost.xMm}
                    y1={H - plan.ghost.yMm}
                    x2={s(ghost.front).x}
                    y2={s(ghost.front).y}
                  />
                </>
              );
            })()}
          </g>
        )}
        {plan && (plan.segments.length > 0 || plan.marks.length > 0) && (
          <g className="mat-plan" data-testid="mat-plan">
            {plan.segments.map((segment, index) => (
              <line
                key={index}
                className={segment.backward ? 'mat-plan-line mat-plan-back' : 'mat-plan-line'}
                x1={round(segment.from.xMm)}
                y1={round(H - segment.from.yMm)}
                x2={round(segment.to.xMm)}
                y2={round(H - segment.to.yMm)}
                data-testid={segment.backward ? 'mat-plan-back' : undefined}
              />
            ))}
            {plan.marks
              .filter((mark) => mark.kind !== 'badge')
              .map((mark) => (
                <g
                  key={mark.id}
                  className="mat-plan-point"
                  data-kind={mark.kind}
                  data-selected={mark.selected}
                >
                  <circle cx={mark.xMm} cy={H - mark.yMm} r={px(mark.kind === 'point' ? 10 : 8)} />
                  <text
                    x={mark.xMm}
                    y={H - mark.yMm}
                    fontSize={px(mark.label.length > 1 ? 10 : 12)}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {mark.label}
                  </text>
                </g>
              ))}
            {plan.marks.map((mark) => {
              const spot = spots.get(mark.id);
              // The turn being changed shows its angle on its dial instead.
              if (!spot || (dial && mark.selected)) return null;
              return (
                <g
                  key={mark.id}
                  className="mat-plan-badge"
                  data-selected={mark.selected}
                  data-testid="mat-plan-badge"
                >
                  <rect
                    x={spot.x}
                    y={H - spot.y - px(10)}
                    width={spot.width}
                    height={px(20)}
                    rx={px(10)}
                  />
                  <text
                    x={spot.x + px(7)}
                    y={H - spot.y}
                    fontSize={px(12)}
                    dominantBaseline="central"
                  >
                    {mark.label}
                  </text>
                </g>
              );
            })}
          </g>
        )}
        {dial && (
          <g className="mat-dial" data-testid="mat-dial">
            <circle className="mat-dial-ring" cx={dial.c.x} cy={H - dial.c.y} r={dial.r} />
            {Math.abs(dial.turn) >= 359.5 ? (
              <circle className="mat-dial-slice" cx={dial.c.x} cy={H - dial.c.y} r={dial.r} />
            ) : (
              (() => {
                const from = around(dial.c, dial.was, dial.r);
                return (
                  <path
                    className="mat-dial-slice"
                    d={`M${round(dial.c.x)} ${round(H - dial.c.y)} L${round(from.x)} ${round(H - from.y)} A${round(dial.r)} ${round(dial.r)} 0 ${Math.abs(dial.turn) > 180 ? 1 : 0} ${dial.turn > 0 ? 0 : 1} ${round(dial.handle.x)} ${round(H - dial.handle.y)} Z`}
                  />
                );
              })()
            )}
            {(() => {
              const from = around(dial.c, dial.was, dial.r);
              const label = around(dial.c, dial.was + dial.turn / 2, dial.r + px(28));
              const degrees = Math.round(-dial.turn);
              return (
                <>
                  <line
                    className="mat-dial-was"
                    x1={dial.c.x}
                    y1={H - dial.c.y}
                    x2={from.x}
                    y2={H - from.y}
                  />
                  <line
                    className="mat-dial-now"
                    x1={dial.c.x}
                    y1={H - dial.c.y}
                    x2={dial.handle.x}
                    y2={H - dial.handle.y}
                  />
                  <circle
                    className="mat-dial-handle"
                    cx={dial.handle.x}
                    cy={H - dial.handle.y}
                    r={px(11)}
                    data-testid="mat-dial-handle"
                  />
                  <text
                    className="mat-handle-label"
                    x={label.x}
                    y={H - label.y}
                    fontSize={px(16)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    data-testid="mat-dial-label"
                  >
                    {degrees < 0 ? '↺' : '↻'} {Math.abs(degrees)}° {degrees < 0 ? 'left' : 'right'}
                  </text>
                </>
              );
            })()}
          </g>
        )}
        {stretch && (
          <g className="mat-stretch" data-testid="mat-stretch">
            {(() => {
              const a = around(stretch.handle, stretch.heading, -px(9));
              const b = around(stretch.handle, stretch.heading, px(9));
              const middle = around(stretch.c, stretch.heading, stretch.mm / 2);
              const label = around(middle, stretch.heading + 90, px(20));
              return (
                <>
                  <line
                    className="mat-stretch-reach"
                    x1={stretch.end.x}
                    y1={H - stretch.end.y}
                    x2={stretch.handle.x}
                    y2={H - stretch.handle.y}
                  />
                  <circle
                    className="mat-stretch-handle"
                    cx={stretch.handle.x}
                    cy={H - stretch.handle.y}
                    r={px(11)}
                    data-testid="mat-stretch-handle"
                  />
                  <line
                    className="mat-stretch-arrows"
                    x1={a.x}
                    y1={H - a.y}
                    x2={b.x}
                    y2={H - b.y}
                  />
                  <text
                    className="mat-handle-label"
                    x={label.x}
                    y={H - label.y}
                    fontSize={px(15)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    data-testid="mat-stretch-label"
                  >
                    {Math.abs(stretch.mm)} mm{stretch.mm < 0 ? ' back' : ''}
                  </text>
                </>
              );
            })()}
          </g>
        )}
        {pathShape && (
          <g className="mat-path" data-testid="mat-path">
            <polyline className="mat-path-all" points={pathShape.all} />
            <polyline className="mat-path-done" points={pathShape.until(playhead)} />
          </g>
        )}
        {onRobot && placement && robot && handle && (
          <g className="mat-robot" data-locked={locked} data-testid="mat-robot">
            <polygon className="mat-robot-outline" points={points(onRobot.outline)} />
            <polygon className="mat-robot-body" points={points(onRobot.body)} />
            <polygon className="mat-robot-wheel" points={points(onRobot.left)} />
            <polygon className="mat-robot-wheel" points={points(onRobot.right)} />
            {robot.sensors.map((sensor, index) => {
              const at = s(sensorOnMat(sensor, placement));
              return (
                <circle key={index} className="mat-robot-sensor" cx={at.x} cy={at.y} r={px(4)} />
              );
            })}
            <line
              className="mat-robot-heading"
              x1={placement.xMm}
              y1={H - placement.yMm}
              x2={s(handle).x}
              y2={s(handle).y}
            />
            <circle
              className="mat-robot-pivot"
              cx={placement.xMm}
              cy={H - placement.yMm}
              r={px(3)}
            />
            {!locked && (
              <circle
                className="mat-robot-handle"
                cx={s(handle).x}
                cy={s(handle).y}
                r={px(9)}
                data-testid="mat-robot-handle"
              />
            )}
          </g>
        )}
        {spread && path && path.length > 0 && (
          // Over the robot, so the ends show through it at the end of the run.
          <g className="mat-spread-ends" data-testid="mat-spread-ends">
            <circle
              className="mat-spread-ring"
              cx={path.at(-1)!.pose.xMm}
              cy={H - path.at(-1)!.pose.yMm}
              r={Math.max(spread.radiusMm, 1)}
            />
            {spread.ends.map((end, index) => (
              <circle key={index} className="mat-spread-end" cx={end.xMm} cy={H - end.yMm} r={4} />
            ))}
          </g>
        )}
        {ruler && rulerLength > 0 && (
          <g className="mat-ruler" data-testid="mat-ruler">
            <line x1={s(ruler.from).x} y1={s(ruler.from).y} x2={s(ruler.to).x} y2={s(ruler.to).y} />
            <text x={s(ruler.to).x + px(8)} y={s(ruler.to).y - px(8)} fontSize={font}>
              {Math.round(rulerLength)} mm, {Math.round(rulerAngle)}°
            </text>
          </g>
        )}
      </svg>
      <div className="mat-zoom" role="group" aria-label="Zoom">
        <button
          type="button"
          className="icon-button"
          onClick={() => zoomAt(1.4, { x: size.width / 2, y: size.height / 2 })}
          title="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() => zoomAt(1 / 1.4, { x: size.width / 2, y: size.height / 2 })}
          title="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          className="button button-small"
          onClick={() => setView(fit())}
          data-testid="mat-fit"
        >
          Fit
        </button>
      </div>
      <p className="mat-readout" aria-live="off" data-testid="mat-readout">
        {pointer
          ? `x ${Math.round(pointer.x)} · y ${Math.round(pointer.y)} mm`
          : `${Math.round(W)} × ${Math.round(H)} mm`}
        {ruler &&
          rulerLength > 0 &&
          ` · ruler ${Math.round(rulerLength)} mm, ${Math.round(rulerAngle)}°`}
      </p>
    </div>
  );
}

/**
 * A run's path as SVG points (y down), at most about 1500 of them, and the part up to a time
 * (`until`, ms), found by halving rather than by walking the frames.
 */
function pathOf(frames: readonly Frame[], height: number) {
  const step = Math.max(1, Math.ceil(frames.length / 1500));
  const times: number[] = [];
  const points: string[] = [];
  for (let i = 0; i < frames.length; i += step) {
    const frame = frames[i]!;
    times.push(frame.t);
    points.push(
      `${Math.round(frame.pose.xMm * 10) / 10},${Math.round((height - frame.pose.yMm) * 10) / 10}`,
    );
  }
  const all = points.join(' ');
  return {
    all,
    until(t: number): string {
      let low = 0;
      let high = times.length;
      while (low < high) {
        const middle = (low + high) >> 1;
        if (times[middle]! <= t) low = middle + 1;
        else high = middle;
      }
      return low >= points.length ? all : points.slice(0, low).join(' ');
    },
  };
}
