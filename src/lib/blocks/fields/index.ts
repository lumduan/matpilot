/**
 * The simple blocks' picture fields (docs/adr/0010-simple-blocks.md), registered with Blockly
 * under the names their block definitions use.
 */
import * as Blockly from 'blockly/core';
import { registerPickerCss } from './common';
import { FieldController, FieldControllerButton, FieldControllerInput } from './controller';
import { FieldMatrix } from './matrix';
import { FieldMotorSet, FieldPort, FieldPortPair } from './port';
import { FieldThrottle } from './throttle';
import { FieldSteering, FieldTurnAngle } from './turn';

export const FIELD_TYPES = {
  port: 'field_mp_port',
  portPair: 'field_mp_port_pair',
  turn: 'field_mp_turn',
  steering: 'field_mp_steering',
  throttle: 'field_mp_throttle',
  matrix: 'field_mp_matrix',
  motorSet: 'field_mp_motor_set',
  controller: 'field_mp_controller',
  controllerButton: 'field_mp_controller_button',
  controllerInput: 'field_mp_controller_input',
} as const;

let registered = false;

export function registerFields(): void {
  if (registered) return;
  registered = true;
  registerPickerCss();
  const fields: [string, Blockly.fieldRegistry.RegistrableField][] = [
    [FIELD_TYPES.port, FieldPort],
    [FIELD_TYPES.portPair, FieldPortPair],
    [FIELD_TYPES.turn, FieldTurnAngle],
    [FIELD_TYPES.steering, FieldSteering],
    [FIELD_TYPES.throttle, FieldThrottle],
    [FIELD_TYPES.matrix, FieldMatrix],
    [FIELD_TYPES.motorSet, FieldMotorSet],
    [FIELD_TYPES.controller, FieldController],
    [FIELD_TYPES.controllerButton, FieldControllerButton],
    [FIELD_TYPES.controllerInput, FieldControllerInput],
  ];
  for (const [type, field] of fields) {
    // Blockly's registry outlives a hot-reloaded module.
    if (!Blockly.registry.hasItem(Blockly.registry.Type.FIELD, type)) {
      Blockly.fieldRegistry.register(type, field);
    }
  }
}
