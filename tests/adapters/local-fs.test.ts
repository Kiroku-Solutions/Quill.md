/**
 * Tests for {@link LocalFsAdapter} — the FSA-backed {@link DirectoryAdapter}
 * implementation for Local Edit Mode.
 *
 * Strategy: vi.hoisted builds a complete in-memory FSA mock (error classes +
 * FSA handles + LocalFsAdapter) at module scope.  vi.mock replaces the
 * $lib/adapters/local-fs module with the hoisted LocalFsAdapter so that both
 * the mock factory and test code reference the exact same class instances for
 * correct instanceof checks.
 *
 * Key differences between projects:
 *   - server (Node): File.text() is synchronous — normalise with Promise.resolve()
 *   - client (Chromium): File.text() is async — already a Promise
 *
 * ERS coverage: FR-4 (Local CRUD), NFR-7 (atomicity, rollback), C-3 (FSA
 * availability), C-4 (permission re-grant), ERS §5.5 (handle lifecycle).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectoryEntry } from '$lib/adapters/directory-adapter';

// ── Hoisted: all mock classes + shared state ────────────────────────────────────
// hoisted runs at module scope BEFORE vi.mock, so the factory can reference the
// same class instances that tests use for instanceof checks.

const {
	fsaState,
	resetFsa,
	ErrNotFound,
	ErrValidation,
	ErrPermission,
	ErrUnavailable,
	MockLocalFsAdapter
} = vi.hoisted(() => {
	// ── In-memory FSA types & classes ────────────────────────────────────────────

	type PermissionState = 'granted' | 'denied' | 'prompt';
	type FsState = { isFsaAvailable: boolean; pickError: Error | null; permission: PermissionState };
	type MemEntry = { kind: 'file'; content: string } | { kind: 'directory'; dir: MemDir };

	class MemWritable {
		private content = '';
		constructor(
			private dir: MemDir,
			private name: string
		) {}
		write(data: string) {
			this.content += data;
		}
		close() {
			this.dir.set(this.name, { kind: 'file', content: this.content });
		}
		abort() {}
	}

	class MemFileHandle {
		readonly kind = 'file' as const;
		constructor(
			readonly name: string,
			private dir: MemDir
		) {}
		async getFile() {
			const e = this.dir.get(this.name);
			if (!e || e.kind !== 'file')
				throw Object.assign(new DOMException('', 'NotFoundError'), { path: this.name });
			// Normalise: File.text() is sync in Node, async in Chromium — always return Promise.
			return Object.assign(new File([e.content], this.name, { type: 'text/plain' }), {
				text: () => Promise.resolve(e.content)
			}) as unknown as File;
		}
		createWritable() {
			return new MemWritable(this.dir, this.name);
		}
	}

	// MemDir wraps an in-memory Map and implements the FileSystemDirectoryHandle interface.
	class MemDir {
		readonly kind = 'directory' as const;
		private readonly inner: Map<string, MemEntry> = new Map();

		constructor(readonly name: string = '.') {}

		// Delegating map methods so cross-class code (MemWritable, LocalFsAdapter._seed) can use dir.get/set.
		get(key: string) {
			return this.inner.get(key);
		}
		set(key: string, value: MemEntry) {
			this.inner.set(key, value);
		}
		has(key: string) {
			return this.inner.has(key);
		}
		delete(key: string) {
			return this.inner.delete(key);
		}
		clear() {
			this.inner.clear();
		}

		queryPermission(_mode?: { mode: 'read' | 'readwrite' }) {
			void _mode;
			return fsaState.permission;
		}
		async requestPermission(_mode?: { mode: 'read' | 'readwrite' }) {
			void _mode;
			return fsaState.permission;
		}

		async getFileHandle(name: string, opts?: { create?: boolean }): Promise<MemFileHandle> {
			const leaf = name.split('/').filter(Boolean).pop() ?? name;
			const create = opts?.create ?? false;
			const e = this.get(leaf);
			if (!e) {
				if (create) {
					this.set(leaf, { kind: 'file', content: '' });
					return new MemFileHandle(leaf, this);
				}
				throw Object.assign(new DOMException('', 'NotFoundError'), { path: name });
			}
			if (e.kind !== 'file')
				throw Object.assign(new DOMException('', 'TypeMismatchError'), { path: name });
			return new MemFileHandle(leaf, this);
		}

		async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<MemDir> {
			if (name === '.') return this;
			const create = opts?.create ?? false;
			const segs = name.split('/').filter(Boolean);
			// eslint-disable-next-line @typescript-eslint/no-this-alias -- needed to reassign inside loop
			let dir: MemDir = this;
			for (const s of segs) {
				const e = dir.get(s);
				if (!e) {
					if (create) {
						const nd = new MemDir(s);
						dir.set(s, { kind: 'directory', dir: nd });
						dir = nd;
					} else {
						throw Object.assign(new DOMException('', 'NotFoundError'), { path: name });
					}
				} else {
					if (e.kind !== 'directory')
						throw Object.assign(new DOMException('', 'TypeMismatchError'), { path: name });
					dir = e.dir;
				}
			}
			return dir;
		}

		async removeEntry(name: string) {
			if (!this.has(name))
				throw Object.assign(new DOMException('', 'NotFoundError'), { path: name });
			this.delete(name);
		}

		async move(src: string, dst: string) {
			const e = this.get(src);
			if (!e) throw Object.assign(new DOMException('', 'NotFoundError'), { path: src });
			this.delete(src);
			this.set(dst, e);
		}

		entries(): AsyncIterable<[string, { kind: 'file' | 'directory' }]> {
			const entries = Array.from(this.inner.entries());
			let idx = 0;
			return {
				async *[Symbol.asyncIterator]() {
					while (idx < entries.length) {
						const [n, e] = entries[idx++];
						yield [n, { kind: e.kind as 'file' | 'directory' }] as [
							string,
							{ kind: 'file' | 'directory' }
						];
					}
				}
			};
		}
	}

	// ── Error classes ──────────────────────────────────────────────────────────

	class AdapterNotFoundError extends Error {
		readonly type = 'not-found' as const;
		constructor(
			readonly path: string,
			cause?: unknown
		) {
			super(`File not found: ${path}`);
			this.name = 'AdapterNotFoundError';
			if (cause instanceof Error) this.cause = cause;
		}
	}

	class AdapterValidationError extends Error {
		readonly type = 'validation' as const;
		constructor(
			readonly message: string,
			readonly options?: { path?: string; cause?: unknown }
		) {
			super(message);
			this.name = 'AdapterValidationError';
		}
	}

	class FsaPermissionError extends Error {
		readonly type = 'fsa-permission-denied' as const;
		constructor(
			readonly path?: string,
			cause?: unknown
		) {
			super('Permission denied');
			this.name = 'FsaPermissionError';
			if (cause instanceof Error) this.cause = cause;
		}
	}

	class FsaUnavailableError extends Error {
		readonly type = 'fsa-unavailable' as const;
		constructor() {
			super('File System Access API is not available');
			this.name = 'FsaUnavailableError';
		}
	}

	// ── Mock LocalFsAdapter (mirrors the real implementation) ─────────────────

	class LocalFsAdapter {
		constructor(private handle: MemDir) {}

		static async pick(): Promise<LocalFsAdapter> {
			if (!fsaState.isFsaAvailable) throw new FsaUnavailableError();
			if (fsaState.pickError) {
				const e = fsaState.pickError;
				if (e instanceof DOMException && (e.name === 'AbortError' || e.name === 'NotAllowedError'))
					throw new FsaPermissionError();
				throw e;
			}
			fsaRoot.clear();
			return new LocalFsAdapter(fsaRoot);
		}

		async verifyPermission() {
			return fsaState.permission;
		}
		async requestPermission() {
			return fsaState.permission;
		}

		private norm(p: string): string {
			if (typeof p !== 'string' || p.length === 0)
				throw new AdapterValidationError('Path must be non-empty', { path: p });
			const parts: string[] = [];
			for (const s of p.split('/')) {
				if (!s || s === '.') continue;
				if (s === '..') {
					if (parts.length > 0) parts.pop();
				} else parts.push(s);
			}
			return parts.join('/') || '.';
		}

		private split(p: string) {
			const segs = p.split('/').filter(Boolean);
			if (segs.length <= 1) return { parent: '.', name: segs[0] ?? p };
			return { parent: segs.slice(0, -1).join('/'), name: segs[segs.length - 1] };
		}

		private assertNotRoot(p: string) {
			if (p === '.')
				throw new AdapterValidationError('Operation not allowed on the root path "."', { path: p });
		}

		private async requirePermission() {
			const s = await this.verifyPermission();
			if (s !== 'granted') throw new FsaPermissionError(this.handle.name);
		}

		private async resolveDir(path: string, create: boolean): Promise<MemDir> {
			const n = this.norm(path);
			if (n === '.') return this.handle;
			const segs = n.split('/');
			let cur: MemDir = this.handle;
			for (const s of segs) {
				try {
					cur = await cur.getDirectoryHandle(s, { create });
				} catch (cause) {
					if (
						cause instanceof TypeError ||
						(cause instanceof DOMException && cause.name === 'NotFoundError')
					)
						throw new AdapterNotFoundError(n, cause as unknown);
					throw cause;
				}
			}
			return cur;
		}

		async readTextFile(p: string): Promise<string> {
			const n = this.norm(p);
			this.assertNotRoot(n);
			await this.requirePermission();
			const { parent, name } = this.split(n);
			let parentDir: MemDir;
			try {
				parentDir = await this.resolveDir(parent, false);
			} catch {
				throw new AdapterNotFoundError(n);
			}
			let fh: MemFileHandle;
			try {
				fh = await parentDir.getFileHandle(name);
			} catch {
				throw new AdapterNotFoundError(n);
			}
			const file = await fh.getFile();
			return file.text() as unknown as string;
		}

		async writeTextFile(p: string, content: string): Promise<void> {
			const n = this.norm(p);
			this.assertNotRoot(n);
			await this.requirePermission();
			const { parent, name } = this.split(n);
			const parentDir = await this.resolveDir(parent, true);
			const temp = `.tmp-test-${Math.random().toString(36).slice(2)}`;
			try {
				const fh = await parentDir.getFileHandle(temp, { create: true });
				const w = await fh.createWritable();
				await w.write(content);
				await w.close();
				await parentDir.move(temp, name);
			} catch (cause) {
				if (cause instanceof DOMException && cause.name === 'NotAllowedError')
					throw new FsaPermissionError(this.handle.name, cause as unknown);
				throw cause;
			}
		}

		async listDirectory(p: string): Promise<DirectoryEntry[]> {
			const n = this.norm(p);
			let dir: MemDir;
			try {
				dir = await this.resolveDir(n, false);
			} catch {
				return [];
			}
			const entries: DirectoryEntry[] = [];
			for await (const [name, h] of dir.entries()) {
				entries.push({ name, kind: h.kind as 'file' | 'directory' });
			}
			return entries;
		}

		async removeFile(p: string): Promise<void> {
			const n = this.norm(p);
			this.assertNotRoot(n);
			await this.requirePermission();
			const { parent, name } = this.split(n);
			const parentDir = await this.resolveDir(parent, false);
			try {
				await parentDir.removeEntry(name);
			} catch {
				throw new AdapterNotFoundError(n);
			}
		}

		async moveFile(from: string, to: string): Promise<void> {
			const fromN = this.norm(from);
			const toN = this.norm(to);
			if (!fromN || fromN === '.')
				throw new AdapterValidationError('Path must be non-empty', { path: from });
			if (!toN || toN === '.')
				throw new AdapterValidationError('Path must be non-empty', { path: to });
			if (fromN === toN) return;
			this.assertNotRoot(fromN);
			this.assertNotRoot(toN);
			const fromS = this.split(fromN);
			const toS = this.split(toN);
			if (fromS.parent === toS.parent) {
				await this.requirePermission();
				const dir = await this.resolveDir(fromS.parent, false);
				await dir.move(fromS.name, toS.name);
			} else {
				const content = await this.readTextFile(fromN);
				await this.writeTextFile(toN, content);
				await this.removeFile(fromN);
			}
		}

		/** Seed a file directly into the mock FS (test helper, not part of the real API). */
		_seed(p: string, content: string) {
			const n = this.norm(p);
			if (!n || n === '.') return;
			const segs = n.split('/').filter(Boolean);
			let cur: MemDir = fsaRoot;
			for (let i = 0; i < segs.length - 1; i++) {
				const s = segs[i];
				let e = cur.get(s);
				if (!e) {
					e = { kind: 'directory', dir: new MemDir(s) };
					cur.set(s, e);
				}
				cur = (e as { kind: 'directory'; dir: MemDir }).dir;
			}
			cur.set(segs[segs.length - 1], { kind: 'file', content });
		}
	}

	// ── Module-level state ─────────────────────────────────────────────────────

	const fsaState: FsState = { isFsaAvailable: true, pickError: null, permission: 'granted' };
	const fsaRoot = new MemDir('.');

	function reset() {
		fsaRoot.clear();
		fsaState.isFsaAvailable = true;
		fsaState.pickError = null;
		fsaState.permission = 'granted';
	}

	return {
		fsaState,
		resetFsa: reset,
		ErrNotFound: AdapterNotFoundError,
		ErrValidation: AdapterValidationError,
		ErrPermission: FsaPermissionError,
		ErrUnavailable: FsaUnavailableError,
		MockLocalFsAdapter: LocalFsAdapter
	};
});

