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

### Undo, Save and Load checks (milestone 4)

These check undo and redo, and saving and loading programs
([ADR 0011](adr/0011-save-load-github.md)). Checks 1 to 4 need no hub and no account. Checks 5 to
8 need a GitHub account and a repository you can change (a private one is fine); they can wait.

1. Change something: tap a motor block's **A** and pick **C**. Press **↶** (top right of the
   blocks): it is **A** again. Press **↷**: **C** again.
2. Press **Save**, type the name `Test 1`, and press **Save to this computer**. The file
   `Test 1.matpilot.json` appears in Downloads.
3. Press **Start over**, then **Undo** in the green notice: your blocks come back, and **Save**
   shows the name `Test 1` again. (Before tabs, 2026-11-06, this was **↶**; see
   [ADR 0013](adr/0013-block-tabs.md), decision 7.)
4. Press **Load**, **Choose a file…**, and pick `Test 1.matpilot.json`. The blocks open, and a
   green notice says "Opened “Test 1”". Press **Undo** in the notice: the blocks you had before
   return.
5. Press **Save**, then **Set up GitHub…**. Open **How to get a token**, make a token with the link
   there (choose **Only select repositories** and your repository), and fill in the repository,
   your name and the token. **Check and save** says "Connected to …".
6. Type a note and press **Save to GitHub**. On github.com the file is in the `matpilot` folder,
   and its commit message ends "(saved by <your name>)".
7. On github.com, edit that file (any small change, for example in `savedBy`) and commit. Back on
   `/blocks`, press **Save to GitHub** again. The page says someone saved it after you opened it,
   and writes nothing. Press **Save mine as a new program**: `Test 1 2` appears on GitHub, and
   the edited file is unchanged.
8. Press **Load**: under **From GitHub**, both programs are listed. Open `Test 1 2`.

### Tabs and functions checks (milestone 4)

These check tabs and functions ([ADR 0013](adr/0013-block-tabs.md)). Checks 1 to 5, 8 to 13 and
15 need no hub; checks 6, 7 and 14 run a program of several files on the hub (first done on
2026-11-07, see the results). Use the bench layout (motors A and B as wheels).

1. Press **+** next to the tabs. A tab `tab2` opens with its name selected: type `moves` and press
   Enter. Try the name `math`: the page says it is already a name, and the tab keeps its name.
2. In `moves`, open **Functions** and drag **define my_function** onto the blocks. Tap its name and
   type `square`. Press **⊕**: an input `x` appears; tap it and type `side`.
3. Inside **define square**, put **repeat 4 times** with **move forward for … mm** and **turn
   right 90°**. From **Functions**, drag the **side** block into the move block's number.
4. Open the **main** tab. In **Functions**, under "From the tab “moves”", drag **square side 0**
   under "when the program starts" and set it to 200.
5. Open the **Python** panel: there are buttons for `main.py`, `moves.py` and `setup.py`. `main.py`
   has `import moves` and `moves.square(200)`; open the `moves` tab and the panel shows
   `moves.py`, with `def square(side):`.
6. Connect the hub and press **Run**: the robot drives a square and stops, and the Monitor shows
   no error. (A program of several files on the hub.)
7. In `moves` (in `shapes` if you did check 12 first), right-click **define square** and choose
   **Move to the tab “main”**. The main tab
   opens with the function in it, and the Python is one file again. Run: the same square. Press
   **Undo** in the green notice: the function is back in `moves`.
8. In `moves`, press **×** on the tab. The notice says the tab was closed, main's **square** block
   says the function is gone, and **Run** is off. Press **Undo** in the notice: the tab is back.
9. Press **Save**, save to this computer, press **Start over**, then **Load** that file: both tabs
   come back.
10. Reload the page: the tabs are still there, and the tab you had open is open.
11. Copy and paste between tabs: in `main`, click a block and press Ctrl+C (⌘C on a Mac). Open
    `moves`, click an empty place and press Ctrl+V: the copy appears in `moves`, near the middle.
    Then right-click a block in `moves`, choose **Copy**, open `main`, right-click an empty place
    and choose **Paste**: the copy appears where you right-clicked.
