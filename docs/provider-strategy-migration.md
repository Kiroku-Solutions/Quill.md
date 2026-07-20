# Provider Strategy migration — change log

This document records every change made when replacing the isomorphic-git

- LightningFS remote adapter with a Strategy-pattern implementation that
  talks to provider REST APIs (GitHub + GitLab) directly.

The work was prompted by two requirements:

1. Replace `isomorphic-git` (which is the only piece of the project that
   requires a CORS proxy, complicated the build, and is read-only by
   design) with provider-native REST APIs.
2. Make the remote mode **editable** on a dedicated, long-lived
   `quill-md` branch, with per-save commits and a debounced Kanban
   commit queue.

The full architectural rationale is in the plan (archived alongside
this document) and the ERS rewrite that landed alongside.

---

## 1. New modules

### 1.1 `src/lib/adapters/providers/`

The Strategy pattern's home. One file per provider, plus a shared
HTTP helper, a PAT brand, and a registry.

| File          | Purpose                                                                                                                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`    | `RepoProvider` interface, `ParsedRepo`, `RemoteFile`, `RemoteFileChange`, `AuthenticatedUser`, `AuthorIdentity`, `BranchTip`, `PutFileInput`, `PutFileResult`, `DeleteFileInput`, `DeleteFileResult`, `CommitBatchInput`, `CommitBatchResult` |
| `registry.ts` | `getProvider(id)`, `listProviders()` — central registration                                                                                                                                                                                   |
| `detect.ts`   | `detectProvider(url)`, `resolveProvider(url, preferredId)` — auto-detect by host with override                                                                                                                                                |
| `github.ts`   | `GitHubProvider` — full REST implementation (read + write + orphan branch)                                                                                                                                                                    |
| `gitlab.ts`   | `GitLabProvider` — full REST implementation (read + write + orphan branch)                                                                                                                                                                    |
| `_http.ts`    | `fetchJson`, `fetchText` with PAT hygiene + 4xx/5xx classification                                                                                                                                                                            |
| `_pat.ts`     | PAT brand registry + redaction helper                                                                                                                                                                                                         |
| `index.ts`    | Public barrel                                                                                                                                                                                                                                 |

### 1.2 `src/lib/adapters/remote.ts`

Replaces `remote-git.ts`. Public API (`fetchSubtree`, `clearCache`,
`ReadonlyRemoteAdapter`, `RepoUrl`, `Branch`, `Sha`, `CacheKey`)
matches the previous version so service / state / UI code is
unaffected.

The `FetchResult` shape gains `providerId` and `editBranch` fields
and drops `proxyWarning` (always `null` now — provider REST APIs
ship permissive CORS). The `FetchOptions` shape drops `corsProxy`,
`depth`, and gains `editBranch`, `customBaseUrl`,
`preferredProviderId`.

### 1.3 `src/lib/adapters/read-cache.ts`

`idb`-backed snapshot store keyed by `cacheKey` (= provider + owner +
repo + branch + sha). Replaces the LightningFS volume previously
keyed by `(url, branch)`. Survives reload; dropped on "Clear local
snapshot".

### 1.4 `src/lib/state/pat-storage.ts`

`sessionStorage` wrapper for the PAT and the session metadata.
Namespaced under `quill-md.remote-pat` and `quill-md.remote-session`.
Cleared on `signOut` and on tab close (sessionStorage is per-tab).

### 1.5 `src/lib/state/commit-queue.svelte.ts`

`CommitQueueStore` factory. The Kanban drag handler calls `enqueue`
on every status change; a 2-second debounced flush calls
`provider.commitBatch()` to land all queued writes in one commit.
The editor's "Save" button calls `flushNow` to bypass the debounce.
A failed flush keeps the queue intact and surfaces the error as
`RemoteConflictError` on the toolbar so the user can "Pull to
refresh" and retry.

### 1.6 `src/lib/components/EditToolbar.svelte`

Unified toolbar that replaces `LocalToolbar.svelte` +
`RemoteToolbar.svelte`. Always shows "New issue", "Import .md",
"Refresh", and the trash count. In remote mode it also shows the
provider pill, the edit-branch label, the pending-write badge, the
"Push now" button, and "Sign out" (which now also clears
sessionStorage).

---

## 2. Removed modules

| File                                     | Reason                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| `src/lib/adapters/remote-git.ts`         | Replaced by `remote.ts`                                                 |
| `src/lib/polyfills/buffer.ts`            | Only required for `isomorphic-git`'s packfile decoder; no longer needed |
| `tests/adapters/remote-git.test.ts`      | Adapter tests moved to `providers/{github,gitlab}.test.ts`              |
| `tests/adapters/remote-git.live.test.ts` | Replaced by mocked `globalThis.fetch` tests                             |
| `tests/adapters/buffer.test.ts`          | Buffer polyfill removed                                                 |

---

## 3. Modified files

### 3.1 `package.json`

**Removed:** `isomorphic-git`, `@isomorphic-git/lightning-fs`, `buffer`.

### 3.2 `src/lib/adapters/errors.ts`

Added four typed error classes:

- `RemoteConflictError` — optimistic-concurrency collision (provider 409/412)
- `RemoteBranchMissingError` — the edit branch is absent on the remote
- `RemoteCommitRejectedError` — provider rejected the commit (422, etc.)
- `RemoteUnsupportedHostError` — the URL host is not recognised

The `AdapterErrorType` union grew accordingly.

### 3.3 `src/lib/adapters/feature-detect.ts`

Added `isAnyRemoteError` and `isRemoteConflictError` type guards.

### 3.4 `src/lib/adapters/index.ts`

Updated the public barrel to drop the legacy remote-git re-exports
and add the Strategy exports. Backwards-compat helpers (`brandRepoUrl`,
`brandBranch`, `brandSha`, `makeCacheKey`, `DEFAULT_EDIT_BRANCH`) are
re-exported from `remote.ts` so existing call sites keep working.

### 3.5 `src/lib/types/config.ts`

`RemoteConfig` gained:

- `provider?: 'github' | 'gitlab'`
- `edit_branch?: string`
- `custom_base_url?: string`
- `commit_author_name?: string`
- `commit_author_email?: string`

`cors_proxy` is now optional and ignored.

### 3.6 `src/lib/services/config-loader.ts`

The `assertConfig` validator no longer requires `remote.cors_proxy`.
Legacy configs that still carry the field load successfully (the
field is accepted but ignored).

### 3.7 `src/lib/services/built-in-templates.ts`

The default config now carries `provider: 'github'` and
`edit_branch: 'quill-md'`.

### 3.8 `src/lib/services/framework-presets.ts` + `.es.ts`

Both files: 20 occurrences of `cors_proxy: '...isomorphic-git...'` replaced
with `provider: 'github'` + `edit_branch: 'quill-md'`.

### 3.9 `src/lib/state/mode.svelte.ts`

- Imports moved from `./remote-git.ts` to `./remote.ts`.
- `consumePatAndFetch` returns the full `FetchResult` (the public store
  reads `editBranch` / `providerId` from there).
- New reactive slots: `editBranch`, `providerId` (in addition to the
  existing `mode`, `remoteAdapter`, `localAdapter`, `lastFetchedAt`,
  `proxyWarning`).
- `openRemote` writes the PAT and session metadata to
  `sessionStorage`.
- `signOut` clears `sessionStorage`.
- `bootstrap` attempts silent restoration from sessionStorage
  before the local-folder bootstrap path; a stale PAT drops the
  session silently.
- `clearRemoteCache` derives a stable key from `_patScope` and calls
  `clearCache`.

### 3.10 `src/lib/state/index.ts`

Re-exports the new `CommitQueueStore`, `QueuedWrite`, `QueueState`,
`createCommitQueueStore`, `KANBAN_DEBOUNCE_MS`, `clearPat`,
`readPat`, `readSessionMeta`, `writePat`, `writeSessionMeta`, and
`RemoteSessionMeta`.

### 3.11 `src/lib/components/TopBar.svelte`

Whitespace / formatting refresh; the `proxyWarning` mount guard is
preserved for backwards compatibility (always `null` now).

### 3.12 `src/routes/+layout.svelte`

Dropped the `import '$lib/polyfills/buffer'` first-statement (the
polyfill no longer exists). Header comment refreshed.

### 3.13 `static/_headers`

`connect-src` allowlist changed from
`https://cors.isomorphic-git.org https://*.github.com https://*.gitlab.com`
to
`https://api.github.com https://gitlab.com https://*.githubusercontent.com`.

