/**
 * In-memory implementation of {@link DirectoryAdapter}.
 *
 * Used as test infrastructure (Step 4 §7.3 of the implementation plan) and
 * potentially as the backing store for the FR-11 wizard preview, which needs
 * to render a virtual filesystem before any writes hit disk.
 *
 * The adapter mirrors the contract of the FSA-backed {@link LocalFsAdapter}
 * one-for-one so the state layer (Step 5) can swap implementations without
 * touching the service layer.
 *
 * Atomicity: `writeTextFile` simulates the POSIX temp-file + rename pattern
 * so tests can verify that no `.tmp-*` artefacts are left behind, even on
 * a simulated failure.
 */
import {
	normalizePath,
	splitPath,
	type DirectoryAdapter,
	type DirectoryEntry
} from './directory-adapter.ts';
import { AdapterNotFoundError, AdapterValidationError } from './errors.ts';

/** Initial state for a {@link MemoryFsAdapter}. All fields are readonly. */
export interface MemoryFsSeed {
	readonly files: Readonly<Record<string, string>>;
}

/** Snapshot returned by {@link MemoryFsAdapter.snapshot} for assertions. */
export interface MemoryFsSnapshot {
	readonly files: Readonly<Record<string, string>>;
	readonly directories: readonly string[];
}

const ROOT = '.' as const;
const TEMP_SUFFIX_PREFIX = '.tmp-' as const;

/** Default per-file size cap (10 MiB). Configurable per instance. */
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;
/** Default total-file cap. Configurable per instance. */
const DEFAULT_MAX_ENTRIES = 10_000;

/** Constructor options for {@link MemoryFsAdapter}. All fields are optional. */
export interface MemoryFsLimits {
	/** Maximum size, in UTF-16 code units, of a single file's contents. */
	readonly maxFileSize?: number;
	/** Maximum number of files the adapter will hold simultaneously. */
	readonly maxEntries?: number;
}

function newTempName(targetPath: string): string {
	// crypto.randomUUID is available in Node >=19 and in all modern browsers
	// (SvelteKit + Vite 8 + Node 20+ baseline per AGENTS.md).
	const uuid = globalThis.crypto.randomUUID();
	return `${targetPath}${TEMP_SUFFIX_PREFIX}${uuid}`;
}

export class MemoryFsAdapter implements DirectoryAdapter {
	private readonly files: Map<string, string>;
	private readonly directories: Map<string, Set<string>>;
	private readonly maxFileSize: number;
	private readonly maxEntries: number;

	constructor(seed?: MemoryFsSeed, limits?: MemoryFsLimits) {
		this.files = new Map<string, string>();
		this.directories = new Map<string, Set<string>>();
		// Treat negative or zero limits as "use the default" so callers can't
		// accidentally disable the safety net by passing 0 / -1.
		this.maxFileSize =
			limits?.maxFileSize && limits.maxFileSize > 0 ? limits.maxFileSize : DEFAULT_MAX_FILE_SIZE;
		this.maxEntries =
			limits?.maxEntries && limits.maxEntries > 0 ? limits.maxEntries : DEFAULT_MAX_ENTRIES;
		this.reset(seed);
	}

	// ---------------------------------------------------------------------------
	// DirectoryAdapter contract
	// ---------------------------------------------------------------------------

	async readTextFile(path: string): Promise<string> {
		const normalized = requireNonEmpty(path);
		const content = this.files.get(normalized);
		if (content === undefined) {
			throw new AdapterNotFoundError(normalized);
		}
		return content;
	}

