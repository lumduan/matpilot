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

## Keeping this file current

The supported and unsupported lists also live in `README.md` (copied matrix) and
`src/lib/compat/support.ts` (the message shown in the app). Change all three together. The
hardware test steps above also live in `src/lib/hwtest/session.ts`.
