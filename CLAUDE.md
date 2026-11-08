# Instructions for AI coding agents

This file is for AI coding agents (Claude Code and similar) working in this repository. Human
contributors: see [CONTRIBUTING.md](CONTRIBUTING.md).

MatPilot is a browser-only, block-based programming and control web app for LEGO SPIKE Prime hubs
running Pybricks firmware. Tested firmware baseline: Pybricks v4.0.1 (a baseline, not a hard
requirement). Read [docs/architecture.md](docs/architecture.md) and the ADRs in
[docs/adr/](docs/adr/) before changing structure. Do not revisit an accepted ADR without being asked.

## Commands

The toolchain runs in Docker ([ADR 0005](docs/adr/0005-containerised-toolchain.md)). Do not
install Node.js or pnpm on the host. Run scripts through the `dev` service:

```sh
docker compose run --rm dev pnpm lint        # ESLint with zero warnings, plus Prettier check
docker compose run --rm dev pnpm typecheck   # next typegen && tsc --noEmit
docker compose run --rm dev pnpm test        # Vitest
docker compose run --rm dev pnpm build       # static export to out/, then scripts/verify-export.mjs
docker compose run --rm dev pnpm format      # Prettier write
docker compose up dev                        # dev server, http://localhost:3300
docker build --target export --output type=local,dest=out .   # full CI pipeline, then out/
```

**Docker networks:** every network in `compose.yaml` pins exactly one `/24` subnet (the default
network uses `10.210.120.0/24`, overridable with `MATPILOT_SUBNET`). Never add a network without a
pinned subnet, never use `192.168.0.0/16` or `172.16.0.0/12`, and never `docker network create`
without `--subnet`. Docker's automatic allocation once handed this project a range that contained a
home network and cut those devices off from the host. CI enforces the rule.

Run all of `lint`, `typecheck`, `test`, and `build` before calling a change done. Node.js 26.13.0
(`Dockerfile`, `.nvmrc`) and pnpm 12.16.1 (`Dockerfile`, `packageManager`) must stay in agreement;
CI checks this.

## Hard constraints

1. **Browser-only.** No backend of any kind: no server, API routes, Route Handlers, Server Actions,
   middleware, `getServerSideProps`, or databases. All logic runs in the browser.
2. **Static export only.** `output: 'export'` stays in `next.config.ts`; `out/` must deploy to any
   static host unchanged. Do not use the default `next/image` loader (`images.unoptimized` stays
   `true`).
3. **No runtime requests to third-party origins.** No CDN scripts, remote fonts, analytics, or
   telemetry. Self-host every asset. `scripts/verify-export.mjs` and the production CSP meta tag
   enforce this; do not weaken either. **Two exceptions, both in `connect-src`:**
   - `https://api.github.com` ([ADR 0011](docs/adr/0011-save-load-github.md)), which the page
     calls only when the user saves or loads a block program on GitHub (the GitHub client in
     `src/lib/github/`);
   - the AI helper's providers ([ADR 0015](docs/adr/0015-ai-helper.md)):
     `https://api.anthropic.com`, `https://api.openai.com` and `https://api.deepseek.com`, called
     only after an adult has turned the helper on with their own key, and only when Ask is
     pressed (`src/lib/ai/`; the list is `src/lib/ai/providers.ts`).

   `verify-export.mjs` pins the CSP's sources to exactly these, and a unit test keeps its list
   equal to `providers.ts`. Add no other origin without a new ADR.

4. **No service worker** until the offline PWA milestone.
5. **English only** for all code, comments, identifiers, documentation, and commit messages.
6. **Conventional Commits** for commit messages (`feat(ble): ...`, `fix(compat): ...`, `docs: ...`).
7. **Millimetres** for every spatial unit ([ADR 0004](docs/adr/0004-millimetre-units.md)).

## Pybricks facts must be cited

**Never state a Pybricks API, protocol, UUID, command, firmware string, or behaviour without citing
the upstream source**, as a GitHub permalink that includes a commit hash, in the code comment or doc
where the claim is made. The primary sources are:

- https://github.com/pybricks/pybricks-micropython (firmware; protocol in `lib/pbio/include/pbio/protocol.h`
  and `lib/pbio/src/protocol/`)
- https://github.com/pybricks/pybricksdev (reference tooling)

The protocol subset MatPilot uses is already documented, with citations, in
[docs/protocol/pybricks-ble.md](docs/protocol/pybricks-ble.md). Extend that page (same commits, or
re-cite everything) before code uses another command, event, or flag.