	async writeTextFile(path: string, contents: string): Promise<void> {
		const normalized = requireNonEmpty(path);
		this.assertNotRoot(normalized);

		// Refuse to overwrite an existing directory: the in-memory `directories`
		// Map would otherwise be left with a stale empty Set for this path,
		// and `listDirectory` would report the path as a file while the
		// directory entry (with any prior children) stays around as zombie
		// state. Production LocalFsAdapter behaves the same way (FSA's
		// getFileHandle rejects names that collide with a directory).
		if (this.directories.has(normalized)) {
			throw new AdapterValidationError(
				`Cannot write to a path that is an existing directory: "${normalized}"`,
				{ path: normalized }
			);
		}

		// Bound the file size so a caller (or a malicious seed) can't exhaust
		// the tab memory through a single huge write. The check happens before
		// any mutation so the adapter state stays consistent on rejection.
		if (contents.length > this.maxFileSize) {
			throw new AdapterValidationError(
				`File contents exceed the per-file limit (${contents.length} > ${this.maxFileSize} bytes)`,
				{ path: normalized }
			);
		}

		// Bound the total entry count. Overwriting an existing file is fine
		// (it doesn't grow the count); only truly new entries are limited.
		const isNewFile = !this.files.has(normalized);
		if (isNewFile && this.files.size >= this.maxEntries) {
			throw new AdapterValidationError(
				`Filesystem is at the entry limit (${this.maxEntries} files); cannot add "${normalized}"`,
				{ path: normalized }
			);
		}

		// Atomic-write simulation: write to a uniquely-named temp file, then
		// "rename" it onto the final path. On any throw we ensure the temp
		// entry is removed before the error propagates, so callers (and the
		// filesystem-wide listDirectory calls) never observe leftover temps.
		const tempPath = newTempName(normalized);
		this.files.set(tempPath, contents);
		try {
			this.ensureAncestorDirectories(normalized);
			this.files.set(normalized, contents);
			this.registerChild(splitPath(normalized).parent, splitPath(normalized).name);
		} finally {
			// Always remove the temp; the rename above already promoted the
			// content to the final key, so this is a no-op on success and a
			// cleanup on failure.
			this.files.delete(tempPath);
		}
	}

	async listDirectory(path: string): Promise<DirectoryEntry[]> {
		const normalized = requireNonEmpty(path);

		// Auto-create behaviour matches what the FSA-backed adapter does
		// with `getDirectoryHandle(_, { create: true })` and is the contract
		// the service layer relies on (a missing issues dir = empty set).
		if (!this.directories.has(normalized)) {
			this.directories.set(normalized, new Set<string>());
			return [];
		}

		const childNames = this.directories.get(normalized);
		if (!childNames) return [];

		const entries: DirectoryEntry[] = [];
		for (const name of childNames) {
			const childPath = normalized === ROOT ? name : `${normalized}/${name}`;
			const kind: DirectoryEntry['kind'] = this.files.has(childPath) ? 'file' : 'directory';
			entries.push({ name, kind });
		}
		return entries;
	}

	async removeFile(path: string): Promise<void> {
		const normalized = requireNonEmpty(path);
		if (!this.files.has(normalized)) {
			throw new AdapterNotFoundError(normalized);
		}
		this.files.delete(normalized);
		this.unregisterChild(splitPath(normalized).parent, splitPath(normalized).name);
	}

	async moveFile(from: string, to: string): Promise<void> {
		const fromNormalized = requireNonEmpty(from);
		const toNormalized = requireNonEmpty(to);

		// Self-move is a no-op (matches POSIX `rename(a, a)`). Without this
		// guard the same-parent branch would read → write → delete the source,
		// and `from === to` would end up deleting the file because the only
		// key would be removed in the final step.
		if (fromNormalized === toNormalized) return;

		this.assertNotRoot(fromNormalized);
		this.assertNotRoot(toNormalized);

		// Atomic path: same parent → write to a temp key inside the same dir,
		// then swap. Different parent → read + write + remove (mirrors the
		// three-step FSA flow documented in the plan).
		const fromParent = splitPath(fromNormalized).parent;
		const toParent = splitPath(toNormalized).parent;

		if (fromParent === toParent) {
			// Use writeTextFile directly so the atomic-write invariant is
			// preserved (no orphan temp keys, parent dirs registered).
			const content = await this.readTextFile(fromNormalized);
			await this.writeTextFile(toNormalized, content);
			// writeTextFile already promoted; now drop the old key directly
			// without re-throwing not-found for the temp-handled case.
			this.files.delete(fromNormalized);
			this.unregisterChild(fromParent, splitPath(fromNormalized).name);
			return;
		}

		// Cross-parent move: copy semantics, then delete the source.
		const content = await this.readTextFile(fromNormalized);
		await this.writeTextFile(toNormalized, content);
		await this.removeFile(fromNormalized);
	}

