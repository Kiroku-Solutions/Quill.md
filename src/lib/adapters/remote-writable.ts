/**
 * RemoteWritableAdapter — a `WritableDirectoryAdapter` that translates the
 * FSA-style mutation verbs (`writeTextFile`, `removeFile`, `moveFile`) into
 * queued writes against the singleton `CommitQueueStore`. The queue
 * debounces Kanban drags into a single `commitBatch` and lets the editor
 * save bypass the debounce with `flushNow(message)`.
 *
 * The adapter also maintains an in-memory overlay so `readTextFile` and
 * `listDirectory` reflect pending edits before they flush — `parseIssueFile`
 * after a save therefore sees the new content, and the editor's reparse
 * path is consistent with what will land on the remote.
 *
 * Contract:
 *  - `writeTextFile(path, content)` → enqueues an upsert with
 *    `description = "chore(quill.md): update <path>"`. Returns once the
 *    write is queued (NOT once it lands on the remote — the queue handles
 *    commit lifecycle).
 *  - `removeFile(path)` → enqueues a delete with
 *    `description = "chore(quill.md): delete <path>"`.
 *  - `moveFile(from, to)` → enqueues an upsert at `to` and a delete at
 *    `from`, then calls `flushNow("chore(quill.md): move <from> → <to>")`.
 *    The two ops land as one `commitBatch`. The flush is immediate (not
 *    debounced) — a move is a single user-initiated action and the user
 *    expects atomicity.
 *  - Reads consult the overlay before delegating to the read-only adapter.
 *
 * Optimistic concurrency: per-file blob SHAs are tracked on the read-only
 * adapter's `byPath` map (built from `RemoteFile.sha` in `remote.ts`). The
 * adapter captures the current SHA at enqueue time and forwards it to the
 * queue as `expectedSha` for upserts and `previousSha` for deletes. The
 * queue's `commitBatch` flush does not enforce per-file SHAs (the tree
 * creation always writes the new content), but the SHA is preserved so a
 * future migration to single-file `putFile`/`deleteFile` paths can reuse
 * the same `QueuedWrite` shape.
 *
 * ERS mapping: FR-5 (Remote Edit Mode), FR-16 (commit lifecycle).
 */

import { AdapterNotFoundError } from './errors.ts';
import {
	normalizePath,
	type DirectoryEntry,
	type WritableDirectoryAdapter
} from './directory-adapter.ts';
import type { CommitQueueStore, QueuedWrite } from '../state/commit-queue.svelte.ts';

/**
 * Minimal read-only adapter surface that also exposes the per-file blob
 * SHA map and the branch tip SHA. The `ReadonlyRemoteAdapter` built by
 * `remote.ts` satisfies this — `RemoteFile.sha` was carried through the
 * pipeline specifically so the writable layer can capture optimistic-
 * concurrency SHAs.
 */
export interface ShaLookup {
	readTextFile(path: string): Promise<string>;
	listDirectory(path: string): Promise<DirectoryEntry[]>;
	headSha(): Promise<string>;
	exists(rel: string): Promise<boolean>;
	/**
	 * Per-file blob SHA for `path`, or `null` if the file is unknown to
	 * the read-only snapshot. Used for optimistic concurrency on the
	 * queued writes.
	 */
	blobShaFor(rel: string): Promise<string | null>;
}

/**
 * Dependencies for {@link RemoteWritableAdapter}.
 */
export interface RemoteWritableAdapterDeps {
	readonly readOnly: ShaLookup;
	readonly queue: CommitQueueStore;
}

/**
 * Single in-memory write-through overlay entry.
 */
type OverlayEntry =
	{ readonly kind: 'upsert'; readonly content: string } | { readonly kind: 'delete' };

/**
 * Implementation of {@link WritableDirectoryAdapter} backed by a commit
 * queue. See the module docstring for the full contract.
 */
export class RemoteWritableAdapter implements WritableDirectoryAdapter {
	/**
	 * The read-only snapshot the adapter fronts. Public so tests can
	 * verify that `mode.refreshRemote` swapped the underlying snapshot
	 * (the wrapper itself is reconstructed on every refresh).
	 */
	readonly readOnly: ShaLookup;
	readonly #queue: CommitQueueStore;
	/**
	 * In-memory overlay of pending writes. Keys are normalised paths
	 * (POSIX-style, relative to the adapter root). The overlay is
	 * consulted by `readTextFile` and `listDirectory` so in-flight edits
	 * are visible before the queue flushes.
	 */
	readonly #overlay: Map<string, OverlayEntry> = new Map();

