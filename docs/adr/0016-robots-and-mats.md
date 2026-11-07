# ADR 0016: Robots and Mats: robot profiles, mats at real size, and running a program on a mat

- Status: Accepted 2026-11-07, every recommended option. Steps 7a and 7b built the same day (see "Built")
- Date: 2026-11-07
- Replaces: the one-line plan for milestone 7 ("Mat profiles with drag-and-drop objects") in
  [docs/roadmap.md](../roadmap.md)
- Builds on: [ADR 0004](0004-millimetre-units.md) (millimetres, which this ADR completes for angles
  and time), [ADR 0008](0008-block-editor.md) and [ADR 0010](0010-simple-blocks.md) (the drive base
  the blocks make), [ADR 0011](0011-save-load-github.md) (program files and GitHub),
  [ADR 0014](0014-python-editing-on-blocks-page.md) (every program is blocks)

## Context

On 2026-11-07 the maintainer asked for a plan, in their words:

- the bar at the top has **Blocks**; add **Robots** and **Mats**;
- in **Mats**, choose a robot made in **Robots** and run it on a mat;
- every robot has clear dimensions (width, length, height), because turns and angles are computed
  from them, plus the wheel size, the speed per second (when typed in by hand), and anything else
  that is needed;
- later, build the robot from LEGO parts, like BrickLink's tools or other sites that build a robot
  from parts;
- in **Mats**, upload a real-size PDF and test the robot on it.

