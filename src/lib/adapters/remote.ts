/**
 * Remote adapter orchestrator — the new (Strategy-pattern) entry point.
 *
 * Public API mirrors the previous `remote-git.ts` adapter so service /
 * state / UI code that consumes `fetchSubtree(...)`, `clearCache(...)`,
 * and the `ReadonlyRemoteAdapter` shape does not change. The
 * implementation is provider-driven: each provider implements the
 * {@link RepoProvider} interface under `providers/`.
 *
 * Migration history:
 *   - Pre-revision: isomorphic-git + LightningFS (now `legacy-git.ts`).
 *   - This revision: GitHub / GitLab REST APIs behind a Strategy.
 *
 * ERS mapping: FR-5 (Remote Edit Mode), FR-16 (commit lifecycle),
 * FR-17 (edit-branch advisory).
 */

import { detectProvider, resolveProvider } from './providers/detect.ts';
import {
	listProviders,
	type BranchTip,
	type ParsedRepo,
	type RemoteFile,
	type RepoProvider
} from './providers/index.ts';
import {
	clearAllSnapshots,
	deleteSnapshot,
	getSnapshot,
	putSnapshot,
	type CachedSnapshot
} from './read-cache.ts';
import { AdapterNotFoundError, RemoteFetchError, RemoteUnsupportedHostError } from './errors.ts';
import type { DirectoryEntry, ReadOnlyDirectoryAdapter } from './directory-adapter.ts';
import { normalizePath } from './directory-adapter.ts';

// ─── Branded types ─────────────────────────────────────────────────────────

declare const REPO_URL_BRAND: unique symbol;
export type RepoUrl = string & { readonly [REPO_URL_BRAND]: true };

declare const BRANCH_BRAND: unique symbol;
export type Branch = string & { readonly [BRANCH_BRAND]: true };

declare const SHA_BRAND: unique symbol;
export type Sha = string & { readonly [SHA_BRAND]: true };

declare const CACHE_KEY_BRAND: unique symbol;
export type CacheKey = string & { readonly [CACHE_KEY_BRAND]: true };

// ─── Public interface (unchanged from v0) ───────────────────────────────────

export interface FetchOptions {
	readonly url: RepoUrl;
	readonly branch: Branch;
	readonly pat: string;
	readonly editBranch?: string;
	readonly customBaseUrl?: string;
	readonly preferredProviderId?: string;
	/**
	 * Optional commit author override (name + email). When supplied,
	 * overrides the identity returned by `verifyAuth` — used to honor
	 * `RemoteConfig.commit_author_name` / `commit_author_email`.
	 */
	readonly commitAuthor?: { readonly name: string; readonly email: string };
}

export interface FetchResult {
	readonly url: RepoUrl;
	readonly branch: Branch;
	readonly sha: Sha;
	readonly providerId: string;
	readonly editBranch: string;
	readonly author: { readonly name: string; readonly email: string };
	readonly adapter: ReadonlyRemoteAdapter;
	readonly cacheKey: CacheKey;
}

export interface ReadonlyRemoteAdapter extends ReadOnlyDirectoryAdapter {
	headSha(): Promise<Sha>;
	exists(rel: string): Promise<boolean>;
}

// ─── Branded-type helpers ───────────────────────────────────────────────────

export function brandRepoUrl(value: string): RepoUrl {
	return value as RepoUrl;
}

export function brandBranch(value: string): Branch {
	if (!/^[A-Za-z0-9._/-]+$/.test(value)) {
		throw new RemoteFetchError(`Invalid branch name: ${value}`);
	}
	return value as Branch;
}

export function brandSha(value: string): Sha {
	if (!/^[0-9a-f]{7,64}$/i.test(value)) {
		throw new RemoteFetchError(`Invalid SHA: ${value}`);
	}
	return value as Sha;
}

export function makeCacheKey(url: string, branch: string, sha: string): CacheKey {
	return `${url}|${branch}|${sha}` as CacheKey;
}

export const SUBTREE = '.quill.md';
export const DEFAULT_DEPTH = 1;
// CORS proxy is no longer required (provider REST APIs ship permissive CORS).
// The constant is kept for backwards compatibility with any code that still
// references it; it is unused.
export const DEFAULT_CORS_PROXY = '';
export const DEFAULT_EDIT_BRANCH = 'quill-md';

// ─── Main entry point ───────────────────────────────────────────────────────

/**
 * Resolve a remote repository into a read-only adapter over the `.quill.md/`
 * subtree. The strategy is selected automatically from the URL host unless
 * the caller supplies `preferredProviderId`. The PAT is verified on
 * connect; insufficient scope surfaces as `RemoteAuthError`.
 */
