/**
 * The toolbox (ADR 0008): Setup, Output, Input, Flow, Data, Variables, Other.
 *
 * Setup, Output and Input are filled when opened, from the devices in the "set up" block, so a
 * new block already names the user's motor or sensor, and a new set-up block takes the next free
 * port of the maintainer's bench layout (A, B, C motors; D colour; E distance; F touch).
 */
import { DEVICES, DEVICE_TYPES, PORTS, type DeviceType, type PortName } from './pybricks';

export type FlyoutItem = Record<string, unknown> & { readonly kind: 'block' | 'label' | 'sep' };

/** What the dynamic categories need to know about the workspace. */
export interface ToolboxState {
  /** Devices in the "set up" block, in order. */
  readonly devices: readonly {
    readonly type: DeviceType;
    readonly variableId: string;
    readonly name: string;
    readonly port: PortName;
  }[];
  /** Every device variable's name, by type, whether or not it is set up. */
  readonly variableNames: Readonly<Record<DeviceType, readonly string[]>>;
}

const num = (value: number) => ({ shadow: { type: 'math_number', fields: { NUM: value } } });
const text = (value: string) => ({ shadow: { type: 'text', fields: { TEXT: value } } });
const label = (value: string): FlyoutItem => ({ kind: 'label', text: value });
const block = (type: string, extra: Record<string, unknown> = {}): FlyoutItem => ({
  kind: 'block',
  type,
  ...extra,
});

/** A fresh name for a new device of this type: "motor", then "motor 2", ... */
export function nextDeviceName(type: DeviceType, taken: readonly string[]): string {
  const base = DEVICES[type].defaultName;
  const used = new Set(taken.map((name) => name.toLowerCase()));
  if (!used.has(base)) return base;
  for (let i = 2; ; i += 1) {
    if (!used.has(`${base} ${i}`)) return `${base} ${i}`;
  }
}

/** The bench-layout port for a new device of this type, else the first free port. */
export function nextFreePort(type: DeviceType, used: readonly PortName[]): PortName {
  const taken = new Set(used);
  const preferred: readonly PortName[] = DEVICES[type].preferredPorts;
  return (
    preferred.find((port) => !taken.has(port)) ??
    PORTS.find((port) => !taken.has(port)) ??
    preferred[0] ??
    'A'
  );
}

export function setupFlyout(state: ToolboxState): FlyoutItem[] {
  const usedPorts = state.devices.map((device) => device.port);
  const items: FlyoutItem[] = [
    label('Drag these into the “set up” block. Each device gets a name and a port.'),
  ];
  for (const type of DEVICE_TYPES) {
    const setUp = new Set(
      state.devices.filter((device) => device.type === type).map((device) => device.name),
    );
    // Reuse a name that has no set-up block (for example after deleting one), else a new name.
    const name =
      state.variableNames[type].find((existing) => !setUp.has(existing)) ??
      nextDeviceName(type, state.variableNames[type]);
    items.push(
      block(DEVICES[type].setupBlock, {
        fields: { VAR: { name, type }, PORT: nextFreePort(type, usedPorts) },
      }),
    );
  }
  return items;
}

/** The field value that makes a new block name the first device of this type, if any. */
function deviceRef(state: ToolboxState, type: DeviceType, field: string) {
  const device = state.devices.find((item) => item.type === type);
  return device ? { [field]: { id: device.variableId } } : {};
}

function missing(state: ToolboxState, type: DeviceType): FlyoutItem[] {
  return state.devices.some((device) => device.type === type)
    ? []
    : [label(`No ${DEVICES[type].label} set up yet: add one under Setup first.`)];
}

