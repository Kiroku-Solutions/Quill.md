/**
 * Issue filename conventions (ERS §6.1.1).
 *
 * - `id` is a positive integer, zero-padded to at least 4 digits.
 * - `slug` is the kebab-cased title, lowercased, non-alphanumerics collapsed to `-`.
 * - Filename is `<id>-<slug>.md`.
 */

const NON_ALNUM = /[^a-z0-9]+/g;
const LEADING_TRAILING_DASH = /^-+|-+$/g;

/**
 * Convert a title to a filename-safe slug.
 * Falls back to `untitled` for inputs that produce an empty slug (e.g. only emoji).
 */
export function slugify(title: string): string {
	const slug = title
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '') // strip combining marks
		.replace(NON_ALNUM, '-')
		.replace(LEADING_TRAILING_DASH, '');
	return slug || 'untitled';
}

/**
 * Compose the canonical issue filename from id + title.
 * Example: `buildIssueFilename('123e4567-e89b-12d3-a456-426614174000', 'Fix login redirect!')` → `123e4567-e89b-12d3-a456-426614174000-fix-login-redirect.md`.
 */
export function buildIssueFilename(id: string, title: string): string {
	return `${id}-${slugify(title)}.md`;
}

/**
 * Return a newly generated UUID for a new issue.
 */
export function nextIssueId(): string {
	return globalThis.crypto.randomUUID();
}
