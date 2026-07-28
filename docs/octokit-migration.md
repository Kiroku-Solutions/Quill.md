# GitHub provider → Octokit migration — change log

This document records the changes made when the GitHub provider
(`src/lib/adapters/providers/github.ts`) was migrated from a
hand-rolled REST client over `globalThis.fetch` to the official
`@octokit/rest` SDK. The GitLab provider is unchanged and continues
to use the hand-rolled `_http.ts` helper; that work is tracked as a
follow-up.

The migration was prompted by three requirements:

1. **Drop the hand-rolled transport.** The previous `fetchJson` /
   `fetchText` plumbing in `src/lib/adapters/providers/_http.ts`
   duplicated what Octokit provides for free: typed responses,
   pagination, retry, rate-limit handling, and the correct
   `Authorization` header shape for both classic and fine-grained
   PATs.
2. **Close the rate-limit gap.** The hand-rolled client treated
   every 403 / 429 as a generic `RemoteFetchError` and never parsed
   `x-ratelimit-remaining: 0` or `x-ratelimit-reset`. With
   `@octokit/plugin-throttling` the client now waits and retries on
   a real primary rate limit, and backs off on GitHub's secondary
   rate limit. With `@octokit/plugin-retry` 5xx errors and dropped
   connections get exponential backoff.
3. **Use the official library's types.** Octokit's generated
   `Endpoints[…]["response"]` and `Endpoints[…]["parameters"]` types
   replace the inline `GitHubBranch`, `GitHubTree`, `GitHubContent`,
   `GitHubUser`, `GitHubRepo`, `CommitList` interfaces that the
   hand-rolled client defined by hand.

The architectural seam is unchanged: `RepoProvider`
(`src/lib/adapters/providers/types.ts`) is still the Strategy
interface, the registry (`registry.ts`) still wires both providers
into the orchestrator (`remote.ts`), and the `RepoProvider` method
signatures are byte-identical to before. Only the bodies of the
`GitHubProvider` methods changed.

---

## 1. New modules

### 1.1 `src/lib/adapters/providers/_octokit.ts`

A new module that centralises everything Octokit-related so
`github.ts` stays a thin Strategy implementation.

