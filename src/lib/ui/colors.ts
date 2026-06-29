/**
 * Shared colour helpers for hero surfaces (sub-phase 6E).
 *
 * `fallbackColor(type)` is the deterministic hash → oklch-colour
 * helper the Gantt view and the new-issue type picker share when a
 * template does not define its own `color` (ERS §6.2.3 makes `color`
 * required, but the helper exists as a defensive backstop in case a
 * user-authored template omits the field). The palette is fixed at 8
 * daisyUI-compatible tokens and the hash is a pure 32-bit integer
 * multiply (no `Date.now()` / `Math.random()`), so the function is
 * SSR-safe and snapshot-stable.
 */
const FALLBACK_PALETTE: readonly string[] = [
	'oklch(70% 0.15 240)', // blue
	'oklch(70% 0.15 145)', // green
	'oklch(70% 0.15 75)', // amber
	'oklch(70% 0.15 25)', // red
	'oklch(70% 0.15 300)', // purple
	'oklch(70% 0.15 180)', // cyan
	'oklch(70% 0.15 320)', // pink
	'oklch(70% 0.15 60)' // orange
];

/**
 * Compute a deterministic fallback colour for an issue type whose
 * template did not define a `color`. The 32-bit multiply-xor hash is
 * pure and side-effect-free; the same input always returns the same
 * output.
 */
export function fallbackColor(type: string): string {
	let h = 0;
	for (let i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) >>> 0;
	return FALLBACK_PALETTE[h % FALLBACK_PALETTE.length] ?? '#64748b';
}
