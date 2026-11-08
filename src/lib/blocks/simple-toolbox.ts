/**
 * The simple blocks' toolbox categories (ADR 0010): Movement, Motors, Light, Sound, Control,
 * Conditions, Sensors, Controller (ADR 0012) and Operators.
 *
 * Movement, Motors, Conditions and Sensors are filled when opened. A new block takes the port where the hub
 * says such a device is plugged in (./fields/hints.ts); without a hub, the maintainer's bench
 * layout (motors A and B, colour D, distance E, touch F); a motor block avoids the robot's wheels.
 */
import { portsWith, type PortHints } from './fields/hints';
import { SMILE_MATRIX } from './fields/matrix-value';
import { PORTS, type PortName } from './pybricks';
import { SHADOW } from './simple-definitions';
import { COLOR_VALUE_BLOCK, SWITCH_BLOCK } from './switch';
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

/**
 * The Conditions category: "if" with its "else if" and "else", "switch on" (./switch.ts), then the
 * questions a condition asks, all true or false. The same "if" blocks are in Control too.
 */
export function conditionsFlyout(state: SimpleToolboxState): FlyoutItem[] {
  const colour = defaultSensorPort(state.hints, 'color');
  const distance = defaultSensorPort(state.hints, 'distance');
  const touch = defaultSensorPort(state.hints, 'force');
  const colourCase = (value: string) => ({
    shadow: { type: COLOR_VALUE_BLOCK, fields: { COLOR: value } },
  });
  return [
    label('If something is true, do the blocks inside'),
    block('controls_if'),
    block('controls_if', { extraState: { hasElse: true } }),
    block('controls_if', { extraState: { elseIfCount: 1, hasElse: true } }),
    label('Switch: check one thing once, then do the case it matches (⊕ adds a case)'),
    block(SWITCH_BLOCK, {
      extraState: { cases: 2 },
      inputs: {
        VALUE: { block: { type: 'mp_sensor_color', fields: { PORT: colour } } },
        CASE0: colourCase('RED'),
        CASE1: colourCase('BLUE'),
      },
    }),
    block(SWITCH_BLOCK, { extraState: { cases: 2 }, inputs: { CASE0: num(1), CASE1: num(2) } }),
    label('Questions: each one is true or false'),
    block('mp_sensor_color_is', { fields: { PORT: colour, COLOR: 'RED' } }),
    block('mp_sensor_closer', { fields: { PORT: distance }, inputs: { DISTANCE: num(100) } }),
    block('mp_sensor_pressed', { fields: { PORT: touch } }),
    block('mp_hub_button', { fields: { BUTTON: 'LEFT' } }),
    block('logic_compare', { inputs: { A: num(0), B: num(50) } }),
    block('logic_operation'),
    block('logic_negate'),
    block('logic_boolean'),
    label('Colours, for “switch on” and for comparing'),
    block('mp_sensor_color', { fields: { PORT: colour } }),
    block(COLOR_VALUE_BLOCK, { fields: { COLOR: 'RED' } }),
    label('Idea: red light when something is close, green when not'),
    block('controls_if', {
      extraState: { hasElse: true },
      inputs: {
        IF0: {
          block: {
            type: 'mp_sensor_closer',
            fields: { PORT: distance },
            inputs: { DISTANCE: num(100) },
          },
        },
        DO0: { block: { type: 'mp_light_button', fields: { COLOR: 'RED' } } },
        ELSE: { block: { type: 'mp_light_button', fields: { COLOR: 'GREEN' } } },
      },
    }),
  ];
}

/** The Controller category: ready-made driving first, then each block, then ideas. */
export function controllerFlyout(state: SimpleToolboxState): FlyoutItem[] {
  // The drive block uses the wheels, so a motor block here avoids them even before it is placed.
  const PORT = defaultMotorPort({ ...state, movement: state.movement ?? ['A', 'B'] });
  const use = { type: 'mp_ctrl_use', fields: { CONTROLLER: 'XBOX' } };
  const drive = { type: 'mp_ctrl_drive', fields: { STYLE: 'ONE_STICK' } };
  const motor = { type: 'mp_ctrl_motor', fields: { SOURCE: 'A_B', MOTORS: `${PORT}+` } };
  return [
    label('Drive with a controller. Menu (☰) stops the program.'),
    block(use.type, {
      fields: use.fields,
      next: {
        block: {
          type: 'mp_forever',
          inputs: { DO: { block: { ...drive, next: { block: motor } } } },
        },
      },
    }),
    label('One block at a time; put them inside “repeat forever”'),
    block(use.type, { fields: use.fields }),
    block(drive.type, { fields: drive.fields }),
    block(motor.type, { fields: motor.fields }),
    block('mp_ctrl_rumble', { fields: { KIND: 'SHORT' } }),
    label('Buttons, sticks and triggers: tap one to see it on the controller'),
    block('mp_ctrl_pressed', { fields: { BUTTON: 'A' } }),
    block('mp_ctrl_clicked', { fields: { BUTTON: 'A' } }),
    block('mp_ctrl_value', { fields: { VALUE: 'LEFT_Y' } }),
    label('Ideas'),
    block('mp_wait_until', {
      inputs: { CONDITION: { block: { type: 'mp_ctrl_pressed', fields: { BUTTON: 'A' } } } },
    }),
    block('controls_if', {
      inputs: {
        IF0: { block: { type: 'mp_ctrl_clicked', fields: { BUTTON: 'X' } } },
        DO0: { block: { type: 'mp_ctrl_rumble', fields: { KIND: 'TWICE' } } },
      },
    }),
    block('mp_plot', {
      fields: { LABEL: 'left_stick' },
      inputs: {
        VALUE: { ...num(0), block: { type: 'mp_ctrl_value', fields: { VALUE: 'LEFT_Y' } } },
      },
    }),
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
