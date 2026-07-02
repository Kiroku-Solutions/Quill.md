#!/usr/bin/env node
/**
 * check-csp.mjs — fail-the-build lint for the production bundle.
 * Sub-phase 6L, audit carry-over (security audit 2026-06-22, §
 * "Transport-layer headers" + "Subresource Integrity").
 *
 * Scans the SvelteKit `build/` output for code patterns that are
 * unsafe in a strict CSP context:
 *
 *   - `eval(`            — implicit code execution
 *   - `new Function(`    — `Function` constructor
 *   - `Function(`        — bare `Function(...)` call
 *   - `document.write(`  — parser-blocking DOM injection
 *
 * The CSP shipped in `static/_headers` is `script-src 'self'
 * 'unsafe-inline'` (v0 trade-off — see
 * `docs/audits/2026-06-23/step-6-csp.md` § 3 for the path to
 * per-build nonces). `'unsafe-inline'` does NOT cover
 * `eval`/`Function` (those require `'unsafe-eval'`). The
 * scanner's job is to catch NEW violations in our own code;
 * known third-party library patterns are allow-listed and
 * reported as warnings, not failures, with a follow-up recorded
 * in the audit doc.
 *
 * ## Zones
 *
 *   - `build/index.html`     — the inline no-flash script in
 *     `src/app.html` is the single allowed `eval`-shape; the
 *     scanner still scans for `eval`/`Function` in this file
 *     and flags any match OUTSIDE the no-flash comment block.
 *   - `build/_app/immutable/` — every chunk. Allow-list
 *     entries are explicit (see ALLOWLIST below).
 *
 * ## Allow-list
 *
 *   - `pako` inflate fast path (transitive via
 *     `isomorphic-git`). `pako` uses `Function(...)` to
 *     JIT-compile a specialized inflate function the first
 *     time it sees a new code-table; the slow path is
 *     always available and is what isomorphic-git's packfile
 *     reader uses in practice. Pattern: the literal
 *     `if(u=Function(\`binder\`` is unique to pako's
 *     `inflate.cmp` style bundle.
 *
 *     **Phase 7E** attempted to swap pako for `fflate` via
 *     `pnpm.overrides`. The override is incompatible:
 *     fflate has no `default` export, but isomorphic-git
 *     does `import pako from 'pako'`, and the two libraries
 *     differ in the streaming inflate shape (fflate's
 *     `Inflate` is callback-based; pako's is stream-push).
 *     The Phase 7E fallback ("remove pako from the
 *     allow-list") also fails because pako IS in the runtime
 *     bundle (it's a transitive dep of `isomorphic-git`,
 *     not of `@isomorphic-git/lightning-fs` as the task
 *     description suggested). See `deliverable.md` for the
 *     full investigation. The pako allow-list is therefore
 *     kept; the `Function(\`binder\`)` substring remains
 *     in the bundle, but is gated behind `option.fast` in
 *     pako's source and is never executed at runtime.
 *
 * ## Exit codes
 *  - 0 — no violations, or only allow-listed warnings.
 *  - 1 — one or more violations found.
 *  - 2 — `build/` missing (i.e. the build hasn't run yet).
 *
 * ## False positives
 *
 * `eval(` and `Function(` can appear as substrings in string
 * literals (e.g. a comment in the bundle that says
 * `// do not use eval`). The scanner cannot distinguish a call
 * site from a string mention without a full parser. In
 * practice these are rare; the audit doc records the known
 * false-positive surface so a follow-up can swap the regex for
 * an AST-based scan if it ever bites.
 *
 * Wired into `pnpm build` and `pnpm lint` via the package
 * scripts.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const BUILD_DIR = resolve(ROOT, 'build');
const INDEX_PATH = resolve(BUILD_DIR, 'index.html');
const IMMUTABLE_DIR = resolve(BUILD_DIR, '_app', 'immutable');

/**
 * Patterns, in the order they are reported. The Function
 * pattern uses a negative lookbehind to skip identifier-chars
 * (e.g. `myFunction(`) and method-chains (e.g.
 * `Reflect.Function(`); the latter is theoretical, but the
 * negative lookbehind is free and removes a class of false
 * positives at zero cost.
 */
