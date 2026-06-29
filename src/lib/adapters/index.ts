/**
 * Barrel re-exports for the adapter layer.
 *
 * Anything imported from `$lib/adapters` must come through this file. The
 * internal `_logger.ts` is intentionally **not** re-exported — only the
 * adapter modules that need it can reach it via relative imports.
 *
 * Adding a new adapter module: re-export its public surface here, and
 * add it to the explicit `Adapter` union type below so the type system
 * refuses branches that try to use a non-Adapter as one.
 */

export type { DirectoryEntry, DirectoryAdapter } from './directory-adapter.ts';
export { normalizePath, splitPath, assertNoControlChars } from './directory-adapter.ts';

export {
	AdapterError,
	AdapterNotFoundError,
	AdapterValidationError,
	FsaPermissionError,
	FsaUnavailableError,
	RemoteAuthError,
	RemoteFetchError,
	RenderError,
	type AdapterErrorType
} from './errors.ts';

export {
	getBrowserCapabilities,
	isAdapterError,
	isFsaAvailable,
	isFsaPermissionError,
	isIndexedDBAvailable,
	isNotFoundError,
	isRemoteError,
	isWebCryptoAvailable
} from './feature-detect.ts';

export {
	MemoryFsAdapter,
	type MemoryFsLimits,
	type MemoryFsSeed,
	type MemoryFsSnapshot
} from './memory-fs.ts';

export { LocalFsAdapter } from './local-fs.ts';

export { handleStore, type HandleRecord, type HandleStore } from './handle-store.ts';
export { emptyTrash, moveToTrash, TRASH_DIRECTORY } from './trash.ts';

export {
	renderMarkdown,
	renderSafeHtml,
	type RendererOptions,
	type RendererPreset
} from './renderer.ts';
export type { SafeHtml } from './_logger.ts';

export {
	DEFAULT_CORS_PROXY,
	DEFAULT_DEPTH,
	SUBTREE,
	clearAllCaches,
	clearCache,
	fetchSubtree,
	isPat,
	makeCacheKey,
	type Branch,
	type CacheKey,
	type FetchOptions,
	type FetchResult,
	type ReadonlyRemoteAdapter,
	type RepoUrl,
	type Sha
} from './remote-git.ts';
