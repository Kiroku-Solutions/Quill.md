/**
 * PAT brand + redaction. The PAT must never appear in logs, error messages,
 * URLs, or the public surface of any store. This module is the single
 * source of truth for "is this string a PAT we recognised?".
 *
 * The brand works at two levels:
 *  - At compile time, `Pat` is a nominal string type. Code that does not
 *    import from here cannot accept a PAT without going through the brand.
 *  - At runtime, `PAT_REGISTRY` holds every PAT we have ever branded, so
 *    the redactor can replace them before any stringification.
 *
 * NFR-2 contract: a PAT is in-memory only (sessionStorage persistence is
 * gated on `sessionStorage` clear — see `src/lib/state/pat-storage.ts`).
 */

const PAT_BRAND: unique symbol = Symbol('quill-md:pat');

export type Pat = string & { readonly [PAT_BRAND]: true };

const PAT_REGISTRY = new Set<string>();

/** Brand a raw PAT string. Only provider / storage modules call this. */
export function brandPat(value: string): Pat {
	PAT_REGISTRY.add(value);
	return value as Pat;
}

/** True iff `value` was registered through {@link brandPat}. */
export function isBrandedPat(value: unknown): value is Pat {
	return typeof value === 'string' && PAT_REGISTRY.has(value);
}

/** Redact a string if it is in the registry. Returns the input verbatim otherwise. */
export function redactIfPat(value: string): string {
	return PAT_REGISTRY.has(value) ? '[REDACTED:PAT]' : value;
}

/**
 * Drop a PAT from the registry. Used by `signOut` and tests.
 * Safe to call with values that were never branded.
 */
export function unbrandPat(value: string): void {
	PAT_REGISTRY.delete(value);
}

/**
 * Replace any PAT-shaped substring in `text` with the redaction sentinel.
 * Defends against accidental `console.log` of an HTTP request body that
 * contains a bearer token not in the registry.
 */
export function redactPatInText(text: string): string {
	// GitHub classic 40-hex, GitHub fine-grained ghp_*, GitHub OAuth gho_*,
	// GitHub PAT ghs_*/ghr_*, GitLab glpat-*.
	const pattern = /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|glpat-[A-Za-z0-9_-]{20,}|[a-f0-9]{40})\b/g;
	return text.replace(pattern, '[REDACTED:PAT]');
}
