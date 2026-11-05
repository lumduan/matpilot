# Browser and platform compatibility

MatPilot talks to the hub through the browser's Web Bluetooth API, so it runs only where Web
Bluetooth is available. The decision is recorded in
[ADR 0001](adr/0001-browser-only-web-bluetooth.md).

At runtime the app decides by **feature detection, not by browser name**: the "Connect to hub"
button is enabled only when the page is a secure context, `navigator.bluetooth` exists, and
`navigator.bluetooth.getAvailability()` reports an adapter. The table below is the project's
support policy and its hardware test record.

## Support matrix

| Browser                                                    | Platform          | Status        | Verified on hardware                                           |
| ---------------------------------------------------------- | ----------------- | ------------- | -------------------------------------------------------------- |
| Google Chrome                                              | Windows 10 and 11 | Supported     | Not yet verified                                               |
| Microsoft Edge                                             | Windows 10 and 11 | Supported     | Not yet verified                                               |
| Google Chrome                                              | macOS             | Supported     | Verified 2026-11-04 (Chrome 156, macOS 27.0.1, Pybricks 4.0.1) |
| Microsoft Edge                                             | macOS             | Supported     | Not yet verified                                               |
| Google Chrome                                              | ChromeOS          | Supported     | Not yet verified                                               |
| Google Chrome                                              | Android           | Supported     | Not yet verified                                               |
| Microsoft Edge                                             | Android           | Supported     | Not yet verified                                               |
| Firefox                                                    | All platforms     | Not supported | Not yet verified                                               |
| Safari                                                     | macOS             | Not supported | Not yet verified                                               |
| Any browser (Safari, Chrome, Edge, Firefox, ...)           | iOS and iPadOS    | Not supported | Not yet verified                                               |
| Google Chrome, Microsoft Edge                              | Linux             | Not supported | Not yet verified                                               |
| Other Chromium-based browsers (Brave, Opera, Vivaldi, ...) | Any               | Untested      | Not yet verified                                               |

**Hub and firmware:** LEGO SPIKE Prime running Pybricks firmware v4.0.1 is the tested baseline (not
a hard requirement). Status: **verified on hardware for one row** (Google Chrome on macOS,
2026-11-04); the other rows are not yet verified. Each run is listed under
[Hardware test record](#hardware-test-record).

On Windows, Chrome's Web Bluetooth needs Windows 10 version 1703 (Creators Update) or later
([Web Bluetooth CG implementation status][impl-status]).

### Why the unsupported platforms do not work

- **Firefox:** Firefox does not implement the Web Bluetooth API, so `navigator.bluetooth` does not
  exist.
- **Safari on macOS:** Safari's engine, WebKit, does not implement the Web Bluetooth API.
- **iOS and iPadOS:** browsers on iPhone and iPad are built on Apple's WebKit engine, which does not
  implement Web Bluetooth, so this applies to Chrome, Edge, and Firefox for iOS as well as Safari.
- **Linux:** Chromium's Web Bluetooth on Linux is "partially implemented and not supported" and
  needs the `chrome://flags/#enable-experimental-web-platform-features` flag
  ([implementation status][impl-status]), so Linux is outside the support policy.
- **Other Chromium-based browsers** (untested, not unsupported): they share Chrome's engine, but
  each vendor decides whether to ship Web Bluetooth enabled, so support varies by browser.

[impl-status]: https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md

## What the compatibility check tests

| Check                        | Required | Passes when                                                                          |
| ---------------------------- | -------- | ------------------------------------------------------------------------------------ |
| Secure context               | Yes      | `window.isSecureContext` is `true` (HTTPS, or `localhost`)                           |
| Web Bluetooth API            | Yes      | `'bluetooth' in navigator`                                                           |
| Bluetooth adapter available  | Yes      | `await navigator.bluetooth.getAvailability()` is `true` (only run if the API exists) |
| Browser and operating system | No       | Informational only: best-effort detection from the user agent                        |

Browsers expose `navigator.bluetooth` only in a secure context, so on a plain `http://` LAN address
both of the first two checks fail.

## How to verify a row on hardware

A row may be marked "Verified on hardware" only after a maintainer has done all of the following on
that browser and platform, with a real SPIKE Prime hub running Pybricks firmware. Record the date,
browser version, OS version, and firmware version in the cell, for example
`Verified 2026-11-10 (Chrome 142, macOS 26.1, Pybricks 4.0.1)`.

The easiest way is the **hardware test page**, `/hardware-test` (for example
`http://localhost:3300/hardware-test`, or the same path on any HTTPS address that serves the app).
It walks through the steps below in this order, works out every result except step 3 by itself,
counts uncaught exceptions and Content Security Policy violations, and produces a plain-text report
that ends with the cell text. Results stay in that browser (local storage) until you click
**Start over**; nothing is sent anywhere. The report includes the hub's name, so remove it before
posting a report publicly. Its logic lives in `src/lib/hwtest/session.ts`: change the steps there
and here together.

For a **supported** row:

1. Open the app over HTTPS (or `localhost`). Every compatibility check shows **Pass** (the browser
   check shows **Info**), and "Connect to hub" is enabled.
2. With the hub on, click "Connect to hub". When the browser's device picker opens, do not choose
   the hub: click "Cancel". The app shows the neutral **No hub selected** state. (If a hub is
   already connected, the page first points to step 5; do step 2 after that, starting with
   "Disconnect".)
3. Click "Connect to hub" again. The browser's device picker lists only Pybricks hubs. (The page
   cannot see the picker, so the tester answers this one.)
