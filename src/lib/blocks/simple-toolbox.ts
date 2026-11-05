/**
 * The simple blocks' toolbox categories (ADR 0010): Movement, Motors, Light, Sound, Control,
 * Sensors and Operators.
 *
 * Movement, Motors and Sensors are filled when opened. A new block takes the port where the hub
 * says such a device is plugged in (./fields/hints.ts); without a hub, the maintainer's bench
 * layout (motors A and B, colour D, distance E, touch F); a motor block avoids the robot's wheels.
 */
import { portsWith, type PortHints } from './fields/hints';
import { SMILE_MATRIX } from './fields/matrix-value';
import { PORTS, type PortName } from './pybricks';
import { SHADOW } from './simple-definitions';
import type { FlyoutItem } from './toolbox';

export interface SimpleToolboxState {
  readonly hints: PortHints;
  /** The robot's wheel ports, when the program has movement blocks; else `null`. */
  readonly movement: readonly [PortName, PortName] | null;
}

const num = (value: number) => ({ shadow: { type: 'math_number', fields: { NUM: value } } });
const text = (value: string) => ({ shadow: { type: 'text', fields: { TEXT: value } } });
const turn = (value: number) => ({ shadow: { type: SHADOW.turn, fields: { ANGLE: value } } });
const steering = (value: number) => ({
  shadow: { type: SHADOW.steering, fields: { STEERING: value } },
});
const percent = (value: number) => ({
  shadow: { type: SHADOW.percent, fields: { PERCENT: value } },
});
const label = (value: string): FlyoutItem => ({ kind: 'label', text: value });
const block = (type: string, extra: Record<string, unknown> = {}): FlyoutItem => ({
  kind: 'block',
  type,
  ...extra,
});

/** Left and right wheel ports for a new "set movement motors" block. */
export function defaultMovementPorts(hints: PortHints): string {
  const motors = portsWith(hints, 'motor');
  const [left, right] = motors;
  return left && right ? `${left}${right}` : 'AB';
}

/** The port for a new motor block: a motor the hub sees that is not a wheel, else a free port. */
export function defaultMotorPort(state: SimpleToolboxState): PortName {
  const wheels = new Set<PortName>(state.movement ?? []);
  const seen = portsWith(state.hints, 'motor').find((port) => !wheels.has(port));
  if (seen) return seen;
  const busy = (port: PortName) => {
    const hint = state.hints[port];
    return wheels.has(port) || (hint !== undefined && hint !== null && hint.kind !== 'motor');
  };
  return PORTS.find((port) => !busy(port)) ?? 'A';
}

export function defaultSensorPort(
  hints: PortHints,
  kind: 'color' | 'distance' | 'force',
): PortName {
  const bench: Record<typeof kind, PortName> = { color: 'D', distance: 'E', force: 'F' };
  return portsWith(hints, kind)[0] ?? bench[kind];
}

export function movementFlyout(state: SimpleToolboxState): FlyoutItem[] {
  const ports = state.movement ? state.movement.join('') : defaultMovementPorts(state.hints);
  return [
    label('Drive a robot with two wheel motors.'),
    block('mp_move_motors', { fields: { PORTS: ports } }),
    block('mp_move', {
      fields: { DIRECTION: 'FORWARD', UNIT: 'ROTATIONS' },
      inputs: { AMOUNT: num(1) },
    }),
    block('mp_move_turn', { inputs: { ANGLE: turn(90) } }),
    block('mp_move_start', { fields: { DIRECTION: 'FORWARD' } }),
    block('mp_move_start_steering', { inputs: { STEERING: steering(30) } }),
    block('mp_move_stop'),
    block('mp_move_speed', { inputs: { SPEED: percent(50) } }),
    label('For exact turns and millimetres, measure your robot:'),
    block('mp_move_wheels', { fields: { WHEEL: 56, TRACK: 112 } }),
  ];
}

