# ADR 0019: LEGO® MINDSTORMS EV3 support (a plan)

- Status: **Accepted** 2026-11-08 for D1 to D3 (see
  [Decisions for the maintainer](#decisions-for-the-maintainer)); D4 to D6 still wait for the
  maintainer, and their recommendations stand. Proposed the same day, when the maintainer asked
  for a plan ("plan for LEGO EV3: what we would need to add for it to work with our project").
- Built so far: the Docs' steps to put Pybricks v4 on an EV3 (Get started, "LEGO MINDSTORMS EV3
  (coming soon)", 2026-11-08).
- Date: 2026-11-08
- Builds on: [ADR 0018](0018-usb-connection.md) (the USB serial link, which an EV3 speaks too),
  [ADR 0010](0010-simple-blocks.md) (the simple blocks), [ADR 0016](0016-robots-and-mats.md)
  (robots and mats), [ADR 0017](0017-lego-part-builder.md) (robots from LEGO® models).

## Context

MatPilot programs one hub: SPIKE Prime with Pybricks. Many schools and WRO teams still have EV3
bricks. The question is what MatPilot would need so a child can program an EV3 the same way.

Every Pybricks fact below was read from source on 2026-11-08 and is cited at
pybricks-micropython v4.1.3, commit `c860b6a00301fb7c6ecd429da11dcb5a6c557c7a` ("FW" =
`https://github.com/pybricks/pybricks-micropython/blob/c860b6a00301fb7c6ecd429da11dcb5a6c557c7a/`),
unless another source is named. Nothing was tried on an EV3.

## What was found

### 1. Pybricks runs on the EV3 itself now

- Since v4.0.0 Pybricks ships **its own EV3 firmware**, with no ev3dev Linux and no microSD card
  (FW `CHANGELOG.md#L443-L475`, `#L525-L528`; `bricks/ev3/README.md#L26-L27`). Every stable
  release since v4.0.0 includes it (`pybricks-ev3-v4.x.zip`, GitHub releases).
- Coding over Bluetooth came in v4.1.0b4 (FW `CHANGELOG.md#L118-L131`), stable from v4.1.0.
- **Pybricks' own documents disagree about how finished it is.** `bricks/ev3/README.md#L1`,
  `#L72-L74` still says "Work in progress" and "highly experimental"; pybricks.com still sends EV3
  users to the old v2.0 (ev3dev, microSD) instructions (fetched 2026-11-08); the API docs dropped
  their "EV3 legacy" note on 2026-10-12 (pybricks-api commit `e610a0a`). Treat the EV3 as newer
  and less exercised than SPIKE Prime.

### 2. Installing it

Pybricks' installer at code.pybricks.com flashes the EV3 over WebHID: with the brick off, hold the
right button, press the centre button, release both at "Updating…", then connect the USB cable;
the brick is then USB `0x0694:0x0006` and the browser lists it as "LEGO EV3 Firmware Update"
(pybricks-code `ea9af98` `src/firmware/bootloaderInstructions/translations/en.json#L15-L49`,
`src/firmware/bootloaderInstructions/BootloaderInstructions.tsx#L59`, `#L174-L331`,
`src/firmware/sagas.ts#L1063-L1080`; FW `lib/lego/lego/usb.h#L17-L18`). Pybricks' own notes put
the cable in first and say it may stay plugged in (FW `bricks/ev3/README.md#L30-L35`); either order
works by those two sources. _(Corrected 2026-11-08: this paragraph first gave only the notes'
order.)_

An EV3 running **ev3dev** starts it from a microSD card and never changes the brick's own firmware;
to switch back, shut down and remove the card (ev3dev.github.io `1f1981bbb258` `index.md#L80-L84`).
So the card comes out to use Pybricks (taking it out first is the simple order), and ev3dev is used again by restoring LEGO's
firmware and putting the card back (ev3dev starts from the card on LEGO's firmware:
`docs/getting-started.md#L173-L178`). The same installer restores LEGO's firmware (1.09H, 1.09E or
MakeCode; `src/firmware/sagas.ts#L1354-L1410`). As for SPIKE, MatPilot would link to it, not
flash anything itself.

### 3. Connecting: USB is nearly free; Bluetooth is a new kind

| Link      | What an EV3 on Pybricks v4.1.1+ offers                                                                                                                                                                                                                                                                                                                                                                          | For MatPilot                                                                                                                                                                                                                                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| USB       | The same CDC ACM serial port and COBS protocol as SPIKE Prime, product id `0x0005` (FW `lib/pbio/drv/usb/usb_ev3.c#L4-L5`, `lib/pbio/platform/ev3/pbdrvconfig.h#L127-L131`)                                                                                                                                                                                                                                     | Add the product id to the port filter; everything else is ADR 0018's link                                                                                                                                                                                                                                                           |
| Bluetooth | **Classic RFCOMM only; the EV3 has no BLE** (FW `lib/pbio/platform/ev3/pbdrvconfig.h#L48-L53`). An RFCOMM serial service, class UUID `c5f50101-8280-46da-89f4-6d8051e4aeef`, channel 1, one host at a time, the same framed protocol (FW `lib/pbio/drv/bluetooth/bluetooth_btstack.c#L1811-L1829`, `#L1984-L1994`, `#L3309-L3321`; `lib/pbio/src/protocol/pybricks.c#L119-L131`; `lib/pbio/src/serial.c#L4-L5`) | Not Web Bluetooth: **Web Serial over RFCOMM**, after pairing the brick in the computer's Bluetooth settings ("Add new computer" on the brick, FW `lib/pbio/sys/hmi_ev3_ui.c#L106-L110`). The first real message must arrive within 5 s or the brick drops the link (FW `lib/pbio/src/serial.c#L31-L36`, `#L162-L170`, `#L280-L291`) |

In the browser (WICG Web Serial at `418b5afa`, `index.bs#L116-L216`; MDN browser-compat-data at
`82daeeb`, `api/Serial.json#L135-L214`): `requestPort({ filters: [{ bluetoothServiceClassId }],
allowedBluetoothServiceClassIds })` lists paired Bluetooth Classic serial ports, in Chrome and Edge
117+ on computers and Chrome for Android 138+; **not Firefox, not Safari**. Whether it behaves the
same on Windows, macOS and Linux is not documented; it must be tried.

The commands, events, reads and capability layout are the same shared firmware code as SPIKE's
(FW `lib/pbio/sys/command.c#L44-L104`, `lib/pbio/sys/host.c#L201-L234`). What differs: 4 program
slots, a larger program size (a little under 192 KiB a slot), no port-view flag, the hub kind
`0xE2` in the PnP id (FW `lib/pbio/include/pbio/protocol.h#L510-L511`), and the **back button**
stops a program (FW `lib/pbio/platform/ev3/pbsysconfig.h#L16`). The program format is the same
multi-file .mpy v6, and the same compiler works (FW `lib/pbio/platform/ev3/pbsysconfig.h#L8`).

### 4. The Python is different enough to need its own blocks

|                  | SPIKE Prime (today)                                             | EV3 on Pybricks v4.1                                                                                                                                                                              |
| ---------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hub              | `PrimeHub`: 5×5 light matrix, IMU, centre button stops          | `EV3Brick`: 178×128 **screen**, **no IMU**, light red/green only, back button stops (FW `pybricks/hubs/pb_type_ev3brick.c#L17-L73`, `bricks/ev3/mpconfigport.h#L21`)                              |
| Devices          | `pupdevices`: Motor, ColorSensor, UltrasonicSensor, ForceSensor | `ev3devices`: Motor, TouchSensor (`pressed()` only), ColorSensor, UltrasonicSensor, **GyroSensor**, **InfraredSensor** (FW `pybricks/ev3devices/pb_module_ev3devices.c#L11-L24`); NXT devices too |
| Ports            | A–F                                                             | **A–D** for motors, **S1–S4** for sensors (FW `lib/pbio/platform/ev3/pbdrvconfig.h#L87-L94`)                                                                                                      |
| Motor top speeds | 1000 °/s (L and M)                                              | Large **800 °/s**, Medium **1200 °/s** (FW `lib/pbio/src/motor/servo_settings.c#L232-L247`)                                                                                                       |
| DriveBase        | with `use_gyro`                                                 | without `use_gyro` (FW `bricks/ev3/mpconfigport.h#L58-L60`)                                                                                                                                       |
| Controller       | Xbox (BLE)                                                      | **no Xbox** (no BLE); the name is an alias for `PlayStationController` (FW `pybricks/iodevices/pb_module_iodevices.c#L109-L122`)                                                                  |

The firmware accepts `PrimeHub` and `pupdevices` as aliases "for easy beta testing", but MatPilot's
SPIKE programs would still fail on an EV3 (no `display`, no `imu`, no `force()`): EV3 programs need
EV3 names.

### 5. LEGO® models

The EV3 brick, motors and sensors are all in MatPilot's size table (95646, 95658, 99455, 95648,
95650, 95652, 99380, 95654), but not in its 3D shapes (`scripts/ldraw-library.mjs` picks SPIKE
and Technic parts), and `src/lib/ldraw/parts.ts` knows only SPIKE parts' shafts and sensor fronts.

