# UI redesign plan — modals, Dashboard, Metadata, Settings, File Hub

Status: proposal · Owner: frontend · Date: 2026-10-18

This plan modernizes five areas of the Monolith web app so they share one visual language and one layout system.
It builds on what already exists (`ui/dialog.tsx` with `size` + Header/Body/Footer, the HSL tokens in `index.css`,
the two-pane `TaskForm`) instead of starting over. Every section names the files it touches.

---

## 0. What's wrong today (audit)

| Area | Observed problem | Where |
|---|---|---|
| **Typography** | 218 × `text-[10px]`, 82 × `text-[9px]/[8px]`, 142 × `font-black`, 49 × `tracking-widest`. Labels shout in tiny uppercase; hierarchy comes from weight, not size. | app-wide |
| **Elevation** | 108 × `shadow-sm` on cards that already have a border. Every surface looks raised, so nothing stands out. | app-wide |
| **Confirmations** | 14 × `window.confirm()` — unstyled, blocks the thread, ignores dark mode. | task-dialog, admin-metadata, folder-tree, … |
| **Project modal** | One 10-section column (≈1,200 px tall). Footer sits *inside* `DialogBody`, so Save scrolls away. Tinted amber/blue boxes and 10px black uppercase headings don't match the Task editor's `Section`. Members field + "Manage Assignees" are two controls for one job. Tags are a comma-separated text box. | `project-form.tsx`, `projects-list.tsx:381` |
| **Dashboard** | KPI row mixes metrics with a button ("System Activity → View activity recap"). "Task Status Breakdown" repeats the KPI row in six boxes. 14-day heatmap renders one row in a 140px card. Empty states occupy 170px each. Three link cards (Manage Projects / Roadmap / Team Stats) duplicate the sidebar. Insights (risk matrix, contribution) are cramped at the bottom with uneven heights. | `pages/dashboard.tsx` |
| **Metadata** | Tabs hide half the data. The create form permanently takes ⅓ of the width. Edit happens in a separate dialog. Primary button looks disabled (grey) until typing. | `pages/admin-metadata.tsx` |
| **Settings** | 3-column grid with labels left of cards inside a `max-w-4xl` — huge dead space on wide screens. "Security" heading sits next to Notifications + Calendar feed + Password. Appearance has no card while the rest do. Each card has its own footer. | `pages/settings.tsx` |
| **File Hub** | A tree only: files are invisible until a folder is expanded, upload is hidden in a hover menu, no drag-and-drop, no previews, no multi-select. Backend cannot move a file or folder, and has **no file delete endpoint**. | `folder-tree.tsx`, `endpoints/folders.py` |

---

## 1. Design foundation (do this first)

### 1.1 Tokens

Extend `index.css` (`:root` and `.dark`) — keep the existing names, add the missing semantic ones:

```css
/* status + feedback, so components stop hard-coding blue-50/amber-700 pairs */
--info: 217 91% 60%;      --info-soft: 214 100% 97%;
--success: 160 84% 39%;   --success-soft: 152 81% 96%;
--warning: 38 92% 50%;    --warning-soft: 48 100% 96%;
--danger: 0 84% 60%;      --danger-soft: 0 86% 97%;
/* surfaces */
--surface: var(--background);      /* cards, dialogs */
--surface-sunken: var(--subtle);   /* page background, rails, footers */
--radius-lg: 0.75rem;              /* cards, dialogs */
```

Dark values follow the existing pattern (soft = ~10% alpha of the hue on `--background`).
Map them in `tailwind.config.js` the same way `subtle` / `fg-faint` are mapped (`hsl(var(--info) / <alpha-value>)`
for `info`, `success`, `warning`, `danger` + `-soft`) and rewrite `constants/colors.ts`
`STATUS_COLORS` / `PRIORITY_COLORS` on top of them so status chips, Kanban, Gantt and the dashboard all read one source.

### 1.2 Type scale (the only sizes allowed)

