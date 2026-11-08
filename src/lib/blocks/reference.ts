/**
 * Every block, explained for the Docs' "Every block" page (asked for on 2026-11-08: "the Docs
 * should explain every block, what it is for and when to use it, in case some overlap"). The
 * page and the Docs search read this list; ./reference.test.ts keeps it true:
 * - every block the toolbox offers has an entry, and every entry's type is a real block;
 * - each entry's words are the block's own words, in order;
 * - each entry's Python is what the generator really makes for that block;
 * - each entry's shape is the block's shape.
 *
 * The Pybricks behaviour stated here is cited in ./pybricks.ts.
 */
import { CATEGORY_COLOURS } from './colours';

/** How a block looks, as the Docs draw it. */
export type BlockShape =
  /** Starts a stack: nothing goes above it. */
  | 'hat'
  /** One step of a program. */
  | 'step'
  /** Holds other blocks inside it (a loop, an "if"). */
  | 'wrap'
  /** A value: a number, a text, a colour. */
  | 'value'
  /** A question: true or false. */
  | 'question';

export interface BlockReference {
  /** The block's type. */
  readonly type: string;
  /** The block's words in order, as it shows them; "…" is a place for another block. */
  readonly words: string;
  readonly shape: BlockShape;
  /** What it does. */
  readonly what: string;
  /** When to use it. */
  readonly when: string;
  /** The Python it makes; "…" stands for what other blocks put there. A value block: its value. */
  readonly python: string;
  /** A block that is easy to mix up with this one, and the difference. */
  readonly alike?: string;
  /** The other categories that offer the same block. */
  readonly alsoIn?: readonly string[];
  /** The block's own colour, when it differs from its category's. */
  readonly colour?: string;
}

export interface ReferenceCategory {
  /** The category's name in the toolbox; Advanced's own categories are "Advanced › Output". */
  readonly name: string;
  /** For links: `#cat-<id>`. */
  readonly id: string;
  readonly colour: string;
  /** What the category is for. */
  readonly about: string;
  readonly blocks: readonly BlockReference[];
}

const C = CATEGORY_COLOURS;

/** Blocks that are easy to mix up, for the top of the page: [question, answer, block types]. */
export const ALIKE: readonly {
  readonly question: string;
  readonly answer: string;
  readonly types: readonly string[];
}[] = [
  {
    question: 'print or write?',
    answer:
      '“print” sends text or a number to the computer: it appears in the Monitor on the page, never on the hub. “write” shows text on the hub’s 5×5 lights, one letter at a time, with no computer needed. Use print to check what your program is doing; use write to show something on the robot.',
    types: ['mp_print', 'mp_light_write'],
  },
  {
    question: 'print or plot?',
    answer:
      'Both go to the computer. “print” adds a line of text to the Monitor; “plot” draws the value as a line in the Plotter, so you can see it change over time.',
    types: ['mp_print', 'mp_plot'],
  },
  {
    question: '“wait 1 seconds” or “wait 1000 ms”?',
    answer:
      'The same: 1000 milliseconds are 1 second. Control has the one in seconds; Advanced › Flow has the one in milliseconds.',
    types: ['mp_wait_seconds', 'mp_wait'],
  },
  {
    question: '“move forward for” or “start moving”?',
    answer:
      '“move forward for” drives a set distance, and the next block waits until the robot gets there. “start moving” sets off and goes straight on to the next block; the robot keeps going until “stop moving”.',
    types: ['mp_move', 'mp_move_start'],
  },
  {
    question: '“stop moving”, “stop the program” or “break out of loop”?',
    answer:
      '“stop moving” stops the wheels and the program goes on. “break out of loop” leaves the loop it is in and goes on after it. “stop the program” ends everything, and every motor stops.',
    types: ['mp_move_stop', 'mp_stop_program', 'controls_flow_statements'],
  },
  {
    question: '“repeat forever”, “repeat while” or “wait until”?',
    answer:
      '“repeat forever” never ends (use it for a robot that keeps checking its sensors). “repeat while” repeats the blocks inside as long as the question is true. “wait until” does nothing until the question becomes true, then goes on.',
    types: ['mp_forever', 'controls_whileUntil', 'mp_wait_until'],
  },
  {
    question: '“if … else if” or “switch on”?',
    answer:
      'Both pick one of several cases. “switch on” reads one thing once, such as the colour the sensor sees, and does the case that matches; it is shorter when all the questions ask the same sensor. Use “if … else if” when each case asks something different.',
    types: ['controls_if', 'mp_switch'],
  },
  {
    question: '“is pressed” or “is touched” (touch sensor)?',
    answer:
      '“is pressed” is true when the button is pushed in with some force (3 newtons or more); “is touched” is true at the lightest touch. “force” gives the push in newtons.',
    types: ['mp_sensor_pressed', 'mp_force_touched', 'mp_sensor_force'],
  },
  {
    question: '“button is pressed” or “button was just pressed” (controller)?',
    answer:
      '“is pressed” is true all the time the button is held down: use it for something that runs while you hold it. “was just pressed” is true once each time the button goes down: use it to count presses or to switch something on and off.',
    types: ['mp_ctrl_pressed', 'mp_ctrl_clicked'],
  },
  {
    question: 'The simple blocks or the Advanced ones?',
    answer:
      'They make the same Python calls. The simple blocks (Movement, Motors, Light, Sound, Sensors) name a motor or sensor by its port and use friendly units. The Advanced blocks name devices you set up yourself, and offer every choice Pybricks has, such as speeds in degrees per second and how a motor stops. Start with the simple ones; both can be used in one program.',
    types: ['mp_motor_run_for', 'mp_motor_run_angle'],
  },
];

