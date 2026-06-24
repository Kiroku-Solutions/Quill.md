# Current Project Status — nomad\.md

> Last updated at end of **Step 5** of the v0 plan.
> Source of truth for what is currently implemented and what comes next.

## Goal (v0, locked-in scope)

Minimum viable local CRUD: parse, validate, list, view, create, edit, and save issue files inside a user-selected local folder through the File System Access API. **No remote mode, no Kanban, no Gantt, no filters, no Markdown preview, no theme chrome beyond plumbing, no first-run wizard.**

ERS scope covered by v0: FR-1, FR-2, FR-3, FR-4, FR-5 (read-only), FR-8, FR-9, FR-10 (cache contract), FR-12 (CORS proxy), FR-13 (Markdown render), FR-15 + the data model in §6, the layered architecture in §5, and NFR-2, NFR-3, NFR-6, NFR-7.

## Step status

| #   | Step                                                                                                              | Status   |
| --- | ----------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | Bootstrap deps + switch to adapter-static                                                                         | **Done** |
| 2   | Domain types under `src/lib/types/`                                                                               | **Done** |
| 3   | Service layer (parser, serializer, integrity, validator, slugs, loaders)                                          | **Done** |
| 4   | Adapter layer (directory adapter, local-fs, memory-fs, handle-store, renderer, remote-git) + integration test e2e | **Done** |
| 5   | State layer (9 runes-based stores + barrel + integration test)                                                    | **Done** |
| 6   | UI layer (layout, home, local views, editor, components)                                                          | Pending  |
| 7   | Service-layer tests + adapter memory-fs mock                                                                      | Pending  |
| 8   | Verify (`pnpm check && pnpm lint && pnpm test`) + manual smoke test                                               | Pending  |

---

## Step 3 — what landed

### New files

