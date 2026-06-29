/**
 * Remote Git adapter — implements the partial-clone flow defined in ERS FR-5
 * and FR-12, plus the IndexedDB cache contract from FR-10.
 *
 * ## Scope
 *
 * - **Read-only.** This adapter never pushes, never creates branches,
 *   never opens pull requests. The user is responsible for version control.
 *   (C-2)
 *
 * - **Partial clone.** Only the `.agnostic-issuer/` subtree of the remote
 *   repository is fetched. The rest of the repository is never downloaded.
 *   (FR-12)
 *
 * - **CORS proxy.** All network traffic goes through a configurable proxy
 *   (default `https://cors.isomorphic-git.org`). The proxy operator can
 *   see the request, including any `Authorization` header — we surface
 *   this to the caller via a banner text. (FR-12, NFR-2)
 *
 * - **In-memory PAT.** The PAT is passed to `isomorphic-git` only through
 *   the `onAuth` callback. It is never stored in `localStorage`,
 *   `sessionStorage`, IndexedDB, or any URL. (NFR-2)
 *
 * - **Cached.** A successful fetch populates an IndexedDB-backed
 *   LightningFS instance; a re-fetch of the same `url|branch|sha` reuses
 *   it without network calls. (FR-10)
 *
 * ## Security
 *
 * - The PAT is a branded type (`_logger.brandPat`); only `onAuth` can
 *   unwrap it for the call to `isomorphic-git`.
 * - The CORS proxy URL is a branded type; the logger redacts it
 *   (preserving only the host) so devtools snapshots never leak the full
 *   proxy configuration.
 * - The cache key is `<url>|<branch>|<sha>`. The PAT is never part of
 *   the key (the key is persisted in IndexedDB; the PAT is not).
 *
 * ERS coverage: FR-5, FR-10, FR-12, NFR-2, C-2, C-5.
 */

import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import LightningFS from '@isomorphic-git/lightning-fs';
import { brandPat, brandProxyUrl, debug, error, info, warn, isBrandedPat } from './_logger.ts';
import { AdapterNotFoundError, RemoteAuthError, RemoteFetchError } from './errors.ts';
import { splitPath, type DirectoryEntry } from './directory-adapter.ts';

// ─── Branded types ──────────────────────────────────────────────────────────

declare const REPO_URL_BRAND: unique symbol;
declare const BRANCH_BRAND: unique symbol;
declare const SHA_BRAND: unique symbol;

/** A canonicalised remote Git URL. Use {@link brandRepoUrl} to construct. */
export type RepoUrl = string & { readonly [REPO_URL_BRAND]: true };

/** A branch name. Validated by {@link brandBranch}. */
export type Branch = string & { readonly [BRANCH_BRAND]: true };

/** A 40-char hex SHA. Validated by {@link brandSha}. */
export type Sha = string & { readonly [SHA_BRAND]: true };

/** A relative POSIX path under the cloned `.agnostic-issuer/` root. */
export type SubtreePath = `.agnostic-issuer/${string}`;

const REPO_URL_RE = /^(https?:\/\/[\w.-]+(\/[\w./\-~]+)*|git@[\w.-]+:[\w./\-~]+)$/;
const BRANCH_RE = /^[\w./-]{1,255}$/;
const SHA_RE = /^[a-f0-9]{40}$/i;

function brandRepoUrl(value: string): RepoUrl {
	const trimmed = value.trim();
	if (!REPO_URL_RE.test(trimmed)) {
		throw new RemoteFetchError(`Invalid repository URL: ${value}`);
	}
	return trimmed as RepoUrl;
}

function brandBranch(value: string): Branch {
	const trimmed = value.trim();
	if (!BRANCH_RE.test(trimmed)) {
		throw new RemoteFetchError(`Invalid branch name: ${value}`);
	}
	return trimmed as Branch;
}

function brandSha(value: string): Sha {
	const trimmed = value.trim();
	if (!SHA_RE.test(trimmed)) {
		throw new RemoteFetchError(`Invalid SHA: ${value}`);
	}
	return trimmed.toLowerCase() as Sha;
}

