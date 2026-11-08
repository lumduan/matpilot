/**
 * Words for finding blocks, shared by the block search (./search.ts) and the Docs (their search
 * and their list of every block). Kept apart from ./search.ts so the Docs do not load Blockly.
 */

/** Other words for a block, so a search finds it by what it does. */
export const BLOCK_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  mp_wait_seconds: ['sleep', 'pause', 'delay', 'time'],
  mp_wait: ['sleep', 'pause', 'delay', 'time', 'milliseconds'],
  mp_wait_until: ['until', 'pause'],
  controls_whileUntil: ['loop', 'while', 'until'],
  mp_forever: ['loop', 'always', 'while'],
  controls_repeat_ext: ['loop', 'for', 'times'],
  controls_if: ['condition', 'decide', 'check', 'else'],
  mp_switch: ['case', 'choose', 'select', 'match', 'condition'],
  logic_compare: ['equal', 'greater', 'less', 'more', 'condition'],
  logic_operation: ['and', 'or', 'condition'],
  logic_negate: ['not', 'condition'],
  logic_boolean: ['true', 'false', 'yes', 'no'],
  controls_flow_statements: ['break', 'continue', 'exit loop'],
  mp_stop_program: ['end', 'exit', 'quit'],
  mp_move: ['drive', 'go', 'forward', 'backward', 'straight', 'distance'],
  mp_move_turn: ['rotate', 'spin', 'left', 'right', 'angle'],
  mp_move_start: ['drive', 'go', 'forward', 'start'],
  mp_move_start_steering: ['drive', 'steer', 'curve', 'arc'],
  mp_move_stop: ['halt', 'brake', 'stop'],
  mp_move_speed: ['fast', 'slow', 'speed'],
  mp_move_motors: ['wheels', 'drive base', 'robot'],
  mp_move_wheels: ['wheel size', 'diameter', 'track', 'robot'],
  mp_motor_run_for: ['spin', 'rotate', 'arm', 'degrees', 'rotations'],
  mp_motor_start: ['spin', 'rotate', 'arm'],
  mp_motor_stop_simple: ['halt', 'brake', 'stop'],
  mp_motor_set_speed: ['fast', 'slow'],
  mp_motor_position: ['angle', 'degrees', 'encoder'],
  mp_motor_reset_position: ['angle', 'zero', 'encoder'],
  mp_light_show_for: ['display', 'screen', 'matrix', 'picture', 'image', 'icon'],
  mp_light_show: ['display', 'screen', 'matrix', 'picture', 'image', 'icon'],
  mp_light_write: ['display', 'screen', 'text', 'scroll'],
  mp_light_off: ['display', 'screen', 'clear'],
  mp_light_pixel: ['display', 'matrix', 'dot'],
  mp_light_button: ['led', 'colour', 'status light'],
  mp_sound_note: ['music', 'tone', 'speaker', 'play'],
  mp_sound_beep: ['sound', 'tone', 'speaker', 'buzz'],
  mp_sound_volume: ['loud', 'quiet', 'speaker'],
  mp_sensor_color_is: ['see', 'detect', 'condition'],
  mp_sensor_color: ['see', 'detect'],
  mp_color: ['red', 'green', 'blue', 'yellow', 'white'],
  mp_sensor_reflection: ['light', 'line', 'brightness', 'reflect'],
  mp_sensor_distance: ['ultrasonic', 'far', 'near', 'eyes'],
  mp_sensor_closer: ['ultrasonic', 'near', 'close', 'obstacle', 'condition'],
  mp_sensor_pressed: ['button', 'press', 'bump', 'force', 'condition'],
  mp_sensor_force: ['button', 'press', 'push'],
  mp_hub_tilt: ['gyro', 'imu', 'angle', 'pitch', 'roll'],
  mp_hub_button: ['press', 'arrow', 'condition'],
  mp_timer: ['time', 'clock', 'stopwatch', 'seconds'],
  mp_timer_reset: ['time', 'clock', 'stopwatch', 'zero'],
  mp_print: ['log', 'console', 'monitor', 'output', 'say', 'show'],
  mp_plot: ['graph', 'chart', 'plotter'],
  math_random_int: ['dice', 'chance', 'pick'],
  math_arithmetic: ['add', 'plus', 'minus', 'multiply', 'divide', 'math', 'calculate'],
  math_round: ['whole number', 'math'],
  math_modulo: ['remainder', 'math'],
  text_join: ['text', 'string', 'combine'],
  variables_set: ['variable', 'store', 'remember'],
  variables_get: ['variable', 'value'],
  math_change: ['variable', 'add', 'increase', 'count'],
};

/** The same word whatever the spelling: colour/color, grey/gray, centre/center, metre/meter. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/colour/g, 'color')
    .replace(/grey/g, 'gray')
    .replace(/centre/g, 'center')
    .replace(/metre/g, 'meter')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
