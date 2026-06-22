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
						'tests/adapters/local-fs.test.ts'
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
			}
		]
	}
});
