'use client';

import type { RobotProfile } from '@/lib/robots/profile';
import {
  bodyBox,
  boxLength,
  boxWidth,
  footprint,
  turningRadius,
  wheelBoxes,
  type Box,
} from '@/lib/robots/shape';

const SENSOR_LETTER = { color: 'C', distance: 'D', force: 'T' } as const;

/**
 * The robot from above, to scale (ADR 0016): the body, the wheels, the point it turns around, its
 * sensors, and the circle it sweeps turning on the spot. Front is up. Drawn in millimetres: the
 * ROBOT frame's +x (forward) is up the screen and +y (left) is left.
 */
export function RobotDrawing({ robot }: { robot: RobotProfile }) {
  const radius = turningRadius(robot);
  const margin = 24;
  const half = radius + margin;
  // ROBOT frame (x forward, y left) to the drawing (x right, y down).
  const rect = (box: Box) => ({
    x: -box.maxY,
    y: -box.maxX,
    width: boxWidth(box),
    height: boxLength(box),
  });
  const body = rect(bodyBox(robot));
  const wheels = wheelBoxes(robot);
  const outline = footprint(robot);
  const font = Math.max(9, half / 16);
  return (
    <svg
      className="robot-drawing"
      viewBox={`${-half} ${-half} ${2 * half} ${2 * half}`}
      role="img"
      aria-label={`${robot.name} from above: ${Math.round(boxWidth(outline))} mm wide, ${Math.round(boxLength(outline))} mm long; it needs a circle of ${Math.round(radius)} mm radius to turn on the spot.`}
      data-testid="robot-drawing"
    >
      <circle className="robot-turn-circle" cx={0} cy={0} r={radius} />
      <rect className="robot-body" {...body} rx={4} />
      <rect className="robot-wheel" {...rect(wheels.left)} rx={3} />
      <rect className="robot-wheel" {...rect(wheels.right)} rx={3} />
      {/* The axle and the point the robot turns around. */}
      <line
        className="robot-axle"
        x1={-robot.wheels.trackMm / 2}
        y1={0}
        x2={robot.wheels.trackMm / 2}
        y2={0}
      />
      <circle className="robot-pivot" cx={0} cy={0} r={Math.max(3, half / 60)} />
      {/* Front. */}
      <path
        className="robot-front"
        d={`M 0 ${body.y - 8 - font} l ${-font * 0.7} ${font} h ${font * 1.4} z`}
      />
      {robot.sensors.map((sensor, index) => (
        <g
          key={index}
          className="robot-sensor"
          transform={`translate(${-sensor.yMm} ${-sensor.xMm})`}
        >
          <circle r={font * 0.8} />
          <text y={font * 0.35} fontSize={font}>
            {SENSOR_LETTER[sensor.type]}
          </text>
        </g>
      ))}
      <text className="robot-dimension" x={0} y={-outline.minX + font * 1.6} fontSize={font}>
        {Math.round(boxWidth(outline))} mm
      </text>
      <text
        className="robot-dimension"
        fontSize={font}
        transform={`translate(${-outline.minY + font * 1.4} ${-(outline.maxX + outline.minX) / 2}) rotate(90)`}
      >
        {Math.round(boxLength(outline))} mm
      </text>
    </svg>
  );
}
