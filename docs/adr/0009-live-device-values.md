# ADR 0009: Live device values through the hub's REPL

- Status: Accepted
- Date: 2026-11-05

## Context

After the first Blocks run on a hub (2026-11-05), the maintainer asked for what the LEGO SPIKE and
EV3 apps show: an icon for each motor and sensor that is plugged in, with its value, above the
blocks. Children read rough values there while they build.

- **There is no port view to reuse.** Pybricks defines a built-in "port view" program (id 129),
  but at v4.0.1 it is a placeholder for SPIKE Prime: it prints one line and ends
  ([`_builtin_port_view.py`](https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/bricks/_common/modules/_builtin_port_view.py)).
  The hub sends no device data on its own.
- **Uploading a reader program is not acceptable.** A program is written into the selected slot
  ([protocol section 6](../protocol/pybricks-ble.md#6-upload-start-stop-the-sequence)). A reader
  uploaded after the user's program would replace it, and the hub's button would then start the
  reader instead of the robot's program. Starting a program from the hub's button, without a
  computer, is how robots run on a competition mat.
- **The hub's REPL runs code without storing it** (program id 128, since protocol 1.4.0). Code can
  be sent to it as stdin with MicroPython's paste mode. Every fact is cited in
  [protocol section 8](../protocol/pybricks-ble.md#8-repl-sessions-live-device-values).
- **One program at a time.** The hub runs either the REPL or the user's program, never both.

## Decision

1. **A small reader runs in the REPL** (`src/lib/devices/hub-source.ts`). It finds what is plugged
   into ports A to F (`PUPDevice(port).info()["id"]`), reads each device about six times a second,
   and prints one line per reading, starting with `@mpv`. It reads motor angle and speed, the
   colour sensor's colour and reflection, the distance sensor, the force sensor, and the hub's
   tilt. It never moves a motor or changes a light, sound or display. Every Pybricks name it uses
   is cited in that file.
2. **`HubConnection.runInRepl()`** starts the REPL with START and id 128, waits for the prompt,
   enters paste mode, sends the reader, and runs it. Sending is paced by the REPL's echo: never
   more than 60 bytes ahead of it, under the 63 bytes the hub's stdin holds. The REPL's output
   goes to its own listeners, never to the Monitor. `HubConnection` stays the only module that
   writes to the hub ([ADR 0007](0007-ble-transport-writes.md)).
3. **The user's program always wins.** Run stops the REPL first and waits for the hub to report
   that it ended, then uploads. When the program ends, the reader starts again. While the program
   runs, the device bar keeps the last values, greyed out, and says that it is paused.
4. **It never runs unattended.** The page sends one keep-alive byte a second; the reader exits by
   itself after 4 seconds without one (for example when the Bluetooth link is lost). The page
   stops it when it is hidden, when the user switches live values off, and before disconnecting
   (STOP first, as for any program).
5. **The hub's stop button is respected.** If the reader ends on the hub without timing out, the
   user pressed the stop button. The page does not restart it until the user presses Resume.
6. **Live values are on by default, with a switch** in the device bar, remembered in the browser.
   Hubs without the REPL, or with protocol older than 1.4, get a message instead.
7. **The status report's program id tells the two apart** (128 is the REPL). The page's Run/Stop
   state, the Monitor's "Program started/stopped" notes, and the "program keeps running" warning
   on a lost link follow the user's program only.

The hub code rules in [CLAUDE.md](../../CLAUDE.md) are about programs that drive the robot. The
reader drives nothing, so rule 1 (stop every motor in `finally`) has nothing to stop; its ports
are one tuple at the top (rules 3 and 4); it reads no controller (rule 2).

## Consequences

- Live values take one to three seconds to appear after connecting: the reader is about 2 KB, sent
  in small pieces at the pace of the echo.
- Values do not update while the user's program runs. Showing them then needs the user's program
  to report them itself, which needs the `await`-aware generator planned for the Tasks blocks
  ([ADR 0008](0008-block-editor.md) decision 9). It is recorded as a follow-up on the roadmap.
- While the reader runs, the hub reports a running program. Pressing the hub's centre button then
  stops the reader; a second press starts the stored program, as usual.
- The REPL's prompt and paste-mode text come from MicroPython, so a firmware update that changed
  them would stop live values (the page then reports that the hub did not answer in time). Tests
  run the session against a fake hub that follows the cited behaviour; the hardware checklist in
  [compatibility.md](../compatibility.md#blocks-checks-milestone-4) checks it on a hub.