export const REFERENCE: readonly ReferenceCategory[] = [
  {
    name: 'Start',
    id: 'start',
    colour: C.flow,
    about: 'Every program has one start block. It is already on the page when you open Blocks.',
    blocks: [
      {
        type: 'mp_program',
        words: 'when the program starts',
        shape: 'hat',
        what: 'The program runs the blocks under it from top to bottom. When they are done, or you press Stop, every motor stops.',
        when: 'Always: put your blocks under it, in order. Only the main tab has one.',
        python: 'try:\n    …\nfinally:\n    …stop()',
      },
    ],
  },
  {
    name: 'Movement',
    id: 'movement',
    colour: C.movement,
    about:
      'The robot drives on two wheel motors. Choose your robot above the blocks (Robot), and these blocks use its wheels and ports.',
    blocks: [
      {
        type: 'mp_move',
        words: 'move forward for 1 rotations',
        shape: 'step',
        what: 'Drives the robot straight, forward or backward, then stops. The next block waits until the robot has arrived. Tap the unit for rotations of the wheels, millimetres or seconds.',
        when: 'To drive a set distance: the usual way to move.',
        python: 'robot.straight(1 * math.pi * WHEEL_DIAMETER_MM)',
        alike: '“start moving” sets off and goes on to the next block at once.',
      },
      {
        type: 'mp_move_turn',
        words: 'turn right 90°',
        shape: 'step',
        what: 'Turns the robot on the spot by the angle on the dial, then the next block runs.',
        when: 'To face a new direction. Drag the robot on the dial to where it should face.',
        python: 'robot.turn(90)',
      },
      {
        type: 'mp_move_start',
        words: 'start moving forward',
        shape: 'step',
        what: 'Starts the robot driving and goes straight on to the next block. The robot keeps going until “stop moving”.',
        when: 'To drive until something happens, for example with “wait until” the colour sensor sees black.',
        python: 'robot.drive(robot.settings()[0], 0)',
        alike: '“move forward for” drives a set distance and waits for it.',
      },
      {
        type: 'mp_move_start_steering',
        words: 'start moving, steering right 30',
        shape: 'step',
        what: 'Like “start moving”, in a curve: -100 spins left, 0 goes straight, 100 spins right.',
        when: 'To drive in a curve, or to follow a line by changing the steering as you go.',
        python: 'drive_with_steering(30)',
      },
      {
        type: 'mp_move_stop',
        words: 'stop moving',
        shape: 'step',
        what: 'Stops the robot’s wheels. The program goes on.',
        when: 'After “start moving”. The toolbox also offers it with “wait 1 seconds” under it.',
        python: 'robot.brake()',
        alike: '“stop the program” ends the whole program.',
      },
      {
        type: 'mp_move_speed',
        words: 'set movement speed to 50 %',
        shape: 'step',
        what: 'How fast the robot drives and turns from now on, in % of its top speed.',
        when: 'Slower for exact moves, faster for long straight runs.',
        python: 'set_movement_speed(50)',
      },
      {
        type: 'mp_move_motors',
        words: 'set movement motors A + B',
        shape: 'step',
        what: 'Which ports the left and the right wheel motor are on.',
        when: 'Only when no robot is chosen, or to try other ports. A chosen robot already knows them.',
        python: 'LEFT_WHEEL_PORT = Port.A\nRIGHT_WHEEL_PORT = Port.B',
      },
      {
        type: 'mp_move_wheels',
        words: 'set wheel size 56 mm, wheels 112 mm apart',
        shape: 'step',
        what: 'The wheels’ size and how far apart they are, so that distances and turns come out right.',
        when: 'Only when no robot is chosen, or to try other numbers.',
        python: 'WHEEL_DIAMETER_MM = 56\nAXLE_TRACK_MM = 112',
      },
    ],
  },
  {
    name: 'Motors',
    id: 'motors',
    colour: C.output,
    about:
      'One motor at a time, named by its port: an arm, a lift, a wheel on its own. Tap the port to choose it.',
    blocks: [
      {
        type: 'mp_motor_run_for',
        words: 'motor A run clockwise for 1 rotations',
        shape: 'step',
        what: 'Turns one motor by rotations, degrees or seconds, clockwise or anticlockwise. The next block waits until it is done.',
        when: 'For arms and tools that move a set amount.',
        python: 'motor_a.run_angle(motor_a_speed, 360)',
        alike:
          'Advanced › Output “motor run at … for …” does the same with a speed in °/s and a choice of how it stops.',
      },
      {
        type: 'mp_motor_start',
        words: 'motor A start clockwise',
        shape: 'step',
        what: 'Starts a motor turning and goes on to the next block at once. It keeps turning until “motor stop”.',
        when: 'For something that turns while the program does other things, like a spinner.',
        python: 'motor_a.run(motor_a_speed)',
      },
      {
        type: 'mp_motor_stop_simple',
        words: 'motor A stop',
        shape: 'step',
        what: 'Stops the motor.',
        when: 'After “motor start”.',
        python: 'motor_a.brake()',
      },
      {
        type: 'mp_motor_set_speed',
        words: 'set motor A speed to 75 %',
        shape: 'step',
        what: 'How fast this motor’s other blocks turn it from now on, in % of its top speed.',
        when: 'When an arm should move slower or faster.',
        python: 'motor_a_speed = motor_a.control.limits()[0] * 75 // 100',
      },
      {
        type: 'mp_motor_position',
        words: 'motor A position (°)',
        shape: 'value',
        what: 'How far the motor has turned, in degrees, since the program started or the last “set position”.',
        when: 'To know where an arm is, or how far a wheel has rolled.',
        python: 'motor_a.angle()',
        alike: 'Advanced › Input “motor angle” reads the same.',
      },
      {
        type: 'mp_motor_reset_position',
        words: 'set motor A position to 0',
        shape: 'step',
        what: 'Makes the motor count its position from this number.',
        when: 'To start counting from here, for example with an arm held in its lowest place.',
        python: 'motor_a.reset_angle(0)',
      },
    ],
  },
  {
    name: 'Light',
    id: 'light',
    colour: C.light,
    about:
      'The 5×5 lights on the hub, and the light in its centre button. Pictures appear the right way up with ports A and B at the top.',
    blocks: [
      {
        type: 'mp_light_show_for',
        words: 'show picture for 2 seconds',
        shape: 'step',
        what: 'Shows a picture you draw on the 5×5 lights, waits, then turns the lights off.',
        when: 'To show a picture for a moment. Tap the picture to draw it.',
        python: 'hub.display.icon([…])\nwait(2000)\nhub.display.off()',
      },
      {
        type: 'mp_light_show',
        words: 'show picture',
        shape: 'step',
        what: 'Shows a picture you draw on the 5×5 lights and leaves it on.',
        when: 'To show a picture until something else is shown, or “turn off the lights”.',
        python: 'hub.display.icon([…])',
      },
      {
        type: 'mp_light_write',
        words: 'write “Hello”',
        shape: 'step',
        what: 'Shows text on the hub’s 5×5 lights, one letter at a time (half a second each). The next block waits until the last letter. English letters, digits and signs only: other letters stop the program with an error.',
        when: 'To show a word or a number on the robot itself, such as a score. No computer needed.',
        python: "hub.display.text('Hello')",
        alike: '“print” (Sensors) sends text to the Monitor on the computer, not to the hub.',
      },
      {
        type: 'mp_light_off',
        words: 'turn off the lights',
        shape: 'step',
        what: 'Turns off all 25 lights.',
        when: 'After “show picture”.',
        python: 'hub.display.off()',
      },
      {
        type: 'mp_light_pixel',
        words: 'light column 3 row 3 at 100 %',
        shape: 'step',
        what: 'Lights one of the 25 lights, as bright as you choose. Rows and columns count from 1 at the top left.',
        when: 'To draw with single lights, for example a dot that moves.',
        python: 'hub.display.pixel(2, 2, 100)',
      },
      {
        type: 'mp_light_button',
        words: 'set button light to green',
        shape: 'step',
        what: 'Colours the light in the hub’s centre button.',
        when: 'To show what the robot is doing, for example red while it waits.',
        python: 'hub.light.on(Color.GREEN)',
        alike: 'Advanced › Output “hub light” is the same block.',
      },
      {
        type: 'mp_light_button_off',
        words: 'turn off the button light',
        shape: 'step',
        what: 'Turns off the centre button’s light.',
        when: 'After “set button light to”.',
        python: 'hub.light.off()',
      },
    ],
  },
  {
    name: 'Sound',
    id: 'sound',
    colour: C.sound,
    about: 'The hub’s speaker.',
    blocks: [
      {
        type: 'mp_sound_note',
        words: 'play note C (do) for 0.5 seconds',
        shape: 'step',
        what: 'Plays a musical note, then the next block runs.',
        when: 'For tunes: put several notes one under another.',
        python: 'hub.speaker.beep(262, 500)',
      },
      {
        type: 'mp_sound_beep',
        words: 'beep',
        shape: 'step',
        what: 'A short beep.',
        when: 'To hear that the robot got somewhere in the program.',
        python: 'hub.speaker.beep()',
        alike: 'Advanced › Output “beep … Hz for … ms” lets you choose the pitch and the length.',
      },
      {
        type: 'mp_sound_volume',
        words: 'set volume to 100 %',
        shape: 'step',
        what: 'How loud the sounds after it are.',
        when: 'At the start of a program, for a quiet room.',
        python: 'hub.speaker.volume(100)',
      },
    ],
  },
  {
    name: 'Control',
    id: 'control',
    colour: C.flow,
    about: 'Waiting and repeating.',
    blocks: [
      {
        type: 'mp_wait_seconds',
        words: 'wait 1 seconds',
        shape: 'step',
        what: 'Does nothing for a while, then the next block runs. Motors that were started keep going.',
        when: 'To let something happen, or to slow a program down. The search finds it as “sleep” too.',
        python: 'wait(1000)',
        alike: 'Advanced › Flow “wait 1000 ms” is the same, in milliseconds.',
        alsoIn: ['Advanced › Flow'],
      },
      {
        type: 'controls_repeat_ext',
        words: 'repeat 4 times',
        shape: 'wrap',
        what: 'Does the blocks inside a number of times.',
        when: 'For things that repeat, like the four sides of a square.',
        python: 'for count in range(4):\n    …',
        alsoIn: ['Advanced › Flow'],
      },
      {
        type: 'mp_forever',
        words: 'repeat forever',
        shape: 'wrap',
        what: 'Does the blocks inside again and again until the program is stopped. Nothing can go under it.',
        when: 'For a robot that keeps checking its sensors or the controller.',
        python: 'while True:\n    …',
        alike: '“repeat while” stops repeating when its question becomes false.',
        alsoIn: ['Advanced › Flow'],
      },
      {
        type: 'controls_if',
        words: 'if … do …',
        shape: 'wrap',
        what: 'Does the blocks inside only when the question is true. The ⚙ adds “else if” and “else”.',
        when: 'To decide something. Conditions has the questions to ask.',
        python: 'if …:\n    …',
        alsoIn: ['Conditions', 'Advanced › Flow'],
      },
      {
        type: 'controls_if',
        words: 'if … do … else …',
        shape: 'wrap',
        what: 'Does the blocks under “do” when the question is true, else the blocks under “else”.',
        when: 'To choose between two things, such as turning left or right.',
        python: 'if …:\n    …\nelse:\n    …',
        alsoIn: ['Conditions', 'Advanced › Flow'],
      },
      {
        type: 'mp_wait_until',
        words: 'wait until …',
        shape: 'step',
        what: 'Waits until the question is true, then the next block runs.',
        when: 'To wait for a sensor or a button, for example after “start moving”.',
        python: 'while not …:\n    wait(10)',
        alsoIn: ['Advanced › Flow'],
      },
      {
        type: 'controls_whileUntil',
        words: 'repeat while …',
        shape: 'wrap',
        what: 'Does the blocks inside again and again, as long as the question is true.',
        when: 'To keep doing something until a sensor says to stop.',
        python: 'while …:\n    …',
        alsoIn: ['Advanced › Flow'],
      },
      {
        type: 'mp_stop_program',
        words: 'stop the program',
        shape: 'step',
        what: 'Ends the program, as the Stop button does. Every motor stops.',
        when: 'To end a program from the inside, for example when a button is pressed.',
        python: 'raise SystemExit',
        alike: '“stop moving” stops only the wheels; “break out of loop” leaves only the loop.',
        alsoIn: ['Advanced › Flow'],
      },
    ],
  },
  {
    name: 'Conditions',
    id: 'conditions',
    colour: C.flow,
    about:
      'Deciding: “if”, “else”, “switch on”, and the questions to ask. A question block is true or false.',
    blocks: [
      {
        type: 'controls_if',
        words: 'if … do … else if … do … else …',
        shape: 'wrap',
        what: 'Asks one question after another and does the first case whose question is true, or “else” when none is.',
        when: 'For more than two choices.',
        python: 'if …:\n    …\nelif …:\n    …\nelse:\n    …',
        alsoIn: ['Advanced › Flow'],
      },
      {
        type: 'mp_switch',
        words: 'switch on colour sensor D colour case red do … case blue do … otherwise',
        shape: 'wrap',
        what: 'Reads one thing once, such as the colour the sensor sees, then does the case that matches, or “otherwise”. ⊕ adds a case, ⊖ removes the last one.',
        when: 'When every case asks the same thing, like one case per colour.',
        python:
          'switch_value = colour_sensor_d.color()\nif switch_value == Color.RED:\n    …\nelif switch_value == Color.BLUE:\n    …',
        alike: '“if … else if” asks a different question in each case.',
        alsoIn: ['Advanced › Flow'],
      },
      {
        type: 'mp_sensor_color_is',
        words: 'colour sensor D sees red',
        shape: 'question',
        what: 'True when the colour sensor sees that colour.',
        when: 'With “if” or “wait until”, for coloured lines and bricks.',
        python: 'colour_sensor_d.color() == Color.RED',
        alsoIn: ['Sensors'],
      },
      {
        type: 'mp_sensor_closer',
        words: 'distance sensor E is closer than 100 mm',
        shape: 'question',
        what: 'True when something is nearer to the distance sensor than that.',
        when: 'To stop before a wall or find an object.',
        python: 'distance_sensor_e.distance() < 100',
        alsoIn: ['Sensors'],
      },
      {
        type: 'mp_sensor_pressed',
        words: 'touch sensor F is pressed',
        shape: 'question',
        what: 'True while the touch sensor’s button is pushed in (with a force of 3 newtons or more).',
        when: 'For a start button, or to feel a wall.',
        python: 'touch_sensor_f.pressed()',
        alike: 'Advanced › Input “is touched” is true at the lightest touch.',
        alsoIn: ['Sensors'],
      },
      {
        type: 'mp_hub_button',
        words: 'hub left button is pressed',
        shape: 'question',
        what: 'True while that button on the hub is pressed: left, right or Bluetooth. The centre button is not offered: it stops the program.',
        when: 'To start something by pressing the hub.',
        python: 'Button.LEFT in hub.buttons.pressed()',
        alsoIn: ['Sensors', 'Advanced › Input'],
      },
      {
        type: 'logic_compare',
        words: '0 = 50',
        shape: 'question',
        what: 'Compares two numbers: equal, not equal, smaller, bigger.',
        when: 'To ask about a number, such as “reflection < 40”.',
        python: '0 == 50',
        alsoIn: ['Operators', 'Advanced › Flow'],
      },
      {
        type: 'logic_operation',
        words: '… and …',
        shape: 'question',
        what: '“and” is true when both questions are true; “or” when at least one is.',
        when: 'To ask two things at once.',
        python: '… and …',
        alsoIn: ['Operators', 'Advanced › Flow'],
      },
      {
        type: 'logic_negate',
        words: 'not …',
        shape: 'question',
        what: 'True when the question inside is false.',
        when: 'To turn a question round: “not touch sensor is pressed”.',
        python: 'not …',
        alsoIn: ['Operators', 'Advanced › Flow'],
      },
      {
        type: 'logic_boolean',
        words: 'true',
        shape: 'question',
        what: 'Always true (or always false: tap it).',
        when: 'Rarely: to try a part of a program.',
        python: 'True',
        alsoIn: ['Advanced › Flow'],
      },
      {
        type: 'mp_sensor_color',
        words: 'colour sensor D colour',
        shape: 'value',
        what: 'The colour the sensor sees, as a value.',
        when: 'In “switch on”, or to print what it sees.',
        python: 'colour_sensor_d.color()',
      },
      {
        type: 'mp_color',
        words: 'red',
        shape: 'value',
        what: 'A colour.',
        when: 'For a case of “switch on”, or to compare with what the sensor sees.',
        python: 'Color.RED',
      },
    ],
  },
  {
    name: 'Sensors',
    id: 'sensors',
    colour: C.input,
    about:
      'What the sensors and the hub measure, named by port. The questions (true or false) are in Conditions too.',
    blocks: [
      {
        type: 'mp_sensor_reflection',
        words: 'colour sensor D reflection (%)',
        shape: 'value',
        what: 'How much of the sensor’s own light comes back: low on black, high on white.',
        when: 'To follow a line: compare it with a number between the two.',
        python: 'colour_sensor_d.reflection()',
      },
      {
        type: 'mp_sensor_distance',
        words: 'distance sensor E distance (mm)',
        shape: 'value',
        what: 'How far away the nearest thing in front of the sensor is, in millimetres; 2000 when nothing is in range.',
        when: 'To keep a distance, or to print it and see.',
        python: 'distance_sensor_e.distance()',
      },
      {
        type: 'mp_sensor_force',
        words: 'touch sensor F force (N)',
        shape: 'value',
        what: 'How hard the touch sensor is pushed, in newtons.',
        when: 'To tell a soft push from a hard one.',
        python: 'touch_sensor_f.force()',
      },
      {
        type: 'mp_hub_tilt',
        words: 'hub tilt pitch (°)',
        shape: 'value',
        what: 'How far the hub is tilted, in degrees: pitch (front up or down) or roll (side to side).',
        when: 'To notice a ramp, or to steer by tilting the hub.',
        python: 'hub.imu.tilt()[0]',
        alsoIn: ['Advanced › Input'],
      },
      {
        type: 'mp_timer',
        words: 'timer (ms)',
        shape: 'value',
        what: 'The milliseconds since the program started or the timer was reset.',
        when: 'To do something for a time while checking sensors, or to time a run.',
        python: 'timer.time()',
        alsoIn: ['Advanced › Input'],
      },
      {
        type: 'mp_timer_reset',
        words: 'reset timer',
        shape: 'step',
        what: 'Starts the timer again from 0.',
        when: 'Just before something you want to time.',
        python: 'timer.reset()',
        alsoIn: ['Advanced › Input'],
      },
      {
        type: 'mp_plot',
        words: 'plot distance = …',
        shape: 'step',
        what: 'Draws a value as a line in the Plotter on the computer, with the name you give it.',
        when: 'To see a sensor change while the robot moves.',
        python: 'print("distance:", …)',
        alike: '“print” writes the value in the Monitor instead.',
        alsoIn: ['Controller', 'Advanced › Other'],
      },
      {
        type: 'mp_print',
        words: 'print “Hello”',
        shape: 'step',
        what: 'Sends text or a number to the computer: it appears in the Monitor on the page. Nothing shows on the hub. Without the page connected, it goes nowhere and the program carries on.',
        when: 'To check what a sensor reads, or where your program has got to.',
        python: "print('Hello')",
        alike: '“write” (Light) shows text on the hub’s lights instead.',
        alsoIn: ['Advanced › Other'],
      },
    ],
  },
  {
    name: 'Controller',
    id: 'controller',
    colour: C.controller,
    about:
      'Drive with an Xbox controller. The hub reads the controller itself; the Controller panel on the page shows what it reads. Menu (☰) always stops the program.',
    blocks: [
      {
        type: 'mp_ctrl_use',
        words: 'use the controller Xbox',
        shape: 'step',
        what: 'Chooses the controller. The program connects to it before anything else: the hub light blinks blue while it looks, then turns green and beeps twice. The first time, hold the controller’s pair button until its Xbox button flashes fast; after that, turning it on with the Xbox button is enough.',
        when: 'At the top of a program that uses the controller. The toolbox offers it with “repeat forever” and two blocks ready to drive.',
        python: 'controller = XboxController(timeout=CONTROLLER_SEARCH_MS)',
      },
      {
        type: 'mp_ctrl_drive',
        words: 'drive with the controller: one stick',
        shape: 'step',
        what: 'Drives the robot from the sticks, once: “one stick” drives and turns with the left stick, “two sticks (tank)” gives each side a stick, “racing” uses the triggers to go.',
        when: 'Inside “repeat forever”.',
        python: 'drive_with_controller("one stick")',
      },
      {
        type: 'mp_ctrl_motor',
        words: 'A ↻ and B ↺ runs motors C ↻',
        shape: 'step',
        what: 'Turns one or more motors from a control: a pair of buttons, a stick or the triggers. Tap a motor to add it (↻), again to turn it the other way (↺), again to remove it.',
        when: 'Inside “repeat forever”, for an arm or a tool.',
        python:
          'run_motor_with_controller(0, motor_c, motor_c_speed, controller_pair(Button.A, Button.B))',
      },
      {
        type: 'mp_ctrl_rumble',
        words: 'rumble the controller short',
        shape: 'step',
        what: 'Shakes the controller: short, long or twice.',
        when: 'To feel that something happened, such as the robot reaching a wall.',
        python: 'controller_rumble(150, 1)',
      },
      {
        type: 'mp_ctrl_pressed',
        words: 'button A is pressed',
        shape: 'question',
        what: 'True all the time a controller button is held down.',
        when: 'For something that happens while you hold the button.',
        python: 'controller_pressed(Button.A)',
        alike: '“was just pressed” is true once per press.',
      },
      {
        type: 'mp_ctrl_clicked',
        words: 'button A was just pressed',
        shape: 'question',
        what: 'True once each time a controller button goes down.',
        when: 'To count presses, or to switch something on and off with one button.',
        python: 'controller_just_pressed(0, Button.A)',
      },
      {
        type: 'mp_ctrl_value',
        words: 'controller left stick ↕',
        shape: 'value',
        what: 'A stick from -100 to 100, or a trigger from 0 to 100.',
        when: 'To use a stick or a trigger for anything you like, or to plot it.',
        python: 'controller_value(1)',
      },
    ],
  },
  {
    name: 'Operators',
    id: 'operators',
    colour: C.data,
    about: 'Numbers and text. The comparing blocks (=, and, not) are in Conditions too.',
    blocks: [
      {
        type: 'math_number',
        words: '0',
        shape: 'value',
        what: 'A number you type.',
        when: 'Anywhere a number goes.',
        python: '0',
        alsoIn: ['Advanced › Data'],
      },
      {
        type: 'math_arithmetic',
        words: '1 + 1',
        shape: 'value',
        what: 'Adds, subtracts, multiplies or divides two numbers.',
        when: 'To work something out, such as half of a distance.',
        python: '1 + 1',
        alsoIn: ['Advanced › Data'],
      },
      {
        type: 'math_random_int',
        words: 'random integer from 1 to 10',
        shape: 'value',
        what: 'A whole number picked by chance, each time the block runs.',
        when: 'For games, or a robot that wanders.',
        python: 'random.randint(1, 10)',
        alsoIn: ['Advanced › Data'],
      },
      {
        type: 'math_round',
        words: 'round 3.1',
        shape: 'value',
        what: 'The nearest whole number (round up or down: tap it).',
        when: 'To show a tidy number.',
        python: 'round(3.1)',
        alsoIn: ['Advanced › Data'],
      },
      {
        type: 'math_modulo',
        words: 'remainder of 10 ÷ 3',
        shape: 'value',
        what: 'What is left over after dividing.',
        when: 'To do something every second or third time.',
        python: '10 % 3',
        alsoIn: ['Advanced › Data'],
      },
      {
        type: 'text_join',
        words: 'create text with … …',
        shape: 'value',
        what: 'Joins pieces of text, and numbers, into one text.',
        when: 'To print or write something like “score 5”.',
        python: "'' + ''",
        alsoIn: ['Advanced › Data'],
      },
    ],
  },
  {
    name: 'Variables',
    id: 'variables',
    colour: C.variables,
    about:
      'A variable is a name for a number or a text that can change, such as a score. Press “Create variable…” to make one. A variable belongs to its tab; a 🌐 shared variable can be used in every tab.',
    blocks: [
      {
        type: 'variables_set',
        words: 'set count to …',
        shape: 'step',
        what: 'Gives the variable a value.',
        when: 'To start counting, or to remember a reading.',
        python: 'count = 0',
      },
      {
        type: 'math_change',
        words: 'change count by …',
        shape: 'step',
        what: 'Adds a number to the variable (a negative number takes away).',
        when: 'To count laps or points.',
        python: 'count += 1',
      },
      {
        type: 'variables_get',
        words: 'count',
        shape: 'value',
        what: 'The variable’s value now.',
        when: 'Anywhere a number or a text goes.',
        python: 'count',
      },
      {
        type: 'mp_shared_set',
        words: 'shared set laps to …',
        shape: 'step',
        what: 'Gives a shared variable a value. Every tab sees the same value.',
        when: 'Only when several tabs need the same number; otherwise give a function an input.',
        python: 'laps = 0',
        colour: C.sharedVariables,
      },
      {
        type: 'mp_shared_change',
        words: 'shared change laps by …',
        shape: 'step',
        what: 'Adds a number to a shared variable.',
        when: 'To count something in one tab and read it in another.',
        python: 'laps += 1',
        colour: C.sharedVariables,
      },
      {
        type: 'mp_shared_get',
        words: 'shared laps',
        shape: 'value',
        what: 'A shared variable’s value now.',
        when: 'Anywhere a number or a text goes.',
        python: 'laps',
        colour: C.sharedVariables,
      },
    ],
  },
  {
    name: 'Functions',
    id: 'functions',
    colour: C.functions,
    about:
      'Make blocks of your own. Keep them in their own tab (the + beside “main”) so long programs stay tidy.',
    blocks: [
      {
        type: 'mp_func_define',
        words: 'define square with side',
        shape: 'hat',
        what: 'A new block of your own, made of the blocks inside it. ⊕ gives it an input, like the length of a side.',
        when: 'For something your program does more than once, such as driving a square.',
        python: 'def square(side):\n    …',
      },
      {
        type: 'mp_func_call',
        words: 'square side 200',
        shape: 'step',
        what: 'Runs your block, with the inputs you give it.',
        when: 'Wherever the program should do it. Functions lists every block you made.',
        python: 'square(200)',
      },
      {
        type: 'mp_func_input',
        words: 'side',
        shape: 'value',
        what: 'The value an input was given, inside its own “define” block.',
        when: 'Inside the define block, where the input’s value is used.',
        python: 'side',
      },
    ],
  },
  {
    name: 'Advanced › Setup',
    id: 'advanced-setup',
    colour: C.setup,
    about:
      'The Advanced blocks give every choice Pybricks has. They name devices you set up here, once, before the program starts.',
    blocks: [
      {
        type: 'mp_setup',
        words: 'set up',
        shape: 'hat',
        what: 'Holds your devices. They are made once, before the program starts.',
        when: 'Before using the Advanced Output and Input blocks. Only the main tab has one.',
        python: '# --- Setup',
      },
      {
        type: 'mp_setup_motor',
        words: 'motor = motor on port A',
        shape: 'step',
        what: 'A motor with a name and a port, and which way it counts as forward.',
        when: 'Inside “set up”, once for each motor.',
        python: 'motor = Motor(MOTOR_PORT)',
      },
      {
        type: 'mp_setup_color_sensor',
        words: 'colour sensor = colour sensor on port D',
        shape: 'step',
        what: 'A colour sensor with a name and a port.',
        when: 'Inside “set up”.',
        python: 'colour_sensor = ColorSensor(COLOUR_SENSOR_PORT)',
      },
      {
        type: 'mp_setup_ultrasonic_sensor',
        words: 'distance sensor = distance sensor on port E',
        shape: 'step',
        what: 'A distance sensor with a name and a port.',
        when: 'Inside “set up”.',
        python: 'distance_sensor = UltrasonicSensor(DISTANCE_SENSOR_PORT)',
      },
      {
        type: 'mp_setup_force_sensor',
        words: 'touch sensor = touch sensor on port F',
        shape: 'step',
        what: 'A touch sensor with a name and a port.',
        when: 'Inside “set up”.',
        python: 'touch_sensor = ForceSensor(TOUCH_SENSOR_PORT)',
      },
    ],
  },
  {
    name: 'Advanced › Output',
    id: 'advanced-output',
    colour: C.output,
    about: 'Motors, lights and sound, with every choice. Motors are named as in “set up”.',
    blocks: [
      {
        type: 'mp_motor_run_angle',
        words: 'motor run at 500 °/s for 360 ° then hold and wait',
        shape: 'step',
        what: 'Turns a motor by an angle at a speed in degrees per second. “then” chooses how it stops: hold (keeps its place), brake or coast (free). Without “wait”, the next block runs at once.',
        when: 'For exact moves of an arm.',
        python: 'motor.run_angle(500, 360)',
        alike: 'Motors › “motor A run for” is the simple one.',
      },
      {
        type: 'mp_motor_run_target',
        words: 'motor run at 500 °/s to angle 0 ° then hold and wait',
        shape: 'step',
        what: 'Turns a motor to a position, wherever it is now.',
        when: 'To put an arm in a known place, such as up or down.',
        python: 'motor.run_target(500, 0)',
      },
      {
        type: 'mp_motor_run_time',
        words: 'motor run at 500 °/s for 1000 ms then hold and wait',
        shape: 'step',
        what: 'Turns a motor for a time.',
        when: 'For something timed rather than measured.',
        python: 'motor.run_time(500, 1000)',
      },
      {
        type: 'mp_motor_run',
        words: 'motor run at 500 °/s',
        shape: 'step',
        what: 'Starts a motor at a speed; it keeps turning until stopped.',
        when: 'Like “motor start”, with the speed in °/s.',
        python: 'motor.run(500)',
      },
      {
        type: 'mp_motor_dc',
        words: 'motor power 50 %',
        shape: 'step',
        what: 'Gives the motor a share of the battery’s power, without keeping a speed.',
        when: 'Rarely: when a motor should push gently, or go as fast as it can.',
        python: 'motor.dc(50)',
      },
      {
        type: 'mp_motor_stop',
        words: 'motor stop (coast)',
        shape: 'step',
        what: 'Stops a motor: coast (lets it spin freely), brake, or hold (keeps its place).',
        when: 'After “motor run”.',
        python: 'motor.stop()',
      },
      {
        type: 'mp_motor_reset_angle',
        words: 'set motor angle to 0 °',
        shape: 'step',
        what: 'Makes the motor count its angle from this number.',
        when: 'Like Motors › “set motor A position”.',
        python: 'motor.reset_angle(0)',
      },
      {
        type: 'mp_hub_light_on',
        words: 'hub light green',
        shape: 'step',
        what: 'Colours the hub’s centre button light.',
        when: 'The same as Light › “set button light to”.',
        python: 'hub.light.on(Color.GREEN)',
      },
      {
        type: 'mp_hub_light_off',
        words: 'hub light off',
        shape: 'step',
        what: 'Turns off the centre button light.',
        when: 'The same as Light › “turn off the button light”.',
        python: 'hub.light.off()',
      },
      {
        type: 'mp_hub_display_icon',
        words: 'hub display happy',
        shape: 'step',
        what: 'Shows one of Pybricks’ ready-made pictures on the 5×5 lights.',
        when: 'For a quick face or arrow. Light › “show picture” lets you draw your own.',
        python: 'hub.display.icon(Icon.HAPPY)',
      },
      {
        type: 'mp_hub_display_number',
        words: 'hub display number 42',
        shape: 'step',
        what: 'Shows a number on the 5×5 lights.',
        when: 'To show a count on the hub.',
        python: 'hub.display.number(42)',
      },
      {
        type: 'mp_hub_display_text',
        words: 'hub display text “Hello”',
        shape: 'step',
        what: 'Shows text on the 5×5 lights, one letter at a time.',
        when: 'The same as Light › “write”.',
        python: "hub.display.text('Hello')",
      },
      {
        type: 'mp_hub_display_off',
        words: 'hub display off',
        shape: 'step',
        what: 'Turns off the 5×5 lights.',
        when: 'The same as Light › “turn off the lights”.',
        python: 'hub.display.off()',
      },
      {
        type: 'mp_hub_beep',
        words: 'beep 500 Hz for 100 ms',
        shape: 'step',
        what: 'A beep at the pitch and for the time you choose.',
        when: 'For sound effects.',
        python: 'hub.speaker.beep(500, 100)',
      },
    ],
  },
  {
    name: 'Advanced › Input',
    id: 'advanced-input',
    colour: C.input,
    about: 'Sensors and motors, named as in “set up”, with every reading Pybricks has.',
    blocks: [
      {
        type: 'mp_motor_angle',
        words: 'motor angle (°)',
        shape: 'value',
        what: 'How far the motor has turned, in degrees.',
        when: 'The same as Motors › “motor A position”.',
        python: 'motor.angle()',
      },
      {
        type: 'mp_motor_speed',
        words: 'motor speed (°/s)',
        shape: 'value',
        what: 'How fast the motor turns now, in degrees per second.',
        when: 'To notice that a motor is stuck (its speed drops).',
        python: 'motor.speed()',
      },
      {
        type: 'mp_color_sees',
        words: 'colour sensor sees red',
        shape: 'question',
        what: 'True when the colour sensor sees that colour.',
        when: 'Like Sensors › “colour sensor D sees red”.',
        python: 'colour_sensor.color() == Color.RED',
      },
      {
        type: 'mp_color_reflection',
        words: 'colour sensor reflection (%)',
        shape: 'value',
        what: 'How much of the sensor’s own light comes back.',
        when: 'Like Sensors › “reflection”.',
        python: 'colour_sensor.reflection()',
      },
      {
        type: 'mp_color_ambient',
        words: 'colour sensor ambient light (%)',
        shape: 'value',
        what: 'How bright the light around the sensor is, with its own light off.',
        when: 'To notice a torch, or the room getting dark.',
        python: 'colour_sensor.ambient()',
      },
      {
        type: 'mp_ultrasonic_distance',
        words: 'distance sensor distance (mm)',
        shape: 'value',
        what: 'How far away the nearest thing is, in millimetres.',
        when: 'Like Sensors › “distance”.',
        python: 'distance_sensor.distance()',
      },
      {
        type: 'mp_force_pressed',
        words: 'touch sensor is pressed',
        shape: 'question',
        what: 'True while the button is pushed in (3 newtons or more).',
        when: 'Like Conditions › “touch sensor F is pressed”.',
        python: 'touch_sensor.pressed()',
      },
      {
        type: 'mp_force_touched',
        words: 'touch sensor is touched',
        shape: 'question',
        what: 'True at the lightest touch.',
        when: 'To notice a touch that is too soft to count as pressed.',
        python: 'touch_sensor.touched()',
      },
      {
        type: 'mp_force_force',
        words: 'touch sensor force (N)',
        shape: 'value',
        what: 'How hard the button is pushed, in newtons.',
        when: 'Like Sensors › “force”.',
        python: 'touch_sensor.force()',
      },
    ],
  },
  {
    name: 'Advanced › Flow',
    id: 'advanced-flow',
    colour: C.flow,
    about: 'The Control and Conditions blocks again, with two more.',
    blocks: [
      {
        type: 'mp_wait',
        words: 'wait 1000 ms',
        shape: 'step',
        what: 'Does nothing for a number of milliseconds (1000 ms are 1 second).',
        when: 'Like Control › “wait 1 seconds”, for short waits.',
        python: 'wait(1000)',
      },
      {
        type: 'controls_flow_statements',
        words: 'break out of loop',
        shape: 'step',
        what: 'Leaves the loop it is in; the program goes on after the loop. Its other choice, “continue with next iteration”, skips to the next time round.',
        when: 'Inside a loop, to stop repeating early.',
        python: 'break',
      },
    ],
  },
  {
    name: 'Advanced › Data',
    id: 'advanced-data',
    colour: C.data,
    about: 'The Operators blocks again, and text.',
    blocks: [
      {
        type: 'text',
        words: '“ ”',
        shape: 'value',
        what: 'A piece of text you type.',
        when: 'For “print”, “write” or “create text with”.',
        python: "'…'",
      },
    ],
  },
];

/** Every entry, with its category. */
export function referenceEntries(): { category: ReferenceCategory; block: BlockReference }[] {
  return REFERENCE.flatMap((category) => category.blocks.map((block) => ({ category, block })));
}

/** The id of an entry on the page: `block-<type>`, numbered when one type has several entries. */
export function entryId(block: BlockReference): string {
  const same = referenceEntries().filter((entry) => entry.block.type === block.type);
  const index = same.findIndex((entry) => entry.block === block);
  return index <= 0 ? `block-${block.type}` : `block-${block.type}-${index + 1}`;
}
