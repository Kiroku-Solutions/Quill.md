/**
 * sessionStorage-backed PAT persistence (ERS C-6 amendment).
 *
 * The original NFR-2 forbade persisting the PAT in any form. This module
 * weakens that to "session-scoped only" so a refresh / tab return does
 * not re-prompt the user for the token. The PAT lives in `sessionStorage`
 * under namespaced keys and is dropped:
 *   - when the user signs out (via {@link clearPat}),
 *   - when the browser closes the tab (sessionStorage is per-tab),
 *   - when the user explicitly clicks "Forget PAT" in Settings.
 *
 * The PAT is still NEVER written to IndexedDB, `localStorage`, URLs, or
 * any non-namespaced key. Only this module touches the `quill-md.*`
 * sessionStorage keys, so the rest of the codebase can reason about PAT
 * hygiene by reading this file.
 */

import type { RepoUrl, Branch } from '../adapters/index.ts';

const KEY_PAT = 'quill-md.remote-pat';
const KEY_SESSION = 'quill-md.remote-session';

export interface RemoteSessionMeta {
	readonly providerId: string;
	readonly url: RepoUrl;
	readonly editBranch: Branch;
	readonly customBaseUrl?: string;
	readonly displayName: string;
	readonly authorLogin: string;
}

/** Read the persisted PAT, or null if absent. SSR-safe (returns null). */
export function readPat(): string | null {
	if (typeof sessionStorage === 'undefined') return null;
	try {
		return sessionStorage.getItem(KEY_PAT);
	} catch {
		return null;
	}
}

/** Persist the PAT in sessionStorage. SSR-safe (no-op). */
export function writePat(pat: string): void {
	if (typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.setItem(KEY_PAT, pat);
	} catch {
		// Quota / SecurityError — silently drop. The in-memory copy still
		// works for the current session.
	}
}

/** Drop the PAT from sessionStorage. SSR-safe (no-op). */
export function clearPat(): void {
	if (typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.removeItem(KEY_PAT);
		sessionStorage.removeItem(KEY_SESSION);
	} catch {
		// Best effort.
	}
}

/** Read the persisted session metadata, or null if absent. */
export function readSessionMeta(): RemoteSessionMeta | null {
	if (typeof sessionStorage === 'undefined') return null;
	try {
		const raw = sessionStorage.getItem(KEY_SESSION);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as RemoteSessionMeta;
		return parsed;
	} catch {
		return null;
	}
}

/** Persist the session metadata alongside the PAT. SSR-safe (no-op). */
export function writeSessionMeta(meta: RemoteSessionMeta): void {
	if (typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.setItem(KEY_SESSION, JSON.stringify(meta));
	} catch {
		// Best effort.
	}
}
