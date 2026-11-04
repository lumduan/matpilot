# Browser and platform compatibility

MatPilot talks to the hub through the browser's Web Bluetooth API, so it runs only where Web
Bluetooth is available. The decision is recorded in
[ADR 0001](adr/0001-browser-only-web-bluetooth.md).

At runtime the app decides by **feature detection, not by browser name**: the "Connect to hub"
button is enabled only when the page is a secure context, `navigator.bluetooth` exists, and
`navigator.bluetooth.getAvailability()` reports an adapter. The table below is the project's
support policy and its hardware test record.

## Support matrix

| Browser                                                    | Platform          | Status        | Verified on hardware |
| ---------------------------------------------------------- | ----------------- | ------------- | -------------------- |
| Google Chrome                                              | Windows 10 and 11 | Supported     | Not yet verified     |
| Microsoft Edge                                             | Windows 10 and 11 | Supported     | Not yet verified     |
| Google Chrome                                              | macOS             | Supported     | Not yet verified     |
| Microsoft Edge                                             | macOS             | Supported     | Not yet verified     |
| Google Chrome                                              | ChromeOS          | Supported     | Not yet verified     |
| Google Chrome                                              | Android           | Supported     | Not yet verified     |
| Microsoft Edge                                             | Android           | Supported     | Not yet verified     |
| Firefox                                                    | All platforms     | Not supported | Not yet verified     |
| Safari                                                     | macOS             | Not supported | Not yet verified     |
| Any browser (Safari, Chrome, Edge, Firefox, ...)           | iOS and iPadOS    | Not supported | Not yet verified     |
| Google Chrome, Microsoft Edge                              | Linux             | Not supported | Not yet verified     |
| Other Chromium-based browsers (Brave, Opera, Vivaldi, ...) | Any               | Untested      | Not yet verified     |

**Hub and firmware:** LEGO SPIKE Prime running Pybricks firmware v4.0.1 is the tested baseline (not
a hard requirement). Status: **not yet verified on hardware.**

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

For a **supported** row:

1. Open the app over HTTPS (or `localhost`). Every compatibility check shows **Pass** (the browser
   check shows **Info**), and "Connect to hub" is enabled.
2. With the hub on, click "Connect to hub". The browser's device picker lists only Pybricks hubs.
3. Select the hub. The app shows its name, firmware revision string, and protocol version string.
4. Connect again and click "Cancel" in the picker. The app shows the neutral **No hub selected**
   state.
5. While connected, turn the hub off. The app shows **Hub disconnected**, and the browser console
   shows no uncaught exception.

For an **unsupported** row: open the app. The unsupported-browser message appears, naming the
supported browsers and platforms, and "Connect to hub" is disabled.

## Keeping this file current

The supported and unsupported lists also live in `README.md` (copied matrix) and
`src/lib/compat/support.ts` (the message shown in the app). Change all three together.
