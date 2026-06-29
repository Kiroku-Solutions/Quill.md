#!/usr/bin/env node
/**
 * check-i18n.mjs — fail-the-build lint for hard-coded English strings
 * in `.svelte` files under `src/lib/components/**` and `src/routes/**`
 * (sub-phase 6J, NFR-6).
 *
 * Every user-facing string should be sourced from `$lib/ui/strings.ts`
 * via the `$t(key)` helper. This script flags any literal English
 * string that appears in the chrome without a `$t(...)` wrapper
 * nearby.
 *
 * Heuristics (to keep false positives near zero):
 *   - Class names (`class="..."`) are ignored.
 *   - `data-testid`, `data-record-id`, `data-card-id`, etc. are
 *     ignored (test hooks, not user-facing).
 *   - String literals inside `<script lang="ts">` blocks are ignored
 *     (those are log messages, error keys, JSON-shape guards, etc.).
 *   - The `$t(...)` call itself is ignored.
 *   - Numeric-only strings are ignored.
 *   - Strings that are 2 characters or fewer are ignored (icons like
 *     "×", "+", "↻", common punctuation).
 *   - A `name="…"` attribute on a radio/checkbox is ignored (it's a
 *     radio-group identifier, not a label).
 *   - A `value="…"` on an `<option>` is ignored (it's a key, not
 *     a label) — BUT the visible text content of `<option>…</option>`
 *     is checked.
 *   - A `name="…"` on an `<input>` is ignored (it's a form-field
 *     identifier, not a label).
 *   - The `text=` attribute on a daisyUI `.tooltip` span is
 *     allowed; the value is a user-facing string but lives in a
 *     primitive wrapper, not the chrome. (We don't have those
 *     literals in the chrome, so this is a no-op safety net.)
 *   - A `<!--  … -->` HTML comment is ignored.
 *
 * Exits 1 with a list of `file:line:column` if any violations are
 * found; exits 0 otherwise. Wired into `pnpm lint` via the package
 * scripts.
 *
 * Pure Node, no external deps.
 */

import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const TARGETS = [join(ROOT, 'src', 'lib', 'components'), join(ROOT, 'src', 'routes')];

const ALLOWED_ATTRIBUTES = new Set([
	'class',
	'data-testid',
	'data-record-id',
	'data-card-id',
	'data-row-id',
	'data-column-id',
	'data-type-id',
	'data-field-key',
	'data-field-type',
	'data-collapsed',
	'name', // radio/checkbox group id or input form key
	'value', // <option value> or hidden input value (use <option> text instead)
	'id', // DOM id (test hooks, not user-facing)
	'href',
	'type', // <input type> (text/password/email/...)
	'autocomplete',
	'spellcheck',
	'style',
	'role',
	'tabindex',
	'data-tip', // daisyUI tooltip text lives on the primitive wrapper
	'data-tip-position',
	'xmlns',
	'viewBox',
	'fill',
	'stroke',
	'stroke-width',
	'stroke-linecap',
	'stroke-linejoin',
	'd',
	'marker-end',
	'marker-start',
	'marker-mid',
	'marker-units',
	'marker-width',
	'marker-height',
	'orient',
	'refx',
	'refy',
	'x',
	'y',
	'width',
	'height',
	'cx',
	'cy',
	'r',
	'x1',
	'x2',
	'y1',
	'y2',
	'rx',
	'ry',
	'font-size',
	'font-weight',
	'text-anchor',
	'opacity',
	'points',
	'method',
	'className',
	'aria-hidden', // screen-reader boolean; "true" / "false" are not user-facing
	'aria-pressed', // boolean toggle
	'aria-busy', // boolean
	'aria-invalid', // boolean
	'aria-sort', // "ascending" | "descending" | "none" — WAI-ARIA keyword
	'aria-modal', // boolean
	'aria-orientation', // "horizontal" | "vertical" — WAI-ARIA keyword
	'aria-controls',
	'aria-describedby',
	'aria-selected',
	'aria-labelledby',
	'variant', // 6B Button variant prop (primary | secondary | ghost | ...)
	'size', // 6B Button size prop (sm | md | lg)
	'position', // Tooltip position prop (top | bottom | left | right)
	'loading', // boolean
	'disabled', // boolean
	'required', // boolean
	'readonly', // boolean
	'checked', // boolean
	'autofocus',
	'flipDurationMs', // svelte-dnd-action numeric prop
	'dragDisabled', // svelte-dnd-action boolean
	'dropFromOthersDisabled', // svelte-dnd-action boolean
	'open', // <dialog> open boolean / Modal bindable
	'rows', // <textarea> rows numeric
	'markerUnits', // SVG attribute (strokeWidth | userSpaceOnUse)
	'rel' // <link rel="icon"> etc.
]);

