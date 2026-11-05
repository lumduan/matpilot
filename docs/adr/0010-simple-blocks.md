# ADR 0010: Simple blocks with pictures, beside the detailed blocks

- Status: Accepted
- Date: 2026-11-05

## Context

After the first run of `/blocks` on a hub, and before the next round of hardware checks, the
maintainer asked for simpler blocks (2026-11-05):

- movement blocks with a picture that shows how they work and where the motors connect;
- turns shown as an angle, clearly, because some children cannot yet work with bare numbers;
- motor power as a slider, like the throttle lever of an aircraft, from 0 to 100 %;
- the hub's 5×5 lights as a grid to tap.

The maintainer named the LEGO SPIKE app as the example of what is easy for a beginner (their
child's first programming), and said MatPilot does not need to copy it in everything. **The
detailed blocks must stay:** experienced users prefer them because they are more precise.

- The detailed blocks ([ADR 0008](0008-block-editor.md)) name devices as typed variables, created
  in a "set up" block. That is two steps before anything moves, and their inputs are numbers in
  Pybricks units (degrees per second, milliseconds).
- MatPilot builds its own blocks and copies no artwork, icons or text (ADR 0008). The pictures
  below are drawn for MatPilot; the hub drawing follows only the port letters printed on the hub.

## Decision

1. **Two block sets in one toolbox.** The simple categories come first: Movement, Motors, Light,
   Sound, Control, Sensors, Operators and Variables. Then **Advanced**, which folds open like
   MakeCode's, holds the detailed categories unchanged: Setup, Output, Input, Flow, Data and Other.
   Both sets can be used in one program.
2. **Simple blocks choose a device by port**, not by name.
   - The generator creates one device for each port the program uses, for example
     `motor_a = Motor(MOTOR_A_PORT)`, with the port in Config. Hub code rules 3 and 4 still hold.
   - These problems disable Run until they are fixed: a port used for two kinds of device; a port
     the "set up" block already uses (use that device's blocks instead); a port that drives the
     robot's wheels.
3. **Pictures instead of bare numbers** (`src/lib/blocks/fields/`). Each opens as a Blockly
   drop-down in the block's colour:
   - **ports:** a drawing of the hub with A to F where they are printed. With a hub connected,
     each port says what is plugged into it ([ADR 0009](0009-live-device-values.md)), and new
     blocks from the toolbox take a port where a matching device is plugged in;
   - **movement motors:** tap the left wheel's port, then the right wheel's;
   - **turn:** a dial with the robot seen from above, turned to where it will face, in 5° steps,
     with presets;
   - **steering:** the path the robot will drive, from spinning left to spinning right;
   - **speed, volume and brightness:** a lever from 0 to 100 %;
   - **pictures for the 5×5 lights:** tap or drag to draw, with ten brightness levels;
   - **direction arrows and colour swatches** as picture menus.

   Turn, steering and percentages are numbers underneath, in shadow blocks, so a variable can
   replace them. Every picture also works with the keyboard and has spoken labels.

4. **Movement drives a Pybricks `DriveBase`.**
   - "set movement motors" (default A + B) and "set wheel size" (default 56 mm wheels, 112 mm
     apart) apply to the whole program and become Config, in millimetres
     ([ADR 0004](0004-millimetre-units.md)). A second one with different values is a problem.
   - The left motor counts counterclockwise as forward. That fits a robot whose two motors face away
     from each other, the usual build; a robot built the other way swaps the ports.
   - Rotations become millimetres through the wheel size.
   - Speed is a share of the drive base's top speed, at least 5 %, because the hub refuses a speed
     of 0. Until it is set, Pybricks' defaults apply: 40 % straight and 33 % turning.
   - Steering s keeps the outer wheel at the set speed and moves the inner wheel at
     (1 − 2|s|/100) of it: 0 drives straight, 50 stops the inner wheel, 100 spins on the spot.
   - Turns use the wheel motors' angles, not the hub's gyro (Pybricks' default). With the gyro, a
     turn on a bench would never end, because the hub itself does not turn.
5. **Motor speed** is a share of the motor's top speed, 50 % until a block sets it. Waits in the
   simple blocks are in seconds; the detailed blocks keep milliseconds.
6. **One simple block may make more than one line of Python.** This amends ADR 0008 decision 2
   (one block, one Pybricks call) for the simple blocks only: "move for 2 seconds" drives, waits
   and brakes; steering and speed call helper functions in a Helpers section. Every Pybricks name
   they use is still cited in `src/lib/blocks/pybricks.ts`.
7. **The "set up" block is optional.** Only "when the program starts" is required. A saved "set up"
   block may now be deleted, and Advanced › Setup offers a new one when there is none. This amends
   ADR 0008 decision 3 (the "set up" block was always present).
8. **The starter program is made of simple blocks** and behaves as before: motor A turns a quarter
   turn four times while its angle is plotted.

## Consequences

- A generated program has the sections Config, Setup, Helpers (when needed) and Main. `finally`
  stops the drive base and every motor.
- **Tests:** every simple block is generated into a program that compiles with the real compiler;
  the drive base program is compared line for line; the problems, the toolbox's port choices and
  the fields' limits have unit tests. The pictures were checked in a headless browser.
- **Hardware checks:** the simple-block and advanced checklists in
  [compatibility.md](../compatibility.md#simple-blocks-checks-milestone-4).
- **Not in this first set:**
  - event blocks such as "when the colour sensor sees red", which need tasks
    (ADR 0008 decision 9);
  - a motor "go to position" block with a dial;
  - turns with the gyro, for a later step with a built robot.
