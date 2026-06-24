# Step 6 — UI Layer Implementation Plan

> Plan for building the presentation layer on top of the completed adapter, service, and state tiers (Steps 1–5).
> Locked-in scope follows `docs/ers.md` §4.1, FR-6, FR-7, FR-11, FR-13, FR-14, NFR-1 (UI surface), NFR-4, NFR-6, NFR-7, plus the security audit carry-overs.
> Document is intentionally executable as-is: each sub-phase has deliverables, agent assignments, and acceptance criteria.

---

## 0. TL;DR

Step 6 turns the reactive store graph into a working SPA. Today the routes and 7 components exist as **daisyUI-flavoured scaffolds** that compile but render poorly (daisyUI is not installed — only `@tailwindcss/typography` and `@tailwindcss/vite` are in `package.json`). The plan rebuilds the UI on a real design system, fills every ERS §4.1 / FR-6 / FR-7 / FR-11 / FR-14 / NFR-4 gap, and ships the audit carry-overs (CSP, prefers-color-scheme, filter URL sync, integrity banner as a global component).

**Phases:** 6A design tokens & primitives → 6B layout shell → 6C home → 6D local view → 6E remote view → 6F editor → 6G wizard → 6H settings panel → 6I filter URL sync → 6J i18n string map → 6K accessibility audit → 6L CSP & security headers → 6M smoke test & verify.

**Cross-cutting roles** (from your ask):

| Agent / role      | Used for                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `/frontend-design` | Design tokens, colour palette, typography scale, primitive component library, motion grammar |
| `/impeccable`     | Polish pass: focus rings, micro-interactions, empty states, loading skeletons, a11y copy |
| `/agent-coder`    | Implementation of routes, components, derived state, URL sync                             |
| `/agent-reviewer` | Verifier between sub-phases: types, lint, tests, a11y checks, ERS coverage                 |
| `/nested-subagents` | Coordination pattern: producer (coder) + reviewer + designer working in tight loops  |

The verification chain is unchanged: `pnpm check && pnpm lint && pnpm test` must be green after every sub-phase, and the full set must be green before declaring Step 6 done.

---

## 1. Source of truth

| Doc                                            | Why we read it                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `docs/ers.md` §4.1 (Layout / Home / Editor)    | Authoritative for the three-region layout, home buttons, editor tabs                                          |
| `docs/ers.md` §3.1 (FR-1 to FR-15)             | Each functional requirement has a UI surface — covered explicitly in §3 of this plan                          |
| `docs/ers.md` §3.2 (NFR-1 / NFR-4 / NFR-6)     | Performance budgets, WCAG 2.1 AA, single string map for i18n                                                   |
| `docs/current-project-status.md` §"Next step"  | The "Step 6 scope" baseline + the "Known gaps" from Steps 4 and 5 that Step 6 inherits                        |
| `docs/current-project-status.md` §"Security audit" | CSP / SRI / Trusted Types carry-overs; minimum-viable CSP template is the floor                        |
| `src/lib/state/context.ts` + `state/index.ts`  | The store surface the UI must consume (no module-level singletons)                                            |
| `src/lib/components/*.svelte`                  | Existing scaffolds — inventory in §2.2                                                                          |

---

## 2. Current state inventory

### 2.1 Routes (all under `src/routes/`)

| File                       | LOC  | Status                                                                                                   |
| -------------------------- | ---- | -------------------------------------------------------------------------------------------------------- |
| `+layout.svelte`           | 108  | Wires all 8 stores, applies theme to `<html>`, runs `mode.bootstrap()`. **Missing:** the chrome (top bar / left rail) lives inside each page instead of here. |
| `+layout.ts`               | 4    | `ssr: false`, `prerender: false` — correct, no change.                                                    |
| `+page.svelte` (home)      | 158  | Open-local + open-remote form. **Missing:** recent-folders list, "Switch folder" affordance.              |
| `local/+page.svelte`       | 99   | Header with tabs (List / Kanban only), new-issue input, FilterBar, EditorPanel. **Missing:** Gantt tab, settings menu, integrity warning global banner, view-mode toggle in the layout itself. |
| `remote/+page.svelte`      | 70   | Mirrors local but read-only. **Missing:** refresh button, integrity warnings still surface (remote is read-only — they should remain informational, not blocking). |
| `wizard/+page.svelte`      | 225  | Functional. Heavy daisyUI styling. Keep the route, replace the markup in 6G.                              |

### 2.2 Components (all under `src/lib/components/`)