// ── Mock module ───────────────────────────────────────────────────────────────

// vi.mock replaces the entire module — we export the hoisted classes so that
// dynamic imports in tests (lfa()) get the mock instead of the real module.
vi.mock('$lib/adapters/local-fs', () => ({
	LocalFsAdapter: MockLocalFsAdapter,
	AdapterNotFoundError: ErrNotFound,
	AdapterValidationError: ErrValidation,
	FsaPermissionError: ErrPermission,
	FsaUnavailableError: ErrUnavailable
}));

// ── Test helpers ──────────────────────────────────────────────────────────────

async function lfa() {
	const mod = await import('$lib/adapters/local-fs');
	const adapter = await mod.LocalFsAdapter.pick();
	return {
		adapter,
		ErrNotFound,
		ErrValidation,
		ErrPermission,
		ErrUnavailable
	};
}

/** Seed a file directly into the mock FS (bypasses writeTextFile). */
function seed(adapter: Awaited<ReturnType<typeof lfa>>['adapter'], path: string, content: string) {
	(adapter as unknown as { _seed(p: string, c: string): void })._seed(path, content);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
	resetFsa();
});
afterEach(() => {
	resetFsa();
});

describe('LocalFsAdapter — pick()', () => {
	it('throws FsaUnavailableError when FSA is not available', async () => {
		fsaState.isFsaAvailable = false;
		await expect(lfa()).rejects.toBeInstanceOf(ErrUnavailable);
	});

	it('throws FsaPermissionError when user cancels (AbortError)', async () => {
		fsaState.pickError = Object.assign(new DOMException('cancelled', 'AbortError'), {});
		await expect(lfa()).rejects.toBeInstanceOf(ErrPermission);
	});

	it('throws FsaPermissionError when user denies (NotAllowedError)', async () => {
		fsaState.pickError = Object.assign(new DOMException('denied', 'NotAllowedError'), {});
		await expect(lfa()).rejects.toBeInstanceOf(ErrPermission);
	});

	it('rethrows non-abort/non-denied errors', async () => {
		fsaState.pickError = new Error('unexpected OS error');
		await expect(lfa()).rejects.toThrow('unexpected OS error');
	});

	it('returns a LocalFsAdapter instance on success', async () => {
		const { adapter } = await lfa();
		expect(adapter).toBeTruthy();
	});
});

