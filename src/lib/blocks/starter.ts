/**
 * The block program a first visit starts with: one motor on port A (the maintainer's bench
 * layout), turned a quarter at a time while its angle is plotted.
 */
export const STARTER_WORKSPACE = {
  variables: [{ name: 'motor', id: 'starter-motor', type: 'Motor' }],
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: 'mp_setup',
        id: 'starter-setup',
        x: 24,
        y: 24,
        deletable: false,
        inputs: {
          DEVICES: {
            block: {
              type: 'mp_setup_motor',
              fields: { VAR: { id: 'starter-motor' }, PORT: 'A', DIRECTION: 'CLOCKWISE' },
            },
          },
        },
      },
      {
        type: 'mp_program',
        id: 'starter-program',
        x: 24,
        y: 150,
        deletable: false,
        next: {
          block: {
            type: 'controls_repeat_ext',
            inputs: {
              TIMES: { shadow: { type: 'math_number', fields: { NUM: 4 } } },
              DO: {
                block: {
                  type: 'mp_motor_run_angle',
                  fields: { MOTOR: { id: 'starter-motor' }, THEN: 'HOLD', WAIT: 'TRUE' },
                  inputs: {
                    SPEED: { shadow: { type: 'math_number', fields: { NUM: 360 } } },
                    ANGLE: { shadow: { type: 'math_number', fields: { NUM: 90 } } },
                  },
                  next: {
                    block: {
                      type: 'mp_plot',
                      fields: { LABEL: 'angle' },
                      inputs: {
                        VALUE: {
                          shadow: { type: 'math_number', fields: { NUM: 0 } },
                          block: {
                            type: 'mp_motor_angle',
                            fields: { MOTOR: { id: 'starter-motor' } },
                          },
                        },
                      },
                      next: {
                        block: {
                          type: 'mp_wait',
                          inputs: {
                            TIME: { shadow: { type: 'math_number', fields: { NUM: 500 } } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            next: {
              block: {
                type: 'mp_print',
                inputs: { VALUE: { shadow: { type: 'text', fields: { TEXT: 'done' } } } },
              },
            },
          },
        },
      },
    ],
  },
} as const;