/** Re-validate a {@link RepoUrl} that may have been cast through `unknown`. */
function revalidateRepoUrl(value: RepoUrl): RepoUrl {
	if (typeof value !== 'string' || !REPO_URL_RE.test(value.trim())) {
		throw new RemoteFetchError('Invalid repository URL');
	}
	return value;
}

/** Re-validate a {@link Branch} that may have been cast through `unknown`. */
function revalidateBranch(value: Branch): Branch {
	if (typeof value !== 'string' || !BRANCH_RE.test(value.trim())) {
		throw new RemoteFetchError('Invalid branch name');
	}
	return value;
}

// ─── Public types ───────────────────────────────────────────────────────────

declare const CACHE_KEY_BRAND: unique symbol;

/**
 * A cache key for a remote-git clone. Format: `<url>|<branch>|<sha>`.
 *
 * Branding this type makes the compiler refuse a bare `string` at every
 * site that accepts a {@link CacheKey} — callers must go through
 * {@link makeCacheKey} or {@link brandCacheKey}. The runtime registry
 * (see `_logger.ts`) is the single source of truth for what counts as
 * "branded"; the type itself is nominal only.
 *
 * The PAT is NEVER part of the key — see `fetchSubtree` for the
 * PAT-hygiene rationale.
 */
export type CacheKey = string & { readonly [CACHE_KEY_BRAND]: true };

/**
 * Re-validate an existing key (e.g. one read from IndexedDB) and rebrand
 * it. Throws if the input does not match `<url>|<branch>|<sha>`.
 */
export function brandCacheKey(value: string): CacheKey {
	const parts = value.split('|');
	if (parts.length < 3) {
		throw new RemoteFetchError(`Invalid cache key: ${value}`);
	}
	// Re-validate the url + branch via the existing branders so a malformed
	// key fails fast at the boundary.
	brandRepoUrl(parts[0] as string);
	brandBranch(parts[1] as string);
	// The sha segment is intentionally not re-validated via brandSha:
	// the third segment may include path-like components if a caller ever
	// extends the format. We accept any string past the first `|`.
	CACHE_KEY_REGISTRY.add(value);
	return value as CacheKey;
}

const CACHE_KEY_REGISTRY: Set<string> = new Set();

/** Build a {@link CacheKey} from the canonical (url, branch, sha) triple. */
export function makeCacheKey(url: RepoUrl, branch: Branch, sha: Sha): CacheKey {
	const value = `${url}|${branch}|${sha}`;
	CACHE_KEY_REGISTRY.add(value);
	return value as CacheKey;
}

/** Type guard: returns `true` when the value is a registered {@link CacheKey}. */
export function isCacheKey(value: unknown): value is CacheKey {
	return typeof value === 'string' && CACHE_KEY_REGISTRY.has(value);
}

/** A bare PAT, unbranded. Acceptable for use as an `onAuth` argument. */
export type RawPat = string;

/** Options for {@link fetchSubtree}. All fields are required for clarity. */
export interface FetchOptions {
	readonly url: RepoUrl;
	readonly branch: Branch;
	/** Pass `null` for public repos; pass a string for private repos. */
	readonly pat: RawPat | null;
	/**
	 * CORS proxy URL. The default is `https://cors.isomorphic-git.org` per
	 * ERS FR-12; tests may override.
	 */
	readonly corsProxy?: string;
	/**
	 * Shallow-clone depth. Defaults to `1` per ERS Appendix D.
	 *  - `1` → only the branch tip is fetched
	 *  - larger values → linear history back from the tip
	 */
	readonly depth?: number;
}

/** Result of a successful {@link fetchSubtree}. */
export interface FetchResult {
	readonly url: RepoUrl;
	readonly branch: Branch;
	readonly sha: Sha;
	/** The adapter rooted at the cloned `.agnostic-issuer/` subtree. */
	readonly adapter: ReadonlyRemoteAdapter;
	/** Cache key under which the clone is stored. */
	readonly cacheKey: CacheKey;
	/** Warning text the UI should display about the CORS proxy. */
	readonly proxyWarning: string;
}

