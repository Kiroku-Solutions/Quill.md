# Step 4 — Adapter Layer Implementation Plan

## Overview

Refactor `IssueStore` to use a `DirectoryAdapter` interface, enabling ERS (Local Edit Mode) and RRS (Remote Read-Only Mode via `isomorphic-git`) through swappable storage backends.

**Owner:** Mavis team (3 agents)
**Start:** 2026-06-22

---

## Deliverables

| Day   | Scope                                                                                         | Est. LOC | Status     |
| ----- | --------------------------------------------------------------------------------------------- | -------- | ---------- |
| **1** | Foundations: `errors.ts`, `feature-detect.ts`, `directory-adapter.ts`, `memory-fs.ts` + tests | ~1,200   | ✅ Done    |
| **2** | `LocalFsAdapter` (File System Access API), `handle-store.ts` (IndexedDB), `trash.ts` + tests  | ~1,200   | ⏳ Next    |
| **3** | `GitAdapter` (isomorphic-git) + sync engine                                                   | ~800     | 🔲 Pending |
| **4** | Adapter factory + migration from legacy `IssueStore`                                          | ~600     | 🔲 Pending |
| **5** | Integration: CLI bridge + E2E wizard preview                                                  | ~500     | 🔲 Pending |

---

## Day 1 — Foundations ✅

### Goals

- Establish typed error system
- Detect browser capabilities
- Define `DirectoryAdapter` interface + path helpers
- Implement `MemoryFsAdapter` (in-memory, deterministic, testable)
- Hardened pipeline: 0 errors, full coverage on adapter layer

### Files

| File                                    | LOC  | Purpose                                         |
| --------------------------------------- | ---- | ----------------------------------------------- |
| `src/lib/adapters/errors.ts`            | ~120 | 7 typed `AdapterError` subclasses               |
| `src/lib/adapters/feature-detect.ts`    | ~80  | Browser caps + 4 type guards                    |
| `src/lib/adapters/directory-adapter.ts` | ~100 | Interface + path helpers + Contract JSDoc       |
| `src/lib/adapters/memory-fs.ts`         | ~340 | In-memory adapter, atomic write, limits, guards |
| `src/lib/services/validator.ts`         | ~150 | Cycle detection, `relates_to` rules             |
| `tests/adapters/errors.test.ts`         | ~100 | Error class tests                               |
| `tests/adapters/feature-detect.test.ts` | ~100 | Feature detection tests                         |
| `tests/adapters/memory-fs.test.ts`      | ~700 | Adapter tests                                   |
| `tests/services/validator.test.ts`      | ~200 | Cycle + validation tests                        |

### Testing & Coverage

- `pnpm check && pnpm lint && pnpm test` green
- `@vitest/coverage-v8` with adapter-layer target ≥ 95%
- Client project (Playwright): `feature-detect.test.ts`
- Server project (Vitest): all others

### Hardening (post-audit)

- `moveFile(x, x)` guard prevents silent data loss
- `writeTextFile` rejects existing directories
- Bounded growth via `maxFileSize` (10 MiB) + `maxEntries` (10K)
- Control-char validation in `normalizePath`
- `instanceof` + discriminator assertions in error tests
- Cycle detection with full-path error messages
- JSDoc "Contract" section in `directory-adapter.ts`

---

## Day 2 — Browser Storage Adapters ⏳

### Goals

- Implement `LocalFsAdapter` using File System Access API
- `handle-store.ts` persists file handles in IndexedDB
- `trash.ts` wraps `DirectoryAdapter` for soft-delete
- All adapters inherit same contract — no adapter-specific UI code

### Files