They pointed at their earlier project, [lumduan/wro-2026](https://github.com/lumduan/wro-2026)
(MIT, same author as MatPilot), and asked to reuse what fits.

### What wro-2026 is, and what MatPilot can reuse

Read on 2026-11-07 at commit `46d8f28`. It is a Python analysis toolchain for a WRO 2026
RoboMission Elementary team, with no web page. It measures the official mat PDF, models the field
and the scoring, and estimates what a robot must achieve. Useful here:

| From wro-2026                                                       | Use in MatPilot                                                                                                                                                                                                                     |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md` §5.2, units and frames                                  | The MAT frame: origin at the mat's bottom-left corner, `+X` right, `+Y` up, heading `0° = +X`, counter-clockwise positive. A robot's pose `(x, y, θ)` is taken at the midpoint between its drive wheels. Adopted as is (section 2). |
| `tools/pdf_extract.py`, `docs/EXTRACTION_REPORT.md`                 | How to read a mat PDF's real size: the page's TrimBox (else CropBox, else MediaBox), in points of 1/72 inch, so mm = pt × 25.4 / 72, and the page rotation.                                                                         |
| The same report, on the WRO 2026 Elementary mat                     | A test target: its TrimBox is 6695.43 × 3240 pt, which is **2361.999 × 1143.000 mm**; one page, vector artwork (50,479 paths) with 4,448 small images, CMYK, 9.4 MB. MatPilot must read the same size from it.                      |
| `sim/geometry.py`                                                   | Oriented rectangles and the separating-axis test (a footprint wholly inside an area, or touching one), ported to TypeScript for "is the robot inside the start area" and "did it leave the mat".                                    |
| `docs/PHASE7_CONSTRAINTS.md` §1 and §2, `docs/citations.json`       | The WRO robot limits, quoted with rule numbers, and the start-area check for a robot turned by θ: `w·cos θ + l·sin θ ≤ 250` and `w·sin θ + l·cos θ ≤ 250` (mm).                                                                     |
| `docs/FIELD_TEST_PLAN.md` P3 (odometry drift per metre and per 90°) | Optional robot fields for a later "how sure is the robot" view: the spread of where the real robot may end, not just one line.                                                                                                      |
| `robot/robot_io_spike.py`                                           | A reminder confirmed by MatPilot's own citations: Pybricks turns clockwise for a positive angle, so the MAT frame (counter-clockwise positive) negates it at the boundary.                                                          |

Not reused: the scoring model, the travel and strategy models, and the WRO documents themselves.
wro-2026 does not commit the WRO PDFs (they are © World Robot Olympiad Association), and MatPilot
must not ship them either: a user uploads their own copy.

The WRO rule values used below come from wro-2026's quotes of the _WRO 2026 RoboMission General
Rules_, version January 15th 2026 (sha256 `90a28d8b…`, re-checked there on 2026-07-27):

- §5.1, p6: "maximum robot dimensions before the robot starts a run are 250mm x 250mm x 250mm";
- §10.1, p13: "Each robot attempt is 2 minutes";
- §7.8, p10: the start area "is exclusively the white area within a coloured border".

### What MatPilot has today

- The simple blocks build one drive base from "set movement motors" (default ports A and B) and
  "set wheel size" (default 56 mm wheels, 112 mm axle track) ([ADR 0010](0010-simple-blocks.md),
  `src/lib/blocks/generator.ts`).
- The Pybricks facts a simulation needs are already cited in `src/lib/blocks/pybricks.ts`, at
  pybricks-micropython v4.0.1 (`4104553405decb0384bcfb030fbfcb4b5a9854cc`): the drive base's
  sizes, `straight`/`turn`/`drive`, a positive turn being clockwise, `settings()`, and the default
  speeds (40 % of the top speed straight, 33 % turning).
- New for this ADR, at the same commit: SPIKE Prime's medium and large motors are treated as the
  Technic M and L angular motors
  ([servo_settings.c#L340-L346](https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/src/motor/servo_settings.c#L340-L346)),
  whose rated top speed is 1000 °/s
  ([servo_settings.c#L300-L315](https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/src/motor/servo_settings.c#L300-L315)).
  So a robot's default speeds follow from its wheels: with 56 mm wheels the wheel's top speed is
  1000 × π × 56 / 360 ≈ 489 mm/s, and the default straight speed 40 % of that, about 196 mm/s.
  The drive base takes the slower motor's limits and makes its default speeds 40 % (straight) and
  33 % (turning) of the top speed, in its own units
  ([drivebase.c#L64-L78 and #L105-L108](https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/src/drivebase.c#L64-L108));
  how a motor's degrees become the drive base's millimetres and degrees, and its accelerations,
  are checked line by line when this is built and cited where the code uses them.

### Libraries checked on 2026-11-07

| Need                   | Candidate                                              | Licence    | Size (gzipped)                                                         | Notes                                                                                                                        |
| ---------------------- | ------------------------------------------------------ | ---------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Draw a PDF in the page | `pdfjs-dist` 6.5.438 (Mozilla pdf.js)                  | Apache-2.0 | about 133 KB, plus a 370 KB worker, plus WebAssembly decoders and data | Self-hosted like Blockly's media. Has a colour-management module for CMYK mats like WRO's. Loaded on the Mats page only.     |
| Run Python in the page | `@micropython/micropython-webassembly-pyscript` 1.29.0 | MIT        | about 199 KB WebAssembly plus a 110 KB loader (before gzip)            | MicroPython's own WebAssembly port: `runPython`, a file system for the program's files, JavaScript modules. In a Web Worker. |

Both fit the CSP that exists: workers and WebAssembly from this site (`'self'`,
`'wasm-unsafe-eval'`). No new origin is needed. pdf.js is used with its `eval` path off. Whether
any part of either needs `blob:` URLs is checked when building; if it does, that is a CSP change
reported before it is made.

## Proposal

### 1. Pages

The bar at the top of the full-window pages gets three places: **Blocks · Robots · Mats** (on a
phone, a menu). Robots and Mats are full-window pages like Blocks, in the `(studio)` group.

    ┌ MatPilot  [Blocks] [Robots] [Mats] ─────────────────────────────── Connect hub ┐
    │ Robots: [Rover 1 ▾] [+ New] [Copy] [Delete]                                     │
    │ ┌ top view, to scale ──────────────┐  Body      width 160  length 200  height 120 │
    │ │        front ▲                   │  Wheels    diameter 56  width 14  track 112  │
    │ │   ┌──────────────────┐           │  Axle      84 mm from the back              │
    │ │   ██      ●       ██  ← wheels   │  Motors    left A ↺   right B ↻   type L    │
    │ │   │   ○ colour C    │            │  Sensors   colour C (40 ahead, 0 left) ...  │
    │ │   └──────────────────┘           │  Speed     auto: about 196 mm/s     [edit]  │
    │ │  turning circle ◯ r = 141 mm     │  Checks    fits 250 mm cube ✓, start 0° ✓   │
    │ └──────────────────────────────────┘                                            │
    └─────────────────────────────────────────────────────────────────────────────────┘

    ┌ MatPilot  [Blocks] [Robots] [Mats] ─────────────────────────────────────────────┐
    │ Mat: [WRO 2026 Elementary ▾] [Upload PDF or image]   Robot: [Rover 1 ▾]          │
    │ ┌ the mat at real size: zoom, pan, mm grid ───────────────────────────────────┐ │
    │ │  ▭ start area                     ╭──→ path of the run                     │ │
    │ │  [robot]─────────────────────────╯                                          │ │
    │ └─────────────────────────────────────────────────────────────────────────────┘ │
    │ ▶ Run "main" on the mat   ⏸  ⏮  time ━━━━●━━━━ 12.4 s / 120 s   x 812 y 305 θ 90° │
    └─────────────────────────────────────────────────────────────────────────────────┘

### 2. Frames, units and angles (completes ADR 0004)

- Lengths in millimetres, angles in degrees, times in seconds in the models (milliseconds only
  where Pybricks uses them, converted at the boundary and cited).
- **MAT frame** (from wro-2026): origin at the mat's bottom-left corner, `+X` right, `+Y` up,
  heading `0° = +X`, counter-clockwise positive. The screen's `+Y` points down; that flip happens
  only where the mat is drawn.
- **ROBOT frame:** origin at the midpoint between the drive wheels (the point the robot turns
  around), `+X` forward, `+Y` to the robot's left. A robot's pose on a mat is `(x, y, θ)` of that
  point.
- Pybricks turns clockwise for a positive angle (cited in `pybricks.ts`), so a turn of `+90` in a
  program is `θ − 90°` in the MAT frame.

### 3. Robots

A robot profile, saved in this browser and as a `.matpilot-robot.json` file:

| Group        | Fields                                                                                                                                                                                   | Why                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Name         | name; notes                                                                                                                                                                              |                                                                                       |
| Body         | width, length, height (mm); the axle's distance from the back (mm)                                                                                                                       | The footprint drawn on the mat, the turning circle, the size checks                   |
| Wheels       | diameter, width (mm); axle track: centre to centre of the two wheels (mm)                                                                                                                | Distance and turning, exactly as `DriveBase(…, wheel_diameter, axle_track)` uses them |
| Drive motors | left and right ports; which one is mounted turned round; the motor type (SPIKE large, medium)                                                                                            | The top speed (1000 °/s for both, cited above) and the ports the blocks use           |
| Other motors | port and a name each ("arm", "claw")                                                                                                                                                     | Names in the blocks; shown, not moved, on the mat at first                            |
| Sensors      | type (colour, distance, force), port, position in the ROBOT frame (mm), facing (down, forward, …)                                                                                        | Where the colour sensor reads the mat; drawn on the robot                             |
| Speed        | **auto** (from the motor and the wheels, by the firmware's own rules) or **typed in / measured**: straight speed (mm/s), acceleration (mm/s²), turn rate (°/s), turn acceleration (°/s²) | The run on the mat takes as long as the real one                                      |
| Optional     | mass (g); drift per metre (mm) and per 90° (°), measured                                                                                                                                 | Rules that limit weight; later, the spread of where the real robot may end            |

Shown, computed, never typed:

- mm per wheel degree, and the top and default speeds;
- the **turning circle**: the farthest corner from the turning point, which is the room the
  robot needs to turn on the spot;
- the size checks of a chosen **rules profile** (D9): for WRO 2026 RoboMission, fits the
  250 × 250 × 250 mm envelope (§5.1), and fits the 250 mm start area at a chosen heading;
- a calibration helper, later in this milestone: MatPilot makes two short programs (drive
  1000 mm; turn ten times), the child runs them and types what they measured, and MatPilot
  corrects the wheel diameter and the axle track. A ruler beats a typed guess.

The profile is the **contract** that the Mats page reads, and that a future part builder (section 7) would write. Building it first wastes nothing.

### 4. A program uses a robot

- On `/blocks`, a **Robot** choice beside the tabs. The program file (version 3) keeps a copy of
  the chosen robot, so a teammate who loads the program from a file or GitHub gets the robot too.
- The generator takes the drive ports, wheel diameter and axle track from the robot. The
  existing "set movement motors" and "set wheel size" blocks stay, and override the robot when a
  program has them (the page says so). Programs with no robot work as today.

### 5. Mats

- **Upload a PDF** (the real size comes from the file's TrimBox, as wro-2026 measures it) or
  **an image** (PNG, JPEG; its size typed in, in mm). A PDF with several pages asks which page.
- The PDF is drawn once, in the page, to a picture of a fixed resolution (about 2 pixels per mm,
  lower when a phone's canvas limit needs it), and kept in this browser with the PDF (IndexedDB:
  a WRO mat is about 9.4 MB). Nothing is uploaded anywhere.
- The mat view: zoom and pan, a millimetre grid, the MAT frame's coordinates under the pointer, a
  ruler (distance and angle between two points), and areas the user draws (start area, targets,
  "keep out") with a name each.
- **Place the robot:** drag it, turn it by a handle, snap it to a start area; the pose shows as
  `x, y, θ`, and the start-area check turns red when the footprint leaves the area.
- Mats are kept in this browser and saved and loaded as files. They are **not** saved to GitHub
  by default: a WRO mat is © WRO and a team repository may be public, and the files are large.

### 6. Run a program on a mat (simulation)

- **The same Python the hub runs**, run by MicroPython (WebAssembly) in a Web Worker, with a
  simulated `pybricks` package in place of the firmware. It implements only the names the
  generator uses (the list in `pybricks.ts`), each following the cited firmware behaviour:
  `DriveBase.straight`/`turn` with speed ramps from `settings()`, `drive`, `stop`, `brake`, motor
  angles, `wait`, `StopWatch`, `print`.
- **Virtual time.** The program runs as fast as the computer can; every waiting call moves a
  virtual clock, and each Pybricks call costs a small fixed step, so a loop that only reads a
  sensor still moves time on. The run stops at the rules profile's time limit (WRO: 2 minutes,
  §10.1) or when the program ends. A program stuck with no Pybricks call is stopped after a few
  seconds of real time.
- **The result is a timeline:** the pose over time, the motors, what was printed, each sensor
  reading. The page plays it back on the mat: play, pause, a time slider, the robot's footprint,
  its path, and warnings: left the mat, entered a "keep out" area, time ran out, ended outside
  the target.
- **Honest about what it is:** a kinematic model. The robot moves exactly as told: no slipping,
  no bumping into objects, no battery. The page says so, and the calibration helper and the drift
  fields (later) narrow the gap.
- **Sensors, in a second step:** the colour sensor reads the mat picture under its position
  (reflection and colour from the pixels, with Pybricks' colour rules cited when built). Distance
  sensors and objects on the mat come later.
- Blocks that need a real device and have no simulation yet (the Xbox controller, for one) end
  the run with a clear message. Later, a controller plugged into the computer (the browser's
  Gamepad API) could drive the robot on the mat live.

### 7. Later: building the robot from parts

A part builder like BrickLink's is a large project of its own: a library of part shapes in 3D, a
3D view, snapping parts together, and working out the wheels, the sensors and the size from the
model. It gets its own ADR after research into the open part library LEGO builders use (LDraw: its
licence, file formats, and size) and into what can be imported from BrickLink's tools. Its output
is a robot profile (section 3), so everything above keeps working.

### 8. Order of work

```
7a Robots page + profiles ──┬──→ 7c Run on a mat ──→ 7d Colour sensor from the mat
                            │          ▲
7b Mats page ───────────────┴──────────┘
   (upload, view, place, measure)
7a + Blocks ──→ program uses a robot (part of 7a)
later: draw a path on the mat → blocks;  how sure is the robot (drift);  part builder (own ADR)
```

## Decisions for the maintainer

- **D1, pages:** Blocks · Robots · Mats in the top bar, as asked (recommended).
- **D2, robot fields:** the fields in section 3 (recommended). Anything to add or drop?
- **D3, speed:** **auto** from the motor and the wheels by the firmware's rules, which you can
  replace with numbers typed in or measured; plus the calibration helper (recommended).
- **D4, programs and robots:** a program chooses a robot and its file keeps a copy; the "set
  movement motors" and "set wheel size" blocks still override it (recommended).
- **D5, mats:** PDF at real size, and images with the size typed in; kept in this browser and as
  files, not on GitHub by default (recommended). (Changed 2026-11-07: mats, like robots, can be
  saved to GitHub; see the amendment.)
- **D6, simulation engine:**
  - (a) the same Python as the hub, run by MicroPython in the page with a simulated Pybricks
    (recommended: one truth, whatever blocks or Python wrote it);
  - (b) a new interpreter of the blocks in TypeScript (easier to light up the running block, but a
    second copy of what every block means, which can drift from the generator).
- **D7, first simulation scope:** the drive base, motors as numbers, time limit, leaving the mat
  and the areas; the colour sensor next; distance sensors and objects later (recommended).
- **D8, order:** 7a → 7b → 7c → 7d as in section 8; the part builder later with its own ADR
  (recommended).
- **D9, rules profiles:** an optional rules profile per mat; the first is WRO 2026 RoboMission
  (250 mm envelope, 250 mm start area, 2-minute run), its values quoted with rule numbers
  (recommended). Others (school games, FLL) can be added the same way.

## Decision

The maintainer accepted every recommended option on 2026-11-07 (D1 to D9). On D2, in their
words: build the fields as recommended first; using them will show what to add or drop.

## Built (2026-11-07): step 7a, the Robots page and a program that uses a robot

- **Pages:** `/robots` beside `/blocks`; the top bar has **Blocks · Robots** (Mats comes with
  7b), as links on a wide screen and a small menu on a phone (`src/components/StudioNav.tsx`).
- **Robot profiles** (`src/lib/robots/profile.ts`): every field of section 3, kept in this browser
  (`src/hooks/useRobots.ts`, `matpilot.robots.v1`) and saved and loaded as
  `.matpilot-robot.json` files. A loaded robot that is already here is opened, not added twice.
  Every change is kept at once; a value out of range is marked in red with what to type, and
  such a robot cannot be chosen for a program until it is fixed.
- **Speeds** (`src/lib/robots/motion.ts`): auto, by the firmware's rules, each cited at v4.0.1:
  top speed from the motor's rating, 2000 °/s² motor acceleration, the drive base's ¾ of it, its
  40 % and ⅓ defaults, and the mm and degree scales. With SPIKE motors, 56 mm wheels and a 112 mm
  axle track: 195 mm/s and 733 mm/s² straight, 167 °/s and 750 °/s² turning, top 489 mm/s and
  500 °/s. "Type it in" starts from those numbers.
- **Shape and checks** (`src/lib/robots/shape.ts`, `rules.ts`): the footprint of body and wheels,
  the turning circle (152.6 mm for the default robot), and the WRO 2026 RoboMission Elementary
  checks (250 mm cube, the start area at a heading from 0° to 90°, 1.5 kg, 4 motors), each with
  its quoted rule. `src/lib/geometry/rect.ts` is the port of wro-2026's oriented rectangles,
  ready for the mats.
- **The drawing** (`src/components/robots/RobotDrawing.tsx`): to scale, front up, with the
  wheels, the turning point, the sensors and the turning circle.
- **A program uses a robot (D4):** a **Robot** choice at the end of the tab row on `/blocks`. The
  program's meta keeps a copy of the robot (so Undo, Save, Load and GitHub carry it), and the
  program file becomes version 3 only when it has a robot. The generator takes the drive ports,
  wheel diameter, axle track and which motor is mounted turned round from the robot; "set
  movement motors" and "set wheel size" in the program still win, and the choice says "blocks
  win" when they do. When the robot changes on the Robots page, the choice offers **Update**; a
  program loaded with a robot that is not here offers **Keep**.
- **Decided while building:**
  - a program file saved before robots keeps the robot chosen in this browser (a family usually
    has one robot), instead of dropping it;
  - Start over keeps the robot: a new program for the same robot;
  - the other motors' names are kept and shown on the Robots page; the blocks do not use them
    yet;
  - the calibration helper (section 3) is not built yet.
- **Tests:** unit tests for the profile, its file, the speeds (against the firmware's numbers
  above), the shape, the checks, the geometry, the generator with a robot (compiled with the
  real compiler), and the program file and meta with a robot. Headless Chromium on the production
  build: make and edit a robot, the checks, file save and load, the nav, choosing the robot on
  `/blocks` (the drive base in `setup.py` follows it, it survives a reload, **Update** works), a
  program file saved with it (version 3), phone width with no sideways scroll, and the dark
  theme.

## Built (2026-11-07): step 7b, the Mats page

- **Page:** `/mats`, and **Mats** in the top bar. The mat fills the window; a panel beside it
  (below it on a phone) holds the mat, the robot and the tools.
- **Adding a mat** (`src/hooks/useMats.ts`, `src/components/mats/AddMatDialog.tsx`): a PDF's real
  size comes from its TrimBox, read from the file's bytes when written as plain text, else from
  the page pdf.js shows (`src/lib/mats/pdf-box.ts`); a page with a bleed is cut to the trim box. A
  PDF with several pages asks which. A picture (PNG, JPEG, WebP) gets its width typed in, the
  height following its shape. The dialog says where the size came from, and the page shows it.
- **pdf.js** (`src/lib/mats/picture.ts`): `pdfjs-dist` 6.5.438, loaded only when a mat is added or
  read from a file. Its worker, WebAssembly decoders, ICC profile and character maps are copied to
  `out/vendor/pdfjs/` by `scripts/vendor-assets.mjs`, with their licences; `verify-export.mjs`
  requires the worker. Decided while building:
  - the worker is served as `pdf.worker.min.js`, not `.mjs`, because some static hosts (this
    project's own preview, nginx) serve `.mjs` as plain bytes, which browsers refuse for a
    module worker;
  - pdf.js's standard fonts are not served (some are under a GPL-based licence); fonts a PDF names
    without carrying are drawn with the computer's own, which a mat's pictures do not need;
  - pdf.js 6 has no `eval` path, and its script engine is not served.
    No CSP change was needed: the worker and the decoders come from this site.
- **The picture** is drawn once at 2 pixels per mm (less when it would pass 16 million pixels),
  kept as a PNG in IndexedDB with the source file (`src/lib/mats/store.ts`), so reopening is
  fast and a colour sensor can read exact colours later.
- **The view** (`src/components/mats/MatView.tsx`): the picture on a canvas, and over it, in the
  MAT frame, a 100 mm grid, the areas, the robot, and a ruler. Drag the mat to move it, wheel or
  two fingers to zoom, **Fit** to see it all; the pointer's x and y in mm show in a corner.
  Tools: **Move** (drag the robot, or turn it by its round handle; 1° steps, 15° with Shift),
  **Ruler** (distance and angle), **Area** (draw a rectangle: the first is the start area, the
  next ones targets; each can be renamed or made a keep-out area). With the keyboard: arrows move
  the robot 1 mm (10 with Shift), `[` and `]` turn it.
- **The robot on the mat** (`src/lib/mats/pose.ts`): chosen from the Robots page (only robots
  with no problems); placed in the start area if there is one; its pose as x, y and facing; checks
  "on the mat" and "wholly inside the start area" (body and wheels, with the oriented-rectangle
  test); **Put it in the start area** centres its outline there.
- **Files:** a `.matpilot-mat.json` holds the description and the source file (base64), so the
  mat can be drawn again elsewhere; a WRO mat's file is about 13 MB. Mats are not saved to GitHub
  (D5).
- **Not built yet:** running a program on the mat (7c), the colour sensor (7d), objects on the
  mat, and turned areas (areas are square to the mat's edges).
- **Tests:** unit tests for the PDF size rules (wro-2026's WRO 2026 figure, a bleed, no trim box,
  a turned page, finding the trim box in bytes), the picture resolution, the mat file, and the
  robot on a mat. Headless Chromium on the production build with the CSP, with generated PDFs: a
  WRO-size trim box inside a 3 mm bleed becomes a 2362 × 1143 mm mat with the bleed cut off and
  its green start square, black line and red target at their places; a start area drawn; the
  robot placed in it, dragged 300 mm out (the check turns ✗), turned, put back, turned by the
  handle; the ruler (1500 mm, 0°); a reload (all kept); a mat file saved and loaded; a two-page
  PDF (page 2, 420 × 297 mm); a picture (1200 × 600 mm typed); a phone (no sideways scroll); no
  errors, and no request outside this site. The real WRO PDF was not available to the test (its
  download link returned a web page), so it is the maintainer's check.

## Amendment (2026-11-07): robots and mats on GitHub; D5 changed

After trying the Mats page with the real WRO 2026 Elementary PDF (it worked), the maintainer asked
for Load and Save on GitHub on the Robots and Mats pages too, in their words "using the GitHub
already set up for the code, not setting it up again; or, if it was never set up, adding the
token there", and usable on every page. This changes D5, which kept mats off GitHub by default.

- **One GitHub setup for every page.** The repository, folder, name and token set up on Blocks
  (ADR 0011) serve Robots and Mats as they are; each page's **Set up GitHub…** opens the same
  settings. The folder holds programs (`.matpilot.json`), robots (`.matpilot-robot.json`) and
  mats (`.matpilot-mat.json`) side by side, told apart by their endings (`src/lib/github/files.ts`);
  its label now reads "Folder for programs, robots and mats".
- **Load and Save** on both pages open one shared pair of dialogs (`src/components/files/`): this
  computer, or GitHub. Saving follows ADR 0011's rule: a teammate's newer version is never
  replaced without asking ("Save mine as a new …", "Replace it"). Which GitHub file each robot or
  mat came from is remembered in this browser (`matpilot.github.links.v1`). A robot loaded from
  GitHub that differs from the one here arrives beside it, as a copy.
- **Large files.** GitHub's contents API sends files of 1 to 100 MB without their content; the
  client then asks for them raw (`application/vnd.github.raw+json`), per
  [GitHub's documentation](https://docs.github.com/en/rest/repos/contents#get-repository-content)
  (checked 2026-11-07). A WRO mat's file is about 13 MB; GitHub states no size limit for saving
  through this API, so the first real save of a full mat is the maintainer's check.
- **Mats are the organiser's work.** Before a mat is saved, the dialog asks GitHub whether the
  repository is private. If it is public, or GitHub cannot say, saving waits for a tick: "A
  competition mat is the organiser's work: keep it for your own team, in a private repository."
- **No new origin:** `https://api.github.com` is already allowed (ADR 0011).
- **Tests:** unit tests for the raw read of a large file and for listing robots and mats apart.
  Headless Chromium against a fake GitHub: a robot saved into the Blocks page's repository and
  folder with no new setup; a teammate's change caught and replaced only when asked; their robot
  loaded beside mine; a mat saved (private: no tick) and loaded back through the raw read; a
  public repository needing the tick; the setup offered when GitHub is not set up.

## Consequences (as accepted)

- Two new libraries, each loaded only on the page that needs it: pdf.js on Mats, MicroPython on a
  run. Both self-hosted; NOTICE grows; `verify-export.mjs` checks their files are present.
- No new origin and no server: mats, robots and runs stay in the browser.
- The program file format moves to version 3 (with a robot); version 2 files still open.
- A simulated `pybricks` becomes a second place that states Pybricks behaviour, so it carries the
  same citations as `pybricks.ts`, and a test runs every toolbox block's Python through it.
- The simulation is a plan, not a promise: what the real robot does still decides, and the page
  says so.