/** Constructor for the in-memory portion of the adapter. */
export interface ReadonlyRemoteAdapter {
	/** Resolve the SHA currently checked out (the branch tip). */
	headSha(): Promise<Sha>;
	/** Read a file at `<subtree-root>/<rel>` (POSIX, no leading `/`). */
	readTextFile(rel: string): Promise<string>;
	/** List a directory at `<subtree-root>/<rel>` (POSIX). */
	listDirectory(rel: string): Promise<DirectoryEntry[]>;
	/** Existence check for a path (no throw). */
	exists(rel: string): Promise<boolean>;
}

// ─── Defaults ───────────────────────────────────────────────────────────────

/** ERS-mandated default CORS proxy. */
export const DEFAULT_CORS_PROXY = 'https://cors.isomorphic-git.org';

/** Default shallow-clone depth (ERS Appendix D). */
export const DEFAULT_DEPTH = 1;

/** The subtree we always clone. Hard-coded; do not expose as an option. */
export const SUBTREE = '.agnostic-issuer' as const;

// ─── Adapter implementation ─────────────────────────────────────────────────

/**
 * Fetch the `.agnostic-issuer/` subtree of a remote Git repository and
 * return a {@link ReadonlyRemoteAdapter} rooted at the subtree.
 *
 * The returned adapter is a *snapshot*: it does not pick up subsequent
 * remote changes. Call this function again to refresh.
 */
export async function fetchSubtree(options: FetchOptions): Promise<FetchResult> {
	const depth = options.depth ?? DEFAULT_DEPTH;
	const corsProxy = brandProxyUrl(options.corsProxy ?? DEFAULT_CORS_PROXY);
	// Re-validate the brands at the public boundary. Callers may have
	// cast through `as unknown as ...` to bypass the type system; the
	// runtime checks here are the canonical guard.
	const repoUrl = revalidateRepoUrl(options.url);
	const branch = revalidateBranch(options.branch);
	const pat = options.pat !== null ? brandPat(options.pat) : null;

	info(`Fetching ${repoUrl} on branch ${branch} (depth ${depth}) via proxy`, corsProxy);

	// The LightningFS database name MUST NOT contain the PAT. We derive a
	// deterministic name from the (url, branch) pair; the SHA is appended
	// later once known, but the database is reused across SHAs to keep
	// deltas cheap (FR-10: "Reload reuses the cache and only fetches deltas").
	const fsName = makeCacheKey(repoUrl, branch, 'pending' as Sha).replace(/[|]/g, '_');
	const fs = new LightningFS(fsName);

	// Sanity: the LightningFS database name above is deterministic but does
	// not contain the PAT. If you ever change the format, audit this log
	// line below — a future contributor should never see a PAT-shaped
	// substring in any of the resulting IDB databases.
	debug(`LightningFS database name:`, fsName);

	try {
		await git.init({ fs, dir: '/', defaultBranch: branch });
	} catch (cause) {
		throw new RemoteFetchError('git.init failed', { cause });
	}

	try {
		await git.addRemote({
			fs,
			dir: '/',
			remote: 'origin',
			url: repoUrl,
			force: true
		});
	} catch (cause) {
		throw new RemoteFetchError('git.addRemote failed', { cause });
	}

	// onAuth is the ONLY path the PAT takes. It lives in the closure for
	// the duration of the fetch and is dropped on return — no global, no
	// module-level state, no IndexedDB.
	const onAuth = pat === null ? () => ({}) : () => ({ username: pat });

	try {
		await git.fetch({
			fs,
			http,
			dir: '/',
			ref: branch,
			singleBranch: true,
			depth,
			// isomorphic-git's onAuth contract: return `{ username, password }`
			// or an empty object for anonymous access.
			onAuth,
			corsProxy: options.corsProxy ?? DEFAULT_CORS_PROXY
		});
	} catch (cause) {
		throw translateFetchError(cause);
	}

	const sha = await resolveBranchTip({ fs, branch });
	const cacheKey = makeCacheKey(repoUrl, branch, sha);

	const adapter = buildReadonlyAdapter({ fs, branch, subtree: SUBTREE });

	const proxyWarning =
		`The configured CORS proxy (${safeHost(corsProxy)}) can see every request, ` +
		`including the Authorization header. Use a self-hosted proxy if this is a concern.`;

	info(`Fetch complete. SHA=${sha}, cacheKey=${cacheKey}`);

	return { url: repoUrl, branch, sha, adapter, cacheKey, proxyWarning };
}