| Role | Class | Use |
|---|---|---|
| Page title | `text-xl font-semibold tracking-tight` | `PageHeader` only |
| Section title | `text-base font-semibold` | Settings/Metadata sections, dialog titles |
| Card title | `text-sm font-semibold` | Card / panel headers |
| Body | `text-sm` | default |
| Meta / hint | `text-xs text-muted-foreground` | descriptions, timestamps, field hints |
| Eyebrow | `text-[11px] font-medium uppercase tracking-wide text-fg-faint` | **only** via `<Eyebrow>`; max one per card |
| KPI number | `text-2xl font-semibold tabular-nums` | `StatTile` |

Rules: no `font-black`; no text below 11px; uppercase only through `Eyebrow`. Add an ESLint `no-restricted-syntax`
rule (or a `scripts/` grep in CI) that flags `font-black`, `text-[8px]`, `text-[9px]`, `text-[10px]` in new code.

### 1.3 Spacing, radius, elevation

- 4px grid. Page gutter `px-4 py-5 md:px-6 lg:px-8 lg:py-6`. Card padding `p-5` (header `px-5 py-4`).
  Gap between page sections `gap-6`; inside grids `gap-4`; label→control `gap-1.5`.
- Radius: cards & dialogs `rounded-xl`, controls `rounded-md`, chips/avatars `rounded-full`.
- Elevation: **cards = border, no shadow.** Popovers/menus `shadow-lg`. Dialogs `shadow-2xl`. Hover on clickable
  cards = `hover:border-foreground/20` (no lift).
- Motion: 150ms ease-out for hover/focus, 200ms for dialogs/drawers (already in `tailwindcss-animate`).
  Respect `motion-reduce:`.

### 1.4 One scroll container per surface

- Pages scroll only in the layout's `<main>` (`layout.tsx`). Pages must not add `overflow-auto` wrappers
  (today Settings and Metadata both do `flex-1 overflow-auto`).
- Dialogs scroll only in `DialogBody` (or the panes of the two-pane editor). Footers never live inside the body.
- Long lists inside a page use "Show all (n)" or pagination, not an inner scrollbar. Exceptions: the Gantt,
  Kanban columns and the File Hub panes, which are workspaces, not documents.

### 1.5 New shared primitives (`components/ui/`)

| Component | Purpose | Source |
|---|---|---|
| `PageHeader` | title, description, right-side actions; replaces ad-hoc headers | new |
| `Section` | titled block: icon, title, description, actions, children | promote from `task-form.tsx` |
| `Field` | label + control + hint + error, `htmlFor` wired | promote from `task-form.tsx` |
| `EmptyState` | icon, title, text, optional CTA; `size="sm" \| "md"` (sm ≤ 120px tall) | promote from `task-form.tsx` |
| `Eyebrow` | the single sanctioned uppercase label | new |
| `StatTile` | label, value, delta/sub-line, optional progress, `href` | new |
| `SettingsGroup` / `SettingsRow` | bordered list; row = label+description left, control right | new |
| `ConfirmDialog` + `useConfirm()` | promise-based replacement for `window.confirm`, `tone="danger"` | new |
| `ColorSwatchPicker` | preset swatches from `constants/colors.ts` + custom hex, in a popover | new (replaces 4 copies) |
| `TagInput` | chips with Enter/comma to add, Backspace to remove | new |
| `Dropzone` | wraps children; native file drag → `onFiles(files, target)` + overlay | new |

---

## 2. Modals and dialogs

### 2.1 Dialog standard (applies to every dialog)

```
┌──────────────────────────────────────────────────────────┐
│ Title                                            [meta] ✕│  DialogHeader  px-6 pt-5 pb-4, border-b
│ Subtitle / breadcrumb                                    │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  DialogBody — the ONLY scroll area                       │  px-6 py-5
│                                                          │
├──────────────────────────────────────────────────────────┤
│ [Archive] [Delete]   created …          [Cancel] [Save]  │  DialogFooter  bg-surface-sunken
└──────────────────────────────────────────────────────────┘
```

- Size by content, not taste: `sm` (400) confirm / one field · `md` (520) ≤ 5 fields · `lg` (720) sectioned
  forms, pickers · `xl` (960) builders (workflows) · `2xl` (1120) entity editors (Task, Project) · `full` previews.
- Form dialogs: `<form className="flex min-h-0 flex-1 flex-col">` wraps Body + Footer so Enter submits and the
  footer stays fixed.