	// ---------------------------------------------------------------------------
	// Test helpers
	// ---------------------------------------------------------------------------

	/**
	 * Export the current filesystem state as a fresh, plain object. Useful
	 * for `toEqual` assertions that compare against a literal snapshot.
	 */
	snapshot(): MemoryFsSnapshot {
		const files: Record<string, string> = {};
		for (const [path, content] of this.files) {
			// Skip any in-flight temp keys (defensive: there shouldn't be any).
			if (path.includes(TEMP_SUFFIX_PREFIX)) continue;
			files[path] = content;
		}
		const directories = [...this.directories.keys()].sort();
		return { files, directories };
	}

	/**
	 * Clear all internal state and re-seed from `seed` if provided. Used by
	 * tests that need a deterministic starting point between cases.
	 */
	reset(seed?: MemoryFsSeed): void {
		this.files.clear();
		this.directories.clear();
		// The root always exists so that listDirectory('.') returns [].
		this.directories.set(ROOT, new Set<string>());

		if (!seed) return;

		for (const [path, content] of Object.entries(seed.files)) {
			// Enforce per-file size on the seed too so a 1 GiB string can't
			// bypass the runtime cap by sneaking in through reset().
			if (content.length > this.maxFileSize) {
				throw new AdapterValidationError(
					`Seed entry "${path}" exceeds the per-file limit (${content.length} > ${this.maxFileSize} bytes)`,
					{ path }
				);
			}

			const normalized = normalizePath(path);
			if (normalized === ROOT) {
				throw new AdapterValidationError(`Cannot seed a directory at the root: "${path}"`, {
					path
				});
			}

			// Enforce the entry cap on the seed so the constructor can't be
			// used as a DoS vector by passing a seed with more entries than
			// the configured limit.
			if (!this.files.has(normalized) && this.files.size >= this.maxEntries) {
				throw new AdapterValidationError(
					`Seed would exceed the entry limit (${this.maxEntries} files)`,
					{ path }
				);
			}

			const tempPath = newTempName(normalized);
			this.files.set(tempPath, content);
			try {
				this.ensureAncestorDirectories(normalized);
				this.files.set(normalized, content);
				this.registerChild(splitPath(normalized).parent, splitPath(normalized).name);
			} finally {
				this.files.delete(tempPath);
			}
		}
	}

	// ---------------------------------------------------------------------------
	// Internal helpers
	// ---------------------------------------------------------------------------

	private ensureAncestorDirectories(filePath: string): void {
		const segments = filePath.split('/');
		// Walk every prefix except the leaf segment itself; the leaf is the
		// file, not a directory. We register each intermediate directory AND
		// add it to its own parent's children set so that listDirectory can
		// distinguish 'file' from 'directory' entries (see listDirectory).
		let parentPath: string = ROOT;
		for (let i = 1; i < segments.length; i++) {
			const dirPath = segments.slice(0, i).join('/');
			if (!this.directories.has(dirPath)) {
				this.directories.set(dirPath, new Set<string>());
				// segments[i-1] is the leaf of `dirPath` — it's the new
				// directory's own name. (segments[i] would be the file name,
				// not the directory name.)
				this.registerChild(parentPath, segments[i - 1] ?? '');
			}
			parentPath = dirPath;
		}
	}

	private registerChild(parentPath: string, name: string): void {
		if (!this.directories.has(parentPath)) {
			this.directories.set(parentPath, new Set<string>());
		}
		const parent = this.directories.get(parentPath);
		// parent is guaranteed to exist by the line above
		if (parent && !parent.has(name)) {
			parent.add(name);
		}
	}

	private unregisterChild(parentPath: string, name: string): void {
		const parent = this.directories.get(parentPath);
		if (!parent) return;
		parent.delete(name);
	}

	private assertNotRoot(path: string): void {
		if (path === ROOT) {
			throw new AdapterValidationError(`Operation not allowed on the root path: "${path}"`, {
				path
			});
		}
	}
}

function requireNonEmpty(path: string): string {
	if (typeof path !== 'string' || path.length === 0) {
		throw new AdapterValidationError('Path must be a non-empty string');
	}
	return normalizePath(path);
}