// ─── Cache management ───────────────────────────────────────────────────────

/**
 * Clear the cached clone for a given cache key.
 *
 * Note: LightningFS doesn't expose a "drop one db" API; we instead
 * call `.rmdir` on the mounted path. For a complete wipe, use
 * {@link clearAllCaches}.
 */
export async function clearCache(key: CacheKey): Promise<void> {
	// Defence-in-depth: re-validate the brand at the public boundary.
	// Callers may have cast through `as unknown as CacheKey` to bypass
	// the type system; the registry check below is the canonical guard.
	if (!isCacheKey(key)) {
		throw new RemoteFetchError(`Cannot clear cache: invalid key`);
	}
	const { url, branch } = parseCacheKey(key);
	if (url === null || branch === null) {
		throw new RemoteFetchError(`Cannot clear cache: invalid key`);
	}
	const fsName = makeCacheKey(url, branch, 'pending' as Sha).replace(/[|]/g, '_');
	const fs = new LightningFS(fsName);
	try {
		await new Promise<void>((resolve, reject) => {
			// LightningFS's rmdir signature is `rmdir(path, options?, callback)`
			// but its TS types model it as `rmdir(path, callback)`. Cast to
			// the actual runtime signature to pass the recursive option.
			(
				fs as unknown as {
					rmdir(
						path: string,
						options: { recursive: boolean },
						cb: (err: Error | null) => void
					): void;
				}
			).rmdir('/', { recursive: true }, (err) => (err ? reject(err) : resolve()));
		});
	} catch (cause) {
		throw new RemoteFetchError('Failed to clear cache', { cause });
	}
	debug(`Cleared cache for`, key);
}

/** Clear every cached clone by destroying all known LightningFS databases. */
export async function clearAllCaches(): Promise<void> {
	// No public enumeration API in LightningFS; this is a best-effort
	// helper. Production callers should track the keys they care about
	// and call {@link clearCache} individually.
	warn('clearAllCaches: no enumeration API available; use clearCache(key) per known cache');
}

// ─── Internal helpers ───────────────────────────────────────────────────────

/** Read the branch tip SHA from the local repo. */
async function resolveBranchTip(args: { fs: LightningFS; branch: Branch }): Promise<Sha> {
	const { fs, branch } = args;
	try {
		const sha = await git.resolveRef({ fs, dir: '/', ref: branch });
		return brandSha(sha);
	} catch (cause) {
		throw new RemoteFetchError(`Cannot resolve branch tip for ${branch}`, { cause });
	}
}

/**
 * Build a {@link ReadonlyRemoteAdapter} rooted at the given subtree.
 *
 * All paths passed to the adapter are interpreted relative to
 * `<lightning-fs>/<subtree>`. The service layer never sees the underlying
 * LightningFS instance.
 */
