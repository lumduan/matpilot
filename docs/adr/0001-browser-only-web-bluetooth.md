# ADR 0001: Browser-only app with Web Bluetooth transport

- Status: Accepted
- Date: 2026-11-04

## Context

MatPilot targets classrooms and robotics competitions. In both settings, the people running it
often cannot install software, cannot rely on internet access, and should not need an account.
Users need to edit block programs, compile them to MicroPython bytecode, and send them to a LEGO
SPIKE Prime hub running Pybricks firmware.

A server would add hosting cost, an availability dependency, and a place where student data could
end up. Native or desktop apps would need installation and per-platform builds.

Browsers can reach Bluetooth Low Energy devices through the Web Bluetooth API. Web Bluetooth is
implemented only by Chromium-based browsers. Firefox and Safari (WebKit) do not implement it, and
every browser on iOS and iPadOS is built on WebKit.

## Decision

1. **No backend of any kind.** No server, no API routes, no database, no accounts. All logic
   (block code generation, MicroPython compilation via mpy-cross compiled to WebAssembly, and the
   BLE transport) runs in the user's browser.
2. **Web Bluetooth is the transport** between the browser and the hub.
3. **Supported browsers are Chromium-based only:** Google Chrome and Microsoft Edge, on Windows,
   macOS, ChromeOS, and Android. Firefox, Safari, and every browser on iOS and iPadOS are
   unsupported.
4. Whether the app can connect is decided at runtime by **feature detection** (secure context,
   `navigator.bluetooth`, `getAvailability()`), not by parsing the browser name.

## Consequences

- No data leaves the user's device; there is nothing to breach server-side and no privacy policy for
  collected data is needed.
- Hosting is a set of static files ([ADR 0002](0002-static-export-no-server-features.md)).
- iPhone, iPad, Firefox, and Safari users cannot connect to a hub. The app must explain this
  clearly and name the supported browsers and platforms.
- Web Bluetooth requires a secure context, so the app must be served over HTTPS (or from
  `localhost` during development).
- `requestDevice()` must be called from a user gesture, so connecting always starts with a click.
- Compilation needs mpy-cross built to WebAssembly, and its output must be checked against the
  reference toolchain (`pybricksdev`), because there is no server-side compiler to fall back on.
- BLE quirks (cancellation, disconnection, GATT operations that cannot run in parallel) must be
  handled in browser code, which is kept framework-agnostic in `src/lib/ble/`.
