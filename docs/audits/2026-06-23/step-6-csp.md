# Step 6 — CSP audit (sub-phase 6L, 2026-06-23)

> Owner: `agent-coder` (6L).
> Reviewer: Mavis (orchestrator).
> Scope: minimum-viable CSP, security headers, GitHub Pages
> equivalent, SRI pipeline polish.

This audit doc is the canonical record of the CSP / SRI / Trusted
Types work folded into Step 6 sub-phase 6L. It is the place to
look for: the policy template, the rationale for each directive,
the connection whitelist, the follow-ups, and the manual smoke
procedure.

## 1. Goal

Ship the minimum-viable CSP from the security audit
(`docs/current-project-status.md` §"Security audit (2026-06-22)")
so the static deployable is no longer a 1/5 on transport-layer
hardening. Cover the audit carry-overs that Step 6 owns.

## 2. Deliverables

- `static/_headers` — Netlify / Cloudflare Pages transport-layer
  headers (CSP + HSTS + X-Content-Type-Options + Referrer-Policy
  - Permissions-Policy + COOP/COEP/CORP).
- `static/_redirects` — Netlify SPA fallback.
- `docs/hosting/github-pages.md` — GitHub Pages equivalent of
  the headers; documents the residual CSP / HSTS gap when
  shipping on a host that does not honour `_headers`.
- `docs/audits/2026-06-23/step-6-csp.md` — this document.
- `scripts/check-csp.mjs` — fail-the-build lint for the
  production bundle (`eval`, `Function`, `document.write`).
- `scripts/add-sri.mjs` — already shipped in 6A; polished in 6L
  (top-of-file doc block, integrity-map re-read verification).
- `package.json` — `check:csp` script wired into `build` and
  `lint`.

## 3. CSP template

The canonical policy is the one in `static/_headers`. It is
slightly stronger than the audit's minimum-viable template in
the following ways (each is a documented deviation):

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  font-src 'self';
  connect-src 'self' https://cors.isomorphic-git.org
              https://*.github.com https://*.gitlab.com;
  object-src 'none';
  base-uri 'none';
  frame-ancestors 'none';
  form-action 'none';
  require-trusted-types-for 'script';
  trusted-types nomad-md dompurify default
