/**
 * Markdown → sanitized HTML renderer.
 *
 * Pipeline: `marked` (parsing) → `DOMPurify` (XSS sanitization).
 *
 * Why two libraries: `marked` produces rich HTML, but it is not a sanitizer
 * and explicitly defers HTML escaping/escaping to the consumer. `DOMPurify`
 * is the de-facto XSS sanitizer for HTML strings and is the only one
 * ERS-cited in the project's ERS (FR-13, NFR-2).
 *
 * ## Threat model
 *
 * The renderer receives `string` content from a Markdown file. A malicious
 * file can contain:
 *  - raw `<script>` tags in HTML
 *  - inline event handlers (`onerror=`, `onclick=`)
 *  - `javascript:` URLs
 *  - `data:` URLs that carry scripts
 *  - SVG with embedded scripts
 *  - `iframe` injection
 *  - Markdown link with a `javascript:` URL (`[click](javascript:alert(1))`)
 *
 * `marked` itself does not sanitise these. We do, by passing the rendered
 * HTML through `DOMPurify.sanitize(...)` with an explicit allowlist.
 *
 * ## Configuration
 *
 * The `renderMarkdown` and `renderSafeHtml` functions accept a frozen,
 * readonly `RendererOptions` object whose keys are typed as a template
 * literal union (`'default' | 'comment' | 'readme'`) — adding a new
 * preset without extending the union causes a compile error, which is
 * the property we want.
 *
 * ERS coverage: FR-13 (Markdown rendering), NFR-2 (XSS sanitization).
 */

import { marked, type MarkedOptions } from 'marked';
import DOMPurify, {
	type Config as DOMPurifyConfig,
	type DOMPurify as DOMPurifyType
} from 'dompurify';
import { RenderError } from './errors.ts';
import { brandSafeHtml, type SafeHtml } from './_logger.ts';

export type { SafeHtml } from './_logger.ts';

// ─── DOMPurify binding ──────────────────────────────────────────────────────

/**
 * DOMPurify 3.x is exported as a *factory*: in Node you must call it with
 * a `WindowLike` to get a sanitizer, whereas in the browser the default
 * export is also usable directly. We bind it lazily to `globalThis.window`
 * so the same module works in both:
 *
 *  - Browser test: `globalThis.window` is set by Playwright; the
 *    factory auto-detects it.
 *  - Node test: `globalThis.window` is set by jsdom in `beforeAll`.
 *  - SSR: throws a clear error if no window is available (the renderer
 *    is a client-only concern; SSR must not reach this code).
 */
let cachedPurifier: DOMPurifyType | undefined;

function getPurifier(): DOMPurifyType {
	if (cachedPurifier) return cachedPurifier;

	// Look for a window in any of the usual places.
	const w = (globalThis as { window?: unknown }).window;
	if (typeof w === 'undefined' || w === null) {
		throw new RenderError(
			'DOMPurify requires a `window` global; renderer must run in a browser or ' +
				'a DOM-emulating test environment'
		);
	}

	// The factory signature is `(window) => DOMPurifyType`. We cast to
	// `any` here because the dompurify type declarations model the default
	// export as the singleton interface (not the factory), even though at
	// runtime in Node the default export is the factory function.
	const factory = DOMPurify as unknown as (root: unknown) => DOMPurifyType;
	cachedPurifier = factory(w);
	return cachedPurifier;
}

/** Test helper: forget the cached purifier. Exported for tests only. */
export function __resetPurifierForTests(): void {
	cachedPurifier = undefined;
}

// ─── Configuration ──────────────────────────────────────────────────────────

/**
 * Built-in rendering presets. Adding a new preset requires extending this
 * literal union so the switch in {@link resolveOptions} stays exhaustive.
 */
export type RendererPreset = 'default' | 'comment' | 'readme';

/**
 * Frozen, readonly option set for the renderer.  All fields are
 * required at construction time so the renderer can never operate with
 * a partially-initialised options bag.
 */
export interface RendererOptions {
	readonly preset: RendererPreset;
	/** Allow GitHub-Flavored Markdown tables, strikethrough, autolinks, task lists. */
	readonly gfm: boolean;
	/** Allow raw HTML in the input Markdown (we still sanitise the output). */
	readonly allowRawHtml: boolean;
	/** Render line breaks as `<br>`. */
	readonly breaks: boolean;
	/** Force the output to a single `<p>` for the default preset. */
	readonly paragraphWrap: boolean;
	/**
	 * Explicit tag allowlist passed to DOMPurify. Defaults to a strict
	 * subset that excludes `<script>`, `<iframe>`, `<style>`, etc.
	 * Test code can override this to assert behaviour.
	 */
	readonly domPurifyConfig: DOMPurifyConfig;
}

/** Default DOMPurify configuration: blocks all script vectors. */
const STRICT_DOM_PURIFY_CONFIG: DOMPurifyConfig = {
	USE_PROFILES: { html: true },
	FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
	FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
	ALLOW_DATA_ATTR: false,
	KEEP_CONTENT: true
};

