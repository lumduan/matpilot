# ADR 0014: Editing the Python on the Blocks page

- Status: Accepted
- Date: 2026-11-07 (proposed; accepted the same day, with every recommended option, and built;
  amended the same day after the maintainer's tries: suggestions, help, comments kept, colours)
- Builds on: [ADR 0006](0006-adopt-pybricks-mpy-cross.md) (the compiler in the browser),
  [ADR 0008](0008-block-editor.md) (block editor), [ADR 0010](0010-simple-blocks.md) (simple
  blocks), [ADR 0013](0013-block-tabs.md) (tabs, and changes undone from the notice)

## Context

After the hub checks of 2026-11-07, the maintainer asked to edit the Python directly on the Blocks
page. Python that is not correct must not update or save the blocks, and the page should say
"syntax error" or mark the wrong place in red.

What exists:

- Blocks are the program. The generator turns them into Python in one direction only; the Python
  panel is read-only.
- **Edit as Python** opens a one-file program on the Program & Monitor page, where it is plain
  text with no way back to blocks. It is off for a program of several files.
- The hub's own compiler runs in the browser (ADR 0006). For a syntax error it reports a message
  and a line, but no column (`src/lib/pybricks/compiler.ts`).
- The problems list already marks blocks that cannot run (a port that is not set, a function that
  is gone, ...).
- An AI helper is proposed at the same time ([ADR 0015](0015-ai-helper.md)). Its "write code" mode
  produces Python, and turning that into blocks needs the same converter.

## Proposal

1. **Edit mode.** The Python panel gets **Edit**. The open tab's file becomes editable, and that
   tab's blocks are read-only while it is (one source at a time). **Update blocks** applies the
   text; **Cancel** goes back to the blocks as they were.
2. **The editor:** CodeMirror 6 with its Python language support (MIT licence, bundled with the
   site, so no other origin). It gives line numbers, colours, and a red underline at the exact
   place of an error, with the message next to it. The alternative is a plain text box with the
   wrong line marked: lighter, but it cannot point inside a line.
3. **Three checks, each pointing at the place:**
   1. _Python syntax_, as you type, from the editor's parser. **Update blocks** also runs the
      hub's compiler: its message and line are what the hub would say.
   2. _Fits the blocks:_ every statement and expression must match a block. If one does not, it
      is underlined with "There is no block for this yet".
   3. _The usual problems_ (ports, functions, devices), as for blocks today.

   Only when 1 and 2 pass does **Update blocks** replace the tab's blocks. It is one change,
   shown in the green notice with **Undo**, like the other whole-program changes (ADR 0013).
   Wrong Python is never saved as blocks. The text stays in the editor until it is fixed or
   cancelled.

4. **The converter** (new, `src/lib/blocks/from-python.ts`) is the generator in reverse, block by
   block. Each block's generator gets a matching reader. A test keeps the two directions in step:
   for every test program, blocks → Python → blocks → Python gives the same Python.
5. **What can be edited first:** the open tab's own file (`main.py` or a tab's file): Main,
   functions and variables. `setup.py` and the Config section come from the devices and settings
   and stay read-only. They are changed with the blocks.
6. **What the blocks cannot keep:** comments, blank lines and spacing. After **Update blocks** the
   Python is written again in the generator's layout. Comments could become block comments later.
7. **Simple or detailed blocks:** when the same Python could come from a simple block or a
   detailed one (ADR 0010), the converter uses the kind the replaced blocks used. Where there were
   none, it uses the simple blocks.

**Decisions for the maintainer** (taken on 2026-11-07, see "Decision"):

- **D1, Python that has no block:**
  - (a) refuse it with a red mark, as asked. Recommended for the first version;
  - (b) keep it in a grey "Python" block that holds the lines as written. That accepts any correct
    Python, and AI-written code too, but those lines no longer read as blocks.
- **D2, the editor:**
  - CodeMirror 6 (recommended; its size will be measured, and it is expected to be far smaller
    than Blockly);
  - or a plain text box.
- **D3, the first version:**
  - the open tab's file only (recommended), with `setup.py` read-only;
  - or every file.
- **D4, comments:**
  - dropped in the first version (recommended);
  - or kept as block comments.

## Decision

The maintainer chose every recommended option on 2026-11-07 ("เอาตามที่แนะนำ", as recommended):

