# ADR 0018: Connecting with a USB cable

- Status: **Accepted** 2026-11-08: the maintainer asked for it ("besides Bluetooth, I want USB
  connections supported too"). Built the same day. **Tried on a hub the same day:** the maintainer
  updated it to Pybricks v4.1.3 and reports that USB works
  ([results](../compatibility.md#usb-results); not itemised check by check).
- Date: 2026-11-08
- Builds on: [ADR 0001](0001-browser-only-web-bluetooth.md) (browser only; Bluetooth stays),
  [ADR 0007](0007-ble-transport-writes.md) (one module writes to the hub, one write at a time,
  STOP before letting go), [ADR 0009](0009-live-device-values.md) (REPL sessions).

## Context

MatPilot reaches a SPIKE Prime hub over Web Bluetooth only. The maintainer asked for a USB cable
too. A cable needs no pairing, works where Bluetooth is crowded (a competition hall), and works in
browsers or on systems where Web Bluetooth does not ([compatibility](../compatibility.md)).

## What was found

Every Pybricks fact is cited, with its commit, in
[docs/protocol/pybricks-usb.md](../protocol/pybricks-usb.md). In short:

1. **Pybricks v4.0.1, MatPilot's tested baseline, has no USB data link on SPIKE Prime**: USB only
   charges the hub. The first stable release with one is **v4.1.0** (2026-10-12), and **v4.1.1**
   fixed replies that could be lost over USB. The newest, v4.1.3, is what Pybricks' installer puts
   on a hub today.
2. The hub is a **standard USB serial port** (CDC ACM), so the browser reaches it with **Web
   Serial**, not WebUSB. No driver is needed on Windows, macOS or Linux; on Linux the user must be
   allowed to use serial ports.
3. Over the cable, the **commands and events are byte for byte the Bluetooth ones**. Each is
   wrapped in a message with a type byte (and a tag on commands, which the reply echoes), framed
   with LEGO's SPIKE Prime variant of COBS. The hub's name, versions and capabilities are read
   with an in-band read message. Events need the port open with DTR and a subscription.
4. Pybricks' own web app's public source has no Web Serial code; Pybricks' Python tools
   (pybricks-tools) and the firmware's own test tool are the working references.
5. Web Serial is in Chrome 89 and Edge on Windows, macOS, ChromeOS and Linux, in Chrome for
   Android from 148, and in Firefox from 151; not in Safari (MDN's browser data, cited in the
   protocol page).

## Decision

1. **USB beside Bluetooth, not instead of it.** "Connect hub" stays Bluetooth. A **USB** button
   beside it appears only when the browser has Web Serial. Bluetooth keeps working with v4.0.1.
2. **USB needs Pybricks v4.1.1 or newer**, checked from the protocol version the hub reports (1.6
   or newer). An older Pybricks or the LEGO firmware does not show up as a serial port at all;
   the page says to update Pybricks or use Bluetooth.
3. **One connection, two ways to reach it.** `HubConnection` (src/lib/ble/hub-connection.ts)
   gains `connectUsb()`; uploading, running, stopping, stdin, the REPL and live values are the
   same code on both. It stays the only module that writes to the hub, and ADR 0007's rules hold:
   one command at a time (over USB each waits for the hub's reply, matched by its tag), and STOP
   before letting go. Unplugging the cable does not stop a running program, as with a lost
   Bluetooth link; the page says so the same way.
4. **The USB link is its own small module**, src/lib/usb/: the COBS framing ported from the
   firmware (MIT; NOTICE), the messages, and the link over a Web Serial port, with a fake hub for
   the tests. UI code may not touch `navigator.serial` (ESLint), as with `navigator.bluetooth`.
5. **No change to the firmware baseline yet.** v4.0.1 stays the tested baseline until the
   maintainer updates the hub; then the Bluetooth checks are run again on v4.1.x and the baseline
   moves (a decision for that day, see below).
6. **No new origin.** Web Serial talks to a device, not a site; the CSP is unchanged.

## Consequences

- To use USB, the maintainer updates the hub with Pybricks' installer (the Docs' Get started
  page), then runs the [USB checks](../compatibility.md#usb-connection-checks-milestone-11).
- **Decided 2026-11-08 (the maintainer: "move to 4.1"):** MatPilot's tested baseline is now
  v4.1.3, with every firmware citation re-checked at that release; the hardware checks recorded
  before were on v4.0.1. It means running the Bluetooth checks again on v4.1.3, and
  docs/protocol/pybricks-ble.md is re-cited at the new commit, where some facts differ (for
  example stdin holds 512 bytes, not 64). New users get v4.1.x from Pybricks' installer already.
- The hardware test page (/hardware-test) still probes over Bluetooth only.
- Not built: choosing a hub by name in the port list (the browser shows the USB product name,
  which Pybricks sets to the hub's name since v4.1.0), and keeping a USB and a Bluetooth link at
  once.
