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
	// isomorphic-git's browser bundle expects `globalThis.Buffer` to be
	// defined (it is the entry point for many sub-modules). Node has it
	// natively; browsers do not. We declare the global with a string
	// expression that resolves to `undefined` in environments that lack
	// it (Vitest on Node sees `Buffer` via the Node runtime; Vitest in
	// the browser sees the global as undefined). The actual polyfill
	// for production browser builds is loaded by the SvelteKit client
	// entry when Remote Mode is activated (Step 6). (Plan §10.3.)
	define: {
		'globalThis.Buffer': 'globalThis.Buffer'
	},
	optimizeDeps: {
		// isomorphic-git has dynamic sub-imports that confuse Vite's
		// pre-bundler. Excluding it from the optimization step lets the
		// package's own ESM resolution kick in.
		exclude: ['isomorphic-git']
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
					// in Node-only deps (gray-matter → Buffer). They run in the
					// `server` project; running them here would fail because the
					// browser globals (window) are read-only and Buffer is absent.
					exclude: [
						'src/lib/server/**',
						'tests/adapters/feature-detect.test.ts',
						'tests/adapters/memory-fs.test.ts',
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
						// The serializer round-trip uses `gray-matter`, which calls
						// `Buffer.from(...)` internally; Buffer isn't available in
						// headless Chromium. Runs only in the `server` project.
						'tests/services/serializer.test.ts',
						// The integration test exercises the full parse → serialize
						// pipeline through `parseIssueFile`, which needs `gray-matter`
						// (and therefore `Buffer`). Same reason: server-only.
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
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
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
