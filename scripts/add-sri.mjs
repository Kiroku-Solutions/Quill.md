#!/usr/bin/env node
/**
 * Post-build transformations for the production bundle.
 *
 * Runs after `vite build` to enforce three orthogonal invariants that
 * the bundler cannot (or does not) emit on its own:
 *
 *  1. **Subresource Integrity (SRI)** — every `<link rel="modulepreload">`
 *     and every `<script type="module" src="…">` in `build/index.html`
 *     gets `integrity="sha384-…"` + `crossorigin="anonymous"`. The canonical
 *     mitigation against CDN compromise / supply-chain injection.
 *  2. **Per-build CSP nonce** — a fresh 128-bit hex nonce is generated
 *     on every run. It is stamped into:
 *       - the `<script>` in `<head>` (the no-flash theme bootstrap in
 *         `src/app.html`) so the inline script is allowed by the
 *         `script-src 'nonce-…'` directive;
 *       - the `Content-Security-Policy` line of `build/_headers`,
 *         replacing the `__CSP_NONCE__` placeholder emitted by
 *         `static/_headers`.
 *     A canonical record of the nonce is also written to
 *     `build/csp-nonce.txt` so a deploy step can compare it against
 *     the served response.
 *  3. **`build/integrity.json`** — the URL → expected-hash map so a
 *     verifier can confirm the deployed CDN did not mutate the assets.
 *
 * ## Why this script (and not a Vite plugin)
 *
 * Vite 8 + adapter-static + `crossorigin="anonymous"` on modulepreloads
 * is a documented footgun: crossorigin scripts are subject to CORS, and
 * SvelteKit's built-in preload helper does not emit the correct origin
 * for a static deploy. Adding `integrity=` post-build is the lowest-risk
 * way to ship SRI without touching the Vite internals. The nonce work
 * is post-build for the same reason: the placeholder-based contract with
 * `static/_headers` is easier to audit than a Vite plugin would be.
 *
 * ## What it does NOT do
 *
 *  - Does NOT touch the `static/` source tree. All edits are confined
 *    to `build/`, which `adapter-static` regenerates on every `pnpm build`.
 *  - Does NOT add `'unsafe-inline'` to the CSP. SRI and CSP are
 *    orthogonal; this script only stamps `integrity=` on tags that are
 *    already present, and only adds a nonce — the script-src value
 *    still contains `'unsafe-inline'` for hosts (e.g. plain GitHub
 *    Pages) that do not honour `_headers` and therefore cannot
 *    deliver a nonce. The meta-CSP fallback in `src/app.html` keeps
 *    `'self' 'unsafe-inline'` for the same reason.
 *
 * ## Idempotent
 *
 * Re-running the script on an already-hashed file is a no-op (the SRI
 * regex skips tags that already carry an `integrity=` attribute; the
 * nonce rewrite replaces the placeholder unconditionally, so a second
 * run is a different nonce — never an issue because `pnpm build`
 * always regenerates `build/` from scratch). The integrity map and
 * the nonce file in `build/` are overwritten on every run; those are
 * the canonical records.
 *
 * ## Exit codes
 *
 *  - 0 — every referenced asset exists and got an `integrity=`; the
 *    `build/integrity.json` map and the `build/csp-nonce.txt` file
 *    were written; `build/_headers` carries the same nonce as the
 *    inline `<script>` in `build/index.html`.
 *  - 1 — `build/index.html` is missing or unreadable.
 *  - 2 — a target asset cannot be read.
 *  - 3 — the `__CSP_NONCE__` placeholder was not found in
 *    `build/_headers`, or the inline `<script>` could not be
 *    stamped.
 *  - 99 — unexpected runtime error.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const buildDir = resolve(repoRoot, 'build');
const indexPath = resolve(buildDir, 'index.html');
const headersPath = resolve(buildDir, '_headers');
const nonceFilePath = resolve(buildDir, 'csp-nonce.txt');

/** Placeholder emitted by `static/_headers` that this script replaces. */
const NONCE_PLACEHOLDER = '__CSP_NONCE__';

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

/**
 * Generate a fresh 128-bit nonce as 32 lowercase hex characters. The hex
 * encoding is what `Content-Security-Policy: script-src 'nonce-…'`
 * expects, and 128 bits of entropy is what the spec recommends for
 * per-build nonces.
 *
 * @returns {string}
 */
function generateNonce() {
	return randomBytes(16).toString('hex');
}

/**
 * Replace the `__CSP_NONCE__` placeholder in the `script-src` directive
 * of `build/_headers` with the supplied nonce. Idempotent: a missing
 * placeholder is a hard error (exit 3) because it means `static/_headers`
 * drifted away from the contract this script expects.
 *
 * @param {string} headers
 * @param {string} nonce
 * @returns {string}
 */
