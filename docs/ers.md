# Engineering Requirements Specification — nomad\.md

| Field       | Value              |
| ----------- | ------------------ |
| Document ID | `ERS-NOMAD-MD-001` |
| Version     | 1.0.0              |
| Status      | Draft              |
| Date        | 2026-06-20         |
| Author      | Jose               |
| Project     | nomad\.md          |

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Overall Description](#2-overall-description)
3. [Specific Requirements](#3-specific-requirements)
4. [External Interface Requirements](#4-external-interface-requirements)
5. [System Architecture](#5-system-architecture)
6. [Data Model](#6-data-model)
7. [Use Cases](#7-use-cases)
8. [Acceptance Criteria](#8-acceptance-criteria)
9. [Out of Scope](#9-out-of-scope)
10. [Glossary and Appendices](#10-glossary-and-appendices)

---

## 1. Introduction

### 1.1 Purpose

This Engineering Requirements Specification (ERS) describes the functional and non-functional requirements, architecture, and data model of **nomad\.md**, a client-side-only web application that allows developers to author, manage, and browse project issues that are stored directly in the source repository as plain Markdown files with a custom frontmatter-and-section format.

The goal of the project is to remove the dependency on third-party issue trackers (e.g. GitHub Issues, Jira, Linear) for small to mid-sized projects whose source of truth is already a Git repository, while preserving a workflow that feels like editing local files in a purpose-built editor.

### 1.2 Scope

**In scope (v1):**

- A single-page web application built with SvelteKit (`adapter-static`) that runs entirely in the user's browser. There is no server-side component, no API endpoint, and no telemetry.
- A **Local Edit Mode** that reads and writes issue files inside a user-selected local folder through the File System Access API (FSA).
- A **Remote Read-Only Mode** that uses `isomorphic-git` to perform a partial clone of the user's Git repository (only the `.nomad.md/` subtree), reads issue files, and renders them without ever writing to the remote.
- A configuration and template system that lives inside the same repository under `.nomad.md/`, allowing each project to define its own issue types, fields, sections, statuses, labels, and workflow columns.
- Three views over the issue set: a tabular **List view**, a **Kanban** board, and a **Gantt** timeline.
- A filter bar that combines multiple criteria (type, status, assignee, label, free text, date range).

**Out of scope (v1):** see [Section 9](#9-out-of-scope).

### 1.3 Definitions and Acronyms

| Term           | Definition                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| ERS            | Engineering Requirements Specification (this document).                                                                         |
| FSA            | File System Access API. A browser API that grants JavaScript read/write access to a user-selected local directory.              |
| PAT            | Personal Access Token. A credential used to authenticate against a Git provider.                                                |
| SPA            | Single-Page Application.                                                                                                        |
| Frontmatter    | The YAML metadata block at the top of a Markdown file, delimited by `---`.                                                      |
| Section marker | An HTML comment pair of the form `<!-- [SECTION_START: name] -->` and `<!-- [SECTION_END: name] -->`.                           |
| Template       | A JSON file under `.nomad.md/templates/` describing the fields and sections of one issue type.                                  |
| Issue          | A single Markdown file under `.nomad.md/issues/`, with a frontmatter header and a body of section-delimited Markdown.           |
| Partial clone  | A clone of a Git repository that fetches only a specified subtree of the working tree, rather than the full repository history. |
| LightningFS    | An IndexedDB-backed virtual filesystem used by `isomorphic-git` in the browser.                                                 |

### 1.4 References

- SvelteKit documentation: <https://kit.svelte.dev>
- File System Access API: <https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API>
- `isomorphic-git`: <https://isomorphic-git.org>
- `gray-matter`: <https://github.com/jonschlinkert/gray-matter>
- `js-yaml`: <https://github.com/nodeca/js-yaml>
- `marked`: <https://marked.js.org>
- `DOMPurify`: <https://github.com/cure53/DOMPurify>
- `svelte-dnd-action`: <https://github.com/isaacHagoel/svelte-dnd-action>
- Tailwind CSS: <https://tailwindcss.com>
- lucide icons: <https://lucide.dev>

### 1.5 Revision History

| Version | Date       | Author | Notes          |
| ------- | ---------- | ------ | -------------- |
| 1.0.0   | 2026-06-20 | Jose   | Initial draft. |

---

## 2. Overall Description

### 2.1 Product Perspective

nomad\.md is a **purely client-side web application**. It is delivered as a static asset bundle (HTML, CSS, JavaScript) and can be hosted on any static file host (e.g. GitHub Pages, Netlify, Cloudflare Pages, S3). It does not require any backend service to function; the user's browser is the only runtime.

The application interacts with two external resources only:

1. **The local file system** (in Local Edit Mode) — the user's folder on disk, accessed through FSA.
2. **A remote Git repository** (in Remote Read-Only Mode) — accessed through `isomorphic-git`'s HTTP transport, optionally fronted by a CORS proxy.

There is no first-party server. There is no analytics. The Personal Access Token is held in memory only and is never persisted.

### 2.2 Operating Modes

The application exposes two operating modes. The user picks one at the home screen.

#### 2.2.1 Local Edit Mode

- On first use, the user is prompted to select a local folder via `showDirectoryPicker()`.
- The application expects the folder to contain a `.nomad.md/` directory (see [Section 6](#6-data-model)). If it does not, the application runs the **First-Run Template Setup wizard** (FR-11).
- After the wizard finishes, the application reads `.nomad.md/config.json` and `.nomad.md/templates/*.json` to construct the issue-type schema and the workflow configuration.
- The application reads the issue files in `.nomad.md/issues/`, presents them through the available views, and supports full CRUD: create, edit, delete, and reorder (via Kanban drag).
- All writes are performed through the FSA `FileSystemFileHandle` obtained at folder selection. The user is responsible for committing and pushing the changes through their own Git workflow.
- The folder handle is **persisted** across sessions through the FSA permission model (`requestPermission({ mode: 'readwrite' })`). On startup, the application attempts to re-acquire the handle silently; if permission is denied or revoked, the user is prompted again. A "Switch folder" affordance in the UI allows the user to open a different folder at any time without losing the original handle (which is kept in memory but inactive until selected again).

#### 2.2.2 Remote Read-Only Mode

- The user enters a repository URL (HTTPS), a branch (default: the repository's default branch), and a PAT (required for private repositories; optional for public ones, depending on the provider's rate limit policy).
- The application uses `isomorphic-git` to perform a **partial clone** of the repository, fetching **only the `.nomad.md/` subtree** (FR-12). It does not download the rest of the repository.
- The fetched tree is materialized into a LightningFS instance backed by IndexedDB. The cache is keyed by repository URL + branch.
- The application then behaves identically to Local Edit Mode, **except that all write operations are disabled**. Kanban drag-and-drop is rendered but inert; the editor is read-only; the "New issue" button is hidden.
- The PAT is held in memory only and is dropped when the user navigates away from the Remote Mode screen or closes the tab.

### 2.3 User Characteristics

The target user is a **software developer** who:

- Is comfortable with the command line, Git, and Markdown.
- Owns or contributes to a Git repository in which they wish to track issues.
- Has a Personal Access Token for the relevant Git provider (GitHub, GitLab, Bitbucket, Gitea, or any provider that exposes the Git Smart HTTP protocol with permissive CORS).
- Uses a Chromium-based browser (Chrome, Edge, Brave, Arc, Opera, Vivaldi) for the Local Edit Mode. The Remote Read-Only Mode is usable from any modern browser, including Firefox and Safari.

### 2.4 Constraints

- **C-1 (No backend):** The application MUST NOT depend on any server-side component for its core functionality. Hosting is purely static.
- **C-2 (No remote writes):** The application MUST NOT push to, create branches on, open pull requests on, or otherwise modify any remote Git repository. The user is fully responsible for version control.
- **C-3 (Local-mode browser support):** Local Edit Mode is only available on browsers that implement FSA. This is, at the time of writing, Chromium-based browsers. Firefox and Safari are unsupported for Local Edit Mode but remain supported for Remote Read-Only Mode.
- **C-4 (Permission re-grant):** FSA permission may be revoked by the user or by the browser between sessions. The application MUST handle the resulting `NotAllowedError` gracefully and re-prompt.
- **C-5 (CORS):** The Git Smart HTTP protocol is not, in general, CORS-friendly on public providers. The application MUST work through a CORS proxy. The default proxy is the public `https://cors.isomorphic-git.org`. Users may configure a custom proxy in `.nomad.md/config.json` (FR-12, [Section 6.3](#63-config-file)).
- **C-6 (Token hygiene):** The PAT MUST NOT be persisted, logged, transmitted to any non-provider endpoint, or exposed in URLs. The CORS proxy sees the token via the `Authorization` header, which is acceptable as long as the proxy URL is one the user trusts (the default proxy is documented as a public, free service).

### 2.5 Assumptions and Dependencies

- **A-1:** The repository the user selects already has a `.nomad.md/` directory. If not, the wizard (FR-11) creates the scaffolding. The application does not assume any other structure.
- **A-2:** The user's PAT has `read` scope (and, for write-protected remote browsing, `repo` scope on GitHub or `read_repository` on GitLab).
- **A-3:** `isomorphic-git`, `LightningFS`, and the CORS proxy remain available. The application MUST degrade gracefully if the proxy is offline (show a clear error, not a silent failure).
- **A-4:** The user is online for Remote Read-Only Mode. Local Edit Mode is fully offline-capable.
- **D-1:** Browser support assumes ever-green versions of Chrome, Edge, Firefox, and Safari released within the last 18 months.

---

## 3. Specific Requirements

Requirements are uniquely identified with a prefix (`FR-` for functional, `NFR-` for non-functional) and a sequential number. The traceability between requirements and acceptance criteria is documented in [Section 8](#8-acceptance-criteria).

### 3.1 Functional Requirements

#### FR-1: Issue file parsing and serialization

The application MUST be able to parse any file under `.nomad.md/issues/` that conforms to the **Issue file format** (see [Section 6.1](#61-issue-file)) and MUST be able to serialize the in-memory representation back to a byte-identical or semantically equivalent file. The round-trip MUST preserve the order of frontmatter keys, the order of sections, and the Markdown body of each section. Whitespace differences inside Markdown are tolerated.

#### FR-2: Template loading and editor rendering

The application MUST read all files under `.nomad.md/templates/` whose name matches `<type>.json` and MUST use them to construct the issue-type schema. The editor for any given issue MUST render a form generated from the issue's `issue_type` field: scalar fields become inputs, `longtext` fields and `sections` become Markdown editors, and relation fields render as multi-select chips. Field order in the form MUST follow the ascending order of each field's `id` (see [Section 6.2.1](#621-fields)).

#### FR-3: Configuration loading

The application MUST read `.nomad.md/config.json` at startup in both operating modes. The configuration supplies the list of statuses, the Kanban column mapping, the Gantt grouping, the label catalog, the user catalog, and the CORS proxy URL. If the file is missing or malformed, the application MUST display an actionable error.

#### FR-4: Issue CRUD in Local Edit Mode

In Local Edit Mode, the application MUST support:

- **Create** — generate a new issue file from a chosen template, slugify the title, and write the file under `.nomad.md/issues/`. The filename MUST follow the convention `<id>-<slug>.md` (see [Section 6.1.1](#611-filename)).
- **Read** — list, filter, and view any issue in the folder.
- **Update** — edit any field or section and save back to the same file.
- **Delete** — move the file to a trash location (`.nomad.md/.trash/<timestamp>-<id>-<slug>.md`) and present an "Empty trash" command.

The folder handle MUST be persisted across sessions (C-4). A "Switch folder" action MUST be available at all times from the main toolbar. The previously active handle MUST be retained (inactive) and selectable from a "Recent folders" list.

#### FR-5: Remote Read-Only Mode

In Remote Read-Only Mode, the application MUST:

- Accept a repository URL, a branch, and a PAT.
- Perform a partial clone limited to the `.nomad.md/` subtree (see FR-12).
- Cache the clone in IndexedDB (key: `<url>|<branch>`).
- Render the issues through all three views, **read-only**.
- Hide or disable any UI affordance that would lead to a write (`New issue`, `Save`, `Delete`, Kanban drag).
- Expose a "Refresh" command that re-fetches the subtree and updates the cache.

The PAT MUST be requested through the `onAuth` callback of `isomorphic-git`'s HTTP transport and MUST NOT be persisted.

#### FR-6: Views

The application MUST provide three views over the issue set. All views share the filter bar (FR-7).

1. **List view** — a virtualized table of issues with columns: `id`, `title`, `type`, `status`, `assignee`, `labels`, `updated_date`. Clicking a row opens the issue in the editor. Sorting by column MUST be supported.
2. **Kanban view** — a board whose columns are derived from `config.statuses` (each column header colored by `config.statuses[].color`). In Local Edit Mode, dragging a card between columns updates the issue's `status` field and persists the change. In Remote Read-Only Mode, the drag is visual only.
3. **Gantt view** — a horizontal timeline in which each issue with a `start_date` and either an `end_date` or a `duration` is rendered as a bar. Bars are grouped by `config.gantt.group_by` (default: `issue_type`). Dependency arrows are drawn for each `relation` of type `blocks` or `depends_on`.

#### FR-7: Filters

The filter bar MUST support the following predicates, all combinable with logical AND:

- `issue_type` (multi-select)
- `status` (multi-select)
- `assignee` (multi-select)
- `labels` (multi-select, OR within labels, AND across predicates)
- free text (matches `title` and the concatenated body of all sections, case-insensitive)
- `creation_date` range
- `updated_date` range

The active filter set MUST be serializable to a URL query parameter and restored on page load.

#### FR-8: Validation

On save, the application MUST verify that:

- All fields flagged `obligatory: true` are non-empty.
- All sections flagged `obligatory: true` contain at least one non-whitespace character.
- The `status` value is present in `config.statuses`.
- The `issue_type` value corresponds to an existing template.
- Any `relation.id` resolves to an existing issue.
- Any `relation.type` is one of `parent`, `child`, `blocks`, `depends_on`, `relates_to`.

Violations MUST be reported per field with a human-readable message; the save MUST be aborted until they are fixed.

#### FR-9: Cross-issue relations

The frontmatter MUST support a `relations` array, where each entry has the shape:

```yaml
relations:
  - { type: parent, id: 3 }
  - { type: blocks, id: 7 }
  - { type: depends_on, id: 9 }
  - { type: relates_to, id: 4 }
  - { type: child, id: 12 }
```

Relation types:

- `parent` / `child` — strict one-to-many hierarchy (Epic → Story → Task).
- `blocks` — the source issue cannot progress until the target is closed.
- `depends_on` — the source issue cannot progress until the target is closed (synonym of `blocks` in the reverse direction; kept for human readability).
- `relates_to` — non-directional soft link.

The application MUST detect and refuse to create a relation cycle. Cycles in `parent`/`child` and `blocks`/`depends_on` are forbidden; cycles in `relates_to` are allowed.

#### FR-10: IndexedDB cache for remote mode

Remote Read-Only Mode MUST cache the partial clone in IndexedDB through LightningFS. The cache key is `<repository-url>|<branch>|<sha>`. On subsequent loads of the same URL+branch, the application MUST use the cache and only fetch deltas. The user MUST be able to clear the cache from a settings panel.

#### FR-11: First-run template setup wizard

When the application detects that `.nomad.md/` is missing from the selected folder (Local Mode) or the cloned subtree (Remote Mode, **read-only inspection**), it MUST present a setup wizard with two mutually exclusive paths:

1. **"Use built-in templates"** — a checklist of the four built-in templates: `Epic`, `User Story`, `Task`, `Bug`. The user selects one or more via checkboxes. Selected templates are written into `.nomad.md/templates/` verbatim from the bundle shipped with the application (see [Appendix C](#appendix-c-built-in-template-bundle)).
2. **"Create your own"** — the user authors one or more templates from scratch through the in-app template editor. Each template is written into `.nomad.md/templates/` as it is saved. The editor MAY be opened multiple times to create multiple templates in a session.

The wizard MUST also generate a default `config.json` if none is present, seeding it with the standard status set (Open, In progress, In review, Done, Closed) and the default Kanban column set.

In Remote Read-Only Mode, the wizard is offered as a "download these templates to your local repo" suggestion, since the remote is read-only.

The wizard MUST refuse to proceed until at least one template is in place.

#### FR-12: CORS proxy and partial clone configuration

The application MUST:

- Read `config.remote.cors_proxy` (default: `https://cors.isomorphic-git.org`) before performing any remote operation.
- Expose a settings field where the user can override the URL at runtime; the override is persisted back to `config.json` on save.
- Use `isomorphic-git`'s partial-clone capabilities to fetch **only the `.nomad.md/` subtree** of the repository. Concretely: a shallow fetch with `singleBranch: true`, `depth: 1`, and `refspec: 'refs/heads/<branch>:refs/remotes/origin/<branch>'`, followed by a tree walk that descends only into `.nomad.md/`. Objects outside this path MUST NOT be downloaded.
- Display a banner during the fetch that names the configured proxy and a one-line warning that the proxy operator can see the request, including the `Authorization` header.

#### FR-13: Markdown rendering

The application MUST render Markdown sections through `marked`, sanitize the resulting HTML with `DOMPurify`, and apply Tailwind Typography (`prose`) for styling. Code blocks MUST be syntax-highlighted using a low-cost highlighter (the choice of highlighter is left to the implementation; `shiki` and `highlight.js` are both acceptable).

#### FR-14: Theme

The application MUST support a light theme and a dark theme, with the default following the user's `prefers-color-scheme`. The theme is implemented through Tailwind's `dark:` variant. The theme preference is stored in `localStorage` under `nomad-md.theme`.

#### FR-15: Issue integrity hash and tamper warning

The application MUST compute and persist a content hash of every issue file in order to detect unintended (manual) modifications of the file outside the web app. The hash MUST be stored in the frontmatter as `integrity_hash` (see [Section 6.1.3](#613-frontmatter-schema)) and MUST be recomputed on every save performed through the application.

**Hash definition.**

- **Algorithm:** SHA-256, computed through the browser's Web Crypto API (`crypto.subtle.digest`). No third-party hashing library is required.
- **Input:** the canonical serialization of the file with the `integrity_hash` key removed. The canonical serialization preserves the existing order of frontmatter keys, the order of sections, and the verbatim content of each section's Markdown body.
- **Format:** the stored value is the algorithm name and the hex digest, separated by a colon, e.g. `integrity_hash: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"`. The field is stored as a YAML string (quoted) to avoid YAML 1.2 pitfalls with the colon.

**Save behavior.**

- On save, the application serializes the issue to its canonical form without `integrity_hash`, computes the hash, and writes the file with the `integrity_hash` field populated.
- The hash is updated atomically with the rest of the file. There is no observable intermediate state on disk.

**Load and warning behavior.**

- On load, the application re-computes the hash over the canonical serialization of the file (with the stored `integrity_hash` field stripped) and compares it to the stored value.
- If the comparison fails, OR if the `integrity_hash` field is missing, OR if its value does not start with `sha256:`, the application MUST set a non-blocking `integrity_warning` flag on the in-memory issue.
- The editor MUST display a visible warning banner on the affected issue, with the following copy: "This file was modified outside nomad\.md. The contents can still be edited and saved from this view, but please review for unintended changes (e.g. broken `id`, `relations`, or section markers)."
- The warning is purely informational. The user MUST still be able to open, read, edit, and save the issue through the web app. On the next save performed through the web app, the hash is recomputed, the `integrity_warning` flag is cleared, and the warning banner disappears.
- The application MUST NOT block saves, refuse to render, or delete the issue solely on the basis of an integrity warning.

**Scope.**

- Integrity tracking applies to Local Edit Mode. In Remote Read-Only Mode, the hash is computed and stored by the web app, but since the remote is read-only, only the **detection** half of the flow is active (the warning fires if the remote file was modified externally). The application MUST NOT write the recomputed hash back to the remote.
- The hash is per-file. There is no global, cross-file integrity check.

### 3.2 Non-Functional Requirements

#### NFR-1: Performance

- The List view MUST render 1,000 issues with the filter bar and sort controls interactive in under 500 ms on a 2020-era laptop.
- The Kanban view MUST handle 500 issues across 5 columns without frame drops during drag.
- The Gantt view MUST render 200 bars and their dependency arrows in under 200 ms.
- Remote Read-Only Mode's initial fetch (cold cache) MUST complete in under 10 s for repositories where `.nomad.md/` is under 5 MB on disk.

#### NFR-2: Security

- The PAT MUST be held in memory only (no `localStorage`, no `sessionStorage`, no IndexedDB).
- The PAT MUST NOT appear in any log line, error message, URL, or analytics payload.
- The PAT MUST be passed to `isomorphic-git` exclusively through the `onAuth` callback.
- The CORS proxy URL MUST be the only external endpoint the application contacts in Remote Read-Only Mode, other than the Git provider itself.
- All Markdown rendering MUST be sanitized to prevent XSS.

#### NFR-3: Privacy

- The application MUST NOT include any analytics, telemetry, error reporting, or third-party script that transmits user data off-device.
- The application's source code MUST NOT make any network request at runtime other than (a) the Git provider endpoint, (b) the configured CORS proxy endpoint, and (c) the static asset host (if any).

#### NFR-4: Accessibility

- The application MUST conform to WCAG 2.1 Level AA.
- All interactive elements MUST be reachable and operable by keyboard alone.
- Color is never the only means of conveying information (statuses and labels MUST also have a text label).
- The Kanban view MUST be operable by keyboard (arrow keys to move the focused card between columns).
- The Gantt view MUST expose a textual fallback (a table) that is always reachable.

#### NFR-5: Browser support

| Browser            | Local Edit Mode        | Remote Read-Only Mode |
| ------------------ | ---------------------- | --------------------- |
| Chrome (latest 2)  | Supported              | Supported             |
| Edge (latest 2)    | Supported              | Supported             |
| Firefox (latest 2) | Not supported (no FSA) | Supported             |
| Safari (latest 2)  | Not supported (no FSA) | Supported             |
| Mobile browsers    | Not supported (v1)     | Not supported (v1)    |

#### NFR-6: Internationalization

The application ships in English for v1. All user-facing strings MUST be sourced from a single translation map to facilitate future localization.

#### NFR-7: Resilience

- A failed remote fetch MUST NOT corrupt the cached state. The application MUST continue to serve the cached state and surface a non-blocking error.
- A failed local write MUST be rolled back (the file MUST NOT be partially updated).
- The application MUST validate the FSA handle on every operation; revoked permissions MUST be re-prompted without losing in-memory editor state.

### 3.3 Design Constraints (recap)

The constraints enumerated in [Section 2.4](#24-constraints) are restated here for traceability:

- C-1 No backend.
- C-2 No remote writes.
- C-3 Local Edit Mode requires FSA (Chromium).
- C-4 FSA permission may be revoked at any time.
- C-5 A CORS proxy is required for Remote Read-Only Mode.
- C-6 The PAT is sensitive and MUST be treated as such.

---

## 4. External Interface Requirements

### 4.1 User Interfaces

#### 4.1.1 Layout

The application is a single-page interface with three regions:

1. **Top bar** — application name, current folder/repo indicator, mode badge, theme toggle, settings menu.
2. **Left rail** — view switcher (List / Kanban / Gantt), filter panel (collapsible).
3. **Main canvas** — the active view, or, when an issue is open, the editor.

#### 4.1.2 Home screen

On first load with no active mode, the home screen presents two large buttons: "Open local folder" (Local Edit Mode) and "Browse remote repository" (Remote Read-Only Mode), plus a "Recent folders" list.

#### 4.1.3 Editor

The editor has two tabs: "Write" (raw Markdown in a textarea for the active field) and "Preview" (rendered Markdown). For non-`longtext` and non-section fields, an inline form is shown above the Markdown tabs. Validation errors are surfaced inline beneath each field.

### 4.2 File Format Interfaces

See [Section 6](#6-data-model) for the complete grammar and examples.

### 4.3 Git Provider Interface

The application speaks the Git Smart HTTP protocol through `isomorphic-git`'s `http/web` transport. The transport is configured with:

- `url` — the repository's clone URL (HTTPS).
- `ref` — the branch to fetch.
- `onAuth` — a callback returning `{ username: '<token>' }` (the PAT is used as the username, per the Git Smart HTTP convention for token-based auth).
- `corsProxy` — the configured CORS proxy URL (default `https://cors.isomorphic-git.org`).

The application supports any provider that exposes the Git Smart HTTP protocol with permissive CORS headers. This includes Gitea, Forgejo, Gogs, and self-hosted GitLab instances. GitHub and GitLab.com do not advertise CORS headers for the Git Smart HTTP protocol, so the CORS proxy is **mandatory** for those providers.

---

## 5. System Architecture

### 5.1 Layered View

```
+------------------------------------------------------------+
|  UI Layer                                                  |
|  (Svelte components, Tailwind, lucide-svelte)              |
+------------------------------------------------------------+
                          |
                          v
+------------------------------------------------------------+
|  State Layer (Svelte 5 runes + stores)                     |
|  - issuesStore, templatesStore, configStore                |
|  - filterStore, viewStore, themeStore                      |
+------------------------------------------------------------+
                          |
                          v
+------------------------------------------------------------+
|  Service Layer                                             |
|  - ParserService   (YAML frontmatter + section markers)    |
|  - ValidatorService (FR-8)                                 |
|  - IssueService    (CRUD)                                  |
|  - TemplateService (load + edit templates)                 |
|  - ConfigService   (load + edit config)                    |
+------------------------------------------------------------+
                          |
                          v
+------------------------------------------------------------+
|  Adapter Layer                                             |
|  - LocalFsAdapter  (FSA)                                   |
|  - RemoteGitAdapter (isomorphic-git + LightningFS)         |
|  - RendererAdapter (marked + DOMPurify)                    |
+------------------------------------------------------------+
```

### 5.2 Module Boundaries

- The **Adapter Layer** is the only layer that talks to the outside world. Swapping FSA for a different storage (e.g. a sync engine) or `isomorphic-git` for a different Git library MUST be confined to this layer.
- The **Service Layer** is pure: it takes and returns domain objects, and never touches the DOM, the network, or the filesystem directly. It is fully unit-testable in a Node test runner.
- The **State Layer** is the single source of truth for the UI. It is reactive (Svelte 5 runes) and is updated exclusively by the Service Layer.
- The **UI Layer** is a pure function of the State Layer. It does not perform I/O.

### 5.3 Technology Stack

| Concern                | Library / API                                        | Notes                                                                                |
| ---------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Framework              | SvelteKit + `adapter-static`                         | SPA build, no SSR.                                                                   |
| Component model        | Svelte 5 (runes)                                     | `$state`, `$derived`, `$effect`.                                                     |
| Styling                | **Tailwind CSS v4**                                  | With `@tailwindcss/typography` for prose.                                            |
| Icons                  | **lucide-svelte**                                    | Template icons, status icons, UI chrome.                                             |
| Local filesystem       | File System Access API                               | Native browser API.                                                                  |
| Remote Git             | `isomorphic-git` + `@isomorphic-git/lightning-fs`    | Partial clone.                                                                       |
| CORS proxy             | Configurable URL (default `cors.isomorphic-git.org`) | Configurable per project.                                                            |
| YAML parsing           | `js-yaml`                                            | Frontmatter.                                                                         |
| Frontmatter + sections | `gray-matter` (extended)                             | `gray-matter` handles the `---` block; a custom adapter handles the section markers. |
| Markdown rendering     | `marked` + `DOMPurify`                               | Sanitized output.                                                                    |
| Code highlighting      | `shiki` (preferred) or `highlight.js`                | For code blocks in sections.                                                         |
| Integrity hash         | Web Crypto API (`crypto.subtle.digest`)              | Native SHA-256 for FR-15. No third-party hashing library.                            |
| Drag-and-drop          | `svelte-dnd-action`                                  | Kanban.                                                                              |
| Gantt                  | Custom SVG component                                 | Built on plain SVG; no third-party Gantt library.                                    |
| State                  | Svelte stores + runes                                | Reactive.                                                                            |
| Testing                | Vitest + Playwright                                  | Unit and end-to-end.                                                                 |
| Bundler                | Vite (via SvelteKit)                                 | Default.                                                                             |
| Hosting                | Static (any)                                         | GitHub Pages, Netlify, etc.                                                          |

### 5.4 Build and Deploy

- The application is built with `npm run build`, producing a `build/` directory of static assets.
- The assets are deployable to any static host. There is no server-side rendering and no server-side function.
- The `adapter-static` configuration MUST set `ssr: false` and `prerender: false` (the app is interactive from the first byte; no static pre-rendering of issue content).

### 5.5 Folder Handle Lifecycle

1. User clicks "Open local folder" → `showDirectoryPicker({ id: 'nomad-md-folder', mode: 'readwrite' })`.
2. The handle is stored in IndexedDB under `nomad-md.handle` (the browser enforces that the handle can only be re-acquired with the same origin and `id`).
3. On subsequent visits, the app reads the handle, calls `queryPermission({ mode: 'readwrite' })`, and if granted, proceeds silently. If not, it calls `requestPermission({ mode: 'readwrite' })` and only then proceeds.
4. If permission is denied, the user is taken back to the home screen with a non-blocking error.
5. The "Switch folder" command opens a new picker and replaces the active handle; the previous handle is moved to the "Recent folders" list (capped at 5 entries).

---

## 6. Data Model

All persistent state lives inside the repository itself, under `.nomad.md/`. The convention is:

```
.nomad.md/
├── config.json
├── templates/
│   ├── epic.json
│   ├── user-story.json
│   ├── task.json
│   └── bug.json
├── issues/
│   ├── 1-launch-public-beta.md
│   ├── 2-fix-login-redirect.md
│   └── ...
└── .trash/
    └── ...
```

### 6.1 Issue File

#### 6.1.1 Filename

The filename of an issue file is `<id>-<slug>.md`, where:

- `<id>` is a positive integer, zero-padded to a minimum of 4 digits (so the lexicographic order matches the numeric order). Examples: `0001`, `0042`, `1234`.
- `<slug>` is the kebab-cased title, lowercased, with non-alphanumeric characters collapsed to `-`. Example: `fix-login-redirect`.
- The full example: `0042-fix-login-redirect.md`.

The application assigns the next available `id` on creation. Deletion does not reuse `id`s.

#### 6.1.2 Structure

```text
<file>        ::= <frontmatter> "\n" <body>
<frontmatter> ::= "---\n" <yaml> "---\n"
<body>        ::= <empty-line>? ( <section> "\n"? )*
<section>     ::= "<!-- [SECTION_START: " <name> "]" " -->\n" <markdown> "\n<!-- [SECTION_END: " <name> "]" " -->\n"
<name>        ::= <identifier>
<markdown>    ::= any UTF-8 text, including blank lines
<yaml>        ::= standard YAML 1.2 mapping
```

The frontmatter is a single YAML mapping. Recognized keys are listed in [Section 6.1.3](#613-frontmatter-schema). Additional keys, defined by the active template, are preserved verbatim and rendered in the editor.

#### 6.1.3 Frontmatter schema

| Key                    | Type            | Required | Description                                                                                       |
| ---------------------- | --------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `id`                   | integer         | yes      | Globally unique issue id. Assigned at creation.                                                   |
| `title`                | string          | yes      | Human-readable title. Used to derive the filename slug.                                           |
| `author`               | string          | yes      | User id of the creator.                                                                           |
| `creation_date`        | date (ISO 8601) | yes      | Date of creation, set automatically.                                                              |
| `updated_date`         | date (ISO 8601) | yes      | Date of the last save.                                                                            |
| `issue_type`           | string          | yes      | The id of a template under `.nomad.md/templates/`.                                                |
| `status`               | string          | yes      | The id of an entry in `config.statuses`.                                                          |
| `assignee`             | string \| null  | no       | User id of the assignee, or `null` for unassigned.                                                |
| `labels`               | string[]        | no       | List of label ids.                                                                                |
| `relations`            | relation[]      | no       | See [Section 3.1 FR-9](#fr-9-cross-issue-relations).                                              |
| `start_date`           | date (ISO 8601) | no       | Gantt start.                                                                                      |
| `end_date`             | date (ISO 8601) | no       | Gantt end (mutually exclusive with `duration` for a given issue).                                 |
| `duration`             | integer         | no       | Gantt duration in days (mutually exclusive with `end_date`).                                      |
| `integrity_hash`       | string          | no       | SHA-256 hash of the file content with this field stripped, in the form `sha256:<hex>`. See FR-15. |
| `<template_field_key>` | varies          | varies   | Any additional field defined by the template.                                                     |

A `relation` has the shape:

```yaml
- type: parent | child | blocks | depends_on | relates_to
  id: <integer>
```

#### 6.1.4 Sections

The body is a flat sequence of named sections. A section is delimited by HTML comment markers:

```markdown
<!-- [SECTION_START: Description] -->

# Lorem ipsum dolor

sit amet, consectetur adipiscing elit.

<!-- [SECTION_END: Description] -->
```

The body MUST NOT contain any content outside of section blocks. The first non-comment line in the file MUST be a `SECTION_START` marker. The final non-empty line MUST be a `SECTION_END` marker.

The order of sections in the body is the order in which they were created or last edited. The application MUST NOT reorder sections on save.

#### 6.1.5 Example

```markdown
---
id: 42
title: 'Fix login redirect'
author: 'jane'
creation_date: 2026-10-20
updated_date: 2026-10-21
issue_type: bug
status: in_progress
assignee: 'jane'
labels: [security, frontend]
relations:
  - { type: blocks, id: 45 }
  - { type: relates_to, id: 7 }
start_date: 2026-10-20
duration: 3
severity: high
priority: p1
integrity_hash: 'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
---

<!-- [SECTION_START: Description] -->

# Login form

After submitting valid credentials, the user is redirected to a
404 page instead of the dashboard.

<!-- [SECTION_END: Description] -->

<!-- [SECTION_START: Steps to reproduce] -->

1. Navigate to `/login`.
2. Enter valid credentials.
3. Click "Sign in".
4. Observe the URL.
<!-- [SECTION_END: Steps to reproduce] -->
```

### 6.2 Template File

Templates live at `.nomad.md/templates/<type>.json`. They declare the schema for one issue type.

#### 6.2.1 Fields

Each entry in `fields` has:

| Key              | Type     | Description                                                                                  |
| ---------------- | -------- | -------------------------------------------------------------------------------------------- |
| `id`             | integer  | Sequential numeric id. Defines display order in the form (ascending).                        |
| `key`            | string   | Stable key used as the frontmatter property name. MUST be unique within the template.        |
| `type`           | enum     | One of: `text`, `longtext`, `date`, `number`, `select`, `multi-select`, `user`, `relations`. |
| `name`           | string   | Human-readable label shown in the form.                                                      |
| `obligatory`     | boolean  | If `true`, the field MUST be non-empty on save (FR-8).                                       |
| `default`        | varies   | Default value when creating a new issue.                                                     |
| `options`        | string[] | Required for `select` and `multi-select`.                                                    |
| `options_source` | string   | For `multi-select` of `labels`: `"config.labels"`.                                           |
| `allow_cycle`    | boolean  | For `relations`: defaults to `false`. If `true`, the relation may form a cycle.              |

#### 6.2.2 Sections

Each entry in `sections` has:

| Key          | Type    | Description                                              |
| ------------ | ------- | -------------------------------------------------------- |
| `id`         | integer | Sequential numeric id. Defines display order.            |
| `key`        | string  | Stable key. MUST be unique within the template.          |
| `name`       | string  | Human-readable label.                                    |
| `obligatory` | boolean | If `true`, the section MUST be non-empty on save (FR-8). |
| `default`    | string  | Default Markdown body when creating a new issue.         |

#### 6.2.3 Type-level metadata

| Key              | Type      | Description                                                                                                                                                                   |
| ---------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | string    | Stable id of the issue type (matches the filename without `.json`).                                                                                                           |
| `name`           | string    | Human-readable name.                                                                                                                                                          |
| `icon`           | string    | A **lucide** icon name (e.g. `bug`, `flame`, `book-open`, `check-square`). If the name is not a known lucide icon, the renderer falls back to treating it as an emoji string. |
| `color`          | string    | Hex color (e.g. `#e74c3c`) used for the type badge throughout the UI.                                                                                                         |
| `default_status` | string    | The id of the status assigned to new issues of this type.                                                                                                                     |
| `fields`         | field[]   | See [6.2.1](#621-fields).                                                                                                                                                     |
| `sections`       | section[] | See [6.2.2](#622-sections).                                                                                                                                                   |

#### 6.2.4 Example

```json
{
	"id": "bug",
	"name": "Bug",
	"icon": "bug",
	"color": "#e74c3c",
	"default_status": "open",
	"fields": [
		{
			"id": 1,
			"key": "severity",
			"name": "Severity",
			"type": "select",
			"obligatory": true,
			"options": ["low", "medium", "high", "critical"]
		},
		{
			"id": 2,
			"key": "priority",
			"name": "Priority",
			"type": "select",
			"obligatory": true,
			"options": ["p0", "p1", "p2", "p3"]
		},
		{ "id": 3, "key": "assignee", "name": "Assignee", "type": "user", "obligatory": false },
		{
			"id": 4,
			"key": "labels",
			"name": "Labels",
			"type": "multi-select",
			"obligatory": false,
			"options_source": "config.labels"
		}
	],
	"sections": [
		{ "id": 1, "key": "description", "name": "Description", "obligatory": true, "default": "" },
		{
			"id": 2,
			"key": "steps_to_reproduce",
			"name": "Steps to reproduce",
			"obligatory": true,
			"default": ""
		},
		{
			"id": 3,
			"key": "expected_actual",
			"name": "Expected vs. actual",
			"obligatory": false,
			"default": ""
		}
	]
}
```

### 6.3 Config File

`config.json` defines workflow-level settings. It is read on startup and edited through a dedicated settings panel.

| Key              | Type     | Description                                           |
| ---------------- | -------- | ----------------------------------------------------- |
| `statuses`       | status[] | Ordered list of statuses.                             |
| `default_status` | string   | The id of the default status assigned to new issues.  |
| `labels`         | label[]  | Catalog of labels available in `multi-select` fields. |
| `users`          | user[]   | Catalog of users available in `user` fields.          |
| `kanban`         | object   | Kanban configuration (see below).                     |
| `gantt`          | object   | Gantt configuration (see below).                      |
| `remote`         | object   | Remote-mode configuration (see below).                |

`status`:

```json
{ "id": "open", "name": "Open", "color": "#22c55e" }
```

`label`:

```json
{ "id": "frontend", "name": "Frontend", "color": "#a855f7" }
```

`user`:

```json
{ "id": "jane", "name": "Jane Doe" }
```

`kanban`:

```json
{ "columns": ["open", "in_progress", "in_review", "done"] }
```

`gantt`:

```json
{ "group_by": "issue_type", "default_view": "months" }
```

`remote`:

```json
{ "cors_proxy": "https://cors.isomorphic-git.org" }
```

#### 6.3.1 Example

```json
{
	"statuses": [
		{ "id": "open", "name": "Open", "color": "#22c55e" },
		{ "id": "in_progress", "name": "In progress", "color": "#3b82f6" },
		{ "id": "in_review", "name": "In review", "color": "#f59e0b" },
		{ "id": "done", "name": "Done", "color": "#10b981" },
		{ "id": "closed", "name": "Closed", "color": "#6b7280" }
	],
	"default_status": "open",
	"labels": [
		{ "id": "frontend", "name": "Frontend", "color": "#a855f7" },
		{ "id": "backend", "name": "Backend", "color": "#0ea5e9" },
		{ "id": "docs", "name": "Docs", "color": "#64748b" },
		{ "id": "security", "name": "Security", "color": "#ef4444" }
	],
	"users": [
		{ "id": "jane", "name": "Jane Doe" },
		{ "id": "john", "name": "John Roe" }
	],
	"kanban": {
		"columns": ["open", "in_progress", "in_review", "done"]
	},
	"gantt": {
		"group_by": "issue_type",
		"default_view": "months"
	},
	"remote": {
		"cors_proxy": "https://cors.isomorphic-git.org"
	}
}
```

### 6.4 Built-in Template Bundle

The application ships with four built-in templates (see [Appendix C](#appendix-c-built-in-template-bundle)). They are bundled as a single JSON file at build time and offered through the first-run wizard (FR-11). Selecting one writes it verbatim into `.nomad.md/templates/`.

---

## 7. Use Cases

### UC-1: Open a local folder and create a new issue

1. The user clicks "Open local folder" on the home screen.
2. The browser shows a directory picker; the user picks a folder.
3. The application inspects the folder. It finds `.nomad.md/` and `config.json` and `templates/`. The wizard is skipped.
4. The application loads `config.json` and the four templates, and lists the issues in `.nomad.md/issues/`.
5. The user clicks "New issue" and selects "Bug" from the dropdown.
6. The editor renders the Bug form. The user fills in `title`, `severity`, `priority`, `assignee`, and the two obligatory sections.
7. The user clicks "Save". The application validates (FR-8), slugifies the title, picks the next `id`, and writes `.nomad.md/issues/0043-fix-the-thing.md`.

### UC-2: Browse a remote repository read-only

1. The user clicks "Browse remote repository" on the home screen.
2. The user enters the URL `https://github.com/acme/widgets`, the branch `main`, and a PAT.
3. The application uses `isomorphic-git` with the configured CORS proxy to fetch the `.nomad.md/` subtree only.
4. The fetched tree is cached in IndexedDB and rendered in the List view.
5. The user can switch to the Kanban view (drag is inert) and the Gantt view (read-only).
6. The user can also click "Refresh" to re-fetch.

### UC-3: Change an issue's status via Kanban drag

1. In Local Edit Mode, the user is in the Kanban view.
2. The user drags the card for issue `0042` from the "In progress" column to the "In review" column.
3. The application updates the issue's `status` field in memory and on disk, and updates `updated_date` to today.
4. The card appears in the new column.

### UC-4: View a Gantt timeline with dependencies

1. The user is in the Gantt view.
2. Issues with `start_date` and either `end_date` or `duration` are drawn as bars, grouped by `issue_type` (per `config.gantt.group_by`).
3. For each `relation` of type `blocks` or `depends_on`, an arrow is drawn from the source issue to the target issue.
4. The user can switch to a textual fallback (a table) for accessibility (NFR-4).

### UC-5: Run the first-run template setup wizard

1. The user opens a folder that does not yet contain `.nomad.md/`.
2. The wizard offers two paths: "Use built-in templates" and "Create your own".
3. The user picks "Use built-in templates", checks `Bug` and `User Story`, and clicks "Apply".
4. The application writes `.nomad.md/templates/bug.json`, `.nomad.md/templates/user-story.json`, and a default `config.json`.
5. The user is taken to the main view, which is now populated with two issue types and the standard workflow.

### UC-6: Switch between local folders

1. The user has a folder open from a previous session. The handle was persisted.
2. The user clicks "Switch folder" in the top bar.
3. The application shows a dropdown: the current folder and the four most recent folders. The user clicks "Browse for another folder".
4. The browser shows a directory picker; the user picks a new folder.
5. The application switches the active handle and reloads the issue set. The previous handle is kept in the "Recent folders" list.

---

## 8. Acceptance Criteria

Each requirement is matched with one or more testable conditions. Conditions are phrased as pass/fail.

| Req   | Acceptance Criteria                                                                                                                                                                                                                                            |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1  | Given a valid issue file, the parser produces an in-memory object with all frontmatter keys, all sections, and the Markdown body of each section. Re-serializing the object produces a file that, when parsed again, yields an equivalent object (round-trip). |
| FR-2  | Given a template, the editor renders one input per field, in ascending `id` order. `longtext` fields and `sections` are rendered as Markdown editors.                                                                                                          |
| FR-3  | Given a missing or malformed `config.json`, the application shows an actionable error and refuses to start.                                                                                                                                                    |
| FR-4  | Create, read, update, delete operations succeed against a real local folder in a Chromium browser. The folder handle is restored across page reloads. "Switch folder" works.                                                                                   |
| FR-5  | A partial clone of a public GitHub repository with `.nomad.md/` completes in under 10 s on a 2020-era laptop with a cold cache. The PAT does not appear in any log or URL.                                                                                     |
| FR-6  | List view renders 1,000 issues in under 500 ms. Kanban supports drag-and-drop in Local Mode and is read-only in Remote Mode. Gantt renders 200 bars + dependency arrows in under 200 ms.                                                                       |
| FR-7  | All filter predicates are combinable with AND. The active filter set survives a page reload.                                                                                                                                                                   |
| FR-8  | Saving an issue with an empty obligatory field or empty obligatory section is blocked with a per-field error message.                                                                                                                                          |
| FR-9  | Cycles in `parent`/`child` and `blocks`/`depends_on` are detected and refused. Cycles in `relates_to` are allowed.                                                                                                                                             |
| FR-10 | Reloading Remote Read-Only Mode for a previously-cloned URL+branch reuses the cache and does not re-fetch objects that are already in IndexedDB.                                                                                                               |
| FR-11 | On a folder without `.nomad.md/`, the wizard appears. Both paths ("Use built-in templates" and "Create your own") are functional. At least one template is required to exit the wizard.                                                                        |
| FR-12 | A custom CORS proxy URL is read from `config.json` and used for the next fetch. The default is `https://cors.isomorphic-git.org` and is used when no override is present. The fetched objects are limited to the `.nomad.md/` subtree.                         |
| FR-13 | Markdown sections render correctly. Code blocks are syntax-highlighted. A `<script>` tag in a section is stripped by the sanitizer.                                                                                                                            |
| FR-14 | Light and dark themes render correctly. The theme preference persists across reloads.                                                                                                                                                                          |
| FR-15 | Saving an issue writes a `sha256:` hash into the `integrity_hash` field. Re-loading a manually edited file produces a warning banner. The user can still edit and save the file; the warning is cleared on the next save performed through the web app.        |
| NFR-1 | Performance budgets are met on the test machine described in NFR-1.                                                                                                                                                                                            |
| NFR-2 | The PAT is held in memory only. It does not appear in any log, error message, URL, or IndexedDB store.                                                                                                                                                         |
| NFR-3 | The application's network tab shows requests only to (a) the Git provider, (b) the configured CORS proxy, and (c) the static asset host. No other requests are made.                                                                                           |
| NFR-4 | The application is fully operable by keyboard. Statuses and labels are conveyed by text, not color alone. The Gantt view has a textual fallback.                                                                                                               |
| NFR-5 | The browser support matrix in [Section 3.2 NFR-5](#nfr-5-browser-support) holds.                                                                                                                                                                               |
| NFR-6 | All user-facing strings are sourced from a single map.                                                                                                                                                                                                         |
| NFR-7 | A failed remote fetch does not corrupt the cache. A failed local write is rolled back. A revoked FSA handle re-prompts without losing in-memory editor state.                                                                                                  |

---

## 9. Out of Scope

The following are explicitly **not** part of v1:

- **Pushing to the remote.** The application never writes to the Git provider. The user is responsible for committing and pushing.
- **Branch creation, pull request creation, merge, rebase.** All version-control operations are the user's responsibility.
- **Comments and discussion threads.** Issues are silent; there is no commenting system.
- **Attachments and file uploads.** Issues contain only text and Markdown.
- **Real-time multi-user collaboration.** The application is single-user. Concurrent edits from multiple machines are out of scope.
- **Notifications.** The application does not watch the repository for changes; it polls on user action.
- **Mobile and touch support.** The application targets desktop browsers only.
- **Localization.** English only in v1.
- **Custom CORS-proxy management.** The application points at one proxy URL; the user is responsible for running their own if they need to.
- **Import from / export to other issue trackers** (GitHub Issues, Jira, Linear). Migration tooling is out of scope.
- **Webhooks, automation, custom workflows.** No server-side automation is possible; all behavior is local.

---

## 10. Glossary and Appendices

### Glossary

| Term          | Definition                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------ |
| CORS          | Cross-Origin Resource Sharing. A browser-enforced restriction on cross-domain requests.          |
| Frontmatter   | YAML metadata block at the top of a Markdown file, delimited by `---`.                           |
| IndexedDB     | Browser-native key-value store. Used by LightningFS to back the remote cache.                    |
| LightningFS   | A virtual filesystem backed by IndexedDB, used by `isomorphic-git` in the browser.               |
| PAT           | Personal Access Token. A credential for Git provider APIs.                                       |
| Partial clone | A Git clone that fetches only a specified subtree.                                               |
| Section       | A named Markdown block in an issue file, delimited by `SECTION_START` and `SECTION_END` markers. |
| Slug          | A URL- and filename-safe version of a string, lowercased with non-alphanumerics replaced by `-`. |
| Template      | A JSON file describing the schema of an issue type.                                              |
| Type          | Synonym for "issue type". A category of issue (e.g. Bug, Epic, User Story, Task).                |

### Appendix A: Technology Stack with Rationale

| Choice                       | Rationale                                                                                                                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SvelteKit + `adapter-static` | The simplest path to a pure static SPA with file-system-based routing, layouts, and a mature build pipeline. Svelte 5 runes give fine-grained reactivity without the boilerplate of older reactive primitives. |
| Tailwind CSS v4              | Utility-first styling with strong defaults for prose via `@tailwindcss/typography`. Version 4 brings a smaller bundle and faster builds.                                                                       |
| `lucide-svelte`              | A large, consistent, well-maintained icon set with first-class Svelte bindings.                                                                                                                                |
| File System Access API       | The only browser API that gives JavaScript read/write access to a local folder. Limited to Chromium for now, which is acceptable given the target audience.                                                    |
| `isomorphic-git`             | The only mature pure-JS Git implementation that runs in the browser. Supports partial clone through `singleBranch` + tree walking.                                                                             |
| `LightningFS`                | The filesystem implementation recommended by `isomorphic-git` for the browser. Backed by IndexedDB.                                                                                                            |
| `gray-matter`                | Battle-tested frontmatter parser. We extend it with a small post-processing step to handle section markers.                                                                                                    |
| `js-yaml`                    | The standard YAML parser for JavaScript. Used by `gray-matter` internally and re-used directly for non-frontmatter YAML (e.g. template validation).                                                            |
| `marked` + `DOMPurify`       | `marked` is small, fast, and extensible. `DOMPurify` is the de-facto XSS sanitizer.                                                                                                                            |
| `svelte-dnd-action`          | A keyboard-accessible drag-and-drop library for Svelte, used in the Kanban view.                                                                                                                               |
| Custom SVG Gantt             | Off-the-shelf Gantt libraries are heavy and not customizable enough for our use case. A 200-bar custom SVG component is well within scope.                                                                     |
| Web Crypto API               | Native browser API. Used for SHA-256 integrity hashing (FR-15). Avoids adding a hashing dependency for a single digest.                                                                                        |

### Appendix B: Complete Example Files

#### B.1 Example `config.json`

```json
{
	"statuses": [
		{ "id": "open", "name": "Open", "color": "#22c55e" },
		{ "id": "in_progress", "name": "In progress", "color": "#3b82f6" },
		{ "id": "in_review", "name": "In review", "color": "#f59e0b" },
		{ "id": "done", "name": "Done", "color": "#10b981" },
		{ "id": "closed", "name": "Closed", "color": "#6b7280" }
	],
	"default_status": "open",
	"labels": [
		{ "id": "frontend", "name": "Frontend", "color": "#a855f7" },
		{ "id": "backend", "name": "Backend", "color": "#0ea5e9" },
		{ "id": "docs", "name": "Docs", "color": "#64748b" },
		{ "id": "security", "name": "Security", "color": "#ef4444" }
	],
	"users": [
		{ "id": "jane", "name": "Jane Doe" },
		{ "id": "john", "name": "John Roe" }
	],
	"kanban": {
		"columns": ["open", "in_progress", "in_review", "done"]
	},
	"gantt": {
		"group_by": "issue_type",
		"default_view": "months"
	},
	"remote": {
		"cors_proxy": "https://cors.isomorphic-git.org"
	}
}
```

#### B.2 Example `epic.json`

```json
{
	"id": "epic",
	"name": "Epic",
	"icon": "flame",
	"color": "#f97316",
	"default_status": "open",
	"fields": [
		{ "id": 1, "key": "owner", "name": "Owner", "type": "user", "obligatory": true },
		{
			"id": 2,
			"key": "labels",
			"name": "Labels",
			"type": "multi-select",
			"obligatory": false,
			"options_source": "config.labels"
		},
		{ "id": 3, "key": "relations", "name": "Relations", "type": "relations", "obligatory": false }
	],
	"sections": [
		{ "id": 1, "key": "summary", "name": "Summary", "obligatory": true, "default": "" },
		{ "id": 2, "key": "goals", "name": "Goals", "obligatory": false, "default": "" },
		{
			"id": 3,
			"key": "success_criteria",
			"name": "Success criteria",
			"obligatory": true,
			"default": ""
		}
	]
}
```

#### B.3 Example `user-story.json`

```json
{
	"id": "user-story",
	"name": "User Story",
	"icon": "book-open",
	"color": "#0ea5e9",
	"default_status": "open",
	"fields": [
		{ "id": 1, "key": "user", "name": "As a", "type": "text", "obligatory": true },
		{ "id": 2, "key": "action", "name": "I want", "type": "text", "obligatory": true },
		{ "id": 3, "key": "objective", "name": "So that", "type": "text", "obligatory": true },
		{ "id": 4, "key": "assignee", "name": "Assignee", "type": "user", "obligatory": false },
		{
			"id": 5,
			"key": "labels",
			"name": "Labels",
			"type": "multi-select",
			"obligatory": false,
			"options_source": "config.labels"
		},
		{ "id": 6, "key": "relations", "name": "Relations", "type": "relations", "obligatory": false }
	],
	"sections": [
		{ "id": 1, "key": "description", "name": "Description", "obligatory": true, "default": "" },
		{
			"id": 2,
			"key": "acceptance_criteria",
			"name": "Acceptance criteria",
			"obligatory": true,
			"default": ""
		}
	]
}
```

#### B.4 Example `task.json`

```json
{
	"id": "task",
	"name": "Task",
	"icon": "check-square",
	"color": "#10b981",
	"default_status": "open",
	"fields": [
		{
			"id": 1,
			"key": "estimate",
			"name": "Estimate (hours)",
			"type": "number",
			"obligatory": false
		},
		{ "id": 2, "key": "assignee", "name": "Assignee", "type": "user", "obligatory": false },
		{
			"id": 3,
			"key": "labels",
			"name": "Labels",
			"type": "multi-select",
			"obligatory": false,
			"options_source": "config.labels"
		},
		{ "id": 4, "key": "relations", "name": "Relations", "type": "relations", "obligatory": false }
	],
	"sections": [
		{ "id": 1, "key": "description", "name": "Description", "obligatory": true, "default": "" },
		{ "id": 2, "key": "notes", "name": "Notes", "obligatory": false, "default": "" }
	]
}
```

#### B.5 Example `bug.json`

```json
{
	"id": "bug",
	"name": "Bug",
	"icon": "bug",
	"color": "#e74c3c",
	"default_status": "open",
	"fields": [
		{
			"id": 1,
			"key": "severity",
			"name": "Severity",
			"type": "select",
			"obligatory": true,
			"options": ["low", "medium", "high", "critical"]
		},
		{
			"id": 2,
			"key": "priority",
			"name": "Priority",
			"type": "select",
			"obligatory": true,
			"options": ["p0", "p1", "p2", "p3"]
		},
		{ "id": 3, "key": "assignee", "name": "Assignee", "type": "user", "obligatory": false },
		{
			"id": 4,
			"key": "labels",
			"name": "Labels",
			"type": "multi-select",
			"obligatory": false,
			"options_source": "config.labels"
		},
		{ "id": 5, "key": "relations", "name": "Relations", "type": "relations", "obligatory": false }
	],
	"sections": [
		{ "id": 1, "key": "description", "name": "Description", "obligatory": true, "default": "" },
		{
			"id": 2,
			"key": "steps_to_reproduce",
			"name": "Steps to reproduce",
			"obligatory": true,
			"default": ""
		},
		{
			"id": 3,
			"key": "expected_actual",
			"name": "Expected vs. actual",
			"obligatory": false,
			"default": ""
		}
	]
}
```

#### B.6 Example issue file

```markdown
---
id: 42
title: 'Fix login redirect'
author: 'jane'
creation_date: 2026-10-20
updated_date: 2026-10-21
issue_type: bug
status: in_progress
assignee: 'jane'
labels: [security, frontend]
relations:
  - { type: blocks, id: 45 }
  - { type: relates_to, id: 7 }
start_date: 2026-10-20
duration: 3
severity: high
priority: p1
integrity_hash: 'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
---

<!-- [SECTION_START: Description] -->

# Login form

After submitting valid credentials, the user is redirected to a
404 page instead of the dashboard.

<!-- [SECTION_END: Description] -->

<!-- [SECTION_START: Steps to reproduce] -->

1. Navigate to `/login`.
2. Enter valid credentials.
3. Click "Sign in".
4. Observe the URL.
<!-- [SECTION_END: Steps to reproduce] -->

<!-- [SECTION_START: Expected vs. actual] -->

**Expected:** redirect to `/dashboard`.

**Actual:** redirect to `/404`.

<!-- [SECTION_END: Expected vs. actual] -->
```

### Appendix C: Built-in Template Bundle

The application ships with the following four templates in a bundle, accessible to the first-run wizard (FR-11). They are stored as a single JSON file at build time and copied verbatim into the user's `.nomad.md/templates/` directory when selected.

| Template id  | Name       | Icon           | Color     | Default status |
| ------------ | ---------- | -------------- | --------- | -------------- |
| `epic`       | Epic       | `flame`        | `#f97316` | `open`         |
| `user-story` | User Story | `book-open`    | `#0ea5e9` | `open`         |
| `task`       | Task       | `check-square` | `#10b981` | `open`         |
| `bug`        | Bug        | `bug`          | `#e74c3c` | `open`         |

Full schemas are in [Appendix B](#appendix-b-complete-example-files) (sections B.2, B.3, B.4, B.5).

### Appendix D: Partial-Clone Implementation Sketch

The following pseudocode documents the intended call sequence for the partial clone in Remote Read-Only Mode (FR-5, FR-12). It is not normative; it is provided to clarify the intent of the requirement.

```text
git.init({ fs, dir: '/repo' })
git.addRemote({ fs, dir: '/repo', remote: 'origin', url, force: true })

git.fetch({
  fs, http, dir: '/repo',
  ref: branch,
  refspec: `refs/heads/${branch}:refs/remotes/origin/${branch}`,
  singleBranch: true,
  depth: 1,
  onAuth: () => ({ username: pat }),
  corsProxy: config.remote.cors_proxy,
})

git.checkout({
  fs, dir: '/repo', ref: branch,
  filepaths: ['.nomad.md'],
})

// The local FS is now populated with .nomad.md/** and nothing else.
```

The `filepaths` option (or the equivalent tree-walk filter) is the mechanism by which the application fetches only the `.nomad.md/` subtree. If the underlying `isomorphic-git` version does not yet support `filepaths`, the application falls back to a manual tree walk: it lists the tree at the root, descends only into `.nomad.md/`, and copies the matching objects to the local FS.

---

_End of document._