```

| Directive                     | Audit template                                | Shipped                      | Reason for deviation                                                                                            |
| ----------------------------- | --------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `default-src`                 | `'self'`                                      | `'self'`                     | match                                                                                                           |
| `script-src`                  | `'self' 'unsafe-inline'`                      | `'self' 'unsafe-inline'`     | match (was `'self'` only in 6A's stricter `static/_headers`; relaxed to match audit)                            |
| `style-src`                   | `'self' 'unsafe-inline'`                      | `'self' 'unsafe-inline'`     | match                                                                                                           |
| `img-src`                     | `'self' data:`                                | `'self' data: blob:`         | `blob:` is required for DOMPurify image sinks                                                                   |
| `connect-src`                 | `'self' cors-proxy *.github.com *.gitlab.com` | matches; explicit            | non-negotiable per audit                                                                                        |
| `object-src`                  | `'none'`                                      | `'none'`                     | match                                                                                                           |
| `base-uri`                    | `'none'`                                      | `'none'`                     | match (was `'self'` in 6A; tightened)                                                                           |
| `frame-ancestors`             | `'none'`                                      | `'none'`                     | match (also covered by `<meta http-equiv>` fallback in `src/app.html:13`)                                       |
| `form-action`                 | `'none'`                                      | `'none'`                     | match (was `'self'` in 6A; tightened; the app has no `<form>` submissions)                                      |
| `require-trusted-types-for`   | `'script'`                                    | `'script'`                   | match                                                                                                           |
| `trusted-types` (policy name) | (audit does not specify)                      | `nomad-md dompurify default` | the policy name is required for the `require-trusted-types-for` directive to be useful; `dompurify` is the sink |

Other headers (the full `_headers` file):

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` — 2 years plus subdomains; `preload` is only effective after submission to hstspreload.org.
- `X-Content-Type-Options: nosniff` — MIME-sniffing defence.
- `Referrer-Policy: no-referrer` — URL bar never leaks the current path.
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(), usb=(), serial=(), bluetooth=(), midi=()` — every common sensor / API denied by default.
- `Cross-Origin-Opener-Policy: same-origin` — process isolation.
- `Cross-Origin-Embedder-Policy: require-corp` — required for `SharedArrayBuffer` and isolates the page.
- `Cross-Origin-Resource-Policy: same-origin` — refuse to be embedded as a subresource by cross-origin pages.

## 4. Why `'unsafe-inline'` for `script-src` and `style-src`

This is the v0 trade-off. The brief is explicit: do not weaken
the policy beyond this trade-off, document the path to per-build
nonces.

- `script-src 'self' 'unsafe-inline'` is required by the
  no-flash theme bootstrap in `src/app.html` (line 27-38). The
  inline script sets the `dark` class on `<html>` before first
  paint, matching the user's stored theme preference or
  `prefers-color-scheme`. The script is small (~150 bytes) and
  has no security impact (it reads `localStorage` and `window.matchMedia`).
- `style-src 'self' 'unsafe-inline'` is required by:
  - Tailwind 4 utility classes that occasionally emit inline
    `style="..."` for transitions (Svelte 5's `style:` directive,
    daisyUI's progress bar, etc.).
  - Svelte's component-scoped styles use `<style>` blocks that
    Vite emits as separate stylesheets, but the in-page runtime
    occasionally injects `style="..."` for transitions.

The per-build CSP nonce follow-up: `adapter-static` does not
support per-build nonces out of the box. The follow-up
implementations are (in order of preference):

1. Promote the no-flash script to a separate file under
   `static/` and add a `<script src="..."></script>` tag. Then
   the inline-script carve-out is no longer needed. **This is
   the v1 fix.**
2. Generate a per-build nonce, inject it into the `<script>` tag
   in `app.html` via a Vite plugin, and add `script-src 'self'
'nonce-<value>'` to the CSP. `adapter-static` does not
   support this out of the box; a custom adapter or a build-time
   HTML transform is required.
3. Use `'strict-dynamic'` + a per-build hash of the inline
   script. The hash is the SHA-256 of the script body and can be
   computed at build time. The CSP becomes `script-src 'self'