12. Cut and paste a function: in `moves`, click **define square** and press Ctrl+X. Main's
    **square** block says the function is gone. Make a tab `shapes`, click an empty place and
    press Ctrl+V: the problem is gone, and `main.py` has `import shapes` and `shapes.square(200)`.
13. Shared variables: in `main`, open **Variables** and press **Create shared variable...**; name it
    `laps`. Drag **🌐 set shared laps to 0** under "when the program starts". Open `shapes` (from
    check 12): under Variables, `laps` is there too. Put **🌐 change shared laps by 1** inside
    **define square**. The Python panel's `setup.py` has `laps = 0` under "Shared variables", and
    `main.py` and `shapes.py` use `setup.laps`. The plain **set** block's list does not offer
    `laps`. Rename `laps` from its 🌐 block in `shapes`: the blocks in `main` follow. Delete it
    there: the notice says how many blocks went, in every tab; press **Undo** in the notice.
14. With the hub: add **print 🌐 laps** at the end of the main program and press **Run**. The
    Monitor shows `1` after one square (`4` if **change shared laps by 1** is inside the repeat).
    If you then do check 7, Run once more: `1` again, from a program of one file.
15. The 🌐 blocks are a brighter pink than the plain **set**, **change** and variable blocks. In
    any tab, open **Variables** and right-click the **🌐 laps** block: the menu starts with
    **Delete the 'laps' variable** and **Rename the 'laps' variable**. Rename it to `rounds`: every
    tab follows. Delete it: if blocks in this tab use it, the page asks first; if other tabs use it,
    the notice says how many blocks went, in every tab, and **Undo** in the notice brings them
    back.

### Blocks results

| Date       | Browser    | OS           | Hub         | Firmware | Result                                                                                   |
| ---------- | ---------- | ------------ | ----------- | -------- | ---------------------------------------------------------------------------------------- |
| 2026-11-05 | Chrome 156 | macOS 27.0.1 | SPIKE Prime | 4.0.1    | Checks 1 and 2 passed; 3 to 9 not yet reported                                           |
| 2026-11-06 | Chrome 156 | macOS 27.0.1 | SPIKE Prime | 4.0.1    | All passed: simple 1 to 10, advanced 1 to 4, layout and live values 1 to 9 (notes below) |
| 2026-11-06 | Chrome 156 | macOS 27.0.1 | (none)      | —        | Undo, Save and Load checks 1 to 8 passed, GitHub ones included (notes below)             |
| 2026-11-06 | not stated | not stated   | (none)      | —        | Tabs and functions checks 1 to 5 tried; two requests came out of them (notes below)      |
| 2026-11-06 | not stated | not stated   | (none)      | —        | Tabs and functions checks 11 to 13 passed; two more requests (notes below)               |
| 2026-11-07 | not stated | not stated   | SPIKE Prime | 4.0.1    | Tabs and functions checks 6, 7, 14 and 15 passed: several files on the hub (notes below) |

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

Notes on the 2026-11-06 run (the maintainer's bench, over the HTTPS tunnel; reported in
conversation, without screenshots). The browser and OS were again not restated; they are assumed to
be those of the earlier runs.

- **All three lists passed:** the maintainer tested every check and reported no failures.
- **A beginner tried it:** the maintainer's child used the simple blocks and liked them; what they
  knew from the LEGO SPIKE app carried over directly ([ADR 0010](adr/0010-simple-blocks.md)).
- **Still open, simple check 8:** which way the drawn "up" arrow points on the hub's light matrix
  was not reported. Until it is, the orientation of the 5×5 picture on the hub is unverified.
  (➡️ The Xbox check on 2026-11-07 found the lights' top row, row 0, at the end with ports A and
  B; check 8 still has to show that a drawn picture follows it. Later that day the maintainer
  called the remaining checks OK, without saying which way the arrow pointed.)
- **Optional robot check: not run.** No two-wheel robot was built yet. From the motor turns in
  checks 5 to 7, the maintainer expects the movement blocks to be right once the wheel sizes are.

Notes on the undo, save and load run (2026-11-06, reported in conversation; browser and OS
assumed as above). Checks 1 to 4 were reported as working, and checks 5 to 8, with a GitHub
organisation, a repository and a token, as working too. No hub is needed for these checks.