export function motorsFlyout(state: SimpleToolboxState): FlyoutItem[] {
  const PORT = defaultMotorPort(state);
  return [
    block('mp_motor_run_for', {
      fields: { PORT, DIRECTION: 'CLOCKWISE', UNIT: 'ROTATIONS' },
      inputs: { AMOUNT: num(1) },
    }),
    block('mp_motor_start', { fields: { PORT, DIRECTION: 'CLOCKWISE' } }),
    block('mp_motor_stop_simple', { fields: { PORT } }),
    block('mp_motor_set_speed', { fields: { PORT }, inputs: { SPEED: percent(75) } }),
    block('mp_motor_position', { fields: { PORT } }),
    block('mp_motor_reset_position', { fields: { PORT } }),
  ];
}

export function sensorsFlyout(state: SimpleToolboxState): FlyoutItem[] {
  const colour = defaultSensorPort(state.hints, 'color');
  const distance = defaultSensorPort(state.hints, 'distance');
  const touch = defaultSensorPort(state.hints, 'force');
  return [
    label('Colour sensor'),
    block('mp_sensor_color_is', { fields: { PORT: colour, COLOR: 'RED' } }),
    block('mp_sensor_reflection', { fields: { PORT: colour } }),
    label('Distance sensor'),
    block('mp_sensor_closer', { fields: { PORT: distance }, inputs: { DISTANCE: num(100) } }),
    block('mp_sensor_distance', { fields: { PORT: distance } }),
    label('Touch sensor'),
    block('mp_sensor_pressed', { fields: { PORT: touch } }),
    block('mp_sensor_force', { fields: { PORT: touch } }),
    label('Hub'),
    block('mp_hub_tilt'),
    block('mp_hub_button'),
    block('mp_timer'),
    block('mp_timer_reset'),
    label('Show a value in the Monitor and the Plotter'),
    block('mp_plot', {
      fields: { LABEL: 'distance' },
      inputs: {
        VALUE: {
          ...num(0),
          block: { type: 'mp_sensor_distance', fields: { PORT: distance } },
        },
      },
    }),
    block('mp_print', { inputs: { VALUE: text('Hello') } }),
  ];
}

export const LIGHT_CONTENTS: readonly FlyoutItem[] = [
  block('mp_light_show_for', { fields: { PICTURE: SMILE_MATRIX }, inputs: { SECONDS: num(2) } }),
  block('mp_light_show', { fields: { PICTURE: SMILE_MATRIX } }),
  block('mp_light_write', { inputs: { TEXT: text('Hello') } }),
  block('mp_light_off'),
  block('mp_light_pixel', {
    fields: { COLUMN: '3', ROW: '3' },
    inputs: { BRIGHTNESS: percent(100) },
  }),
  block('mp_light_button', { fields: { COLOR: 'GREEN' } }),
  block('mp_light_button_off'),
];

export const SOUND_CONTENTS: readonly FlyoutItem[] = [
  block('mp_sound_note', { fields: { NOTE: '262' }, inputs: { SECONDS: num(0.5) } }),
  block('mp_sound_beep'),
  block('mp_sound_volume', { inputs: { VOLUME: percent(100) } }),
];

export const CONTROL_CONTENTS: readonly FlyoutItem[] = [
  block('mp_wait_seconds', { inputs: { SECONDS: num(1) } }),
  block('controls_repeat_ext', { inputs: { TIMES: num(4) } }),
  block('mp_forever'),
  block('controls_if'),
  block('controls_if', { extraState: { hasElse: true } }),
  block('mp_wait_until'),
  block('controls_whileUntil'),
  block('mp_stop_program'),
];

export const OPERATOR_CONTENTS: readonly FlyoutItem[] = [
  block('math_arithmetic', { inputs: { A: num(1), B: num(1) } }),
  block('math_random_int', { inputs: { FROM: num(1), TO: num(10) } }),
  block('logic_compare', { inputs: { A: num(0), B: num(50) } }),
  block('logic_operation'),
  block('logic_negate'),
  block('math_round', { inputs: { NUM: num(3.1) } }),
  block('math_modulo', { inputs: { DIVIDEND: num(10), DIVISOR: num(3) } }),
  block('math_number', { fields: { NUM: 0 } }),
  block('text_join'),
];