- **D1:** Python that has no block is refused, with a red mark where it is.
- **D2:** CodeMirror 6 is the editor.
- **D3:** the open tab's file only; `setup.py` and the Config section stay read-only.
- **D4:** comments are dropped when the blocks are updated. (➡️ Changed the same day, at the
  maintainer's request: comments are kept as block comments; see the amendment below.)

As built:

- **Where the code is:**
  - the converter: `src/lib/blocks/from-python/`
    - `syntax.ts`: Lezer's Python parser, which the editor also uses for its colours;
    - `reader.ts`: one reader per block;
    - `shadows.ts`: each input's toolbox shadow;
    - `tab.ts`: the editable parts, and the tab's new blocks;
  - the editor: `src/lib/blocks/python-editor.ts`;
  - the page: `src/hooks/usePythonEditing.ts` and `src/components/blocks/PythonEditPane.tsx`.
- **The test** `from-python/tab.test.ts` reads every block of every toolbox category back, and
  checks that the program makes the same Python. It also covers:
  - directions, units and signs, and expressions in inputs;
  - the controller blocks, and functions and calls across tabs;
  - shared variables, in one file and in several;
  - the problems and where they are marked.
- **Locked parts:** the parts made from the blocks are grey, and the editor refuses edits there.
  While Python is edited, that tab's blocks are locked; the other tabs, Run, Load and Start over
  wait. The problems are checked 0.3 s after typing stops. **Update blocks** compiles with the
  hub's compiler first, and its message is shown if it refuses.
- **When two blocks make the same Python:** the reader keeps the kind the replaced blocks used
  (their type and their fields: simple or detailed, rotations or degrees); where there were none,
  it uses the first it lists.
- **Blocks that make no Python of their own** ("use the controller", "set movement motors", "set
  wheel size") are kept: they go first in the program, or in a tab's first function. Blocks that
  were turned off are not in the Python, so they are gone; the notice says how many.
- **The old Edit as Python button** (one file, as text, on the Program & Monitor page) is now
  called **Open in Program page**, so that it is not confused with **Edit**.
- **Loading:** the editor (CodeMirror, about 330 KB) and the converter (about 135 KB with
  Lezer's parser) load when Edit is pressed. The Blocks page loads as before.

## Amendment, after the maintainer's first try (2026-11-07)

The maintainer tried the checks and asked for two things:

- **Suggestions and help, like an editor such as VS Code,** because a beginner does not know the
  names. While typing, the editor now suggests what may come next: after `robot.` what the robot
  can do, after `hub.display.` what the 5×5 lights can do, and on its own the program's
  variables, devices, functions and tabs as well as `print`, `wait`, `for`, `if` and the rest.
  Ctrl+Space shows them at any time. A suggestion, and the name under the pointer, show a short
  help: the call's shape, what it does with its units, the block it becomes, and an example.
  - The words are in `from-python/vocabulary.ts`. Each example is read back into its block by a
    test, so the help cannot promise Python the converter refuses.
  - The units are the ones the blocks themselves show. The Pybricks calls are cited in
    `pybricks.ts`.
- **How to leave a comment in the Python.** D4 is changed: comments are kept.
  - A `#` line becomes the comment of the block below it.
  - A `#` at the end of a line, or indented under the last line of a loop, goes to that line's
    block.
  - Comments after the last line go to the last block; under Main with no block at all, they go
    to "when the program starts".
  - Blockly already writes a block's comment into the Python as `#` lines above its code, so after
    Update blocks the comment is still there: above its line, and in the block's comment bubble.
- **Colours like VS Code** (asked for after the second try): the Python had only a few colours
  in the editor, and none in the read-only panel. Both now use one colouring,
  `src/lib/blocks/python-colors.ts`, modelled on VS Code's Dark+ and Light+ themes:
  - purple: flow keywords and imports;
  - blue: `def`, `True`, `and` and the like;
  - orange: text in quotes; light green: numbers; green: comments;
  - yellow: functions; teal: classes and modules; light blue: constants and variables;
  - brackets coloured by depth.
    The colours are CSS variables, with one set for the light theme and one for the dark. The
    read-only view loads the colouring after the page, so the plain text shows first.
- **Found while testing it:** the editor's width changed when its scroll bar came and went (when
  the problem list below it grew or shrank). Long lines then wrapped differently than the editor
  had measured: the line numbers and the help under the pointer were a line off. The scroll bar's
  room is now always kept, and the error-marker column has a fixed width.

## Consequences

- This is the largest feature so far. About 100 MatPilot blocks, plus Blockly's loop, logic,
  maths, text and variable blocks, each need a reader, and the round-trip test needs every one.
- Blocks stay the program. The program file still saves blocks, and the Python is still made
  from them.
- A child can read the Python, change a number or a line, and watch the blocks follow, or see
  exactly what is wrong and where.
- Every new block needs its reader too, in `from-python/reader.ts`. CLAUDE.md says so, and the
  round-trip test fails for a toolbox block without one.
