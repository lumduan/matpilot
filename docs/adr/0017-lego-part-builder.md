# ADR 0017: Building a robot from LEGO parts

- Status: **Accepted** 2026-11-08: the maintainer asked to build it ("continue with item 5,
  because it is a very good feature"), so route A with the recommended D1, D3 and D4; D2 as
  amended in [Decisions](#decisions-2026-11-08); D5 (asking LDraw.org) is still the maintainer's
  choice. Built: [step 10a-1](#built-step-10a-1-2026-11-08), reading a model and making the
  robot profile from it, and [step 10a-2](#built-step-10a-2-2026-11-08), the model in 3D
- Date: 2026-11-08
- Builds on: [ADR 0016](0016-robots-and-mats.md) section 7 (this is that "own ADR"), whose robot
  profile is the contract a part builder writes; [ADR 0002](0002-static-export-no-server-features.md)
  (static files only); the rule that the page makes no requests to other sites (CLAUDE.md, hard
  constraint 3).

## Context

On 2026-11-07 the maintainer asked, for the future, to build the robot from LEGO parts in the page,
"like BrickLink's tools or other sites that build a robot from parts", and to get the robot's size,
wheels and sensors from the model. ADR 0016 built everything that uses a robot profile (the Robots
page, programs, runs on a mat, the calibration helper), so a builder only has to **write a robot
profile**: body width, length and height, where the wheels' axle is, the wheel diameter and the
axle track, the drive motors and their ports, and each sensor's type, port, position and facing,
in the ROBOT frame (origin between the drive wheels, +x forward, +y left), in millimetres.

This ADR is the research ADR 0016 asked for, and a recommendation. Every fact below was checked on
2026-11-08 at the source named; facts that could not be confirmed are listed as such.

## What was found

### The LDraw parts library: the open library LEGO builders use

- **Licence.** The library is licensed under Creative Commons Attribution: parts submitted or
  edited on or after 2023-03-05 carry `0 !LICENSE Licensed under CC BY 4.0 : see CAreadme.txt`,
  older ones `CC BY 2.0 and CC BY 4.0`
  ([CAreadme.txt](https://library.ldraw.org/library/official/CAreadme.txt);
  [Contributor Agreement](https://www.ldraw.org/article/349)). Attribution means naming the
  author, the work, the licence and its link, and saying if a part was changed; each part file's
  header names its author. The part files stay CC BY: they are not relicensed under MatPilot's MIT
  licence. A model that only refers to official parts is not a derivative work (CAreadme).
- **Shipping only some parts.** No LDraw page speaks of a subset. CC BY allows sharing in any
  medium, so serving a subset with every header kept, the licence texts and an attribution notice
  appears allowed. **Not confirmed with LDraw**; worth one question to them before building.
- **Size.** Release 2026-10: 17,230 parts ([library.ldraw.org](https://library.ldraw.org/));
  `complete.zip` is 146,853,687 bytes (about 147 MB), dated 2026-10-26 (its `Content-Length`).
  Far too large to load in a page; only the parts a model uses can be.
- **SPIKE Prime is in it**, all official, CC BY 4.0, by Philippe Hurbain, each with the keyword
  "Spike Prime" ([parts folder](https://library.ldraw.org/library/official/parts/)):

  | Part                    | LDraw file                                  | Its description in the library                                                 |
  | ----------------------- | ------------------------------------------- | ------------------------------------------------------------------------------ |
  | Hub                     | `45601.dat`                                 | Electric Powered Up 6 Port Hub with Yellow Bottom without Rechargeable Battery |
  | Large angular motor     | `54675.dat` (`54675c01.dat` with its cable) | Electric Powered Up Large Angular Motor with Medium Azure Back                 |
  | Medium angular motor    | `54696p01.dat` (`54696p01c01.dat`)          | … Medium Angular Motor with Medium Azure Back and Hub Pattern                  |
  | Colour sensor           | `37308.dat` (`37308c01.dat`)                | Electric Powered Up Colour Sensor                                              |
  | Distance sensor         | `37316.dat` (`37316c01.dat`)                | Electric Powered Up Distance Sensor                                            |
  | Force (touch) sensor    | `37312.dat` (`37312c01.dat`)                | Electric Powered Up Force Sensor                                               |
  | Wheel with tyre (small) | `39367p01.dat`                              | Wheel 14 x 48 with 4 Spokes with Integral Medium Azure Tyre                    |
  | Wheel with tyre (large) | `49295p01.dat`                              | Wheel 14 x 80 with 4 Spokes with Integral Medium Azure Tyre                    |

  The descriptions do not give a wheel's diameter as printed on its tyre; MatPilot would measure
  it from the part's shape and check it against a real wheel.

- **The format** ([file format](https://www.ldraw.org/article/218.html),
  [MPD](https://www.ldraw.org/article/47.html)): plain text. A model (`.ldr`) places parts by
  line type 1: colour, position, a 3 × 3 rotation, and the part's file name. A multi-part document
  (`.mpd`) holds several files in one, between `0 FILE` lines. The unit is the LDraw unit,
  **1 LDU ≈ 0.4 mm** ("approximations", the page says; a brick is 20 LDU wide and 24 LDU high);
  the frame is right-handed with **−Y up**.

### Showing a model in the page

- **three.js** has an LDraw loader (`examples/jsm/loaders/LDrawLoader.js`), MIT like the rest of
  three.js ([licence](https://github.com/mrdoob/three.js/blob/dev/LICENSE),
  [docs](https://threejs.org/docs/pages/LDrawLoader.html)). It does not include the parts library
  ("due to its large size"): it finds parts in a folder on the page's own site, or reads a
  "packed" `.mpd` that already holds every part it uses (made offline by three.js's
  `utils/packLDrawModel.mjs`). Each part becomes a group named by its file name, so the hub, the
  motors, the sensors and the wheels can be found by part number. Like pdf.js and MicroPython, it
  would be served from `/vendor/`, loaded only on the page that needs it.

### Building elsewhere: BrickLink Studio and others

- **BrickLink Studio** exports LDraw: **File → Export As → .ldr or .mpd** (MPD when the model
  has submodels) ([Studio help](https://studiohelp.bricklink.com/hc/en-us/articles/6502197862679-Exporting-to-other-formats)).
  Its own `.io` files are ZIP files with an LDraw model inside, by a community description
  ([LDraw wiki](https://wiki.ldraw.org/wiki/IO)), not by BrickLink; whether they are still
  password-protected was not confirmed. Studio's terms: "You cannot redistribute or sell the
  Studio software or parts of it"; designs are their makers'
  ([IP guidance](https://studiohelp.bricklink.com/hc/en-us/articles/6610276581015-IP-Guidance-Statement)).
  ⇒ MatPilot reads the LDraw file a child exports, never Studio's library or `.io` internals.
- **LeoCAD** (GPL-2.0), **LPub3D** (GPL-3.0) and **LDView** (GPL-2.0) cannot be copied into an
  MIT app; **LDCad** is closed ("all rights reserved"); **Mecabricks** is a closed web service.
  **buildinginstructions.js** (BrickHub.org) is released under the Unlicense and built on three.js
  ([repo](https://github.com/LasseD/buildinginstructions.js)): its code could be reused.
- **Snapping parts together** needs data on where parts connect. The open data is LDCad's
  "shadow library", **CC BY-SA 4.0**
  ([repo](https://github.com/RolandMelkert/LDCadShadowLibrary)); at its 2026-09-10 head it has no
  file for the hub, the motors, the sensors or the two wheels above (they may inherit connection
  points from the shapes they are made of; not confirmed). Its format description is on LDCad's
  site with no licence stated.

## Options

| Option                                                                                                         | What a child does                                                                                                                                  | Cost                                                                                                                                           | Risk                                                                                                   |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **A. Import a model built elsewhere** (Studio, LeoCAD, LDCad: all free) and work out the robot profile from it | Builds the robot in Studio, exports `.ldr`/`.mpd`, drops it on the Robots page, checks the numbers, taps each motor and sensor to give it its port | Moderate: a reader for line type 1, the SPIKE parts' shapes and sizes, the transform to the ROBOT frame, a ports picker; a 3D view is optional | Low: it writes the same profile the Robots page already checks; unknown parts are flagged, not guessed |
| **B. A small builder in MatPilot** for one kit (the SPIKE Prime set): pick parts, place them, snap them        | Builds in MatPilot                                                                                                                                 | Large: connection data for every part in the kit (the open data does not cover the electronics), a 3D editor, undo, saving                     | High: a weak editor is worse than Studio, which is free                                                |
| **C. A full builder like BrickLink Studio**                                                                    | Same as Studio                                                                                                                                     | Very large (Studio is years of work)                                                                                                           | Very high; and it would duplicate a free tool                                                          |

## Recommendation

**A first (milestone 10a), with a 3D view; B only if A is used and children ask to build inside
MatPilot; never C.** A gives children the real thing (Studio's builder, its parts, its building
instructions) and gives MatPilot what it needs: the robot's numbers, from the model instead of a
ruler. The calibration helper still corrects the wheels on the floor.

How A would work:

1. The child exports the robot from Studio as `.ldr` or `.mpd` and drops it on the Robots page
   (**Make from a LEGO model…**). A `.io` file gets the message "In Studio: File → Export As →
   LDraw".
2. MatPilot reads the model's parts (line type 1, through submodels), finds the hub, the motors,
   the sensors and the wheels by part number, and draws the model in 3D (three.js, self-hosted,
   loaded on that page only).
3. It works out a profile: the footprint and height from the model's bounding box (LDU × 0.4 →
   mm, −Y up turned into the ROBOT frame), the drive wheels as the two wheels on one axis, the
   axle track between their middles, the wheel diameter from the wheel part, the sensors'
   positions and the way each faces from their placement.
4. Ports are not in a model. The child taps each motor and sensor in the 3D view and picks its
   port; MatPilot suggests the drive motors (the ones turning the wheels).
5. The result is an ordinary robot profile, shown with the checks the Robots page already makes,
   and saved like any robot.

## Decisions for the maintainer (as proposed)

- **D1, route:** A (import), B (own builder) or C (full builder). **Recommended: A**, B later
  only if asked for.
- **D2, which part shapes are served:**
  - (a) only the parts in the SPIKE Prime sets, with their sub-shapes, from a pinned LDraw
    release; other parts in a model count for the size from their placement but are drawn as
    boxes and flagged (**recommended**: small, and what a SPIKE classroom uses);
  - (b) the whole library on this site, each part fetched only when a model needs it (about
    147 MB of files in every deployment);
  - (c) none: no 3D view, and the size only from the parts MatPilot knows.
    The list of parts in the SPIKE Prime sets needs a source whose terms allow it (or the sets'
    printed part lists); not researched yet.
- **D3, 3D view:** three.js loaded only on that page (**recommended**: children can see that the
  model is theirs before trusting its numbers), or a flat top view drawn from the parts' boxes
  (no new library).
- **D4, the model in the robot file:** keep a copy of the `.ldr`/`.mpd` in the
  `.matpilot-robot.json` (so it can be shown again elsewhere, and saved to GitHub with it;
  **recommended**, as mats keep their PDF), or keep only the numbers.
- **D5, asking LDraw:** write to LDraw.org to confirm that serving a subset of the library, with
  headers, licence texts and attribution, inside an MIT web app is fine (**recommended** before
  shipping).

## Decisions (2026-11-08)

- **D1: A**, import a model built elsewhere.
- **D2: (a), amended.** Two things were mixed in (a): the parts' **sizes** and their **shapes**.
  - Sizes: every part and primitive of the pinned release has its size in a table
    (`third_party/ldraw/boxes.json`: 27,807 boxes, 902 kB, about 190 kB compressed), made from
    the whole library by `scripts/ldraw-library.mjs` and loaded only when a model is opened. So a
    model's size counts every part it uses, not only the SPIKE ones, and no part is "a point".
  - Shapes (for the 3D view, step 10a-2): no list of the SPIKE Prime sets' parts was found whose
    terms are clear (Rebrickable's download page refused to be read, and its terms say nothing
    about its data's licence), so the subset is chosen from the library itself: every part with
    the keyword "Spike Prime", and the Technic families SPIKE robots are built from (beams, axles,
    pins, connectors, bushes, gears and the like: about 500 parts, 8 MB in 1,565 files with their
    sub-parts and primitives, 1.3 MB compressed). Any other part is drawn as a box of its true
    size.
- **D3: three.js**, loaded only by the model dialog (step 10a-2).
- **D4: kept.** The robot keeps the `.ldr`/`.mpd` text (up to 1 MB) in this browser and in its
  `.matpilot-robot.json`; the copy of a robot a program keeps leaves it out.
- **D5: not asked.** MatPilot has not contacted LDraw.org. The licence itself allows what MatPilot
  does: "You are free: To distribute, remix, adapt, and build upon the material in any medium or
  format, so long as attribution, as specified by the license, is given to the creator"
  (`CAreadme.txt`, section 2, shipped in `third_party/ldraw/` and on the site), and MatPilot gives
  it (NOTICE, the licence texts beside the files, and a credit in the dialog). Asking LDraw.org is
  a courtesy, the maintainer's to send.

## Built: step 10a-1 (2026-11-08)

On the Robots page, **From a LEGO model → Make from a LEGO model…** (`ModelDialog`):

1. The child chooses a `.ldr` or `.mpd` exported from Studio (or LeoCAD, LDCad). A Studio `.io`
   file gets "In Studio, choose File → Export As → LDraw (.ldr or .mpd)". Files over 1 MB, with more
   than 5,000 parts, or with submodels placing each other in a loop are refused with a reason.
2. `src/lib/ldraw/model.ts` reads it: every line type 1 through every submodel, colour 16
   inherited, a part the document carries itself (Studio does this for parts LDraw lacks) sized
   from its own lines.
3. `src/lib/ldraw/robot-from-model.ts` works out the robot:
   - each part is the box around its shape (`parts.ts`, from the size table), placed as the model
     places it;
   - the drive wheels: two level wheels on one line, the same size, preferring wheels on a motor's
     shaft. The SPIKE wheels are known exactly (56 mm and 87.8 mm, 14 mm wide); another wheel is
     sized from its box, a rim and its tyre counting as one;
   - the ROBOT frame: the origin between the drive wheels, the floor under them, forward square to
     their axle. LDraw is right-handed with −Y up, so left = up × forward; this was also checked
     on a printed tile (a "4" seen from above reads the right way round only in that frame);
   - which way is the front: a model does not say. MatPilot guesses (where a distance sensor looks,
     else the side the colour sensors are on, else the longer side of the body) and says why; the
     child can turn it round;
   - the drive motors: the motor whose shaft is on each wheel's axis, else the nearest (with a
     note). The motor whose shaft points to the robot's left is the one turned round, because
     Pybricks defines clockwise "by looking at the motor shaft"
     ([direction.rst#L26-L27](https://github.com/pybricks/pybricks-api/blob/e610a0a9a3ca4dcdd79342bfe11becbdfefe0c8f/doc/main/parameters/direction.rst#L26-L27));
     with both shafts out this gives "the left motor", as MatPilot's default robot and Pybricks'
     drive base example ("the motor on the left must turn counterclockwise",
     [drivebase_basics.py#L5-L8](https://github.com/pybricks/pybricks-api/blob/e610a0a9a3ca4dcdd79342bfe11becbdfefe0c8f/examples/pup/robotics/drivebase_basics.py#L5-L8)) have it;
   - the sensors: each one's front and the way it looks, snapped to the nearest of the six ways a
     profile has (a note when more than 20° off);
   - the body: the box around every part except the drive wheels, drawn as wide on both sides as
     its wider side (a note when the two sides differ by more than 10 mm).
     The SPIKE parts' facts (the hub; the large, medium and small motors with their shafts on the
     −Y side; the colour, distance and force sensors looking along −Z, the cable variants with
     their own offsets; the wheels) were read from their LDraw files and are checked against the
     size table by a test.
4. The dialog draws the model from above and from the side, every part's box coloured by what it
   is, the motors and sensors tagged (L, R, M1…, S1…) as in its list; the child picks the ports
   (starting from the robot's own where a motor or sensor matches) and names the other motors;
   it shows what changes on the robot, and the Robots page's own checks before "Use these
   numbers". The robot's name, speeds, mass and measured drift stay.

Checked: unit tests (a hand-built driving base worked out on paper, its `.mpd` form, the front
turned, motors facing in, notes, a rim with its tyre, refusals); the production build in headless
Chromium (`.io` and text files refused; a driving base with an arm motor and two sensors measured
and applied; kept across a reload); and a real 106 kB `.mpd` with 54 models and 1,155 parts
(Pybricks' own device drawings, MIT) read in about a second. Not yet checked: a robot exported
from Studio, against the real robot ([Robots check 10](../compatibility.md#robots-checks-milestone-7)).

## Built: step 10a-2 (2026-11-08)

The model dialog draws the model in 3D above the drawings from above and from the side:

- **Shapes** (D2 as amended): `third_party/ldraw/library/`, 1,622 files of the release unchanged
  (8.2 MB; each keeps its header naming its authors and licence): 591 parts (every part with the
  keyword "Spike Prime", the Technic beams, axles, pins, connectors, bushes, gears, cross blocks,
  angle connectors, plates, bricks, balls, panels, frames, worms and turntables, without patterns,
  stickers, aliases and obsolete parts, and the old names of those parts) and every sub-part and
  primitive they use. `shapes.json` maps each name a model places to its file; `LDConfig.ldr`
  gives the colours. All made by `scripts/ldraw-library.mjs`, served from `/vendor/ldraw/`.
- **Packing** (`src/lib/ldraw/pack.ts`): the model's own files and every library file it needs,
  fetched from this site once per visit, in one text, named as three.js's LDrawLoader looks them
  up (`\` → `/`; `s/` → `parts/s/`; `48/` → `p/48/`; lower case). A part the subset lacks
  becomes a box of its true size; one MatPilot has no size for, an empty part. LDrawLoader fails a
  whole model when one file is missing, so it is never left to look for one; a test runs the real
  loader on a packed model with any network fetch failing it.
- **Drawing** (`src/lib/ldraw/view3d.ts`, the only code that imports three.js, so it is loaded only
  when a model is shown: about 730 kB, 185 kB compressed): three.js 0.186.1 (MIT) with its
  LDrawLoader, the conditional-line material it needs, and OrbitControls (drag to turn, scroll to
  zoom), without smoothing curved surfaces (it took 2.5 s of the 3 s the loader needed for the
  driving base, on the page's main thread). The model stands on a floor grid in the ROBOT frame,
  with an arrow to the front; the
  motors and sensors are outlined and tagged as in the list. Turning the front round moves the
  model; it is not loaded again.
- If the browser cannot draw in 3D, the dialog says so and the drawings from above and from the
  side remain.
- Ports are picked in the dialog's list, whose tags match the 3D view and the drawings, not by
  tapping a part in the 3D view as "How A would work" step 4 proposed: a list works with a
  keyboard and a screen reader, and on a small screen.

Checked: unit tests (the packed driving base read by the real LDrawLoader; every placed name
found; a brick drawn as a box; an unknown part drawn as nothing); the production build in headless
Chromium with software WebGL: the driving base drawn with its SPIKE shapes (240 shape files fetched,
none failed, 7.3 s with software rendering), tags moving when the front is turned round and when
the view is dragged, a brick shown as a box with "One kind of part is drawn as plain boxes".

## Consequences

- No new site is contacted: the part shapes are served from MatPilot's own site under
  `/vendor/ldraw/`, copied by a script from a pinned release with every header kept, beside
  `CAreadme.txt` and the CC BY licence texts; NOTICE gains a section for the LDraw Parts Library
  (CC BY 4.0 and CC BY 2.0), crediting "The LDraw Parts Library", which LDraw's steering
  committee accepts as attribution for derivative works, and stating the licence terms, which its
  [legal page](https://www.ldraw.org/legal-info) asks of anyone who distributes the library; the
  page names the library where the model is shown.
- three.js joins the pinned dependencies (MIT), loaded only on that page; its size is measured
  when built.
- The robot profile (ADR 0016) does not change; a model only fills it in. Everything that uses a
  robot keeps working.

## Not confirmed

- Whether LDraw.org is content with a subset of its library inside an MIT app (D5).
- Whether the SPIKE electronics get connection points from the shapes they are made of (needed
  only for B).
- Whether Studio's current `.io` files are encrypted; whether parts that exist only in Studio
  appear in its LDraw export.
- The wheels' diameters as LDraw draws them (to be measured from the shapes).
- A source for the SPIKE Prime sets' part lists, and its terms.