### 3.14 `src/app.html`

Same CSP update.

### 3.15 Test files

| File                                                                                                                    | Change                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `tests/state/mode.clear-cache.test.ts`                                                                                  | Imports moved from `remote-git` to `remote`. Mock `FetchResult` includes `providerId`, `editBranch`, `author`. |
| `tests/state/mode.open-remote.test.ts`                                                                                  | Same.                                                                                                          |
| `tests/state/mode.refresh-remote.test.ts`                                                                               | Same; `proxyWarning` dropped from mocks.                                                                       |
| `tests/ui/{app-shell,form-fields,kanban-dnd,list-keyboard,recent-folders,remote-toolbar,settings-panel}.svelte.test.ts` | `ModeStore` mock now includes `editBranch` and `providerId`.                                                   |
| `tests/a11y/{keyboard-nav,step-6.a11y}.test.ts`                                                                         | Same.                                                                                                          |
| `tests/services/config-loader.test.ts`                                                                                  | Test that asserts `cors_proxy` is required now asserts the opposite (the field is optional).                   |
| `tests/services/built-in-templates.test.ts`                                                                             | Asserts `provider: 'github'` and `edit_branch: 'quill-md'` instead of the legacy `cors_proxy`.                 |

### 3.16 New test files

- `tests/adapters/providers/detect.test.ts` — registry + detectProvider
- `tests/adapters/providers/github.test.ts` — mocked GitHub REST calls
- `tests/adapters/providers/gitlab.test.ts` — mocked GitLab REST calls
- `tests/state/pat-storage.test.ts` — sessionStorage round-trip