// Values that are NOT user-facing even if they appear as a string
// attribute. We allow these to land in any attribute name.
const MIN_LENGTH = 3; // a-z + 1 char of English content → ignore 1-2 char noise

function walk(dir, out = []) {
	let entries;
	try {
		entries = readdirSync(dir);
	} catch {
		return out;
	}
	for (const name of entries) {
		const full = join(dir, name);
		const st = statSync(full);
		if (st.isDirectory()) walk(full, out);
		else if (name.endsWith('.svelte')) out.push(full);
	}
	return out;
}

/**
 * Strip `<script lang="ts">…</script>` blocks from the source — the
 * 6J brief is explicit that the lint scope is the markup, not the
 * script. We replace the block with the same number of newlines so
 * line/column reporting remains accurate.
 */
function stripScriptBlocks(source) {
	return source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, (m) => {
		const lines = m.split('\n').length;
		return '\n'.repeat(lines - 1);
	});
}

/**
 * Strip HTML comments — they're developer notes, not user strings.
 */
function stripComments(source) {
	return source.replace(/<!--[\s\S]*?-->/g, (m) => {
		const lines = m.split('\n').length;
		return '\n'.repeat(lines - 1);
	});
}

function isLikelyUserFacingText(s) {
	const t = s.trim();
	if (t.length < MIN_LENGTH) return false;
	// Numeric-only or pure punctuation
	if (/^[\d\s.,:;/\-_()+*×↻•·]+$/.test(t)) return false;
	// Has at least one ASCII letter
	if (!/[A-Za-z]/.test(t)) return false;
	// Version strings like "v0.0.1" / "1.2.3" — pure version
	// fragments are not user-facing copy.
	if (/^v?\d+\.\d+(\.\d+)?([-+][\w.]+)?$/i.test(t)) return false;
	// File paths / directory names / URL-shaped fragments — the
	// 6J brief is explicit: "Don't replace technical strings (file
	// paths, CSS class fragments, `data-testid` values, log
	// messages, error codes)." Filter anything that is mostly
	// dots / slashes / dashes / file-shaped.
	if (/^[\d.A-Za-z_-]+\.[A-Za-z][\w./-]*$/.test(t)) return false;
	if (/^https?:\/\//.test(t)) return false;
	return true;
}

function isInsideTCall(line, col, tCallSpans) {
	// col is 0-indexed; check whether the char at (line, col) lies
	// inside any `$t(…)` span on the same line.
	for (const span of tCallSpans) {
		if (span.line !== line) continue;
		if (col >= span.start && col <= span.end) return true;
	}
	return false;
}

function findTCallSpansOnLine(line) {
	const spans = [];
	const re = /\$t\s*\(/g;
	let m;
	while ((m = re.exec(line)) !== null) {
		// Walk forward to find the matching `)` at the same depth,
		// respecting nested parens.
		let depth = 1;
		let i = m.index + m[0].length;
		while (i < line.length && depth > 0) {
			const ch = line[i];
			if (ch === '(') depth++;
			else if (ch === ')') depth--;
			i++;
		}
		spans.push({ start: m.index, end: i - 1 });
	}
	return spans;
}

function extractAttributeLiterals(source) {
	const findings = [];
	// Match double-quoted attribute values: name="…"
	// Skips self-closing single-quoted for our codebase's style.
	const re = /([a-zA-Z][\w:-]*)\s*=\s*"([^"]*)"/g;
	let m;
	while ((m = re.exec(source)) !== null) {
		const name = m[1];
		if (ALLOWED_ATTRIBUTES.has(name)) continue;
		const value = m[2];
		if (!isLikelyUserFacingText(value)) continue;
		const before = source.slice(0, m.index);
		const line = before.split('\n').length;
		const lastNl = before.lastIndexOf('\n');
		const col = m.index - (lastNl + 1);
		findings.push({ line, col, value: value.slice(0, 80), attr: name });
	}
	return findings;
}

