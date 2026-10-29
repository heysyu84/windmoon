# WINDMOON Workspace

- `workspace-menu-a-400-600.svg`: selected A lockup, warm ivory for the dark navigation.
- `workspace-report-a-400-600.svg` / `.png`: matching vertical A lockup for PDF and print headers.
- `workspace-mark.svg`: original wave, warm ivory, for the narrow navigation.

The new lockups reuse the exact path from `mark.svg`, with outlined Pretendard
Regular 400 for WINDMOON and SemiBold 600 for WORKSPACE (license in
`../fonts/OFL.txt`), without an added outline stroke. Each line uses its
corresponding installed font's glyphs.
They load no external fonts.
Original brand files remain available to the separate menu and card editors.
The WINDMOON name has no space. Letter layout, target sizes, wave and colors
retain the previously published vertical A composition; only lettering weight
changes. PDF and print use the matching dark-green lockup.
The older filenames remain available for already-open tabs.

To maintain the SVGs, run `python scripts/build-workspace-brand.py` with fontTools.
Render the report SVG at 1800 × 960 pixels for the transparent PDF PNG.
