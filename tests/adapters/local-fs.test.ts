/**
 * Tests for {@link LocalFsAdapter} — the FSA-backed {@link DirectoryAdapter}
 * implementation for Local Edit Mode.
 *
 * ## Strategy
 *
 * These tests run in Vitest's `server` project (Node 20+), which has no
 * browser APIs. We install a mock `window` global containing just the three
 * FSA members that {@link LocalFsAdapter} consumes:
 *
 *   - `showDirectoryPicker(opts)` → returns a mock directory handle.
 *   - `FileSystemDirectoryHandle`  → constructor class (kept so `instanceof`
 *     checks anywhere in the codebase remain meaningful).
 *   - `FileSystemFileHandle`       → constructor class.
 *
 * The `LocalFsAdapter` class itself is the **real** implementation imported
 * normally from `$lib/adapters/local-fs`. Tests exercise the actual production
 * code path; coverage of `src/lib/adapters/local-fs.ts` is real.
 *
 * ## Why not Playwright?
 *
 * The File System Access API requires a user gesture (folder picker) and is
 * only available behind a flag in Chromium. A headless Playwright run cannot
 * programmatically grant folder access. Mocking the browser-side handle
 * surface — the seam the production code crosses — gives deterministic,
 * fast, environment-independent coverage. The vite.config.ts comment block
 * at `tests/adapters/local-fs.test.ts` in the exclude list documents this
 * design choice for future readers.
 *
 * ## ERS coverage
 *
 * FR-4 (Local CRUD), NFR-7 (atomicity, rollback), C-3 (FSA availability),
 * C-4 (permission re-grant), ERS §5.5 (handle lifecycle).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalFsAdapter } from '$lib/adapters/local-fs';
import {
	AdapterNotFoundError,
	AdapterValidationError,
	FsaPermissionError,
	FsaUnavailableError
} from '$lib/adapters/errors';

// ── In-memory FSA mocks ──────────────────────────────────────────────────────
//
// These classes only model the FSA surface the adapter touches. They are
// installed on `globalThis.window` in `beforeEach` so `feature-detect.ts`
// reports FSA as available and `LocalFsAdapter.pick()` can run end-to-end
// against real production code.

type PermissionState = 'granted' | 'denied' | 'prompt';
type FsEntry = MockFsaFile | MockFsaDir;

class MockFsaWritable {
	private chunks: string[] = [];
	private _closed = false;
	private _aborted = false;

	constructor(private readonly file: MockFsaFile) {}

	async write(data: string): Promise<void> {
		if (this._closed || this._aborted) {
			throw new Error('writable already finalised');
		}
		this.chunks.push(data);
	}

	async close(): Promise<void> {
		if (this._aborted) throw new Error('writable already aborted');
		this.file.content = this.chunks.join('');
		this._closed = true;
	}

	async abort(): Promise<void> {
		this._aborted = true;
		this.chunks = [];
	}

	/** Test introspection: did the writable commit? */
	get committed(): boolean {
		return this._closed;
	}
	get aborted(): boolean {
		return this._aborted;
	}
}

class MockFsaFile {
	readonly kind = 'file' as const;
	content = '';

	constructor(public readonly name: string) {}

	async getFile(): Promise<File> {
		if (fsaState.getFileShouldFail) {
			fsaState.getFileShouldFail = false;
			throw new DOMException('permission revoked on read', 'NotAllowedError');
		}
		// Node 20+ ships File/Blob globally; `.text()` returns a Promise<string>.
		return new File([this.content], this.name, { type: 'text/plain' });
	}

	async createWritable(): Promise<MockFsaWritable> {
		return new MockFsaWritable(this);
	}
}

class MockFsaDir {
	readonly kind = 'directory' as const;
	private readonly children: Map<string, FsEntry> = new Map();

	constructor(public readonly name: string) {}

	/** Test introspection helpers (not part of FSA spec). */
	has(name: string): boolean {
		return this.children.has(name);
	}
	listChildNames(): string[] {
		return [...this.children.keys()];
	}

