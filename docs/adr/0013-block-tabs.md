# ADR 0013: Tabs and functions in the block editor

- Status: Accepted
- Date: 2026-11-06 (decisions 10 and 11 added the same day, after the maintainer's first try;
  decision 11 extended after the second)
- Builds on: [ADR 0008](0008-block-editor.md) (block editor), [ADR 0010](0010-simple-blocks.md)
  (simple blocks)
- Amends: [ADR 0011](0011-save-load-github.md) decisions 2 and 3 (how opening a program is undone;
  the program file)

## Context

The maintainer asked, on 2026-11-06, for functions or small modules in the blocks:

- the SPIKE Prime and EV3 apps put every block on one page, so children keep scrolling back and
  forth, which is slow in real use;
- tabs like a browser's in the block area. The first tab, **main**, is always there; the user
  makes and renames the others;
- functions may be made in main or in another tab, "like putting a class in another file in C or
  Python". Main imports the other tabs by itself when a tab has blocks in it;
- the Python may be in several files too, one per tab, made from the blocks; main imports the
  others.

What the hub does with a program in several modules (Pybricks v4.0.1, cited in
`src/lib/blocks/pybricks.ts`):

- The upload is a list of modules (size, name, `.mpy`). The hub runs the first as `__main__` and
  imports the others by name. MatPilot already used this format, with one module
  ([protocol page, section 5](../protocol/pybricks-ble.md#5-program-format-multi-file-mpy-abi-v6)).
- `import name` looks first at the modules already loaded, then at the hub's built-in modules,
  then at the program's modules. Relative imports are refused. So a module of the program cannot
  have a built-in module's name.
- A program module is registered as loaded before its code runs. So two modules that import each
  other each get the other's module, and `other.function()` works once both have run.
- `from module import name` copies the value once; a later change in the module is not seen.
- `module.name = value` stores into a program module's own names (only a built-in module's are
  fixed), so every module that uses `module.name` sees the change.

After trying checks 1 to 5 the same day, the maintainer asked for three more things:

- copy and paste between tabs: Blockly pasted into the tab the blocks came from, even when that
  tab was hidden;
- a function that is cut and pasted back should work again: its calls still said it was gone;
- variables belonging to their tab is right ("private"), but there should also be global
  variables, just in case. Good code gives a function its values through its inputs, so they
  should rarely be needed.

After trying checks 11 to 13, the maintainer asked for two more:

- a way to delete a shared variable with a right-click, as a plain one is deleted. It could
  only be deleted from its block's list (▾), which was not found;
- a colour of their own for the 🌐 blocks: they had the plain variable blocks' colour.

## Decision

1. **Tabs.** Each tab is its own Blockly workspace; only the open one shows. Each keeps its own
   Undo history, scroll and zoom.
   - Main is always first. It cannot be renamed or closed, and it holds "when the program starts"
     and the "set up" block.
   - **+** makes a tab called `tab2` (then `tab3`, ...) and opens its name for typing at once.
     Double-tap a tab, or press its ✎, to rename it; × closes it.
   - Tab names are Python module names: lower case English letters, numbers and `_`, at most 20
     characters (`Dance moves` becomes `dance_moves`). Refused: `main`, `setup`, the names of
     MicroPython's and Pybricks' modules (with and without a `u` in front), Python's keywords and
     built-ins, the names the generated program uses (`robot`, `hub`, `wait`, ...), and the names
     of other tabs and functions.
   - A program has at most 10 tabs.
2. **Functions** are a new category, **Functions**, with three blocks:
   - **define** `name` (with inputs): a hat block holding the blocks to run. ⊕ adds an input
     (`x`, `y`, `z`, ...), ⊖ removes the last; at most 5.
   - **call**: runs a function. Tap its name to choose another; it shows the function's inputs,
     each with a value (0 by default).
   - **input** `name`: an input's value, inside its own define block.

   Function and input names are Python names in English letters (spaces become `_`). A function
   name is unique in the whole program (a copy becomes `name2`) and is never a tab's name. A call
   block finds its function by the define block's id, so renaming a function, or moving it to
   another tab, keeps every call working. Functions return no value yet.

3. **Which functions a tab may use:** its own, and those of the other tabs except main; main may
   use them all. Main is the program, not a module, so a tab cannot import it; a call from another
   tab to a function in main is a problem. The define block's right-click menu has **Move to the
   tab "…"**, which moves the function and keeps its calls.
4. **Variables belong to their tab**, as a module's names do in Python. A value goes into a
   function through its inputs. A function says `global` for the module names it uses: its tab's
   variables, and the motor speeds and shared variables when the program is one file. Shared
   variables, which every tab can use, are decision 11.
5. **Python files.**
   - While no tab but main has a function, the program stays **one file**, exactly as before tabs,
     with a Functions section before Main when main has functions.
   - Once another tab has a function, the program is **several files**: `main.py` (the module the
     hub runs, `__main__`), one file per tab with functions (named after the tab), and `setup.py`
     with the Config, Setup and Helpers sections (every port, device, the drive base, the
     controller's connection and the helpers). `setup.py` is left out when it would be empty.
   - `main.py` imports every tab with functions (the maintainer's request); a tab imports the
     tabs it uses. A call to another tab's function goes through its module, `moves.square(200)`,
     which also works when two tabs use each other. Names from `setup.py` are imported by name
     (`from setup import robot, motor_c`), but a motor's speed, which a tab may change, is used as
     `setup.motor_c_speed`, so every tab sees the change. Each file imports only what it uses.
   - The hub code rules still hold: main's program runs in `try`/`finally` and stops every motor;
     the tuning constants are in one Config section (in `setup.py`); ports are used by name.
6. **The program as a whole.**
   - "when the program starts" and "set up" belong in main; elsewhere they are a problem.
   - Every tab gets main's device variables (same id and name), so the detailed blocks can name
     the devices set up in main. The Setup category of another tab says devices are set up in
     main.
   - The movement motors and wheel size, the controller in use, and the fingers it keeps busy are
     read from all tabs.
   - Problems name their tab; tapping one opens the tab and selects the block. A tab with
     something to fix has a dot.
7. **Undo.** ↶ and ↷ act on the open tab. A change to the whole program (opening a file, Start
   over, closing a tab that has blocks, moving a function) keeps the program from before it, and
   the notice that appears has **Undo**, which puts back the tabs, the blocks, the name and the
   GitHub file. This replaces ADR 0011's undo step for opening a program (decision 2): the custom
   `mp_program_meta` event is gone.
8. **The program file** is version 2: `tabs` (each `name` and `workspace`, main first) and
   `python` (each file's name and lines). A version 1 file opens as a program with only main. In
   the browser the program is kept as `matpilot.blocks.tabs.v2`; the old
   `matpilot.blocks.workspace.v1` is read once, when there is no program in tabs yet.
9. **The page.** The Python panel has a button per file and shows the open tab's file; a tab
   with no functions shows a note instead. **Edit as Python** (the one-file editor on `/program`; now **Open in Program page**, [ADR 0014](0014-python-editing-on-blocks-page.md))
   is turned off for a program of several files. **Run** compiles every file and sends them as one
   program, main first.

10. **Copy and paste between tabs.** Ctrl+V (⌘V) pastes into the tab you are in, near the
    middle of what it shows, also when the blocks were copied in another tab; within one tab,
    Blockly's own paste is unchanged. The right-click menu gets **Copy** on a block and **Paste**
    on the empty block area (where it was opened), for touch screens and for children who do not
    know the keys. A pasted define block gets a new id, so a call whose define block is gone runs
    the one function with its name, if there is exactly one: a function that is cut and pasted, in
    its own tab or another, keeps its calls.
11. **Shared variables** are for a value that really belongs to the whole program. The Variables
    category has the tab's own variables first, then **Create shared variable...** and the 🌐
    blocks: **set shared**, **change shared**, and the value. The category says that inputs are
    the better way to give a function a value.
    - A shared variable is in every tab, with the same name; renaming it in one tab renames it in
      all. The plain variable blocks list only the tab's own variables, so a shared one is always
      shown with the 🌐.
    - Its name is used by nothing else: making one refuses a name a tab's variable or a device
      has, and a tab variable or a function with a shared variable's name is a problem.
    - Deleting it from one tab deletes it in every tab. When other tabs have blocks that use it,
      that is a change to the program as a whole (decision 7): the notice says how many blocks went
      and has **Undo**. Undo and Redo inside one tab never take blocks from another tab.
    - Right-click a 🌐 block in the Variables category: **Delete the '…' variable** and **Rename
      the '…' variable** come first in the menu, as Blockly offers on the plain variable block
      there; the block's list (▾) has the same two. Both take Blockly's own steps: Rename asks for
      the name, and Delete asks first when blocks in the open tab use the variable. Then the rules
      above apply. On the blocks of a tab the right-click menu stays Blockly's own, as for the
      plain blocks.
    - The 🌐 blocks are a brighter pink than the plain variable blocks (`#e10089`, the plain ones
      `#be185d`): the same family, so both read as variables, told apart at a glance. Their OKLab
      distance is 9.3, at least 14 from every other block colour, and white text on them has a
      contrast of 4.6:1 (`src/lib/blocks/theme.ts`, which a test holds to 4.5:1 for every block
      colour). The 🌐 and the word "shared" still say it without colour.
    - Python: in a program of one file, a module variable in the Setup section (`laps = 0`), and a
      function that changes it says `global`. In a program of several files, setup.py's **Shared
      variables** section, and every file uses it as `setup.laps`, never `from setup import laps`,
      which would copy it once (the context above).

## Consequences

- A big program can be split into tabs, and its Python reads like a small project of modules.
- Children meet a real Python rule: a variable belongs to its file. The messages say what to do,
  and inputs are the way to give a function a value. When a value must be shared, the 🌐 blocks
  make it visible in the blocks, and `setup.laps` in the Python shows where it lives.
- A function in main cannot be shared with other tabs; **Move to the tab** fixes that in one step.
- Undo of a whole-program change is in the notice only, for one step, while the notice shows
  (12 seconds). Before this, ↶ could also undo opening a program. Deleting a shared variable that
  other tabs use is one of these changes.
- Pasting into the open tab replaces Blockly's paste key with a wrapper (`src/lib/blocks/
clipboard.ts`); a Blockly upgrade that changes the paste shortcut needs a look there.
- Programs from before tabs make the same Python as before (the tests check it).
- **Checked on a hub on 2026-11-07:** a program of three modules (`main`, a tab, `setup`) ran on
  the maintainer's SPIKE Prime, and a shared variable was changed in one module and read in
  another ([tabs and functions checks](../compatibility.md#tabs-and-functions-checks-milestone-4)
  6, 7, 14 and 15; [results](../compatibility.md#blocks-results)). The firmware code that runs it
  is cited above. Before that, the generated files were compiled with the hub's compiler (in the
  tests), and two such programs were run once under CPython with stand-in `pybricks` modules (not
  part of the tests).
- **Not built:** functions that return a value, moving tabs around, copying a tab, typed inputs.