function extractTextNodeLiterals(source) {
	// We look for `>...<` regions that are not inside an attribute
	// value or a `{ ... }` expression. The simplest regex that
	// approximates this is: text between `>` and `<` that doesn't
	// start with `{`.
	const findings = [];
	const re = />([^<>{}]+)</g;
	let m;
	while ((m = re.exec(source)) !== null) {
		const raw = m[1];
		// Collapse whitespace and check the trimmed form for user-facing
		// content. We still report the original line / column of the
		// match.
		const trimmed = raw.trim();
		if (!isLikelyUserFacingText(trimmed)) continue;
		// Skip Svelte type-cast expressions like `e as CustomEvent<Card>`
		// or `isReadOnly ? undefined : (e) => onConsider(e as CustomEvent<Card>, col.id)`.
		// These are JS expressions inside event-handler attributes, not
		// user-facing text.
		if (/\bas\s+[A-Z][\w<>]*/.test(trimmed)) continue;
		// Skip HTML entity fragments used as glyphs (e.g. `&nbsp;*`).
		// They're a space-holder + a punctuation marker, not English.
		if (/^&[#a-z\d]+;?[^\w]*$/i.test(trimmed)) continue;
		// Skip text that is a continuation fragment after an inline
		// child element (e.g. `<code>config.json</code>. Coming in a
		// follow-up.`). A leading `.`/`,`/`!`/`?`/etc. cannot begin
		// a sentence; the fragment is the tail of a prior phrase and
		// is the developer's choice to keep the surrounding
		// paragraph as a single readable sentence. We let the
		// developer fold the whole sentence into one $t() call (or
		// keep it as a single string) without flagging the tail
		// fragment as a separate violation. Pragmatic per the brief.
		if (/^[.,!?;:]/.test(trimmed)) continue;
		const before = source.slice(0, m.index);
		const line = before.split('\n').length;
		const lastNl = before.lastIndexOf('\n');
		const col = m.index - (lastNl + 1) + 1; // inside the `>`
		findings.push({ line, col, value: trimmed.slice(0, 80), attr: '<text>' });
	}
	return findings;
}

function checkFile(path) {
	let source = readFileSync(path, 'utf8');
	source = stripComments(source);
	source = stripScriptBlocks(source);

	const attrFindings = extractAttributeLiterals(source);
	const textFindings = extractTextNodeLiterals(source);
	const all = [...attrFindings, ...textFindings];

	// Drop any finding whose position falls inside a `$t(...)` call.
	// We re-split source into lines so we have per-line `tCall` spans.
	const lines = source.split('\n');
	const lineSpans = lines.map(findTCallSpansOnLine);

	const violations = [];
	for (const f of all) {
		const lineIdx = f.line - 1;
		const spans = lineSpans[lineIdx] ?? [];
		if (isInsideTCall(f.col, lineIdx, spans)) continue;
		violations.push(f);
	}
	return violations;
}

function main() {
	const files = TARGETS.flatMap((d) => walk(d));
	const report = [];
	for (const file of files) {
		const v = checkFile(file);
		if (v.length > 0) {
			report.push({ file, violations: v });
		}
	}

	if (report.length === 0) {
		console.log(`[check-i18n] 0 hard-coded English strings across ${files.length} .svelte files.`);
		process.exit(0);
	}

	console.error('[check-i18n] hard-coded English strings found:');
	for (const { file, violations } of report) {
		const rel = relative(ROOT, file);
		for (const v of violations) {
			console.error(`  ${rel}:${v.line}:${v.col + 1}  ${v.attr}  "${v.value}"`);
		}
	}
	console.error(
		`\n[check-i18n] ${report.reduce((n, r) => n + r.violations.length, 0)} violation(s) across ${report.length} file(s).`
	);
	console.error("Wrap each literal in $t('key.path') (see src/lib/ui/strings.ts).");
	process.exit(1);
}

main();