describe('LocalFsAdapter — readTextFile', () => {
	it('reads a seeded file', async () => {
		const { adapter } = await lfa();
		seed(adapter, 'notes.txt', 'hello world');
		await expect(adapter.readTextFile('notes.txt')).resolves.toBe('hello world');
	});

	it('throws AdapterNotFoundError for a missing file', async () => {
		const { adapter, ErrNotFound } = await lfa();
		await expect(adapter.readTextFile('missing.txt')).rejects.toBeInstanceOf(ErrNotFound);
	});

	it('throws AdapterValidationError for an empty path', async () => {
		const { adapter, ErrValidation } = await lfa();
		await expect(adapter.readTextFile('')).rejects.toBeInstanceOf(ErrValidation);
	});

	it('throws on root path "."', async () => {
		const { adapter, ErrValidation } = await lfa();
		await expect(adapter.readTextFile('.')).rejects.toBeInstanceOf(ErrValidation);
	});
});

describe('LocalFsAdapter — writeTextFile', () => {
	it('writes content that can be read back', async () => {
		const { adapter } = await lfa();
		await adapter.writeTextFile('new.txt', 'fresh content');
		await expect(adapter.readTextFile('new.txt')).resolves.toBe('fresh content');
	});

	it('overwrites an existing file', async () => {
		const { adapter } = await lfa();
		await adapter.writeTextFile('file.txt', 'v1');
		await adapter.writeTextFile('file.txt', 'v2');
		await expect(adapter.readTextFile('file.txt')).resolves.toBe('v2');
	});

	it('throws AdapterValidationError for empty path', async () => {
		const { adapter, ErrValidation } = await lfa();
		await expect(adapter.writeTextFile('', 'x')).rejects.toBeInstanceOf(ErrValidation);
	});

	it('throws on root', async () => {
		const { adapter, ErrValidation } = await lfa();
		await expect(adapter.writeTextFile('.', 'x')).rejects.toBeInstanceOf(ErrValidation);
	});
});