- Footer: destructive/secondary on the left, `Cancel` (ghost) + primary on the right. Primary label is a verb
  ("Create project", "Save changes"), min-width 120px, spinner replaces the label while pending.
- `Ctrl/⌘+Enter` submits any form dialog; `Esc` closes; if the form is dirty, closing asks via `useConfirm`.
- Labels are sentence case `text-xs font-medium text-muted-foreground` through `Field` — no uppercase labels.

### 2.2 Entity editor (Task ✓, Project ✗) — shared layout

The Task editor already has the right shape. Extract it so Project uses the same skeleton:

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ New project                                                                 ✕ │
│ From template: Software launch                                                │
├───────────────────────────────────────────────┬───────────────────────────────┤
│ Project name (inline, text-xl)                │ PROPERTIES                    │
│ Description (markdown, auto-grow, max 12rem)  │ Status [Todo ▾] Priority [Med▾]│
│                                               │ Start [__] Due [__]           │
├───────────────────────────────────────────────┤                               │
│ ▸ Overview │ Budget & risk │ Fields           │ CLASSIFICATION                │
├───────────────────────────────────────────────┤ Topics  [chip][chip][+]       │
│                                               │ Types   [chip][+]             │
│  tab content (scrolls)                        │ Tags    [critical][web][+]    │
│  Budget & risk = same RiskCostPanel the task  │                               │
│  editor uses (sliders, exposure, variance)    │ PEOPLE                        │
│                                               │ Members [avatars…] [+ team]   │
│                                               │                               │
│                                               │ APPEARANCE  ● ● ● ● ○         │
├───────────────────────────────────────────────┴───────────────────────────────┤
│                                                     [Cancel] [Create project] │
└───────────────────────────────────────────────────────────────────────────────┘
```

Component hierarchy:

```
EntityEditor (layout grid from task-form.tsx:182, props: main, tabs, rail, footer)
├── EditorTitle            inline big input
├── EditorDescription      markdown textarea, auto-grow
├── EditorTabs             underline tabs + count badges, disabled-with-reason
├── PropertyRail           sticky right column, bg-surface-sunken, w-80
│   └── RailGroup(title)   Eyebrow + stacked Fields
└── EditorFooter           footerStart | Cancel + Submit
Shared panels: RiskCostPanel, DateRangeFields, MembersField (AssigneeSelector with team expansion), TagInput
```

Project specifics:
- Merge "Project Members" + "Manage Assignees" into one `MembersField` (search people; selecting a team adds its
  members and shows a "Team · 4" chip that can be expanded/undone).
- Tags become `TagInput` (the API already takes an array; the comma string parsing goes away).
- Dates move to the rail; Budget & risk becomes a tab using the same `RiskCostPanel` as tasks
  (drop the amber/blue tinted boxes).
- Create flow in `projects-list.tsx`: step 1 template picker stays `lg`; step 2 switches to `2xl` editor.
  Add a "Back to templates" link in the footer-left.
- `project-detail.tsx` Settings tab renders the same `EntityEditor` with `variant="page"`: no dialog chrome,
  footer becomes a sticky bottom bar that appears only when the form is dirty ("Unsaved changes · Discard · Save").

Task editor refinements (small, it was rebuilt in f3b67cc):
- Group the rail with `RailGroup` headings (Properties / Classification / People / Appearance) like the project.
- Count badges on Dependencies, Files, Activity tabs (Checklist already has one).
- Replace both `window.confirm` calls in `TaskFooterMeta` with `useConfirm({ tone: 'danger' })`.

### 2.3 Inventory of the other dialogs

| Dialog | File | Now | Action |
|---|---|---|---|
| Edit topic / work type | `admin-metadata.tsx:395,445` | `md` | **Remove** — inline editing (§4) |
| Scoped topic / type | `scoped-taxonomy-manager.tsx:374,418` | `sm` | Reuse the Metadata inline row component |
| Add webhook | `settings.tsx:320` | `md`, uppercase black labels | `md`, `Field` labels, provider as segmented control |
| Team editor | `teams.tsx:261` | `lg` | Footer out of body; `MembersField` |
| Template editor | `templates.tsx:294` | `lg` | Footer out of body; `Section` blocks |
| Workflow builder | `workflows.tsx:393` | `xl` | Keep size; standard header/footer |
| Idea dialogs ×3 | `project-ideas.tsx:363,423,478` | md/md/lg | Standard footer; `Field` |
| Gantt quick-edit | `project-gantt.tsx:1852` | `md` | Standard footer |
| Data export | `data-export-dialog.tsx:81` | `sm` | Keep; standard footer |
| Folder note editor | `folder-tree.tsx:244` | `full` | Becomes File Hub preview panel (§6) |
| Attachment pickers | `attachment-manager.tsx:314,427` | `sm`/`full` | Reuse `Dropzone` + `FileCard` |
| Command palette | `command-palette.tsx:117` | custom | Leave as is |
| All `window.confirm` (14) | various | native | `useConfirm()` |

---

## 3. Dashboard

### 3.1 Layout (12-column grid, `gap-6` between rows, `gap-4` within)

```
┌ PageHeader ──────────────────────────────────────────────────────────────────┐
│ Good afternoon, Administrator        Sunday 18 Oct   [+ Task] [+ Project]    │
└──────────────────────────────────────────────────────────────────────────────┘
┌ KPI strip (one card, 4 tiles split by dividers) ─────────────────────────────┐
│ Active projects │ Open tasks          │ Blocked / on hold │ Completion        │
│ 1               │ 0  ·0 in prog ·0 rev │ 0                 │ 0%  ▕▔▔▔▔▔▔▔▔▏    │
└──────────────────────────────────────────────────────────────────────────────┘
┌ Status distribution — single stacked bar (h-2.5) + inline legend ────────────┐
│ ████████▒▒▒▒▒▒▓▓▓░░░░░  Backlog 0 · To do 0 · In progress 0 · On hold 0 · …  │
└──────────────────────────────────────────────────────────────────────────────┘
┌ My focus (col-span-8) ────────────────────┐┌ Activity (col-span-4) ──────────┐
│ [Overdue 0] [This week 0] [Next 14 d]     ││ completed + teammate + system   │
│ row: ● title · project · due · avatar     ││ one feed, "View recap →" link   │
│ EmptyState sm: "Nothing due — plan week →"││ EmptyState sm                   │
└───────────────────────────────────────────┘└─────────────────────────────────┘
┌ Team capacity, next 14 days (col-span-12) ───────────────── Low Med Full Over ┐
│ member │ S M T W T F S │ S M T W T F S      rows h-9; ≤ 8 rows + "Show all"  │
└──────────────────────────────────────────────────────────────────────────────┘
Insights (admins)  ── Eyebrow
┌ Workload (4) ───────┐┌ Risk exposure (4) ───┐┌ Contribution (4) ──────────────┐
│ fixed h-80 each     ││ 5×5 matrix, square   ││ 52-week heatmap                │
└─────────────────────┘└──────────────────────┘└────────────────────────────────┘
```

### 3.2 Decisions

- **KPI strip:** one `Card` with `divide-x` and four `StatTile`s instead of five separate cards. Each tile links to a
  pre-filtered list (`/tasks?status=…`). "System activity" stops being a KPI; its button moves to the Activity
  panel header.
- **Status breakdown:** replace the six boxes with one stacked bar (status token colors) + legend — saves ~90px
  and reads at a glance. Clicking a segment filters the task list.
- **Quick actions:** remove the Manage Projects / Roadmap / Team Stats link cards (they duplicate the sidebar);
  put `+ Task` / `+ Project` in the `PageHeader`.
- **My focus** merges Upcoming deadlines with overdue items, as segmented tabs with counts.
- **Activity** merges Recent activity + Teammate activity (currently a separate 4-up card grid) into one feed.
- **Heatmap:** compact rows, legend in the header, collapse to "Show all (n)" after 8 members; with only one
  member, render it at `col-span-6` next to Activity instead of full width.
- **Insights** row: equal heights (`h-80`), same header style, axis labels at 11px. Non-admins see Workload only,
  at `col-span-12`.
- Responsive: `lg` 12 cols → `md` 6 cols (focus/activity stack, insights 2-up) → mobile 1 col; KPI strip becomes
  a 2×2 grid.

### 3.3 Components

```
DashboardPage
├── PageHeader(greeting, date, actions)
├── KpiStrip → StatTile ×4
├── StatusDistributionBar
├── Grid
│   ├── FocusPanel → SegmentedTabs, TaskRow[], EmptyState(sm)
│   └── ActivityFeed → ActivityItem[], EmptyState(sm)
├── CapacityHeatmap (existing ProjectHeatmap logic, new shell)
└── InsightsRow (admin) → WorkloadChart, RiskHeatmap, ContributionHeatmap
```

All panels use one `Panel` shell: `Card` → header `px-5 py-4` (title `text-sm font-semibold`, optional
description, one muted icon or action) → body `px-5 pb-5`.

---

## 4. Metadata — single-page management

### 4.1 Layout

```
┌ PageHeader ──────────────────────────────────────────────────────────────────┐
│ Metadata   Topics and work types used across projects                        │
│ [🔍 Filter by name…]  Scope [All ▾]  [ ] Show inactive                       │
└──────────────────────────────────────────────────────────────────────────────┘
┌ Topics · 12 ─────────────────────────┐ ┌ Work types · 7 ──────────────────────┐
│ ┌──────────────────────────────────┐ │ │ ┌──────────────────────────────────┐ │
│ │ ● [ New topic name…    ] [Add]  │ │ │ │ ● [ New work type…     ] [Add]  │ │
│ └──────────────────────────────────┘ │ │ └──────────────────────────────────┘ │
│ GLOBAL                               │ │ GLOBAL                               │
│ ● Backend          ⏻   ⋯            │ │ ● Feature          ⏻   ⋯             │
│ ● Frontend         ⏻   ⋯            │ │ ● Bug              ⏻   ⋯             │
│ WEBSITE RELAUNCH  (project) ▾        │ │ WEBSITE RELAUNCH (project) ▾         │
│ ● SEO              ⏻   ⋯            │ │ ● Copy             ⏻   ⋯             │
└──────────────────────────────────────┘ └──────────────────────────────────────┘
```

- **No tabs.** Two equal panels side by side at `xl` (`grid-cols-2 gap-6`), stacked below `xl`.
- **Create inline:** the first row of each panel is the add row — color dot opens `ColorSwatchPicker`
  (defaults to the next unused preset), `Enter` adds, the input stays focused for rapid entry.
  The 1/3-width form card goes away.
- **Edit inline:** click the name → text input, `Enter` saves / `Esc` cancels; color dot → swatch popover;
  active switch toggles immediately (optimistic, toast on error with undo). `⋯` menu: Rename, Move to global
  (admin), Delete (via `useConfirm`). The two edit dialogs are deleted.
- **Grouping:** rows grouped by scope — Global first, then one collapsible group per project. Group headers use
  `Eyebrow`. Inactive rows are hidden unless "Show inactive" is on, and render at 60% opacity when shown.
- One filter bar drives both panels, so "find where *Backend* exists" is one search.
- Row height 40px, hover reveals `⋯`; whole panel is a `divide-y` list, not a `Table` (no column headers needed).

### 4.2 Components

```
MetadataPage
├── PageHeader + TaxonomyFilterBar (search, scope, showInactive)
└── grid
    ├── TaxonomyPanel kind="topic"
    │   ├── TaxonomyAddRow → ColorSwatchPicker, Input
    │   └── TaxonomyGroup(scope) → TaxonomyRow[] → ColorSwatchPicker, InlineText, Switch, RowMenu
    └── TaxonomyPanel kind="work-type"  (same components)