export function outputFlyout(state: ToolboxState): FlyoutItem[] {
  const motor = deviceRef(state, 'Motor', 'MOTOR');
  const fields = (extra: Record<string, unknown> = {}) => ({ fields: { ...motor, ...extra } });
  return [
    label('Motors'),
    ...missing(state, 'Motor'),
    block('mp_motor_run_angle', {
      ...fields(),
      inputs: { SPEED: num(500), ANGLE: num(360) },
    }),
    block('mp_motor_run_target', { ...fields(), inputs: { SPEED: num(500), TARGET: num(0) } }),
    block('mp_motor_run_time', { ...fields(), inputs: { SPEED: num(500), TIME: num(1000) } }),
    block('mp_motor_run', { ...fields(), inputs: { SPEED: num(500) } }),
    block('mp_motor_dc', { ...fields(), inputs: { DUTY: num(50) } }),
    block('mp_motor_stop', fields()),
    block('mp_motor_reset_angle', { ...fields(), inputs: { ANGLE: num(0) } }),
    label('Hub'),
    block('mp_hub_light_on', { fields: { COLOR: 'GREEN' } }),
    block('mp_hub_light_off'),
    block('mp_hub_display_icon'),
    block('mp_hub_display_number', { inputs: { NUMBER: num(42) } }),
    block('mp_hub_display_text', { inputs: { TEXT: text('Hello') } }),
    block('mp_hub_display_off'),
    block('mp_hub_beep', { inputs: { FREQUENCY: num(500), DURATION: num(100) } }),
  ];
}

export function inputFlyout(state: ToolboxState): FlyoutItem[] {
  const motor = { fields: deviceRef(state, 'Motor', 'MOTOR') };
  const color = { fields: deviceRef(state, 'ColorSensor', 'SENSOR') };
  const distance = { fields: deviceRef(state, 'UltrasonicSensor', 'SENSOR') };
  const touch = { fields: deviceRef(state, 'ForceSensor', 'SENSOR') };
  return [
    label('Motors'),
    ...missing(state, 'Motor'),
    block('mp_motor_angle', motor),
    block('mp_motor_speed', motor),
    label('Colour sensor'),
    ...missing(state, 'ColorSensor'),
    block('mp_color_sees', color),
    block('mp_color_reflection', color),
    block('mp_color_ambient', color),
    label('Distance sensor'),
    ...missing(state, 'UltrasonicSensor'),
    block('mp_ultrasonic_distance', distance),
    label('Touch sensor'),
    ...missing(state, 'ForceSensor'),
    block('mp_force_pressed', touch),
    block('mp_force_touched', touch),
    block('mp_force_force', touch),
    label('Hub'),
    block('mp_hub_button'),
    block('mp_hub_tilt'),
    label('Timer'),
    block('mp_timer'),
    block('mp_timer_reset'),
  ];
}

/** The static part of the toolbox; `custom` categories are filled by the functions above. */
export const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    { kind: 'category', name: 'Setup', categorystyle: 'mp_setup_category', custom: 'MP_SETUP' },
    { kind: 'category', name: 'Output', categorystyle: 'mp_output_category', custom: 'MP_OUTPUT' },
    { kind: 'category', name: 'Input', categorystyle: 'mp_input_category', custom: 'MP_INPUT' },
    {
      kind: 'category',
      name: 'Flow',
      categorystyle: 'loop_category',
      contents: [
        block('mp_wait', { inputs: { TIME: num(1000) } }),
        block('mp_wait_until'),
        block('controls_repeat_ext', { inputs: { TIMES: num(4) } }),
        block('mp_forever'),
        block('controls_whileUntil'),
        block('controls_if'),
        block('controls_if', { extraState: { hasElse: true } }),
        block('controls_flow_statements'),
        block('mp_stop_program'),
        label('Conditions'),
        block('logic_compare', { inputs: { A: num(0), B: num(0) } }),
        block('logic_operation'),
        block('logic_negate'),
        block('logic_boolean'),
      ],
    },
    {
      kind: 'category',
      name: 'Data',
      categorystyle: 'math_category',
      contents: [
        block('math_number', { fields: { NUM: 0 } }),
        block('math_arithmetic', { inputs: { A: num(1), B: num(1) } }),
        block('math_modulo', { inputs: { DIVIDEND: num(10), DIVISOR: num(3) } }),
        block('math_round', { inputs: { NUM: num(3.1) } }),
        block('math_random_int', { inputs: { FROM: num(1), TO: num(100) } }),
        block('text'),
        block('text_join'),
      ],
    },
    { kind: 'category', name: 'Variables', categorystyle: 'variable_category', custom: 'VARIABLE' },
    {
      kind: 'category',
      name: 'Other',
      categorystyle: 'mp_other_category',
      contents: [
        block('mp_print', { inputs: { VALUE: text('Hello') } }),
        block('mp_plot', { inputs: { VALUE: num(0) } }),
        label('The Plotter draws every “plot” name as a line.'),
      ],
    },
  ],
} as const;