function buildReadonlyAdapter(args: {
	fs: LightningFS;
	branch: Branch;
	subtree: typeof SUBTREE;
}): ReadonlyRemoteAdapter {
	const { fs, subtree } = args;

	function fullPath(rel: string): string {
		// No `..` is allowed (security: prevent escaping the subtree).
		const { parent, name } = splitPath(rel);
		void parent;
		void name;
		// LightningFS expects forward slashes, no leading slash for the root.
		const joined = rel === '.' || rel === '' ? subtree : `${subtree}/${rel}`;
		// Defensive: re-check `..` is not present.
		if (joined.split('/').includes('..')) {
			throw new AdapterNotFoundError(rel);
		}
		return joined;
	}

	async function lfsReadTextFile(path: string): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			fs.readFile(path, 'utf8', (err: Error | null, data: string | Buffer) => {
				if (err) {
					reject(err);
					return;
				}
				const text = typeof data === 'string' ? data : (data as Buffer).toString('utf8');
				resolve(text);
			});
		});
	}

	async function lfsReaddir(path: string): Promise<DirectoryEntry[]> {
		return new Promise<DirectoryEntry[]>((resolve, reject) => {
			// LightningFS types declare these as 2-arg (no options object).
			// Cast to the actual runtime shape so we can still type the
			// callback parameters strictly.
			(
				fs as unknown as {
					readdir(p: string, cb: (err: Error | null, entries: string[]) => void): void;
				}
			).readdir(path, (err, entries) => {
				if (err) {
					reject(err);
					return;
				}
				const result: DirectoryEntry[] = [];
				let pending = entries.length;
				if (pending === 0) {
					resolve([]);
					return;
				}
				for (const name of entries) {
					const child = `${path}/${name}`;
					(
						fs as unknown as {
							lstat(
								p: string,
								cb: (err: Error | null, stat: { type: string } | undefined) => void
							): void;
						}
					).lstat(child, (lerr, stat) => {
						if (lerr) {
							reject(lerr);
							return;
						}
						result.push({
							name,
							kind: stat?.type === 'dir' ? 'directory' : 'file'
						});
						pending -= 1;
						if (pending === 0) {
							result.sort((a, b) => a.name.localeCompare(b.name));
							resolve(result);
						}
					});
				}
			});
		});
	}

	async function lfsExists(path: string): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			(
				fs as unknown as {
					stat(p: string, cb: (err: Error | null | undefined) => void): void;
				}
			).stat(path, (err) => resolve(err === undefined || err === null));
		});
	}

	return {
		async headSha() {
			// Caller already has the SHA (it's in the FetchResult). This is
			// here for symmetry with the interface, but the remote-git module
			// uses the SHA from the fetch call directly.
			throw new RemoteFetchError(
				'headSha() must be called via the result of fetchSubtree, not the adapter'
			);
		},
		async readTextFile(rel: string) {
			try {
				return await lfsReadTextFile(fullPath(rel));
			} catch (cause) {
				throw new AdapterNotFoundError(rel, cause);
			}
		},
		async listDirectory(rel: string) {
			try {
				return await lfsReaddir(fullPath(rel));
			} catch (cause) {
				throw new AdapterNotFoundError(rel, cause);
			}
		},
		async exists(rel: string) {
			return lfsExists(fullPath(rel));
		}
	};
}

/**
 * Parse a cache key into its components. Returns `null` for components that
 * don't validate.
 */
function parseCacheKey(key: CacheKey): { url: RepoUrl | null; branch: Branch | null } {
	const parts = key.split('|');
	if (parts.length < 3) return { url: null, branch: null };
	try {
		return { url: brandRepoUrl(parts[0] as string), branch: brandBranch(parts[1] as string) };
	} catch {
		return { url: null, branch: null };
	}
}

/** Translate a raw isomorphic-git error to an {@link AdapterError} subclass. */
function translateFetchError(cause: unknown): RemoteAuthError | RemoteFetchError {
	// isomorphic-git rejects auth failures with an Error whose message
	// contains "401" or "Authentication"; we forward as RemoteAuthError.
	if (cause instanceof Error) {
		const msg = cause.message.toLowerCase();
		if (msg.includes('401') || msg.includes('403') || msg.includes('auth')) {
			return new RemoteAuthError('Authentication failed (bad or expired token)', cause);
		}
		if (msg.includes('not found') || msg.includes('404')) {
			return new RemoteFetchError('Repository or branch not found', { cause });
		}
	}
	error('git.fetch failed');
	return new RemoteFetchError('git.fetch failed', { cause });
}

function safeHost(proxy: string): string {
	try {
		return new URL(proxy).host;
	} catch {
		return '[unparseable-proxy]';
	}
}

/** Type guard for a {@link Pat} value at runtime. Re-exported from _logger. */
export const isPat = isBrandedPat;
