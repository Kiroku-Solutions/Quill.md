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

/** Zero-pad an issue id to a minimum of 4 digits for lexicographic ordering. */
export function padIssueId(id: number): string {
	return Math.max(1, id).toString().padStart(4, '0');
}

/**
 * Compose the canonical issue filename from id + title.
 * Example: `buildIssueFilename(42, 'Fix login redirect!')` → `0042-fix-login-redirect.md`.
 */
export function buildIssueFilename(id: number, title: string): string {
	return `${padIssueId(id)}-${slugify(title)}.md`;
}

/**
 * Return the next available issue id given the current set.
 * Starts at 1 when the set is empty. Does not reuse deleted ids.
 */
export function nextIssueId(issues: ReadonlyArray<{ id: number }>): number {
	if (issues.length === 0) return 1;
	let max = 0;
	for (const i of issues) if (i.id > max) max = i.id;
	return max + 1;
}
