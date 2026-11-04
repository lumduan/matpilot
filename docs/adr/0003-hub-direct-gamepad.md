# ADR 0003: Gamepad control connects directly to the hub

- Status: Accepted
- Date: 2026-11-04

## Context

Driving a robot with a gamepad is useful for teaching, for testing mechanisms, and for some
competition formats. Two designs are possible:

1. **Browser relay:** the gamepad connects to the computer, the browser reads it with the Gamepad
   API, and the browser sends commands to the hub over Bluetooth.
2. **Hub-direct:** the gamepad connects to the hub itself, and a program on the hub reads it.

The browser relay puts the laptop, the browser tab, the operating system's Bluetooth stack, and two
radio links in the control loop. A sleeping laptop, a background tab, or a dropped browser link would
affect a moving robot.

Pybricks firmware provides an `XboxController` class in `pybricks.iodevices`, enabled for the SPIKE
Prime hub, in which the hub scans for and connects to the controller as the Bluetooth central
(pybricks-micropython, tag v4.0.1, commit `4104553405decb0384bcfb030fbfcb4b5a9854cc`):

- Module registration: [`pybricks/iodevices/pb_module_iodevices.c#L92`](https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/pybricks/iodevices/pb_module_iodevices.c#L92)
- Enabled on SPIKE Prime: [`bricks/primehub/mpconfigport.h#L41`](https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/bricks/primehub/mpconfigport.h#L41)
- The hub scans and connects: [`pybricks/iodevices/pb_type_iodevices_xbox_controller.c#L300`](https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/pybricks/iodevices/pb_type_iodevices_xbox_controller.c#L300)

## Decision

Gamepad control uses the **hub-direct path**. An Xbox controller connects to the hub, which acts as
the BLE central through Pybricks' `XboxController`. The program that reads the controller and drives
the motors runs on the hub.

**The browser is not in the control loop.** Its role is limited to uploading, starting, and stopping
the program, and displaying telemetry the program prints.

## Consequences

- Control latency and reliability do not depend on the computer, the browser, or the browser's
  Bluetooth connection.
- Drive logic is MicroPython that MatPilot generates or ships, so it must follow the hub code rules
  in [CLAUDE.md](../../CLAUDE.md): stop every motor in a `finally` block, catch `OSError` around
  controller reads, keep tuning constants in one config block, and never hardcode ports inside
  logic.
- Which controller models and controller firmware versions work is defined by Pybricks. MatPilot
  documentation must cite upstream or hardware tests for any such claim.
- What happens to a running program when the browser disconnects is Pybricks behaviour that has not
  yet been documented for this project; it must be cited or verified on hardware before the UI
  relies on it.
- The planned Xbox test panel shows telemetry received from the hub; it does not send control
  input.