```

`TaxonomyPanel` takes `{ kind, endpoint, items }`, so `scoped-taxonomy-manager.tsx` (project settings) can reuse
`TaxonomyAddRow` / `TaxonomyRow` with `scope` locked to the project. Data hooks stay as they are
(`['metadata','topics','all']`, `['metadata','work-types','all']`).

---

## 5. Settings

### 5.1 Layout

```
┌ PageHeader: Settings ────────────────────────────────────────────────────────┐
├──────────────┬───────────────────────────────────────────────────────────────┤
│ Profile      │ Profile                                                       │
│ Appearance   │ ┌───────────────────────────────────────────────────────────┐ │
│ Notifications│ │ Full name        [Administrator              ]            │ │
│ Calendar     │ │ Email            admin@monolith.dev  · not verified [Send]│ │
│ Integrations │ └──────────────────────────────────── [Save] (when dirty) ──┘ │
│ Security     │ Appearance                                                    │
│ (sticky,     │ ┌───────────────────────────────────────────────────────────┐ │
│  scroll-spy) │ │ Theme            [System | Light | Dark]                  │ │
│              │ └───────────────────────────────────────────────────────────┘ │
│              │ Notifications                                                 │
│              │ ┌───────────────────────────────────────────────────────────┐ │
│              │ │ Assignments & deadline reminders                     [⏻] │ │
│              │ │ Weekly digest                                         [⏻] │ │
│              │ └───────────────────────────────────────────────────────────┘ │
│              │ Calendar feed · Integrations (webhook rows + Add) · Security  │
└──────────────┴───────────────────────────────────────────────────────────────┘
```

- Two columns at `lg`: sticky section nav (`w-48`, scroll-spy via `IntersectionObserver`, updates `#hash`) +
  content `max-w-2xl`. Below `lg`, the nav becomes a horizontal chip row under the header. The 3-column
  "label beside card" grid goes away; each section title sits *above* its group.