Notes on the first tabs and functions run (2026-11-06, the maintainer, reported in conversation
with a screen recording that did not reach the agent; browser and OS not stated). Checks 1 to 5
were tried, and two things came out of them, both built the same day
([ADR 0013](adr/0013-block-tabs.md), decision 10):

- **Copy and paste could not go from one tab to another.** Blockly pastes into the tab the blocks
  were copied from, even when that tab is hidden. Now Ctrl+V pastes into the open tab, and the
  right-click menu has Copy and Paste (check 11).
- **A function that was cut and pasted back still showed as gone.** A pasted block gets a new id,
  and calls found their function by id only. Now a call whose function is gone finds the one
  function with its name (check 12).

The maintainer also agreed that variables belong to their tab, and asked for shared (global)
variables as well, for when one is really needed (decision 11, check 13). Checks 6 and 7 waited
for the hub (➡️ passed on 2026-11-07, see the notes on the hub run below).

Notes on the second tabs and functions run (2026-11-06, the maintainer, reported in conversation
with a screenshot; browser and OS not stated). Checks 11 to 13 worked. Two requests came out of
them, both built the same day (decision 11, check 15):

- **A shared variable could not be found to delete.** It had Delete only in its block's list (▾),
  while a plain variable is also deleted with a right-click in the Variables category. Now a
  right-click on a 🌐 block there offers Delete and Rename too.
- **The 🌐 blocks had the plain variable blocks' colour.** Now they are a brighter pink of the same
  family.

Notes on the tabs and functions run on the hub (2026-11-07, the maintainer's bench, reported in
conversation with the Monitor's text; browser, OS, hub and firmware not restated, assumed to be
those of the earlier runs). To save rebuilding the blocks, the program was a file made with the
generator for this run and opened with **Load**: `main` sets 🌐 `laps` to 0, calls `square` with
side 200 from the tab `shapes`, and prints `laps`; `square` drives the square and changes `laps` by
1 after the repeat.

- **Checks 6 and 14, in one Run:** the Monitor showed `# Program started.` at 16:27:03.147, `1` at
  16:27:11.548 and `# Program stopped.` at 16:27:11.550, with no error. This was the first program
  of several files on a hub: `main.py` imported `shapes` and `setup`, and a shared variable was
  changed in one module and read in another.
- **Checks 7 and 15** were reported done, with no failure. Asked whether the motors turned as
  described, the maintainer answered that it was done, without detail.
- **Not reported:** checks 8 to 10 (closing a tab, Save and Load of tabs, reload).

## Xbox controller check (milestone 5)

