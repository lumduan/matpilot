# ADR 0012: Controller blocks for the Xbox controller, with a live view

- Status: Accepted
- Date: 2026-11-06
- Builds on: [ADR 0003](0003-hub-direct-gamepad.md) (the hub reads the controller),
  [ADR 0010](0010-simple-blocks.md) (simple blocks)

## Context

The maintainer asked, after the first Xbox controller check (2026-11-06), for the controller in
the blocks:

- start simple, for children;
- the sticks drive the robot (movement);
- buttons run a motor, or anything else;
- easy, fun, and visible on the page while the program runs ("Monitor").

What the first check showed (a photo, 2026-11-06; maintainer's SPIKE Prime, Pybricks 4.0.1,
Chrome on macOS assumed as in the earlier runs):

- the example "Xbox controller check (no motors)" connected the controller: the Xbox button was
  lit, and the hub's centre button was green, which that program sets once it is connected;
- one light sat in the middle of the 5×5 lights, as it does for a centred stick;
- **the hub's Bluetooth ring was blue.** In Pybricks v4.0.1 that light is steady blue while a
  computer is connected, two short blue blinks then a long pause while the hub advertises, and
  off otherwise
  ([`lib/pbio/sys/light.c#L104-L117`](https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/sys/light.c#L104-L117),
  [`#L217-L231`](https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/sys/light.c#L217-L231);
  the SPIKE Prime shows it during a program:
  [`prime_hub/pbsysconfig.h#L28`](https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/platform/prime_hub/pbsysconfig.h#L28)).

So the hub most likely kept its link to MatPilot while the controller was connected. That is
unlike the maintainer's `pybricksdev` run of 2026-08-28 (roadmap, milestone 5). A photo cannot
tell a steady light from a blink, and whether output kept arriving, which way "stick up" counts,
and which side is the top of the lights were not reported. The checks below ask again.

The firmware facts this design relies on are cited in `src/lib/blocks/pybricks.ts`, among them:

- reading a controller that went away raises `OSError`;
- `print()` drops its text instead of waiting when no computer is connected, so reporting cannot
  freeze the driving;
- `XboxController` cannot be created once tasks run.

## Decision

1. **A "Controller" category in the simple blocks** (after Sensors), in its own colour (`#3f6212`,
   6.6:1 against the white block text). Six blocks:
   - **drive with the controller:** one stick (the left stick drives and turns), two sticks (tank:
     one stick per side), or racing (RT goes, LT backs up, the left stick steers);
   - **motor [port] runs with [source]:** A ↻ and B ↺, X/Y, RB/LB, D-pad ↑↓ or →←, a stick axis,
     or the triggers (RT ↻, LT ↺);
   - **button [picture] is pressed** and **button [picture] was just pressed** (true once per
     press). The buttons are shown as coloured A, B, X, Y and grey keys;
   - **controller [left stick ↕ …]:** a stick from -100 to 100, or a trigger from 0 to 100;
   - **rumble the controller [short, long, twice].**
   - The category opens with a ready-made "repeat forever" that drives with one stick and runs
     motor C with A and B, then each block, then ideas: wait until A is pressed, rumble when X
     is pressed, plot the left stick.
2. **The hub reads the controller** (ADR 0003). The browser is never in the control loop.
3. **The program connects in Setup**, after the motors and the drive base, so nothing moves if it
   fails.
   - Hub light blue while searching: `CONTROLLER_SEARCH_MS` = 20 s per attempt. On the SPIKE Prime
     the firmware tries once more after 2 s, so about 42 s at most
     ([`pb_type_iodevices_xbox_controller.c#L303-L309`](https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/pybricks/iodevices/pb_type_iodevices_xbox_controller.c#L303-L309)).
   - Green once connected.
   - Red with a message, then the program ends, if no controller is found.
   - ➡️ Changed by the [amendment of 2026-11-08](#amendment-the-hub-shows-the-search-2026-11-08):
     the light blinks blue while searching, green comes with two beeps, 30 s per attempt (about
     a minute), and the Monitor gets the hub's own reason.
4. **Every block reads through one helper**, `read_controller()`:
   - **controller lost** (`OSError`, hub code rule 2): red light, a message, and
     `raise SystemExit`, so `finally` stops every motor. There is no reconnecting yet;
   - **Menu (☰) always stops the program** the same way. A child can stop the robot from the
     controller even if the page is closed or the link is gone. Menu and the Xbox button
     (holding it switches the controller off) are not offered in the blocks.
5. **Driving** uses `DriveBase.drive()`:
   - full stick is the movement speed, and full sideways is the movement turn rate (the
     "set movement speed" lever sets both; the defaults are Pybricks' own);
   - tank: speed = (left + right) / 2, turn = (left − right) / 2;
   - letting go stops the robot, because `drive()` is called with 0.
6. **A motor** runs at its own speed (the "set motor speed" lever, 50 % until set) times the
   source's power: ±100 for a button pair, or the stick or trigger value. Below 10 % it stops
   and holds its angle; `hold()` is called once, not in every loop, so an arm does not creep
   down.
7. **"was just pressed"** remembers, per block, whether the button was down the last time that
   block looked. So two such blocks never take each other's press.
8. **The live view.** The read helper prints one line every `CONTROLLER_REPORT_MS` = 100 ms:
   @xbx <left x> <left y> <right x> <right y> <LT> <RT> <buttons as bits>
   It also prints status lines (`searching`, `connected`, `notfound`, `lost`, `menu`).
   - The page keeps these lines out of the Monitor and the Plotter and draws them in a
     **Controller** pane: a generic gamepad (MatPilot's own drawing, no logo) whose sticks move,
     triggers fill and buttons light, with the numbers beside it.
   - The pane opens by itself when a controller program runs.
   - It says when the controller is searching, live, lost, not found, or stopped by Menu.
   - It warns when values stop coming: the blocks are not in a loop.
   - The bit order is fixed in `src/lib/controller/xbox.ts`; the generator writes the same list.
9. **Not in this step:**
   - "when button A is pressed" hat blocks. They need Tasks (`multitask`), and the controller
     must then be created before tasks start;
   - reconnecting after the controller is lost;
   - other controllers (PS4 would need its own ADR, roadmap milestone 5).

## Consequences

- Two blocks (the ready-made loop) make a robot drive from the controller, and the child sees
  every stick and button on the page while it runs.
- The view depends on the hub's link to the page staying up while it uses the controller. The
  first photo says it does, and the Xbox check on 2026-11-07 showed it: output kept arriving
  while the controller was connected. If it does not on some computer, the robot still drives; the page
  then shows the existing "Connection lost" notice, and Menu or the hub's centre button stops
  the program.
- Which way "stick up" counts is read from the firmware (up is positive: the raw axis is turned
  over). On hardware, the Xbox check on 2026-11-07 was reported as passed, which in that program
  means pushing the stick away gave a positive value. Controller blocks check 3 shows the number
  on the page, and forward must drive forward.
- About 10 printed lines a second (one value line every 100 ms, and a status line now and then)
  is little next to the Bluetooth link's capacity. The Monitor stays readable because these lines
  never reach it.

## Amendment: the maintainer's review (2026-11-06)

The maintainer reviewed the blocks the same day, without a hub, and asked for three changes:

- do not tie the blocks to the Xbox controller: choose the controller, and show its layout;
- drop the motor block's single port: choose the motors, more than one if needed, as "set
  movement motors" does;
- when choosing a button, show where it is on the controller, as a controller's settings page
  does, so a child can tell whether it is comfortable to use.

Decided:

10. **"use the controller [Xbox]"**, the first block in the category and the first block of the
    ready-made group, chooses the controller. Its picker shows each controller's drawing, name and
    how to pair it. Only the Xbox controller is offered, because only it connects to a SPIKE Prime
    hub (roadmap, milestone 5). Without the block, the program uses the Xbox controller. Two such
    blocks naming different controllers are a problem to fix.
    - Each controller is one profile in `src/lib/controller/layout.ts`: its name, how to pair it,
      and its drawing (body, sticks, triggers, keys and which finger reaches each). The block
      pickers and the Controller pane draw from it. Another controller later is another profile.
11. **The motor block reads "[control] runs motors [motors]".** The control comes first, picked on
    the controller. The motors are picked on the hub drawing: a tap adds a motor (↻), a second
    tap turns it the other way (↺), a third removes it, and at least one stays. Motors that face
    each other need opposite arrows, or a robot spins instead of driving.
    - All the chosen motors move from one reading (`controller_power`), each with its own sign.
    - A chosen motor on a wheel port is the usual port problem.
    - A motor block saved before this change opens with motor C ↻: Blockly drops the old `PORT`
      field, with a warning in the browser console.
12. **Buttons, sticks and triggers are picked on the controller.**
    - The button picker: tap a button on the drawing. It names the button and the finger that
      presses it.
    - The control picker: tap a stick (tap again for ↕ or ↔), a trigger or a button pair, or
      choose from the list beside the drawing. The chosen parts light up, with ↻ and ↺ beside
      them, and a sentence says what to do ("Hold A for ↻, B for ↺").
    - Both pickers warn when the finger is already busy with "drive with the controller" (for
      example the left thumb with one stick), and mark such controls with a dashed ring.
    - Menu is shown but cannot be picked: it always stops the program.
13. **The Controller pane names the controller and lists "Your controls"**: what each control
    does in this program and which finger uses it, from the generator (for example "left stick
    drives and turns the robot · left thumb", "Menu ☰ stops the program").

## Amendment: the hub shows the search (2026-11-08)

The maintainer tried the Controller blocks on Pybricks v4.1.3 (2026-11-08) and the controller did
not connect; what the hub light and the Monitor showed was not reported. They asked for two
things, pointing at their own car program (lumduan/lego-spike-prime-remote-car, `main.py` at
`798160126be9`, which blinks blue while it looks, then plays two rising beeps and shows green):

- the hub should show that it is waiting: a blinking blue light, then a steady green light and a
  beep once connected;
- a controller paired before should connect by itself the next time the program runs.

What the firmware already does, cited at pybricks-micropython v4.1.3 (`c860b6a`, details and
lines in `src/lib/blocks/pybricks.ts`):

- `XboxController()` uses a controller that is still connected from the last run, at once, and a
  controller stays connected when a program ends (since v4.0.0b6, `CHANGELOG.md#L341-L342`).
- The hub also finds a controller that is just turned on, not in pairing mode. Pybricks' comment
  says this works only if the hub was that controller's most recent connection; after a console,
  a phone or a computer, the controller must be put in pairing mode again
  (`pb_type_iodevices_xbox_controller.c#L140-L153`, `#L366-L380`).
- If the controller connects but will not give its buttons, Pybricks raises `OSError("Connected,
but not allowed to read buttons. Try putting the controller in pairing mode.")` (same file,
  `#L376-L379`). MatPilot's message used to hide it.

So "connect by itself" needs no new code: it needs the child to know that after the first pairing
the Xbox button is enough. Decided:

14. **The Setup lines show the search on the hub:**
    - `hub.light.blink(Color.BLUE, [300, 300])` while the hub looks for the controller. The
      blinking goes on while `XboxController()` waits, because the light's animation is a process
      of the hub's own;
    - once connected: a steady green light, then `hub.speaker.beep(660, 100)` and
      `hub.speaker.beep(990, 100)`, the two rising notes of the maintainer's car;
    - not connected: a red light, `print("No Xbox controller connected. The hub said:",
controller_error)` with Pybricks' own reason, then what to do. `controller_error` is a
      reserved name.
15. **`CONTROLLER_SEARCH_MS` is 30 s** (it was 20 s), as in the maintainer's car. With the second
    attempt that is about a minute to turn the controller on after pressing Run.
16. **The words say how to connect a second time.** The picker and the Controller pane: "The
    first time: press Run, then hold its pair button until the Xbox button flashes fast. After
    that the hub remembers it: press Run and turn the controller on with its Xbox button. Used
    with something else since (a console, a phone, a computer)? Pair it again." The pane says
    the hub light blinks blue while it looks, and that the Monitor says why when nothing
    connected.

17. **Added the same day, after the maintainer's second try** (the program connected and ended at
    once, because its "repeat forever" group was not attached, so it was drawn faded and striped
    and did not run): the Monitor says "Looking for the controller..." and "The controller is connected." in
    words, and when a program ends right after connecting without reading the controller, the
    Controller pane asks whether the Controller blocks are attached under "use the controller".
    The Blocks page also lists every block that is not attached ("Not running"), for any program.

Not decided here: reconnecting during a program after the controller is lost (the maintainer's
car project plans it as its "Case 4"); it stays as before (red light, the program ends).

Whether the light keeps blinking during the search, whether the beeps play, and whether a
controller connects with only its Xbox button after a hub restart, are new hardware checks
(docs/compatibility.md, Controller blocks checks 12 to 15).
