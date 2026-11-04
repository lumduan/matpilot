'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SeriesData } from '@/lib/monitor/plot';
import {
  formatTick,
  nearestIndex,
  niceTicks,
  plotDomain,
  type PlotDomain,
} from '@/lib/monitor/scale';

/** Seconds of history shown across the plot. */
const WINDOW_MS = 10_000;
const HEIGHT = 260;
const PAD = { top: 12, right: 96, bottom: 28, left: 56 };
/** Direct labels at line ends only while the plot stays readable (dataviz: legend + ≤4 labels). */
const MAX_DIRECT_LABELS = 4;

interface Colors {
  readonly series: readonly string[];
  readonly text: string;
  readonly muted: string;
  readonly grid: string;
  readonly surface: string;
}

function readColors(element: HTMLElement): Colors {
  const style = getComputedStyle(element);
  const get = (name: string) => style.getPropertyValue(name).trim();
  return {
    series: Array.from({ length: 8 }, (_, i) => get(`--series-${i + 1}`)),
    text: get('--text'),
    muted: get('--muted'),
    grid: get('--border'),
    surface: get('--surface'),
  };
}

interface HoverState {
  readonly x: number;
  readonly time: number;
}

function latest(series: SeriesData): number | undefined {
  return series.values.at(-1);
}

function formatValue(value: number | undefined): string {
  if (value === undefined) return '–';
  return String(Number(value.toFixed(3)));
}

function draw(
  canvas: HTMLCanvasElement,
  width: number,
  series: readonly SeriesData[],
  domain: PlotDomain,
  colors: Colors,
  hover: HoverState | null,
): void {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(HEIGHT * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, HEIGHT);

  const plotW = Math.max(10, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (time: number) =>
    PAD.left + ((time - domain.start) / (domain.end - domain.start)) * plotW;
  const y = (value: number) =>
    PAD.top + plotH - ((value - domain.min) / (domain.max - domain.min)) * plotH;

  // Recessive grid and one y axis.
  ctx.font = '12px system-ui, sans-serif';
  ctx.lineWidth = 1;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (const tick of niceTicks(domain.min, domain.max, 5)) {
    const ty = Math.round(y(tick)) + 0.5;
    ctx.strokeStyle = colors.grid;
    ctx.beginPath();
    ctx.moveTo(PAD.left, ty);
    ctx.lineTo(PAD.left + plotW, ty);
    ctx.stroke();
    ctx.fillStyle = colors.muted;
    ctx.fillText(formatTick(tick), PAD.left - 8, ty);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = colors.muted;
  ctx.fillText(`last ${WINDOW_MS / 1000} s`, PAD.left, HEIGHT - PAD.bottom + 8);

  // Lines: 2px, round joins, clipped to the plot area.
  ctx.save();
  ctx.beginPath();
  ctx.rect(PAD.left, PAD.top - 2, plotW, plotH + 4);
  ctx.clip();
  series.forEach((s, index) => {
    ctx.strokeStyle = colors.series[index] ?? colors.text;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    let started = false;
    s.times.forEach((time, i) => {
      if (time < domain.start) return;
      const px = x(time);
      const py = y(s.values[i] ?? 0);
      if (started) ctx.lineTo(px, py);
      else {
        ctx.moveTo(px, py);
        started = true;
      }
    });
    ctx.stroke();
  });
  ctx.restore();

  // Direct labels at line ends, in text ink with a short line key, spaced to avoid overlap.
  if (series.length <= MAX_DIRECT_LABELS) {
    const labels = series
      .map((s, index) => ({ s, index, value: latest(s) }))
      .filter((entry) => entry.value !== undefined)
      .map((entry) => ({ ...entry, ty: y(entry.value as number) }))
      .sort((a, b) => a.ty - b.ty);
    let lastY = -Infinity;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (const label of labels) {
      const ty = Math.min(PAD.top + plotH, Math.max(label.ty, lastY + 16, PAD.top));
      lastY = ty;
      const lx = PAD.left + plotW + 8;
      ctx.strokeStyle = colors.series[label.index] ?? colors.text;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lx, ty);
      ctx.lineTo(lx + 10, ty);
      ctx.stroke();
      ctx.fillStyle = colors.text;
      ctx.fillText(label.s.label, lx + 14, ty);
    }
  }

  // Crosshair: a hairline at the nearest sample time.
  if (hover) {
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(hover.x) + 0.5, PAD.top);
    ctx.lineTo(Math.round(hover.x) + 0.5, PAD.top + plotH);
    ctx.stroke();
    series.forEach((s, index) => {
      const i = nearestIndex(s.times, hover.time);
      const time = s.times[i];
      const value = s.values[i];
      if (time === undefined || value === undefined || time < domain.start) return;
      ctx.fillStyle = colors.series[index] ?? colors.text;
      ctx.strokeStyle = colors.surface;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x(time), y(value), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }
}

export function PlotterView({ series }: { series: readonly SeriesData[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<HoverState | null>(null);
  const domain = useMemo(() => plotDomain(series, WINDOW_MS), [series]);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.floor(entries[0]?.contentRect.width ?? 600);
      setWidth((current) => (current === next ? current : next));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const element = wrapRef.current;
    if (!canvas || !element || !domain) return;
    draw(canvas, width, series, domain, readColors(element), hover);
  }, [series, domain, width, hover]);

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!domain) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const plotW = Math.max(10, width - PAD.left - PAD.right);
    const px = Math.min(PAD.left + plotW, Math.max(PAD.left, event.clientX - rect.left));
    const time = domain.start + ((px - PAD.left) / plotW) * (domain.end - domain.start);
    // Snap the crosshair to the nearest sample of the first series that has one.
    const reference = series.find((s) => s.times.length > 0);
    const snapped = reference
      ? (reference.times[nearestIndex(reference.times, time)] ?? time)
      : time;
    const sx = PAD.left + ((snapped - domain.start) / (domain.end - domain.start)) * plotW;
    setHover({ x: sx, time: snapped });
  };

  const readout = hover
    ? series.map((s) => {
        const i = nearestIndex(s.times, hover.time);
        return { label: s.label, value: s.values[i] };
      })
    : null;

  return (
    <div className="plotter" ref={wrapRef}>
      {series.length === 0 || !domain ? (
        <p className="muted plot-empty">
          Nothing to plot yet. Print numbers from your program, one sample per line, for example{' '}
          <code>print(&quot;angle:&quot;, motor.angle())</code> or <code>print(x, y, z)</code>.
        </p>
      ) : (
        <>
          <ul className="plot-legend" aria-label="Series and latest values">
            {series.map((s, index) => (
              <li key={s.label}>
                <span className={`plot-key plot-key-${index + 1}`} aria-hidden="true" />
                <span className="plot-legend-label">{s.label}</span>
                <strong>{formatValue(latest(s))}</strong>
              </li>
            ))}
          </ul>
          <div className="plot-canvas-wrap">
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: HEIGHT }}
              role="img"
              aria-label={`Live plot of ${series.map((s) => s.label).join(', ')} over the last ${WINDOW_MS / 1000} seconds. The text monitor lists every value.`}
              onPointerMove={onPointerMove}
              onPointerLeave={() => setHover(null)}
            />
            {readout && hover && (
              <div
                className="plot-tooltip"
                style={{ left: Math.min(hover.x + 12, Math.max(0, width - 180)) }}
                role="status"
              >
                {readout.map((row, index) => (
                  <div key={row.label} className="plot-tooltip-row">
                    <span className={`plot-key plot-key-${index + 1}`} aria-hidden="true" />
                    <strong>{formatValue(row.value)}</strong>
                    <span className="muted">{row.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