---

## 4. ERS-level changes (recorded for traceability)

The following ERS sections were rewritten alongside this PR. They are
documented in `docs/ers.md` and summarised here for changelog readers.

### 4.1 Removed constraints

- **C-2 (no remote writes):** dropped. The remote is now writable.
- **C-5 (CORS proxy required):** dropped. Provider REST APIs ship
  permissive CORS.
- **NFR-2 amendment:** the PAT may now live in `sessionStorage`
  (session-scoped, cleared on tab close / sign-out) instead of
  memory only. Documented as an explicit relaxation of the v0 rule.

### 4.2 New constraints

- **C-2' (revised):** the app never force-pushes, never merges the
  edit branch elsewhere, never deletes the edit branch from the app.
- **C-7:** adding a new provider requires implementing
  `RepoProvider` and registering it in `providers/registry.ts`.

### 4.3 Rewritten requirements

- **FR-5** rewritten from "Remote Read-Only Mode" to "Remote Edit
  Mode" with PAT scope verification, orphan-branch creation,
  and `quill-md` as the default destination.
- **FR-10** rewritten from "IndexedDB cache for remote mode" to
  "IndexedDB snapshot of remote read state, with delta-fetch on
  reopen".
- **FR-12** dropped (replaced by FR-12' below).
- **FR-16 (new):** Remote commit lifecycle — per-save commits,
  debounced Kanban batched commits, optimistic concurrency,
  commit message format, author identity derivation, pending-write
  indicator, error preservation on failure.
- **FR-17 (new):** Edit-branch advisory — Remote Setup Wizard,
  recommended "dedicated repository" guidance, persistent advisory
  banner, branch initialization as orphan.

### 4.4 New acceptance criteria

Each of FR-5, FR-16, FR-17 has a corresponding row in
`docs/ers.md` §8.

---

## 5. Architectural notes that may surprise readers

### 5.1 Readonly → writable split

The previous type system used a `ReadOnlyDirectoryAdapter` |
`WritableDirectoryAdapter` split to make "remote mode is read-only"
a compile-time fact. That split is preserved for backwards
compatibility, but the `WritableDirectoryAdapter` interface is now
implemented by the remote adapter too. Service-layer
`requireWritable` checks no longer distinguish between local and
remote; they only distinguish between "an adapter is bound" and
"no adapter is bound".

### 5.2 PAT lifetime

The PAT survives a page refresh now — it lives in
`sessionStorage` under `quill-md.remote-pat`. The session metadata
(provider id, URL, edit branch, display name, author login) is
stored alongside it under `quill-md.remote-session`. Both are
dropped on `signOut` and on tab close.

The PAT is still **never** written to IndexedDB, `localStorage`,
URLs, or any non-namespaced key. The previous v0 contract
"memory only" was relaxed to "session-scoped only" because the
read flow's silent-restore UX (refresh / tab return without
re-prompting) needed it.

### 5.3 Optimistic concurrency