## Proposal

EV3 as a **second hub type**, step by step, each step useful on its own:

1. **12a · Hub type and connecting.** A program (and a robot) has a hub type, SPIKE Prime or EV3,
   chosen with "Start over" or in the program's settings; connecting reads the hub kind and warns
   when it does not match. USB: add product id `0x0005`. The firmware steps for EV3 in the Docs.
2. **12b · EV3 blocks.** The generator writes `EV3Brick` and `ev3devices` for an EV3 program. The
   toolbox follows the hub type: ports A–D and S1–S4 on the port picture (a drawing of the EV3);
   the 5×5 light blocks become **screen** blocks (write text, show a picture, clear); hub tilt goes
   away and **gyro sensor** blocks come in; the touch sensor has "is pressed" only; the light has
   red and green, no blue (FW `lib/pbio/platform/ev3/platform.c#L99-L142`); no controller blocks. Movement, motors, colour, distance, sound, control,
   conditions, functions and tabs stay as they are. Every new block gets its Python reader and
   vocabulary word, and every Pybricks name its citation, as today.
3. **12c · Bluetooth for EV3.** Web Serial over RFCOMM, through the same link as USB, after the
   brick is paired in the computer's settings (the Docs show how). Chrome and Edge only.
4. **12d · The rest of the app.** Live values for EV3 devices; EV3 motor speeds for robots and
   the calibration helper; the simulated EV3 for runs on a mat (motors, colour, ultrasonic, gyro,
   the screen as text); EV3 parts in the LEGO® model reader and 3D view.