| File                                  | LOC  | Purpose                                 |
| ------------------------------------- | ---- | --------------------------------------- |
| `src/lib/adapters/local-fs.ts`        | ~280 | File System Access API adapter          |
| `src/lib/adapters/handle-store.ts`    | ~220 | IndexedDB handle persistence            |
| `src/lib/adapters/trash.ts`           | ~60  | Trash functions over `DirectoryAdapter` |
| `tests/adapters/local-fs.test.ts`     | ~300 | Adapter contract tests                  |
| `tests/adapters/handle-store.test.ts` | ~200 | IndexedDB persistence tests             |
| `tests/adapters/trash.test.ts`        | ~100 | Trash logic tests                       |

### Key Decisions (pre-discussed)

- `LocalFsAdapter` uses `showDirectoryPicker()` — requires user gesture (safe by default)
- Handles cached in IndexedDB via `handle-store.ts` — survives page reload
- Permission persisted via `queryPermission()` / `requestPermission()` flow
- `trash.ts` stores metadata in `/.agnostic-issuer/.trash/manifest.json`

---

## Day 3 — Git Adapter + Sync

### Goals

- `GitAdapter` using `isomorphic-git`
- Read-only access to `.ag Issuerrc` + issue files in a local git repo
- Sync engine: pull remote changes, detect conflicts, queue uploads
- RRS (Remote Read-Only Mode) fully functional

### Files

| File                                 | LOC  | Purpose                      |
| ------------------------------------ | ---- | ---------------------------- |
| `src/lib/adapters/git-adapter.ts`    | ~400 | isomorphic-git wrapper       |
| `src/lib/services/sync-engine.ts`    | ~250 | Pull/push/conflict detection |
| `tests/adapters/git-adapter.test.ts` | ~350 | Git adapter tests            |

---

## Day 4 — Adapter Factory + Migration

### Goals

- `AdapterFactory` detects capabilities and returns appropriate adapter
- `useAdapter()` Svelte store wiring into existing `IssueStore`
- Migration path: copy existing `.ag Issuerrc` data into new adapter-backed store
- Backwards-compatible — existing data survives

### Files

| File                              | LOC  | Purpose                               |
| --------------------------------- | ---- | ------------------------------------- |
| `src/lib/adapters/factory.ts`     | ~100 | AdapterFactory + capability detection |
| `src/lib/stores/adapter-store.ts` | ~150 | Svelte store bridging                 |
| `src/lib/services/migrator.ts`    | ~200 | Legacy → new adapter migration        |
| `tests/adapters/factory.test.ts`  | ~150 | Factory tests                         |

---

## Day 5 — Integration + CLI + E2E

### Goals

- CLI bridge: `agnostic-issuer open`, `agnostic-issuer sync`
- E2E wizard preview using `LocalFsAdapter`
- Smoke tests for full user flow
- Documentation: README updated with new architecture

### Files

| File                       | LOC  | Purpose                     |
| -------------------------- | ---- | --------------------------- |
| `src/lib/cli/commands.ts`  | ~200 | CLI command definitions     |
| `tests/e2e/wizard.test.ts` | ~300 | Playwright E2E tests        |
| `README.md`                | ~100 | Architecture section update |

---

## Definitions

### DirectoryAdapter Contract (summary)

- Path separator: `/` (always normalized internally)
- Character set: printable ASCII + Unicode (control chars rejected)
- Root: `/` (virtual, always present)
- File vs Directory: distinguished by `files` vs `directories` Sets
- Atomicity: reads see complete old or complete new state
- Concurrency: not safe — caller must serialize
- Self-move: no-op (source returned, no state change)
- Errors: typed `AdapterError` subclasses, never thrown raw

### Adapter Types

| Adapter           | Storage                           | Access     | Persistence  |
| ----------------- | --------------------------------- | ---------- | ------------ |
| `MemoryFsAdapter` | In-memory Map                     | Read/Write | Session-only |
| `LocalFsAdapter`  | Browser File System Access API    | Read/Write | User-managed |
| `GitAdapter`      | Local git repo via isomorphic-git | Read-only  | Git-managed  |

---

_Plan created: 2026-06-22_
_Last updated: 2026-06-22 (Day 1 complete)_