A claim verified on hardware instead must say so, with hub, firmware version, browser, OS, and date.
If the upstream source cannot be found or is ambiguous, **stop and report what is missing**. Do not
guess, and do not rely on memory, blogs, or third-party tutorials. Ported constants also need an
entry in [NOTICE](NOTICE).

## Code organisation

- `src/lib/` is **framework-agnostic TypeScript**: no React, no Next.js (ESLint enforces this). All
  Web Bluetooth and Pybricks protocol code lives here:
  - `src/lib/ble/`: Bluetooth transport and the hub probe
  - `src/lib/pybricks/`: UUIDs (single source of truth: `uuids.ts`), version parsing, baselines
  - `src/lib/compat/`: browser compatibility checks
  - `src/lib/monitor/`: stdout line splitting, the monitor log, and the plotter's parser and scale
  - `src/lib/program/`: example programs for the Program and Monitor page (each cited)
  - `src/lib/blocks/`: the block editor ([ADR 0008](docs/adr/0008-block-editor.md),
    [ADR 0010](docs/adr/0010-simple-blocks.md), [ADR 0012](docs/adr/0012-controller-blocks.md),
    [ADR 0013](docs/adr/0013-block-tabs.md)):
    Blockly block definitions (the detailed blocks in `definitions.ts`, the simple blocks in
    `simple-definitions.ts`, the Controller blocks in `controller-definitions.ts`, the function
    blocks in `functions.ts`, the shared-variable blocks in `shared.ts`), their picture fields
    (`fields/`), toolbox, themes, tabs (`tabs.ts`: tab names, and the registry that lets a block
    see the other tabs), copy and paste between tabs (`clipboard.ts`), and the Python generator,
    which makes one file per tab with functions plus `setup.py`. Every Pybricks name a block generates
    is cited in `src/lib/blocks/pybricks.ts`; add the citation there before adding a block.
    Blockly is browser-loaded lazily (`editor.ts`); the generator also runs headless in tests,
    where every test program must compile with the real compiler. Keep the detailed blocks: the
    simple blocks sit beside them, not instead of them.
  - `src/lib/blocks/from-python/`: the Python of a tab turned back into its blocks
    ([ADR 0014](docs/adr/0014-python-editing-on-blocks-page.md)), and `python-editor.ts`, the
    editor for it (CodeMirror 6, loaded only when Edit is pressed). **Every block needs a reader
    in `from-python/reader.ts`:** when you add a block or change the Python it makes, change its
    reader in the same change. `from-python/tab.test.ts` reads every toolbox block back and fails
    when the Python differs. Give the block a word in `from-python/vocabulary.ts` too, so the
    editor suggests and explains it; its example must become the block (the test checks).
    `python-colors.ts` colours Python (VS Code-like) for the editor and the read-only view.
  - `src/lib/devices/`: live device values ([ADR 0009](docs/adr/0009-live-device-values.md)): the
    reader that `HubConnection.runInRepl()` pastes into the hub's REPL (`hub-source.ts`; every
    Pybricks name it uses is cited there, and tests compile it with the real compiler) and the
    parser for its `@mpv` lines. The reader only reads; it must never move a motor or change a
    light, sound or display.
  - `src/lib/hwtest/`: the hardware test page's session, steps, and report (the steps mirror
    docs/compatibility.md; it reuses the read-only hub probe and adds no Bluetooth code)
  - `src/lib/controller/`: the Xbox controller as block programs report it
    ([ADR 0012](docs/adr/0012-controller-blocks.md)): the `@xbx` lines, their button order (the
    generator writes the same list), and the state the Controller pane shows. The hub reads the
    controller; the page only displays it.
  - `src/lib/robots/`: robot profiles ([ADR 0016](docs/adr/0016-robots-and-mats.md)): the
    profile and its `.matpilot-robot.json` file (`profile.ts`), its speeds by the firmware's
    rules (`motion.ts`, every Pybricks fact cited there), short drive-base programs
    (`drive-program.ts`, cited), the calibration helper's two programs and corrections
    (`calibrate.ts`; its dialog runs them through `useHubRunner`), its shape and turning circle
    (`shape.ts`), and competition rules checks with quoted rules (`rules.ts`). Frames: ROBOT
    (origin between the drive wheels, +x forward, +y left) and MAT (origin bottom-left, +x right,
    +y up), counter-clockwise positive; Pybricks turns clockwise positive, so negate at the
    boundary. A program keeps a copy of its robot in its meta (`blocks/program-meta.ts`), and
    `generateTabs(tabs, { robot })` takes the drive base from it; "set movement motors" and "set
    wheel size" still win.
  - `src/lib/geometry/`: rectangles that may be turned, and inside/overlap tests (from
    lumduan/wro-2026), for robots and mats.
  - `src/lib/mats/`: mats ([ADR 0016](docs/adr/0016-robots-and-mats.md)): the mat, its areas and
    the robot's pose (`mat.ts`, MAT frame), a PDF's real size from its TrimBox (`pdf-box.ts`),
    drawing it with pdf.js (`picture.ts`, loaded only on demand; its worker and decoders are
    served from `/vendor/pdfjs/`, copied by `scripts/vendor-assets.mjs`), IndexedDB storage
    (`store.ts`), the robot on a mat (`pose.ts`), and a path drawn on the mat made into moves
    (`path.ts`; the Blocks page adds them as blocks through `src/lib/blocks/incoming.ts`).
  - `src/lib/ldraw/`: a robot from its LEGO model ([ADR 0017](docs/adr/0017-lego-part-builder.md)):
    reading an LDraw `.ldr`/`.mpd` with its submodels (`model.ts`), every part's size from the size
    table and the SPIKE parts' facts (`parts.ts`: the motors' shafts, the sensors' fronts, the
    wheels, each read from the part's LDraw file and checked against the table by a test), the
    robot profile worked out in the ROBOT frame (`robot-from-model.ts`; LDraw is right-handed with
    −Y up, so left = up × forward), the profile with the child's ports (`apply-model.ts`), the
    model packed with every LDraw file it needs (`pack.ts`: three.js's LDrawLoader fails a whole
    model on one missing file, so nothing is left to fetch), and the 3D view (`view3d.ts`, the only
    module that imports three.js, loaded on demand). The size table, the shapes subset
    (`library/`, `shapes.json`), the colours and the library's licence files are in
    `third_party/ldraw/`, made by
    `scripts/ldraw-library.mjs` from a pinned LDraw release and served from `/vendor/ldraw/`: never
    edit them by hand, and keep NOTICE's LDraw section when moving to another release. A robot
    keeps its model (`RobotProfile.model`): `robotRecord` writes it to storage and robot files,
    `robotData` (a program's copy, and how robots are compared) leaves it out.
  - `src/lib/sim/`: running a program on a mat ([ADR 0016](docs/adr/0016-robots-and-mats.md), 7c
    and 7d): the engine on a virtual clock (`engine.ts`, citing the firmware), the sensors on the
    mat (`sensors.ts`: the colour sensor's firmware steps, each cited, from the picture at
    1 px/mm; distance and touch against the mat's edges and solid objects), how sure a run is
    (`spread.ts`: seeded pretend runs from the robot's drift), the simulated `pybricks`
    package in Python (`pybricks.ts`: when a block generates a new Pybricks name, add it here
    too; the generator tests run every block's Python through it), the runner that loads
    MicroPython (`runner.ts`, also run by the tests in Node), the Web Worker and its watchdog,
    the Blocks page's hand-over of its Python, and the review of a run. MicroPython is served from
    `/vendor/micropython/`, never bundled.
  - `src/lib/ai/`: the AI helper ([ADR 0015](docs/adr/0015-ai-helper.md)): the providers
    (`providers.ts`, also the CSP's list), the settings and keys' format, the daily limit and the
    prompt journal (`usage.ts`), the request (`prompt.ts`: fixed instructions first, with the
    blocks' words from `from-python/vocabulary.ts`, then the program, then the prompt), the prompt
    checklist, answer parsing, and the client (`client.ts`) over the official SDKs
    (`@anthropic-ai/sdk`, `openai`), loaded only when used. The key goes only to its provider:
    never into program files, GitHub saves, the journal or logs. Tests answer with a fake
    provider (`client.test.ts`); never use a real key in tests.
  - `src/lib/github/`: saving and loading block programs, robots and mats in a GitHub repository
    ([ADR 0011](docs/adr/0011-save-load-github.md), extended by
    [ADR 0016](docs/adr/0016-robots-and-mats.md)): the REST client (with `src/lib/ai/client.ts`,
    the only code that talks to another origin; it reads files of 1 to 100 MB raw), repository
    and folder names, the kinds of file in the one folder (`files.ts`), and the save rule that
    never silently replaces a teammate's newer file. The program file format is
    `src/lib/blocks/program-file.ts`. Robots and Mats share the Save and Load dialogs in
    `src/components/files/`.
- `src/hooks/`: the only React code that creates or calls `src/lib/` objects with side effects
  (the hub probe, the compatibility check, the hub connection in `useHubRunner`, live device
  values in `useLiveDevices`, the block editor in `useBlocksEditor`, blocks handed over from the
  Mats page in `useIncomingBlocks`, the LDraw parts' sizes in `useLdrawBoxes`, editing a tab's Python in
  `usePythonEditing`, GitHub in `useGitHub`, the AI helper in `useAiHelper`, the robots in
  `useRobots`, the mats in `useMats`, a run on a mat in `useMatRun`).
  Components may import types and pure helpers.
- `src/components/`, `src/app/`: UI only. They must not touch `navigator.bluetooth` (ESLint
  enforces this).
- Pure logic goes behind functions with Vitest unit tests next to the source (`*.test.ts`). Mock
  `navigator` and GATT objects; never use real devices in unit tests.
- The hub probe is **read-only**. Do not add GATT writes or `startNotifications()` to it. Only
  `src/lib/ble/hub-connection.ts` writes to the hub, following
  [ADR 0007](docs/adr/0007-ble-transport-writes.md): writes run one at a time, and every exit path
  sends STOP first. REPL sessions follow [ADR 0009](docs/adr/0009-live-device-values.md): the
  user's program always takes priority, and nothing is written to a program slot. Extend the
  protocol page before using another command.

## Hub code rules (MicroPython programs under `hub/`)

Any MicroPython program for the hub, whether hand-written under `hub/` or produced by the code
generator, must follow these rules:

1. **Wrap the main loop in `try`/`finally`, and stop every motor in `finally`**, so a stop, an error,
   or a lost connection never leaves a motor running.
2. **Catch `OSError` around controller reads** (for example `XboxController` input), so a dropped
   controller is handled instead of crashing the program.
3. **Keep tuning constants in one config block** at the top of the program (speeds, gains, distances
   in millimetres, timeouts).
4. **Never hardcode ports inside logic.** Assign ports once in the config block and refer to the
   names everywhere else.

The block editor's generator applies these rules structurally; how each one maps to generated code
(for example, numbers typed into blocks stay in the blocks) is decided in
[ADR 0008](docs/adr/0008-block-editor.md). Keep its tests green when changing a block.

Shape to follow. `read_controller()` and `drive()` are placeholders. The Pybricks names used here are
cited at pybricks-micropython tag v4.0.1, commit `4104553405decb0384bcfb030fbfcb4b5a9854cc`:
`pybricks.pupdevices.Motor` ([pb_module_pupdevices.c#L15](https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/pybricks/pupdevices/pb_module_pupdevices.c#L15)),
`Motor.stop()` ([pb_type_motor.c#L483](https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/pybricks/common/pb_type_motor.c#L483)),
`pybricks.parameters.Port` ([pb_module_parameters.c#L29](https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/pybricks/parameters/pb_module_parameters.c#L29))
and `Port.A` ([pb_type_port.c#L98](https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/pybricks/parameters/pb_type_port.c#L98)).

```python
from pybricks.parameters import Port
from pybricks.pupdevices import Motor

# --- Config ---------------------------------------------------------------
LEFT_MOTOR_PORT = Port.A
RIGHT_MOTOR_PORT = Port.B
DRIVE_SPEED_MM_S = 200

# --- Setup ----------------------------------------------------------------
left = Motor(LEFT_MOTOR_PORT)
right = Motor(RIGHT_MOTOR_PORT)

# --- Main -----------------------------------------------------------------
try:
    while True:
        try:
            state = read_controller()
        except OSError:
            state = None  # controller dropped: treat as neutral input
        drive(state)
finally:
    left.stop()
    right.stop()
```

## Dependency notes

Versions are pinned exactly in `package.json`. Two deliberate holds: TypeScript stays on 6.x
(TypeScript 7 lacks the JavaScript API that `typescript-eslint` requires), and ESLint stays on 9.x
(plugins used by `eslint-config-next` do not declare ESLint 10 support).

## Keeping docs current

When a change alters what [docs/roadmap.md](docs/roadmap.md), [docs/compatibility.md](docs/compatibility.md),
or [docs/architecture.md](docs/architecture.md) states, update them in the same change.