- Every section is `Section title + description` + one `SettingsGroup`; rows are `SettingsRow`
  (label/description left, control right, `divide-y`). No nested cards, no per-card footers.
- **Save model:** toggles, theme and calendar options save instantly (with a toast). Profile and Password are the
  only forms; their Save button appears in the group's bottom-right only when dirty.
- Email verification moves out of Notifications into the Profile email row (status badge + "Send" link);
  Notifications shows a one-line warning row only when e-mails can't be delivered.
- Integrations: webhook rows (provider icon, name, masked URL, test, delete); "Add webhook" opens the `md`
  dialog (§2.3).
- Security holds only the password change (and later sessions/2FA). Fixes today's mislabeled grouping.

### 5.2 Components

```
SettingsPage
├── PageHeader
├── SettingsNav (sticky, scroll-spy)
└── SettingsSection ×6 (id, title, description)
    └── SettingsGroup → SettingsRow[] (+ optional dirty-aware footer)
        reuses ThemeSegmented, NotificationPrefs rows, CalendarFeed rows, WebhookRow
```

`NotificationPrefsCard` and `CalendarFeedCard` lose their `Card` wrappers and export row-level content so the
page owns the chrome.

---

## 6. File Hub — drag-and-drop file system

### 6.1 Layout (project tab "Files")