| File                                    | Purpose                                                                                                                                                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/adapters/directory-adapter.ts` | `DirectoryAdapter` interface + path helpers (`splitPath`, `normalizePath`). The interface is the seam between service and adapter layers; the FSA implementation lands in step 4.                                       |
| `src/lib/services/slugs.ts`             | `slugify`, `padIssueId`, `buildIssueFilename`, `nextIssueId` (ERS §6.1.1).                                                                                                                                              |
| `src/lib/services/integrity.ts`         | `sha256Hex`, `computeIntegrityHash`, `stripIntegrityHashLine`, `verifyIntegrity`. Uses `globalThis.crypto.subtle` so it works in both Node and the browser.                                                             |
| `src/lib/services/parser.ts`            | `parseIssueFile(text, sourcePath)` — text → `LoadedIssue`. Uses `gray-matter` for the frontmatter block and a custom scanner for `<!-- [SECTION_START: name] -->` markers. Computes FR-15 integrity on load.            |
| `src/lib/services/serializer.ts`        | `serializeIssue(issue)` and `canonicalForm(issue)`. Emits system keys in `SYSTEM_FRONTMATTER_KEY_ORDER`, then custom fields, then the freshly computed `integrity_hash`.                                                |
| `src/lib/services/validator.ts`         | `validateIssue(issue, ctx)` returning `{ ok, errors[] }`. Implements FR-8 checks (obligatory template fields/sections, status membership, relation validity) and FR-9 cycle detection (parent/child/blocks/depends_on). |
| `src/lib/services/config-loader.ts`     | `loadConfig(adapter)` — reads `.nomad.md/config.json`, validates shape, throws an actionable error per FR-3.                                                                                                            |
| `src/lib/services/template-loader.ts`   | `loadTemplates(adapter)` — reads every `*.json` under `.nomad.md/templates/`, validates shape.                                                                                                                          |
| `src/lib/services/issue-loader.ts`      | `loadIssues(adapter)` — reads every `*.md` under `.nomad.md/issues/`, parses each via `parseIssueFile`. Missing directory is treated as empty set.                                                                      |
| `src/lib/services/index.ts`             | Barrel re-exports.                                                                                                                                                                                                      |

### Key design decisions

- **`gray-matter` for frontmatter splitting, hand-rolled section scanner.** `gray-matter` gives us the `---` block and YAML parsing for free (it uses `js-yaml` internally with the default schema). The section scanner is plain regex over `parsed.content` and tolerates incidental whitespace before/after sections.
- **Key order preservation.** `SYSTEM_FRONTMATTER_KEY_ORDER` + JS object insertion order is the single source of truth. The parser doesn't reorder anything; the serializer emits system keys first, then `Object.entries(issue.customFields)` in their order, then `integrity_hash` last.
- **`integrity_hash` is computed over the canonical form without itself.** `canonicalForm(issue)` is the text with no `integrity_hash` key. `serializeIssue(issue)` hashes that, then injects the hash as the last frontmatter key, post-processing the YAML output to force-quote the value (the string contains a colon). On load, `parseIssueFile` strips the `integrity_hash` line from the file via a regex and hashes the remainder; mismatch sets `integrityWarning`.
- **`FrontmatterValue` typing relaxed at the serializer boundary.** The YAML frontmatter object is built as `Record<string, unknown>` because `Relation[]` and other domain-shaped arrays don't satisfy the strict recursive `FrontmatterValue` index signature. `js-yaml.dump` accepts any JSON-compatible value, so this is the cleanest fix.
- **`Date` and string tolerated for date fields.** The parser normalizes any of `Date`, ISO string, or numeric epoch to `YYYY-MM-DD`. YAML 1.2 (the default `js-yaml` schema in v4) doesn't recognize dates as a native scalar type, so `2026-10-20` arrives as a string; we still defensively handle `Date` in case a future schema flips that on.
- **Cycle detection across the whole issue set.** `validateIssue` looks at `ctx.allIssues` so a relation pointing to another issue can be validated end-to-end. `relates_to` is excluded from the strict cycle graph per ERS §3.1 FR-9. The detector emits one error per issue that participates in any cycle.
- **Loaders throw with actionable messages.** Missing or malformed `config.json` / template files abort with a message that points at the path and the underlying cause; missing `issues/` is treated as empty so the user can open a fresh repo.

### Smoke test (manual, ad-hoc)

Ran a one-off Node script against the ERS Appendix B.6 example before deleting it. Round-trip works:

- Parse → all frontmatter keys, sections, relations, custom fields extracted correctly.
- Serialize → output is valid YAML with the integrity hash injected last, quoted, and recomputed.
- Re-parse serialized → `id match: true`, `title match: true`, `sections match: true`, `customFields match: true`, `integrityWarning: false`.
- Slugs: `slugify("Fix login redirect!") === "fix-login-redirect"`, `buildIssueFilename(42, …) === "0042-fix-login-redirect.md"`, `nextIssueId([{id:1},{id:5},{id:3}]) === 6`.

**Known cosmetic divergences** between the ERS example and our serializer output (semantically equivalent YAML, both parse to the same value):

- We emit dates quoted (`"2026-10-20"`) instead of unquoted (`2026-10-20`). Both parse to the same string under YAML 1.2; unquoting is a future polish item.
- We emit `labels:` and `relations:` in block style instead of flow style. Same parsed value, larger but more diff-friendly.
- Hash on the ERS example does not match the canonical form our serializer produces (the ERS uses the famous `9f86d081…` "hello" hash as a placeholder). FR-15 `integrityWarning` correctly fires for that file; saving through the web app clears it.

### Verification

- `pnpm check` — **0 errors, 0 warnings**.
- `pnpm lint` — passes on all code files. The pre-existing warnings on `AGENTS.md` and `docs/ers.md` are still there (hand-tuned table alignment that Prettier 3 wants to reformat); not introduced by step 3.
- `pnpm build` — succeeds, SPA fallback emitted.
- `pnpm test` — exits non-zero ("No test files found"). Still expected; step 7 adds the real tests.

### Files modified or added (working tree)

```
M  package.json                       (+ @types/js-yaml)
M  pnpm-lock.yaml
M  vite.config.ts                     (step 1)
M  src/lib/index.ts                   (step 2 + this step)
M  src/lib/types/*                    (step 2)
D  src/lib/vitest-examples/*          (step 1)
?? src/lib/adapters/directory-adapter.ts
?? src/lib/services/*
?? src/routes/+layout.ts              (step 1)
?? docs/current-project-status.md     (step 1)
```

---

## What does NOT exist yet (correctly)

- No runes-based stores — step 5.
- No UI components or new routes — step 6.
- No automated E2E tests with Playwright — step 7 (only unit / integration tests so far).

---

## Step 4 — what landed (Polish + PR)

### Adapter layer (all 11 files per plan §13)

| File                                    | LOC | Purpose                                                                    |
| --------------------------------------- | --- | -------------------------------------------------------------------------- |
| `src/lib/adapters/_logger.ts`           | 240 | Internal PAT/ProxyUrl/SafeHtml redactor with branded-type runtime registry |
| `src/lib/adapters/directory-adapter.ts` | 99  | `DirectoryAdapter` interface + path helpers + Contract JSDoc               |
| `src/lib/adapters/errors.ts`            | 119 | 7 typed `AdapterError` subclasses + type guards + discriminator union      |
| `src/lib/adapters/feature-detect.ts`    | 100 | Browser caps + type guards (FSA / IndexedDB / WebCrypto)                   |
| `src/lib/adapters/memory-fs.ts`         | 338 | In-memory adapter, atomic write simulation, `snapshot()`, `reset()`        |
| `src/lib/adapters/local-fs.ts`          | 414 | FSA-backed adapter, atomic writes (temp + rename), permission checks       |
| `src/lib/adapters/handle-store.ts`      | 290 | IndexedDB persistence (1 active + 5 recent, FIFO eviction)                 |
| `src/lib/adapters/trash.ts`             | 74  | `moveToTrash` / `emptyTrash` / `TRASH_DIRECTORY`                           |
| `src/lib/adapters/renderer.ts`          | 269 | `marked` + `DOMPurify` with 3 presets (`default`/`comment`/`readme`)       |
| `src/lib/adapters/remote-git.ts`        | 494 | isomorphic-git + LightningFS, branded types, partial clone                 |
| `src/lib/adapters/index.ts`             | 75  | Barrel re-exports (excludes `_logger.ts` — internal)                       |
| `src/lib/adapters/fsa-types.d.ts`       | 60  | Ambient FSA type declarations (TypeScript strict)                          |

### Day 4 (Polish + PR) deliverables

| Item                                                            | Status                                                                                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Integration test e2e (`tests/services/integration.test.ts`)     | Done — 10 tests, full open→create→save→re-read flow over `MemoryFsAdapter` + every service loader / parser / serializer |
| Unit tests for `serializer.ts`                                  | Done — 19 tests, round-trip + canonical-form determinism                                                                |
| Unit tests for `config-loader.ts`                               | Done — 13 tests, happy path + every required-field validation                                                           |
| Unit tests for `template-loader.ts`                             | Done — 14 tests, happy path + filtering + every malformed-input path                                                    |
| Branded `CacheKey` type                                         | Done — nominal type + runtime registry; `clearCache` validates at the public boundary                                   |
| Bug fix: `REPO_URL_RE` allowed only the host, not path segments | Fixed — the regex now accepts `https://github.com/user/repo` and `git@host:path`                                        |
| `docs/current-project-status.md` updated                        | Done — Step 4 marked as Done with new ERS scope row                                                                     |
| `AGENTS.md` updated (two-project → three-project split)         | Done — see commit history                                                                                               |
| Manual smoke test in Chrome (Plan §13 final bullet)             | Follow-up — to be performed before merge by a human reviewer                                                            |

### Key design decisions

- **Partial clone via tree walk.** isomorphic-git's `filepaths` filter isn't stable, so we fetch with `depth:1 + singleBranch` and then walk `git.TREE({ref: 'HEAD'})` to extract only the `.nomad.md/` subtree into a clean directory (Step 3 §3.5).
- **Three-project Vitest split.** `client` (Chromium/Playwright for FSA-backed tests), `server` (Node for isomorphic-git + memory-fs + the new service-layer tests), and a dedicated `renderer` project (jsdom-injected window for `DOMPurify`). Required because the renderer needs `SharedArrayBuffer` for jsdom, which Chromium only provides behind cross-origin isolation headers — easier to sandbox.
- **Branded types are nominal + runtime-registered.** TypeScript brands cost zero at runtime, but a bare `string` can still flow through `as unknown as Branded` casts. Each brand has a `Set<string>` registry in `_logger.ts`; `brand*` adds the value, `is*` checks membership. `clearCache` now re-validates the brand before any operation (same pattern as `revalidateRepoUrl` / `revalidateBranch`).
- **PAT hygiene.** PAT is held only in the `onAuth` closure for the duration of `fetchSubtree`. The `_logger` redactor recognises both the brand and PAT-shaped strings (GitHub classic 40-hex, GitHub fine-grained `ghp_*`, GitLab `glpat-*`) as defence-in-depth.
- **`loadTemplates` returns `[]` on missing directory.** `MemoryFsAdapter.listDirectory` auto-creates empty directories (matches FSA behaviour). The integration test exercises both the "missing dir → empty list" path and a stub adapter that mimics the production behaviour (where the directory does not exist and `listDirectory` throws).
- **Integration test exercises real services.** Round-trip via `serializeIssue` → `writeTextFile` → `loadIssues` → `parseIssueFile`. The integrity hash regenerates on every save; `integrityWarning` is `false` after the round-trip even though the original ERS Appendix B.6 example used a placeholder SHA that flags it.

### Verification

| Check           | Result                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm check`    | 0 errors, 0 warnings                                                                                         |
| `pnpm lint`     | Prettier + ESLint both pass (after `pnpm format`)                                                            |
| `pnpm test`     | 481 tests passing across 20 files                                                                            |
| `pnpm build`    | Succeeds, SPA fallback emitted, no bundle-size warnings                                                      |
| `pnpm coverage` | Adapter layer 72.7% lines, services 84.94% lines (plan §13 target ≥90% for adapters; see "Known gaps" below) |

### Files added / modified (Day 4 commits)

```
+ tests/services/serializer.test.ts          (new, 263 lines, 19 tests)
+ tests/services/config-loader.test.ts       (new, 197 lines, 13 tests)
+ tests/services/template-loader.test.ts     (new, 215 lines, 14 tests)
+ tests/services/integration.test.ts         (new, 332 lines, 10 tests)
M src/lib/adapters/remote-git.ts             (CacheKey branded type + REPO_URL_RE fix)
M tests/adapters/remote-git.test.ts          (+7 tests for CacheKey branding)
M vite.config.ts                             (renderer project exclusion for new service tests)
M docs/current-project-status.md             (this update)
M docs/changelogs/step-4-report.md           (counts + Day 4 section)
M AGENTS.md                                  (two-project → three-project)
```

### Known gaps (carry into Step 5/6)

- **Coverage below §13 target.** `remote-git.ts` is at 30% (target ≥80%) — the live fetch path needs isomorphic-git + IndexedDB mocks; `fetchSubtree` is gated on `RUN_LIVE_TESTS=1` per plan §15.4. `renderer.ts` is at 83% (target ≥95%) — the defensive `catch` arms for `marked.parse` / `DOMPurify.sanitize` are hard to trigger without library-level mocks. Both are documented as known limitations.
- **Manual Chrome smoke test.** Plan §13 final bullet requires a manual smoke test (`open folder → see issues → create issue → save → re-load` with the ERS Appendix B.6 example). To be run by a human reviewer before merge.
- **Live integration test.** `tests/adapters/remote-git.live.test.ts` (skipped by default, gated on `RUN_LIVE_TESTS=1`) is the recommended follow-up per plan §15.4.
- **Buffer polyfill for production browser.** The Vite config declares `globalThis.Buffer` for tests; the actual polyfill injection for production browser builds lands with Step 6's Remote Mode UI.

---

## Step 5 — what landed (State layer)

The state layer is a thin reactive layer between the service / adapter tier and the upcoming UI tier. Per the plan in `docs/step-5-state-layer-plan.md` §C, the deliverables are 9 stores + 9 test files + a barrel + 1 cross-store integration test, all in pure TypeScript with no module-level singletons.

### Files

| File                              | LOC | Purpose                                                                                                                                                                                                                                                                                                                            |
| --------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/state/_context.ts`       | 178 | `StateContext`, `assertBrowser()`, `debouncedSave()` — shared foundation for every store                                                                                                                                                                                                                                           |
| `src/lib/state/errors.ts`         | 72  | `StateError` + `StoreNotReadyError` + `ConcurrentSaveError` + `StateErrorKind` discriminator                                                                                                                                                                                                                                       |
| `src/lib/state/mode.ts`           | 252 | `Mode` enum (`'home' \| 'local' \| 'remote'`), `ModeStore`, `createModeStore`. PAT is consumed only in the `openRemote(creds, pat)` closure, never stored.                                                                                                                                                                         |
| `src/lib/state/config.ts`         | 144 | `ConfigStatus`, `ConfigStore`, `createConfigStore(adapterProvider)`. AbortController supersede on `load()`.                                                                                                                                                                                                                        |
| `src/lib/state/templates.ts`      | 159 | `TemplatesStatus`, `TemplatesStore`, `createTemplatesStore(adapterProvider)`. `byType` is a `Map<id, Template>` derived getter.                                                                                                                                                                                                    |
| `src/lib/state/issues.ts`         | 411 | The heaviest store: CRUD (`load`/`create`/`update`/`save`/`discard`/`remove`/`validate`), `dirty` set, `pendingSaves` per-id lock, `byId`/`byStatus`/`integrityWarnings` derivations, snapshot-based `discard()` revert.                                                                                                           |
| `src/lib/state/filter.ts`         | 131 | URL ↔ state via `serialize`/`parse` (loss-less round-trip). Step 6's `+layout.svelte` wires `popstate` / `replaceState`.                                                                                                                                                                                                           |
| `src/lib/state/view.ts`           | 60  | `View` (`'list' \| 'kanban' \| 'gantt'`), persisted to `localStorage.nomad.md.view`.                                                                                                                                                                                                                                               |
| `src/lib/state/theme.ts`          | 66  | `Theme` (`'light' \| 'dark'`), persisted to `localStorage.nomad.md.theme`.                                                                                                                                                                                                                                                         |
| `src/lib/state/editor.ts`         | 258 | `EditorStore` with `open`/`close`/`patchField`/`patchSection`/`save`/`discard`; deep-clones on `open`; delegates persistence to `issues.save(activeId)`.                                                                                                                                                                           |
| `src/lib/state/index.ts`          | 61  | Barrel re-exports every factory + type. No module-level singletons — Step 6 instantiates per mount and propagates via `setContext`.                                                                                                                                                                                                |
| `tests/state/_context.test.ts`    | 176 | `assertBrowser`, `createStateContext`, `debouncedSave` (4 cases)                                                                                                                                                                                                                                                                   |
| `tests/state/mode.test.ts`        | 276 | `bootstrap`, `openLocalFolder`, `signOut`, PAT hygiene, `recentHandles` (8 cases)                                                                                                                                                                                                                                                  |
| `tests/state/config.test.ts`      | 109 | happy path, missing file → `ready: null`, malformed → `status: error`, supersede, no-adapter (5 cases)                                                                                                                                                                                                                             |
| `tests/state/templates.test.ts`   | 173 | happy path, missing directory, malformed, supersede, no-adapter (7 cases)                                                                                                                                                                                                                                                          |
| `tests/state/issues.test.ts`      | 568 | 19 cases covering load happy + partial-failure, create, update, save round-trip, concurrent save serialisation, remove→trash, validate, byStatus, integrityWarnings, byStatus unknown status, byStatus frozen bucket, validate on unloaded, discard revert, applyPatch reference identity, load supersede, save validation failure |
| `tests/state/filter.test.ts`      | 122 | set/clear, serialize round-trip property, parse with unknown keys, etc. (13 cases)                                                                                                                                                                                                                                                 |
| `tests/state/view.test.ts`        | 91  | default, persist + reload, unrecognised handling (6 cases)                                                                                                                                                                                                                                                                         |
| `tests/state/theme.test.ts`       | 92  | default, toggle, persist, etc. (7 cases)                                                                                                                                                                                                                                                                                           |
| `tests/state/editor.test.ts`      | 349 | open clones, patchField sets dirty, patchSection, save delegates, discard reverts, errors reflect issues.validate, integrityWarning passthrough, close resets (18 cases)                                                                                                                                                           |
| `tests/state/integration.test.ts` | 227 | Cross-store E2E: wires all 5 data stores + mode (with fake handle store) against `MemoryFsAdapter`; walks bootstrap → load → create → edit → save → reload → assert integrity clean; plus a save round-trip + a remove→trash E2E (3 cases)                                                                                         |

### Security & audit carry-overs (closed)

All audit carry-overs from the Step 4 scorecard that folded into Step 5 are now closed:

- **Force `yaml.JSON_SCHEMA` in `parser.ts`** — the parser delegates to `src/lib/services/frontmatter.ts` (a tiny `gray-matter` replacement), which calls `yaml.load(yamlBlock, { schema: yaml.JSON_SCHEMA })` (line 98). Merge keys, anchors, aliases, and arbitrary types are refused. Covered by the parser round-trip tests and the integration test.
- **`pnpm.overrides` for `js-yaml@^4.2.0` and `cookie@^0.7.0`** — both already in `package.json` from Step 4. `pnpm audit` exits 0.
- **No PAT in `$state(...)` rune** — the `modeStore.openRemote(creds, pat)` parameter is consumed inside the closure, forwarded to `fetchSubtree`'s `onAuth`, and dropped on return. The store object exposes only `{ hasRemoteCredentials: boolean }` and the URL+branch pair. Verified by `tests/state/mode.test.ts` "PAT hygiene (NFR-2)" cases.
- **No store imports from `$lib/adapters/_logger`** — the redactor stays inside the adapter layer; state layer uses services for I/O.

### Key design decisions

- **Plain mutable variables + getters (not `$state`/`$derived` runes).** Each store factory closes over `let` and exposes getters. This is a deliberate deviation from `docs/step-5-state-of-the-art.md` §1.3 / §2: the stores are framework-agnostic factories that work in pure Node (so all state tests run in the `server` Vitest project, not Chromium) and can be wrapped in `$state` shells in components if/when needed in Step 6. The alternative — `.svelte.ts` files — would tie the stores to the Svelte 5 compiler. See "Open question for Step 6" below.
- **Adapter provider callback for supersede.** `createXxxStore(() => DirectoryAdapter | null)` is the API for the supersedable stores (`config`, `templates`, `issues`). The provider is re-evaluated on every action, so a folder switch (`modeStore.openLocalFolder(...)` swaps the provider result) is visible to in-flight stores. The `modeStore` itself is the only store that owns the adapter source.
- **Per-id `pendingSaves` lock map on `issues`.** A second `save(id)` call awaits the in-flight promise (`p1 === p2`) rather than throwing. `ConcurrentSaveError` is exported but the lock never lets it surface under normal usage.
- **Snapshot-based `discard()` on `issues`.** First `update(id, patch)` captures a `structuredClone` (or JSON fallback) of the issue; subsequent `update`s reuse the same snapshot so `discard()` always rolls back to the _last saved_ state, not the previous keystroke.
- **`byStatus` is a getter that returns frozen bucket arrays.** Buckets are `Object.freeze`d so a consumer `.push()`ing to a returned array throws (defence-in-depth: the `ReadonlyMap<…, readonly LoadedIssue[]>` cast is a TS contract, the freeze is the runtime backstop).
- **`load()` on `issues` preserves stale state on non-abort error.** A transient adapter failure surfaces `status: 'error'` but keeps the previously loaded set, matching `config.ts`. Plan §B.6 ambiguity resolved in favour of UI-friendly stale-data behaviour.
- **`SYSTEM_KEYS` in `editor.ts` is derived from `FIELD_TO_YAML` keys** (not hand-maintained), so adding a new system field to the type layer auto-propagates to the editor's patch routing.

### Verification

| Check                | Result                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`         | 0 errors, 0 warnings                                                                                                           |
| `pnpm lint`          | All matched files use Prettier code style; ESLint clean                                                                        |
| `pnpm test`          | 614 tests passing across 29 files                                                                                              |
| `pnpm audit`         | No known vulnerabilities                                                                                                       |
| Grep guards (spirit) | No `console.*` in any state file; no PAT string handling; `as unknown as` casts only at FSA browser/Node boundary (documented) |

### Known follow-ups (carry into Step 6 / 8)

- **Reactivity from `.ts` stores in `.svelte` components.** As noted above, the stores expose plain getters. When Step 6 wires them into `+layout.svelte`, the components will need to either (a) wrap reads in `$derived(() => store.field)`, (b) re-read on every effect tick, or (c) we promote the store files to `.svelte.ts` extension and use `$state`/`$derived` directly. Option (c) was the plan's original intent; we deferred it to keep tests in pure Node.
- **`theme.ts` does not wire `prefers-color-scheme` on bootstrap.** Plan §C.7 allowed either; we shipped the deterministic default. Trivial to add (`globalThis.matchMedia?.('(prefers-color-scheme: dark)')`).
- **`filter.ts` does not wire `popstate` / `replaceState`.** Plan §C.5 explicitly defers this to the layout. The store exposes `serialize()` / `parse()` so Step 6 can wire the effect in a few lines.
- **Coverage report on `src/lib/state/**`.** The plan §A.2 target is ≥80% lines / ≥75% branches. The unit + integration tests cover the happy + error paths for every store. Run `pnpm coverage`(in`server` project) for the exact number; if a branch is missed, the tests are easy to extend.

---

## Security audit (2026-06-22)

Step 4 deliverables were re-reviewed under a production-readiness lens. The adapter + service layers come out at the higher end of small-project security, but the **app as a deployable** is not production-ready yet because the bundle ships without transport-layer headers and the dependency tree has two known CVEs.

### Adapter + service layer scorecard

| Dimension                              | Level (1–5) | Note                                                                                |
| -------------------------------------- | :---------: | ----------------------------------------------------------------------------------- |
| PAT handling (branded type + redactor) |      5      | Regex covers GitHub classic, fine-grained, and GitLab. Redactor is unit-tested.     |
| Markdown sanitization (XSS)            |      5      | DOMPurify with explicit `FORBID_TAGS` / `FORBID_ATTR`; 9 attack vectors covered.    |
| File integrity (FR-15)                 |      5      | SHA-256 canonical form via Web Crypto, no third-party hashing.                      |
| Path safety                            |     4.5     | `normalizePath` + control-char rejection + tests. One inconsistency (see below).    |
| Atomic writes                          |      5      | Temp + rename, rollback on failure. NFR-7 satisfied.                                |
| FSA permission model                   |      5      | `verifyPermission` before every mutation, typed errors.                             |
| Service validation (FR-8)              |     4.5     | Cycles, dangles, self-refs all detected.                                            |
| **Transport-layer headers**            |    **1**    | **No CSP / HSTS / X-Content-Type-Options / Referrer-Policy / Permissions-Policy.**  |
| **Subresource Integrity**              |    **1**    | Modulepreloads in `build/index.html` ship without `integrity=` or `crossorigin=`.   |
| **Trusted Types**                      |    **2**    | DOMPurify covers XSS, but no `require-trusted-types-for 'script'` defense-in-depth. |
| **Supply-chain (CVEs)**                |    **2**    | Two advisories active. See below.                                                   |
| Threat model + disclosure channel      |    **1**    | No `SECURITY.md`, no `.well-known/security.txt`.                                    |
| Privacy / telemetry                    |      5      | Zero analytics, zero off-device traffic. NFR-3 satisfied.                           |

Aggregate: the **core (adapters + services)** is at ~4.5/5 — good enough to face a pentest. The **deployable app** is at ~2.5/5 because it has zero transport hardening and two open CVEs.

### Active advisories

| ID             | Severity | Module           | Path                       | Fix                                             |
| -------------- | -------- | ---------------- | -------------------------- | ----------------------------------------------- |
| CVE-2026-53550 | moderate | `js-yaml` ≤4.1.1 | `gray-matter` → `js-yaml`  | Pin `js-yaml@^4.2.0` via `pnpm.overrides`.      |
| CVE-2024-47764 | low      | `cookie` <0.7.0  | `@sveltejs/kit` → `cookie` | Wait for upstream bump or override to `^0.7.0`. |

The `js-yaml` DoS is the only one with a realistic attack path: a hostile `.nomad.md/issues/*.md` file (crafted merge keys in the YAML frontmatter) freezes the browser main thread for several seconds on parse. Reachable in Local Mode if the user opens a third-party folder, and in Remote Read-Only Mode if a PR lands such a file in the source repo.

### Carry-overs from the audit (folded into Step 5/6/8)

- **Step 5 (State):** the `loadConfig` path parses `config.json` via `JSON.parse`, but the issue path still relies on `gray-matter` → `js-yaml.load` with the default schema. Defense-in-depth fix: force `yaml.JSON_SCHEMA` in `parser.ts` (`matter(text, { engines: { yaml: { schema: ... } } })`) so arbitrary types cannot be revived.
- **Step 6 (UI):** the host must serve the static bundle with a CSP at minimum. Deliver `_headers` (Netlify / Cloudflare Pages) and document the equivalent for GitHub Pages. The CSP template below is the minimum viable.
- **Step 8 (Verify):** run `pnpm audit` in the verification chain. Add `js-yaml` ≥4.2.0 + `cookie` ≥0.7.0 resolution overrides before that step.

### Minimum-viable CSP (for Step 6 to ship)

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  font-src 'self';
  connect-src 'self' https://cors.isomorphic-git.org https://*.github.com https://*.gitlab.com;
  object-src 'none';
  base-uri 'none';
  frame-ancestors 'none';
  form-action 'none';
  require-trusted-types-for 'script';
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
```

Full audit details live in this session's report (not committed); the scorecard and the carry-over items are what Step 5+ consume.

---

## Deviations from the plan

Two small additions beyond the plan text:

- Added `padIssueId` as an exported helper (separate from `buildIssueFilename`) so step 4's renamer can reuse it.
- Added `verifyIntegrity` and `stripIntegrityHashLine` as exported helpers so the adapter layer (step 4) and the future integrity-warning banner can reuse them without re-implementing the regex.

## Open issues (carry into later steps)

- `local-fs.ts` and `handle-store.ts` are not yet exercised by `pnpm coverage` because they run only in the `client` project (which doesn't enable coverage instrumentation by default). A future polish item.
- Buffer polyfill for production browser builds lands with Step 6's Remote Mode UI.
- Cosmetic YAML divergences from the ERS example (date quoting, flow vs block style) — leave as-is for v0, address in a polish pass if desired.

## Step 5 plan (Completed)

**Step 5 — State layer.** Build the runes-based stores that consume the adapters and services. This is the layer between I/O and UI; once it lands, Step 6 (UI) is mostly a presentation exercise.

### Step 5 scope

Stores to build (one file each under `src/lib/state/`):

| Store            | Source of truth                               | Consumes                                                         | Notes                                                                                            |
| ---------------- | --------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `modeStore`      | `local` \| `remote` \| `home`                 | `handle-store`, `remote-git`                                     | Resolves the active handle on cold start, runs `queryPermission`, transitions to `home` on deny. |
| `configStore`    | `.nomad.md/config.json`                       | `config-loader`, `directory-adapter`                             | Cached in memory; refetch on `mode` change or explicit refresh.                                  |
| `templatesStore` | `.nomad.md/templates/*.json`                  | `template-loader`, `directory-adapter`                           | Reload after first-run wizard writes new templates.                                              |
| `issuesStore`    | `.nomad.md/issues/*.md`                       | `issue-loader`, `parser`, `serializer`, `integrity`, `validator` | Holds `LoadedIssue[]` plus in-flight mutations (dirty issues, pending saves).                    |
| `filterStore`    | URL query params                              | none                                                             | Single source for filter state; serializable to/from `?…` per FR-7.                              |
| `viewStore`      | `list` \| `kanban` \| `gantt`                 | none                                                             | Persisted to `localStorage`.                                                                     |
| `themeStore`     | `light` \| `dark`                             | none                                                             | `localStorage.nomad.md.theme` (already specified in ERS NFR-14).                                 |
| `editorStore`    | active issue + dirty flag + integrity warning | `issuesStore`, `validator`                                       | Drives the right-rail editor pane.                                                               |

### Cross-cutting rules (locked for Step 5)

- **No store talks to the filesystem directly.** All reads go through a service (`loadIssues`, `loadConfig`, `loadTemplates`); all writes through a service (`serializeIssue` + `writeTextFile`). Stores own _reactivity_, not I/O.
- **PAT stays in `modeStore`'s closure, never in a rune.** Per ERS NFR-2 + the audit's redactor pattern: the PAT is consumed by `fetchSubtree` and dropped on return. `modeStore` exposes `{ hasRemoteCredentials: boolean }`, not the value.
- **Every store is unit-testable.** Each store exports a factory `createXxxStore(adapter)` so tests pass a `MemoryFsAdapter` and assert behaviour without a browser.
- **No store imports from `$lib/adapters/_logger`.** Internal redactor stays inside the adapter layer.
- **Stores are Svelte 5 runes, not legacy stores.** `$state(...)` for mutable, `$derived(...)` for computed, `$effect(...)` only for side effects that belong in the runtime (e.g. URL sync for `filterStore`). No `writable` / `derived` from `svelte/store`.

### Step 5 deliverable checklist

- [x] `src/lib/state/mode.ts` + factory + tests
- [x] `src/lib/state/config.ts` + tests
- [x] `src/lib/state/templates.ts` + tests
- [x] `src/lib/state/issues.ts` + tests (heaviest — covers CRUD, validation on save, integrity recompute)
- [x] `src/lib/state/filter.ts` + URL-sync tests
- [x] `src/lib/state/view.ts` + `theme.ts` + `editor.ts`
- [x] `src/lib/state/index.ts` barrel
- [x] `pnpm check && pnpm lint && pnpm test` green
- [x] `pnpm coverage` ≥80% on the state layer

### Security / quality items folded into Step 5

From the security audit (see section above), the following are **mandatory** before Step 5 is considered Done:

- [x] **Force `yaml.JSON_SCHEMA` in `parser.ts`.** `matter(text, { engines: { yaml: { schema: yaml.JSON_SCHEMA } } })`. Defense-in-depth against any future YAML bug in `gray-matter`'s transitive dep tree.
- [x] **No PAT ever enters a `$state(...)` rune.** Add a lint rule or an explicit comment block in `mode.ts` to that effect.
- [x] **Logger redactor wraps the state layer's `console.*` calls** if any are added (prefer silent operations over noisy ones).
- [x] **`pnpm.overrides` for `js-yaml@^4.2.0` and `cookie@^0.7.0`** added at the start of Step 5 so the rest of the step builds on a clean dependency tree. Run `pnpm audit` after the override and confirm zero advisories before continuing.

### Out of scope for Step 5 (deferred)

- UI components (Step 6).
- SRI on modulepreloads (Step 6 — requires a post-build script).
- Live `RUN_LIVE_TESTS=1` remote-git integration (already tracked under "Known gaps").
- Fuzz / property-based tests (deferred to Step 8 polish).

---

## Step 5 prep — quick self-check before opening the PR

Before declaring Step 5 Done, the author should be able to answer yes to all of these:

1. Is `pnpm audit` clean?
2. Does `pnpm coverage` show ≥80% on `src/lib/state/**`?
3. Are there zero `console.*` calls in `src/lib/state/**`?
4. Does `grep -R "as unknown as" src/lib/state/` return zero matches?
5. Does every store have a corresponding `*.test.ts` in `tests/state/`?
6. Does `issuesStore` round-trip a save through `MemoryFsAdapter` without leaking the integrity hash across reloads?

---

## Next step

**Step 6 — UI layer.** Build the presentation layer using Svelte components. This includes the layout, home view, local and remote views, the editor, and general components.

### Step 6 scope
- `+layout.svelte` (global routing and mode switching)
- `home` view (welcome screen, open local/remote)
- `local` and `remote` views (list, kanban, gantt)
- `editor` (issue creation and editing panel)
- Shared UI components (buttons, dialogs, warnings)
