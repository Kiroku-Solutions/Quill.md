# Wiki & ADR Subfolders Migration Plan

## 1. Overview

This document outlines the migration plan to support nested subfolders for Wiki pages and ADRs (Architecture Decision Records) inside `.quill.md/wiki/` and `.quill.md/adr/`. The goal is to provide an "S+ tier wiki" experience (similar to Notion or Redmine), allowing users to hierarchically organize their documentation.

## 2. Design Decisions & Rationale

### 2.1 UI Presentation: Nested Collapsible Tree

**Decision:** We will implement a nested, collapsible tree view in the sidebar for Wiki and ADR pages, rather than a flat list with long path strings (e.g., `architecture/backend/db.md`).
**Rationale:** An S+ tier documentation system requires intuitive navigation. As the number of documents grows, a flat list becomes cluttered and difficult to read. A collapsible tree aligns with modern UX standards (e.g., VS Code explorer, Notion), allowing users to expand only the sections they are currently working on.

### 2.2 Remote Mode Fetching: REST Tree API (`recursive=1`)

**Decision:** For the GitHub Remote Provider, we will switch from using the GraphQL `entries` query for traversing directories to the GitHub REST Tree API with the `recursive=1` flag.
**Rationale:** GraphQL requires statically defining the exact depth of the tree to fetch, which forces a hard limit (e.g., max 3 subfolders deep) and creates a bulky, rigid query. The REST Tree API allows us to fetch the entire `.quill.md` tree metadata in a single, fast request, supporting infinite depth gracefully. This ensures our nested wiki structure has no arbitrary limits.

## 3. Implementation Steps

### Phase 1: Storage & Adapter Layer Updates

1. **Extend `DirectoryAdapter`**: Update the `ReadOnlyDirectoryAdapter` interface in `src/lib/adapters/directory-adapter.ts` to support `listDirectory(path, { recursive: true })`. Update `DirectoryEntry` to include the `path` relative to the search root.
2. **Local File System**: Update `LocalFsAdapter` to recursively walk `FileSystemDirectoryHandle` when the recursive flag is passed.
3. **Memory File System**: Update `MemoryFsAdapter` to correctly traverse and return nested items.

### Phase 2: Remote Providers

1. **GitHub Provider (`github.ts`)**:
   - Modify `fetchProviderState` to utilize the GitHub REST API (`octokit.rest.git.getTree({ ..., recursive: 'true' })`) for the tree metadata instead of the shallow GraphQL tree query.
   - Parse the flat recursive tree array and map it to our internal `MemoryFsAdapter` so that `listDirectory(..., { recursive: true })` works identically in local and remote modes.
2. **GitLab Provider (`gitlab.ts`)**:
   - Ensure the GitLab tree fetch also uses a recursive fetch strategy `recursive=true`.

### Phase 3: UI and UX (Svelte Components)

1. **Sidebar Tree Component**: Create a recursive component (or modify the existing list in `WikiView.svelte` / `AdrView.svelte`) to render directories as collapsible folders.
2. **File Creation**: Update the "New Page" prompt to allow slashes (e.g., `features/authentication/setup`). The `LocalFsAdapter`'s `writeTextFile` already handles auto-creating parent directories.
3. **Data Loading**: Update the `loadFiles()` calls in both views to pass the `{ recursive: true }` parameter to `adapter.listDirectory`.

## 4. Rollout and Backwards Compatibility

- **Existing Repositories**: Existing flat files in `.quill.md/wiki/` will continue to work perfectly and will simply appear at the root level of the new tree view.
- **Remote Caching**: No cache invalidation is explicitly required, but Remote Mode will automatically pick up the new tree structure on its next synchronization.