function rewriteHeadersNonce(headers, nonce) {
	if (!headers.includes(NONCE_PLACEHOLDER)) {
		console.error(
			`add-sri: __CSP_NONCE__ placeholder not found in build/_headers — ` +
				'static/_headers must include the placeholder in its script-src.'
		);
		process.exit(3);
	}
	return headers.split(NONCE_PLACEHOLDER).join(nonce);
}

/**
 * Stamp the supplied nonce onto the first `<script>…</script>` element
 * in `html` (the no-flash theme bootstrap from `src/app.html`). If a
 * `nonce` attribute is already present it is replaced. Only the first
 * script element is touched — SvelteKit's own inline module bootstrap
 * runs *after* the no-flash script and is allowed by `'unsafe-inline'`.
 *
 * @param {string} html
 * @param {string} nonce
 * @returns {{ html: string, stamped: boolean }}
 */
function stampInlineScriptNonce(html, nonce) {
	const re = /<script\b([^>]*)>/g;
	const matches = [...html.matchAll(re)];
	if (matches.length === 0) {
		console.error(
			'add-sri: no <script> element found in build/index.html — ' +
				'cannot stamp scripts with a nonce.'
		);
		process.exit(3);
	}
	let result = html;
	for (const m of matches) {
		const fullTag = m[0];
		const attrs = m[1] ?? '';
		const stripped = attrs.replace(/\s*nonce="[^"]*"/g, '').replace(/\s+$/, '');
		const stamped = `<script${stripped} nonce="${nonce}">`;
		result = result.replace(fullTag, stamped);
	}
	return { html: result, stamped: true };
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

	// Per-build CSP nonce. Generated AFTER the SRI pass so a partial
	// failure on the SRI side does not leak a valid nonce to the
	// filesystem.
	const nonce = generateNonce();
	const { html: htmlWithNonce } = stampInlineScriptNonce(rewritten, nonce);
	rewritten = htmlWithNonce;

	const integrityOut = resolve(buildDir, 'integrity.json');
	await writeFile(indexPath, rewritten, 'utf8');
	await writeFile(integrityOut, JSON.stringify(integrityMap, null, 2), 'utf8');

	// Replace the `__CSP_NONCE__` placeholder in `build/_headers`. The
	// file is copied verbatim from `static/_headers` by adapter-static
	// before this script runs, so the placeholder is guaranteed to be
	// present (unless `static/_headers` drifts away from the contract).
	const headersSource = await readFile(headersPath, 'utf8');
	const headersWithNonce = rewriteHeadersNonce(headersSource, nonce);
	await writeFile(headersPath, headersWithNonce, 'utf8');
	await writeFile(nonceFilePath, `${nonce}\n`, 'utf8');

	// Verify the integrity map was written. Read it back and
	// check the entry count matches the in-memory map. This is
	// a defence-in-depth check for a flaky write; `writeFile`
	// already throws on failure, but a partial write would
	// otherwise pass silently.
	const written = JSON.parse(await readFile(integrityOut, 'utf8'));
	const expected = Object.keys(integrityMap).length;
	if (Object.keys(written).length !== expected) {
		console.error(
			`add-sri: integrity map mismatch — wrote ${expected} entries but read back ${Object.keys(written).length} from ${integrityOut}`
		);
		process.exit(2);
	}

	// Round-trip the nonce file and the rewritten headers; if the
	// placeholder wasn't actually replaced (e.g. a write was silently
	// dropped) the next read shows the literal `__CSP_NONCE__` and we
	// fail fast.
	const headersReadBack = await readFile(headersPath, 'utf8');
	if (headersReadBack.includes(NONCE_PLACEHOLDER)) {
		console.error(
			`add-sri: nonce was not actually written to ${headersPath} (placeholder still present)`
		);
		process.exit(3);
	}
	const nonceReadBack = (await readFile(nonceFilePath, 'utf8')).trim();
	if (nonceReadBack !== nonce) {
		console.error(
			`add-sri: nonce file mismatch — generated ${nonce} but read back ${nonceReadBack} from ${nonceFilePath}`
		);
		process.exit(3);
	}

	console.log(
		`add-sri: wrote ${expected} integrity entries to ${integrityOut} (verified by re-read)`
	);
	console.log(
		`add-sri: wrote per-build CSP nonce (${nonce}) to ${headersPath} and ${nonceFilePath} (verified by re-read)`
	);
}

main().catch((err) => {
	console.error(`add-sri: unexpected error: ${err.stack ?? err.message}`);
	process.exit(99);
});