The first question of milestone 5 ([roadmap](roadmap.md#5--xbox-test-panel-with-live-telemetry)):
does the hub keep its Bluetooth link to the page while it talks to an Xbox controller? The
maintainer's earlier `pybricksdev` run (2026-08-28) says the link dropped. This check uses
MatPilot's own connection, and also answers which way "stick up" points and which way up the
hub's lights are (simple check 8). Nothing needs to be plugged in; no motor moves.

1. Turn the Xbox controller on, then hold its pair button until the Xbox logo flashes fast.
2. On **Program & Monitor** (`/program`), connect the hub, pick the example **Xbox controller
   check (no motors)**, open nothing else, and press **Run**.
3. While it searches: the hub light is blue and one row of the 5×5 lights is lit. That row is the
   lights' top. Note which side of the hub it is on (for example, "the side with ports A and B").
4. When the controller connects, the hub light turns green. Note what the page shows:
   - does the status still say the hub is connected?
   - do `left_x: … left_y: …` lines keep arriving in the monitor, and does the plotter draw them?
   - or does the page say "Connection lost"? (The program keeps running on the hub.)
5. Push the left stick away from you and hold it. One light follows the stick. Note whether it
   moves towards the side of the top row, and, if lines arrive, whether `left_y` is positive or
   negative.
6. Press the controller's **Menu** button (☰): the program ends and the lights go off. If the page
   lost the connection, press the hub's centre button instead, or Menu.

Report: the side of the top row (step 3), what the page showed (step 4), and the direction and
sign (step 5).

### Xbox controller check results

| Date       | Browser    | OS           | Hub         | Firmware | Controller | Result                                                                                      |
| ---------- | ---------- | ------------ | ----------- | -------- | ---------- | ------------------------------------------------------------------------------------------- |
| 2026-11-06 | Chrome 156 | macOS 27.0.1 | SPIKE Prime | 4.0.1    | Xbox       | Connected; the hub's Bluetooth light stayed blue (link kept, see notes); steps 3 and 5 open |
| 2026-11-07 | not stated | not stated   | SPIKE Prime | 4.0.1    | Xbox       | Passed: output kept arriving; top row at the A and B end; pairing took several tries        |

Notes (2026-11-06; a photo instead of the report; browser and OS assumed as above, controller
model not stated):

- The program connected the controller: the Xbox button lit, the hub's centre button turned
  green, and one light sat in the middle of the 5×5 lights (a centred stick).
- The hub's Bluetooth ring was blue. In Pybricks v4.0.1 a steady blue ring means a computer is
  connected; while advertising it gives two short blinks and a long pause, and otherwise it is off
  ([ADR 0012](adr/0012-controller-blocks.md) cites the source). So the link to the page most
  likely held while the controller was connected. A photo cannot tell steady from blinking, and
  whether output kept arriving (step 4) was not reported.
- Not reported: the side of the lit top row (step 3) and the sign of "stick up" (step 5). The
  controller blocks' checks below show both on the page. (➡️ Both were answered on 2026-11-07,
  see the next notes.)

Notes (2026-11-07; the maintainer, with four photos of the hub and one of the plotter; browser,
OS, hub, firmware and controller not restated, assumed to be those of the earlier runs). This run
pressed **Run** first and paired the controller afterwards, so that the lit top row could be seen
before the controller connected.

- **Step 3, the top of the lights:** the lit row is the one next to ports A and B, at the end with
  the Bluetooth button, away from the hub's yellow end. So row 0 of the 5×5 lights is the A and B
  end. (The photos show the hub with its yellow end up, so the row is at the bottom of the photo
  and the port letters there are upside down.)
- **Step 4, the link:** the hub light turned green and the plotter drew `left_x` and `left_y`
  following the stick, so the program's output kept arriving while the controller was connected.
  The link to the page held, unlike the maintainer's 2026-08 `pybricksdev` run.
- **Step 5, the stick sign:** reported as passed. In this program that means the light moved
  towards the top row, which it does only for a positive `left_y` (it draws row
  `2 - round(y / 50)`), so pushing the stick away gives a positive `left_y`. The plot agrees as far
  as it shows: `left_y` reached about +50 and more, `left_x` about -100; which push made each was
  not stated. Controller blocks check 3 shows the number on the page.
- **Pairing took several tries.** The reason was not reported. Pressing Run first leaves only
  the 30 seconds of the search for pairing; the steps above pair first, then Run. (➡️ Later the
  same day: once paired, the next Runs connected at once; see the controller blocks results.)

## Controller blocks checks (milestone 5)

These check the **Controller** blocks and the live controller view on `/blocks`
([ADR 0012](adr/0012-controller-blocks.md), with its amendment). Bench layout as before: motors A
and B stand in for a robot's wheels, C for an arm.

1. Open **Controller** in the toolbox and drag the first group ("use the controller Xbox", then
   "repeat forever" with "drive with the controller" and "A ↻ and B ↺ runs motors C ↻") under
   "when the program starts". Tap **Xbox**: the controller's picture, name and how to pair it.
2. Turn the controller on and hold its pair button until the Xbox button flashes fast. Connect the
   hub and press **Run**. The **Controller · Xbox** panel opens at the bottom: "Looking for the
   controller…" and a blue hub light, then **LIVE** and a green hub light. "Your controls" lists
   the left stick, A and B, and Menu.
3. Push the left stick away from you. The stick in the drawing moves up and "Left stick ↕" shows a
   number near **+100**; motors A and B turn the way a robot's wheels turn driving forward
   (opposite directions). Let go: they stop. Report the number's sign if it is negative.
4. Push the left stick right: A and B turn the same way (the robot turns right).
5. Hold **A**: motor C turns ↻. Hold **B**: it turns ↺. Let go: it stops and holds. The drawing
   lights A and B as you press them, and the triggers fill as you squeeze them.
6. Stop. Tap "A ↻ and B ↺", then the right stick on the picture: the block says "right stick ↕".
   Tap "C ↻", then tap **D** twice: the block reads "C ↻ D ↻", then "C ↻ D ↺" (any two motors
   that are not A or B work; a third tap on a motor takes it off). Run: the right stick turns both
   motors, in opposite directions, faster the further you push.
7. Open **Monitor**: no `@xbx` lines in it, and the page still says the hub is connected.
8. Change "one stick" to "two sticks (tank)", then to "racing", and drive with each.
9. Press **Menu** (☰): the program stops, the panel says Menu was pressed, and every motor stops.
10. Run again, then switch the controller off (hold the Xbox button for about 6 seconds): the
    panel says the controller was lost, the hub light turns red, and the motors stop.
11. With the controller off, press Run: within about 45 seconds (the hub tries twice) the panel
    says no controller was found.

### Controller blocks results

| Date       | Browser    | OS         | Hub         | Firmware | Controller | Result                                                                  |
| ---------- | ---------- | ---------- | ----------- | -------- | ---------- | ----------------------------------------------------------------------- |
| 2026-11-07 | not stated | not stated | SPIKE Prime | 4.0.1    | Xbox       | Tried ("played with it"); no failure reported; details open (see notes) |

Notes (2026-11-07; the maintainer, reported in conversation; browser, OS, hub, firmware and
controller assumed to be those of the earlier runs):

- The checks were tried after the Xbox check, and no failure was reported. Not reported: check
  3's number, and whether "two sticks (tank)" or "racing" felt better (check 8).
- **Pairing:** the first pairing took several tries, during the Xbox check. Once paired, the next
  Runs connected at once.
- **The maintainer's child** has not built a car yet. Seeing the motors turn showed them that it
  works, and they were happy with that. Their opinion of driving comes once the car exists (no
  date).

## Python editing checks (milestone 8)

These check editing a tab's Python on `/blocks` and turning it back into blocks
([ADR 0014](adr/0014-python-editing-on-blocks-page.md)). All but check 9 need no hub. Any program
works; the steps use the one from the tabs checks (main calls `shapes.square(200)`). Checks 10
to 12 came after the maintainer's first try (suggestions, help and comments), check 13 after the
second (colours).

1. Open the **Python** panel and press **Edit**. The open tab's Python appears in colour. The
   grey parts (imports, ports, devices, `try:` and `finally:`) refuse typing, and the page says
   they are made from the blocks and the devices. Under the editor: "This Python can become
   blocks." Run, Load, Start over and the other tabs wait, and the blocks cannot be moved.
2. Under Main, change `shapes.square(200)` to `shapes.square(300)` and press **Update blocks**. The
   editor closes, the block says 300, and the notice says "Updated the blocks of “main” from its
   Python." Press **Undo** in the notice: 200 is back.
3. Press **Edit** and add a line `robot.straigt(300)` under Main. It is underlined in red, and under
   the editor: "There is no block for robot.straigt(). Did you mean robot.straight()?". **Update
   blocks** changes nothing. Tap the problem: the cursor goes to it. Correct it to
   `robot.straight(300)` and press **Update blocks**: a move block appears.
4. Press **Edit** and delete a `)`: the place is marked "Python cannot read this (syntax error)."
   Press **Cancel**: the blocks and the Python are as before, and the tabs work again.
5. Press **Edit** and add, under Main:

       speed = 3
       for count in range(speed):
           robot.turn(90)

   **Update blocks**: a "set speed to 3" block (and `speed` under Variables), and a repeat block.

6. Press **Edit**. Above Main, in the Functions part, type:

       def wiggle():
           hub.light.on(Color.RED)

   and `wiggle()` under Main. **Update blocks**: a "define wiggle" block below the others, and a
   block that calls it.

7. Open the tab `shapes`, press **Edit**: the panel shows `shapes.py`. Change `robot.turn(90)` to
   `robot.turn(120)` and press **Update blocks**: the turn block says 120°.
8. Try a mistake a beginner makes: `print(speeed)` under Main says there is no variable
   "speeed", with an example of how to set one.
9. With the hub: press **Run** after an update. The program does what the new blocks say.
10. Suggestions: on a new line under Main, type `robot.`. A list opens: straight, turn, brake,
    drive. Beside the chosen one, a help box says what it does, the block it becomes
    ("move forward for … mm") and an example. Press Enter: `robot.straight(200)` appears with
    200 selected, so typing a number replaces it. Ctrl+Space on an empty line lists your
    variables, functions and tabs, and `print`, `wait`, `for`, `if` and more.
11. Help: rest the pointer on `straight` (or `print`, `square`, `Color.RED`). The same help box
    opens.
12. Comments: above a line under Main, type `# go forward a bit`, and at the end of another line
    `# turn here`. **Update blocks**: both are still there, above their lines, and the blocks
    show a comment bubble (right-click a block, Add Comment, does the same from the blocks).
13. Colours: the Python panel, the **Python** view and the editor colour the code as VS Code does
    (purple `import`/`if`/`for`, blue `def`/`True`, orange text, green numbers and comments,
    yellow functions, teal `Color`/`setup`, light blue names, brackets by depth), in the light
    and the dark theme.

### Python editing results

| Date       | Browser    | OS         | Hub    | Firmware | Result                                                                       |
| ---------- | ---------- | ---------- | ------ | -------- | ---------------------------------------------------------------------------- |
| 2026-11-07 | not stated | not stated | (none) | —        | Checks 1 to 9 tried, no failure reported; two requests (notes), now 10 to 12 |

Notes (2026-11-07; the maintainer, reported in conversation): the checks were tried. Two
requests came out of them, both built the same day
([ADR 0014](adr/0014-python-editing-on-blocks-page.md), amendment): suggestions with help, as in
an editor such as VS Code, because a beginner does not know the names (checks 10 and 11); and a
way to leave comments in the Python (check 12). On the second try, checks 10 to 12 worked well,
and the maintainer asked for the colours of VS Code and similar editors, in the editor and in the
read-only Python panel too (check 13).

## AI helper checks (milestone 9)

These check the AI helper on `/blocks` ([ADR 0015](adr/0015-ai-helper.md)) with a real key. No hub
is needed. An adult does checks 1 and 2. A key is never sent to anyone but its provider, so these
are the only checks with a real provider: the automated tests answer with a fake one. Any
program works; the steps use the one from the tabs checks (main calls `shapes.square(200)`).

1. Press **AI helper** at the bottom right. The panel says an adult sets it up first, and nothing
   is sent. Press **Set up (for adults)**, choose **Anthropic (Claude)**, paste a key, and press
   **Check the key and list models**: the dialog says the key was accepted and how many models
   there are, and the **Model** list shows them. Choose one, tick **Turn the AI helper on**, set
   **Questions a day**, and **Save**.
2. Repeat with **DeepSeek** and its key. Leave **Remember the keys** unticked: after closing the
   browser tab and opening `/blocks` again, the panel asks for the key again.
3. Choose **Explain**, leave the prompt empty, and press **Ask the AI**. The answer is marked
   "Answer from an AI", with the provider and the model, and it explains the program in steps,
   naming blocks (for example "move forward for … mm"). Under it: the tokens used, and "1 of N
   questions left today" goes down by one.
4. Type a prompt in Thai, for example `ทำไมหุ่นไม่หยุด อยากให้หยุดหลังวาดสี่เหลี่ยม ช่วยใบ้หน่อย`. The
   checklist ticks its items as you type. The answer comes in Thai (with "Answers in: the
   language of the question").
5. Choose **Review** and press **Ask the AI**. The answer points at lines as **Line N** buttons,
   with hints rather than the fixed code. Press one: the Python panel opens with that line
   marked.
6. Open **What the AI sees**: it shows the fixed instructions, the program with numbered lines,
   and the prompt last. It contains no key.
7. Ask something that is not about the robot, for example about a film. The AI declines kindly
   and suggests a question about the program.
8. Press **Yes** under "Did this help?", then open **Your earlier prompts**: the prompts are
   listed with their answers, and **Use this prompt again** puts one back in the box.
9. With the daily limit reached, **Ask the AI** is greyed out.
10. With a wrong key (type one letter wrong and save), asking says the key was not accepted.

### AI helper results

| Date       | Browser    | OS         | Provider and model                   | Result                                                  |
| ---------- | ---------- | ---------- | ------------------------------------ | ------------------------------------------------------- |
| 2026-11-07 | not stated | not stated | Anthropic (Claude), model not stated | Passed with Claude. DeepSeek (check 2) not reported yet |

Notes (2026-11-07; the maintainer, reported in conversation): "tried, passed with Claude". The
browser, the operating system, the model and which of the ten checks were done one by one were not
stated. DeepSeek is still to be tried.

## Robots checks (milestone 7)

These check the Robots page and a program that uses a robot
([ADR 0016](adr/0016-robots-and-mats.md), step 7a, and its calibration helper). Checks 1 to 6 and
8 need no hub; checks 7 and 9 need the hub and the robot, and a ruler or a tape measure.

1. Open **Robots** in the top bar and press **Make a robot**. Measure your robot and type in its
   width, length and height, how far the wheel axle is from the back, the wheel diameter (the
   number on the tyre), the wheel width, the axle track (middle of one wheel to the middle of
   the other), the drive ports, and which motor is mounted turned round. The drawing on the right
   looks like your robot seen from above, front up.
2. Under **Speed**, "Work it out" shows the speeds the hub uses by default for these motors and
   wheels (195 mm/s and 167 °/s for 56 mm wheels 112 mm apart). The numbers on the right show the
   footprint, the circle the robot needs to turn on the spot, and the top speed.
3. With **WRO 2026 RoboMission, Elementary**, the checks say whether the robot fits the 250 mm
   cube and the start area; move the slider to see the start area at an angle. Type the mass to
   check the weight. **Where these come from** quotes the rules.
4. Add the colour sensor where it is (ahead of the wheels, left or right of the middle): a C
   appears in the drawing at that place. Type a wrong value (an axle track of 5): it turns red
   and says what to type.
5. **Save robot file**, then **Load robot file** with that file: the page opens the same robot and
   does not make a second one.
6. Open **Blocks**. At the end of the tab row, **Robot**: choose yours. In the Python (the
   `setup.py` file when the program has tabs), Config says `# The robot “…” (the Robots page).`,
   with its ports and wheel sizes. Change something on the Robots page and come back:
   **Update** appears beside the choice.
7. With the hub and the robot: a program with "move forward 200 mm", then "turn right 90°". Run
   it and measure. If it drives a different distance, make the wheel diameter
   `diameter × measured / 200` on the Robots page (190 mm with 56 mm wheels gives 53.2) and
   press **Update** on Blocks. Then, if the turn is off, make the axle track
   `track × 90 / measured angle` (80° with 112 mm gives 126). Run again: it should be close.
8. GitHub (with the GitHub set up on Blocks): **Save**, then **Save to GitHub**: the robot goes
   into the same folder as the programs. **Load** lists it under **From GitHub**.
9. The calibration helper (check 7 done for you), with the hub, the robot and a tape measure:
   **Measure on the floor…** on the Robots page. **Connect hub**, then under **1. Drive 1 metre**
   mark the floor at the robot's front, **▶ Run on the robot**, and type how far it drove (and,
   if you like, how far to the side it ended). Under **2. Turn 10 times**, line it up with an
   edge, run it, count the turns, and say where it stopped (before or past the way it started,
   by how many degrees: make the picture look like the robot). **Use these numbers**: the wheel
   diameter and the axle track change on the page. Run both again: it should now drive about
   1000 mm and end pointing about the way it started. Note the numbers before and after.

## Mats checks (milestone 7)

These check the Mats page ([ADR 0016](adr/0016-robots-and-mats.md), step 7b) with your own mat. No
hub is needed. Have the competition's printing PDF for the mat (for WRO 2026, the Elementary game
mat's printing file from the WRO website) and a robot made on the Robots page.

1. Open **Mats** and press **Add a mat**. Choose the PDF. The dialog says its real size and where
   it came from; for the WRO 2026 Elementary mat, 2362 × 1143 mm from the trim box. Choose
   **WRO 2026 RoboMission, Elementary** under Rules and press **Add the mat**. The mat appears in a
   few seconds, looking like the printed one, with a 100 mm grid over it.
2. Move the pointer over the mat: the corner shows x and y in mm, 0, 0 being the bottom-left
   corner. Zoom with the wheel (two fingers on a phone), drag to look around, **Fit** to see it
   all.
3. Choose **Area** and drag a rectangle over the start area printed on the mat: it is drawn and
   listed as "Start". Its size shows under it (WRO's is about 250 × 250 mm).
4. Under **Robot**, choose your robot: it appears in the start area, facing right. The checks say
   "On the mat ✓" and "Wholly inside “Start” ✓". Drag it out of the start area: the second check
   turns ✗. **Put it in the start area** brings it back.
5. Drag the round handle in front of the robot to turn it; type 45 in **Facing**: a robot near
   the 250 mm limit no longer fits the start area.
6. Choose **Ruler** and drag between two marks on the mat whose distance you know (the rules or a
   tape measure on the printed mat): the distance shows in mm.
7. Reload the page: the mat, the area and the robot are still there. **Save**, then **Save to
   this computer**; **Load**, then **Choose a file…** with it: a second copy of the mat opens.
8. GitHub (with the GitHub set up on Blocks): **Save**, then **Save to GitHub**. The dialog names
   the same repository and folder as on Blocks, without asking for anything again; if the
   repository is public it asks for a tick first. The full WRO mat (about 13 MB) appears in the
   folder on github.com. **Load** lists it under **From GitHub**: open it, and a copy of the mat
   opens.

## Running a program on a mat (milestone 7)

These check steps 7c and 7d ([ADR 0016](adr/0016-robots-and-mats.md)). No hub is needed for 1
to 4, 6, 8 and 9; 5 and 7 compare with the real robot.

1. On **Blocks**, make a short program: move forward 300 mm, turn right 90°, move forward
   200 mm. Choose your robot in **Robot**.
2. Open **Mats**, place the robot (facing right, 0°). Under **Run a program on the mat** the
   program is "On the Blocks page: …". Press **▶ Run on the mat**: in a moment the page says how
   long it took, draws the path in red, and plays it back; the robot ends 300 mm right and 200 mm
   down from where it started, facing down (−90°).
3. Drag the slider under the mat: the robot stands where it was at that moment. Try 4×.
4. Add `print` blocks: what they print shows under the run, with the time. Make a program that
   drives forever: it stops at 120 s (WRO's 2 minutes), and the motors stop.
5. Run the same program on the real robot on the real mat, from the same start. Compare where it
   ends with the simulation. A big difference usually means the wheel size or the axle track on
   the Robots page is off: the Robots checks show how to measure them.

Checks 6 to 9 are step 7d (sensors read the mat). The robot needs its colour sensor on the Robots
page, looking down, at the port the program uses.

6. On **Blocks**, make: start moving forward; wait until the colour sensor's reflection is below
   30; stop; print the distance driven. On a mat with a black line ahead of the robot, Run on the
   mat: it stops on the line, and the printed distance is about the line's distance from the
   sensor.
7. Print the colour the sensor sees over a red, a green, a blue and a white part of the mat: the
   page should say the same colours as the real robot over the same places. Reflection numbers
   will differ from the real sensor (the page guesses them from the picture): note both.
8. Draw an area and make it a **Solid object**. With a distance sensor looking forward, print its
   distance with the robot facing the object: the distance from the sensor to the object, in mm.
   Drive into it: the result says "Ran into …" (the robot drives through; it does not stop).
9. Change the program's colour sensor to a port where the robot has none: the result names the
   missing sensor, and the sensor reads nothing.

### Mats results

| Date       | Browser    | OS         | Mat                                             | Result                                                       |
| ---------- | ---------- | ---------- | ----------------------------------------------- | ------------------------------------------------------------ |
| 2026-11-07 | not stated | not stated | WRO 2026 Elementary printing PDF (the real one) | Checks 1 to 7 tried, "works"; asked for GitHub (now check 8) |

Notes (2026-11-07; the maintainer, reported in conversation): tried with the real WRO 2026
Elementary PDF and it works. They asked for Load and Save on GitHub on the Mats page (and every
page), using the GitHub already set up for programs; built the same day (ADR 0016, amendment), so
check 8 is new.

### Robots results

| Date | Browser | OS  | Hub | Firmware | Result |
| ---- | ------- | --- | --- | -------- | ------ |

## Keeping this file current

The supported and unsupported lists also live in `README.md` (copied matrix) and
`src/lib/compat/support.ts` (the message shown in the app). Change all three together. The
hardware test steps above also live in `src/lib/hwtest/session.ts`.