export async function fetchSubtree(options: FetchOptions): Promise<FetchResult> {
	const url = new URL(options.url);
	const provider = options.preferredProviderId
		? resolveProvider(url, options.preferredProviderId)
		: (detectProvider(url) ??
			(() => {
				throw new RemoteUnsupportedHostError(url.hostname);
			})());

	const parsed = provider.parseUrl(url);
	if (options.customBaseUrl) {
		(parsed as { baseUrl: string }).baseUrl = options.customBaseUrl.replace(/\/+$/, '');
	}

	const user = await provider.verifyAuth(parsed, options.pat);
	const author = options.commitAuthor
		? {
				name: options.commitAuthor.name,
				email: options.commitAuthor.email
			}
		: {
				name: user.name ?? user.login,
				email: user.email ?? 'noreply@quill.md'
			};

	const editBranch = (options.editBranch ?? DEFAULT_EDIT_BRANCH) as Branch;
	const tip = await ensureEditBranch(provider, parsed, editBranch, options.pat, author);

	const cacheKey = makeCacheKey(parsed.canonicalUrl, editBranch, tip.sha);
	const cached = await getSnapshot(cacheKey).catch(() => null);
	let files: readonly RemoteFile[];
	if (cached && cached.commitSha === tip.sha) {
		files = cached.files;
	} else {
		files = await provider.fetchAll(parsed, tip, options.pat);
		await putSnapshot({
			cacheKey,
			providerId: parsed.providerId,
			owner: parsed.owner,
			repo: parsed.repo,
			branch: editBranch,
			commitSha: tip.sha,
			fetchedAt: Date.now(),
			files: files.map((f) => ({ path: f.path, content: f.content, sha: f.sha }))
		});
	}

	const adapter = buildReadOnlyAdapter(files, tip);
	return {
		url: options.url,
		branch: editBranch,
		sha: tip.sha as Sha,
		providerId: parsed.providerId,
		editBranch,
		author,
		adapter,
		cacheKey
	};
}

async function ensureEditBranch(
	provider: RepoProvider,
	parsed: ParsedRepo,
	branch: Branch,
	pat: string,
	author: { name: string; email: string }
): Promise<BranchTip> {
	const existing = await provider.getBranch(parsed, branch, pat);
	if (existing) return existing;
	// Treat branch absence as orphan-style: the wizard already asked the user
	// for permission; we create an orphan branch so the user's history is
	// independent of `main`. If creation fails for any reason, surface the
	// error to the caller.
	//
	// GitLab's `/repository/branches` requires `ref` to point to an existing
	// SHA, so resolve the default branch first and pass its SHA as the fork
	// source. GitHub's createOrphanBranch ignores this and creates a true
	// orphan via the empty-tree SHA.
	const defaultTip = await provider.resolveBranch(parsed, pat);
	return provider.createOrphanBranch(parsed, branch, defaultTip.sha, pat, author);
}

function buildReadOnlyAdapter(files: readonly RemoteFile[], tip: BranchTip): ReadonlyRemoteAdapter {
	const byPath = new Map<string, RemoteFile>();
	for (const f of files) byPath.set(f.path, f);

	function readTextFile(path: string): Promise<string> {
		const normalized = normalizePath(path);
		const entry = byPath.get(normalized);
		if (!entry) {
			throw new AdapterNotFoundError(normalized);
		}
		return Promise.resolve(entry.content);
	}

	function listDirectory(path: string): Promise<DirectoryEntry[]> {
		const normalized = normalizePath(path);
		const entries = new Map<string, { kind: 'file' | 'directory'; name: string }>();
		for (const f of files) {
			const filePath = f.path;
			if (normalized !== '.' && !filePath.startsWith(`${normalized}/`)) continue;
			const remainder = normalized === '.' ? filePath : filePath.slice(normalized.length + 1);
			const slash = remainder.indexOf('/');
			if (slash === -1) {
				entries.set(remainder, { kind: 'file', name: remainder });
			} else {
				const dirName = remainder.slice(0, slash);
				entries.set(`${dirName}/`, { kind: 'directory', name: dirName });
			}
		}
		return Promise.resolve([...entries.values()]);
	}

	return {
		readTextFile,
		listDirectory,
		headSha: async () => tip.sha as Sha,
		exists: async (rel: string) => byPath.has(normalizePath(rel))
	};
}

/** Drop a single cache entry by its key. */
export async function clearCache(key: CacheKey): Promise<void> {
	await deleteSnapshot(key);
}

/** Drop every cached snapshot. Wired to Settings → "Clear local snapshot". */
export async function clearAllCaches(): Promise<void> {
	await clearAllSnapshots();
}

/**
 * Test seam — list registered providers (mirrors the v0 `listProviders`
 * re-export so the original test surface stays green).
 */
export function listProvidersForRemote(): readonly RepoProvider[] {
	return listProviders();
}

export type { CachedSnapshot };
