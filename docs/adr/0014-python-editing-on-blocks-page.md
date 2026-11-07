# ADR 0014: Editing the Python on the Blocks page

- Status: Proposed (waits for the maintainer's decisions at the end of "Proposal")
- Date: 2026-11-07
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

**Decisions for the maintainer:**

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

## Consequences

- This is the largest feature so far. About 100 MatPilot blocks, plus Blockly's loop, logic,
  maths, text and variable blocks, each need a reader, and the round-trip test needs every one.
- Blocks stay the program. The program file still saves blocks, and the Python is still made
  from them.
- A child can read the Python, change a number or a line, and watch the blocks follow, or see
  exactly what is wrong and where.
- Once this is accepted, every new block needs its reader too. CLAUDE.md will say so.
