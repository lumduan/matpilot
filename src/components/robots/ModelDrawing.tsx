'use client';

import type { ReactNode } from 'react';
import type { Vec3 } from '@/lib/ldraw/model';
import type { DrawnKind, DrawnPart, ModelRobot } from '@/lib/ldraw/robot-from-model';

/** The tag a motor or sensor has in the drawing and in the dialog's list. */
export function partTag(robot: ModelRobot, list: 'motors' | 'sensors', index: number): string {
  if (list === 'sensors') return `S${index + 1}`;
  const motor = robot.motors[index];
  if (motor?.drives === 'left') return 'L';
  if (motor?.drives === 'right') return 'R';
  const others = robot.motors.filter((each) => each.drives === null);
  return `M${others.indexOf(motor!) + 1}`;
}

type Point = { readonly x: number; readonly y: number };

/** The convex hull of a few points (Andrew's monotone chain). */
function hull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((p, q) => p.x - q.x || p.y - q.y);
  if (sorted.length < 3) return sorted;
  const turn = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: Point[]) => {
    const out: Point[] = [];
    for (const p of list) {
      while (out.length >= 2 && turn(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/** Tags moved sideways until none covers another (parts can sit on top of each other). */
function placeTags<T extends { x: number; y: number }>(tags: readonly T[], gap: number): T[] {
  const placed: T[] = [];
  for (const tag of tags) {
    let x = tag.x;
    for (let step = 1; step <= 12; step += 1) {
      if (!placed.some((other) => Math.hypot(other.x - x, other.y - tag.y) < gap)) break;
      // Right, left, further right, further left…
      x = tag.x + gap * Math.ceil(step / 2) * (step % 2 === 1 ? 1 : -1);
    }
    placed.push({ ...tag, x });
  }
  return placed;
}

const ORDER: Record<DrawnKind, number> = { part: 0, hub: 1, 'drive-wheel': 2, motor: 3, sensor: 4 };

function View({
  robot,
  title,
  project,
  depth,
  extras,
  tags,
}: {
  robot: ModelRobot;
  title: string;
  /** From the ROBOT frame (mm) to the drawing (x right, y down). */
  project: (p: Vec3) => Point;
  /** Drawn later when larger: what is in front in this view. */
  depth: (part: DrawnPart) => number;
  extras: (size: number) => ReactNode;
  tags: boolean;
}) {
  const shapes = robot.parts
    .map((part) => ({ part, points: hull(part.corners.map(project)) }))
    .sort((p, q) => ORDER[p.part.kind] - ORDER[q.part.kind] || depth(p.part) - depth(q.part));
  const all = shapes.flatMap((shape) => shape.points);
  const minX = Math.min(...all.map((p) => p.x), 0);
  const maxX = Math.max(...all.map((p) => p.x), 0);
  const minY = Math.min(...all.map((p) => p.y), 0);
  const maxY = Math.max(...all.map((p) => p.y), 0);
  const size = Math.max(maxX - minX, maxY - minY, 50);
  const margin = size * 0.12;
  const font = Math.max(8, size / 22);
  return (
    <figure className="model-view">
      <svg
        viewBox={`${minX - margin} ${minY - margin - font} ${maxX - minX + 2 * margin} ${maxY - minY + 2 * margin + font}`}
        role="img"
        aria-label={title}
      >
        {shapes.map(({ part, points }, index) => (
          <polygon
            key={index}
            className={`model-part model-part-${part.kind}`}
            points={points.map((p) => `${p.x},${p.y}`).join(' ')}
          />
        ))}
        {extras(font)}
        {tags &&
          placeTags(
            shapes
              .filter(({ part }) => part.ref)
              .map(({ part, points }) => ({
                ref: part.ref!,
                x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
                y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
              })),
            font * 2,
          ).map(({ ref, x, y }) => (
            <g
              key={`${ref.list}-${ref.index}`}
              className="model-tag"
              transform={`translate(${x} ${y})`}
            >
              <circle r={font * 0.95} />
              <text y={font * 0.35} fontSize={font}>
                {partTag(robot, ref.list, ref.index)}
              </text>
            </g>
          ))}
      </svg>
      <figcaption>{title}</figcaption>
    </figure>
  );
}

/**
 * A LEGO model as MatPilot reads it (ADR 0017): every part's box, from above (front up, like the
 * robot drawing) and from the right side (front to the right), coloured by what it is, with the
 * motors and sensors tagged as in the dialog's list.
 */
export function ModelDrawing({ robot }: { robot: ModelRobot }) {
  const halfTrack = robot.wheels.trackMm / 2;
  return (
    <div className="model-drawing" data-testid="model-drawing">
      <View
        robot={robot}
        title="From above, front up"
        project={(p) => ({ x: -p[1], y: -p[0] })}
        depth={(part) => Math.max(...part.corners.map((c) => c[2]))}
        tags
        extras={(font) => (
          <>
            <line className="robot-axle" x1={-halfTrack} y1={0} x2={halfTrack} y2={0} />
            <circle className="robot-pivot" cx={0} cy={0} r={font * 0.35} />
            <path
              className="robot-front"
              d={`M 0 ${-robot.body.lengthMm + robot.body.axleFromBackMm - font * 2.2} l ${-font * 0.7} ${font} h ${font * 1.4} z`}
            />
          </>
        )}
      />
      <View
        robot={robot}
        title="From the right side, front to the right"
        project={(p) => ({ x: p[0], y: -p[2] })}
        depth={(part) => -Math.min(...part.corners.map((c) => c[1]))}
        tags={false}
        extras={() => (
          <line
            className="model-floor"
            x1={-robot.body.axleFromBackMm - 20}
            y1={0}
            x2={robot.body.lengthMm - robot.body.axleFromBackMm + 20}
            y2={0}
          />
        )}
      />
      <ul className="model-key" aria-label="Colours">
        <li>
          <span className="model-swatch model-part-hub" /> Hub
        </li>
        <li>
          <span className="model-swatch model-part-motor" /> Motor
        </li>
        <li>
          <span className="model-swatch model-part-sensor" /> Sensor
        </li>
        <li>
          <span className="model-swatch model-part-drive-wheel" /> Drive wheel
        </li>
        <li>
          <span className="model-swatch model-part-part" /> Other parts
        </li>
      </ul>
    </div>
  );
}
