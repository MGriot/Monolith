# Changelog - 2026-02-28 - Whiteboard Dedicated Page & Alignment Fix

## 🎨 New Feature: Dedicated Whiteboarding
- **Full-Screen Canvas**: Extracted the Excalidraw editor into its own route (`/whiteboards/:id`) using a `LayoutFreePrivateRoute` to ensure zero interference from main application navigation bars.
- **Precision Alignment**: Fixed the persistent "offset drawing" bug by identifying a CSS conflict where Tailwind Preflight rules affected the static and interactive canvas layers differently. Enforced absolute alignment in `index.css`.
- **Collaborative UI**: Integrated the `LiveCollaborationTrigger` into the official top-right UI slot, adding mock collaborator support for visual testing.

## 🛠️ Logic & Bug Fixes
- **Payload Sanitization**: Resolved the "Blank Page on Reload" bug by stripping internal `appState` from the persistence payload.
- **Navigation UX**: Moved the "Back" button into the editor header to prevent it from overlapping the title input field.
- **Naming Consistency**: Completed the "Blackboard -> Whiteboard" rename across the entire platform.

## 🏗️ Infrastructure
- **Refined Routing**: Introduced the `LayoutFreePrivateRoute` utility to allow certain routes to render without the global Sidebar/Header shell.
