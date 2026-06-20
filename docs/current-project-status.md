# Current Project Status — AgnosticIssuer

> Last updated at end of **Step 3** of the v0 plan.
> Source of truth for what is currently implemented and what comes next.

## Goal (v0, locked-in scope)

Minimum viable local CRUD: parse, validate, list, view, create, edit, and save issue files inside a user-selected local folder through the File System Access API. **No remote mode, no Kanban, no Gantt, no filters, no Markdown preview, no theme chrome beyond plumbing, no first-run wizard.**

ERS scope covered by v0: FR-1, FR-2, FR-3, FR-4, FR-8, FR-9, FR-15 + the data model in §6, the layered architecture in §5, and NFR-2, NFR-3, NFR-6, NFR-7 (the parts that apply to local mode).

## Step status

| # | Step | Status |
|---|---|---|
| 1 | Bootstrap deps + switch to adapter-static | **Done** |
| 2 | Domain types under `src/lib/types/` | **Done** |
| 3 | Service layer (parser, serializer, integrity, validator, slugs, loaders) | **Done** |
| 4 | Adapter layer (directory adapter, local-fs, memory-fs, handle-store, renderer) | Pending |
| 5 | State layer (runes-based stores) | Pending |
| 6 | UI layer (layout, home, local views, editor, components) | Pending |
| 7 | Service-layer tests + adapter memory-fs mock | Pending |
| 8 | Verify (`pnpm check && pnpm lint && pnpm test`) + manual smoke test | Pending |

---

## Step 3 — what landed

### New files

| File | Purpose |
|---|---|
| `src/lib/adapters/directory-adapter.ts` | `DirectoryAdapter` interface + path helpers (`splitPath`, `normalizePath`). The interface is the seam between service and adapter layers; the FSA implementation lands in step 4. |
| `src/lib/services/slugs.ts` | `slugify`, `padIssueId`, `buildIssueFilename`, `nextIssueId` (ERS §6.1.1). |
| `src/lib/services/integrity.ts` | `sha256Hex`, `computeIntegrityHash`, `stripIntegrityHashLine`, `verifyIntegrity`. Uses `globalThis.crypto.subtle` so it works in both Node and the browser. |
| `src/lib/services/parser.ts` | `parseIssueFile(text, sourcePath)` — text → `LoadedIssue`. Uses `gray-matter` for the frontmatter block and a custom scanner for `<!-- [SECTION_START: name] -->` markers. Computes FR-15 integrity on load. |
| `src/lib/services/serializer.ts` | `serializeIssue(issue)` and `canonicalForm(issue)`. Emits system keys in `SYSTEM_FRONTMATTER_KEY_ORDER`, then custom fields, then the freshly computed `integrity_hash`. |
| `src/lib/services/validator.ts` | `validateIssue(issue, ctx)` returning `{ ok, errors[] }`. Implements FR-8 checks (obligatory template fields/sections, status membership, relation validity) and FR-9 cycle detection (parent/child/blocks/depends_on). |
| `src/lib/services/config-loader.ts` | `loadConfig(adapter)` — reads `.agnostic-issuer/config.json`, validates shape, throws an actionable error per FR-3. |
| `src/lib/services/template-loader.ts` | `loadTemplates(adapter)` — reads every `*.json` under `.agnostic-issuer/templates/`, validates shape. |
| `src/lib/services/issue-loader.ts` | `loadIssues(adapter)` — reads every `*.md` under `.agnostic-issuer/issues/`, parses each via `parseIssueFile`. Missing directory is treated as empty set. |
| `src/lib/services/index.ts` | Barrel re-exports. |

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

- No FSA / `memory-fs` / IndexedDB handle store — step 4.
- No runes-based stores — step 5.
- No UI components or new routes — step 6.
- No automated tests — step 7.

## Deviations from the plan

None for step 3 specifically. Two small additions beyond the plan text:

- Added `padIssueId` as an exported helper (separate from `buildIssueFilename`) so step 4's renamer can reuse it.
- Added `verifyIntegrity` and `stripIntegrityHashLine` as exported helpers so the adapter layer (step 4) and the future integrity-warning banner can reuse them without re-implementing the regex.

## Open issues (carry into later steps)

- `pnpm lint` still fails on `AGENTS.md` + `docs/ers.md` (pre-existing Prettier table alignment).
- `AGENTS.md` still says `adapter-auto` (line 20 and 50) after step 1.
- No `engines.node` constraint in `package.json`.
- Cosmetic YAML divergences from the ERS example (date quoting, flow vs block style) — leave as-is for v0, address in a polish pass if desired.

## Next step

**Step 4 — Adapter layer.** Implement the FSA-backed `DirectoryAdapter`, the in-memory adapter for tests, and the IndexedDB handle store:

- `src/lib/adapters/local-fs.ts` — `LocalFsAdapter` implementing `DirectoryAdapter` over a `FileSystemDirectoryHandle`. Atomic writes (temp + rename) per NFR-7. Feature-detects `showDirectoryPicker` and surfaces a typed `FsaUnavailableError`.
- `src/lib/adapters/memory-fs.ts` — `MemoryFsAdapter` for tests; same interface, no browser APIs.
- `src/lib/adapters/handle-store.ts` — IndexedDB-backed persistence of the active handle and the 5-entry recent-folders list per ERS §5.5.
- `src/lib/adapters/renderer.ts` — stub seam for FR-13 (Markdown preview); for v0 it just returns the input unchanged and a TODO.
- `src/lib/adapters/index.ts` — barrel re-exports.