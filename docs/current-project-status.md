# Current Project Status — AgnosticIssuer

> Last updated at end of **Step 4** of the v0 plan.
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
| 5   | State layer (runes-based stores)                                                                                  | Pending  |
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
| `src/lib/services/config-loader.ts`     | `loadConfig(adapter)` — reads `.agnostic-issuer/config.json`, validates shape, throws an actionable error per FR-3.                                                                                                     |
| `src/lib/services/template-loader.ts`   | `loadTemplates(adapter)` — reads every `*.json` under `.agnostic-issuer/templates/`, validates shape.                                                                                                                   |
| `src/lib/services/issue-loader.ts`      | `loadIssues(adapter)` — reads every `*.md` under `.agnostic-issuer/issues/`, parses each via `parseIssueFile`. Missing directory is treated as empty set.                                                               |
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

- **Partial clone via tree walk.** isomorphic-git's `filepaths` filter isn't stable, so we fetch with `depth:1 + singleBranch` and then walk `git.TREE({ref: 'HEAD'})` to extract only the `.agnostic-issuer/` subtree into a clean directory (Step 3 §3.5).
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

## Deviations from the plan

Two small additions beyond the plan text:

- Added `padIssueId` as an exported helper (separate from `buildIssueFilename`) so step 4's renamer can reuse it.
- Added `verifyIntegrity` and `stripIntegrityHashLine` as exported helpers so the adapter layer (step 4) and the future integrity-warning banner can reuse them without re-implementing the regex.

## Open issues (carry into later steps)

- `local-fs.ts` and `handle-store.ts` are not yet exercised by `pnpm coverage` because they run only in the `client` project (which doesn't enable coverage instrumentation by default). A future polish item.
- Buffer polyfill for production browser builds lands with Step 6's Remote Mode UI.
- Cosmetic YAML divergences from the ERS example (date quoting, flow vs block style) — leave as-is for v0, address in a polish pass if desired.

## Next step

**Step 5 — State layer.** Build the runes-based stores that consume the adapters and services:
