import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Static SPA build per ERS 5.3 / 5.4. The app is interactive from the first byte;
			// no SSR, no prerender. Per-page settings live in src/routes/+layout.ts.
			adapter: adapter({
				pages: 'build',
				assets: 'build',
				fallback: 'index.html',
				precompress: false,
				strict: true
			})
		})
	],
	// ─── Vite `define` / `optimizeDeps` rationale ───────────────────────────
	//
	// `define` is INTENTIONALLY omitted. An earlier entry mapped the
	// browser-shim key to its own identifier text, which Vite inlines
	// verbatim — so the shim resolved to `undefined` in real browsers
	// and the production bundle threw a ReferenceError as soon as
	// isomorphic-git evaluated. That was the architecture-audit.md:353
	// finding. The real polyfill now lives in
	// `src/lib/polyfills/buffer.ts` and is imported as the first
	// statement of `src/routes/+layout.svelte`, so it runs before any
	// code that pulls isomorphic-git into the bundle. The layout-level
	// import is the canonical install path for the browser build; no
	// build-time `define` shim is required (or even helpful).
	//
	// `optimizeDeps.exclude`: isomorphic-git's ESM source uses dynamic
	// sub-imports that Vite's pre-bundler mangles. Excluding the package
	// lets its own ESM resolution kick in. This entry is unrelated to
	// the polyfill — it would still be needed even with the shim in
	// place.
	optimizeDeps: {
		// isomorphic-git has dynamic sub-imports that confuse Vite's
		// pre-bundler. Excluding it from the optimization step lets the
		// package's own ESM resolution kick in.
		exclude: ['isomorphic-git'],
		// Pre-bundle the lucide icons that 6C chrome tests import
		// (AppShell → TopBar → settings gear, etc.). Without this
		// entry Vite discovers them at runtime, triggers an
		// "optimized dependencies changed" reload, and the test file
		// import fails with a transient "Failed to fetch dynamically
		// imported module" error. Adding the icons here is the
		// documented fix per the Vitest 4 migration guide.
		include: [
			'@lucide/svelte/icons/settings',
			'@lucide/svelte/icons/panel-left-open',
			'@lucide/svelte/icons/panel-left-close',
			'@lucide/svelte/icons/alert-triangle',
			'@lucide/svelte/icons/folder',
			'@lucide/svelte/icons/folder-open',
			'@lucide/svelte/icons/folder-plus',
			'@lucide/svelte/icons/globe',
			'@lucide/svelte/icons/layout-list',
			'@lucide/svelte/icons/lock',
			'@lucide/svelte/icons/pencil-line',
			'@lucide/svelte/icons/x',
			// 6E: NewIssueModal type-picker icon table + the new
			// toolbar/modal surfaces.
			'@lucide/svelte/icons/bug',
			'@lucide/svelte/icons/check-square',
			'@lucide/svelte/icons/file-text',
			'@lucide/svelte/icons/flag',
			'@lucide/svelte/icons/git-branch',
			'@lucide/svelte/icons/git-pull-request',
			'@lucide/svelte/icons/layers',
			'@lucide/svelte/icons/list-checks',
			'@lucide/svelte/icons/package',
			'@lucide/svelte/icons/sparkles',
			'@lucide/svelte/icons/tag',
			'@lucide/svelte/icons/wrench',
			'@lucide/svelte/icons/zap',
			// 6F: RemoteToolbar refresh + sign-out icons.
			'@lucide/svelte/icons/refresh-cw',
			'@lucide/svelte/icons/log-out',
			// 6H: SettingsPanel theme picker + command icons.
			'@lucide/svelte/icons/sun',
			'@lucide/svelte/icons/moon',
			'@lucide/svelte/icons/monitor',
			'@lucide/svelte/icons/trash-2'
		]
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
					// Node-environment tests that simulate browser scenarios or pull
					// in Node-only deps (lightning-fs → Buffer). They run in the
					// `server` project; running them here would fail because the
					// browser globals (window) are read-only and Buffer is absent.
					exclude: [
						'src/lib/server/**',
						// State-layer tests are pure logic and belong to the
						// `server` Vitest project. The `client` (Chromium)
						// project would try to run them in a real browser where
						// `window` is a read-only Window accessor and cannot be
						// unset to test the not-in-browser guard.
						'tests/state/**',
						'tests/adapters/feature-detect.test.ts',
						'tests/adapters/memory-fs.test.ts',
						// Buffer polyfill is Node-only — the polyfill's fast
						// path returns the Node-native constructor, and the
						// test asserts the Node-native constructor is present.
						// Chromium has no native Buffer, so the "sanity" check
						// would fail. Run only in the `server` project.
						'tests/adapters/buffer.test.ts',
						// Remote-git live test pulls `isomorphic-git` (and
						// its `async-lock` transitive dep) which Chromium's
						// bundler cannot ESM-rewrite cleanly. It is a
						// Node-only structural test gated on
						// `RUN_LIVE_TESTS=1`; run only in the `server` project.
						'tests/adapters/remote-git.live.test.ts',
						// The local-fs test uses a pure-TS FSA mock; it has no business
						// in a real Chromium FSA context (File.text is sync in Chromium,
						// not Promise<string> like in Node).  Run it in the server project.
						'tests/adapters/local-fs.test.ts',
						// The renderer test needs `jsdom`, which requires `SharedArrayBuffer`
						// (unavailable in headless Chromium without cross-origin isolation
						// headers). It runs in the dedicated `renderer` project below.
						'tests/adapters/renderer.test.ts',
						// The remote-git test uses the Node-friendly `node:fs` path
						// through isomorphic-git (no browser HTTP transport). It runs
						// in the `server` project; the `client` project would try to
						// re-bundle it for Chromium, which the isomorphic-git API
						// doesn't support.
						'tests/adapters/remote-git.test.ts',
						// The serializer round-trip uses `js-yaml` and Node-friendly
						// APIs. Runs only in the `server` project.
						'tests/services/serializer.test.ts',
						// The integration test exercises the full parse → serialize
						// pipeline through `parseIssueFile`. Runs only in the
						// `server` project.
						'tests/services/integration.test.ts'
					]
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
					exclude: [
						'src/**/*.svelte.{test,spec}.{js,ts}',
						// handle-store exercises real Chromium IndexedDB;
						// `server` (Node) has no `window.indexedDB`, so
						// `isIndexedDBAvailable()` returns false and `openDb()`
						// rejects every call. Run only in the `client` project.
						'tests/adapters/handle-store.test.ts',
						// Every `tests/ui/*.svelte.test.ts` imports `vitest/browser`
						// (directly or transitively through `vitest-browser-svelte`),
						// which is browser-mode-only. Run only in the `client`
						// project (Playwright Chromium). 6C extended the 6B
						// hard-coded list (`tabs.svelte.test.ts`,
						// `modal.svelte.test.ts`) to a wildcard so future tests
						// added under `tests/ui/` inherit the same exclusion
						// without needing another config edit per test.
						'tests/ui/*.svelte.test.ts',
						// 6K a11y tests import `vitest/browser` and run axe-core
						// against a real DOM. They are Playwright-Chromium-only.
						'tests/a11y/*'
					]
				}
			},

			{
				// The Markdown renderer test injects `jsdom` as a global
				// window so DOMPurify can walk a DOM. It must not run in
				// either of the two projects above (server: pure Node, no
				// window; client: real Chromium, which would shadow the
				// jsdom injection). Dedicated project with the
				// `node` environment + a single test file gives it a clean
				// sandbox.
				extends: './vite.config.ts',
				test: {
					name: 'renderer',
					environment: 'node',
					include: ['tests/adapters/renderer.test.ts']
				}
			}
		]
	}
});
