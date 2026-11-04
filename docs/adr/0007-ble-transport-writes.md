# ADR 0007: How MatPilot writes to the hub

- Status: Accepted
- Date: 2026-11-04

## Context

Until milestone 3, MatPilot only read from the hub, through the read-only hub probe
(`src/lib/ble/hub-probe.ts`). Running a program needs the first writes: upload, start, stop, and
stdin. It also needs notifications for status and stdout. CLAUDE.md requires a design before any
GATT write.

The protocol is documented, with citations, in [protocol/pybricks-ble.md](../protocol/pybricks-ble.md).
Two firmware facts shape the safety rules. Both are cited at Pybricks v4.0.1, commit `4104553`:

- **A program stops only on the stop command, the stop button, or shutdown.**
  - The stop command: [`lib/pbio/sys/command.c#L43-L45`](https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/sys/command.c#L43-L45).
  - The stop button and shutdown: [`lib/pbio/sys/program_stop.c#L73-L88`](https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/sys/program_stop.c#L73-L88).
  - On SPIKE Prime the stop button is the centre button: [`lib/pbio/platform/prime_hub/pbsysconfig.h#L12`](https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/platform/prime_hub/pbsysconfig.h#L12).
  - A program can change or disable its stop button: `pbsys_program_stop_set_buttons()`, [`program_stop.c#L46-L53`](https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/lib/pbio/sys/program_stop.c#L46-L53).
  - **A Bluetooth disconnect does not stop a running program.**
- **Writes can be rejected.** An ATT error comes back for a busy hub or an invalid command
  ([protocol page, section 3](../protocol/pybricks-ble.md#3-commands-write-to-commandevent)).

## Decision

1. **One writer.** Only `src/lib/ble/hub-connection.ts` (`HubConnection`) writes to the hub or
   starts notifications. The hub probe stays read-only, and its types still make writes
   impossible.
2. **Writes run one at a time, in order, each with response.** A promise queue serialises every
   GATT write. This matches pybricksdev, and Web Bluetooth implementations may reject operations
   issued in parallel.
3. **Check before writing.** After connecting, `HubConnection` reads:
   - the protocol version, and requires `1.x` with x ≥ 3 (stdout events);
   - the hub capabilities, and requires the ".mpy v6" format flag.
     A program bigger than the hub's reported maximum is refused before any write.
4. **Upload exactly as pybricksdev does.** Clear the size, write chunks of `max write size - 5`
   bytes, set the size, then send START without a slot byte, which starts the selected slot the
   program was just written to.
5. **Stopping is part of every exit path:**
   - the Stop button sends STOP;
   - `disconnect()` sends STOP first, waits at most 1.5 s, then disconnects;
   - leaving the page (`pagehide`, unmount) sends STOP without waiting, then disconnects.
6. **A lost link is reported, never hidden.** When the link drops while a program runs, the page
   says that the program keeps running on the hub and that the centre button normally stops it.
7. **Stdout is decoded as a stream.** A streaming UTF-8 decoder handles characters split across
   notifications, and lines are split on the page.
8. **Not yet used:** WRITE_APP_DATA (both directions), the REPL, and REBOOT_TO_UPDATE_MODE.
   Using any of them needs the protocol page extended first.

## Consequences

- Hub-writing code lives in one place with unit tests against fake GATT objects. Those tests
  check write order, chunk sizes, one write in flight, and stop-before-disconnect.
- `pagehide` cannot wait for the hub's reply, so a STOP sent while the page closes is best effort.
  The centre button remains the hub-side way to stop.
- Hardware verification of this milestone is a checklist in
  [compatibility.md](../compatibility.md#program-and-monitor-checks-milestone-3).