4. Select the hub. The app shows its name, firmware revision string, and protocol version string.
5. While connected, turn the hub off with its button (do not click "Disconnect"). The app shows
   **Hub disconnected**, and no uncaught exception occurs.

For an **unsupported** row: open the app. The unsupported-browser message appears, naming the
supported browsers and platforms, and "Connect to hub" is disabled.

A non-zero count of Content Security Policy violations in the report means something outside the
app added a script or style to the page, typically a proxy or CDN (for example Cloudflare Web
Analytics or Rocket Loader). Turn that feature off for the app's hostname: MatPilot loads nothing
from other origins.

## Hardware test record

One line per run that verified a row. Hub names are left out on purpose (the hardware test report
includes them, but they are personal).

| Date       | Browser    | OS           | Hub         | Firmware | Protocol | Result              |
| ---------- | ---------- | ------------ | ----------- | -------- | -------- | ------------------- |
| 2026-11-04 | Chrome 156 | macOS 27.0.1 | SPIKE Prime | 4.0.1    | 1.5.0    | 5 of 5 steps passed |

Notes on the 2026-11-04 run, made with `/hardware-test` over an HTTPS tunnel:

- **Uncaught exceptions: none.** The first attempt surfaced two hosting and page issues, both
  fixed before the passing run:
  - The tunnel's CDN (Cloudflare Web Analytics) injected a script that the app's Content Security
    Policy blocked. That feature was turned off for the site.
  - The page pointed at step 2 while a hub was connected. Fixed in pull request #6.
- **Hub name:** the hub reported its name cut to 15 characters. That is the firmware's limit,
  documented with citations on `HubInfo.name` in `src/lib/ble/hub-probe.ts`.

## Program and Monitor checks (milestone 3)

These checks use the **Program & Monitor** page (`/program`) over HTTPS, with the bench layout:

| Port | Device            |
| ---- | ----------------- |
| A    | L-motor           |
| B    | L-motor           |
| C    | M-motor           |
| D    | Color Sensor      |
| E    | Ultrasonic Sensor |
| F    | Force Sensor      |

Use no robot: the motors lie loose on the desk.

1. Connect. The page shows the hub name and firmware.
2. **Hello monitor** example: Run. The monitor shows `count: 0` to `count: 19` and then "Program
   stopped.", and the plotter draws `count`.
3. **Plot a motor angle (port A)**: Run, then turn motor A by hand. The angle moves in the plotter.
   Press **Stop**: the program stops and motor A is released.
4. **Spin a motor for 3 seconds (port A)**: Run. Motor A turns for about 3 s and stops by itself.
   The plotter shows angle and speed.
5. **Plot distance (port E)**: Run, and move a hand towards the sensor. The distance (mm) falls.
6. **Colour reflection and force (ports D, F)**: Run, then cover the colour sensor and press the
   force sensor. Both lines react.
7. Edit a program to contain a syntax error and Run. The page shows the error and its line, and
   nothing is sent to the hub.
8. While a program runs, click **Disconnect**. The program stops before the link closes.
9. While a program runs, turn Bluetooth off on the computer, or move out of range. The monitor
   says that the program keeps running on the hub. The hub's centre button stops it.

Record the results in the hardware test record above, with the date, browser, OS and firmware.

### Program and Monitor results

| Date       | Browser    | OS           | Hub         | Firmware | Result               |
| ---------- | ---------- | ------------ | ----------- | -------- | -------------------- |
| 2026-11-05 | Chrome 156 | macOS 27.0.1 | SPIKE Prime | 4.0.1    | 9 of 9 checks passed |