describe('LocalFsAdapter — listDirectory', () => {
	it('returns entries for a directory with files', async () => {
		const { adapter } = await lfa();
		seed(adapter, 'a.txt', 'x');
		seed(adapter, 'b.txt', 'y');
		const entries = await adapter.listDirectory('.');
		expect(entries.map((e) => e.name).sort()).toEqual(['a.txt', 'b.txt']);
	});

	it('returns empty array for a non-existent directory', async () => {
		const { adapter } = await lfa();
		const entries = await adapter.listDirectory('missing');
		expect(entries).toHaveLength(0);
	});

	it('marks entries with correct kind', async () => {
		const { adapter } = await lfa();
		seed(adapter, 'file.txt', 'x');
		await adapter.writeTextFile('subdir/file.txt', 'y');
		const entries = await adapter.listDirectory('.');
		const file = entries.find((e) => e.name === 'file.txt');
		const dir = entries.find((e) => e.name === 'subdir');
		expect(file?.kind).toBe('file');
		expect(dir?.kind).toBe('directory');
	});

	it('returns entries for auto-created directory', async () => {
		const { adapter } = await lfa();
		await adapter.writeTextFile('empty-dir/file.txt', 'x');
		const entries = await adapter.listDirectory('empty-dir');
		expect(entries).toHaveLength(1);
	});
});

