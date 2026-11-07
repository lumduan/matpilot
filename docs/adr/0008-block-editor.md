# ADR 0008: The block editor: Blockly, with MatPilot's own blocks for Pybricks

- Status: Accepted; decision 6 amended 2026-11-05 (see the end); decisions 2 and 3 amended for the
  simple blocks by [ADR 0010](0010-simple-blocks.md)
- Date: 2026-11-05

## Context

Milestone 4 adds block programming. The maintainer asked for a block editor that works like the
one in Pybricks Code as a baseline, with categories for setup, output, input, flow, tasks,
variables and other, and to add MatPilot's own parts (such as a controller choice) later.

- **Pybricks Code's block editor cannot be reused.** The public Pybricks Code repository is MIT
  licensed, but its `package.json` has no Blockly dependency at the commit checked
  ([pybricks-code `package.json` @ `ea9af98`](https://github.com/pybricks/pybricks-code/blob/ea9af98d1fd0a842ed76d3a7f83767f363bc1b17/package.json)).
  The block editor on code.pybricks.com is not in that repository, so there is no source or
  licence to build on. MatPilot builds its own blocks and copies no artwork, icons or text.
- **Blockly** (Apache-2.0, [RaspberryPiFoundation/blockly](https://github.com/RaspberryPiFoundation/blockly))
  is the standard block library. It runs with this site's Content Security Policy: it needs inline
  styles and `data:` images, which the policy already allows, and no `eval`. The maintainer's
  other project uses it the same way, with self-hosted media.
- **The hub's MicroPython is not CPython.** At Pybricks v4.0.1 it has `math` and `random`, but no
  `numbers` module and no `sys.exit`. Every citation is in `src/lib/blocks/pybricks.ts`.
- **Generated programs must follow the hub code rules** in [CLAUDE.md](../../CLAUDE.md).

## Decision

1. **Blockly 13.4.0**, pinned exactly. It loads only on `/blocks`, through a dynamic import in
   `src/hooks/useBlocksEditor.ts`.
   - Its images and cursors are copied to `/vendor/blockly-media/` by
     `scripts/vendor-assets.mjs`; `scripts/verify-export.mjs` fails the build if they are missing.
   - Its sounds are not copied, and the editor runs with `sounds: false`.
   - The Content Security Policy is unchanged.
2. **One block, one Pybricks call.**
   - The Python of every block is in `src/lib/blocks/generator.ts`.
   - Every Pybricks name it uses is cited in `src/lib/blocks/pybricks.ts`.
   - Blockly's built-in blocks are used for conditions, loops, numbers, text and variables. Their
     Python is replaced where MicroPython differs (`math_change`, which imports `numbers`).
3. **Devices are typed Blockly variables.**
   - The "set up" block holds one block per device, with its name, port, and (for motors) its
     forward direction.
   - Other blocks choose a device by name.
   - The toolbox offers the next free port of the maintainer's bench layout. New blocks name the
     first device of their type.
4. **The generated program has a fixed shape:** Config (ports), Setup (hub, devices, timer, and
   variables starting at 0), then Main. The hub code rules apply as follows:
   - **Rule 1:** when any motor is set up, Main runs inside `try`/`finally`, and `finally` stops
     every motor. Stop raises `SystemExit` in the program, so `finally` runs.
   - **Rule 2** (catch `OSError` around controller reads): there are no controller blocks yet.
     Milestone 5 adds them and must keep this rule.
   - **Rule 3:** ports are the Config section. Numbers typed into blocks stay where they are: the
     block is where a block programmer tunes them, and turning each into a named constant would
     make the Python harder to read. A named value is a variable.
   - **Rule 4:** ports appear only in Config; the program uses device names.
5. **Problems disable Run** until they are fixed. They are shown in a list and as warnings on the
   blocks:
   - a device that is used but not set up;
   - two devices on one port;
   - a device set up twice;
   - a missing or second "when the program starts" block.

   The Python is still shown while there are problems.

6. **The Python is visible beside the blocks.** It is read-only, with Copy and "Edit as Python" (renamed **Open in Program page** by [ADR 0014](0014-python-editing-on-blocks-page.md), which added editing the Python on this page),
   which opens it on `/program`.
7. **Run works exactly as on `/program`.** The program is compiled in the browser and uploaded
   through `HubConnection` ([ADR 0007](0007-ble-transport-writes.md)), and output goes to the
   same Monitor and Plotter. The "plot" block prints `name: value`, which the plotter draws.
8. **The workspace is saved in the browser** after every change. Saved data that cannot be loaded
   falls back to the starter program, with a notice.
9. **Not in this first set:**
   - **Tasks** (`multitask`): inside `run_task`, sensor reads and motor moves return awaitables
     and must be awaited
     ([`pb_type_async.c#L113-L151`](https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/pybricks/tools/pb_type_async.c#L113-L151),
     [`pb_type_device.c#L86-L130`](https://github.com/pybricks/pybricks-micropython/blob/4104553405decb0384bcfb030fbfcb4b5a9854cc/pybricks/common/pb_type_device.c#L86-L130)),
     so tasks need their own generator mode.
   - Controller blocks (milestone 5), functions, and lists.

## Consequences

- `/blocks` loads about 0.8 MB of extra JavaScript; other pages do not load it.
- **Tests:**
  - every generated test program is compiled with the real compiler;
  - the starter program's Python is compared line for line;
  - Blockly runs headless in Node with `jsdom`, a development dependency only. Blockly's package
    maps `jsdom` to `false` for browsers, so it is never shipped.
- **Hardware checks** are a checklist in [compatibility.md](../compatibility.md#blocks-checks-milestone-4).
- **Upgrading Blockly:**
  - check the `jsdom` peer range and the media file list;
  - check that the built-in blocks' Python still imports nothing MicroPython lacks;
  - check that no `eval` appears.

## Amendment, 2026-11-05: a full-window editor

After the first run on a hub, the maintainer reported that the block area was too narrow: a child
who tried it preferred MakeCode and Minecraft Education, where the blocks fill the screen. The
maintainer asked for the changes below, which replace decision 6.

- **The block area fills the window.** `/blocks` has its own slim top bar (view switch, Start
  over, Run, and a Connect button in the corner) instead of the site header, the hub card and the
  page text. The page does not scroll.
- **Python is a panel that opens and closes** beside the blocks (a sheet over them on phones), and
  a **Blocks | Python** switch shows the Python alone, filling the window, like Minecraft
  Education. The Python stays read-only; Copy and "Edit as Python" are unchanged. The choices are
  remembered in the browser.
- **The introduction folds away.** It shows for five seconds after the page loads (longer while the
  pointer or focus is in it), then folds up; a chevron opens it again. It also carries the footer's
  notices.
- **The Monitor and Plotter open in a drawer** at the bottom, side by side when both are open.
  While closed, their buttons show how many lines arrived and whether the plot has new values.
- **A device bar above the blocks** shows what is plugged into each port, with live values
  ([ADR 0009](0009-live-device-values.md)).
