# WINDMOON Workspace

- `workspace-menu-a-joined.svg`: selected A lockup, warm ivory for the dark navigation.
- `workspace-report-a-joined.svg` / `.png`: matching vertical A lockup for PDF and print headers.
- `workspace-mark.svg`: original wave, warm ivory, for the narrow navigation.

The new lockups reuse the exact path from `mark.svg`, with outlined Pretendard
SemiBold lettering (license in `../fonts/OFL.txt`). They load no external fonts.
Original brand files remain available to the separate menu and card editors.
The joined wordmark removes only the space in WINDMOON. Letter scaling,
weight, colors and all other shapes match the previously published menu A logo.
PDF and print now use the same vertical A composition in dark green.
The older filenames remain available for already-open tabs.

To maintain the SVGs, run `python scripts/build-workspace-brand.py` with fontTools.
Render the report SVG at 1800 × 960 pixels for the transparent PDF PNG.