	async queryPermission(_opts?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState> {
		void _opts;
		return fsaState.permission;
	}

	async requestPermission(_opts?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState> {
		void _opts;
		if (fsaState.requestPermissionError) throw fsaState.requestPermissionError;
		return fsaState.permission;
	}

	async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<MockFsaDir> {
		const child = this.children.get(name);
		if (child) {
			if (!(child instanceof MockFsaDir)) {
				// Spec: throw TypeError when entry exists but is the wrong kind.
				throw new TypeError(`Entry exists but is not a directory: ${name}`);
			}
			return child;
		}
		if (opts?.create && !fsaState.getDirectoryShouldFail) {
			const dir = new MockFsaDir(name);
			this.children.set(name, dir);
			return dir;
		}
		// Test fixture: simulate an unexpected FSA error (neither TypeError
		// nor NotFoundError) so we can exercise the rethrow branches in the
		// adapter's `resolveDirectoryHandle` / `resolveDirectoryMaybeCreate`.
		if (fsaState.getDirectoryShouldFail) {
			fsaState.getDirectoryShouldFail = false;
			throw new DOMException('simulated FSA failure', 'OperationError');
		}
		throw new DOMException(`Directory not found: ${name}`, 'NotFoundError');
	}

	async getFileHandle(name: string, opts?: { create?: boolean }): Promise<MockFsaFile> {
		const child = this.children.get(name);
		if (child) {
			if (!(child instanceof MockFsaFile)) {
				throw new TypeError(`Entry exists but is not a file: ${name}`);
			}
			return child;
		}
		if (opts?.create) {
			const file = new MockFsaFile(name);
			this.children.set(name, file);
			return file;
		}
		throw new DOMException(`File not found: ${name}`, 'NotFoundError');
	}

	async removeEntry(name: string): Promise<void> {
		if (fsaState.removeEntryShouldFail) {
			fsaState.removeEntryShouldFail = false;
			throw new DOMException('permission revoked on remove', 'NotAllowedError');
		}
		if (!this.children.has(name)) {
			throw new DOMException(`Entry not found: ${name}`, 'NotFoundError');
		}
		this.children.delete(name);
	}

	async move(src: string, dst: string): Promise<void> {
		const entry = this.children.get(src);
		if (!entry) throw new DOMException(`Entry not found: ${src}`, 'NotFoundError');
		if (fsaState.moveShouldFail) {
			throw new DOMException('Move failed (test fixture)', 'NotAllowedError');
		}
		this.children.delete(src);
		this.children.set(dst, entry);
	}

	async *entries(): AsyncIterableIterator<[string, FsEntry]> {
		// Snapshot first so re-entrant mutations don't shift iteration.
		for (const [n, e] of Array.from(this.children.entries())) {
			yield [n, e];
		}
	}
}

// ── FSA state — controlled by individual tests via the helpers ──────────────

const fsaState: {
	isFsaAvailable: boolean;
	permission: PermissionState;
	pickError: Error | null;
	requestPermissionError: Error | null;
	moveShouldFail: boolean;
	getDirectoryShouldFail: boolean;
	getFileShouldFail: boolean;
	removeEntryShouldFail: boolean;
	rootDir: MockFsaDir;
} = {
	isFsaAvailable: true,
	permission: 'granted',
	pickError: null,
	requestPermissionError: null,
	moveShouldFail: false,
	getDirectoryShouldFail: false,
	getFileShouldFail: false,
	removeEntryShouldFail: false,
	// Placeholder — replaced by resetFsaState() in beforeEach.
	rootDir: new MockFsaDir('.')
};

function resetFsaState(): MockFsaDir {
	fsaState.isFsaAvailable = true;
	fsaState.permission = 'granted';
	fsaState.pickError = null;
	fsaState.requestPermissionError = null;
	fsaState.moveShouldFail = false;
	fsaState.getDirectoryShouldFail = false;
	fsaState.getFileShouldFail = false;
	fsaState.removeEntryShouldFail = false;
	fsaState.rootDir = new MockFsaDir('test-root');
	return fsaState.rootDir;
}

function installMockWindow(): void {
	(globalThis as unknown as { window: unknown }).window = {
		showDirectoryPicker: async (_opts?: unknown) => {
			void _opts;
			if (fsaState.pickError) throw fsaState.pickError;
			return fsaState.rootDir;
		},
		FileSystemDirectoryHandle: MockFsaDir,
		FileSystemFileHandle: MockFsaFile
	};
}

function uninstallMockWindow(): void {
	delete (globalThis as unknown as { window?: unknown }).window;
}

// ── Test helpers ─────────────────────────────────────────────────────────────

/** Seed a file directly into the mock FS (bypasses writeTextFile). */
async function seedFile(path: string, content: string): Promise<void> {
	const segs = path.split('/').filter(Boolean);
	let cur: MockFsaDir = fsaState.rootDir;
	for (let i = 0; i < segs.length - 1; i++) {
		cur = await cur.getDirectoryHandle(segs[i]!, { create: true });
	}
	const fh = await cur.getFileHandle(segs[segs.length - 1]!, { create: true });
	fh.content = content;
}

/** Convenience: pick a fresh adapter for the current test. */
async function lfa(): Promise<LocalFsAdapter> {
	return LocalFsAdapter.pick();
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

beforeEach(() => {
	resetFsaState();
	installMockWindow();
});

afterEach(() => {
	uninstallMockWindow();
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('LocalFsAdapter — pick()', () => {
	it('throws FsaUnavailableError if FSA is not available', async () => {
		delete (globalThis as unknown as { window?: unknown }).window;
		await expect(lfa()).rejects.toBeInstanceOf(FsaUnavailableError);
	});

	it('throws FsaPermissionError when user cancels (AbortError)', async () => {
		fsaState.pickError = new DOMException('cancelled', 'AbortError');
		await expect(lfa()).rejects.toBeInstanceOf(FsaPermissionError);
	});

	it('throws FsaPermissionError when user denies (NotAllowedError)', async () => {
		fsaState.pickError = new DOMException('denied', 'NotAllowedError');
		await expect(lfa()).rejects.toBeInstanceOf(FsaPermissionError);
	});

	it('rethrows non-DOMException errors from showDirectoryPicker', async () => {
		fsaState.pickError = new Error('unexpected OS error');
		await expect(lfa()).rejects.toThrow('unexpected OS error');
	});

	it('returns a LocalFsAdapter instance on success', async () => {
		const adapter = await lfa();
		expect(adapter).toBeInstanceOf(LocalFsAdapter);
	});
});

describe('LocalFsAdapter — readTextFile', () => {
	it('returns the content of an existing file', async () => {
		await seedFile('notes.txt', 'hello world');
		const adapter = await lfa();
		expect(await adapter.readTextFile('notes.txt')).toBe('hello world');
	});

	it('throws AdapterNotFoundError for a missing file', async () => {
		const adapter = await lfa();
		await expect(adapter.readTextFile('missing.txt')).rejects.toBeInstanceOf(AdapterNotFoundError);
	});

	it('throws AdapterNotFoundError when the parent directory is missing', async () => {
		const adapter = await lfa();
		await expect(adapter.readTextFile('no-such-dir/file.txt')).rejects.toBeInstanceOf(
			AdapterNotFoundError
		);
	});

	it('throws AdapterValidationError for an empty path', async () => {
		const adapter = await lfa();
		await expect(adapter.readTextFile('')).rejects.toBeInstanceOf(AdapterValidationError);
	});

	it('throws AdapterValidationError for the root path "."', async () => {
		const adapter = await lfa();
		await expect(adapter.readTextFile('.')).rejects.toBeInstanceOf(AdapterValidationError);
	});

	it('throws FsaPermissionError when permission state is not "granted"', async () => {
		fsaState.permission = 'denied';
		await seedFile('a.txt', 'x');
		const adapter = await lfa();
		await expect(adapter.readTextFile('a.txt')).rejects.toBeInstanceOf(FsaPermissionError);
	});

	it('normalises paths before lookup', async () => {
		await seedFile('a/b.txt', 'payload');
		const adapter = await lfa();
		expect(await adapter.readTextFile('./a/./b.txt')).toBe('payload');
		expect(await adapter.readTextFile('a/../a/b.txt')).toBe('payload');
	});

	it('throws FsaPermissionError when getFile() rejects with NotAllowedError', async () => {
		await seedFile('a.txt', 'x');
		fsaState.getFileShouldFail = true;
		const adapter = await lfa();
		await expect(adapter.readTextFile('a.txt')).rejects.toBeInstanceOf(FsaPermissionError);
	});
});

describe('LocalFsAdapter — writeTextFile (atomic write)', () => {
	it('writes content that round-trips through readTextFile', async () => {
		const adapter = await lfa();
		await adapter.writeTextFile('new.txt', 'fresh');
		expect(await adapter.readTextFile('new.txt')).toBe('fresh');
	});

	it('overwrites an existing file', async () => {
		const adapter = await lfa();
		await adapter.writeTextFile('file.txt', 'v1');
		await adapter.writeTextFile('file.txt', 'v2');
		expect(await adapter.readTextFile('file.txt')).toBe('v2');
	});

	it('creates intermediate directories on first write', async () => {
		const adapter = await lfa();
		await adapter.writeTextFile('deep/nested/path/file.txt', 'x');
		expect(await adapter.readTextFile('deep/nested/path/file.txt')).toBe('x');
	});

	it('does not leave temp files behind after a successful write', async () => {
		const adapter = await lfa();
		await adapter.writeTextFile('atomic.txt', 'content');
		const entries = await adapter.listDirectory('.');
		const temps = entries.filter((e) => e.name.startsWith('.tmp-'));
		expect(temps).toEqual([]);
	});

	it('does not leave temp files behind after overwriting an existing file', async () => {
		const adapter = await lfa();
		await adapter.writeTextFile('atomic.txt', 'v1');
		await adapter.writeTextFile('atomic.txt', 'v2');
		const entries = await adapter.listDirectory('.');
		const temps = entries.filter((e) => e.name.startsWith('.tmp-'));
		expect(temps).toEqual([]);
	});

	it('rejects writing to the root path "."', async () => {
		const adapter = await lfa();
		await expect(adapter.writeTextFile('.', 'x')).rejects.toBeInstanceOf(AdapterValidationError);
	});

	it('rejects an empty path', async () => {
		const adapter = await lfa();
		await expect(adapter.writeTextFile('', 'x')).rejects.toBeInstanceOf(AdapterValidationError);
	});

	it('rejects a path that resolves to an existing directory (NFR-7)', async () => {
		const adapter = await lfa();
		await adapter.writeTextFile('parent/child.txt', 'x');
		await expect(adapter.writeTextFile('parent', 'content')).rejects.toBeInstanceOf(
			AdapterValidationError
		);
	});

	it('rolls back the temp file when the atomic move fails', async () => {
		const adapter = await lfa();
		// Pre-existing file with stable content to verify it stays untouched.
		await adapter.writeTextFile('target.txt', 'original');

		// Force the move() call to throw NotAllowedError on the next write.
		fsaState.moveShouldFail = true;
		await expect(adapter.writeTextFile('target.txt', 'updated')).rejects.toBeInstanceOf(
			FsaPermissionError
		);

		// Original content must still be there (NFR-7 rollback).
		expect(await adapter.readTextFile('target.txt')).toBe('original');

		// No .tmp-* files left behind.
		const entries = await adapter.listDirectory('.');
		const temps = entries.filter((e) => e.name.startsWith('.tmp-'));
		expect(temps).toEqual([]);

		// Re-enable moves; subsequent writes succeed.
		fsaState.moveShouldFail = false;
		await adapter.writeTextFile('target.txt', 'updated');
		expect(await adapter.readTextFile('target.txt')).toBe('updated');
	});

	it('rejects content exceeding the per-file size limit', async () => {
		const adapter = await lfa();
		const huge = 'x'.repeat(10 * 1024 * 1024 + 1);
		await expect(adapter.writeTextFile('big.txt', huge)).rejects.toBeInstanceOf(
			AdapterValidationError
		);
	});
});

describe('LocalFsAdapter — listDirectory', () => {
	it('returns entries with kind: "file"', async () => {
		await seedFile('a.txt', '1');
		await seedFile('b.txt', '2');
		const adapter = await lfa();
		const entries = await adapter.listDirectory('.');
		expect(entries).toContainEqual({ name: 'a.txt', kind: 'file' });
		expect(entries).toContainEqual({ name: 'b.txt', kind: 'file' });
	});

	it('returns entries with kind: "directory"', async () => {
		await seedFile('dir/inner.txt', 'x');
		const adapter = await lfa();
		const entries = await adapter.listDirectory('.');
		expect(entries).toContainEqual({ name: 'dir', kind: 'directory' });
	});

	it('returns empty array for a non-existent directory (per DirectoryAdapter contract)', async () => {
		const adapter = await lfa();
		expect(await adapter.listDirectory('does-not-exist')).toEqual([]);
	});

	it('returns empty array for a freshly-created empty directory', async () => {
		const adapter = await lfa();
		await adapter.writeTextFile('empty/placeholder.txt', 'x');
		await adapter.removeFile('empty/placeholder.txt');
		expect(await adapter.listDirectory('empty')).toEqual([]);
	});

	it('throws AdapterValidationError for an empty path', async () => {
		const adapter = await lfa();
		await expect(adapter.listDirectory('')).rejects.toBeInstanceOf(AdapterValidationError);
	});

	it('returns [] when the path resolves to an existing file (TypeError branch)', async () => {
		// Seed a file at the top level; listing it as a directory should be a
		// no-op per the "doesn't exist" semantics — listDirectory returns []
		// rather than throwing.
		await seedFile('a.txt', 'x');
		const adapter = await lfa();
		const entries = await adapter.listDirectory('a.txt');
		expect(entries).toEqual([]);
	});

	it('rethrows unexpected FSA errors from listDirectory', async () => {
		const adapter = await lfa();
		// Next getDirectoryHandle call will throw an unexpected DOMException.
		fsaState.getDirectoryShouldFail = true;
		await expect(adapter.listDirectory('broken/inner')).rejects.toThrow('simulated FSA failure');
	});
});

describe('LocalFsAdapter — removeFile', () => {
	it('removes the file and the next read throws AdapterNotFoundError', async () => {
		await seedFile('a.txt', 'x');
		const adapter = await lfa();
		await adapter.removeFile('a.txt');
		await expect(adapter.readTextFile('a.txt')).rejects.toBeInstanceOf(AdapterNotFoundError);
	});

	it('throws AdapterNotFoundError when the file does not exist', async () => {
		const adapter = await lfa();
		await expect(adapter.removeFile('missing.txt')).rejects.toBeInstanceOf(AdapterNotFoundError);
	});

	it('does not affect sibling files when removing one', async () => {
		await seedFile('a.txt', 'x');
		await seedFile('b.txt', 'y');
		const adapter = await lfa();
		await adapter.removeFile('a.txt');
		expect(await adapter.readTextFile('b.txt')).toBe('y');
	});

	it('rejects the root path', async () => {
		const adapter = await lfa();
		await expect(adapter.removeFile('.')).rejects.toBeInstanceOf(AdapterValidationError);
	});

	it('rejects an empty path', async () => {
		const adapter = await lfa();
		await expect(adapter.removeFile('')).rejects.toBeInstanceOf(AdapterValidationError);
	});

	it('throws FsaPermissionError when permission state is not "granted"', async () => {
		await seedFile('a.txt', 'x');
		fsaState.permission = 'denied';
		const adapter = await lfa();
		await expect(adapter.removeFile('a.txt')).rejects.toBeInstanceOf(FsaPermissionError);
	});

	it('throws FsaPermissionError when removeEntry() rejects with NotAllowedError', async () => {
		await seedFile('a.txt', 'x');
		fsaState.removeEntryShouldFail = true;
		const adapter = await lfa();
		await expect(adapter.removeFile('a.txt')).rejects.toBeInstanceOf(FsaPermissionError);
	});
});

describe('LocalFsAdapter — moveFile', () => {
	describe('same-directory move (atomic)', () => {
		it('moves the file using the directory handle move() primitive', async () => {
			await seedFile('old.txt', 'content');
			const adapter = await lfa();
			await adapter.moveFile('old.txt', 'new.txt');
			expect(await adapter.readTextFile('new.txt')).toBe('content');
			await expect(adapter.readTextFile('old.txt')).rejects.toBeInstanceOf(AdapterNotFoundError);
		});

		it('throws AdapterNotFoundError when the source does not exist', async () => {
			const adapter = await lfa();
			await expect(adapter.moveFile('missing.txt', 'elsewhere.txt')).rejects.toBeInstanceOf(
				AdapterNotFoundError
			);
		});

		it('leaves sibling files untouched', async () => {
			await seedFile('dir/a.txt', 'x');
			await seedFile('dir/b.txt', 'y');
			const adapter = await lfa();
			await adapter.moveFile('dir/a.txt', 'dir/c.txt');
			expect(await adapter.readTextFile('dir/b.txt')).toBe('y');
		});
	});

	describe('cross-directory move (read + write + remove)', () => {
		it('moves a file to a different directory', async () => {
			await seedFile('src/a.txt', 'payload');
			const adapter = await lfa();
			await adapter.moveFile('src/a.txt', 'dst/a.txt');
			expect(await adapter.readTextFile('dst/a.txt')).toBe('payload');
			await expect(adapter.readTextFile('src/a.txt')).rejects.toBeInstanceOf(AdapterNotFoundError);
		});

		it('auto-creates the destination directory', async () => {
			await seedFile('src/a.txt', 'payload');
			const adapter = await lfa();
			await adapter.moveFile('src/a.txt', 'new-dir/sub/a.txt');
			expect(await adapter.readTextFile('new-dir/sub/a.txt')).toBe('payload');
		});

		it('leaves a sibling in the source directory untouched', async () => {
			await seedFile('src/a.txt', 'x');
			await seedFile('src/b.txt', 'y');
			const adapter = await lfa();
			await adapter.moveFile('src/a.txt', 'dst/a.txt');
			expect(await adapter.readTextFile('src/b.txt')).toBe('y');
		});
	});

	describe('self-move is a no-op', () => {
		it('preserves file content for moveFile(x, x)', async () => {
			await seedFile('notes.txt', 'hello');
			const adapter = await lfa();
			await adapter.moveFile('notes.txt', 'notes.txt');
			expect(await adapter.readTextFile('notes.txt')).toBe('hello');
		});

		it('is a no-op even when source/target differ only by surface form', async () => {
			await seedFile('a.txt', 'payload');
			const adapter = await lfa();
			await adapter.moveFile('./a.txt', 'a/../a.txt');
			expect(await adapter.readTextFile('a.txt')).toBe('payload');
			const entries = await adapter.listDirectory('.');
			expect(entries.map((e) => e.name)).toEqual(['a.txt']);
		});

		it('is a no-op even when the file does not exist', async () => {
			const adapter = await lfa();
			await expect(adapter.moveFile('missing.txt', 'missing.txt')).resolves.toBeUndefined();
		});
	});

	describe('validation', () => {
		it('rejects an empty source', async () => {
			const adapter = await lfa();
			await expect(adapter.moveFile('', 'dst.txt')).rejects.toBeInstanceOf(AdapterValidationError);
		});

		it('rejects an empty destination', async () => {
			await seedFile('src.txt', 'x');
			const adapter = await lfa();
			await expect(adapter.moveFile('src.txt', '')).rejects.toBeInstanceOf(AdapterValidationError);
		});

		it('rejects moving the root path', async () => {
			const adapter = await lfa();
			await expect(adapter.moveFile('.', 'other')).rejects.toBeInstanceOf(AdapterValidationError);
		});
	});
});

describe('LocalFsAdapter — verifyPermission / requestPermission', () => {
	it('verifyPermission() returns the underlying state', async () => {
		fsaState.permission = 'granted';
		const adapter = await lfa();
		expect(await adapter.verifyPermission()).toBe('granted');
	});

	it('verifyPermission() reflects a denied state', async () => {
		fsaState.permission = 'denied';
		const adapter = await lfa();
		expect(await adapter.verifyPermission()).toBe('denied');
	});

	it('verifyPermission() reflects a prompt state', async () => {
		fsaState.permission = 'prompt';
		const adapter = await lfa();
		expect(await adapter.verifyPermission()).toBe('prompt');
	});

	it('requestPermission() returns the underlying state', async () => {
		fsaState.permission = 'granted';
		const adapter = await lfa();
		expect(await adapter.requestPermission()).toBe('granted');
	});

	it('requestPermission() throws FsaPermissionError on AbortError', async () => {
		fsaState.requestPermissionError = new DOMException('cancelled', 'AbortError');
		const adapter = await lfa();
		await expect(adapter.requestPermission()).rejects.toBeInstanceOf(FsaPermissionError);
	});

	it('requestPermission() rethrows non-AbortError exceptions', async () => {
		fsaState.requestPermissionError = new Error('crypto unavailable');
		const adapter = await lfa();
		await expect(adapter.requestPermission()).rejects.toThrow('crypto unavailable');
	});

	it('mutating ops throw FsaPermissionError when permission is "denied"', async () => {
		await seedFile('a.txt', 'x');
		fsaState.permission = 'denied';
		const adapter = await lfa();
		await expect(adapter.writeTextFile('a.txt', 'y')).rejects.toBeInstanceOf(FsaPermissionError);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Hardening: explicit error discriminator checks (matches memory-fs.test.ts
// style). These pin the invariant that adapter errors expose a `type`
// discriminator and a meaningful `name` so future regressions in the error
// hierarchy are caught immediately.
// ─────────────────────────────────────────────────────────────────────────────

describe('LocalFsAdapter — error hierarchy + discriminator', () => {
	it('AdapterNotFoundError carries the offending path and type', async () => {
		const adapter = await lfa();
		const err = await adapter.readTextFile('missing.txt').then(
			() => null,
			(e: unknown) => e
		);
		expect(err).toBeInstanceOf(AdapterNotFoundError);
		expect((err as AdapterNotFoundError).type).toBe('not-found');
		expect((err as AdapterNotFoundError).path).toBe('missing.txt');
		expect((err as AdapterNotFoundError).name).toBe('AdapterNotFoundError');
	});

	it('FsaPermissionError carries the handleName when available', async () => {
		fsaState.pickError = new DOMException('cancelled', 'AbortError');
		const err = await lfa().then(
			() => null,
			(e: unknown) => e
		);
		expect(err).toBeInstanceOf(FsaPermissionError);
		// pick() throws FsaPermissionError with no handle name because the
		// picker aborted before any handle was granted.
		expect((err as FsaPermissionError).handleName).toBeUndefined();
		expect((err as FsaPermissionError).type).toBe('fsa-permission-denied');
	});

	it('FsaUnavailableError exposes the discriminated type', async () => {
		delete (globalThis as unknown as { window?: unknown }).window;
		const err = await lfa().then(
			() => null,
			(e: unknown) => e
		);
		expect(err).toBeInstanceOf(FsaUnavailableError);
		expect((err as FsaUnavailableError).type).toBe('fsa-unavailable');
	});
});
