# AGENTS.md

AgnosticIssuer is a SvelteKit + Svelte 5 client-side web app for managing repository-stored issues. Full spec: `docs/ers.md` (skim it before making scope changes — it defines Local Edit Mode, Remote Read-Only Mode via `isomorphic-git`, three views, and the `.agnostic-issuer/` config tree).

## Stack

- SvelteKit 2 + Svelte 5 (runes mode forced project-wide; see `vite.config.ts:13`)
- TypeScript strict; path aliases via SvelteKit (`$lib` = `src/lib`)
- Tailwind CSS 4 — **CSS-first config** (no `tailwind.config.*`); stylesheet is `src/routes/layout.css`
- Vite 8, Vitest 4, ESLint 10 (flat config), Prettier 3
- Package manager: **pnpm** (`pnpm-lock.yaml`). `.npmrc` has `engine-strict=true` — Node must satisfy the engines range or install will fail.

## Commands

Use `pnpm <script>`, not `npm run` (README examples are stale — they predate pnpm).

| Task                 | Command                                                   |
| -------------------- | --------------------------------------------------------- |
| Dev server           | `pnpm dev`                                                |
| Production build     | `pnpm build` (uses `@sveltejs/adapter-static`)            |
| Preview build        | `pnpm preview`                                            |
| Typecheck            | `pnpm check` (runs `svelte-kit sync` then `svelte-check`) |
| Lint (format + lint) | `pnpm lint` (`prettier --check . && eslint .`)            |
| Format               | `pnpm format`                                             |
| Tests (single run)   | `pnpm test`                                               |
| Tests (watch)        | `pnpm test:unit`                                          |

**Pre-commit verification chain**: `pnpm check && pnpm lint && pnpm test`. There is no CI, no pre-commit hook — run these locally before pushing.

## Svelte 5 runes conventions

Runes are mandatory outside `node_modules`. Use `$props()`, `$state()`, `$derived()`, `$effect()`, `{@render children()}`. Never `export let`, never `<slot>`. See `src/routes/+layout.svelte` for the canonical pattern (`let { children } = $props()`).

## Testing (two-project split in `vite.config.ts`)

- **`client` project**: Playwright + Chromium, headless. Picks up `src/**/*.svelte.{test,spec}.{js,ts}` only. Excludes `src/lib/server/**`. Requires Playwright browsers to be installed.
- **`server` project**: Node env. Picks up `src/**/*.{test,spec}.{js,ts}`, excluding `*.svelte.{test,spec}`.
- New tests must match the correct glob; a `.svelte.spec.ts` accidentally placed under `src/lib/server/**` will be silently skipped by the client project.
- `expect` requires assertions (`expect: { requireAssertions: true }`).
- `src/lib/vitest-examples/` is `sv create` scaffold (greet + Welcome) — safe to delete once real code lands.

## Style

Prettier (`pnpm format`): **tabs**, **single quotes**, **no trailing comma**, **print width 100**. Ignores `pnpm-lock.yaml` (and other lockfiles) plus `/static/`.

ESLint flat config disables `no-undef` (TypeScript handles it) and runs `eslint-config-prettier` last so Prettier owns formatting. Do not add style rules to ESLint.

## Architecture notes that aren't obvious

- **No `svelte.config.js`** — SvelteKit uses defaults. `adapter-static` is wired in `vite.config.ts`, but the ERS calls for `@sveltejs/adapter-static` for v1 (static-only deploy). Switching the adapter is a tracked scope item, not a refactor.
- **`prepare` script** runs `svelte-kit sync`; this regenerates `.svelte-kit/` (gitignored). Don't commit anything from `.svelte-kit/`. `tsconfig.json` extends `.svelte-kit/tsconfig.json`.
- **`$lib` public surface**: `src/lib/index.ts` re-exports the public API. Add new shared modules under `src/lib/`.
- **Server-only code**: place under `src/lib/server/` to keep it out of client bundles and out of browser tests.
- **No `.env.example` exists yet**; if you add env vars, create one and update `.gitignore` patterns accordingly (`.env` and `.env.*` are already ignored except `.env.example` / `.env.test`).

## Things agents typically get wrong here

- Don't reach for `npm` / `yarn` — pnpm is the only lockfile in the repo.
- Don't write `export let` or use `<slot>`; the project is runes-only.
- Don't add a `tailwind.config.js` — Tailwind 4 is configured via `@import 'tailwindcss'` / `@plugin` directives in `src/routes/layout.css`.
- Don't put browser-targeted component tests in `src/lib/server/**` (they'll be skipped).
- Don't add style rules to ESLint; Prettier owns formatting and is wired last in the flat config.