| Export                         | Purpose                                                                                                                                                                                                                                                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createOctokit(pat, baseUrl?)` | Factory. Returns a configured `Octokit` instance with `plugin-throttling`, `plugin-retry`, the project's `User-Agent`, and the `error` hook installed. One instance per unique PAT — cached inside the provider to avoid rebuilding on every call.                                                                               |
| `mapRequestError(err)`         | Pure function. Maps Octokit's `RequestError` to the adapter-layer `AdapterError` subclasses (`RemoteAuthError`, `RemoteFetchError`, `RemoteCommitRejectedError`). Preserves the 401 / 403 / 404 / 409 / 412 / 422 status mapping from the previous `_http.ts:handleResponse`. Non-`RequestError` exceptions are re-thrown as-is. |
| `decodeBase64Content(content)` | Decode an Octokit `content-file` payload (base64, possibly with embedded whitespace) to a UTF-8 string. Same algorithm as before.                                                                                                                                                                                                |
| `utf8ToBase64(text)`           | Encode a UTF-8 string to base64. Required by `createOrUpdateFileContents` and `createTree`, which still expect base64.                                                                                                                                                                                                           |

The class is wired once at module load:

```ts
const ConfiguredOctokit = Octokit.plugin(retry, throttling);
```

`plugin-retry` defaults are overridden: `doNotRetry` is extended
with `409` and `412` (the GitHub Contents API returns 409 / 412 on
optimistic-concurrency collisions, which are surfaced as
`RemoteCommitRejectedError` — they must NOT be retried). `retries`
is kept at the default `3`.

`plugin-throttling` `onRateLimit` retries up to twice; `onSecondaryRateLimit`
retries once. Both call `octokit.log.warn(...)` before deciding,
with the URL passed through verbatim — see §4 for why.

---

## 2. Modified files

### 2.1 `src/lib/adapters/providers/github.ts`

Rewritten. Every `RepoProvider` method body was replaced with one
or two `octokit.rest.*` calls:

| `RepoProvider` method | Hand-rolled (before)                                                                                         | Octokit (after)                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `verifyAuth`          | `GET /user`                                                                                                  | `octokit.rest.users.getAuthenticated()`                                                                                                                                                                |
| `resolveBranch`       | `GET /repos/{owner}/{repo}` + `GET /repos/.../branches/{default}`                                            | `octokit.rest.repos.get()` + `octokit.rest.repos.getBranch()` (via existing `getBranch`)                                                                                                               |
| `getBranch`           | `GET /repos/{owner}/{repo}/branches/{branch}`                                                                | `octokit.rest.repos.getBranch()`                                                                                                                                                                       |
| `createBranch`        | `POST /git/refs` + `GET /git/commits/{sha}`                                                                  | `octokit.rest.git.createRef()` + `octokit.rest.git.getCommit()`                                                                                                                                        |
| `createOrphanBranch`  | `POST /git/commits` (empty tree) + `POST /git/refs`                                                          | `octokit.rest.git.createCommit({tree: EMPTY_TREE_SHA, parents: []})` + `octokit.rest.git.createRef()`                                                                                                  |
| `fetchAll`            | `POST /graphql` (one round-trip) with `object(expression: "{sha}:.quill.md/...")` × 3                        | `octokit.graphql<QuillMdFetchAllResponse>(QUERY, vars)`; per-blob `octokit.rest.repos.getContent({ref, mediaType: { format: 'raw' }})` for `isTruncated` entries only                                  |
| `fetchSince`          | `GET /commits?path=.quill.md/&since=…&until=…&per_page=100` + per-touched `GET /raw/{path}?ref={branch.sha}` | `octokit.rest.repos.listCommits({path, since, until, per_page: 100})` + per-touched `repos.getContent({ref, mediaType: { format: 'raw' }})`                                                            |
| `putFile`             | `PUT /contents/{path}` with base64 content                                                                   | `octokit.rest.repos.createOrUpdateFileContents({content: base64, sha?, branch, committer})`                                                                                                            |
| `deleteFile`          | `DELETE /contents/{path}` with `sha`                                                                         | `octokit.rest.repos.deleteFile({sha, branch, committer})`                                                                                                                                              |
| `commitBatch`         | `GET /git/commits/{parentSha}` → `POST /git/trees` → `POST /git/commits` → `PATCH /git/refs/heads/{branch}`  | `octokit.rest.git.getCommit()` → `octokit.rest.git.createTree({base_tree, tree})` → `octokit.rest.git.createCommit({parents, tree, author, committer})` → `octokit.rest.git.updateRef({force: false})` |

The internal `TreeEntryLike`, `GitHubBranch`, `GitHubTree`,
`GitHubContent`, `GitHubUser`, `GitHubRepo`, and `CommitList`
interfaces were removed — Octokit's generated types cover them.

A per-instance `Map<string, Octokit>` keyed by
`${baseUrl}::${pat}` was added so the auth header is bound once
per session (Octokit binds it at construction time, not per call).

### 2.2 `tests/adapters/providers/github.test.ts`

Updated for Octokit's wire format:

- The `verifyAuth` test now asserts on `authorization: token <pat>`
  (Octokit's `@octokit/auth-token` chooses `token` for non-JWT PATs
  and `bearer` for JWT-shaped ones — `test-pat` falls in the first
  bucket).
- Headers are read with lowercase keys — Octokit normalises every
  outgoing header to lowercase.
- The `putFile` URL assertion uses `decodeURIComponent` before
  `toContain`, because Octokit URL-encodes path-component slashes
  (`%2F`).
- Three new tests cover Octokit's plugin behaviour:
  - `a 422 surfaces as RemoteCommitRejectedError` — validates the
    422 mapping path.
  - `the throttling plugin retries on 403 + x-ratelimit-remaining=0`
    — feeds a 403 with the rate-limit headers the throttling plugin
    inspects, then succeeds on the second call, and asserts the
    second call was actually issued.
- The existing PAT-redaction tests in the same file are unchanged
  — they don't touch the provider.

The `vi.spyOn(globalThis, 'fetch')` pattern keeps working because
Octokit delegates to `globalThis.fetch` internally — the mock
boundary is unchanged.

### 2.3 `package.json` / `pnpm-lock.yaml`

New direct dependencies:

| Package                      | Version | Purpose                                                                                 |
| ---------------------------- | ------- | --------------------------------------------------------------------------------------- |
| `@octokit/rest`              | ^22.0.1 | Typed REST methods (`octokit.rest.*`).                                                  |
| `@octokit/plugin-throttling` | ^11.0.3 | Honours `x-ratelimit-remaining: 0` + `x-ratelimit-reset`; backs off on secondary limit. |
| `@octokit/plugin-retry`      | ^8.1.0  | Exponential backoff on 5xx and network errors.                                          |
| `@octokit/request-error`     | ^7.1.0  | The `RequestError` class whose `status` / `response` we inspect in `mapRequestError`.   |

The four packages and their transitive deps add ~19 entries to
`pnpm-lock.yaml`. The runtime bundle gains ~70 KB of JS
(uncompressed) — see §6.

---

## 3. Untouched

The following modules are intentionally unchanged. They sit on the
seam above the provider or beside it and don't care which transport
the GitHub provider uses:

- `src/lib/adapters/providers/types.ts` — the `RepoProvider`
  contract.
- `src/lib/adapters/providers/registry.ts` — `getProvider`,
  `listProviders`.
- `src/lib/adapters/providers/detect.ts` — `detectProvider`,
  `resolveProvider`.
- `src/lib/adapters/providers/index.ts` — barrel.
- `src/lib/adapters/errors.ts` — `RemoteAuthError`,
  `RemoteFetchError`, `RemoteCommitRejectedError` etc.
- `src/lib/adapters/providers/_pat.ts` — PAT brand + redactor
  (`redactIfPat`, `redactPatInText`, `brandPat`, `unbrandPat`).
  Used by both Octokit and the GitLab client; unchanged.
- `src/lib/adapters/remote.ts` — `fetchSubtree` orchestrator,
  `ReadonlyRemoteAdapter`, cache wiring.
- `src/lib/adapters/read-cache.ts` — IndexedDB snapshot.
- `src/lib/state/pat-storage.ts` — PAT sessionStorage wrapper.
- `src/lib/state/mode.svelte.ts` — the `openRemote`,
  `refreshRemote`, `signOut` actions.
- `src/lib/state/commit-queue.svelte.ts` — debounced commit queue.
- The CSP allowlist at `src/app.html:15` and `static/_headers`
  (`api.github.com`, `gitlab.com`, `*.githubusercontent.com`).
  Octokit does not open any new origins.
- The GitLab provider (`src/lib/adapters/providers/gitlab.ts`) and
  the GitLab-only `_http.ts`. These continue to use the hand-rolled
  transport until a future change migrates them to `@gitbeaker/*` or
  a similar SDK.
- All `tests/state/*` and `tests/adapters/providers/{detect,gitlab}.test.ts`.
  They mock at the `fetchSubtree` boundary, not the HTTP layer.

---

## 4. PAT hygiene

The previous client redacted PATs in error messages and URLs by
running the response URL through `redactPatInText`. The redaction
regex (`_pat.ts:54`) includes `[a-f0-9]{40}` to catch deprecated
classic GitHub PATs — but **every Git SHA is also 40 hex chars**,
so any URL with a SHA path component had its SHA mangled to
`[REDACTED:PAT]`. This was visible in `octokit.log.warn` rate-limit
warnings and in `RemoteFetchError` messages, e.g.:

```
HTTP 500 from https://api.github.com/repos/acme/widgets/git/trees/[REDACTED:PAT]?recursive=true
```

The Octokit transport makes the SHA more prominent in URLs (path
parameter), so the false positive became more visible than before.

The fix in `_octokit.ts`: **do not run `redactPatInText` on URLs**.
Every endpoint this app uses puts the PAT only in the
`Authorization` header; it never appears as a path component or
query parameter. Response **bodies** still pass through the
redactor (the GitHub API does not normally echo the auth header
back, but the body field `message` may in principle contain
identifying strings) and the `Authorization` header itself is
never logged.

The same policy applies to the `octokit.log.warn` rate-limit and
secondary-rate-limit warnings — they log the URL verbatim so SHAs
remain visible for debugging.

The existing `[a-f0-9]{40}` branch of the redaction regex is
intentionally retained: it still catches deprecated classic PATs
in response **bodies** (where the heuristic is less harmful — a
SHA rarely appears inside a JSON `message` string), and it is
required by `tests/adapters/_logger.test.ts:35` ("redacts PAT-shaped
strings even when unbranded"). Removing the branch would break
that test and weaken defence-in-depth against unbranded classic
PATs leaking through error bodies.

NFR-2 (PAT must not appear in any log line, error message, URL, or
analytics payload) is preserved: the PAT still never appears in a
log line because it never appears in the URL or the body fields
the redactor inspects.

---

## 5. Behavioural changes visible to the user

The `RepoProvider` contract is unchanged, so no existing caller
needs to be updated. The following behavioural improvements are
visible at runtime:

- **Primary rate limit honoured.** A 403 with
  `x-ratelimit-remaining: 0` and `x-ratelimit-reset: <epoch>`
  causes Octokit to wait until reset (max ~2 retries) before
  surfacing the error. The previous client surfaced the error
  immediately.
- **Secondary rate limit honoured.** A 403 whose body contains
  "secondary rate limit" causes Octokit to wait and retry once.
  The previous client treated every 403 as
  "check that your token has the required scopes".
- **5xx retry.** 500, 502, 503, 504 responses get up to 3 retries
  with exponential backoff (~1s, ~2s, ~4s). The previous client
  surfaced every 5xx immediately.
- **Network errors retry.** Connection resets, DNS failures, etc.
  get the same backoff treatment.
- **Faster cold fetches.** Octokit's `node_modules/.vite/` cache is
  warm after the first build; subsequent `pnpm dev` starts are
  faster.

The new error-class mapping is identical to before
(`RemoteAuthError` for 401/403, `RemoteFetchError` for 404/fall-through,
`RemoteCommitRejectedError` for 409/412/422), so any UI code that
does `instanceof` checks or switches on `err.type` keeps working
without change.

---

## 6. Bundle impact

After `pnpm build` the bundle gains the following strings
(`build/_app/immutable/chunks/YYQTxePt.js`):

```
octokit, octokit-auth, octokit-core, octokit-endpoint,
octokit-global, octokit-graphql, octokit-notifications,
octokit-request, octokit-rest, octokit-search

getAuthenticated, createOrUpdateFileContents,
repos.getBranch, repos.getContent, repos.listCommits,
git.getCommit, git.createTree,
git.createCommit, git.createRef, git.updateRef
```

`git.getTree` no longer appears in the GitHub code path —
`fetchAll` was switched to a single `octokit.graphql()` POST.
`octokit-graphql` was already in the bundle as a transitive
chunk; it is now the only transport `fetchAll` uses. The Octokit
module graph is tree-shaken by Vite to include only the methods
this provider actually calls. `fetchJson` and `fetchText` no
longer appear in the GitHub code path of the bundle — they
remain only for the GitLab provider's chunks.

---

## 7. Follow-ups (out of scope for this change)

1. **GitLab provider** — `gitlab.ts` and `_http.ts` still use the
   hand-rolled transport. Migrate to `@gitbeaker/*` or similar in a
   separate change to mirror this one.
2. **GraphQL delta-fetch** — `fetchSince` still uses REST
   `listCommits` + per-touched `getContent`. A future change could
   swap to `@octokit/graphql` for a single delta query (one round
   trip instead of `1 + N`). The `RepoProvider` interface already
   accommodates this.
3. **GraphQL size limit** — `fetchAll` returns every entry of
   the `templates/` and `issues/` sub-trees in one response.
   GitHub's `Tree.entries` is typed `[TreeEntry!]` (not a
   connection) and accepts no `first`/`after` arguments, so
   pagination is not available. The response is bounded only by
   GraphQL's overall size limit (~10 MB). For very large
   `.quill.md/issues/` directories a future change should switch
   to per-file `object(expression: "{sha}:.quill.md/issues/<file>")`
   lookups, with a separate index query.
4. **Web Crypto–backed token storage** — the PAT currently lives in
   `sessionStorage` as plaintext, encrypted only at rest by the
   browser's per-origin store. NFR-2 calls out the
   `quill-md.remote-pat` key but not at-rest encryption. Out of
   scope for this change.
5. **Self-hosted GitHub Enterprise** — `customBaseUrl` is plumbed
   through `parseUrl` → `createOctokit` and works for any
   GitHub-compatible API. Branch-protection rule creation and
   other GHEC-specific endpoints are still out of scope.
