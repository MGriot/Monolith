# Changelog: Excalidraw Migration

**Date:** 2026-02-26
**Tasks:** FRONT-099 to FRONT-104
**Status:** Verified & Committed

## Changes
- **Core Migration**: Replaced `@tldraw/tldraw` with `@excalidraw/excalidraw` for the Blackboard sketching feature.
- **Improved Rendering**: Switched to Excalidraw's canvas-based rendering for better performance with complex sketches.
- **Aesthetic Alignment**: Adopted the native "hand-drawn" Excalidraw look, which provides high visual contrast and an intuitive "whiteboard" feel.
- **Persistence Layer**: Updated Save/Load logic to handle Excalidraw's unique scene structure (elements, appState, and files).
- **Export System**: Re-implemented the "Export to Task" feature using Excalidraw's `exportToBlob` API, maintaining 1:1 parity with the previous implementation.
- **UI Refinement**: Customized the Excalidraw interface to hide redundant actions (file-based save/load) and disable the welcome screen for a cleaner embedded experience.

## Verification
- **Build Integrity**: Frontend production build passed successfully.
- **Functionality**: Verified saving to Project Library and exporting PNG attachments to tasks.
- **Compatibility**: Implemented a data guard to gracefully handle (and clear) incompatible legacy tldraw sketches.
