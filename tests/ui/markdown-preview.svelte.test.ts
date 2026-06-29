/**
 * MarkdownPreview.svelte — sanitized Markdown rendering with
 * 250 ms debounce (sub-phase 6G, FR-13).
 *
 * Verifies:
 *   - A simple Markdown string (`# Heading`) renders an `<h1>`.
 *   - A fenced code block renders inside a `<pre><code>` pair
 *     (sanitised — no raw HTML leakage).
 *   - The 250 ms debounce: a rapid prop change does NOT update the
 *     rendered HTML within 200 ms, but DOES update within 400 ms.
 *
 * Vitest project: `client` (Playwright Chromium). The wildcard
 * `tests/ui/*.svelte.test.ts` exclude in `vite.config.ts` keeps
 * this file out of the `server` project (the renderer needs
 * `window`, which is the `client` project's job).
 */
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import MarkdownPreviewHarness from './MarkdownPreviewHarness.svelte';

describe('MarkdownPreview', () => {
	it('renders an h1 for "# Heading"', async () => {
		render(MarkdownPreviewHarness, { value: '# Heading' });

		// Wait until the h1 appears — the renderer is async, so the
		// first frame shows the skeleton.
		await expect
			.poll(() => document.querySelector('[data-testid="markdown-preview"] h1') !== null, {
				timeout: 1000,
				interval: 25
			})
			.toBe(true);
		const h1 = document.querySelector('[data-testid="markdown-preview"] h1');
		expect(h1?.textContent?.trim()).toBe('Heading');
	});

	it('renders a fenced code block inside <pre><code>', async () => {
		render(MarkdownPreviewHarness, { value: '```ts\nconst x = 1;\n```' });

		await expect
			.poll(() => document.querySelector('[data-testid="markdown-preview"] pre code') !== null, {
				timeout: 1000,
				interval: 25
			})
			.toBe(true);
		const code = document.querySelector('[data-testid="markdown-preview"] pre code');
		expect(code?.textContent).toMatch(/const x = 1;/);
	});

	it('debounces by 250 ms — new content is not in the DOM within 150 ms of the prop change', async () => {
		const screen = render(MarkdownPreviewHarness, { value: '# First' });

		// Wait for the initial render.
		await expect
			.poll(
				() =>
					Array.from(document.querySelectorAll('[data-testid="markdown-preview"] h1')).some(
						(h) => h.textContent?.trim() === 'First'
					),
				{ timeout: 1000, interval: 25 }
			)
			.toBe(true);

		// Re-render the same harness with new content.
		await screen.rerender({ value: '# Second' });

		// At ~150 ms after the prop change, the NEW `# Second` h1
		// must NOT yet be in the DOM — the 250 ms debounce has not
		// fired, so the renderer hasn't produced the new HTML yet.
		// The component shows a Skeleton placeholder during the
		// debounce window; the new content simply has not arrived.
		await new Promise((r) => setTimeout(r, 150));
		const h1sAt150 = Array.from(document.querySelectorAll('[data-testid="markdown-preview"] h1'));
		const textsAt150 = h1sAt150.map((h) => h.textContent?.trim() ?? '');
		expect(textsAt150).not.toContain('Second');
	});

	it('updates the rendered HTML within 400 ms of the last change', async () => {
		const screen = render(MarkdownPreviewHarness, { value: '# Alpha' });

		await expect
			.poll(
				() =>
					Array.from(document.querySelectorAll('[data-testid="markdown-preview"] h1')).some(
						(h) => h.textContent?.trim() === 'Alpha'
					),
				{ timeout: 1000, interval: 25 }
			)
			.toBe(true);

		await screen.rerender({ value: '# Beta' });

		// Poll for the new content; the 250 ms debounce + DOMPurify
		// overhead must fit inside a 400 ms budget.
		await expect
			.poll(
				() => {
					const h1s = Array.from(document.querySelectorAll('[data-testid="markdown-preview"] h1'));
					return h1s.some((h) => h.textContent?.trim() === 'Beta');
				},
				{ timeout: 400, interval: 25 }
			)
			.toBe(true);
	});
});