const PATTERNS = [
	{ name: 'eval()', re: /\beval\s*\(/g },
	{ name: 'new Function()', re: /\bnew\s+Function\s*\(/g },
	{ name: 'Function()', re: /(?<![\w$.$])Function\s*\(/g },
	{ name: 'document.write()', re: /\bdocument\s*\.\s*write\s*\(/g }
];

/**
 * Allow-list of (matcher, pattern-name) tuples. A match is
 * allow-listed if EITHER the file path contains `matcher` OR
 * the snippet around the match contains `matcher`, AND the
 * pattern-name matches. Allow-listed matches are reported
 * as warnings (printed to stdout) but do not fail the build.
 *
 * The dual condition (file or snippet) is needed because
 * minified bundles don't carry their upstream package name
 * in the file name; the source marker is the only reliable
 * signal.
 *
 * Each entry MUST have a comment in the audit doc explaining
 * why the pattern is allow-listed and what the follow-up is.
 */
const ALLOWLIST = [
	{
		// pako inflate fast-path JIT. See audit doc
		// §"Known third-party CSP issues". The marker
		// `if(u=Function(\`binder\`` is unique to pako's
		// `inflate.cmp` style bundle.
		//
		// Phase 7E attempted to swap pako for fflate via
		// `pnpm.overrides`; the override is incompatible
		// (fflate has no `default` export, but isomorphic-git
		// does `import pako from 'pako'`). The
		// `Function(\`binder\`)` substring is therefore
		// kept in the bundle; it is dead code at runtime
		// (pako only invokes it when `option.fast` is set,
		// and isomorphic-git does not set it). The CSP
		// `script-src` does not include `'unsafe-eval'`,
		// so the browser would reject the call even if it
		// were reached. See the `## Allow-list` section
		// above for the full rationale.
		matcher: 'Function(`binder`',
		pattern: 'Function()',
		note: 'pako inflate fast path; gated behind option.fast, never invoked by isomorphic-git.'
	},
	{
		matcher: 'Function(`bodies`,',
		pattern: 'Function()',
		note: '3d-force-graph physics engine (d3-force/force-graph) performance loop.'
	},
	{
		matcher: 'Function(`options`,',
		pattern: 'Function()',
		note: '3d-force-graph physics options compiler.'
	},
	{
		matcher: '{Body:r}=Function(n)()',
		pattern: 'Function()',
		note: '3d-force-graph internal JIT generation.'
	},
	{
		matcher: 'return Function(t)()',
		pattern: 'Function()',
		note: '3d-force-graph internal JIT fallback.'
	},
	{
		matcher: 'Function(`return this`)()',
		pattern: 'Function()',
		note: 'Standard global object polyfill used by three.js/d3-force.'
	}
];

/**
 * Locate the column for an absolute offset within a (possibly
 * multi-line) string. Returns `{ line, column }`, both 1-based.
 *
 * @param {string} source
 * @param {number} offset
 */
function lineColumn(source, offset) {
	let line = 1;
	let lastNewline = -1;
	for (let i = 0; i < offset; i++) {
		if (source.charCodeAt(i) === 10) {
			line++;
			lastNewline = i;
		}
	}
	return { line, column: offset - lastNewline };
}

/**
 * Recursively collect every file under `dir` matching `suffix`.
 *
 * @param {string} dir
 * @param {string} suffix
 * @param {string[]} out
 * @returns {string[]}
 */
function walkJs(dir, out = []) {
	let entries;
	try {
		entries = readdirSync(dir);
	} catch {
		return out;
	}
	for (const name of entries) {
		const full = join(dir, name);
		let st;
		try {
			st = statSync(full);
		} catch {
			continue;
		}
		if (st.isDirectory()) walkJs(full, out);
		else if (name.endsWith('.js')) out.push(full);
	}
	return out;
}

/**
 * Find the allow-list entry that matches a given
 * (file, pattern, snippet) tuple. Returns the note string
 * (which doubles as the allow-list reason) or null if the
 * match is not allow-listed.
 *
 * @param {string} file
 * @param {string} pattern
 * @param {string} snippet
 */
function allowListReason(file, pattern, snippet) {
	for (const entry of ALLOWLIST) {
		if (entry.pattern !== pattern) continue;
		if (file.includes(entry.matcher) || snippet.includes(entry.matcher)) {
			return entry.note;
		}
	}
	return null;
}

/**
 * Scan a single file's source for the four patterns. Returns
 * a list of `{ pattern, line, column, snippet, allowListed,
 * allowListNote }` findings.
 *
 * @param {string} path
 * @param {string} source
 */
function scanFile(path, source) {
	const findings = [];
	for (const { name, re } of PATTERNS) {
		// Reset lastIndex by re-creating the regex per file.
		const local = new RegExp(re.source, re.flags);
		let m;
		while ((m = local.exec(source)) !== null) {
			const { line, column } = lineColumn(source, m.index);
			// Snippet: 60 chars around the match, single-line
			// (minified bundles are one line; multi-line files
			// would be source-level violations that the dev
			// sees immediately anyway).
			const start = Math.max(0, m.index - 20);
			const end = Math.min(source.length, m.index + 40);
			const snippet = source.slice(start, end).replace(/\s+/g, ' ').slice(0, 80);
			const reason = allowListReason(path, name, snippet);
			findings.push({
				file: path,
				pattern: name,
				line,
				column,
				snippet,
				allowListed: reason !== null,
				allowListNote: reason
			});
			// Guard against zero-length matches looping forever.
			if (m.index === local.lastIndex) local.lastIndex++;
		}
	}
	return findings;
}

function main() {
	// Check `build/` exists. If not, the build hasn't run —
	// we want a clear error rather than a silent pass.
	try {
		statSync(BUILD_DIR);
	} catch {
		console.error(`[check-csp] build directory not found: ${BUILD_DIR}`);
		console.error('[check-csp] run `pnpm build` first.');
		process.exit(2);
	}

	const allFindings = [];

	// Zone 1: `build/index.html`. The inline no-flash script
	// is the single allowed `eval`-shape. The body has no
	// inline scripts in the current build; the no-flash
	// script lives in `<head>`. The scanner treats every
	// match as a violation; the no-flash script is exempt
	// because it doesn't match any of the four patterns
	// (it uses a function declaration, not `eval` or
	// `Function`).
	let indexSource = '';
	try {
		indexSource = readFileSync(INDEX_PATH, 'utf8');
	} catch (err) {
		console.error(`[check-csp] cannot read ${INDEX_PATH}: ${err.message}`);
		process.exit(1);
	}
	allFindings.push(...scanFile(INDEX_PATH, indexSource));

	// Zone 2: every immutable JS chunk. ZERO TOLERANCE
	// (modulo the allow-list).
	const jsFiles = walkJs(IMMUTABLE_DIR);
	for (const f of jsFiles) {
		const source = readFileSync(f, 'utf8');
		allFindings.push(...scanFile(f, source));
	}

	// Split findings into violations (not allow-listed) and
	// warnings (allow-listed). The audit doc records the
	// follow-up for every allow-list entry.
	const violations = allFindings.filter((f) => !f.allowListed);
	const warnings = allFindings.filter((f) => f.allowListed);

	if (violations.length === 0) {
		const summary = [
			`0 violations`,
			`${warnings.length} allow-listed warning(s)`,
			`${jsFiles.length + 1} build file(s) scanned`
		].join(', ');
		console.log(`[check-csp] ${summary}.`);
		for (const w of warnings) {
			console.log(
				`  (allow-listed) ${relative(ROOT, w.file)}:${w.line}:${w.column}  ${w.pattern}  — ${w.allowListNote}`
			);
		}
		process.exit(0);
	}

	console.error('[check-csp] CSP-unsafe patterns found in the production bundle:');
	for (const f of violations) {
		const rel = relative(ROOT, f.file);
		console.error(`  ${rel}:${f.line}:${f.column}  ${f.pattern}  "${f.snippet}"`);
	}
	for (const w of warnings) {
		const rel = relative(ROOT, w.file);
		console.error(
			`  (allow-listed) ${rel}:${w.line}:${w.column}  ${w.pattern}  — ${w.allowListNote}`
		);
	}
	console.error(
		`\n[check-csp] ${violations.length} violation(s) and ${warnings.length} allow-listed warning(s).`
	);
	console.error(
		'  - `eval()` and `Function()` constructors are forbidden; use plain function calls or compile-time transforms.'
	);
	console.error(
		'  - `document.write()` is parser-blocking and forbidden; use DOM APIs to mutate the document.'
	);
	process.exit(1);
}

main();