```
┌ Toolbar ─────────────────────────────────────────────────────────────────────┐
│ Files › Design › Mockups     [🔍 Search files]  [Sort ▾] [▦ │ ☰]  [New ▾] [⬆ Upload]│
├──────────────┬────────────────────────────────────────────────┬──────────────┤
│ All files    │  FOLDERS                                       │ Preview      │
│ Recent       │  ┌──────┐ ┌──────┐ ┌──────┐                   │ ┌──────────┐ │
│ ── Types ──  │  │ 📁   │ │ 📁   │ │ 📁   │                   │ │  image   │ │
│ Images       │  │Specs │ │Brand │ │Old   │                   │ └──────────┘ │
│ Documents    │  └──────┘ └──────┘ └──────┘                   │ hero.png     │
│ Notes        │  FILES                                         │ 1.2 MB · PNG │
│ Sketches     │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐          │ by Admin     │
│ ── Folders ──│  │thumb │ │ PDF  │ │ md   │ │thumb │          │ 18 Oct       │
│ ▾ Design     │  │hero  │ │brief │ │notes │ │logo  │          │ Topics ● ●   │
│   ▸ Mockups  │  └──────┘ └──────┘ └──────┘ └──────┘          │ [Open][⬇][⋯] │
│ ▸ Contracts  │                                                │              │
│ ── Topics ── │   ╔════════════════════════════════════════╗  │              │
│ ● Backend    │   ║  Drop files to upload to Design/Mockups ║  │              │
│ ● Legal      │   ╚════════════════════════════════════════╝  │              │
├──────────────┴────────────────────────────────────────────────┴──────────────┤
│                                      Uploading 3 files ▸ hero.png ████░ 72%  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Sidebar (`w-60`)**: smart views (All, Recent, by type incl. *Sketches* — the whiteboards from
  `project-library.tsx`, so the project has one place for files), the folder tree, and topics as tags.
  Every folder node and topic chip is a **drop target**.
- **Main pane**: breadcrumb + toolbar; grid (default) or list view, persisted per user in `localStorage`
  (like `use-task-view.ts`). Folders first, then files. Cards: 4:3 thumbnail (images load the file URL with
  `loading="lazy"`; PDFs/docs/sheets show a type glyph colored by kind; notes show the first lines of markdown),
  name (2-line clamp), size · date, owner avatar on hover.
- **Preview panel (`w-80`, collapsible)**: appears on single selection — large preview, metadata, topics,
  actions (Open, Download, Rename, Move…, Copy link, Delete). Double-click / Enter opens the existing
  `FilePreviewDialog` (`full`); notes open the `NoteEditor` in the panel's expanded mode.
- **Empty folder** = a full-size `Dropzone` with "Drop files here or browse", plus "New note" / "New sketch".

### 6.2 Interactions

| Gesture | Result |
|---|---|
| Drag files from the OS anywhere over the main pane | Overlay "Drop to upload to *current folder*"; drop uploads there |
| …over a folder card or a tree node | That target highlights (`ring-2 ring-info bg-info-soft`); drop uploads into it |
| Drag a file/folder card onto a folder (card or tree) | Move (optimistic, toast with **Undo**) |
| Drag onto a topic in the sidebar | Tag the file(s) with that topic |
| Click / Shift+click / Ctrl+click | Select / range / toggle — reuse `lib/selection.ts` (`clickSelection`) |
| Selection > 1 | Bulk bar (reuse `bulk-action-bar.tsx` pattern): Move to…, Tag, Download, Delete |
| Keyboard | ↑↓←→ move focus, Enter open, F2 rename, Del delete (confirm), Ctrl+A select all, Esc clear |
| Hover on tree node during drag for 600ms | Auto-expand the node |

Tech notes:
- **Internal drags** use `@dnd-kit/core` (already a dependency): `useDraggable` on cards, `useDroppable` on
  folder cards / tree nodes / topic chips, `DragOverlay` showing "3 files" stack, keyboard sensor for a11y.
- **OS file drops** use native `dragenter/dragover/drop` (dnd-kit doesn't handle `DataTransfer.files`).
  `Dropzone` counts enter/leave to avoid flicker and checks `e.dataTransfer.types.includes('Files')`.
- **Uploads**: queue with concurrency 3, `axios` `onUploadProgress` per file, cancel via `AbortController`,
  per-file error with Retry, client-side check against the 100 MB `client_max_body_size` in `nginx.conf`.
  Folder uploads (`webkitGetAsEntry`) recreate the folder structure — phase 2.

### 6.3 Backend changes required

| Change | Endpoint / model | Notes |
|---|---|---|
| Move file | `PUT /folders/files/{id}` — add `folder_id` to `FileUpdate` | Check write access on source **and** target; same project only |
| Move folder | `PUT /folders/{id}` — add `parent_id` to `FolderUpdate` | Reject cycles (target is self or a descendant) |
| Delete file | `DELETE /folders/files/{id}` | **Missing today**; remove the stored object too |
| Bulk move/delete | `POST /folders/files/bulk` `{ids, action, folder_id?}` | Optional; the client can loop with `chunk()` from `lib/selection.ts` first |
| Tag files with topics | `file_topics` association + `topic_ids` on `File` schemas | Alembic migration; reuses the existing Topic taxonomy and colors instead of a new tag system |
| Listing for smart views | `GET /folders/files?project_id=&kind=&recent=&topic_id=` | Flat listing; today files only arrive nested in folders |

Tests: pytest for move (permission, cross-project rejection, cycle rejection), delete, and tagging; vitest for the
upload queue reducer and drop-target resolution (pure functions in `lib/file-hub.ts`, same style as
`lib/kanban.ts`).

### 6.4 Components

```
FileHub (replaces FolderTree in project-detail "Files" tab)
├── FileHubProvider        selection, current folder, view mode, DnD context, upload queue
├── FileHubSidebar
│   ├── SmartViewList
│   ├── FolderTreeNav → FolderNode (droppable, auto-expand)
│   └── TopicDropList → TopicChip (droppable)
├── FileHubToolbar → Breadcrumbs (droppable crumbs), SearchInput, SortMenu, ViewToggle, NewMenu, UploadButton
├── FileHubPane (Dropzone)
│   ├── FolderGrid → FolderCard (draggable + droppable)
│   ├── FileGrid | FileList → FileCard | FileRow (draggable) → FileThumbnail
│   └── EmptyState(dropzone)
├── FilePreviewPanel → FileThumbnail(lg), FileMeta, TopicPicker, actions
├── BulkActionBar
└── UploadTray → UploadItem[]
```

`FileCard`, `FileThumbnail` and `Dropzone` are reused by the task dialog's Files tab (`attachment-manager.tsx`).

---

## 7. Implementation phases

Each phase is one PR, behind no flag (all changes are visual or additive), verified in light **and** dark mode at
375 / 768 / 1440 / 2000 px.

| # | Phase | Scope | Depends on | Done when |
|---|---|---|---|---|
| P0 | **Foundation** | Tokens (§1.1), Tailwind mapping, `colors.ts` on tokens, primitives (§1.5), lint guard, drop card `shadow-sm` | — | Primitives exist with stories/examples in use; no page visually regresses |
| P1 | **Dialogs** | `EntityEditor` extraction, Project editor (dialog + page variant), task rail groups, `useConfirm` replaces all 14 `window.confirm`, dialog inventory pass (§2.3) | P0 | Project create/edit uses the 2-pane editor; footer never scrolls; zero `window.confirm` |
| P2 | **Metadata + Settings** | §4 and §5 | P0 | No tabs on Metadata; no edit dialogs; Settings has one scroll container and no per-card footers |
| P3 | **Dashboard** | §3 | P0 | Layout matches §3.1 at all breakpoints; empty states ≤ 120px |
| P4a | **File Hub backend** | §6.3 + tests | — | Endpoints + migration + pytest green |
| P4b | **File Hub frontend** | §6.1–6.4 | P0, P4a | Upload by drop, move by drag, preview panel, multi-select, keyboard all work |

P2, P3 and P4a can run in parallel once P0 lands (they touch disjoint files). P4a can start immediately.

### Verification per phase

- `npm run typecheck && npm run lint && npm test` in `frontend/`; `pytest` in `backend/` for P4a.
- Screenshot pass of each changed page (light/dark × 4 widths) into `docs/img/`, replacing the outdated ones.
- Keyboard-only walkthrough: every dialog opens, submits with Ctrl+Enter, closes with Esc, traps focus;
  File Hub fully operable without a mouse (dnd-kit keyboard sensor + Move… menu).
- Contrast: text ≥ 4.5:1, status chips checked in dark mode (the `-soft` backgrounds are the risk).

---

## 8. Styling cheat-sheet

```tsx
// Page
<PageHeader title="Metadata" description="Topics and work types used across projects" actions={…} />
<div className="grid gap-6 xl:grid-cols-2">…</div>

