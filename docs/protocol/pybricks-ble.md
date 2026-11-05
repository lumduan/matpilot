# Pybricks BLE protocol (what MatPilot uses)

This page documents the parts of the Pybricks Bluetooth Low Energy protocol that MatPilot needs to
upload a program, start and stop it, and show its output. Every statement is cited to upstream
source at a fixed commit. Nothing here is from memory, blogs, or tutorials.

| Source                                                                   | Version               | Commit                                     |
| ------------------------------------------------------------------------ | --------------------- | ------------------------------------------ |
| [pybricks-micropython](https://github.com/pybricks/pybricks-micropython) | v4.0.1                | `4104553405decb0384bcfb030fbfcb4b5a9854cc` |
| [pybricksdev](https://github.com/pybricks/pybricksdev) (reference tool)  | v2.3.2                | `65210a23f53cc62a4b32c0599eac398aeea0c282` |
| [pybricks/micropython](https://github.com/pybricks/micropython)          | (submodule of v4.0.1) | `13580b6ad057173f62e8b2363e01d6851bcc6699` |

Short link prefixes used below:

- **FW** = `https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/`
- **DEV** = `https://github.com/pybricks/pybricksdev/blob/65210a23f53cc62a4b32c0599eac398aeea0c282/`

The tested hardware baseline is a SPIKE Prime hub on Pybricks v4.0.1, which reports protocol
version 1.5.0 ([FW lib/pbio/include/pbio/protocol.h#L24-L30][proto-version]; verified on hardware
2026-11-04, see [compatibility.md](../compatibility.md#hardware-test-record)).

## 1. GATT layout

The UUIDs are already cited in [`src/lib/pybricks/uuids.ts`](../../src/lib/pybricks/uuids.ts).

| Characteristic            | UUID                                   | Use                                                        |
| ------------------------- | -------------------------------------- | ---------------------------------------------------------- |
| Pybricks command/event    | `c5f50002-8280-46da-89f4-6d8051e4aeef` | Write commands to the hub; receive events as notifications |
| Pybricks hub capabilities | `c5f50003-8280-46da-89f4-6d8051e4aeef` | Read once after connecting                                 |

- Every command and every event is one GATT value. Its **first byte is the command or event
  type**, as the firmware's command handler shows: `pbio_pybricks_command_t cmd = data[0];`
  ([FW lib/pbio/sys/command.c#L39][cmd-handler]).
- Events arrive only after the client subscribes to notifications on the command/event
  characteristic. pybricksdev subscribes before anything else
  ([DEV pybricksdev/connections/pybricks.py#L308-L310][dev-notify]).

## 2. Hub capabilities (read)

The value is 11 bytes in protocol 1.5 ([FW protocol.h#L456-L459][caps-size]), encoded by
`pbio_pybricks_hub_capabilities()` ([FW lib/pbio/src/protocol/pybricks.c#L39-L63][caps-encode]):

| Offset | Size | Field                      | Notes                                                                                                                                          |
| ------ | ---- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 0      | 2    | max write size (LE)        | the largest value one write may carry: MTU − 3, at most 512 over BLE ([FW lib/pbio/drv/bluetooth/pybricks_service_server.c#L89-L92][caps-ble]) |
| 2      | 4    | feature flags (LE)         | table below                                                                                                                                    |
| 6      | 4    | max user program size (LE) | bytes; reject bigger programs before uploading                                                                                                 |
| 10     | 1    | number of program slots    | SPIKE Prime: 5 (`PBSYS_CONFIG_HMI_NUM_SLOTS`, [FW lib/pbio/platform/prime_hub/pbsysconfig.h#L13][slots])                                       |

pybricksdev reads it the same way ([DEV pybricksdev/ble/pybricks.py#L354-L376][dev-caps]).

Feature flags ([FW protocol.h#L401-L448][feature-flags]):

| Bit | Flag                                                 | Since |
| --- | ---------------------------------------------------- | ----- |
| 0   | Built-in REPL                                        | 1.2.0 |
| 1   | Program format: multiple `.mpy` files, ABI v6        | 1.2.0 |
| 2   | Same, ABI v6.1 with native modules                   | 1.3.0 |
| 3   | Built-in port view program                           | 1.4.0 |
| 4   | Built-in IMU calibration program                     | 1.4.0 |
| 5   | Same multi-file format, ABI v6.3 with native modules | 1.5.0 |

MatPilot uploads bytecode only (no native code), so it requires **bit 1**. It uses **bit 0** (the
REPL) for live device values when present (section 8).

## 3. Commands (write to command/event)

From `pbio_pybricks_command_t` ([FW protocol.h#L86-L208][commands]) and the firmware's handler,
which dispatches on byte 0 ([FW command.c#L39][cmd-handler]). All integers are little-endian.

| Byte 0 | Command                 | Payload after byte 0                      | Firmware behaviour                                                                                                              |
| ------ | ----------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `0x00` | STOP_USER_PROGRAM       | none                                      | stops the running program                                                                                                       |
| `0x01` | START_USER_PROGRAM      | optional 1 byte: program id (since 1.4.0) | starts that program, or the selected slot when absent; more than 1 payload byte is rejected ([FW command.c#L47-L54][cmd-start]) |
| `0x03` | WRITE_USER_PROGRAM_META | `u32` program size                        | sets the stored program size ([FW command.c#L63-L65][cmd-meta])                                                                 |
| `0x04` | WRITE_USER_RAM          | `u32` offset, then data (0–507 bytes)     | copies data into the program area at that offset ([FW command.c#L67-L69][cmd-ram])                                              |
| `0x06` | WRITE_STDIN             | data (0–512 bytes)                        | queued as stdin for the program; BUSY when the stdin buffer is full ([FW command.c#L75-L83][cmd-stdin])                         |
| `0x07` | WRITE_APP_DATA          | `u16` offset, then data                   | writes into a buffer the program allocated (since 1.4.0)                                                                        |

Not used by MatPilot: `0x02` START_REPL (deprecated in favour of START_USER_PROGRAM with id 128)
and `0x05` REBOOT_TO_UPDATE_MODE.

Errors come back as the ATT error of the write request ([FW protocol.h#L209-L236][errors]):
`0x80` invalid command, `0x81` busy (for example START while a program runs, or META/RAM writes
over a running program), and the standard `0x01`, `0x0E`, `0x13` (value not allowed).

## 4. Events (notifications from command/event)

From `pbio_pybricks_event_t` ([FW protocol.h#L240-L292][events]):

| Byte 0 | Event           | Payload after byte 0                                                                                                                                               |
| ------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0x00` | STATUS_REPORT   | `u32` status flags, `u8` running program id, `u8` selected slot ([FW pybricks.c#L31-L37][status-encode]; 7 bytes in total, [FW protocol.h#L396-L397][status-size]) |
| `0x01` | WRITE_STDOUT    | bytes the program wrote to stdout (since 1.3.0)                                                                                                                    |
| `0x02` | WRITE_APP_DATA  | bytes the program sent as app data (since 1.4.0)                                                                                                                   |
| `0x03` | WRITE_TELEMETRY | marked "Unreleased. Should not be considered final." — **not used**                                                                                                |

Status flags are bit numbers ([FW protocol.h#L294-L394][status-flags]). The ones MatPilot reads:

| Bit | Flag                         | Meaning for the UI               |
| --- | ---------------------------- | -------------------------------- |
| 0   | BATTERY_LOW_VOLTAGE_WARNING  | show a low-battery warning       |
| 1   | BATTERY_LOW_VOLTAGE_SHUTDOWN | the hub is about to shut down    |
| 5   | POWER_BUTTON_PRESSED         | informational                    |
| 6   | USER_PROGRAM_RUNNING         | drives the Run/Stop button state |
| 7   | SHUTDOWN                     | the hub is shutting down         |

**Stdout is a byte stream, not lines.** One notification can end in the middle of a line, or in
the middle of a multi-byte UTF-8 character. pybricksdev buffers stdout and splits it into lines
itself ([DEV connections/pybricks.py#L146-L150][dev-stdout]). MatPilot must decode with a
streaming UTF-8 decoder and split lines on its side.

## 5. Program format: "multi-file mpy, ABI v6"

The uploaded program is a concatenation of modules. For each module:

| Field | Size     | Content                                                 |
| ----- | -------- | ------------------------------------------------------- |
| size  | 4 (LE)   | length of the `.mpy` data that follows the name         |
| name  | variable | module name, UTF-8, NUL-terminated                      |
| mpy   | `size`   | the module compiled by `mpy-cross` (MicroPython `.mpy`) |

- pybricksdev builds exactly this ([DEV pybricksdev/compile.py#L257-L264][dev-format]). The entry
  module is named `__main__` ([DEV compile.py#L240][dev-main]).
- The firmware reads the same layout, as `mpy_info_t` ([FW bricks/_common/micropython.c#L142-L149][fw-mpyinfo]).
  It finds modules by name ([FW micropython.c#L176-L181][fw-find]) and runs `__main__`
  ([FW micropython.c#L228-L244][fw-main]).
- The `.mpy` files must use MicroPython's format version 6. The v4.0.1 firmware defines
  `MPY_VERSION 6` and `MPY_SUB_VERSION 3`
  ([pybricks/micropython py/persistentcode.h#L37-L38][mpy-version]).
- pybricksdev compiles ABI v6 with the `mpy_cross_v6` compiler
  ([DEV compile.py#L75][dev-mpycross]). MatPilot uses Pybricks' browser build of it,
  `@pybricks/mpy-cross-v6` ([ADR 0006](../adr/0006-adopt-pybricks-mpy-cross.md)).
  - Its output is byte-for-byte identical to pybricksdev's compiler (PyPI `mpy-cross-v6` 1.1.2)
    on a corpus of programs: `src/lib/pybricks/compiler.golden.test.ts`.
  - The packer in `src/lib/pybricks/mpy.ts` matches pybricksdev's own packed output.
  - Both compilers write the header `4d 06 00 1f`: version 6, bytecode, sub-version 0, 31-bit
    small ints.
  - The firmware checks the sub-version only for native code
    ([pybricks/micropython py/persistentcode.c#L465-L473][mpy-check]), so this header loads on
    v4.0.1.

## 6. Upload, start, stop (the sequence)

Taken from pybricksdev's `download_user_program()`, `start_user_program()` and
`stop_user_program()` ([DEV connections/pybricks.py#L442-L535][dev-download]). Every write is a
write **with response**.

```
1. read capabilities                     → max_write_size, max_program_size, num_slots
2. if program size > max_program_size     → refuse (too big)
3. WRITE_USER_PROGRAM_META, size 0        ("clear user program meta so hub doesn't try to run invalid program")
4. for each chunk of (max_write_size - 5) bytes:
       WRITE_USER_RAM, offset, chunk      (5 = 1 command byte + 4 offset bytes)
5. WRITE_USER_PROGRAM_META, program size  ("notify that writing was successful")
6. START_USER_PROGRAM                     (with no slot byte when num_slots == 0, otherwise with the slot)
7. stop at any time: STOP_USER_PROGRAM
```

**What stops a program.** The firmware stops a running program only on the STOP command, the stop
button, or shutdown ([FW lib/pbio/sys/program_stop.c#L73-L88][fw-stop]). On SPIKE Prime the stop
button is the centre button ([FW lib/pbio/platform/prime_hub/pbsysconfig.h#L12][fw-stop-button]),
and a program can change or disable it ([FW program_stop.c#L46-L53][fw-stop-set]). **Losing the
Bluetooth connection does not stop the program.** MatPilot's write design follows from this
([ADR 0007](../adr/0007-ble-transport-writes.md)).

Stdin is written as WRITE_STDIN chunks of at most `max_write_size - 1` bytes
([DEV connections/pybricks.py#L378-L412][dev-stdin]).

## 7. Things the hub can do that MatPilot will use later

- **Xbox controller.** `pybricks.iodevices.XboxController` exists in v4.0.1
  ([FW pybricks/iodevices/pb_module_iodevices.c#L92][fw-xbox]) and is enabled on SPIKE Prime
  ([FW bricks/primehub/mpconfigport.h#L41][fw-xbox-prime]). The controller connects to the hub,
  not to the browser ([ADR 0003](../adr/0003-hub-direct-gamepad.md)).
- **App data channel.** `pybricks.tools.AppData` exists in v4.0.1
  ([FW pybricks/tools/pb_module_tools.c#L305][fw-appdata]). It carries binary data both ways
  (command `0x07`, event `0x02`) without mixing it into the text output. The first plotter parses
  printed lines instead; AppData is an option for faster telemetry later.

## 8. REPL sessions (live device values)

MatPilot shows what is plugged into each port by running a small reader in the hub's built-in
REPL ([ADR 0009](../adr/0009-live-device-values.md)). Code typed into the REPL is never stored,
so the program in the selected slot stays there and still starts from the hub's button.

- **Availability.** Feature flag bit 0 says the hub has the REPL (section 2); SPIKE Prime builds it
  in ([FW pbsysconfig.h#L4][repl-prime]). START_USER_PROGRAM with program id `128` starts it
  ([FW protocol.h#L58-L61][program-ids]); the id byte needs protocol 1.4.0 (section 3). MatPilot
  uses this rather than the deprecated `0x02` START_REPL.
- **Status.** While the REPL runs, the status report's running program id is `128` (section 4), so
  MatPilot can tell it from the user's program (slots 0 to 4).
- **What the REPL is.** The firmware imports every `pybricks` module and creates `hub` first
  ([FW micropython.c#L383-L389][repl-start]), then runs MicroPython's friendly REPL
  ([FW micropython.c#L100-L139][repl-run]). It prints the prompt `>>> ` ([MP py/repl.h#L49-L51][ps1]).
- **Paste mode.** Ctrl-E (`0x05`) on an empty line enters paste mode, which prints
  `paste mode; Ctrl-C to cancel, Ctrl-D to finish` and `=== `, then echoes every byte it reads
  (a carriage return as `\r\n=== `). Ctrl-D (`0x04`) ends the paste and runs it as a file
  ([MP shared/runtime/pyexec.c#L628-L652][paste]). MatPilot sends `\n` line endings only.
- **Stdin is small.** SPIKE Prime keeps 64 bytes of stdin ([FW pbsysconfig.h#L21][stdin-size]), of
  which the ring buffer holds 63 ([FW lwrb.c#L274-L286][lwrb]); a WRITE_STDIN that does not fit is
  refused with BUSY ([FW command.c#L75-L83][cmd-stdin]). MatPilot never has more than 60 pasted
  bytes that the REPL has not yet echoed, so a paste cannot overflow it.
- **Ending it.** STOP raises `SystemExit` in the running code
  ([FW micropython.c#L45-L57][stop-exit]); the REPL turns `SystemExit` into a forced exit and
  returns, which ends the program ([MP pyexec.c#L142-L145][forced-exit],
  [MP pyexec.c#L671-L674][repl-return]). The reader also ends itself with `raise SystemExit`.

Stdin during the REPL session carries the paste and then one keep-alive byte (`.`) a second; the
reader exits by itself when the keep-alives stop.

## Keeping this page current

Change this page when MatPilot starts using another command or event, and when the tested
firmware baseline moves. Re-cite every link at the new commit; do not mix versions.

[proto-version]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/include/pbio/protocol.h#L24-L30
[cmd-handler]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/sys/command.c#L39
[dev-notify]: https://github.com/pybricks/pybricksdev/blob/65210a23f53cc62a4b32c0599eac398aeea0c282/pybricksdev/connections/pybricks.py#L308-L310
[caps-size]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/include/pbio/protocol.h#L456-L459
[caps-encode]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/src/protocol/pybricks.c#L39-L63
[slots]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/platform/prime_hub/pbsysconfig.h#L13
[caps-ble]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/drv/bluetooth/pybricks_service_server.c#L89-L92
[dev-caps]: https://github.com/pybricks/pybricksdev/blob/65210a23f53cc62a4b32c0599eac398aeea0c282/pybricksdev/ble/pybricks.py#L354-L376
[feature-flags]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/include/pbio/protocol.h#L401-L448
[commands]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/include/pbio/protocol.h#L86-L208
[cmd-start]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/sys/command.c#L47-L54
[cmd-meta]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/sys/command.c#L63-L65
[cmd-ram]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/sys/command.c#L67-L69
[cmd-stdin]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/sys/command.c#L75-L83
[errors]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/include/pbio/protocol.h#L209-L236
[events]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/include/pbio/protocol.h#L240-L292
[status-encode]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/src/protocol/pybricks.c#L31-L37
[status-size]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/include/pbio/protocol.h#L396-L397
[status-flags]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/include/pbio/protocol.h#L294-L394
[dev-stdout]: https://github.com/pybricks/pybricksdev/blob/65210a23f53cc62a4b32c0599eac398aeea0c282/pybricksdev/connections/pybricks.py#L146-L150
[dev-format]: https://github.com/pybricks/pybricksdev/blob/65210a23f53cc62a4b32c0599eac398aeea0c282/pybricksdev/compile.py#L257-L264
[dev-main]: https://github.com/pybricks/pybricksdev/blob/65210a23f53cc62a4b32c0599eac398aeea0c282/pybricksdev/compile.py#L240
[fw-mpyinfo]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/bricks/_common/micropython.c#L142-L149
[fw-find]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/bricks/_common/micropython.c#L176-L181
[fw-main]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/bricks/_common/micropython.c#L228-L244
[mpy-version]: https://github.com/pybricks/micropython/blob/13580b6ad057173f62e8b2363e01d6851bcc6699/py/persistentcode.h#L37-L38
[dev-mpycross]: https://github.com/pybricks/pybricksdev/blob/65210a23f53cc62a4b32c0599eac398aeea0c282/pybricksdev/compile.py#L75
[mpy-check]: https://github.com/pybricks/micropython/blob/13580b6ad057173f62e8b2363e01d6851bcc6699/py/persistentcode.c#L465-L473
[dev-download]: https://github.com/pybricks/pybricksdev/blob/65210a23f53cc62a4b32c0599eac398aeea0c282/pybricksdev/connections/pybricks.py#L442-L535
[dev-stdin]: https://github.com/pybricks/pybricksdev/blob/65210a23f53cc62a4b32c0599eac398aeea0c282/pybricksdev/connections/pybricks.py#L378-L412
[fw-xbox]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/pybricks/iodevices/pb_module_iodevices.c#L92
[fw-xbox-prime]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/bricks/primehub/mpconfigport.h#L41
[fw-appdata]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/pybricks/tools/pb_module_tools.c#L305
[fw-stop]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/sys/program_stop.c#L73-L88
[fw-stop-button]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/platform/prime_hub/pbsysconfig.h#L12
[fw-stop-set]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/sys/program_stop.c#L46-L53
[repl-prime]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/platform/prime_hub/pbsysconfig.h#L4
[program-ids]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/include/pbio/protocol.h#L58-L61
[repl-start]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/bricks/_common/micropython.c#L383-L389
[repl-run]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/bricks/_common/micropython.c#L100-L139
[ps1]: https://github.com/pybricks/micropython/blob/13580b6ad057173f62e8b2363e01d6851bcc6699/py/repl.h#L49-L51
[paste]: https://github.com/pybricks/micropython/blob/13580b6ad057173f62e8b2363e01d6851bcc6699/shared/runtime/pyexec.c#L628-L652
[stdin-size]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/platform/prime_hub/pbsysconfig.h#L21
[lwrb]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/lwrb/src/lwrb/lwrb.c#L274-L286
[stop-exit]: https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/bricks/_common/micropython.c#L45-L57
[forced-exit]: https://github.com/pybricks/micropython/blob/13580b6ad057173f62e8b2363e01d6851bcc6699/shared/runtime/pyexec.c#L142-L145
[repl-return]: https://github.com/pybricks/micropython/blob/13580b6ad057173f62e8b2363e01d6851bcc6699/shared/runtime/pyexec.c#L671-L674
