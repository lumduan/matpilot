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
Program and Monitor checks. Start from the starter program (Start over).

1. Connect. The Python beside the blocks matches the blocks, and Run is enabled.
2. Run the starter program. Motor A turns a quarter turn four times, the plotter shows `angle`
   rising by about 90 each time, and the monitor ends with `done` and "Program stopped."
3. Run it again and press **Stop** in the middle. The program stops and motor A is released.
4. From **Setup**, drag a colour sensor, a distance sensor and a touch sensor into "set up". They
   take ports D, E and F. Build: repeat forever, plot `distance` = distance sensor distance, plot
   `reflection` = colour sensor reflection, wait 100 ms. Run, move a hand and a sheet of paper
   over the sensors: both lines move. Stop.
5. Build: hub light red, hub display happy, beep 500 Hz for 200 ms. Run: the light turns red, the
   display shows a smile, and the hub beeps.
6. Build: wait until touch sensor is pressed, then motor run for 1000 ms. Run, then press the touch
   sensor: motor A turns for about a second.
7. Change the colour sensor's port to A, the motor's port. The block shows a warning, the page
   lists "Port A is already used", and Run is disabled. Change it back.
8. Press **Edit as Python**. `/program` opens with the same Python, and Run works there.
9. Reload `/blocks`. The blocks are still there.

### Blocks results

| Date       | Browser    | OS           | Hub         | Firmware | Result                                         |
| ---------- | ---------- | ------------ | ----------- | -------- | ---------------------------------------------- |
| 2026-11-05 | Chrome 156 | macOS 27.0.1 | SPIKE Prime | 4.0.1    | Checks 1 and 2 passed; 3 to 9 not yet reported |

Notes on the 2026-11-05 run (the maintainer's bench, over the HTTPS tunnel, with a screenshot and
the page's copied text). The browser and OS were not restated for this run; they are assumed to be
those of the earlier runs.

- **Checks 1 and 2:** connected, the Python matched the starter blocks, and Run worked. The monitor
  showed `angle: 38`, `127`, `218`, `307` (steps of 89 to 91 degrees, about 1 s apart), then
  `done` and "Program stopped."; the plotter's `angle` line ended at 307.
- **Checks 3 to 9** were not reported separately. They are repeated after the page layout changes
  that the maintainer asked for after this run (a larger block area, a Python panel that opens and
  closes, and live device values).

## Keeping this file current

The supported and unsupported lists also live in `README.md` (copied matrix) and
`src/lib/compat/support.ts` (the message shown in the app). Change all three together. The
hardware test steps above also live in `src/lib/hwtest/session.ts`.
