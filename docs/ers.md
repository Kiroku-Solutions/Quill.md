# Engineering Requirements Specification — quill\.md

| Field       | Value              |
| ----------- | ------------------ |
| Document ID | `ERS-quill-md-001` |
| Version     | 1.0.0              |
| Status      | Draft              |
| Date        | 2026-06-20         |
| Author      | Jose               |
| Project     | quill\.md          |

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

This Engineering Requirements Specification (ERS) describes the functional and non-functional requirements, architecture, and data model of **quill\.md**, a client-side-only web application that allows developers to author, manage, and browse project issues that are stored directly in the source repository as plain Markdown files with a custom frontmatter-and-section format.

The goal of the project is to remove the dependency on third-party issue trackers (e.g. GitHub Issues, Jira, Linear) for small to mid-sized projects whose source of truth is already a Git repository, while preserving a workflow that feels like editing local files in a purpose-built editor.

### 1.2 Scope

**In scope (v1):**

- A single-page web application built with SvelteKit (`adapter-static`) that runs entirely in the user's browser. There is no server-side component, no API endpoint, and no telemetry.
- A **Local Edit Mode** that reads and writes issue files inside a user-selected local folder through the File System Access API (FSA).
- A **Remote Edit Mode** that talks to provider REST APIs (GitHub and GitLab) through a Strategy pattern (`src/lib/adapters/providers/`). The app auto-detects the provider from the URL host and supports a manual dropdown override. Reads fetch the `.quill.md/` subtree; writes land as commits on a dedicated, long-lived `quill-md` branch (orphan-style — independent history from `main`).
- A configuration and template system that lives inside the same repository under `.quill.md/`, allowing each project to define its own issue types, fields, sections, statuses, labels, and workflow columns.
- Three views over the issue set: a tabular **List view**, a **Kanban** board, and a **Gantt** timeline.
- A filter bar that combines multiple criteria (type, status, assignee, label, free text, date range).

