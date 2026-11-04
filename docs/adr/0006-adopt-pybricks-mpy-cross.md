# ADR 0006: Compile in the browser with Pybricks' mpy-cross WebAssembly build

- Status: Accepted
- Date: 2026-11-04

## Context

The hub runs programs uploaded as MicroPython `.mpy` bytecode in the "multi-file mpy, ABI v6"
format ([protocol page, section 5](../protocol/pybricks-ble.md#5-program-format-multi-file-mpy-abi-v6)).
The tested firmware, Pybricks v4.0.1, defines `MPY_VERSION 6`
([pybricks/micropython py/persistentcode.h#L37-L38](https://github.com/pybricks/micropython/blob/13580b6ad057173f62e8b2363e01d6851bcc6699/py/persistentcode.h#L37-L38)).
MatPilot has no server ([ADR 0001](0001-browser-only-web-bluetooth.md)), so the compiler must run in
the browser.

The roadmap planned to build MicroPython's `mpy-cross` to WebAssembly ourselves (milestone 2).
Pybricks already publishes that build:

- `@pybricks/mpy-cross-v6` on npm, version 2.0.0, MIT licence, source repository
  `pybricks/pybricks-micropython` (npm registry metadata, read 2026-11-04);
- Pybricks Code, the Pybricks web IDE, depends on it (`package.json` on its `master` branch, read
  2026-11-04).

The maintainer's original reason for building it ourselves was flexibility: driving the hub with an
Xbox controller, showing output from the hub, and watching motors turn. None of these depend on
the compiler:

- The Xbox controller is a firmware class, `pybricks.iodevices.XboxController`, enabled on SPIKE
  Prime ([protocol page, section 7](../protocol/pybricks-ble.md#7-things-the-hub-can-do-that-matpilot-will-use-later)).
- Output and telemetry travel over the BLE protocol (stdout events, app data), handled by
  MatPilot's transport and UI.

The compiler only turns Python source into bytecode. The maintainer decided on 2026-11-04 to adopt
Pybricks' build as long as these goals are not limited, and they are not.

## Decision

1. MatPilot compiles with **`@pybricks/mpy-cross-v6`**, pinned to an exact version like every
   dependency.
2. Its WebAssembly file is **served from MatPilot's own origin**. No CDN, no runtime request to
   another origin ([ADR 0002](0002-static-export-no-server-features.md)).
3. **Golden tests still apply.** A corpus of programs is compiled both by the browser build and by
   pybricksdev's `mpy_cross_v6`. The `.mpy` output must be identical byte for byte, and the
   combined multi-file program must match pybricksdev's format exactly.
4. MatPilot uploads **bytecode only**, never native code. It therefore requires the hub's
   "multi-file mpy, ABI v6" feature flag only.

## Consequences

- Milestone 2 changes from "build mpy-cross to WebAssembly" to "adopt Pybricks' build and prove
  it". The milestone keeps the same exit criterion: the golden tests.
- MatPilot depends on a package Pybricks maintains. Its last release is 2.0.0 (2022-07-06).
  - If it stops matching the firmware, the golden tests or a hardware run will show it.
  - The fallback is the original plan: build `mpy-cross` from `pybricks/micropython` ourselves.
- The package is MIT-licensed, so `NOTICE` gains an attribution when it is added.
- Changing the compiler again (for example to a self-built one) needs a new ADR.