Every write carries the blob SHA the app last read (or the file's
last commit SHA on GitLab, which is what GitLab's API expects).
The provider rejects with 409 (GitHub) or 409/412 (GitLab) on
mismatch. The app surfaces this as `RemoteConflictError` on the
editor / Kanban toolbar so the user can "Pull to refresh" and
retry.

### 5.4 Kanban debouncing

Multiple Kanban drags within a 2-second window coalesce into one
`commitBatch` call. The toolbar shows the pending count + a "Push
now" button that flushes immediately. A failed flush keeps the
queue intact and surfaces the error so the user can retry without
losing drag history.

### 5.5 Orphan branch

The app creates the `quill-md` branch from an empty tree on first
open (GitHub: empty commit + ref; GitLab: branch-from-default +
single no-op commit). This makes the branch's history independent
of `main`. The user is strongly advised to use a dedicated
repository for `.quill.md/` issues so an accidental branch
deletion does not affect code.

---

## 6. Known limitations / follow-ups

1. **GraphQL delta-fetch** — the current implementation uses REST
   - commits-since + tree-recursive. A future commit could swap to
     GraphQL for one-shot delta queries; the `RepoProvider`
     interface already accommodates this.
2. **Self-hosted providers** — the home-screen dropdown has entries
   for "GitHub Enterprise" and "Self-hosted GitLab", but the
   `customBaseUrl` plumbing is minimal. Full support for branch
   protection rule creation on self-hosted is out of scope.
3. **OAuth flow** — the app uses PAT only. OAuth App flows
   (GitHub OAuth App, GitLab OAuth) are out of scope.
4. **Pending-write queue persistence** — pending writes do NOT
   survive a refresh / tab close. A user who closes the tab loses
   unsaved Kanban drags. Future work: persist the queue in
   IndexedDB.
5. **Conflict UX during Kanban debounce** — when a flush fails with
   `RemoteConflictError`, the queue is preserved and the user must
   "Pull to refresh" from the toolbar before retrying. Per-card
   conflict retry / "force push" affordances are out of scope.
6. **CSP for self-hosted providers** — the bundled CSP allowlist
   covers only GitHub.com, GitLab.com, and `*.githubusercontent.com`.
   Self-hosted users must run the app on a host with a relaxed CSP
   or self-host the app too.
7. **LightningFS-style offline reads** — the IndexedDB snapshot
   helps on reopen, but the app is still online-only at the
   open step (a network call is needed to discover the latest
   SHA and fetch deltas).

## 7. UI cut-over (post-migration)

The Strategy migration shipped with the lower layers complete
(`RepoProvider`, `CommitQueueStore`, orphan-branch creation,
`RemoteFileChange`) but the UI was still v0 read-only — the
`/remote` route mounted a refresh-only `RemoteToolbar`, Save /
Discard / Delete buttons in `EditorPanel` were disabled, and
KanbanView rejected drag input in remote mode. The cut-over in
this repo completes the migration on the UI side:

1. **New `RemoteWritableAdapter`** (`src/lib/adapters/remote-writable.ts`)
   implements `WritableDirectoryAdapter` over a read-only snapshot,
   delegating reads to the snapshot and queueing writes through
   the singleton `CommitQueueStore`. The adapter maintains an
   in-memory overlay so in-flight edits are visible to
   `parseIssueFile` before the queue flushes.
2. **`ModeStore` owns the queue lifecycle.** `openRemote` builds
   the writable adapter and starts the queue; `refreshRemote`
   rebuilds the adapter and re-arms the queue with the new parent
   SHA (pending writes survive); `signOut` stops the queue and
   drops the PAT. The queue is exposed as `ModeStore.commitQueue`
   so the toolbar (pending-depth badge, conflict Alert) and the
   editor (per-save flush bypassing the debounce) can read it.
3. **`EditToolbar` is the unified toolbar for both Local and
   Remote modes.** The legacy `LocalToolbar.svelte` and
   `RemoteToolbar.svelte` were deleted. Both `/local` and `/remote`
   mount `EditToolbar`. Remote-only surfaces: provider pill,
   edit-branch label, pending-depth badge, "Push now", PAT prompt
   on Refresh, "Sign out". Local-only surface: trash count + Empty.
4. **Editor and Kanban are fully writable in remote mode.**
   Save / Discard / Delete always render in `EditorPanel`; a
   deferred `RemoteConflictError` surfaces inline as an Alert so
   the user does not have to close the panel. KanbanView's drag
   handlers route through `adapter.writeTextFile` which enqueues;
   the debounce coalesces multiple drags into one `commitBatch`.
5. **`i18n` strings updated.** `modeBadge.remote` → `'Remote'`;
   `localToolbar.*` and `remoteToolbar.*` collapsed into
   `editToolbar.*`; read-only tooltips deleted.

The ERS v3.0 spec is now fully realised end-to-end: FR-5
(Remote Edit Mode), FR-16 (commit lifecycle), and FR-17 (edit-branch
advisory) all have working implementations at every layer.
