# ADR 0004: All spatial units are millimetres

- Status: Accepted
- Date: 2026-11-04

## Context

Future MatPilot features describe physical space: mat profiles, the positions and sizes of objects
on a mat, robot dimensions, and distances in generated programs. Mixing units (centimetres in one
place, studs or inches in another) causes conversion bugs that are easy to miss and that show up
only as a robot stopping in the wrong place.

LEGO parts, competition mats, and printed rules are commonly measured in millimetres, and
millimetres give enough precision for LEGO robots without fractions in most values.

## Decision

**Every spatial quantity in MatPilot models is expressed in millimetres.** This covers stored data
(mat profiles, object positions and sizes, robot geometry), internal computations, and values passed
to generated hub code.

- Field and parameter names carry the unit when it is not obvious, for example `widthMm` or
  `wheelDiameterMm`.
- The UI may show other units only as a display conversion at the edge; the model stays in
  millimetres.
- Angles and time are not spatial lengths and are outside this decision; they will be specified when
  first needed. (Specified in [ADR 0016](0016-robots-and-mats.md), section 2: degrees and
  seconds, with the MAT and ROBOT frames.)

## Consequences

- One unit across data, logic, and generated code; no conversion inside the model.
- Imported data in other units must be converted on import.
- Any Pybricks API whose units differ must be converted at the code-generation boundary, with the
  upstream unit cited in the code.
