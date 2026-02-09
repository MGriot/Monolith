# Changelog: FRONT-051-053 - Gantt Visual & Anchor Refinements

**Date:** 2026-02-07
**Task IDs:** FRONT-051, FRONT-052, FRONT-053
**Status:** Verified

## Changes
- **SVG Markers**: Implemented color-aware arrowheads (`arrowhead-red`, `arrowhead-emerald`, etc.) to match task priority/status.
- **Hierarchy Styling**: Made WBS hierarchy lines more subtle (thinner stroke, light gray color, reduced opacity) to distinguish them from dependencies.
- **Improved Anchoring**:
    - Updated dependency lines to start at the **Right Edge** (End) of the predecessor.
    - Added smart anchor logic to detect "backwards" scheduling (successor starting before predecessor ends) and switch to 'left' side anchoring to avoid overlapping bars.
- **Rendering Precision**: Switched markers from `polygon` to `path` for sharper rendering.

## Verification
- Ran `npm run build` - Success.
- Visual verification: Dependency lines now correctly point from bar-end to bar-start with color-matched arrows. Hierarchy lines are thin and subtle.