| File                       | LOC  | Status                                                                                                   |
| -------------------------- | ---- | -------------------------------------------------------------------------------------------------------- |
| `EditorPanel.svelte`       | 189  | Side drawer with Write/Preview tabs + integrity warning + validation count. **Missing:** template-driven form fields (uses raw `issueType`/`status`/`assignee`/`author` inputs only), inline per-field errors, field-level save-with-validation. |
| `FilterBar.svelte`         | 75   | Search + status + type. **Missing:** assignee, labels, date ranges, URL sync effect, derived config reads (current code uses an `as unknown as` cast — fragile). |
| `GanttView.svelte`         | 349  | Most complete file: SVG with groups / bars / dependency arrows + textual fallback. **Polish needed:** colors hard-coded against a 4-entry palette, no empty-state, no filter pill at the top. |
| `KanbanView.svelte`        | 80   | Columns from `config.statuses`, cards as buttons. **Missing:** drag-and-drop (Local), keyboard arrows, read-only visual indicator (Remote). |
| `ListView.svelte`          | 125  | Sortable table with id / title / type / status / assignee / labels / updated. **Missing:** filter pill count, sort indicator chevron, keyboard nav. |
| `ProxyWarningBanner.svelte`| 56   | Renders `mode.proxyWarning`. Functional; needs a design pass.                                            |
| `ThemeToggle.svelte`       | 49   | Renders an inline SVG. **Missing:** uses lucide, no animation.                                            |

### 2.3 The daisyUI gap

The existing markup uses classes that daisyUI ships: `btn`, `btn-primary`, `btn-ghost`, `card`, `card-body`, `navbar`, `tabs`, `tab-active`, `badge`, `alert`, `alert-warning`, `alert-error`, `input`, `input-bordered`, `select`, `select-bordered`, `textarea`, `checkbox`, `radio`, `menu`, `table-zebra`, `bg-base-100`, `text-base-content`, `border-base-300`. **daisyUI is not in `package.json`.** Two paths forward — see §3.

### 2.4 Store API surface (what the UI can call)

```
mode:        mode, localAdapter, remoteAdapter, recentHandles, hasRemoteCredentials,
             proxyWarning, bootstrap, openLocalFolder, openRemote, signOut
config:      config, status, error, load
templates:   templates, byType, status, error, load
issues:      issues, byId, byStatus, integrityWarnings, dirty, pendingSaves,
             status, error, load, create, update, save, discard, remove, validate
editor:      activeId, draft, isDirty, integrityWarning, errors,
             open, close, patchField, patchSection, save, discard
filter:      filter, set, clear, serialize, parse
view:        view, setView
theme:       theme, setTheme
```

No store factory imports the UI; UI reads via `getStores()` and wraps reads in `$state` cells (per `state/context.ts` doc). Tests stay in `server` project; UI tests land in `client` project.

---

## 3. Design system decision (the call you need to make first)

**The daisyUI question must be resolved before any sub-phase lands.**

### Decision (2026-06-23): Hybrid — Option C

We install daisyUI 5 and use it for the **primitive surfaces**, but build a small custom design system for the **hero surfaces**. This is the path that ships fastest while keeping the project's "purpose-built editor" character.

| Surface                                          | System         | Why                                                                                              |
| ------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------ |
| Forms (input / select / textarea / checkbox / radio) | **daisyUI 5**  | Standard controls, good defaults, accessible out of the box.                                     |
| Tables (List view)                               | **daisyUI 5**  | `table table-zebra` is fine for dense tabular data.                                              |
| Tabs (view switcher, Editor Write/Preview)       | **daisyUI 5**  | `tabs tabs-bordered` is the right primitive.                                                     |
| Modals (type picker, settings, confirm)          | **daisyUI 5**  | We add a small focus-trap wrapper, but the chrome is daisyUI's.                                  |
| Badges (status, type, label)                     | **daisyUI 5**  | Just need colour tokens to map.                                                                  |
| Tooltips                                         | **daisyUI 5**  | Standard.                                                                                        |
| **Top bar (`AppShell` / `TopBar`)**              | **Custom**     | First impression; needs to look deliberate.                                                      |
| **Left rail (`LeftRail`)**                       | **Custom**     | Custom density; this is the navigation surface.                                                  |
| **Home screen (`+page.svelte`)**                 | **Custom**     | The hero. Two equal-weight action cards, recent folders, copy.                                   |
| **Editor panel (`EditorPanel`)**                 | **Custom**     | The product surface. Custom form density, error styling, debounced preview, title input.         |
| **Wizard (`wizard/+page.svelte`)**               | **Custom**     | Setup flow; needs custom step indicator + template cards.                                        |
| **Settings panel**                               | **Custom**     | Side panel; needs a deliberate visual hierarchy.                                                 |
| **Gantt colors / type palette**                  | **Custom**     | Reads from `templatesStore.byType.get(type).color`; falls back to a hashed token.               |
| **Integrity warning banner**                     | **Custom**     | Renders across all surfaces; needs a deliberate style.                                          |
| **Empty states + skeletons**                     | **Custom**     | The polish layer.                                                                                |

**What the hybrid means in practice:**

1. Install `daisyui@^5` in `devDependencies`; add `@plugin 'daisyui';` to `src/routes/layout.css`.
2. Add **one** daisyUI theme named `nomad` (light + dark) that pulls from a single `tokens.css`. daisyUI's own theme variables become the *primitives* surface; our `tokens.css` provides the *hero* surface values.
3. Build `src/lib/ui/` for hero surfaces: `AppShell`, `TopBar`, `LeftRail`, `Wizard`, `SettingsPanel`, `EmptyState`, `Skeleton`, `IntegrityWarningBanner`. The daisyUI primitives (button, input, select, …) stay as direct class names; we do **not** wrap them in Svelte components unless a wrapper is needed for state (e.g. modal focus trap).
4. The `prose` styles from `@tailwindcss/typography` are unaffected — they style the Markdown Preview.