Notes on the 2026-11-05 run (the maintainer's bench, over the HTTPS tunnel, with a screen recording
and the monitor's copied text). The browser and OS are those of the 2026-11-04 run; the maintainer
reported no change.

- **Hello monitor:** `count: 0` to `count: 19`, about 500 ms apart, then `done` and "Program
  stopped."
- **Motor angle:** turning motor A by hand moved the angle from -11 to 311 degrees in the plotter.
  Stop ended the program; the hub printed `The program was stopped (SystemExit).` before "Program
  stopped."
- **Spin for 3 seconds:** motor A went from -49 to 979 degrees in about 3 s at 350 to 370 deg/s,
  and stopped by itself.
- **Distance:** the sensor read 2000 mm with nothing in front of it and fell to 40 mm with a hand
  close by. 2000 is the firmware's value for "nothing in range": `distance()` returns 2000 for any
  reading below 0 or from 2000 up
  ([`pb_type_pupdevices_ultrasonicsensor.c#L39-L42`](https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/pybricks/pupdevices/pb_type_pupdevices_ultrasonicsensor.c#L39-L42),
  Pybricks v4.0.1).
- **Colour and force:** reflection 0 to 47 %, force 0 to 10.1 N, both lines reacting.
- **Syntax error:** `SyntaxError: invalid syntax (near line 16)`; nothing was sent to the hub.
- **Disconnect while running:** the monitor showed "Disconnected."; after reconnecting, Run started
  a fresh program, so the old one had stopped.
- **Link lost while running:** the warning appeared, and the hub's centre button stopped the
  program.
- **Monitor timestamps** are the browser's arrival times. Bluetooth sometimes delivers several
  lines in one notification, so a few consecutive lines can share a timestamp.

## Blocks checks (milestone 4)

These checks use the **Blocks** page (`/blocks`) over HTTPS, with the same bench layout as the
Program and Monitor checks (A and B large motors, C medium motor, D colour, E distance, F touch).
Start from the starter program (**Start over**).

The lists were reorganised on 2026-11-05, after the first run: the starter program is now made of
simple blocks ([ADR 0010](adr/0010-simple-blocks.md)), and the detailed blocks moved under
**Advanced**. The earlier checks 1 to 3, 8 and 9 are simple-block checks 1 to 3, 9 and 10 below;
the earlier checks 4 to 7 are the advanced checks.

### Simple blocks checks (milestone 4)

1. Press **Connect hub** (top right). Press **Python** (bottom right): the Python beside the blocks
   matches them, and Run is enabled.
2. Open **Monitor** and **Plotter** (bottom right). Run the starter program. Motor A turns a quarter
   turn four times, the plotter shows `angle` rising by about 90 each time, and the monitor ends
   with `done` and "Program stopped."
3. Run it again and press **Stop** in the middle. The program stops and motor A is released.
4. Tap the **A** on the motor block. A picture of the hub opens: the port letters sit where they
   are printed on your hub, and each port says what is plugged in (A and B "large motor", C
   "medium motor", D "colour sensor", E "distance sensor", F "touch sensor"). Tap **C** and Run:
   motor C turns. Set it back to A.
5. Replace the blocks under "when the program starts" with **Movement** › "move ↑ for 1
   rotations", then "turn right 90°". Run: motors A and B each turn one full turn, in opposite
   directions (as the wheels on the two sides of a robot do); then each turns about half a turn,
   both the same way.
6. Tap "right 90°": a dial opens with the robot seen from above. Drag the handle to the left: the
   robot in the dial turns, the block says "left 90°", and the Python says `robot.turn(-90)`. Run:
   the half turns now go the other way.
7. Build: "start moving, steering right 50", "wait 2 seconds", "stop moving". Tap "right 50" and
   look at the path in the picture. Run: motor A turns for 2 seconds and motor B stays still, or
   almost (steering 50 stops the inner wheel).
8. **Light** › "show [picture] for 2 seconds": tap the picture, press **Clear**, and draw an arrow
   pointing up. Run: the hub shows the arrow for 2 seconds, then its lights go off. Note which way
   it points when the hub's port letters A and B are at the top. Add "set button light to" green:
   the centre button turns green.
9. **Motors** › "set motor A speed to": push the lever to 100 %, then 25 %, running "motor A run
   for 1 rotations" each time: the motor is clearly faster at 100 %. Then press **Edit as
   Python**: `/program` opens with the same Python, and Run works there.
10. Reload `/blocks`. The blocks are still there.

Optional, with a built two-wheel robot whose left wheel is on A and right wheel on B: "move ↑ for 1
rotations" drives forward about one wheel turn, and "turn right 90°" turns it about a quarter to
the right. If it drives backward, its motors face the other way: swap them with "set movement
motors" (B + A). If the turn is short or long, measure the robot for "set wheel size".

### Advanced blocks checks (milestone 4)

Start over, then drag the "repeat" block (with everything in it) to the bin. Open **Advanced** in
the toolbox: Setup, Output, Input, Flow, Data and Other are there.

1. From **Advanced** › **Setup**, drag the "set up" block onto the page, then a motor, a colour
   sensor, a distance sensor and a touch sensor into it. They take ports A, D, E and F. Build:
   repeat forever, plot `distance` = distance sensor distance, plot `reflection` = colour sensor
   reflection, wait 100 ms. Run, move a hand and a sheet of paper over the sensors: both lines
   move. Stop.
2. Build: hub light red, hub display happy, beep 500 Hz for 200 ms. Run: the light turns red, the
   display shows a smile, and the hub beeps.
3. Build: wait until touch sensor is pressed, then motor run for 1000 ms. Run, then press the touch
   sensor: motor A turns for about a second.
4. Change the colour sensor's port to A, the motor's port. The block shows a warning, the page
   lists "Port A is already used", and Run is disabled. Change it back.

### Layout and live values checks (milestone 4)

These check the full-window layout and the device bar ([ADR 0009](adr/0009-live-device-values.md)).

1. Load `/blocks`. The introduction shows, then folds up after about 5 seconds; the arrow next to
   "Blocks" opens and closes it. The blocks fill the window and the page does not scroll.
2. **Python** opens the Python beside the blocks; × closes it. The **Blocks | Python** switch shows
   the Python filling the window, and back.
3. Connect. Within a few seconds the bar above the blocks shows A and B "large motor", C "medium
   motor", D "colour sensor", E "distance sensor", F "touch sensor", and the hub's tilt.
4. Turn motor A by hand: its angle changes. Hold a hand over E: millimetres, and "nothing" when
   clear. Hold coloured paper under D: the colour's name and the reflection %. Press F: newtons and
   "pressed". Tilt the hub: the tilt changes.
5. Unplug the sensor on port E: E shows "empty" within about a second. Plug it back: it returns.
6. Run the starter program. The bar says "Paused while your program runs" and greys the values.
   When the program ends, the values come back by themselves within a few seconds.
7. While values show, press the hub's centre button. The bar says "Live values were stopped on the
   hub" with **Resume**; press it, and the values return.
8. Run the starter once, wait for the values to come back, then press **Disconnect**. Press the
   hub's centre button: the starter program runs on the hub (live values did not replace it).
9. Switch **Live** off: the values disappear. Switch it on: they return.

### Blocks results

| Date       | Browser    | OS           | Hub         | Firmware | Result                                         |
| ---------- | ---------- | ------------ | ----------- | -------- | ---------------------------------------------- |
| 2026-11-05 | Chrome 156 | macOS 27.0.1 | SPIKE Prime | 4.0.1    | Checks 1 and 2 passed; 3 to 9 not yet reported |

The 2026-11-05 row uses the numbering of the list before it was reorganised (see the start of this
section): its checks 1 and 2 are simple-block checks 1 and 2 today, run then with the earlier
starter program, which turned motor A the same way.

Notes on the 2026-11-05 run (the maintainer's bench, over the HTTPS tunnel, with a screenshot and
the page's copied text). The browser and OS were not restated for this run; they are assumed to be
those of the earlier runs.

- **Checks 1 and 2:** connected, the Python matched the starter blocks, and Run worked. The monitor
  showed `angle: 38`, `127`, `218`, `307` (steps of 89 to 91 degrees, about 1 s apart), then
  `done` and "Program stopped."; the plotter's `angle` line ended at 307.
- **Checks 3 to 9** were not reported separately. They are repeated after the page layout changes
  that the maintainer asked for after this run (a larger block area, a Python panel that opens and
  closes, and live device values), and after the simple blocks were added
  ([ADR 0010](adr/0010-simple-blocks.md)): see the simple-block and advanced checks above.

## Keeping this file current

The supported and unsupported lists also live in `README.md` (copied matrix) and
`src/lib/compat/support.ts` (the message shown in the app). Change all three together. The
hardware test steps above also live in `src/lib/hwtest/session.ts`.
