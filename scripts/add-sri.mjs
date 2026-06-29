#!/usr/bin/env node
/**
 * Add Subresource Integrity hashes to every modulepreload / script tag in
 * the SvelteKit `build/index.html`. Runs after `vite build` to enforce that
 * the production bundle ships with SHA-384 integrity attributes and the
 * matching `crossorigin="anonymous"` flag — the canonical mitigation
 * against CDN compromise / supply-chain injection.
 *
 * ## Why this script (and not a Vite plugin)
 *
 * Vite 8 + adapter-static + `crossorigin="anonymous"` on modulepreloads
 * is a documented footgun: crossorigin scripts are subject to CORS, and
 * SvelteKit's built-in preload helper does not emit the correct origin
 * for a static deploy. Adding `integrity=` post-build is the lowest-risk
 * way to ship SRI without touching the Vite internals.
 *
 * ## What it does
 *
 *  1. Reads `build/index.html`.
 *  2. For every `<link rel="modulepreload" href="…">` and every
 *     `<script type="module" src="…">`, hashes the target file with
 *     SHA-384 and adds `integrity="sha384-…"` + `crossorigin="anonymous"`.
 *  3. Emits the rewritten HTML back to disk.
 *  4. Writes a sibling `build/integrity.json` mapping URL → expected hash
 *     so a deploy step can compare it against the actual host response.
 *  5. Emits a one-line banner to stdout with the entry count — wired into
 *     `pnpm build` so the count is visible in CI logs.
 *
 * ## What it does NOT do
 *
 *  - Does NOT modify the CSP. The `static/_headers` file is the
 *    canonical source for CSP directives; this script is SRI-only. A
 *    verifier that runs alongside this script (`scripts/check-csp.mjs`)
 *    scans the bundle for `eval`/`Function`/`document.write` patterns;
 *    see `docs/audits/2026-06-23/step-6-csp.md` for the full picture.
 *  - Does NOT add `'unsafe-inline'` to the CSP. SRI and CSP are
 *    orthogonal; this script only stamps `integrity=` on tags that are
 *    already present.
 *  - Does NOT touch `static/_headers` or `static/_redirects`. Those are
 *    copied verbatim into `build/` by SvelteKit's `adapter-static` from
 *    the `static/` directory.
 *
 * ## Idempotent
 *
 * Re-running the script on an already-hashed file is a no-op (the regex
 * skips tags that already carry an `integrity=` attribute). The integrity
 * map in `build/integrity.json` is overwritten on every run; that is
 * the canonical record.
 *
 * ## Exit codes
 *
 *  - 0 — every referenced asset exists and got an `integrity=`; the
 *    `build/integrity.json` map was written.
 *  - 1 — `build/index.html` is missing or unreadable.
 *  - 2 — a target asset cannot be read.
 *  - 99 — unexpected runtime error.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const buildDir = resolve(repoRoot, 'build');
const indexPath = resolve(buildDir, 'index.html');

async function sha384Base64(buf) {
	return createHash('sha384').update(buf).digest('base64');
}

/**
 * Extract the asset URL from a tag match — the regex alternation produces
 * either group 1 or group 2 as the URL. Returns null if neither is set.
 *
 * @param {RegExpMatchArray} m
 * @returns {string | null}
 */
function matchUrl(m) {
	return m[1] ?? m[2] ?? null;
}

/**
 * Extract the trailing attribute string from a tag match — group 3 in
 * our regex. May be empty.
 *
 * @param {RegExpMatchArray} m
 * @returns {string}
 */
function matchRest(m) {
	return m[3] ?? '';
}

/**
 * Rewrite every `<tag>` matched by `re` so it carries `integrity=` +
 * `crossorigin="anonymous"`. Idempotent — tags that already carry an
 * `integrity=` are left alone.
 *
 * @param {string} html
 * @param {RegExp} re
 * @param {Record<string, string>} integrityMap
 */
async function rewriteTags(html, re, integrityMap) {
	const matches = [...html.matchAll(re)];
	let result = html;
	for (const m of matches) {
		const fullTag = m[0];
		if (/integrity=/.test(fullTag)) continue;
		const url = matchUrl(m);
		if (!url) continue;
		const rest = matchRest(m);
		const assetPath = resolve(buildDir, url.replace(/^\//, ''));
		let buf;
		try {
			buf = await readFile(assetPath);
		} catch (err) {
			console.error(`add-sri: cannot read asset ${assetPath}: ${err.message}`);
			process.exit(2);
		}
		const hash = `sha384-${await sha384Base64(buf)}`;
		integrityMap[url] = hash;
		const stripped = rest.replace(/\s*crossorigin="[^"]*"/g, '');
		const replacement = fullTag.replace(
			/\/?>$/,
			` ${stripped} integrity="${hash}" crossorigin="anonymous" />`
		);
		result = result.replace(fullTag, replacement);
	}
	return result;
}

async function main() {
	let html;
	try {
		html = await readFile(indexPath, 'utf8');
	} catch (err) {
		console.error(`add-sri: cannot read ${indexPath}: ${err.message}`);
		process.exit(1);
	}

	const integrityMap = {};
	let rewritten = html;

	// Match either attribute order — SvelteKit emits
	// `<link href="…" rel="modulepreload">`. Group 3 captures any trailing
	// attributes for round-tripping.
	const tagPatterns = [
		/<link\s+(?:rel="modulepreload"\s+href="([^"]+)"|href="([^"]+)"\s+rel="modulepreload")\s*([^>]*?)\/?>/g,
		/<script\s+(?:type="module"\s+src="([^"]+)"|src="([^"]+)"\s+type="module")\s*([^>]*?)\/?>/g
	];

	for (const re of tagPatterns) {
		rewritten = await rewriteTags(rewritten, re, integrityMap);
	}

	const out = resolve(buildDir, 'integrity.json');
	await writeFile(indexPath, rewritten, 'utf8');
	await writeFile(out, JSON.stringify(integrityMap, null, 2), 'utf8');

	// Verify the integrity map was written. Read it back and
	// check the entry count matches the in-memory map. This is
	// a defence-in-depth check for a flaky write; `writeFile`
	// already throws on failure, but a partial write would
	// otherwise pass silently.
	const written = JSON.parse(await readFile(out, 'utf8'));
	const expected = Object.keys(integrityMap).length;
	if (Object.keys(written).length !== expected) {
		console.error(
			`add-sri: integrity map mismatch — wrote ${expected} entries but read back ${Object.keys(written).length} from ${out}`
		);
		process.exit(2);
	}
	console.log(`add-sri: wrote ${expected} integrity entries to ${out} (verified by re-read)`);
}

main().catch((err) => {
	console.error(`add-sri: unexpected error: ${err.stack ?? err.message}`);
	process.exit(99);
});
