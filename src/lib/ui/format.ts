/**
 * Shared formatting helpers used by primitive-adjacent components.
 *
 * The hero / chrome surfaces (`RecentFoldersList`, `RemoteToolbar`, future
 * surfaces in 6G–6K) occasionally need small, pure formatting functions
 * that are easier to test in isolation than inline in the component. This
 * module collects them.
 *
 * Every helper is a PURE function: it does not read `Date.now()`, does
 * not depend on the locale of the host (English-only per NFR-6 v1), and
 * takes the current time as a parameter so callers can pin it from a
 * `const now = Date.now()` they capture once per render.
 */

/**
 * Format the elapsed time between `addedAt` and `now` as a short human
 * label. Pure: no side effects, no `Date.now()` reads.
 *
 * Buckets:
 *   ≤ 60s        → "just now"
 *   ≤ 60min      → "N min ago"
 *   ≤ 24h        → "N hours ago"
 *   24–48h       → "yesterday"
 *   > 48h        → "N days ago"
 *
 * Negative deltas (clock skew, future-dated records) are clamped to `0`.
 */
export function formatRelative(addedAt: number, now: number): string {
	const diffMs = Math.max(0, now - addedAt);
	const seconds = Math.floor(diffMs / 1000);
	if (seconds < 60) return 'just now';
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} hours ago`;
	const days = Math.floor(hours / 24);
	if (days === 1) return 'yesterday';
	return `${days} days ago`;
}
