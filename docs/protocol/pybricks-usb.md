# Pybricks over a USB cable (what MatPilot uses)

How MatPilot talks to a SPIKE Prime hub through a USB cable
([ADR 0018](../adr/0018-usb-connection.md)). Everything here is cited at one release. The commands
and events inside the messages are the Bluetooth ones, described (at v4.0.1) in
[pybricks-ble.md](pybricks-ble.md); this page shows they are the same bytes over USB.

| Source                                                                   | Version             | Commit                                     |
| ------------------------------------------------------------------------ | ------------------- | ------------------------------------------ |
| [pybricks-micropython](https://github.com/pybricks/pybricks-micropython) | v4.1.3 (= `master`) | `c860b6a00301fb7c6ecd429da11dcb5a6c557c7a` |
| [WICG Web Serial](https://github.com/WICG/serial) (the browser API)      | `main`              | `418b5afa699646664f1548161cf6deab43adb0db` |
| [MDN browser-compat-data](https://github.com/mdn/browser-compat-data)    | `main`              | `82daeebf5a7073d55223a8cdb8aa54fb9416e27d` |

Short links below:

- **FW** = `https://github.com/pybricks/pybricks-micropython/blob/c860b6a00301fb7c6ecd429da11dcb5a6c557c7a/`
- **FW401** = `https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/`
- **SPEC** = `https://github.com/WICG/serial/blob/418b5afa699646664f1548161cf6deab43adb0db/index.bs`

Nothing on this page has been checked on a hub yet; see
[the USB checks](../compatibility.md#usb-connection-checks-milestone-11).

## 1. Which Pybricks has it

| Version  | USB on SPIKE Prime                                                                          | Source                                                                         |
| -------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| v4.0.0   | turned off for the stable release                                                           | FW `CHANGELOG.md#L207-L211`                                                    |
| v4.0.1   | charging only: `PBDRV_CONFIG_USB_CHARGE_ONLY (1)`                                           | FW401 `lib/pbio/platform/prime_hub/pbdrvconfig.h#L131`                         |
| v4.1.0b1 | back in the betas, now a USB serial port                                                    | FW `CHANGELOG.md#L181-L193`                                                    |
| v4.1.0   | the first stable release with it (2026-10-12)                                               | FW `CHANGELOG.md#L46-L49`; `lib/pbio/platform/prime_hub_f4/pbdrvconfig.h#L141` |
| v4.1.1   | "Fixed serial (USB/RFCOMM) race condition that could lead to lost replies to host commands" | FW `CHANGELOG.md#L29-L37`                                                      |
| v4.1.3   | the newest; Pybricks protocol 1.7.0                                                         | FW `lib/pbio/include/pbio/protocol.h#L23-L30`                                  |

MatPilot asks for protocol 1.6 or newer over USB and tells users to have v4.1.1 or newer.

## 2. The device

- A USB serial port (CDC ACM): "The Pybricks USB interface uses a CDC ACM data pipe (Web Serial on
  the host)" (FW `lib/pbio/include/pbio/protocol.h#L577-L587`).
- Vendor id `0x0694` (LEGO); product id `0x0009` for SPIKE Prime and `0x0010` for MINDSTORMS Robot
  Inventor, the same hub (FW `lib/lego/lego/usb.h#L12-L28`,
  `lib/pbio/platform/prime_hub_f4/pbdrvconfig.h#L133-L141`). `0x0008` and `0x0011` are the update
  mode, which MatPilot leaves to Pybricks' installer.
- The browser lists only those ports: `navigator.serial.requestPort({ filters: [{ usbVendorId,
usbProductId }] })` (SPEC `#L60-L140`, `#L202-L211`).

## 3. Framing

- Each direction is a byte stream; a message is one frame, which may span several USB packets or
  share one (FW `lib/pbio/include/pbio/protocol.h#L577-L587`).
- Frames use **COBS, SPIKE Prime variant**: 0x00, 0x01 and 0x02 are escaped, each code word is
  `delimiter × 84 + block size + 2` (0xFF for a full block), the body is XORed with 0x03, and
  0x02 ends the frame (FW `lib/pbio/include/pbio/cobs.h#L4-L52`; encoder and decoder
  `lib/pbio/src/cobs.c#L30-L196`). MatPilot's port, `src/lib/usb/cobs.ts`, passes the firmware's
  own known answers (FW `lib/pbio/test/src/test_cobs.c#L51-L73`): type 0x00 alone is `00 00 02`;
  type 0x41 with `42 43` is `05 42 41 40 02`.
- The first byte of a decoded frame is the message type; the hub drops an over-long frame at the
  next 0x02 (FW `lib/pbio/src/serial.c#L256-L330`). MatPilot sends a lone 0x02 after opening, so a
  half-received frame from before cannot spoil the first message; the firmware's own host tool
  does the same (FW `tools/flash/serdev/pybricks.py#L91-L94`).

## 4. Messages

Host to hub (FW `lib/pbio/include/pbio/protocol.h#L618-L656`):

| Type | Name      | Payload                                               | What the hub does                              |
| ---- | --------- | ----------------------------------------------------- | ---------------------------------------------- |
| `1`  | SUBSCRIBE | `1` to get events, `0` to stop                        | on `1`, sends the status report at once        |
| `2`  | COMMAND   | a tag byte, then a Pybricks command as over Bluetooth | runs it and replies RESPONSE with the same tag |
| `3`  | READ      | service, then a 16-bit id (little-endian)             | replies READ_REPLY                             |

Hub to host (FW `lib/pbio/include/pbio/protocol.h#L589-L616`):

| Type | Name       | Payload                                                                                |
| ---- | ---------- | -------------------------------------------------------------------------------------- |
| `1`  | RESPONSE   | the command's tag, then the 32-bit status (0: accepted; as a Bluetooth write's result) |
| `2`  | EVENT      | the bytes of a Bluetooth notification: status report or stdout                         |
| `3`  | READ_REPLY | the read's service and id again, then the value (empty: unknown)                       |

How the hub handles them: FW `lib/pbio/src/serial.c#L256-L330` (a COMMAND's payload after the tag
is "the same as a BLE command write"; a READ is answered from the same function Bluetooth uses).

Reads MatPilot makes (FW `lib/pbio/include/pbio/protocol.h#L542-L575`,
`lib/pbio/sys/host.c#L201-L234`):

| What                        | Service | Id       |
| --------------------------- | ------- | -------- |
| Hub name                    | `1`     | `0x2A00` |
| Firmware version            | `1`     | `0x2A26` |
| Pybricks protocol version   | `1`     | `0x2A28` |
| Hub capabilities (11 bytes) | `2`     | `0x0003` |

The capabilities have the Bluetooth layout; over USB the largest command is **512 bytes**,
including the command byte (FW `lib/pbio/sys/host.c#L162-L176`,
`lib/pbio/platform/prime_hub_f4/pbsysconfig.h#L21`), so a program goes up in pieces of 507 bytes.

## 5. Rules MatPilot follows

1. **Open, then DTR.** Open the port (any baud rate; the link is not a real UART) and set
   `dataTerminalReady` (SPEC `#L321-L322`, `#L533`, `#L1007`). The hub sends events only while
   the port is open with DTR **and** the host has subscribed; closing the port ends the
   subscription (FW `lib/pbio/src/serial.c#L184-L245`).
2. **One request at a time.** The hub keeps one command reply and one read reply
   (FW `lib/pbio/src/serial.c#L380-L438`): MatPilot sends the next request only after the
   answer to the last, matching a RESPONSE by its tag and a READ_REPLY by its service and id. Events
   can arrive in between. Each request waits at most 5 s.
3. **Leaving:** STOP first if a program runs (ADR 0007), then SUBSCRIBE `0`, then close the port.
4. **A pulled cable does not stop the program**, as with a lost Bluetooth link: the firmware stops
   a program only on STOP, the stop button or shutdown (FW `lib/pbio/sys/program_stop.c#L56-L92`;
   ADR 0007 found the same at v4.0.1).

## 6. Browsers

Web Serial, per MDN's browser data (`api/Serial.json` at the commit above): Chrome 89 and newer
(Windows, macOS, ChromeOS, Linux), Edge (the same), Chrome for Android 148 and newer, Firefox 151
and newer; not Safari, so not iPad or iPhone. On Linux the user must be allowed to use serial
ports (usually the `dialout` group).

## Keeping this page current

Re-cite everything at one new commit when moving to another Pybricks release; do not mix versions
on this page.
