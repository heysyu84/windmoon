# WIND MOON Workspace

- `workspace-menu-a.svg`: selected A lockup, warm ivory for the dark navigation.
- `workspace-report-c.svg` / `.png`: selected C lockup for PDF and print headers.
- `workspace-mark.svg`: original wave, warm ivory, for the narrow navigation.

The new lockups reuse the exact path from `mark.svg`, with outlined Pretendard
SemiBold lettering (license in `../fonts/OFL.txt`). They load no external fonts.
Original brand files remain available to the separate menu and card editors.

To maintain the SVGs, run `python scripts/build-workspace-brand.py` with fontTools.
Render the report SVG at 2000 × 320 pixels for the transparent PDF PNG.
