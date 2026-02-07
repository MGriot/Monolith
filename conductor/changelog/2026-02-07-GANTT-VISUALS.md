# Gantt & Task List Visual Refinements

## 🎨 Visual Enhancements

### Gantt Chart
- **Status-Based Coloring**: Task bars are now colored according to their **Status** (e.g., Green for Done, Blue for In Progress) rather than priority, improving quick status recognition.
- **Priority Borders**: Implemented a "dual-coding" system where task bars have a **2px thick border** indicating their **Priority** (e.g., Red for Critical, Blue for Low).
- **Critical Path Glow**: Added a high-visibility **"Red Aura"** (pulsing glow) to connection lines on the Critical Path, ensuring the entire critical chain stands out.
- **Improved Legend**:
  - Moved to a **floating, semi-transparent** container in the top-right.
  - Added dedicated sections for **Status (Fill)** and **Priority (Border)**.
  - Compacted the layout to save screen real estate.
- **Today Marker**: Fixed the layout of the "TODAY" label to ensure text is fully visible and centered.

### Task List
- **Intuitive Icons**: Replaced generic icons with clear, actionable arrows:
  - **Move Up/Down**: `ArrowUp` / `ArrowDown`
  - **Indent/Outdent**: `ArrowRight` / `ArrowLeft`
- **Cleanup**: Removed unused imports and optimized re-rendering logic.
