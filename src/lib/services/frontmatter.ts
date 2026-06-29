/**
 * Tiny replacement for `gray-matter`.
 *
 * Why we don't use `gray-matter`:
 *  - `gray-matter@4.0.3` (the current release) calls `yaml.safeLoad`, which
 *    was removed in `js-yaml@4`. Once we forced `js-yaml` to `^4.2.0` via
 *    `pnpm.overrides` to clear CVE-2026-53550 (the merge-key DoS), every
 *    frontmatter parse threw `Function yaml.safeLoad is removed in js-yaml 4`.
 *  - `gray-matter` does not expose the `js-yaml` schema option, so we cannot
 *    force `yaml.JSON_SCHEMA` for defense-in-depth (the Step 5 audit
 *    carry-over). Writing a small parser ourselves is cheaper than maintaining
 *    a fork.
 *
 * What this module does:
 *  - Splits a document into `data` (the YAML between the first pair of `---`
 *    fences) and `content` (everything after the closing fence).
 *  - Parses the YAML with `js-yaml.load` and `yaml.JSON_SCHEMA`, which refuses
 *    merge keys (`<<:`, `&anchor`, `*alias`), binary, omap, pairs, set, and
 *    timestamp revival. The only types that survive are the JSON-compatible
 *    set: string, number, boolean, null, array, object.
 *
 * What this module does NOT do:
 *  - No excerpt / language helpers — `gray-matter` ships a lot of those; we
 *    only use it for frontmatter parsing and don't need the rest.
 *  - No auto-detection of the language identifier on the opening fence.
 *  - No YAML frontmatter in non-`---` delimiters. ERS specifies `---` and
 *    that's all we support.
 */

import yaml from 'js-yaml';

/**
 * The shape returned by {@link parseFrontmatter}. Mirrors the relevant slice
 * of `gray-matter`'s return value so the call sites can swap with minimal
 * churn.
 */
export interface ParsedFrontmatter {
	/** The parsed YAML object, or `undefined` if there is no frontmatter block. */
	data: Record<string, unknown> | undefined;
	/** The Markdown body after the closing `---` fence, or the full text if no fence. */
	content: string;
}

/**
 * The leading fence. We accept either `---\n` (Unix) or `---\r\n` (Windows)
 * but not other variants; ERS specifies `---` and we don't want to encourage
 * drift.
 */
const LEADING_FENCE_RE = /^---\r?\n/;

/**
 * The trailing fence: a line whose only content is `---`. Trailing whitespace
 * is tolerated but we do not allow additional content on the line.
 */
const TRAILING_FENCE_LINE_RE = /^---\s*$/m;

/**
 * Parse a document with YAML frontmatter.
 *
 * Behaviour:
 *  - If the document starts with `---`, look for a closing `---` on a line by
 *    itself somewhere later in the file. Everything between is parsed as YAML.
 *  - If no closing fence is found, or there is no opening fence, the entire
 *    document is returned as `content` and `data` is `undefined`.
 *  - Empty frontmatter (`---\n---\n`) yields `data = {}` (an empty object),
 *    matching `gray-matter`'s convention.
 *
 * The YAML parse uses `yaml.JSON_SCHEMA` — only JSON-compatible values are
 * accepted. Merge keys (`<<:`), anchors (`&`), and aliases (`*`) are refused.
 */
export function parseFrontmatter(text: string): ParsedFrontmatter {
	const openMatch = LEADING_FENCE_RE.exec(text);
	if (!openMatch) {
		return { data: undefined, content: text };
	}

	// Scan the rest of the document for the closing fence. We use a regex on
	// the remainder rather than splitting line-by-line because the YAML block
	// may contain `---\n` sequences inside multi-line strings.
	const afterOpen = text.slice(openMatch[0].length);
	const closeMatch = TRAILING_FENCE_LINE_RE.exec(afterOpen);
	if (!closeMatch) {
		// No closing fence — treat the whole thing as body. `gray-matter` is
		// similarly lenient.
		return { data: undefined, content: text };
	}

	const yamlBlock = afterOpen.slice(0, closeMatch.index);
	// Move past the closing fence AND its trailing newline (so `content`
	// starts on the next line, like `gray-matter`).
	const afterClose = afterOpen.slice(closeMatch.index + closeMatch[0].length);
	const content = afterClose.startsWith('\n') ? afterClose.slice(1) : afterClose;

	let data: Record<string, unknown>;
	if (yamlBlock.trim() === '') {
		data = {};
	} else {
		const loaded = yaml.load(yamlBlock, { schema: yaml.JSON_SCHEMA });
		if (loaded === null || loaded === undefined) {
			data = {};
		} else if (typeof loaded === 'object' && !Array.isArray(loaded)) {
			data = loaded as Record<string, unknown>;
		} else {
			// Frontmatter is present but is not a mapping. ERS §6.1 specifies
			// the frontmatter is always a mapping; anything else is a malformed
			// file. Return an empty object and let downstream code treat it as
			// "missing fields" rather than crashing.
			data = {};
		}
	}

	return { data, content };
}
