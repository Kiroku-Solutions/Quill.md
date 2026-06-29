/**
 * FR-15 integrity hash.
 *
 * Algorithm: SHA-256 via the Web Crypto API (`crypto.subtle.digest`). No
 * third-party hashing library is needed. The hash is stored in the form
 * `sha256:<hex>` per ERS §3.1 FR-15.
 *
 * On Node (>=19) and modern browsers, `globalThis.crypto.subtle` is available
 * without polyfills. The `crypto` global is imported via `globalThis` so the
 * module is loadable in both runtimes.
 */

const HASH_PREFIX = 'sha256:' as const;
const INTEGRITY_HASH_LINE = /^integrity_hash:.*\r?\n?/m;

/** Compute the raw SHA-256 hex digest of a UTF-8 string. */
export async function sha256Hex(text: string): Promise<string> {
	const bytes = new TextEncoder().encode(text);
	const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
	const view = new Uint8Array(digest);
	let hex = '';
	for (let i = 0; i < view.length; i++) {
		const byte = view[i];
		if (byte === undefined) continue;
		hex += byte.toString(16).padStart(2, '0');
	}
	return hex;
}

/** Compute the canonical `sha256:<hex>` integrity hash for the given text. */
export async function computeIntegrityHash(text: string): Promise<string> {
	return `${HASH_PREFIX}${await sha256Hex(text)}`;
}

/**
 * Remove the `integrity_hash` line from a serialized issue file.
 *
 * Used to compute the canonical form whose hash is then compared to the
 * stored value. The regex matches a single line including its newline;
 * any blank line left behind is treated as semantically equivalent by the
 * canonical-form comparison.
 */
export function stripIntegrityHashLine(text: string): string {
	return text.replace(INTEGRITY_HASH_LINE, '');
}

/**
 * Validate a stored integrity hash against a freshly computed one.
 * Returns `true` only when the stored value is well-formed and matches.
 */
export async function verifyIntegrity(storedIntegrityHash: string, text: string): Promise<boolean> {
	if (typeof storedIntegrityHash !== 'string' || !storedIntegrityHash.startsWith(HASH_PREFIX))
		return false;
	const expected = await computeIntegrityHash(stripIntegrityHashLine(text));
	return expected === storedIntegrityHash;
}
