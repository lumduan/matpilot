/**
 * The Python of the simple blocks (./simple-definitions.ts). Devices are named by port
 * (`motor_a`); ./generator.ts creates them, the drive base and the helpers in the Config, Setup
 * and Helpers sections. The Pybricks names used here are cited in ./pybricks.ts.
 */
import type * as Blockly from 'blockly/core';
import { Order, pythonGenerator } from 'blockly/python';
import { matrixRows } from './fields/matrix-value';
import {
  INDENT,
  ROBOT,
  arg,
  helper,
  hubName,
  milliseconds,
  motorSpeed,
  need,
  needImport,
  negated,
  portDevice,
  robotName,
  scaled,
} from './generator-context';
import { SHADOW } from './simple-definitions';
import { MOVEMENT_SPEED_FUNCTION, movementSpeedHelper } from '../robots/drive-program';

/** "set movement speed": shared with a path drawn on the mat (../robots/drive-program.ts). */
const SET_MOVEMENT_SPEED = movementSpeedHelper(ROBOT.robot);

/**
 * Drives in a curve, like a steering wheel. With steering s, the outer wheel keeps the speed and
 * the inner wheel slows to (1 - 2|s|/100) of it: 0 is straight, 50 stops the inner wheel, 100 spins
 * on the spot. The middle of the robot then moves at speed × (100 - |s|) / 100 and turns at
 * (outer - inner) / axle track radians per second.
 */
const DRIVE_WITH_STEERING = `def drive_with_steering(steering):
    # -100 spins left, 0 drives straight, 100 spins right.
    steering = max(-100, min(100, steering))
    speed = ${ROBOT.robot}.settings()[0]
    ${ROBOT.robot}.drive(
        speed * (100 - abs(steering)) / 100,
        speed * steering * 3.6 / (math.pi * ${ROBOT.axleTrack}),
    )`;

const call = (code: string): [string, Order] => [code, Order.FUNCTION_CALL];

/** A number for a percentage input, 0 if empty. */
const percent = (block: Blockly.Block, input: string) =>
  arg(block, input, '0', Order.MULTIPLICATIVE);

let registered = false;