Rough size, against what was built for SPIKE: 12a small, 12b the largest (comparable to the simple
blocks of ADR 0010), 12c medium, 12d medium.

## Decisions for the maintainer

- **D1 · Do it, and when?** Recommended: yes, after the SPIKE checks on v4.1.3 are done, because
  the EV3 shares the USB link and much of the protocol, and many teams own EV3s. **Answered
  2026-11-08: start now** ("เริ่มได้เลย"), with the steps to install Pybricks v4 on the EV3 in the
  Docs first.
- **D2 · An EV3 to test on.** **Answered 2026-11-08: the maintainer has an EV3**, at present
  running ev3dev. Trying MatPilot on it means installing Pybricks v4 on it with Pybricks'
  installer first (section 2); each step then gets its checklist as SPIKE's did.
- **D3 · How a program knows its hub.** Recommended: a hub type on the program and on the robot,
  with the toolbox following it, and a warning when the connected hub differs. Alternative: detect
  the hub on connecting and switch blocks then (simpler, but a program could not be written for an
  EV3 without one connected). **Answered 2026-11-08: remember it** ("จำ"): the program and the
  robot keep their hub type, as recommended.
- **D4 · Bluetooth for EV3 (12c).** Recommended: yes, but after USB works, since it needs pairing
  in the operating system, works only in Chrome and Edge, and its behaviour per operating system
  is not documented.
- **D5 · Pybricks' own status.** Pybricks' website still calls the old v2.0 the EV3 path, while
  its releases ship v4 for EV3. Recommended: support only Pybricks v4.1.1+ on EV3, say in the Docs
  that it is newer on EV3 than on SPIKE, and point to Pybricks' installer.
- **D6 · Extras, later or never:** the gyro in DriveBase (not available on EV3), the infrared
  sensor and beacon, NXT sensors, the PlayStation controller over Bluetooth Classic, drawing
  pictures on the screen.

## Consequences (if accepted)

- A new milestone, 12, in the roadmap, after 11 (the USB link) and 4 (the blocks).
- docs/protocol gains the EV3's USB product id, the RFCOMM service and the PnP hub kind, cited.
- docs/compatibility.md gains EV3 rows and checks.
- The generator, the readers, the vocabulary, the simulator and the live values reader each grow
  an EV3 branch; their tests cover both hubs.