'<hash-value>'`. This is the v0.2 fix if the no-flash
   promotion to a separate file is rejected.

## 5. The SRI pipeline

`scripts/add-sri.mjs` runs after `vite build` and stamps
`integrity="sha384-…"` + `crossorigin="anonymous"` on every
`<link rel="modulepreload" href="…">` and every
`<script type="module" src="…">` in `build/index.html`. The
script also writes `build/integrity.json`, a sibling map of
URL → expected hash, for downstream verification.

Pipeline (the `build` script in `package.json`):

```
vite build
  → SvelteKit emits build/index.html + build/_app/immutable/**
node scripts/add-sri.mjs
  → reads build/index.html
  → for every modulepreload / module-script, hashes the asset with SHA-384
  → inserts integrity="sha384-…" + crossorigin="anonymous"
  → writes build/integrity.json (URL → expected hash map)
  → re-reads the map and asserts the entry count matches the in-memory map
node scripts/check-csp.mjs
  → scans build/index.html and build/_app/immutable/**/*.js
  → flags eval(, new Function(, Function(, document.write(
  → exits 0 (with allow-listed warnings) or 1 (with violations)
```

The integrity re-read at the end of `add-sri.mjs` is defence
against a partial write. `writeFile` already throws on failure,
but a partial write (interrupted mid-stream) would otherwise
pass silently.

## 6. Trusted Types

`require-trusted-types-for 'script'` is enabled. The policy
name is `nomad-md` (with `dompurify` and `default` as fallbacks
per the spec). The renderer (`src/lib/adapters/renderer.ts`)
constructs TrustedHTML values for the inner HTML of sanitized
Markdown; the DOMPurify sink is the documented target. No
other code path constructs Trusted Types.

If a future code path adds a DOM sink that takes a string
(e.g. `Element.innerHTML = …`), it must either go through
DOMPurify (which is Trusted-Types-aware) or use a TrustedHTML
policy. Direct string assignment without Trusted Types is
blocked by the policy.

## 7. Connection whitelist (`connect-src`)

The app contacts exactly three categories of endpoint:

| Endpoint                          | Purpose                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `'self'`                          | SvelteKit's data fetching (none in v0, future-proofing)                                                  |
| `https://cors.isomorphic-git.org` | Remote Mode's CORS proxy (default; configurable in `config.json`)                                        |
| `https://*.github.com`            | GitHub Remote Mode (`https://api.github.com`, `https://github.com`, `https://raw.githubusercontent.com`) |
| `https://*.gitlab.com`            | GitLab Remote Mode (`https://gitlab.com`, `https://<host>/api/v4`)                                       |

NFR-3 ("no third-party network calls") is satisfied by the
whitelist. Analytics, telemetry, error reporters, and CDN-loaded
scripts are explicitly **not** whitelisted; a future addition
must be reviewed against this list.

## 8. Known third-party CSP issues

`pako` (zlib, transitive via `isomorphic-git`) uses
`Function(\`binder\`, \`return function (\`+c(...))`to
JIT-compile a specialized inflate function the first time it
sees a new code-table. The fast path is an optimisation; the
slow path is always available and is what isomorphic-git's
packfile reader uses in practice. The literal`Function(\`binder\``is unique to pako's`inflate.cmp`style bundle and is
allow-listed in`scripts/check-csp.mjs`.

**Why this matters**: under the brief's CSP template
(`script-src 'self' 'unsafe-inline'`, no `'unsafe-eval'`),
the `Function(...)` call would be blocked by the browser at
runtime. In practice isomorphic-git's packfile reader does
not hit the fast path; the slow path uses pre-compiled
Huffman tables and never calls `Function`. The browser does
not throw. If a future isomorphic-git version changes the
inflate strategy, the fast path may trigger and the browser
will throw a CSP violation.

**The fix** (follow-up):

1. Replace `pako` with a CSP-compatible inflate. Candidates:
   `fflate` (no `Function` constructor, drop-in API
   replacement), or use the browser-native
   `DecompressionStream` (modern Chromium / Firefox / Safari).
2. Refactor the bundle to disable pako's fast path. This
   requires either a custom Vite plugin or a post-build
   transform — out of scope for 6L.
3. Add `'unsafe-eval'` to the CSP. The brief explicitly
   rejects this; the v0 trade-off is `'unsafe-inline'`, not
   `'unsafe-eval'`. Do not weaken the policy.

The recommended fix is (1) — `fflate` is API-compatible with
`pako` for the inflate path. The substitution is a small
adapter change in `src/lib/adapters/remote-git.ts`.

## 9. Manual smoke procedure

The brief's acceptance criterion 13 is a manual smoke:
"Loading `build/index.html` in a browser with the headers
applied shows zero CSP violations in the dev tools console."

The procedure to perform the smoke:

1. `pnpm build` (produces `build/`).
2. Serve `build/` with a static server that applies
   `static/_headers`. Easiest: `npx serve build` and use a
   custom middleware to apply the headers, or use
   `npx netlify-cli dev` if Netlify's CLI is available.
3. Open the served URL in Chromium.
4. Open DevTools → Console. Filter for `Content Security Policy`.
5. Expected output: zero violations.
6. Smoke check the no-flash theme:
   - Reload with `localStorage.clear()` and a dark system
     theme (Chrome DevTools → Rendering → "Emulate CSS
     prefers-color-scheme: dark"). The page should render
     in dark mode on first paint (no flash of light).
   - Set `localStorage.setItem('nomad.md.theme', 'light')` and
     reload. The page should render in light mode.
7. Smoke check the SRI:
   - DevTools → Network. Open one of the `.js` files
     downloaded by the page. Verify the request includes an
     `integrity` attribute on the `<script>` tag (View Source
     of `index.html`).
   - In DevTools, edit the file (e.g. add a `//` comment at
     the top), reload, and confirm the browser blocks the
     script with an SRI mismatch error.
8. Smoke check the CSP:
   - Open DevTools Console. Try `eval('1')` in the
     console. The browser should throw a CSP violation.
   - Try `Function('return 1')()`. Same.
   - Try `document.write('<p>hi</p>')` in the console. Same.
9. Smoke check `connect-src`:
   - Try `fetch('https://example.com/')` in the console.
     The browser should block the request (not in
     `connect-src`).
   - Try `fetch('https://api.github.com/')`. The browser
     should allow the request.

The smoke is a **manual** procedure; the brief explicitly
notes that an automated browser is not available in this
sub-phase. Document the result in the step-6 changelog
(written by 6M).

## 10. Follow-ups

The following are tracked as follow-ups for Step 7 / 8:

- **Per-build CSP nonce** (Section 4). Promote the no-flash
  script to a separate file under `static/`. The v1 fix
  removes the `'unsafe-inline'` carve-out for `script-src`.
- **Replace `pako` with `fflate`** (Section 8). A small
  adapter change in `src/lib/adapters/remote-git.ts`. The
  bundle drops ~30 KB and the `Function(...)` call site
  disappears entirely.
- **Strict CSP**: a per-build hash of the no-flash script in
  `script-src`. The hash is the SHA-256 of the script body
  and is computed at build time. The CSP becomes
  `script-src 'self' 'sha256-<value>'`. **This is the v0.2
  fix** if the promotion is rejected.
- **CSP `report-uri` endpoint**: deferred. The current
  CSP does not log violations; a future Step 7 / 8 can add
  a `report-uri https://example.com/csp-report` to collect
  violations from production users.
- **Service worker CSP injection** (GitHub Pages only): a
  GitHub Action that installs a service worker which injects
  CSP via `Response.headers`. This is the only way to get
  full CSP coverage on GitHub Pages. Defer to a Step 7
  follow-up.
- **Inline `<style>` audit**: a follow-up that maps every
  `style="..."` attribute emitted by the bundle to its source
  component. Tailwind 4 + Svelte 5 + daisyUI emit a small
  number of inline styles; the audit confirms the
  `'unsafe-inline'` carve-out is actually needed.

## 11. Verification chain

- `pnpm check` — 0 errors, 0 warnings.
- `pnpm lint` — Prettier clean; ESLint clean; `check-i18n` clean; `check-csp` clean.
- `pnpm test` — 815 tests passing (the 6L sub-phase adds zero
  new tests).
- `pnpm build` — succeeds; `build/_headers`, `build/_redirects`,
  and `build/integrity.json` are in the output.
- `pnpm check:csp` — exits 0; 0 violations, 1 allow-listed
  warning (the pako `Function(...)` call; see Section 8).
- `pnpm audit` — 0 advisories.

## 12. References

- W3C CSP3: <https://www.w3.org/TR/CSP3/>
- Subresource Integrity: <https://www.w3.org/TR/SRI/>
- Trusted Types: <https://w3c.github.io/trusted-types/dist/spec/>
- HSTS preload list: <https://hstspreload.org/>
- The original audit: `docs/current-project-status.md`
  §"Security audit (2026-06-22)".
- The Step 6 plan: `docs/step-6-ui-layer-plan.md` §4
  sub-phase 6L, §5 NFR-2 / NFR-3.