export function registerSimpleGenerators(): void {
  if (registered) return;
  registered = true;
  const forBlock = pythonGenerator.forBlock;

  // Shadows: their number.
  for (const [type, field] of [
    [SHADOW.turn, 'ANGLE'],
    [SHADOW.steering, 'STEERING'],
    [SHADOW.percent, 'PERCENT'],
  ] as const) {
    forBlock[type] = (block) => {
      const value = Number(block.getFieldValue(field) ?? 0);
      return [String(value), value < 0 ? Order.UNARY_SIGN : Order.ATOMIC];
    };
  }

  // --- Movement --------------------------------------------------------------
  // "set movement motors" and "set wheel size" become Config (generateProgram).
  forBlock['mp_move_motors'] = () => '';
  forBlock['mp_move_wheels'] = () => '';
  forBlock['mp_move'] = (block) => {
    const robot = robotName(block);
    const backward = block.getFieldValue('DIRECTION') === 'BACKWARD';
    const unit = block.getFieldValue('UNIT') as string;
    if (unit === 'SECONDS') {
      need('pybricks.tools', 'wait');
      const speed = `${backward ? '-' : ''}${robot}.settings()[0]`;
      return `${robot}.drive(${speed}, 0)\nwait(${milliseconds(block, 'AMOUNT')})\n${robot}.brake()\n`;
    }
    const amount = arg(block, 'AMOUNT', '0', Order.MULTIPLICATIVE);
    const signed = backward ? negated(amount) : amount;
    if (unit === 'MM') return `${robot}.straight(${signed})\n`;
    // One wheel rotation drives the wheel's circumference.
    needImport('math');
    return `${robot}.straight(${signed} * math.pi * ${ROBOT.wheelDiameter})\n`;
  };
  forBlock['mp_move_turn'] = (block) => `${robotName(block)}.turn(${arg(block, 'ANGLE', '0')})\n`;
  forBlock['mp_move_start'] = (block) => {
    const robot = robotName(block);
    const backward = block.getFieldValue('DIRECTION') === 'BACKWARD';
    return `${robot}.drive(${backward ? '-' : ''}${robot}.settings()[0], 0)\n`;
  };
  forBlock['mp_move_start_steering'] = (block) => {
    robotName(block);
    needImport('math');
    return `${helper('drive_with_steering', DRIVE_WITH_STEERING)}(${arg(block, 'STEERING', '0')})\n`;
  };
  forBlock['mp_move_stop'] = (block) => `${robotName(block)}.brake()\n`;
  forBlock['mp_move_speed'] = (block) => {
    robotName(block);
    return `${helper(MOVEMENT_SPEED_FUNCTION, SET_MOVEMENT_SPEED)}(${arg(block, 'SPEED', '50')})\n`;
  };

  // --- Motors ----------------------------------------------------------------
  forBlock['mp_motor_run_for'] = (block) => {
    const motor = portDevice(block, 'PORT', 'Motor');
    const speed = motorSpeed(block, 'PORT');
    const reverse = block.getFieldValue('DIRECTION') === 'COUNTERCLOCKWISE';
    const unit = block.getFieldValue('UNIT') as string;
    if (unit === 'SECONDS') {
      return `${motor}.run_time(${reverse ? '-' : ''}${speed}, ${milliseconds(block, 'AMOUNT')})\n`;
    }
    const amount = arg(block, 'AMOUNT', '0', Order.MULTIPLICATIVE);
    const degrees = unit === 'ROTATIONS' ? scaled(amount, 360) : amount;
    // run_angle turns the other way for a negative angle (./pybricks.ts).
    return `${motor}.run_angle(${speed}, ${reverse ? negated(degrees) : degrees})\n`;
  };
  forBlock['mp_motor_start'] = (block) => {
    const motor = portDevice(block, 'PORT', 'Motor');
    const speed = motorSpeed(block, 'PORT');
    const reverse = block.getFieldValue('DIRECTION') === 'COUNTERCLOCKWISE';
    return `${motor}.run(${reverse ? '-' : ''}${speed})\n`;
  };
  forBlock['mp_motor_stop_simple'] = (block) => `${portDevice(block, 'PORT', 'Motor')}.brake()\n`;
  forBlock['mp_motor_set_speed'] = (block) => {
    const motor = portDevice(block, 'PORT', 'Motor');
    const speed = motorSpeed(block, 'PORT');
    return `${speed} = ${motor}.control.limits()[0] * ${percent(block, 'SPEED')} // 100\n`;
  };
  forBlock['mp_motor_position'] = (block) => call(`${portDevice(block, 'PORT', 'Motor')}.angle()`);
  forBlock['mp_motor_reset_position'] = (block) =>
    `${portDevice(block, 'PORT', 'Motor')}.reset_angle(0)\n`;

  // --- Light -----------------------------------------------------------------
  const icon = (block: Blockly.Block) => {
    const rows = matrixRows(block.getFieldValue('PICTURE') as string)
      .map((row) => `${INDENT}[${row.join(', ')}],`)
      .join('\n');
    return `${hubName()}.display.icon([\n${rows}\n])\n`;
  };
  forBlock['mp_light_show'] = (block) => icon(block);
  forBlock['mp_light_show_for'] = (block) => {
    need('pybricks.tools', 'wait');
    return `${icon(block)}wait(${milliseconds(block, 'SECONDS')})\n${hubName()}.display.off()\n`;
  };
  forBlock['mp_light_write'] = (block) => {
    const text = arg(block, 'TEXT', "''");
    const asText = /^['"]/.test(text) ? text : `str(${text})`;
    return `${hubName()}.display.text(${asText})\n`;
  };
  forBlock['mp_light_off'] = () => `${hubName()}.display.off()\n`;
  forBlock['mp_light_pixel'] = (block) => {
    const row = Number(block.getFieldValue('ROW')) - 1;
    const column = Number(block.getFieldValue('COLUMN')) - 1;
    return `${hubName()}.display.pixel(${row}, ${column}, ${arg(block, 'BRIGHTNESS', '100')})\n`;
  };
  forBlock['mp_light_button'] = (block) => {
    need('pybricks.parameters', 'Color');
    return `${hubName()}.light.on(Color.${block.getFieldValue('COLOR') as string})\n`;
  };
  forBlock['mp_light_button_off'] = () => `${hubName()}.light.off()\n`;

  // --- Sound -----------------------------------------------------------------
  forBlock['mp_sound_note'] = (block) =>
    `${hubName()}.speaker.beep(${block.getFieldValue('NOTE') as string}, ${milliseconds(block, 'SECONDS')})\n`;
  forBlock['mp_sound_beep'] = () => `${hubName()}.speaker.beep()\n`;
  forBlock['mp_sound_volume'] = (block) =>
    `${hubName()}.speaker.volume(${arg(block, 'VOLUME', '100')})\n`;

  // --- Control ---------------------------------------------------------------
  forBlock['mp_wait_seconds'] = (block) => {
    need('pybricks.tools', 'wait');
    return `wait(${milliseconds(block, 'SECONDS')})\n`;
  };

  // --- Sensors ---------------------------------------------------------------
  forBlock['mp_sensor_color_is'] = (block) => {
    need('pybricks.parameters', 'Color');
    return [
      `${portDevice(block, 'PORT', 'ColorSensor')}.color() == Color.${block.getFieldValue('COLOR') as string}`,
      Order.RELATIONAL,
    ];
  };
  forBlock['mp_sensor_color'] = (block) =>
    call(`${portDevice(block, 'PORT', 'ColorSensor')}.color()`);
  forBlock['mp_color'] = (block) => {
    need('pybricks.parameters', 'Color');
    return [`Color.${block.getFieldValue('COLOR') as string}`, Order.MEMBER];
  };
  forBlock['mp_sensor_reflection'] = (block) =>
    call(`${portDevice(block, 'PORT', 'ColorSensor')}.reflection()`);
  forBlock['mp_sensor_distance'] = (block) =>
    call(`${portDevice(block, 'PORT', 'UltrasonicSensor')}.distance()`);
  forBlock['mp_sensor_closer'] = (block) => [
    `${portDevice(block, 'PORT', 'UltrasonicSensor')}.distance() < ${arg(block, 'DISTANCE', '100', Order.RELATIONAL)}`,
    Order.RELATIONAL,
  ];
  forBlock['mp_sensor_pressed'] = (block) =>
    call(`${portDevice(block, 'PORT', 'ForceSensor')}.pressed()`);
  forBlock['mp_sensor_force'] = (block) =>
    call(`${portDevice(block, 'PORT', 'ForceSensor')}.force()`);
}
