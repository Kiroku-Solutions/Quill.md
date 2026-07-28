# Quill.md Expansion & Polish - Implementation Plan

This document details the stages, architecture decisions, and file-level modifications required to implement the 18 requested features and fixes for the `quill.md` codebase, following modern agile and client-side web application development best practices.

---

## Stages of Execution

We propose a **3-stage execution** to implement these changes safely without disrupting the existing 100% green test suite:

1. **Stage 1: Core Service & Data Model Upgrades**
   - UUID migration for issue identifiers.
   - Folder separation (`open` / `closed`) with backwards-compatibility loaders.
   - Integrity hash updates & MCP alignment.
   - Hashing fix for online editing (base64 bug) & section headers for GitHub preview.
2. **Stage 2: Remote Mode & Optimization Layer**
   - GraphQL `createCommitOnBranch` / Contents API optimization.
   - Public vs. Private repository check & read-only access without PAT.
   - Session caching improvements (page reload recovery & default branch `quill.md`).
   - Search index generation (`search-index.json`).
3. **Stage 3: UI/UX Views, Wiki, ADRs & Integration**
   - Dropdown for open/closed filters.
   - Client-side Wiki & ADR manager views with markdown editing in a LeftRail sub-menu.
   - Removal of the redundant Tree view file (`TreeView.svelte`).
   - Sprint Planner story point unification.
   - Pagination in lists.
   - Automation script (`quill-close-bot.js`) for GitHub/GitLab/Bitbucket commit-closing.

---

## Resolved Design Decisions & Questions

- **Close Bot Script Location**: YES. The automation script `scripts/quill-close-bot.js` will be stored under `/scripts/` so it can be easily run in GitHub Actions, GitLab CI/CD, and Bitbucket Pipelines workflows.
- **Wiki & ADR UI Placement**: SUB-MENU. The Wiki and ADR managers will be placed inside a dedicated sub-menu within the `LeftRail` sidebar to maintain a clean interface.
- **Data Migration on Folder Separation**: Existing repos store all issues in `.quill.md/issues/*.md`. Moving to `.quill.md/issues/open/` and `.quill.md/issues/closed/` requires our loader to read legacy locations, while new/updated writes automatically land in the correct folder.
- **Tree View Removal**: In accordance with "Camino Critico (Eliminar arbol)", the Tree view (`TreeView.svelte`) will be deleted as it is redundant with the Graph view, which already provides 2D and 3D force-directed layouts. No critical path calculations will be performed.
- **Web Sandbox Directory Handle Permissions**: Web browsers clear File System Access handles on page reload due to browser security policies. We will cache folder metadata in `sessionStorage` and show a "Restore Last Session: Re-grant permission to [folder]" action card on the home screen for 1-click re-opening.

---

## Proposed Code Changes

### 1. Data Model & Serialization (Stage 1)

#### [MODIFY] [issue.ts](file:///t:/Kiroku/AgnosticIssuer/src/lib/types/issue.ts)

- Change `Issue.id` and `Relation.id` from `number` to `string` (UUID brand).
- Update `IssueId` brand definition to target string validation (`crypto.randomUUID` formatting) and update `ISSUE_ID_REGISTRY` to a `Set<string>`.

#### [MODIFY] [slugs.ts](file:///t:/Kiroku/AgnosticIssuer/src/lib/services/slugs.ts)

- Update `buildIssueFilename` to prepend the UUID string instead of zero-padded number.
- Remove `nextIssueId` (or redefine it to return `crypto.randomUUID()`).

#### [MODIFY] [serializer.ts](file:///t:/Kiroku/AgnosticIssuer/src/lib/services/serializer.ts)

- Prepend headings (`## Section Name`) to each section in `serializeSection` to support visual sections in GitHub's markdown preview, while retaining `SECTION_START` / `SECTION_END` HTML comments underneath for parser compatibility.

#### [MODIFY] [parser.ts](file:///t:/Kiroku/AgnosticIssuer/src/lib/services/parser.ts)

- Support string/UUID formats when parsing `fm['id']`.
- Tolerant parsing for the new visual headings (ignore `## Heading` lines placed right before `SECTION_START`).

#### [MODIFY] [issues.ts](file:///t:/Kiroku/AgnosticIssuer/quill-mcp-server/src/tools/issues.ts)

- Align MCP issue creation to generate a `crypto.randomUUID()` string instead of sequential numbers.

#### [MODIFY] [serializer.ts](file:///t:/Kiroku/AgnosticIssuer/quill-mcp-server/src/services/serializer.ts)

- Redefine MCP serialization to match the client's output, putting custom fields at the top level (instead of nested in `custom_fields: {}`) and computing the SHA-256 integrity hash correctly so that MCP-saved issues do not trigger `integrityWarning` in the client app.

---

### 2. File Directory Separation & Search Index (Stage 1 & 2)

#### [MODIFY] [issue-saver.ts](file:///t:/Kiroku/AgnosticIssuer/src/lib/services/issue-saver.ts)

- Update `issuePath` to route files to `.quill.md/issues/open/` or `.quill.md/issues/closed/` based on their status category.
- When an issue's status is patched to change its category (e.g. from 'todo' to 'done'), move/rename the file on disk between `open` and `closed` directories.

#### [MODIFY] [issue-loader.ts](file:///t:/Kiroku/AgnosticIssuer/src/lib/services/issue-loader.ts)

