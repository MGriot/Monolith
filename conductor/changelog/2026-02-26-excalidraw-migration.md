# Changelog - 2026-02-26 - Excalidraw Migration

## 🎨 Whiteboard Migration: tldraw to Excalidraw
Transitioned the sketching engine to provide a more polished and reliable drawing experience.

- **Core Migration**: Replaced `@tldraw/tldraw` with `@excalidraw/excalidraw` for the Whiteboard sketching feature.
- **Enhanced Aesthetic**: Adopted the hand-drawn, architect-style look of Excalidraw for technical diagrams.
- **Customized UI**: Configured the editor to hide redundant "File" actions (Open/Save/Export) since persistence is managed by the Monolith backend.
- **Improved Persistence**: Synchronized the elements, appState, and files objects with the backend PostgreSQL `JSONB` storage.
- **Task Integration**: Leveraged `@excalidraw/utils` for high-quality PNG generation when attaching sketches to tasks.
- **Performance**: Improved canvas responsiveness and fixed potential memory leaks from the previous engine.