	constructor(deps: RemoteWritableAdapterDeps) {
		this.readOnly = deps.readOnly;
		this.#queue = deps.queue;
	}

	// ── Read surface ─────────────────────────────────────────────────

	readTextFile(path: string): Promise<string> {
		const normalized = normalizePath(path);
		const entry = this.#overlay.get(normalized);
		if (entry) {
			if (entry.kind === 'delete') {
				return Promise.reject(new AdapterNotFoundError(normalized));
			}
			return Promise.resolve(entry.content);
		}
		return this.readOnly.readTextFile(normalized);
	}

	async listDirectory(path: string): Promise<DirectoryEntry[]> {
		const normalized = normalizePath(path);
		const fromBase = await this.readOnly.listDirectory(normalized);
		// Build the merge: start from the read-only listing, then apply
		// overlay entries whose path lives under `normalized`.
		const merged = new Map<string, DirectoryEntry>();
		for (const e of fromBase)
			merged.set(
				`${normalized === '.' ? '' : normalized + '/'}${e.name}${e.kind === 'directory' ? '/' : ''}`,
				e
			);

		for (const [op, entry] of this.#overlay) {
			if (normalized !== '.' && !op.startsWith(`${normalized}/`)) continue;
			const remainder = normalized === '.' ? op : op.slice(normalized.length + 1);
			const slash = remainder.indexOf('/');
			if (entry.kind === 'delete') {
				if (slash === -1) {
					merged.delete(op);
				}
				// Directory-level deletes are reflected by removing the
				// matching leaf entries via the slash check; we don't
				// synthesise directory entries here.
				continue;
			}
			// Upsert: insert / overwrite the leaf.
			if (slash === -1) {
				merged.set(op, { kind: 'file', name: remainder });
			} else {
				const dirName = remainder.slice(0, slash);
				merged.set(`${normalized === '.' ? '' : normalized + '/'}${dirName}/`, {
					kind: 'directory',
					name: dirName
				});
			}
		}

		// Strip the prefix back off the keys so the caller sees the
		// immediate-children shape the rest of the app expects.
		const prefix = normalized === '.' ? '' : `${normalized}/`;
		const out: DirectoryEntry[] = [];
		for (const [key, entry] of merged) {
			if (normalized !== '.' && !key.startsWith(prefix)) continue;
			out.push(entry);
		}
		return out;
	}

	// ── Write surface ────────────────────────────────────────────────

	async writeTextFile(path: string, content: string): Promise<void> {
		const normalized = normalizePath(path);
		const sha = await this.readOnly.blobShaFor(normalized);
		const write: QueuedWrite = {
			path: normalized,
			content,
			expectedSha: sha,
			description: `chore(quill.md): update ${normalized}`
		};
		this.#overlay.set(normalized, { kind: 'upsert', content });
		this.#queue.enqueue(write);
	}

	async removeFile(path: string): Promise<void> {
		const normalized = normalizePath(path);
		const sha = await this.readOnly.blobShaFor(normalized);
		const write: QueuedWrite = {
			path: normalized,
			delete: true,
			expectedSha: sha,
			previousSha: sha ?? '',
			description: `chore(quill.md): delete ${normalized}`
		};
		this.#overlay.set(normalized, { kind: 'delete' });
		this.#queue.enqueue(write);
	}

	async moveFile(from: string, to: string): Promise<void> {
		const fromNorm = normalizePath(from);
		const toNorm = normalizePath(to);
		// Read through the overlay so an unsaved edit to the source is
		// preserved on the move. The overlay entry (if any) takes
		// precedence over the read-only snapshot.
		const content = await this.readTextFile(fromNorm);
		// `writeTextFile` then `removeFile` enqueue two writes that share
		// the same debounce window. We then call `flushNow` with a
		// descriptive commit message so both land in one commitBatch.
		await this.writeTextFile(toNorm, content);
		await this.removeFile(fromNorm);
		await this.#queue.flushNow(`chore(quill.md): move ${fromNorm} → ${toNorm}`);
	}
}
