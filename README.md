# MatPilot

MatPilot is a block-based programming and control web app for LEGO SPIKE Prime hubs running
[Pybricks](https://pybricks.com) firmware. It is built for education and for robotics competitions
(WRO and other open or school-run events), with or without a gamepad.

MatPilot runs entirely in your browser. There is no backend, no account, and no telemetry: the app
is a set of static files, and it talks to the hub directly over Web Bluetooth. The one exception is
optional: if you save or load block programs on GitHub, the page talks to GitHub's API with a token
you give it ([ADR 0011](docs/adr/0011-save-load-github.md)).

## Project status

**Early, pre-alpha.** It is not ready for classroom or competition use.

What works today:

- **Compatibility check:** tells you whether this browser and device can use Web Bluetooth, and why
  not if they cannot.
- **Read-only hub probe:** connects to a SPIKE Prime hub running Pybricks firmware and reads its
  name, firmware revision, and protocol version. It writes nothing to the hub.
- **Blocks** (`/blocks`): snap blocks together to program the hub in a full-window editor. Simple
  blocks for beginners choose motors and sensors by port and set turns, steering, speeds and the
  hub's lights with pictures: a dial, a steering path, a lever, a 5×5 grid. The detailed blocks,
  one Pybricks command each with devices set up by name, fold under **Advanced**. The Python they
  make opens beside them or fills the window, and every motor stops when the program ends or is
  stopped. A bar above the blocks shows what is plugged into each port, with live values. Undo and
  redo buttons take changes back. **Save** and **Load** keep programs in a file on your computer, or
  in a GitHub repository that a team shares, without replacing a teammate's newer version.
  **Controller** blocks drive the robot and run motors from an Xbox controller connected to the
  hub, and a Controller panel shows the sticks and buttons live while the program runs. Built with
  Blockly.
- **Program & Monitor** (`/program`): write MicroPython, run it on the hub, and watch its output as
  text (like Arduino's Serial Monitor) and as a live graph (like its Serial Plotter). The program is
  compiled in the browser.
- **Hardware test page** (`/hardware-test`): walks a tester through the hardware checks with a real
  hub, records the results in the browser, and produces a report for the
  [compatibility table](docs/compatibility.md).

More blocks (tasks that run at the same time), offline use, and mat profiles are planned. See the [roadmap](docs/roadmap.md).

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

- [docs/architecture.md](docs/architecture.md): layers, data flow, and what is implemented
- [docs/compatibility.md](docs/compatibility.md): browser and platform support matrix
- [docs/protocol/pybricks-ble.md](docs/protocol/pybricks-ble.md): the Pybricks BLE protocol MatPilot
  uses, cited to upstream source
- [docs/roadmap.md](docs/roadmap.md): planned milestones
- [docs/adr/](docs/adr/): architecture decision records
- [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [CLAUDE.md](CLAUDE.md) (for AI
  coding agents)

## License

MatPilot is released under the [MIT License](LICENSE), copyright (c) 2026 Sarat Sonsuk.
Third-party attributions are in [NOTICE](NOTICE).

---

LEGO and SPIKE are trademarks of the LEGO Group. Xbox is a trademark of Microsoft Corporation. WRO is
a trademark of the World Robot Olympiad Association. MatPilot is an independent project and is not
affiliated with, sponsored by, or endorsed by any of these organisations or by the Pybricks project.
