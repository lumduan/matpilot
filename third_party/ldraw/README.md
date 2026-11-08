# LDraw data (ADR 0017)

Made from the LDraw Parts Library by `scripts/ldraw-library.mjs`; do not edit by hand. It is
copied to `/vendor/ldraw/` on build (`scripts/vendor-assets.mjs`) and loaded by the Robots page
only when a LEGO model is opened.

| File             | What it is                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| `boxes.json`     | Every part's and primitive's size: the smallest box around its shape in its own frame, in LDraw units   |
| `CAreadme.txt`   | The library's licence summary (CC BY 2.0 and CC BY 4.0), unchanged                                      |
| `CAlicense.txt`  | The CC BY 2.0 licence text, unchanged                                                                   |
| `CAlicense4.txt` | The CC BY 4.0 licence text, unchanged                                                                   |

Release: **ldraw.org Parts Update 2026-10**, from
`https://library.ldraw.org/library/updates/complete.zip` (dated 2026-10-26, 146,853,687 bytes,
SHA-256 `023083918da2d3697c794fb4267975509584f3611b993095874206a803fa610f`), downloaded
2026-11-08.

Licence: the LDraw Parts Library is licensed under CC BY 4.0 (parts edited before 2023-03-05 also
under CC BY 2.0); see `CAreadme.txt` and the LDraw section of [NOTICE](../../NOTICE). The data here
is adapted from it (each part reduced to its size) and keeps that licence.

To move to a newer release, follow the steps at the top of `scripts/ldraw-library.mjs`, update
the release, size and SHA-256 above and in NOTICE, and run the tests: `src/lib/ldraw/parts.test.ts`
checks the release name, the number of parts and the SPIKE parts' facts against the new table.
