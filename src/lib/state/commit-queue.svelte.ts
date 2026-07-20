/**
 * Commit queue — debounced multi-file commit on the remote edit branch.
 *
 * Used by:
 *  - Kanban drag-and-drop: each status change enqueues a write; multiple
 *    drags within `KANBAN_DEBOUNCE_MS` coalesce into a single
 *    `commitBatch` call.
 *  - The editor "Save" action: a single issue save is one commit.
 *
 * Queue contents are not persisted — closing the tab drops pending writes.
 * This is intentional: the user can always re-open the editor and retry.
 *
 * Optimistic concurrency: every queued write carries the `expectedSha`
 * the app last read. If the provider rejects with 409/412, the affected
 * path is dropped from the queue, the error surfaces on the toolbar,
 * and the user must "Pull to refresh" before retrying.
 */

import { resolveProvider, type ParsedRepo, type RemoteFileChange } from '../adapters/index.ts';
import { RemoteConflictError, RemoteFetchError } from '../adapters/errors.ts';
import { fetchSubtree } from '../adapters/remote.ts';

const KANBAN_DEBOUNCE_MS = 2000;

export interface QueuedWrite {
	readonly path: string;
	/** Required for upserts; absent for deletes. */
	readonly content?: string;
	/** Optimistic-concurrency SHA captured at enqueue time (best-effort). */
	readonly expectedSha?: string | null;
	readonly delete?: boolean;
	/** Required for deletes; the file's blob SHA on the remote. */
	readonly previousSha?: string;
	readonly description: string;
}

export interface QueueState {
	readonly providerId: string;
	readonly parsed: ParsedRepo;
	readonly editBranch: string;
	readonly author: { name: string; email: string };
	readonly pat: string;
	readonly parentSha: string;
}

export interface CommitQueueStore {
	readonly depth: number;
	readonly lastFlushAt: number | null;
	readonly lastError: Error | null;
	readonly flushing: boolean;
	/**
	 * Whether the queue is bound to an active remote session. Drives the
	 * `EditToolbar` provider / branch pills and gates `enqueue` / `flushNow`
	 * to no-ops when no session is bound.
	 */
	readonly active: boolean;
	start(state: QueueState): void;
	/**
	 * Update the session metadata (PAT / parent SHA / parsed URL / branch /
	 * author) without dropping pending writes. Used by `refreshRemote`
	 * after a successful re-fetch — the in-flight Kanban drags survive
	 * across a refresh, but they commit against the new parent SHA.
	 */
	setSession(state: QueueState): void;
	stop(): void;
	enqueue(write: QueuedWrite): void;
	flushNow(message: string): Promise<void>;
	clear(): void;
	pendingSnapshot(): readonly QueuedWrite[];
}

export function createCommitQueueStore(): CommitQueueStore {
	let depth = $state(0);
	let lastFlushAt = $state<number | null>(null);
	let lastError = $state<Error | null>(null);
	let flushing = $state(false);

	const queue: QueuedWrite[] = [];
	let state: QueueState | null = null;
	let debounceHandle: ReturnType<typeof setTimeout> | null = null;

	function bump(): void {
		depth = queue.length;
	}

	function start(s: QueueState): void {
		state = s;
		queue.length = 0;
		bump();
		lastError = null;
	}

	function setSession(s: QueueState): void {
		// Update the active session's metadata without dropping pending
		// writes. Used by `refreshRemote` after a successful re-fetch —
		// the queue's `pendingSnapshot` survives across the refresh, and
		// the next `flushNow` builds on top of the new parent SHA.
		state = s;
		lastError = null;
	}

	function stop(): void {
		state = null;
		queue.length = 0;
		if (debounceHandle !== null) {
			clearTimeout(debounceHandle);
			debounceHandle = null;
		}
		bump();
	}

	function enqueue(write: QueuedWrite): void {
		if (!state) return;
		// Coalesce: if the same path is already queued, replace the content
		// rather than appending.
		const existingIdx = queue.findIndex((q) => q.path === write.path);
		if (existingIdx >= 0) {
			queue.splice(existingIdx, 1, write);
		} else {
			queue.push(write);
		}
		bump();
		if (debounceHandle !== null) clearTimeout(debounceHandle);
		debounceHandle = setTimeout(() => {
			debounceHandle = null;
			void flushNow(buildAutoMessage(queue));
		}, KANBAN_DEBOUNCE_MS);
	}

	async function flushNow(message: string): Promise<void> {
		if (!state) return;
		if (flushing) return;
		if (queue.length === 0) return;
		const snapshot = queue.slice();
		const s = state;
		flushing = true;
		try {
			const changes: RemoteFileChange[] = snapshot.map((q) => {
				if (q.delete) {
					return {
						action: 'delete' as const,
						path: q.path,
						previousSha: q.previousSha ?? q.expectedSha ?? ''
					};
				}
				return {
					action: 'upsert' as const,
					path: q.path,
					content: q.content ?? ''
				};
			});

			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const provider = resolveProvider(new URL(s.parsed.canonicalUrl), s.providerId);
			const result = await provider.commitBatch({
				parsed: s.parsed,
				branch: s.editBranch,
				parentSha: s.parentSha,
				changes,
				message,
				author: s.author,
				pat: s.pat
			});

			// Successful commit: drop the flushed items from the queue and
			// refresh the parent SHA so the next flush builds on top.
			for (const item of snapshot) {
				const idx = queue.indexOf(item);
				if (idx >= 0) queue.splice(idx, 1);
			}
			state = { ...s, parentSha: result.commitSha };
			lastFlushAt = Date.now();
			lastError = null;
		} catch (err) {
			// Conflict / auth / network — keep the queue intact so the user
			// can retry after a "Pull to refresh".
			const wrapped =
				err instanceof Error ? err : new RemoteFetchError(`Commit failed: ${String(err)}`);
			// Surface 409 / 412 as a typed conflict so the editor can render
			// the inline banner.
			if (
				(wrapped as { status?: number }).status === 409 ||
				(wrapped as { status?: number }).status === 412
			) {
				lastError = new RemoteConflictError(
					snapshot[0]?.path ?? '',
					snapshot[0]?.expectedSha ?? undefined,
					wrapped
				);
			} else {
				lastError = wrapped;
			}
		} finally {
			flushing = false;
			bump();
		}
	}

	function clear(): void {
		queue.length = 0;
		if (debounceHandle !== null) {
			clearTimeout(debounceHandle);
			debounceHandle = null;
		}
		bump();
		lastError = null;
	}

	function pendingSnapshot(): readonly QueuedWrite[] {
		return queue.slice();
	}

	return {
		get depth() {
			return depth;
		},
		get lastFlushAt() {
			return lastFlushAt;
		},
		get lastError() {
			return lastError;
		},
		get flushing() {
			return flushing;
		},
		get active() {
			return state !== null;
		},
		start,
		setSession,
		stop,
		enqueue,
		flushNow,
		clear,
		pendingSnapshot
	};
}

function buildAutoMessage(items: readonly QueuedWrite[]): string {
	if (items.length === 1 && items[0]) return items[0].description;
	return `chore(quill.md): update ${items.length} files`;
}

export { KANBAN_DEBOUNCE_MS };

// Re-export `fetchSubtree` for the rare case where the queue needs to
// refresh the parent SHA after a manual "Pull to refresh" action.
export { fetchSubtree };
