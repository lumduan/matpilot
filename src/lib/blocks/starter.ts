/**
 * The block program a first visit starts with, in simple blocks (ADR 0010): the motor on port A
 * (the maintainer's bench layout) turns a quarter at a time while its position is plotted.
 */
export const STARTER_WORKSPACE = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: 'mp_program',
        id: 'starter-program',
        x: 24,
        y: 24,
        deletable: false,
        next: {
          block: {
            type: 'controls_repeat_ext',
            inputs: {
              TIMES: { shadow: { type: 'math_number', fields: { NUM: 4 } } },
              DO: {
                block: {
                  type: 'mp_motor_run_for',
                  fields: { PORT: 'A', DIRECTION: 'CLOCKWISE', UNIT: 'DEGREES' },
                  inputs: {
                    AMOUNT: { shadow: { type: 'math_number', fields: { NUM: 90 } } },
                  },
                  next: {
                    block: {
                      type: 'mp_plot',
                      fields: { LABEL: 'angle' },
                      inputs: {
                        VALUE: {
                          shadow: { type: 'math_number', fields: { NUM: 0 } },
                          block: { type: 'mp_motor_position', fields: { PORT: 'A' } },
                        },
                      },
                      next: {
                        block: {
                          type: 'mp_wait_seconds',
                          inputs: {
                            SECONDS: { shadow: { type: 'math_number', fields: { NUM: 0.5 } } },
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