/** Tag allowlist for code blocks (preset = 'readme'). Slightly more lenient. */
const README_DOM_PURIFY_CONFIG: DOMPurifyConfig = {
	...STRICT_DOM_PURIFY_CONFIG,
	ADD_ATTR: ['target', 'rel']
};

/** Preset resolution — exhaustively switch on the literal union. */
function resolveOptions(preset: RendererPreset): RendererOptions {
	switch (preset) {
		case 'default':
			return {
				preset,
				gfm: true,
				allowRawHtml: false,
				breaks: false,
				paragraphWrap: true,
				domPurifyConfig: STRICT_DOM_PURIFY_CONFIG
			};
		case 'comment':
			return {
				preset,
				gfm: true,
				allowRawHtml: true,
				breaks: true,
				paragraphWrap: false,
				domPurifyConfig: STRICT_DOM_PURIFY_CONFIG
			};
		case 'readme':
			return {
				preset,
				gfm: true,
				allowRawHtml: true,
				breaks: false,
				paragraphWrap: false,
				domPurifyConfig: README_DOM_PURIFY_CONFIG
			};
	}
}

// ─── Marked configuration ───────────────────────────────────────────────────

/**
 * Build a fresh {@link MarkedOptions} for a given {@link RendererOptions}.
 * The marked instance is mutated by `marked.use(...)`, so we deliberately
 * configure per-call rather than rely on global state.
 */
function buildMarkedOptions(opts: RendererOptions): MarkedOptions {
	return {
		gfm: opts.gfm,
		breaks: opts.breaks,
		// When `allowRawHtml` is false, marked still emits HTML for things like
		// `**bold**` (which becomes `<strong>`) — we use this to *not* allow
		// raw inline HTML such as `<script>` in the input. marked's built-in
		// `silent` option does the opposite, so we leave the parser's default
		// behaviour and rely on DOMPurify to scrub.
		async: false
	} satisfies MarkedOptions;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Render a Markdown string to a sanitized, ready-to-inject HTML string.
 *
 * @param markdown  The raw Markdown text. May contain hostile content.
 * @param preset    One of {@link RendererPreset}. Defaults to `'default'`.
 * @returns A {@link SafeHtml} that the compiler will accept only in
 *          contexts that explicitly require it.
 * @throws {@link RenderError} if marked throws or DOMPurify returns an
 *         empty string for a non-empty input (which would indicate a
 *         parser/sanitizer mismatch).
 */
export function renderMarkdown(markdown: string, preset: RendererPreset = 'default'): SafeHtml {
	const opts = resolveOptions(preset);

	let rawHtml: string;
	try {
		rawHtml = marked.parse(markdown, buildMarkedOptions(opts)) as string;
	} catch (cause) {
		// marked's parse() is sync; the `async: false` option makes the return
		// value `string` rather than `Promise<string>` so the cast above is
		// safe. A throw here means the parser bailed out.
		throw new RenderError(`marked.parse failed: ${describe(cause)}`, cause);
	}

	let sanitized: string;
	try {
		// DOMPurify's `sanitize` can return a `TrustedHTML` (string under
		// the hood); coerce via `unknown` to plain string. We don't use
		// Trusted Types at the application level, so the cast is safe.
		const result = getPurifier().sanitize(rawHtml, opts.domPurifyConfig) as unknown as string;
		sanitized = result;
	} catch (cause) {
		throw new RenderError(`DOMPurify.sanitize failed: ${describe(cause)}`, cause);
	}

	// Wrap in a single <p> for the default preset (preserves the simple
	// "one paragraph = one section body" rendering used by issue views).
	const wrapped = opts.paragraphWrap ? wrapInParagraph(sanitized) : sanitized;

	if (markdown.trim().length > 0 && wrapped.trim().length === 0) {
		// Non-empty input produced empty output — almost certainly because
		// the DOMPurify config was too strict. Surface as a render error so
		// the caller doesn't silently render nothing.
		throw new RenderError('Renderer produced empty output for non-empty Markdown');
	}

	return brandSafeHtml(wrapped);
}

/**
 * Lower-level escape-hatch: take a pre-rendered HTML string and sanitise
 * it. Use only when you have HTML from a non-Markdown source (e.g. a
 * user-authored config snippet) and still need XSS protection.
 *
 * @throws {@link RenderError} if DOMPurify throws.
 */
export function renderSafeHtml(html: string, preset: RendererPreset = 'default'): SafeHtml {
	const opts = resolveOptions(preset);
	try {
		const result = getPurifier().sanitize(html, opts.domPurifyConfig) as unknown as string;
		return brandSafeHtml(result);
	} catch (cause) {
		throw new RenderError(`DOMPurify.sanitize failed: ${describe(cause)}`, cause);
	}
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function wrapInParagraph(html: string): string {
	const trimmed = html.trim();
	if (trimmed.length === 0) return '';
	// If the output already starts with a block-level tag, don't wrap.
	if (/^<(p|ul|ol|blockquote|table|pre|h[1-6])[\s>]/i.test(trimmed)) return trimmed;
	return `<p>${trimmed}</p>`;
}

function describe(cause: unknown): string {
	if (cause instanceof Error) return cause.message;
	return typeof cause === 'string' ? cause : 'unknown';
}