- Update `loadIssues` to load files from `.quill.md/issues/open/` and `.quill.md/issues/closed/` recursively.
- Fallback: read any legacy issues located directly under `.quill.md/issues/` to support older workspaces.

#### [NEW] [search.ts](file:///t:/Kiroku/AgnosticIssuer/src/lib/services/search.ts)

- Implement a search indexing service that generates a client-side keyword search index and saves it to `.quill.md/search-index.json`. Use this index to run text searches instantly.

---

### 3. Remote Adapter & GitHub API (Stage 2)

#### [MODIFY] [github.ts](file:///t:/Kiroku/AgnosticIssuer/src/lib/adapters/providers/github.ts)

- **Fix base64 bug**: In `treeEntryFor`, remove the `utf8ToBase64` call from the `content` field. `git.createTree` expects raw text content.
- **GraphQL optimization**: Implement `commitBatch` using GitHub's GraphQL `createCommitOnBranch` mutation to execute batch uploads/deletions in a single round-trip.
- Add an anonymous check `isPublic(parsed)` using `repos.get` to detect public repos.

#### [MODIFY] [remote.ts](file:///t:/Kiroku/AgnosticIssuer/src/lib/adapters/remote.ts)

- Allow `options.pat` to be empty. If empty, check if repository is public using `isPublic`. If public, bypass authentication and load in read-only mode.

#### [MODIFY] [mode.svelte.ts](file:///t:/Kiroku/AgnosticIssuer/src/lib/state/mode.svelte.ts)

- Add `lastActiveFolder` state to mode store. Persist the folder handle name in IndexedDB. If permission is dropped on reload, display a "Re-open last folder" action card.
- Track read-only status for remote connections. Disable write adapters if no PAT is present.

#### [MODIFY] [+layout.svelte](file:///t:/Kiroku/AgnosticIssuer/src/routes/+layout.svelte)

- Remove `if (!isFsaAvailable()) return;` from layout's `onMount` so remote session restore runs correctly on non-FSA browsers like Firefox.
- In both local and remote modes, if `config.config === null`, redirect to `/wizard`.

#### [MODIFY] [+page.svelte](file:///t:/Kiroku/AgnosticIssuer/src/routes/+page.svelte)

- Change default `repoBranch` branch input to `'quill.md'`.
- Validate repository URL on-the-fly. If public, show a helper text and make the PAT field optional.

---

### 4. UI Views, Wiki, ADRs & Bot (Stage 3)

#### [MODIFY] [FilterBar.svelte](file:///t:/Kiroku/AgnosticIssuer/src/lib/components/FilterBar.svelte)

- Add a dropdown for status category filtering ("Only Open" by default, "All", "Only Closed").

#### [MODIFY] [LeftRail.svelte](file:///t:/Kiroku/AgnosticIssuer/src/lib/components/LeftRail.svelte)

- Add a sub-menu for Wiki and ADR pages.
- Remove `tree` from the `viewTabs` list.

#### [NEW] [WikiView.svelte](file:///t:/Kiroku/AgnosticIssuer/src/lib/components/WikiView.svelte)

- A markdown wiki manager that reads and writes `.md` files under `.quill.md/wiki/`. Supports image attachments under `/attachments/` and client-side markdown editing.

#### [NEW] [AdrView.svelte](file:///t:/Kiroku/AgnosticIssuer/src/lib/components/AdrView.svelte)

- An Architecture Decision Records (ADR) manager showing status (Proposed, Accepted, Rejected, Superseded) and templates, saving files under `.quill.md/adr/`.

#### [DELETE] [TreeView.svelte](file:///t:/Kiroku/AgnosticIssuer/src/lib/components/TreeView.svelte)

- Remove the redundant Tree view file.

#### [MODIFY] [SprintView.svelte](file:///t:/Kiroku/AgnosticIssuer/src/lib/components/SprintView.svelte)

- Update metrics and estimators to read `story.fields.estimate ?? story.customFields.story_points ?? story.customFields.estimate_hours` to unify story points display.

#### [NEW] [quill-close-bot.js](file:///t:/Kiroku/AgnosticIssuer/scripts/quill-close-bot.js)

- A cross-platform script that parses commit messages (`Closes Quill.md #<id>`), edits the corresponding issue file's status to `closed`, and commits the changes back to the repository. Compatible with GitHub Actions, GitLab CI/CD, and Bitbucket pipelines.

---

## Verification Plan

### Automated Tests

Run the entire Vitest suite to ensure everything remains green:

```bash
pnpm check && pnpm lint && pnpm test
```

Create new unit tests for:

- UUID parsing and filename mapping in `slugs.test.ts`.
- File splitting loader/saver in `issue-loader.test.ts` and `issue-saver.test.ts`.

### Manual Verification

1. **Reload test**: Open a remote repo, reload the page, and ensure the session stays active.
2. **Permission restore test**: Open a local folder, reload the page, see the "Re-open last folder" card, click it, re-grant permission, and ensure it restores the workspace.
3. **Public repo test**: Load a public repository without entering a PAT, verify it loads in read-only mode, and verify that editing/creating options are hidden.
4. **Base64 edit verification**: Open a remote repo with a token, edit an issue, save it, and verify on GitHub that the file contains actual Markdown rather than a base64 string.
5. **Sprint Planner check**: Assign story points under a Scrum template, open the Sprint view, and verify that the metrics sum up points correctly.
