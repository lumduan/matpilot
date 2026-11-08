# MatPilot

MatPilot is a block-based programming and control web app for LEGO SPIKE Prime hubs running
[Pybricks](https://pybricks.com) firmware. It is built for education and for robotics competitions
(WRO and other open or school-run events), with or without a gamepad.

MatPilot runs entirely in your browser. There is no backend, no account, and no telemetry: the app
is a set of static files, and it talks to the hub directly over Web Bluetooth. There are two
optional exceptions: if you save or load block programs on GitHub, the page talks to GitHub's API
with a token you give it ([ADR 0011](docs/adr/0011-save-load-github.md)); and if an adult turns on
the AI helper with their own key, the program and the child's question go to the AI company they
chose (Anthropic, OpenAI or DeepSeek) when the child presses Ask
([ADR 0015](docs/adr/0015-ai-helper.md)).

## Project status

**Early, pre-alpha.** It is not ready for classroom or competition use.

What works today:

- **Home page and Docs** (`/docs`): how to start, putting Pybricks on the hub, and every page
  explained with pictures, for children and the grown-ups helping them.
- **Compatibility check:** tells you whether this browser and device can use Web Bluetooth, and why
  not if they cannot.
- **Read-only hub probe:** connects to a SPIKE Prime hub running Pybricks firmware and reads its
  name, firmware revision, and protocol version. It writes nothing to the hub.
- **USB cable** (built, not yet tried on a hub): besides Bluetooth, the Blocks, Program and
  calibration pages connect with a USB cable to a hub on Pybricks v4.1.1 or newer, through Web
  Serial ([ADR 0018](docs/adr/0018-usb-connection.md)).
- **Blocks** (`/blocks`): snap blocks together to program the hub in a full-window editor. Simple
  blocks for beginners choose motors and sensors by port and set turns, steering, speeds and the
  hub's lights with pictures: a dial, a steering path, a lever, a 5×5 grid. The detailed blocks,
  one Pybricks command each with devices set up by name, fold under **Advanced**. The Python they
  make opens beside them or fills the window, and every motor stops when the program ends or is
  stopped. The Python can be edited there too: **Update blocks** turns it back into blocks, and
  anything that has no block yet is marked in red where it is. A bar above the blocks shows what is plugged into each port, with live values. Make
  blocks of your own (**Functions**) and keep them in tabs, like a browser's: each tab becomes a
  Python file that the main tab imports. Copy and paste work between tabs, and a shared variable
  (🌐) is there for a value every tab needs. Undo and redo buttons take changes back. **Save** and **Load** keep programs in a file on your computer, or
  in a GitHub repository that a team shares, without replacing a teammate's newer version.
  **Controller** blocks drive the robot and run motors from a controller connected to the hub
  (the Xbox controller for now); buttons and sticks are picked on a picture of the controller, and
  a Controller panel shows them live while the program runs. Built with
  Blockly.
- **Robots** (`/robots`): describe your robot: its size, wheels, motors and sensors. MatPilot
  draws it to scale, works out how fast it drives (by the hub's own rules) and how much room it
  needs to turn, and checks it against the WRO 2026 RoboMission rules. **Measure on the floor**
  runs two short programs on the robot (drive 1 metre, turn ten times) and corrects the wheel size
  and the gap between the wheels from what a tape measure says. **Make from a LEGO model** reads a
  robot built in BrickLink Studio and exported as LDraw, shows it in 3D, and works out its size,
  wheels, motors and sensors, with only the ports to pick. A block program chooses its robot, and the drive base in its Python
  follows it.
- **Mats** (`/mats`): add the mat's printing PDF and MatPilot reads its real size from the file
  (a photo works too, with its size typed in). Place your robot on it, drag and turn it, see
  whether it fits the start area, measure distances, and mark areas. **Run a program on the
  mat**: the program's own Python runs in the browser and the robot's path is played back, with
  a warning when it leaves the mat or runs out of time. Its sensors read the mat: the colour
  sensor sees the picture under it (by the hub's own colour rules), the distance and touch
  sensors find the mat's edges and the solid objects you mark. **How sure is it?** shows where
  the real robot may end, from its measured drift. **Path**: click points on the mat and they
  become "turn" and "move" blocks on the Blocks page. Robots and mats are saved on this
  computer, or on GitHub with the same setup as programs.
- **AI helper** (on `/blocks`, off until an adult sets it up): explains the open tab's program, or
  reviews it with hints rather than answers, using Anthropic, OpenAI or DeepSeek with the adult's
  own key. Children learn to prompt: a checklist ticks the habits of a good prompt as they type,
  "What the AI sees" shows the exact text sent, and a journal keeps earlier prompts to compare.
  Every answer is marked as coming from an AI.
- **Program & Monitor** (`/program`): write MicroPython, run it on the hub, and watch its output as
  text (like Arduino's Serial Monitor) and as a live graph (like its Serial Plotter). The program is
  compiled in the browser.
- **Hardware test page** (`/hardware-test`): walks a tester through the hardware checks with a real
  hub, records the results in the browser, and produces a report for the
  [compatibility table](docs/compatibility.md).

More blocks (tasks that run at the same time) and offline use are planned. See the [roadmap](docs/roadmap.md).

Tested firmware baseline: **Pybricks v4.0.1** on LEGO SPIKE Prime. This is the version MatPilot is
tested against, not a hard requirement.

## Browser and OS support

Web Bluetooth is available only in Chromium-based browsers, so MatPilot supports Google Chrome and
Microsoft Edge on Windows, macOS, ChromeOS, and Android. Details and the reason for each unsupported
platform: [docs/compatibility.md](docs/compatibility.md).

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

> [!IMPORTANT]
> Web Bluetooth only works in a **secure context**: the page must be served over **HTTPS**, or from
> **`localhost`**. Opening MatPilot over plain `http://` on a network address (for example
> `http://192.168.1.10:8080`) makes the compatibility check fail and keeps "Connect to hub" disabled.

## Quick start

The project toolchain is Node.js **26.13.0** and pnpm **12.16.1**, and it runs in Docker, so you
only need Docker with Compose ([ADR 0005](docs/adr/0005-containerised-toolchain.md)).

```sh
docker compose up dev                     # development server on http://localhost:3300
docker compose run --rm dev pnpm test     # any project script: lint, typecheck, test, build, format
docker compose up --build preview         # production static build on http://localhost:3301
```

To get the static site as files, build the `export` target. It runs lint, typecheck, tests, and
the build inside the container, then writes `out/` on the host:

```sh
docker build --target export --output type=local,dest=out .
```

Serve `out/` with any static file server, over HTTPS or on `localhost`. `next start` is not used:
there is no Node.js server at runtime.

Without Docker, use the versions pinned in [`.nvmrc`](.nvmrc) and the `packageManager` field of
[`package.json`](package.json): `nvm install`, `npm install --global pnpm@12.16.1`, `pnpm install`,
then `pnpm dev` (port 3000) or `pnpm build`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Documentation

- The Docs for using MatPilot are in the app itself, at `/docs`.
- [docs/architecture.md](docs/architecture.md): layers, data flow, and what is implemented
- [docs/compatibility.md](docs/compatibility.md): browser and platform support matrix
- [docs/protocol/pybricks-ble.md](docs/protocol/pybricks-ble.md): the Pybricks BLE protocol MatPilot
  uses, cited to upstream source; [pybricks-usb.md](docs/protocol/pybricks-usb.md): the same over
  a USB cable
- [docs/roadmap.md](docs/roadmap.md): planned milestones
- [docs/adr/](docs/adr/): architecture decision records
- [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [CLAUDE.md](CLAUDE.md) (for AI
  coding agents)

## License

MatPilot is released under the [MIT License](LICENSE), copyright (c) 2026 Sarat Sonsuk.
Third-party attributions are in [NOTICE](NOTICE).

---

LEGO® is a trademark of the LEGO Group of companies which does not sponsor, authorize or endorse
this site. SPIKE and BrickLink are trademarks of the LEGO Group. Xbox is a trademark of Microsoft
Corporation. WRO is a trademark of the World Robot Olympiad Association. MatPilot is an independent
project and is not affiliated with, sponsored by, or endorsed by any of these organisations or by the
Pybricks project.