**CSP implication:** daisyUI 5 emits styles via CSS variables; the CSP rule for `style-src` stays `'self' 'unsafe-inline'` only if Tailwind 4 still emits inline `<style>` for the utilities. Confirm during 6A; if Tailwind 4 emits a single external stylesheet, the CSP tightens to `'self'`. Either way, the audit-friendly minimum-viable CSP stays compatible.

---

## 4. Sub-phases

Each sub-phase has: **Goal → Deliverables → Agent roles → Acceptance criteria → Dependencies**.

### 6A — Design tokens & theme

- **Goal:** Establish the visual foundation. Every component reads from the token system; dark mode is wired through `prefers-color-scheme` and the existing `themeStore`.
- **Deliverables:**
  - `src/lib/ui/tokens.css` — CSS custom properties (light + dark), motion, type scale, radius, shadow.
  - `src/routes/layout.css` updated: `@import 'tailwindcss';` + `@plugin '@tailwindcss/typography';` + `@theme { ... }` block that references the tokens; `@variant dark (&:where(.dark, .dark *));` (or use Tailwind 4's native dark variant selector if available).
  - `src/lib/state/theme.svelte.ts` — extend to read `prefers-color-scheme` on first load (currently deterministic; current-project-status §"Known follow-ups" item 2).
  - `src/routes/+layout.svelte` — apply the theme to `<html class="dark">` synchronously (no flash); keep the existing bootstrap block, add the prefers-color-scheme read.
- **Agent roles:** `/frontend-design` (token values, palette, type scale), `/agent-coder` (CSS + theme wiring), `/agent-reviewer` (verifies dark-mode parity, no flash).
- **Acceptance criteria:**
  - Refreshing in dark system theme shows the app in dark mode on first paint (no flash of light content).
  - Toggling `ThemeToggle` flips the scheme and persists across reloads.
  - Every Tailwind class used in `src/lib/components/*` resolves to a token (no hex literals outside `tokens.css`).
  - `pnpm check` clean; `pnpm lint` clean.
- **Dependencies:** none. **Blocks:** 6B.

### 6B — Primitive component library

- **Goal:** Build the small, opinionated set of primitives that every screen consumes. Every primitive exposes a Svelte 5 `Snippet` for content (`children`), forwards `class` for one-off tweaks, and ships with `aria-*` props passed through.
- **Deliverables:** `src/lib/ui/{Button,IconButton,Input,Textarea,Select,Checkbox,Radio,Tabs,Badge,Alert,Modal,Tooltip,Menu,Card,Toolbar,Skeleton,EmptyState}.svelte` plus a barrel `src/lib/ui/index.ts`. Each file ≤ 120 lines. Tailwind 4 only, no daisyUI.
  - **Button** — variants: `primary | secondary | ghost | danger | success`; sizes: `sm | md | lg`; supports `loading`, `disabled`, `icon`.
  - **Input** — text + number + date; binds to a `string`; exposes `error: string | null`.
  - **Select** — wraps a native `<select>` for keyboard / mobile a11y; supports `placeholder`.
  - **Tabs** — `role="tablist"` + arrow-key navigation (NFR-4) + `aria-selected` per the WAI-ARIA Authoring Practices.
  - **Modal** — focus trap, ESC to close, restores focus to the trigger on close.
  - **Skeleton** — pulsing placeholder used in loading states.
  - **EmptyState** — `{ title, body, action? }` shape; used by every list view when filtered to zero rows.
- **Agent roles:** `/frontend-design` (visual design — focus rings, hover, active, disabled, dark-mode parity), `/impeccable` (a11y pass + micro-interactions + empty-state copy), `/agent-coder` (markup + props), `/agent-reviewer` (verifies a11y attributes + dark-mode parity).
- **Acceptance criteria:**
  - Every primitive passes the `client` project a11y smoke test (focus-visible, ESC, tab order, aria-*).
  - Storybook-style demo route (optional) under `/__dev/ui` behind a `import.meta.env.DEV` guard. (Skip if you'd rather skip the demo route — every primitive is exercised by 6C–6H anyway.)
  - No `console.log` in the primitives; no inline styles; no `as unknown as` casts.
  - `pnpm test` clean (add a `tests/ui/*.svelte.test.ts` for the tab keyboard nav + modal focus trap at minimum).
- **Dependencies:** 6A. **Blocks:** 6C–6H.

### 6C — Layout shell (`+layout.svelte`)

- **Goal:** Per ERS §4.1.1, the layout has three regions: top bar, left rail, main canvas. Today each page re-implements the header. Move it here.
- **Deliverables:**
  - `src/routes/+layout.svelte` rewritten with the three-region layout.
  - `src/lib/components/AppShell.svelte` — wraps the three regions; takes `{ mode, onSignOut, onSwitchFolder }` props.
  - `src/lib/components/TopBar.svelte` — app name, current mode badge (Local / Remote / Read-only), current folder or repo URL, theme toggle, settings menu trigger.
  - `src/lib/components/LeftRail.svelte` — view switcher (List / Kanban / Gantt), collapsible filter panel, integrity warning badge (count of `issuesStore.integrityWarnings.length`).
  - `src/lib/components/IntegrityWarningBanner.svelte` — global banner (replaces the per-editor inline warning in `EditorPanel.svelte`). Reads `integrityWarnings` from the store; clicking a row scrolls to / opens the issue in the editor.
  - Filter panel becomes collapsible in the rail; collapse state is local to the layout (no need to persist in v0).
  - Settings menu — see 6H; for now, just a placeholder `<SettingsMenu>` slot.
- **Agent roles:** `/frontend-design` (visual hierarchy of the three regions), `/agent-coder` (markup + reactivity), `/agent-reviewer` (verify region collapse / focus order).
- **Acceptance criteria:**
  - All three pages (home / local / remote) inherit the top bar and left rail; the home page is a single column (no left rail).
  - `prefers-color-scheme` is respected on first paint (no flash) — covered by 6A but verified here.
  - `pnpm check && pnpm lint && pnpm test` clean.
- **Dependencies:** 6A, 6B. **Blocks:** 6D, 6E, 6F, 6G, 6H.

### 6D — Home screen (`+page.svelte`)

- **Goal:** Per ERS §4.1.2, the home screen has two large buttons (Open local / Browse remote) and a recent folders list.
- **Deliverables:**
  - `src/routes/+page.svelte` rewritten as a centred hero with two equal-weight action cards, a "Recent folders" list pulled from `modeStore.recentHandles`, and a small-print privacy line ("PAT held in memory only…").
  - The "Switch folder" affordance (ERS §4.1.2 footnote) reuses the home's primary action — `LocalFsAdapter.pick()` then `modeStore.openLocalFolder()`.
  - Open-remote form becomes a single card with URL / branch / PAT fields and the proxy warning copy inline.
  - Empty-state for `recentHandles` (first-time user) — friendly copy + a 3-step "How it works" strip.
- **Agent roles:** `/frontend-design` (hero composition, empty state, micro-copy), `/impeccable` (polish on the recent-folders list — icons, hover, focus), `/agent-coder` (markup + `modeStore` wiring), `/agent-reviewer` (a11y — every action reachable by keyboard, the PAT input is `autocomplete="off"` and visually labelled).
- **Acceptance criteria:**
  - Two tabs / focus order, both actions reachable in 2 keystrokes (Tab + Enter).
  - `recentHandles` updates in place when a folder is opened; capped at 5 per `handle-store.ts` contract.
  - `pnpm check && pnpm lint && pnpm test` clean.
- **Dependencies:** 6C. **Blocks:** none.

### 6E — Local view (`local/+page.svelte` + 3 view components)

- **Goal:** All three views (List, Kanban, Gantt) reachable; CRUD wired; integrity banner visible; Gantt is currently the most complete file — keep the SVG, polish the surrounding chrome.
- **Deliverables:**
  - `src/routes/local/+page.svelte` rewritten as a thin composition: `<AppShell mode="local">` + `<FilterBar>` + view switcher + the active view + `<EditorPanel>` mounted as a side drawer.
  - **`ListView.svelte`** — re-skin with the new tokens; sort indicator chevron; row count + filter-pill summary at the top; keyboard nav (arrow keys move row focus, Enter opens).
  - **`KanbanView.svelte`** — columns from `config.statuses` with the column colour at the header; **add `svelte-dnd-action` for drag-and-drop in Local Mode**; on drop, call `issuesStore.update(id, { status: newColumnId })` + `issuesStore.save(id)`. Keyboard mode (NFR-4): focus a card, then ←/→ moves it to the adjacent column; ↑/↓ moves within a column; Enter opens the editor.
  - **`GanttView.svelte`** — keep the SVG, re-skin colours against the type palette from `templatesStore.byType` (instead of the hard-coded 4-entry map); add a textual-fallback toggle in the toolbar (always shown via `<details>` for now, NFR-4 already satisfied); empty state when no issues are dated.
  - **Toolbar** — new-issue button opens a type-picker modal (instead of the current free-text `newType` input); trash count + "Empty trash" command (FR-4); refresh (re-runs `issuesStore.load()`).
  - **Read-only guard** — in Remote Mode, drag is visual only (DnD wired but the drop handler is a no-op + a tooltip "Read-only — open this issue locally to change its status"); editor's Save button is disabled with a tooltip; "New issue" is hidden entirely.
- **Agent roles:** `/agent-coder` (markup, DnD wiring, keyboard handlers, modal), `/impeccable` (empty states, motion on drag, loading skeleton during `load()`), `/agent-reviewer` (DnD keyboard parity, focus restoration, NFR-1 perf budget).
- **Acceptance criteria:**
  - All three views pass the NFR-1 perf budget: List renders 1 000 issues with filter/sort interactive in < 500 ms; Kanban handles 500 issues across 5 columns without frame drops; Gantt renders 200 bars + arrows in < 200 ms. Verified by a Playwright perf script under `tests/perf/step-6.perf.test.ts`.
  - DnD works with mouse, touch, and keyboard (NFR-4).
  - Every view handles the empty state (`issues.length === 0` after filter) and the loading state (`issues.status === 'loading'`) without layout jank.
  - `pnpm check && pnpm lint && pnpm test` clean.
- **Dependencies:** 6A, 6B, 6C. **Blocks:** none.

### 6F — Remote view (`remote/+page.svelte`)

- **Goal:** Same as Local but read-only, with the proxy warning banner and a Refresh command.
- **Deliverables:**
  - `src/routes/remote/+page.svelte` rewritten as the same shell as Local, with:
    - `<ProxyWarningBanner>` mounted in the top bar (already exists; re-skin in 6C).
    - "Refresh" button in the toolbar → re-runs `modeStore.bootstrap()`'s remote branch or a new `modeStore.refreshRemote()` (add this method if missing — it should re-call `openRemote` with the cached credentials minus the PAT, prompting for the PAT again if it's not in memory).
    - "Sign out" in the top bar's settings menu (already exists; move to settings menu).
  - View components reused from 6E but rendered in their read-only branch.
- **Agent roles:** `/agent-coder` (refresh wiring), `/impeccable` (read-only affordances — disabled states look intentional, not broken), `/agent-reviewer` (verify no write paths are reachable).
- **Acceptance criteria:**
  - No New issue / Save / Delete / Kanban DnD has any effect in Remote Mode.
  - Refresh re-fetches and updates the cache (verify against the `remote-git` adapter's `clearCache` flow).
  - `pnpm check && pnpm lint && pnpm test` clean.
- **Dependencies:** 6C, 6E. **Blocks:** none.

### 6G — Editor panel (`EditorPanel.svelte`)

- **Goal:** Template-driven form fields, inline per-field validation errors, keyboard-friendly tab order, Markdown preview that updates on demand.
- **Deliverables:**
  - `src/lib/components/EditorPanel.svelte` rewritten.
  - **`FormFields.svelte`** — renders one row per `template.fields[]` in ascending `id` order; scalar fields become the matching primitive (`Input` / `Textarea` / `Select` / `Checkbox` / `Radio`); `multi-select` renders as chip multi-select; `user` becomes a `Select` of `config.users`; `relations` becomes a chip multi-select that resolves ids back to titles. Each field shows its error (from `editor.errors[]` filtered by field key) inline beneath the input.
  - **Tabs** — `Write` (raw Markdown for the active section) / `Preview` (rendered Markdown). Per ERS §4.1.3, the form is shown above the tabs only for non-`longtext` / non-section fields (already the case).
  - **Preview** — call `renderMarkdown(markdown, 'comment')` (already exists in `adapters/renderer.ts`); debounce by 250 ms while typing; show a "Rendering…" skeleton for the first 200 ms.
  - **Save** — disabled if `editor.isDirty === false` OR `editor.errors.length > 0`; on click, calls `editorStore.save()` (already exists in state).
  - **Discard** — disabled if `!editor.isDirty`; calls `editorStore.discard()`.
  - **Close** — same keyboard shortcut (ESC) and a × button in the header.
  - **Title** — bound to `issue.title`; renaming updates the filename on next save (state layer already handles this via `buildIssueFilename`).
  - **Type** — read-only select when the issue already has the type set; if changed, prompt a confirm dialog ("Changing the type will keep the existing sections but switch the form to the new template's fields.").
- **Agent roles:** `/frontend-design` (form density, label hierarchy, error styling), `/agent-coder` (template-driven form, validation wiring, debounce), `/impeccable` (focus management, error message copy, loading states), `/agent-reviewer` (a11y — every field has a label, errors are announced via `aria-describedby`).
- **Acceptance criteria:**
  - Opening an issue renders every field declared by its template, in the right order, with the right primitive.
  - An obligatory field left empty shows an inline error on blur and on Save; Save is disabled while the error persists.
  - The Preview tab updates within 500 ms of the user stopping typing.
  - Changing the type from Bug → Task keeps the existing sections (only the form changes).
  - `pnpm check && pnpm lint && pnpm test` clean.
- **Dependencies:** 6A, 6B. **Blocks:** none.

### 6H — Wizard (`wizard/+page.svelte`) + Settings panel

- **Goal:** Polish the wizard; add a settings panel for CORS proxy + theme + recent folder cleanup.
- **Deliverables:**
  - `src/routes/wizard/+page.svelte` rewritten with the new tokens + primitives. Keep the existing logic (the file is already functional). The "Create your own" path remains a disabled placeholder; the ERS allows it to ship as a future editor.
  - `src/lib/components/SettingsPanel.svelte` — slides in from the right; shows CORS proxy URL (editable, persisted to `config.json` via `configStore` once the writer exists — for now, just a UI field that re-loads on save), theme (Light / Dark / System), recent folders list with a "Forget" affordance, "Clear remote cache" command (calls `remote-git.clearCache`), and an "Empty trash" command (FR-4).
  - Wire the settings menu trigger from 6C to open the panel.
- **Agent roles:** `/frontend-design` (settings panel layout, field grouping, copy), `/agent-coder` (modal, state wiring), `/impeccable` (modal motion + a11y), `/agent-reviewer` (no PAT ever touches the panel; theme picker honours the System option).
- **Acceptance criteria:**
  - Settings panel slides in / out with focus trap; ESC closes and restores focus to the trigger.
  - Theme picker has three options (Light / Dark / System); "System" follows `prefers-color-scheme` and updates live.
  - "Forget" removes a handle from `recentHandles` and the IndexedDB.
  - "Empty trash" moves every `.nomad.md/.trash/*.md` to permanent delete (or shows a confirm modal — pick one and document).
  - `pnpm check && pnpm lint && pnpm test` clean.
- **Dependencies:** 6A, 6B, 6C. **Blocks:** none.

### 6I — Filter URL sync (audit carry-over)

- **Goal:** Active filter set serialised to a URL query parameter and restored on page load (FR-7 last bullet + audit carry-over).
- **Deliverables:**
  - `$effect` in `+layout.svelte` (or in a dedicated `FilterUrlSync.svelte` mounted by the layout) that:
    1. On every `filter.filter` change, calls `history.replaceState(null, '', '?' + filter.serialize())` (debounced by 100 ms).
    2. On mount, parses `window.location.search` and calls `filter.parse(queryString)`.
    3. Listens to `popstate` to re-parse on back / forward.
  - `filterStore.serialize()` and `parse()` already exist (per `state/filter.svelte.ts`); this sub-phase is just the wiring.
- **Agent roles:** `/agent-coder` (effect, debounce), `/agent-reviewer` (no infinite loop — push only when state actually changes, not on every effect tick).
- **Acceptance criteria:**
  - Reloading the page restores the filter set from the URL.
  - Back / forward navigation re-applies the prior filter.
  - A 100-issue List view re-renders the URL within 150 ms of a filter change.
  - `pnpm check && pnpm lint && pnpm test` clean.
- **Dependencies:** none (parallel to 6C–6H). **Blocks:** 6K.

### 6J — i18n string map (NFR-6)

- **Goal:** Every user-facing string is sourced from a single map so future i18n is mechanical.
- **Deliverables:**
  - `src/lib/ui/strings.ts` — flat object keyed by dotted path, e.g. `home.recentFolders.title`, `editor.save.disabled.dirty`, `kanban.empty`, `wizard.builtin.optionDescription`. English-only for v1.
  - A tiny `$t(key, params?)` helper that reads from the map and substitutes `{name}`-style placeholders.
  - Replace every hard-coded English string in `src/lib/components/**` and `src/routes/**` with `$t(...)` calls.
  - A lint rule (or a code-mod script under `scripts/check-i18n.mjs`) that fails the build if a literal English string appears in a `.svelte` template outside of the strings map. Wired into `pnpm lint`.
- **Agent roles:** `/agent-coder` (helper + replacement pass), `/agent-reviewer` (lint rule coverage).
- **Acceptance criteria:**
  - `pnpm lint` flags any literal English string in `.svelte` files that doesn't have a corresponding key in `strings.ts`.
  - The map is alphabetically ordered and grouped by surface (home / editor / list / kanban / gantt / wizard / settings / common).
  - `pnpm check && pnpm lint && pnpm test` clean.
- **Dependencies:** 6C–6H (needs the surfaces to be stable first). **Blocks:** none.

### 6K — Accessibility audit (NFR-4)

- **Goal:** Verify the whole UI is WCAG 2.1 AA. Find issues, fix them, document the audit.
- **Deliverables:**
  - `tests/a11y/step-6.a11y.test.ts` — Playwright + `@axe-core/playwright` (or the equivalent in the project's chosen stack). Runs against the home, local List, local Kanban, local Gantt, editor, wizard, and settings panel.
  - Issues found become a checklist in `docs/audits/2026-06-23/step-6-a11y.md`; fixes land before 6K closes.
  - Manual smoke (per Step 4 carry-over): keyboard-only walkthrough, screen-reader smoke (NVDA / VoiceOver), 200% zoom smoke.
- **Agent roles:** `/impeccable` (audit owner), `/agent-coder` (fixes), `/agent-reviewer` (verifies fixes).
- **Acceptance criteria:**
  - Zero serious or critical axe violations across all surfaces.
  - Keyboard-only walkthrough completes the canonical UC-1 (open folder → create issue → save → reload).
  - `pnpm test` clean.
- **Dependencies:** 6C–6H, 6I, 6J. **Blocks:** 6M.

### 6L — CSP & security headers (audit carry-over)

- **Goal:** Ship the minimum-viable CSP from `current-project-status.md` §"Security audit" so the static deployable is no longer a 1/5 on transport-layer hardening.
- **Deliverables:**
  - `static/_headers` (Netlify / Cloudflare Pages format) with the CSP, HSTS, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy from the audit.
  - `docs/hosting/github-pages.md` — equivalent `<meta http-equiv>` tags for GitHub Pages (which doesn't honour `_headers`). Note that `<meta>` cannot set HSTS, so GitHub Pages users keep an "informational" warning.
  - Update `scripts/add-sri.mjs` (or add a new step in the build pipeline) to also stamp the CSP nonce on inline `<style>` blocks generated by Tailwind 4's CSS-in-JS at build time. (Tailwind 4 emits a single bundle `<link>`; if any component-level `<style>` blocks remain, nonce them.)
  - `pnpm build` smoke run — `build/index.html` references the headers, no inline event handlers, no inline `<script>` outside the bundle.
- **Agent roles:** `/agent-coder`, `/agent-reviewer` (verify no `unsafe-inline` slips in, that the SRI script still runs).
- **Acceptance criteria:**
  - `pnpm build` produces a `build/_headers` file.
  - Loading `build/index.html` in a browser with the headers applied shows zero CSP violations in the dev tools console.
  - `pnpm audit` still clean.
  - `pnpm check && pnpm lint && pnpm test` clean.
- **Dependencies:** 6C–6H. **Blocks:** 6M.

### 6M — Smoke test & verify (Step 8 prep)

- **Goal:** Manual smoke (per the Step 4 carry-over) + the final `pnpm check && pnpm lint && pnpm test` chain.
- **Deliverables:**
  - `docs/changelogs/step-6-report.md` — what landed, in the format of the Step 4 and Step 5 reports.
  - Update `docs/current-project-status.md` — Step 6 marked Done, Step 7 + 8 still Pending.
  - Manual smoke script in `docs/smoke-tests/step-6.md` (UC-1 → UC-4 from the ERS §7).
- **Agent roles:** `/agent-reviewer` (runs the smoke + the verify chain), `/agent-coder` (writes the report).
- **Acceptance criteria:**
  - `pnpm check && pnpm lint && pnpm test` all green.
  - UC-1 → UC-4 all pass manually in Chromium (Local Mode) and Firefox (Remote Mode).
  - Report + status doc committed.
- **Dependencies:** all of 6A–6L. **Blocks:** Step 7.

---

## 5. Cross-cutting quality bars

These run through every sub-phase — they are not standalone work.

| Bar                                     | Source                    | Where it's enforced                                                                                       |
| --------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------- |
| **WCAG 2.1 AA**                         | NFR-4                     | Primitive lib (6B), every screen (6C–6H), audited (6K)                                                    |
| **Keyboard-only operability**           | NFR-4                     | Tab order, focus traps, arrow keys for tabs / Kanban / Gantt, ESC for modal / editor close               |
| **Color is never the only signal**      | NFR-4                     | Status / label / type colour always paired with text or icon                                              |
| **English-only i18n from a single map** | NFR-6                     | 6J, lint rule                                                                                              |
| **PAT in memory only**                  | NFR-2                     | Already enforced in state layer; verify no UI path persists or echoes it back                            |
| **No third-party network calls**        | NFR-3                     | CSP `connect-src` (6L); `noindex,nofollow` on the home page                                              |
| **Markdown sanitised before render**    | FR-13 / NFR-2             | `renderMarkdown` + DOMPurify (already in place); the editor's Preview tab is the only consumer             |
| **Theme persistence + no flash**        | FR-14                     | 6A wires `prefers-color-scheme` on first paint                                                            |
| **CSP / SRI / Trusted Types**           | Audit carry-over          | 6L; `scripts/add-sri.mjs` already exists, no regression                                                  |
| **Filter URL sync**                     | FR-7                      | 6I                                                                                                        |
| **Performance budgets (NFR-1)**         | NFR-1                     | 6E includes a Playwright perf script; < 500 ms / 500 / 200 ms per view                                    |
| **Lint + check + test green**           | Project standard          | Run after every sub-phase, never let it rot                                                              |

---

## 6. Verification matrix (end of Step 6)

| Check                                                  | Owner         | Pass criterion                                                |
| ------------------------------------------------------ | ------------- | ------------------------------------------------------------- |
| `pnpm check`                                           | reviewer      | 0 errors, 0 warnings                                          |
| `pnpm lint`                                            | reviewer      | Prettier clean; ESLint clean; i18n rule passes                |
| `pnpm test`                                            | reviewer      | 700+ tests passing across 35+ files (rough estimate)          |
| `pnpm coverage` (state + services + adapters)          | reviewer      | ≥ 80 % lines (audit §13 target)                               |
| `pnpm audit`                                           | reviewer      | 0 advisories (overrides stay in place)                        |
| `pnpm build`                                           | reviewer      | Succeeds; `_headers` and SRI both emitted; bundle ≤ 350 kB gz |
| WCAG 2.1 AA (axe)                                      | impeccable    | Zero serious / critical violations                            |
| Keyboard-only walkthrough (UC-1)                       | reviewer      | Completes without a mouse                                     |
| UC-1 (open folder → create issue → save → reload)      | reviewer      | Passes manually in Chromium                                   |
| UC-2 (browse remote read-only)                         | reviewer      | Passes manually in Firefox                                    |
| UC-3 (Kanban drag updates status + persists)           | reviewer      | Passes manually in Chromium                                   |
| UC-4 (Gantt renders bars + dependency arrows)          | reviewer      | Passes manually in Chromium                                   |
| NFR-1 perf budget                                      | reviewer      | 1000 / 500 / 200 ms; Playwright perf script                   |
| Docs updated                                           | coder         | `current-project-status.md` + `changelogs/step-6-report.md`   |

---

## 7. Out of scope (deferred)

- **In-app template editor** ("Create your own" in the wizard). ERS allows it to ship as a future step; the wizard's disabled radio is the v0 contract.
- **Settings panel writer to `config.json`** (the CORS proxy field is in the UI but the save-to-disk wire-up is a small follow-up — `configStore` doesn't expose a write yet; add a `configStore.save()` as a follow-up).
- **Mobile breakpoints** (NFR-5 explicitly excludes mobile in v1). Make sure primitives don't break at narrow widths, but don't invest in a mobile-specific layout.
- **Live `RUN_LIVE_TESTS=1` remote integration** — still a known carry-over from Step 4.
- **Fuzz / property-based tests** — still deferred to Step 8 polish.
- **Trash auto-emptying** — the "Empty trash" command is a manual step in v0.
- **YAML cosmetic divergences** (date quoting, block vs flow style) — leave as-is per Step 5 carry-over.

---

## 8. Suggested sequence

Roughly 11 working days end-to-end. Adjust based on whether you take Option A (daisyUI) or Option B (custom).

| Day  | Sub-phases                | Notes                                                                                  |
| ---- | ------------------------- | -------------------------------------------------------------------------------------- |
| 1    | 6A (tokens + theme)       | Decision: Option A or B from §3 must be locked first.                                  |
| 2–3  | 6B (primitives)           | The slowest, most leveraged sub-phase. Re-use 6B's primitives in every later surface.  |
| 4    | 6C (layout shell)         | All three pages now share the chrome.                                                  |
| 5    | 6D (home)                 | Recent folders list lands here.                                                        |
| 6–7  | 6E (local view)           | The heaviest sub-phase: List + Kanban DnD + Gantt polish + the toolbar.                |
| 8    | 6F (remote view)          | Reuses 6E; mostly the read-only guards + refresh command.                              |
| 8    | 6G (editor)               | Parallel to 6F — different file.                                                       |
| 9    | 6H (wizard + settings)    | Settings panel can also land on day 9.                                                 |
| 9    | 6I (filter URL sync)      | Small sub-phase; wire once the layout is stable.                                       |
| 10   | 6J (i18n) + 6L (CSP)      | Parallel-friendly; both are mechanical pass-overs.                                     |
| 11   | 6K (a11y) + 6M (smoke)    | Audit + verify; report + status doc.                                                   |

If you choose Option A (daisyUI), drop 6A and shorten 6B; the calendar shrinks to ~7 days.

---

## 9. Risks & open questions

1. **`/impeccable` and `/agent-reviewer` are not registered as standalone agents in the current Mavis agent roster.** They are referenced as roles in this plan. When the time comes to execute, you can either (a) spawn `agent-coder` for the producer work and reserve the reviewer role for me (Mavis / mavis) in a verification pass, or (b) define `impeccable` and `agent-reviewer` as new agents under `.harness/reins/` and let `mavis-team` orchestrate. The plan is intentionally agent-agnostic so it works either way.
2. **DaisyUI vs custom (§3) is the single biggest decision.** Lock this before sub-phase 6A.
3. **dnd-and-keyboard for Kanban** is the trickiest piece of 6E. The `svelte-dnd-action` library supports keyboard mode via `dragDisabled` + a sibling `<button>`-driven reorder path. Plan a half-day spike before 6E starts.
4. **`GanttView` colour palette** currently hard-codes 4 entries. The cleaner approach is to read from `templatesStore.byType.get(type).color` and fall back to a token. If a template defines no `color`, fall back to a deterministic hash → token. Decision needed by 6E.
5. **Type-picker modal** for new-issue in 6E is a UX call: dropdown vs. segmented control vs. modal with thumbnails. Default: a small modal with the 4 built-in types' icons + names. Confirm before 6E.
6. **Settings panel "Save CORS proxy to config.json"** is in scope for 6H but requires a `configStore.save()` method. If you want to defer the writer to Step 7, document that the field is UI-only in Step 6.
7. **Trash command UX** — confirm vs. undo. Default: confirm modal. If undo, FR-4 wording needs review.

---

## 10. How this plan maps to your multi-agent ask

When you want to execute, the natural pattern is:

1. **You** (or I, via `mavis communication send`) spawn an `agent-coder` worker per sub-phase (6A through 6M). Each worker receives this plan's sub-section as its brief and a pointer to the ERS / current-project-status / relevant `src/lib/**` files.
2. **The worker** implements the sub-phase, runs `pnpm check && pnpm lint && pnpm test`, and returns a `diff summary + test count + open questions` report.
3. **I** (Mavis, in this session) act as the reviewer for each sub-phase: I read the diff, check the acceptance criteria, and either approve the merge or send the worker back with a focused fix list.
4. **`/frontend-design`** and **`/impeccable`** are best invoked as a single combined design pass after 6A is done and before 6B. They produce the token values, the primitive visual reference, and the motion grammar that 6B implements.
5. **`/nested-subagents`** is the orchestration pattern: one producer (`agent-coder`), one reviewer (me, Mavis), one design pass (`/frontend-design` + `/impeccable`) — kept in a tight loop until the bar in §6 is met.

The plan is deliberately written so a sub-agent can be pointed at one sub-section and be productive without re-reading the whole ERS. The cross-references in §1 are there for the cases where a worker needs to check the source of truth.
