/**
 * RepoProvider — the Strategy interface for remote Git providers.
 *
 * Each provider (GitHub, GitLab, …) implements this interface so the rest of
 * the application can talk to a remote repository without knowing which
 * provider it is. Adding a new provider means dropping a new file under
 * `src/lib/adapters/providers/`, registering it in `registry.ts`, and
 * (if it should be auto-detected) extending `detect.ts`.
 *
 * The interface is split into:
 *  - read methods (`fetchAll`, `fetchSince`, `getBranch`) used by the
 *    remote adapter to populate the local snapshot on open / refresh;
 *  - write methods (`putFile`, `deleteFile`, `commitBatch`) used by the
 *    commit queue to land user edits as commits on the edit branch;
 *  - branch-management helpers (`createBranch`, `createOrphanBranch`)
 *    used by the Remote Setup Wizard the first time the edit branch is
 *    absent on the remote.
 *
 * Every method receives the PAT in its `input` block. The provider MUST
 * not log the PAT, store it past the call boundary, or surface it in
 * returned error messages.
 */

/** A repository parsed from a user-supplied URL. */
export interface ParsedRepo {
	readonly providerId: string;
	readonly owner: string;
	readonly repo: string;
	readonly baseUrl: string;
	readonly canonicalUrl: string;
}

/** Result of a successful PAT scope check. */
export interface AuthenticatedUser {
	readonly login: string;
	readonly name: string | null;
	readonly email: string | null;
}

/** Commit author identity. Falls back to `quill.md <noreply@quill.md>` if absent. */
export interface AuthorIdentity {
	readonly name: string;
	readonly email: string;
}

/** A single file fetched from the provider. `sha` is the blob SHA on the remote. */
export interface RemoteFile {
	readonly path: string;
	readonly content: string;
	readonly sha: string;
}

/** Description of a single file change for batched commits. */
export type RemoteFileChange =
	| { readonly action: 'upsert'; readonly path: string; readonly content: string }
	| { readonly action: 'delete'; readonly path: string; readonly previousSha: string };

export interface BranchTip {
	readonly sha: string;
	readonly treeSha: string;
}

export interface PutFileInput {
	readonly parsed: ParsedRepo;
	readonly branch: string;
	readonly path: string;
	readonly content: string;
	readonly message: string;
	readonly expectedSha: string | null;
	readonly author: AuthorIdentity;
	readonly pat: string;
}

export interface PutFileResult {
	readonly blobSha: string;
	readonly commitSha: string;
}

export interface DeleteFileInput {
	readonly parsed: ParsedRepo;
	readonly branch: string;
	readonly path: string;
	readonly message: string;
	readonly expectedSha: string;
	readonly author: AuthorIdentity;
	readonly pat: string;
}

export interface DeleteFileResult {
	readonly commitSha: string;
}

export interface CommitBatchInput {
	readonly parsed: ParsedRepo;
	readonly branch: string;
	readonly parentSha: string;
	readonly changes: readonly RemoteFileChange[];
	readonly message: string;
	readonly author: AuthorIdentity;
	readonly pat: string;
}

export interface CommitBatchResult {
	readonly commitSha: string;
	readonly perFileShas: Readonly<Record<string, string>>;
}

/**
 * The Strategy interface. Implementations live in `github.ts`, `gitlab.ts`.
 * Every method is async; every method may throw any of the typed errors
 * exported from `../errors.ts`.
 */
export interface RepoProvider {
	readonly id: string;
	readonly displayName: string;
	readonly defaultBaseUrl: string;

	/** True if this provider can handle the URL host (auto-detection). */
	matches(url: URL): boolean;

	/** Parse a URL into a {@link ParsedRepo}. Throws on unsupported shape. */
	parseUrl(url: URL): ParsedRepo;

	/** Resolve the default branch + tip. Throws `RemoteFetchError` on failure. */
	resolveBranch(parsed: ParsedRepo, pat: string): Promise<BranchTip>;

	/** Read every file under `.quill.md/` at the given branch tip. */
	fetchAll(parsed: ParsedRepo, branch: BranchTip, pat: string): Promise<readonly RemoteFile[]>;

	/** Read only files modified since `since` (delta open). Empty array on cold cache. */
	fetchSince(
		parsed: ParsedRepo,
		branch: BranchTip,
		pat: string,
		since: Date,
		knownSha: string
	): Promise<readonly RemoteFile[]>;

	/** Verify the PAT has write scope and return the authenticated user. */
	verifyAuth(parsed: ParsedRepo, pat: string): Promise<AuthenticatedUser>;

	/** Look up an existing branch tip. Returns null if the branch is absent. */
	getBranch(parsed: ParsedRepo, branch: string, pat: string): Promise<BranchTip | null>;

	/** Create a regular branch from an existing SHA. */
	createBranch(
		parsed: ParsedRepo,
		branch: string,
		baseSha: string,
		pat: string
	): Promise<BranchTip>;

	/**
	 * Create an orphan branch (no shared history with any parent).
	 *
	 * @param defaultBranch - SHA of the remote's default branch. GitLab's
	 *   `/repository/branches` endpoint requires `ref` to point to an
	 *   existing SHA, so we fork from the default and reset history with
	 *   a no-op commit. GitHub's empty-commit-then-ref flow ignores this
	 *   parameter (it produces a true orphan via the empty tree SHA).
	 */
	createOrphanBranch(
		parsed: ParsedRepo,
		branch: string,
		defaultBranch: string,
		pat: string,
		author: AuthorIdentity
	): Promise<BranchTip>;

	/** Single-file write (create or update). */
	putFile(input: PutFileInput): Promise<PutFileResult>;

	/** Single-file delete. */
	deleteFile(input: DeleteFileInput): Promise<DeleteFileResult>;

	/** Batched multi-file commit. */
	commitBatch(input: CommitBatchInput): Promise<CommitBatchResult>;
}