**Out of scope (v1):** see [Section 9](#9-out-of-scope).

### 1.3 Definitions and Acronyms

| Term                   | Definition                                                                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ERS                    | Engineering Requirements Specification (this document).                                                                                                                            |
| FSA                    | File System Access API. A browser API that grants JavaScript read/write access to a user-selected local directory.                                                                 |
| PAT                    | Personal Access Token. A credential used to authenticate against a Git provider.                                                                                                   |
| SPA                    | Single-Page Application.                                                                                                                                                           |
| Frontmatter            | The YAML metadata block at the top of a Markdown file, delimited by `---`.                                                                                                         |
| Section marker         | An HTML comment pair of the form `<!-- [SECTION_START: name] -->` and `<!-- [SECTION_END: name] -->`.                                                                              |
| Template               | A JSON file under `.quill.md/templates/` describing the fields and sections of one issue type.                                                                                     |
| Issue                  | A single Markdown file under `.quill.md/issues/`, with a frontmatter header and a body of section-delimited Markdown.                                                              |
| Partial clone          | A clone of a Git repository that fetches only a specified subtree of the working tree, rather than the full repository history.                                                    |
| LightningFS            | _Removed in v2.0._ Previously an IndexedDB-backed virtual filesystem used by `isomorphic-git` in the browser.                                                                      |
| Provider               | A Git hosting provider that implements the `RepoProvider` Strategy interface (`src/lib/adapters/providers/types.ts`).                                                              |
| PAT                    | Personal Access Token. A credential used to authenticate against a Git provider's REST API.                                                                                        |
| Edit branch            | The branch the app commits to in Remote Edit Mode. Default `quill-md`. Long-lived; the app never deletes it or merges it elsewhere.                                                |
| Orphan branch          | A branch with no shared history with `main`. Created from an empty tree on first open. The `quill-md` branch is always orphan-style so accidental merges to `main` cannot collide. |
| Optimistic concurrency | Provider APIs require the caller to send the file's last SHA on every write; mismatch returns 409. The app uses this for per-file conflict detection.                              |
| Session PAT            | The PAT may live in `sessionStorage` (cleared on tab close) instead of memory only. v2.0 relaxes NFR-2 to "session-scoped only" to enable silent restore on page refresh.          |

### 1.4 References

- SvelteKit documentation: <https://kit.svelte.dev>
- File System Access API: <https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API>
- GitHub REST API: <https://docs.github.com/en/rest>
- GitLab REST API: <https://docs.gitlab.com/api/rest/>
- `gray-matter`: <https://github.com/jonschlinkert/gray-matter>
- `js-yaml`: <https://github.com/nodeca/js-yaml>
- `marked`: <https://marked.js.org>
- `DOMPurify`: <https://github.com/cure53/DOMPurify>
- `svelte-dnd-action`: <https://github.com/isaacHagoel/svelte-dnd-action>
- Tailwind CSS: <https://tailwindcss.com>
- lucide icons: <https://lucide.dev>

### 1.5 Revision History

| Version | Date       | Author | Notes                                                                                                                                                                                                                                                                    |
| ------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.0.0   | 2026-06-20 | Jose   | Initial draft.                                                                                                                                                                                                                                                           |
| 2.0.0   | 2026-07-12 | Jose   | Provider Strategy migration: isomorphic-git + LightningFS replaced with GitHub / GitLab REST Strategy. Remote Mode is editable; commits land on a dedicated `quill-md` branch. PAT may live in `sessionStorage`. Full change log: `docs/provider-strategy-migration.md`. |

---

## 2. Overall Description

### 2.1 Product Perspective

quill\.md is a **purely client-side web application**. It is delivered as a static asset bundle (HTML, CSS, JavaScript) and can be hosted on any static file host (e.g. GitHub Pages, Netlify, Cloudflare Pages, S3). It does not require any backend service to function; the user's browser is the only runtime.

The application interacts with two external resources only:

1. **The local file system** (in Local Edit Mode) — the user's folder on disk, accessed through FSA.
2. **A remote Git repository** (in Remote Edit Mode) — accessed through the registered provider's REST API (GitHub REST for `github.com`; GitLab REST for `gitlab.com`). Provider REST endpoints ship permissive CORS — no CORS proxy is needed.

There is no first-party server. There is no analytics. The Personal Access Token is held in `sessionStorage` (session-scoped — cleared on tab close / sign-out) and is never written to IndexedDB, `localStorage`, URLs, or any non-namespaced key.

### 2.2 Operating Modes

The application exposes two operating modes. The user picks one at the home screen.

#### 2.2.1 Local Edit Mode

- On first use, the user is prompted to select a local folder via `showDirectoryPicker()`.
- The application expects the folder to contain a `.quill.md/` directory (see [Section 6](#6-data-model)). If it does not, the application runs the **First-Run Template Setup wizard** (FR-11).
- After the wizard finishes, the application reads `.quill.md/config.json` and `.quill.md/templates/*.json` to construct the issue-type schema and the workflow configuration.
- The application reads the issue files in `.quill.md/issues/`, presents them through the available views, and supports full CRUD: create, edit, delete, and reorder (via Kanban drag).
- All writes are performed through the FSA `FileSystemFileHandle` obtained at folder selection. The user is responsible for committing and pushing the changes through their own Git workflow.
- The folder handle is **persisted** across sessions through the FSA permission model (`requestPermission({ mode: 'readwrite' })`). On startup, the application attempts to re-acquire the handle silently; if permission is denied or revoked, the user is prompted again. A "Switch folder" affordance in the UI allows the user to open a different folder at any time without losing the original handle (which is kept in memory but inactive until selected again).

#### 2.2.2 Remote Edit Mode

- The user enters a repository URL (HTTPS), an edit branch (default: `quill-md`), and a PAT with write scope (`Contents: write` on GitHub, `api` on GitLab).
- The application detects the provider from the URL host (`github.com`, `gitlab.com`) and selects the corresponding `RepoProvider`. A manual dropdown override is available for self-hosted instances.
- The application fetches the `.quill.md/` subtree at the edit branch tip via the provider's REST API. GitHub: `GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1` filtered to `.quill.md/**`. GitLab: `GET /projects/{id}/repository/tree?path=.quill.md&recursive=true`.
- The fetched files are stored in an IndexedDB snapshot keyed by `(providerId, owner, repo, editBranch, sha)` for fast reopen.
- The application validates the PAT scope on connect (`GET /user` for GitHub, `GET /api/v4/user` for GitLab). Insufficient scope surfaces as a typed `RemoteAuthError`.
- If the edit branch is absent, the app creates it as an **orphan branch** (no shared history with `main`). GitHub: empty-tree commit + ref creation. GitLab: branch-from-default + single no-op commit. The user is advised via FR-17 to use a dedicated repository for `.quill.md/` so accidental branch deletion does not affect code.
- Writes go through the same `WritableDirectoryAdapter` interface as Local Mode. The adapter's `writeTextFile` / `removeFile` map to provider REST endpoints (`PUT /contents` on GitHub, `PUT /repository/files` on GitLab) with optimistic concurrency via the file's last SHA. Mismatch returns 409 → typed `RemoteConflictError`; the user's local draft is preserved.
- A `CommitQueueStore` debounces Kanban drags into one `commitBatch` call (2-second idle window). A "Push now" button flushes immediately. Failed flushes preserve the queue and surface the error so the user can retry.
- The PAT is held in `sessionStorage` (key `quill-md.remote-pat`) for the duration of the tab and cleared on sign-out. A silent restore on page refresh is attempted via `GET /user`; a stale PAT drops the session silently and shows the home screen.

### 2.3 User Characteristics

The target user is a **software developer** who:

- Is comfortable with the command line, Git, and Markdown.
- Owns or contributes to a Git repository (preferably a **dedicated issues repository**) in which they wish to track issues.
- Has a Personal Access Token with write scope for the relevant Git provider (GitHub, GitLab).
- Uses a Chromium-based browser (Chrome, Edge, Brave, Arc, Opera, Vivaldi) for the Local Edit Mode. The Remote Edit Mode is usable from any modern browser, including Firefox and Safari.

### 2.4 Constraints

- **C-1 (No backend):** The application MUST NOT depend on any server-side component for its core functionality. Hosting is purely static.
- **C-2' (Edit-branch discipline):** The application MUST push to the configured edit branch only (default `quill-md`). The application MUST NOT force-push, MUST NOT delete the edit branch from inside the app, MUST NOT merge the edit branch elsewhere, and MUST NOT push to any branch the user has not explicitly configured. The user remains responsible for opening pull requests.
- **C-3 (Local-mode browser support):** Local Edit Mode is only available on browsers that implement FSA. This is, at the time of writing, Chromium-based browsers. Firefox and Safari are unsupported for Local Edit Mode but remain supported for Remote Edit Mode.
- **C-4 (Permission re-grant):** FSA permission may be revoked by the user or by the browser between sessions. The application MUST handle the resulting `NotAllowedError` gracefully and re-prompt.
- **C-5 (revised, removed):** _Removed in v2.0._ Provider REST APIs ship permissive CORS. No CORS proxy is required.
- **C-6 (Token hygiene):** The PAT MUST NOT appear in any log line, error message, URL, or analytics payload. The PAT MAY live in `sessionStorage` (cleared on tab close / sign-out) for the purpose of silent session restoration — this is a relaxation of the v0 "memory only" rule. The PAT MUST NOT be written to IndexedDB, `localStorage`, or any non-namespaced key.
- **C-7 (Provider Strategy):** Adding a new provider MUST be confined to a new `RepoProvider` implementation registered in `src/lib/adapters/providers/registry.ts`. No other layer may branch on provider identity.

### 2.5 Assumptions and Dependencies

- **A-1:** The repository the user selects already has a `.quill.md/` directory. If not, the wizard (FR-11) creates the scaffolding. The application does not assume any other structure.
- **A-2:** The user's PAT has **write** scope: `Contents: write` (or classic `repo`) on GitHub; `api` or `write_repository` on GitLab.
- **A-3:** The provider's REST API is reachable from the user's browser and ships permissive CORS. GitHub.com and GitLab.com both satisfy this. Self-hosted providers may require a CSP relaxation at the app-host level.
- **A-4:** The user is online for Remote Edit Mode. Local Edit Mode is fully offline-capable.
- **D-1:** Browser support assumes ever-green versions of Chrome, Edge, Firefox, and Safari released within the last 18 months.

---

## 3. Specific Requirements

Requirements are uniquely identified with a prefix (`FR-` for functional, `NFR-` for non-functional) and a sequential number. The traceability between requirements and acceptance criteria is documented in [Section 8](#8-acceptance-criteria).

### 3.1 Functional Requirements

#### FR-1: Issue file parsing and serialization

The application MUST be able to parse any file under `.quill.md/issues/` that conforms to the **Issue file format** (see [Section 6.1](#61-issue-file)) and MUST be able to serialize the in-memory representation back to a byte-identical or semantically equivalent file. The round-trip MUST preserve the order of frontmatter keys, the order of sections, and the Markdown body of each section. Whitespace differences inside Markdown are tolerated.

#### FR-2: Template loading and editor rendering

The application MUST read all files under `.quill.md/templates/` whose name matches `<type>.json` and MUST use them to construct the issue-type schema. The editor for any given issue MUST render a form generated from the issue's `issue_type` field: scalar fields become inputs, `longtext` fields and `sections` become Markdown editors, and relation fields render as multi-select chips. Field order in the form MUST follow the ascending order of each field's `id` (see [Section 6.2.1](#621-fields)).

#### FR-3: Configuration loading

The application MUST read `.quill.md/config.json` at startup in both operating modes. The configuration supplies the list of statuses, the Kanban column mapping, the Gantt grouping, the label catalog, the user catalog, and the CORS proxy URL. If the file is missing or malformed, the application MUST display an actionable error.

#### FR-4: Issue CRUD in Local Edit Mode

In Local Edit Mode, the application MUST support:

- **Create** — generate a new issue file from a chosen template, slugify the title, and write the file under `.quill.md/issues/`. The filename MUST follow the convention `<id>-<slug>.md` (see [Section 6.1.1](#611-filename)).
- **Read** — list, filter, and view any issue in the folder.
- **Update** — edit any field or section and save back to the same file.
- **Delete** — move the file to a trash location (`.quill.md/.trash/<timestamp>-<id>-<slug>.md`) and present an "Empty trash" command.

The folder handle MUST be persisted across sessions (C-4). A "Switch folder" action MUST be available at all times from the main toolbar. The previously active handle MUST be retained (inactive) and selectable from a "Recent folders" list.

#### FR-5: Remote Edit Mode

In Remote Edit Mode, the application MUST:

- Accept a repository URL, an edit branch (default `quill-md`), and a PAT with write scope.
- Auto-detect the provider from the URL host (`github.com`, `gitlab.com`). A manual dropdown override is available for self-hosted instances.
- Validate the PAT scope on connect (`GET /user` on GitHub, `GET /api/v4/user` on GitLab). Insufficient scope surfaces as a typed `RemoteAuthError` with the required scope name.
- Read the `.quill.md/` subtree at the edit branch tip via the provider's REST API. Cache the snapshot in IndexedDB keyed by `(providerId, owner/repo, editBranch, sha)`.
- Resolve the edit branch tip. If the branch is absent, create it as an **orphan branch** (no shared history with `main`) with a `chore: initialize quill-md branch` commit on an empty tree.
- Surface the edit branch name in the TopBar at all times (FR-17 advisory banner).
- Persist the PAT in `sessionStorage` under `quill-md.remote-pat`. Clear on `signOut` and on tab close.
- On `openRemote`, attempt silent restore from sessionStorage: validate the cached PAT against the provider; on success, restore the session without re-prompting; on failure, drop the session silently.
- On every user save (issue editor, template editor, config editor, Kanban drag), write through the adapter and produce a commit on the edit branch (FR-16).
- On 409 / 412 from the provider, throw `RemoteConflictError`; the editor surfaces an inline Alert; the user's local draft is preserved; the cached remote SHA is refreshed on the next Pull-to-refresh.
- Never force-push; never push to a branch other than the configured edit branch; never delete the edit branch from the app.

#### FR-6: Views

The application MUST provide three views over the issue set. All views share the filter bar (FR-7).

1. **List view** — a virtualized table of issues with columns: `id`, `title`, `type`, `status`, `assignee`, `labels`, `updated_date`. Clicking a row opens the issue in the editor. Sorting by column MUST be supported.
2. **Kanban view** — a board whose columns are derived from `config.statuses` (each column header colored by `config.statuses[].color`). Dragging a card between columns enqueues a status change in the `CommitQueueStore`. The queue flushes after a 2-second idle window as a single `commitBatch` call (FR-16). An explicit "Push now" button flushes immediately.
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

#### FR-10: IndexedDB snapshot of remote read state

Remote Edit Mode MUST snapshot the most recently fetched `.quill.md/` subtree in IndexedDB via `idb`. The cache key is `(providerId, owner, repo, editBranch, commitSha)`. On reopen, the snapshot is loaded instantly and the app refreshes against the latest commit SHA. Delta-fetch (commits-since + tree-recursive) is used when the cached SHA differs from the latest. The user MUST be able to clear the snapshot from a settings panel (Settings → "Clear local snapshot").

#### FR-16: Remote commit lifecycle

- **Per-save commits.** A user save in the issue editor, template editor, or config editor produces **one commit** on the edit branch. Commit message format: `chore(quill.md): <action> <subject>` (e.g. `chore(quill.md): update issue 0042 status to in_review`).
- **Debounced batched commits.** Kanban drag, which may move many cards in quick succession, queues writes and flushes them as **one commit** after a 2-second idle window (`KANBAN_DEBOUNCE_MS`), or on explicit "Push now" from the EditToolbar. Commit message format: `chore(quill.md): update N issue statuses`.
- **Optimistic concurrency.** Every write includes the file's last SHA as the provider requires. The provider rejects with 409 / 412 on mismatch; the app surfaces a `RemoteConflictError` banner; the local draft is preserved; the user pulls to refresh and retries.
- **Author identity.** Commit author is `{ name, email }` derived from the provider's authenticated user endpoint at connect time. Falls back to `quill.md <noreply@quill.md>` if the user endpoint does not return email.
- **Pending-write indicator.** The EditToolbar shows the queue depth and a "Push now" button. A failed flush keeps the queue intact and surfaces the error; the user can retry.

#### FR-17: Edit-branch advisory

- The home screen, on first entry to Remote Edit Mode, presents a **Remote Setup Wizard** that walks the user through:
  1. **Repo selection.** Strong recommendation: use a dedicated repository for `.quill.md/` so an accidental branch deletion does not affect code. Checkbox acknowledgement required to proceed.
  2. **Branch setup.** Default `quill-md`; editable. Explainer: this branch is treated as long-lived; the app will never merge it elsewhere; the app will never force-push.
  3. **PAT scope.** GitHub: `Contents: write` (fine-grained) or `repo` (classic). GitLab: `api` or `write_repository`. Document scopes inline.
  4. **Branch initialization.** If the branch is absent, the app creates it as an orphan (empty-tree commit + ref). Document that this is an **orphan branch** — it has no shared history with `main`.
- The EditToolbar shows a persistent advisory banner: "Using branch `quill-md`. Treat this branch as long-lived — never merge it elsewhere, never delete it. For safety, use a dedicated repository. [Show setup guide]". Dismissable per-session but re-shown on `openRemote`.
- The Settings panel exposes `edit_branch`, `commit_author_name`, `commit_author_email` (the latter two default to provider-derived values).

#### FR-11: First-run template setup wizard

When the application detects that `.quill.md/` is missing from the selected folder (Local Mode) or the cloned subtree (Remote Mode, **read-only inspection**), it MUST present a setup wizard with two mutually exclusive paths:

1. **"Use built-in templates"** — a checklist of the four built-in templates: `Epic`, `User Story`, `Task`, `Bug`. The user selects one or more via checkboxes. Selected templates are written into `.quill.md/templates/` verbatim from the bundle shipped with the application (see [Appendix C](#appendix-c-built-in-template-bundle)).
2. **"Create your own"** — the user authors one or more templates from scratch through the in-app template editor. Each template is written into `.quill.md/templates/` as it is saved. The editor MAY be opened multiple times to create multiple templates in a session.

The wizard MUST also generate a default `config.json` if none is present, seeding it with the standard status set (Open, In progress, In review, Done, Closed) and the default Kanban column set.

In Remote Read-Only Mode, the wizard is offered as a "download these templates to your local repo" suggestion, since the remote is read-only.

The wizard MUST refuse to proceed until at least one template is in place.

#### FR-12: Provider detection and override

The application MUST:

- Auto-detect the provider from the repository URL host (`github.com`, `gitlab.com`). Hosts that do not match any registered provider surface `RemoteUnsupportedHostError`.
- Allow the user to override the auto-detection via a dropdown on the home screen's "Browse remote repository" card. The dropdown offers: Auto / GitHub.com / GitHub Enterprise (custom base URL) / GitLab.com / Self-hosted GitLab (custom base URL).
- When the user selects "GitHub Enterprise" or "Self-hosted GitLab", an additional `<Input>` is shown for `customBaseUrl`. The value is forwarded to the provider's `parseUrl()` and used as the API base.
- Legacy `config.remote.cors_proxy` is accepted but ignored (no proxy is needed; provider REST APIs ship permissive CORS).

#### FR-13: Markdown rendering

The application MUST render Markdown sections through `marked`, sanitize the resulting HTML with `DOMPurify`, and apply Tailwind Typography (`prose`) for styling. Code blocks MUST be syntax-highlighted using a low-cost highlighter (the choice of highlighter is left to the implementation; `shiki` and `highlight.js` are both acceptable).

#### FR-14: Theme

The application MUST support a light theme and a dark theme, with the default following the user's `prefers-color-scheme`. The theme is implemented through Tailwind's `dark:` variant. The theme preference is stored in `localStorage` under `quill-md.theme`.

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
- The editor MUST display a visible warning banner on the affected issue, with the following copy: "This file was modified outside quill\.md. The contents can still be edited and saved from this view, but please review for unintended changes (e.g. broken `id`, `relations`, or section markers)."
- The warning is purely informational. The user MUST still be able to open, read, edit, and save the issue through the web app. On the next save performed through the web app, the hash is recomputed, the `integrity_warning` flag is cleared, and the warning banner disappears.
- The application MUST NOT block saves, refuse to render, or delete the issue solely on the basis of an integrity warning.

**Scope.**

- Integrity tracking applies to both Local Edit Mode and Remote Edit Mode. On every save through the web app, the hash is recomputed and stored. On Remote Mode saves, the new hash is written as part of the commit. The detection half of the flow is active in both modes: if the file was modified externally (e.g. via the provider's web UI between the app's read and write), the warning banner fires; the user's local draft is preserved; the user must Pull-to-refresh to reconcile.
- The hash is per-file. There is no global, cross-file integrity check.

### 3.2 Non-Functional Requirements

#### NFR-1: Performance

- The List view MUST render 1,000 issues with the filter bar and sort controls interactive in under 500 ms on a 2020-era laptop.
- The Kanban view MUST handle 500 issues across 5 columns without frame drops during drag.
- The Gantt view MUST render 200 bars and their dependency arrows in under 200 ms.
- Remote Edit Mode's initial cold-cache fetch MUST complete in under 5 s for repositories where `.quill.md/` is under 5 MB on disk. Reopen from the FR-10 IndexedDB snapshot MUST complete in under 500 ms.

#### NFR-2: Security

- The PAT MUST NOT be written to IndexedDB, `localStorage`, URLs, or any non-namespaced key.
- The PAT MAY be written to `sessionStorage` under the namespaced key `quill-md.remote-pat` so a page refresh does not re-prompt the user. The PAT is cleared on `signOut` and on tab close.
- The PAT MUST NOT appear in any log line, error message, URL, or analytics payload.
- The PAT MUST be passed to the provider exclusively through the provider method's `pat` argument (which brands it before any I/O).
- The provider REST endpoints (`api.github.com`, `gitlab.com/api/v4`) MUST be the only external endpoints the application contacts in Remote Edit Mode.
- All Markdown rendering MUST be sanitized to prevent XSS.

#### NFR-3: Privacy

- The application MUST NOT include any analytics, telemetry, error reporting, or third-party script that transmits user data off-device.
- The application's source code MUST NOT make any network request at runtime other than (a) the registered provider REST endpoints (`api.github.com`, `gitlab.com/api/v4`, or the user-configured `custom_base_url`) and (b) the static asset host (if any).

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

The application speaks the registered provider's REST API through the `RepoProvider` Strategy interface (`src/lib/adapters/providers/types.ts`). Each provider implementation encapsulates:

- **Authentication header:** GitHub uses `Authorization: Bearer <PAT>` (or `token <PAT>` for classic). GitLab uses `PRIVATE-TOKEN: <PAT>`. The PAT is supplied as the `pat` argument to every provider method; the brander ensures it never appears in logs.
- **Read endpoints:** GitHub: `GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1` for cold-open, `GET /repos/{owner}/{repo}/commits?path=.quill.md/&since=…` for delta. GitLab: `GET /projects/{id}/repository/tree?path=.quill.md&recursive=true` for cold-open, `GET /repository/commits` + `/compare` for delta.
- **Write endpoints:** GitHub: `PUT/DELETE /repos/{owner}/{repo}/contents/{path}` for single-file, Git Data API (`POST /git/commits` + `POST /git/trees` + `PATCH /git/refs/heads/{branch}`) for batched. GitLab: `PUT/DELETE /projects/{id}/repository/files/{path}` for single-file, `POST /repository/commits` with `actions[]` for batched.
- **Optimistic concurrency:** GitHub uses the file's blob SHA; GitLab uses the file's last commit SHA. The app tracks both per file.
- **Orphan branch creation:** Both providers can create the `quill-md` branch with no shared history with `main`. GitHub: empty-tree SHA `4b825dc6…` + commit + ref. GitLab: branch-from-default + single no-op commit.
- **Force-push guard:** Neither provider uses `force: true`; the app cannot bypass branch protection.

Adding a new provider is a Strategy-pattern registration: implement `RepoProvider`, register in `providers/registry.ts`, and (if auto-detection is desired) extend the `matches()` check.

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
|  - RemoteAdapter (Provider Strategy: GitHub, GitLab)       |
|    - Read: provider.fetchAll / fetchSince                  |
|    - Write: provider.putFile / deleteFile / commitBatch    |
|  - ReadCache (idb-backed snapshot, FR-10)                   |
|  - RendererAdapter (marked + DOMPurify)                    |
+------------------------------------------------------------+
```

### 5.2 Module Boundaries

- The **Adapter Layer** is the only layer that talks to the outside world. Swapping FSA for a different storage (e.g. a sync engine) or replacing the provider Strategy with a different Git library MUST be confined to this layer.
- The **Service Layer** is pure: it takes and returns domain objects, and never touches the DOM, the network, or the filesystem directly. It is fully unit-testable in a Node test runner.
- The **State Layer** is the single source of truth for the UI. It is reactive (Svelte 5 runes) and is updated exclusively by the Service Layer.
- The **UI Layer** is a pure function of the State Layer. It does not perform I/O.

### 5.3 Technology Stack

| Concern                | Library / API                           | Notes                                                                                              |
| ---------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Framework              | SvelteKit + `adapter-static`            | SPA build, no SSR.                                                                                 |
| Component model        | Svelte 5 (runes)                        | `$state`, `$derived`, `$effect`.                                                                   |
| Styling                | **Tailwind CSS v4**                     | With `@tailwindcss/typography` for prose.                                                          |
| Icons                  | **lucide-svelte**                       | Template icons, status icons, UI chrome.                                                           |
| Local filesystem       | File System Access API                  | Native browser API.                                                                                |
| Remote Git (read)      | Provider REST API (Strategy pattern)    | GitHub: `api.github.com`. GitLab: `gitlab.com/api/v4`. Permissive CORS, no proxy.                  |
| Remote Git (write)     | Provider REST API (Strategy pattern)    | `PUT /contents`, Git Data API on GitHub; `PUT /repository/files`, `/repository/commits` on GitLab. |
| Remote cache           | `idb` (IndexedDB-backed snapshot)       | FR-10 snapshot of `.quill.md/` files keyed by `(providerId, owner/repo, editBranch, sha)`.         |
| PAT persistence        | `sessionStorage`                        | Namespaced under `quill-md.remote-pat` (cleared on tab close / sign-out).                          |
| YAML parsing           | `js-yaml`                               | Frontmatter.                                                                                       |
| Frontmatter + sections | `gray-matter` (extended)                | `gray-matter` handles the `---` block; a custom adapter handles the section markers.               |
| Markdown rendering     | `marked` + `DOMPurify`                  | Sanitized output.                                                                                  |
| Code highlighting      | `shiki` (preferred) or `highlight.js`   | For code blocks in sections.                                                                       |
| Integrity hash         | Web Crypto API (`crypto.subtle.digest`) | Native SHA-256 for FR-15. No third-party hashing library.                                          |
| Drag-and-drop          | `svelte-dnd-action`                     | Kanban.                                                                                            |
| Gantt                  | Custom SVG component                    | Built on plain SVG; no third-party Gantt library.                                                  |
| State                  | Svelte stores + runes                   | Reactive.                                                                                          |
| Testing                | Vitest + Playwright                     | Unit and end-to-end.                                                                               |
| Bundler                | Vite (via SvelteKit)                    | Default.                                                                                           |
| Hosting                | Static (any)                            | GitHub Pages, Netlify, etc.                                                                        |

### 5.4 Build and Deploy

- The application is built with `npm run build`, producing a `build/` directory of static assets.
- The assets are deployable to any static host. There is no server-side rendering and no server-side function.
- The `adapter-static` configuration MUST set `ssr: false` and `prerender: false` (the app is interactive from the first byte; no static pre-rendering of issue content).

### 5.5 Folder Handle Lifecycle

1. User clicks "Open local folder" → `showDirectoryPicker({ id: 'quill-md-folder', mode: 'readwrite' })`.
2. The handle is stored in IndexedDB under `quill-md.handle` (the browser enforces that the handle can only be re-acquired with the same origin and `id`).
3. On subsequent visits, the app reads the handle, calls `queryPermission({ mode: 'readwrite' })`, and if granted, proceeds silently. If not, it calls `requestPermission({ mode: 'readwrite' })` and only then proceeds.
4. If permission is denied, the user is taken back to the home screen with a non-blocking error.
5. The "Switch folder" command opens a new picker and replaces the active handle; the previous handle is moved to the "Recent folders" list (capped at 5 entries).

---

## 6. Data Model

All persistent state lives inside the repository itself, under `.quill.md/`. The convention is:

```
.quill.md/
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
| `issue_type`           | string          | yes      | The id of a template under `.quill.md/templates/`.                                                |
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

Templates live at `.quill.md/templates/<type>.json`. They declare the schema for one issue type.

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

The application ships with four built-in templates (see [Appendix C](#appendix-c-built-in-template-bundle)). They are bundled as a single JSON file at build time and offered through the first-run wizard (FR-11). Selecting one writes it verbatim into `.quill.md/templates/`.

---

## 7. Use Cases

### UC-1: Open a local folder and create a new issue

1. The user clicks "Open local folder" on the home screen.
2. The browser shows a directory picker; the user picks a folder.
3. The application inspects the folder. It finds `.quill.md/` and `config.json` and `templates/`. The wizard is skipped.
4. The application loads `config.json` and the four templates, and lists the issues in `.quill.md/issues/`.
5. The user clicks "New issue" and selects "Bug" from the dropdown.
6. The editor renders the Bug form. The user fills in `title`, `severity`, `priority`, `assignee`, and the two obligatory sections.
7. The user clicks "Save". The application validates (FR-8), slugifies the title, picks the next `id`, and writes `.quill.md/issues/0043-fix-the-thing.md`.

### UC-2: Browse a remote repository read-only

1. The user clicks "Browse remote repository" on the home screen.
2. The user enters the URL `https://github.com/acme/widgets`, accepts the auto-detected GitHub provider, and pastes a PAT with `Contents: write` scope.
3. The application auto-detects the GitHub provider from the URL host, validates the PAT via `GET /user`, and ensures the `quill-md` edit branch exists (creating it as an orphan if absent).
4. The application fetches the `.quill.md/` subtree via `GET /git/trees/{sha}?recursive=1`, snapshots it into IndexedDB (FR-10), and renders the issues in the List view.
5. The user can switch to the Kanban view (drag enqueues a write; the queue debounces and flushes as one commitBatch per 2 s idle window) and the Gantt view (read-only).
6. The user can also click "Refresh" to re-fetch (PAT re-prompted or read from sessionStorage).

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

1. The user opens a folder that does not yet contain `.quill.md/`.
2. The wizard offers two paths: "Use built-in templates" and "Create your own".
3. The user picks "Use built-in templates", checks `Bug` and `User Story`, and clicks "Apply".
4. The application writes `.quill.md/templates/bug.json`, `.quill.md/templates/user-story.json`, and a default `config.json`.
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

| Req   | Acceptance Criteria                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1  | Given a valid issue file, the parser produces an in-memory object with all frontmatter keys, all sections, and the Markdown body of each section. Re-serializing the object produces a file that, when parsed again, yields an equivalent object (round-trip).                                                                                                                           |
| FR-2  | Given a template, the editor renders one input per field, in ascending `id` order. `longtext` fields and `sections` are rendered as Markdown editors.                                                                                                                                                                                                                                    |
| FR-3  | Given a missing or malformed `config.json`, the application shows an actionable error and refuses to start.                                                                                                                                                                                                                                                                              |
| FR-4  | Create, read, update, delete operations succeed against a real local folder in a Chromium browser. The folder handle is restored across page reloads. "Switch folder" works.                                                                                                                                                                                                             |
| FR-5  | Opening a public GitHub repository with `.quill.md/` (via the provider REST API) completes the cold fetch in under 5 s on a 2020-era laptop. The PAT does not appear in any log or URL. Provider detection from the URL host works for `github.com` and `gitlab.com`. An unknown host surfaces `RemoteUnsupportedHostError` and the home-screen dropdown lets the user pick an override. |
| FR-6  | List view renders 1,000 issues in under 500 ms. Kanban supports drag-and-drop in both Local and Remote modes (Remote enqueues via the CommitQueueStore, debounced to one commit per 2 s idle). Gantt renders 200 bars + dependency arrows in under 200 ms.                                                                                                                               |
| FR-7  | All filter predicates are combinable with AND. The active filter set survives a page reload.                                                                                                                                                                                                                                                                                             |
| FR-8  | Saving an issue with an empty obligatory field or empty obligatory section is blocked with a per-field error message.                                                                                                                                                                                                                                                                    |
| FR-9  | Cycles in `parent`/`child` and `blocks`/`depends_on` are detected and refused. Cycles in `relates_to` are allowed.                                                                                                                                                                                                                                                                       |
| FR-10 | Reopening Remote Edit Mode for a previously-fetched `(providerId, owner/repo, editBranch, sha)` loads the IndexedDB snapshot instantly; a `commitSha` mismatch triggers a `commits?since=…` delta-fetch. Clearing the snapshot from Settings drops it.                                                                                                                                   |
| FR-11 | On a folder without `.quill.md/`, the wizard appears. Both paths ("Use built-in templates" and "Create your own") are functional. At least one template is required to exit the wizard.                                                                                                                                                                                                  |
| FR-12 | The home-screen dropdown offers `auto` (default), `GitHub.com`, `GitHub Enterprise`, `GitLab.com`, and `Self-hosted GitLab`. Selecting an Enterprise / Self-hosted option surfaces an additional `customBaseUrl` input. Legacy `config.remote.cors_proxy` is accepted but ignored.                                                                                                       |
| FR-13 | Markdown sections render correctly. Code blocks are syntax-highlighted. A `<script>` tag in a section is stripped by the sanitizer.                                                                                                                                                                                                                                                      |
| FR-14 | Light and dark themes render correctly. The theme preference persists across reloads.                                                                                                                                                                                                                                                                                                    |
| FR-15 | Saving an issue writes a `sha256:` hash into the `integrity_hash` field. Re-loading a manually edited file produces a warning banner. The user can still edit and save the file; the warning is cleared on the next save performed through the web app.                                                                                                                                  |
| FR-16 | An issue save produces one commit on the edit branch with message `chore(quill.md): <action> <subject>`. Multiple Kanban drags within 2 s coalesce into one commitBatch with message `chore(quill.md): update N issue statuses`. A 409 from the provider surfaces a `RemoteConflictError` banner; the user's local draft is preserved; the queue is preserved.                           |
| FR-17 | The Remote Setup Wizard presents (1) dedicated-repo recommendation with checkbox acknowledgement, (2) edit-branch default `quill-md`, (3) PAT scope guidance. The orphan-branch creation on first open succeeds. The EditToolbar shows a persistent advisory banner naming the branch and recommending a dedicated repo.                                                                 |
| NFR-3 | The application's network tab shows requests only to (a) the Git provider, (b) the configured CORS proxy, and (c) the static asset host. No other requests are made.                                                                                                                                                                                                                     |
| NFR-4 | The application is fully operable by keyboard. Statuses and labels are conveyed by text, not color alone. The Gantt view has a textual fallback.                                                                                                                                                                                                                                         |
| NFR-5 | The browser support matrix in [Section 3.2 NFR-5](#nfr-5-browser-support) holds.                                                                                                                                                                                                                                                                                                         |
| NFR-6 | All user-facing strings are sourced from a single map.                                                                                                                                                                                                                                                                                                                                   |
| NFR-7 | A failed remote fetch does not corrupt the cache. A failed local write is rolled back. A revoked FSA handle re-prompts without losing in-memory editor state.                                                                                                                                                                                                                            |

---

## 9. Out of Scope

The following are explicitly **not** part of v1:

- **Pull request creation, merge, rebase.** The app commits to the edit branch only; the user is responsible for opening PRs and merging to `main`.
- **Force-push.** The app never uses `force: true` on either provider.
- **Branch protection enforcement.** The app cannot enforce that the user's repo has the `quill-md` branch protected. The wizard + advisory banner are guidance only.
- **OAuth flow.** PAT only. GitHub OAuth App / GitLab OAuth flows are out of scope.
- **Comments and discussion threads.** Issues are silent; there is no commenting system.
- **Attachments and file uploads.** Issues contain only text and Markdown.
- **Real-time multi-user collaboration.** The application is single-user. Concurrent edits from multiple sessions on the same edit branch may race; optimistic concurrency surfaces the collision.
- **Notifications.** The application does not watch the repository for changes; it polls on user action.
- **Mobile and touch support.** The application targets desktop browsers only.
- **Localization.** English only in v1.
- **Import from / export to other issue trackers** (GitHub Issues, Jira, Linear). Migration tooling is out of scope.
- **Webhooks, automation, custom workflows.** No server-side automation is possible; all behavior is local.
- **Custom CORS-proxy management.** Removed in v2.0 — provider REST APIs ship permissive CORS.
- **Pending-write queue persistence.** Closing the tab drops queued Kanban writes. A future commit could persist the queue in IndexedDB.
- **GraphQL delta-fetch.** REST + commits-since + tree-recursive is the v2.0 implementation. A future commit could swap to GraphQL `repository.object.history(path, since)` for one-shot delta queries; the `RepoProvider` interface already accommodates it.

---

## 10. Glossary and Appendices

### Glossary

| Term                   | Definition                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| CORS                   | Cross-Origin Resource Sharing. Provider REST APIs ship permissive CORS headers — no proxy.              |
| Edit branch            | The branch the app commits to in Remote Edit Mode. Default `quill-md`. Long-lived, orphan-style.        |
| Frontmatter            | YAML metadata block at the top of a Markdown file, delimited by `---`.                                  |
| IndexedDB              | Browser-native key-value store. Used by the FR-10 snapshot and by `handleStore` for FSA handles.        |
| Optimistic concurrency | Provider APIs require the file's last SHA on every write; mismatch returns 409 → `RemoteConflictError`. |
| Orphan branch          | A branch with no shared history with `main`. The `quill-md` branch is always created as orphan.         |
| PAT                    | Personal Access Token. A credential for Git provider APIs. Session-scoped (lives in `sessionStorage`).  |
| Provider               | A registered `RepoProvider` Strategy implementation (GitHub, GitLab, …).                                |
| Section                | A named Markdown block in an issue file, delimited by `SECTION_START` and `SECTION_END` markers.        |
| Slug                   | A URL- and filename-safe version of a string, lowercased with non-alphanumerics replaced by `-`.        |
| Template               | A JSON file describing the schema of an issue type.                                                     |
| Type                   | Synonym for "issue type". A category of issue (e.g. Bug, Epic, User Story, Task).                       |

### Appendix A: Technology Stack with Rationale

| Choice                                   | Rationale                                                                                                                                                                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SvelteKit + `adapter-static`             | The simplest path to a pure static SPA with file-system-based routing, layouts, and a mature build pipeline. Svelte 5 runes give fine-grained reactivity without the boilerplate of older reactive primitives.                    |
| Tailwind CSS v4                          | Utility-first styling with strong defaults for prose via `@tailwindcss/typography`. Version 4 brings a smaller bundle and faster builds.                                                                                          |
| `lucide-svelte`                          | A large, consistent, well-maintained icon set with first-class Svelte bindings.                                                                                                                                                   |
| File System Access API                   | The only browser API that gives JavaScript read/write access to a local folder. Limited to Chromium for now, which is acceptable given the target audience.                                                                       |
| Provider Strategy (GitHub / GitLab REST) | Replaces v0's isomorphic-git + LightningFS stack. Provider APIs ship permissive CORS — no proxy required. Each provider is a `RepoProvider` implementation; new providers can be added without touching the rest of the codebase. |
| `idb`                                    | IndexedDB wrapper used by the FR-10 snapshot. Lightweight (no schema-management overhead) and works in Node test environments.                                                                                                    |
| `sessionStorage`                         | Namespaced under `quill-md.*`. Holds the PAT and session metadata for the duration of the tab; cleared on close / sign-out.                                                                                                       |
| `gray-matter`                            | Battle-tested frontmatter parser. We extend it with a small post-processing step to handle section markers.                                                                                                                       |
| `js-yaml`                                | The standard YAML parser for JavaScript. Used by `gray-matter` internally and re-used directly for non-frontmatter YAML (e.g. template validation).                                                                               |
| `marked` + `DOMPurify`                   | `marked` is small, fast, and extensible. `DOMPurify` is the de-facto XSS sanitizer.                                                                                                                                               |
| Custom SVG Gantt                         | Off-the-shelf Gantt libraries are heavy and not customizable enough for our use case. A 200-bar custom SVG component is well within scope.                                                                                        |
| Web Crypto API                           | Native browser API. Used for SHA-256 integrity hashing (FR-15). Avoids adding a hashing dependency for a single digest.                                                                                                           |

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

The application ships with the following four templates in a bundle, accessible to the first-run wizard (FR-11). They are stored as a single JSON file at build time and copied verbatim into the user's `.quill.md/templates/` directory when selected.

| Template id  | Name       | Icon           | Color     | Default status |
| ------------ | ---------- | -------------- | --------- | -------------- |
| `epic`       | Epic       | `flame`        | `#f97316` | `open`         |
| `user-story` | User Story | `book-open`    | `#0ea5e9` | `open`         |
| `task`       | Task       | `check-square` | `#10b981` | `open`         |
| `bug`        | Bug        | `bug`          | `#e74c3c` | `open`         |

Full schemas are in [Appendix B](#appendix-b-complete-example-files) (sections B.2, B.3, B.4, B.5).

### Appendix D: Provider implementation sketch

The following pseudocode documents the intended call sequence for opening a remote repository in Remote Edit Mode (FR-5, FR-16). It is not normative; it is provided to clarify the intent of the requirement.

```ts
// 1. Detect provider from URL host (or honour preferredId override).
const provider = detectProvider(url) ?? resolveProvider(url, preferredId);

// 2. Verify PAT scope (one-time call).
const user = await provider.verifyAuth(parsed, pat);
//   throws RemoteAuthError on 401/403.

// 3. Ensure the edit branch exists (orphan on first open).
const tip = await provider.getBranch(parsed, editBranch, pat);
if (!tip) {
	tip = await provider.createOrphanBranch(parsed, editBranch, pat, author);
	//   POST /git/commits on empty tree + POST /git/refs  (GitHub)
	//   POST /repository/branches + POST /repository/commits with one action (GitLab)
}

// 4. Read the .quill.md/ subtree.
const files = await provider.fetchAll(parsed, tip, pat);
//   GET /git/trees/{sha}?recursive=1  (GitHub)
//   GET /repository/tree?path=.quill.md&recursive=true  (GitLab)

// 5. Persist to IndexedDB snapshot for fast reopen (FR-10).
await putSnapshot({ cacheKey, files });

// 6. Build the read+write adapter rooted at the .quill.md/ subtree.
const adapter = buildReadOnlyAdapter(files, tip);

// 7. User saves → provider.putFile / deleteFile / commitBatch.
//   409 → RemoteConflictError, local draft preserved.
```

The `fetchSince` path replaces `fetchAll` on reopen when the cache's commit SHA differs from the latest: it issues `GET /repos/.../commits?path=.quill.md/&since=…` and re-fetches only the touched files.

---

_End of document._
