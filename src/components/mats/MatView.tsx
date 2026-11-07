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
import { normalHeading, robotOnMat, sensorOnMat } from '@/lib/mats/pose';
import type { RobotProfile } from '@/lib/robots/profile';
import type { Frame } from '@/lib/sim/engine';
import type { PathPlan } from '@/lib/mats/path';
import type { Spread } from '@/lib/sim/spread';

export type MatTool = 'move' | 'ruler' | 'area' | 'path';

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
  /** A path being drawn (Path tool): where the robot is after each point. */
  plan?: PathPlan | null;
  /** A click on the mat with the Path tool. */
  onPathPoint?: (point: Point) => void;
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

  const zoomAt = (factor: number, at: Point) => {
    setView((current) => {
      if (!current) return current;
      const scale = clampScale(current.scale * factor);
      const k = scale / current.scale;
      return { scale, x: at.x - (at.x - current.x) * k, y: at.y - (at.y - current.y) * k };
    });
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
      drag.current = { kind: 'pan', start: p, view, click: m };
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
    if (current.kind === 'pan') {
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
    if (current.kind === 'pan' && current.click && onPathPoint) {
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
        {plan && placement && plan.poses.length > 0 && (
          <g className="mat-plan" data-testid="mat-plan">
            <polyline
              className="mat-plan-line"
              points={[placement, ...plan.poses]
                .map((pose) => `${round(pose.xMm)},${round(H - pose.yMm)}`)
                .join(' ')}
            />
            {plan.poses.map((pose, index) => (
              <g key={index} className="mat-plan-point">
                <circle cx={pose.xMm} cy={H - pose.yMm} r={px(10)} />
                <text
                  x={pose.xMm}
                  y={H - pose.yMm}
                  fontSize={px(12)}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {index + 1}
                </text>
              </g>
            ))}
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
