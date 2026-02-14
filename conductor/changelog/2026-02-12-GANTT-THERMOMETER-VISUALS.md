# Changelog: Gantt Thermometer Visuals

**Date:** 2026-02-12
**Task ID:** UX-007
**Status:** Verified

## Changes
- **Gantt Task Bar Overhaul**: Implemented a "thermometer" effect for task progress visualization.
    - **Opacity-Based Duration**: The total task duration bar now uses a subtle 20% opacity status color (`hex + '33'`).
    - **Solid Progress Fill**: The completed portion of the task uses 100% solid status color, creating a high-contrast visual.
    - **Dynamic Label Readability**: Task titles now automatically switch between white and dark slate colors based on the progress bar's position to ensure legibility.
    - **Priority Framing**: Maintained consistent priority-colored borders for clear task categorization.
- **Centralized Hex Tokens**: Added hex color values to `STATUS_COLORS` and `PRIORITY_COLORS` in `frontend/src/constants/colors.ts` to support surgical opacity control.

## Verification
- **Visual Audit**: Confirmed high-contrast progress bars are clearly distinguishable from the subtle remaining duration track.
- **Legibility Check**: Verified text color transitions correctly when progress passes 50%.