// Panel / card
<Card className="rounded-xl border bg-card">            {/* no shadow */}
  <div className="flex items-center justify-between px-5 py-4">
    <h3 className="text-sm font-semibold">Topics <span className="text-muted-foreground">· 12</span></h3>
  </div>
  <div className="divide-y border-t">…rows h-10 px-5…</div>
</Card>

// Field
<Field label="Due date" htmlFor="due" hint="Optional"><Input id="due" type="date" className="h-9" /></Field>

// Status chip (from tokens, not raw palette)
<span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-info-soft px-2.5 text-xs font-medium text-info">
  <span className="h-1.5 w-1.5 rounded-full bg-info" /> In progress
</span>

// Drop target states
idle:   "rounded-xl border border-dashed border-border"
over:   "border-info bg-info-soft ring-2 ring-info/40"
reject: "border-danger bg-danger-soft"
```

**Do:** one primary button per view · sentence-case labels · icons at `h-4 w-4` muted, one per header ·
`tabular-nums` for every number · skeletons (not spinners) for panels that load on page open.

**Don't:** nest cards in cards · uppercase anything outside `Eyebrow` · `text-[<11px]` · shadows on cards ·
inner scrollbars on document pages · raw `slate-*`/`blue-50` classes where a token exists (24 raw `slate-*`
uses remain to migrate).