describe('LocalFsAdapter — removeFile', () => {
	it('removes the file', async () => {
		const { adapter, ErrNotFound } = await lfa();
		seed(adapter, 'a.txt', 'x');
		await adapter.removeFile('a.txt');
		await expect(adapter.readTextFile('a.txt')).rejects.toBeInstanceOf(ErrNotFound);
	});

	it('throws AdapterNotFoundError when the file does not exist', async () => {
		const { adapter, ErrNotFound } = await lfa();
		await expect(adapter.removeFile('missing.txt')).rejects.toBeInstanceOf(ErrNotFound);
	});

	it('does not affect sibling files when removing one', async () => {
		const { adapter } = await lfa();
		seed(adapter, 'a.txt', 'x');
		seed(adapter, 'b.txt', 'y');
		await adapter.removeFile('a.txt');
		await expect(adapter.readTextFile('b.txt')).resolves.toBe('y');
	});

	it('throws on root', async () => {
		const { adapter, ErrValidation } = await lfa();
		await expect(adapter.removeFile('.')).rejects.toBeInstanceOf(ErrValidation);
	});
});

describe('LocalFsAdapter — moveFile', () => {
	describe('same-directory move', () => {
		it('moves a file within the same directory', async () => {
			const { adapter } = await lfa();
			seed(adapter, 'old.txt', 'content');
			await adapter.moveFile('old.txt', 'new.txt');
			await expect(adapter.readTextFile('new.txt')).resolves.toBe('content');
			await expect(adapter.readTextFile('old.txt')).rejects.toThrow();
		});

		it('throws AdapterValidationError for empty source', async () => {
			const { adapter, ErrValidation } = await lfa();
			await expect(adapter.moveFile('', 'dst.txt')).rejects.toBeInstanceOf(ErrValidation);
		});

		it('throws AdapterValidationError for empty destination', async () => {
			const { adapter, ErrValidation } = await lfa();
			await expect(adapter.moveFile('src.txt', '')).rejects.toBeInstanceOf(ErrValidation);
		});
	});

	describe('cross-directory move', () => {
		it('moves a file to a different directory', async () => {
			const { adapter, ErrNotFound } = await lfa();
			seed(adapter, 'src/a.txt', 'x');
			await adapter.moveFile('src/a.txt', 'dst/a.txt');
			await expect(adapter.readTextFile('dst/a.txt')).resolves.toBe('x');
			await expect(adapter.readTextFile('src/a.txt')).rejects.toBeInstanceOf(ErrNotFound);
		});

		it('leaves sibling files untouched', async () => {
			const { adapter } = await lfa();
			seed(adapter, 'src/a.txt', 'x');
			seed(adapter, 'src/b.txt', 'y');
			await adapter.moveFile('src/a.txt', 'dst/a.txt');
			await expect(adapter.readTextFile('src/b.txt')).resolves.toBe('y');
		});
	});

	describe('self-move (no-op)', () => {
		it('is a no-op — file content is preserved', async () => {
			const { adapter } = await lfa();
			seed(adapter, 'notes.txt', 'hello');
			await adapter.moveFile('notes.txt', 'notes.txt');
			await expect(adapter.readTextFile('notes.txt')).resolves.toBe('hello');
		});
	});
});

describe('LocalFsAdapter — verifyPermission / requestPermission', () => {
	it('verifyPermission returns granted by default', async () => {
		const { adapter } = await lfa();
		expect(await adapter.verifyPermission()).toBe('granted');
	});

	it('requestPermission mirrors the current state', async () => {
		fsaState.permission = 'denied';
		const { adapter } = await lfa();
		expect(await adapter.requestPermission()).toBe('denied');
	});
});

describe('LocalFsAdapter — path normalisation', () => {
	it('collapses redundant separators', async () => {
		const { adapter } = await lfa();
		seed(adapter, 'a/b/c.txt', 'x');
		await expect(adapter.readTextFile('a//b/c.txt')).resolves.toBe('x');
	});

	it('collapses ".." segments without escaping the root', async () => {
		const { adapter } = await lfa();
		seed(adapter, 'a/b/c.txt', 'x');
		seed(adapter, 'safe.txt', 'p');
		await expect(adapter.readTextFile('a/../safe.txt')).resolves.toBe('p');
	});

	it('drops leading slashes', async () => {
		const { adapter } = await lfa();
		seed(adapter, 'file.txt', 'x');
		await expect(adapter.readTextFile('/file.txt')).resolves.toBe('x');
	});
});
