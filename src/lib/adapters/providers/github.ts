/**
 * GitHub provider. Implements the {@link RepoProvider} Strategy
 * for repositories hosted on `github.com` (and `*.github.com` for
 * GitHub Enterprise Cloud when configured via `customBaseUrl`).
 *
 * The transport is the official Octokit client (`@octokit/rest`),
 * instantiated per PAT via {@link createOctokit}. No HTTP calls are
 * issued from this file directly — every method delegates to a typed
 * `octokit.rest.*` or `octokit.graphql()` call. The plugins
 * `@octokit/plugin-retry` and `@octokit/plugin-throttling` are wired
 * in at construction time and are responsible for retry on 5xx,
 * honouring GitHub's `x-ratelimit-*` headers on 403, and backing off
 * on the secondary rate limit. The auth + `'request'` hook chain they
 * share also fires for the GraphQL endpoint, so a single
 * `createOctokit` instance powers both transports.
 *
 * Octokit methods used:
 *   users.getAuthenticated                       — verifyAuth
 *   repos.get, repos.getBranch                   — resolveBranch / getBranch
 *   git.createRef, git.getCommit                 — createBranch
 *   git.createCommit, git.createRef              — createOrphanBranch
 *   graphql (POST /graphql)                      — fetchAll  ←  single round-trip
 *   repos.listCommits, repos.getContent (raw)    — fetchSince
 *   repos.createOrUpdateFileContents             — putFile
 *   repos.deleteFile                             — deleteFile
 *   git.getCommit, git.createTree, git.createCommit, git.updateRef — commitBatch
 *
 * Authentication is delegated to Octokit's `@octokit/auth-token`
 * (a transitive dep of `@octokit/rest`): the PAT is supplied via the
 * constructor `auth` option, which sets the correct `Authorization`
 * header shape (`Bearer` for fine-grained, `token` for classic).
 */

import type { Octokit } from '@octokit/rest';
import { createOctokit, decodeBase64Content, mapGraphQLError, utf8ToBase64 } from './_octokit.ts';
import {
	RemoteBranchMissingError,
	RemoteCommitRejectedError,
	RemoteFetchError
} from '../errors.ts';
import type {
	AuthorIdentity,
	AuthenticatedUser,
	BranchTip,
	CommitBatchInput,
	CommitBatchResult,
	DeleteFileInput,
	DeleteFileResult,
	ParsedRepo,
	PutFileInput,
	PutFileResult,
	RemoteFile,
	RemoteFileChange,
	RepoProvider
} from './types.ts';

const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const SUBTREE = '.quill.md';
const TEMPLATES_DIR = `${SUBTREE}/templates`;
const ISSUES_DIR = `${SUBTREE}/issues`;
const CONFIG_PATH = `${SUBTREE}/config.json`;

/**
 * Single round-trip GraphQL query that replaces the previous
 * `git.getTree({ recursive: 'true' })` + N × `repos.getContent`
 * fan-out. Three sub-trees are pinned to the branch commit SHA via
 * `object(expression: "<sha>:.quill.md/...")`. Truncated blobs
 * (`Blob.isTruncated === true`, > 500 KB) are recovered in the
 * provider via the existing `repos.getContent({ mediaType: raw })`
 * fallback — see {@link GitHubProvider.fetchAll}.
 *
 * Note: GitHub's `Tree.entries` is typed `[TreeEntry!]`, not a
 * Relay-style connection, so it does not accept `first`/`after`
 * pagination arguments. The response is bounded only by GraphQL's
 * overall size limit (~10 MB). For very large `.quill.md/issues/`
 * directories a future change should switch to per-issue
 * `object(expression: "{sha}:.quill.md/issues/<file>")` lookups
 * (tracked in `docs/octokit-migration.md` §7).
 */
const FETCH_ALL_QUERY = /* GraphQL */ `
	query QuillMdFetchAll(
		$owner: String!
		$name: String!
		$configExpr: String!
		$templatesExpr: String!
		$issuesExpr: String!
	) {
		repository(owner: $owner, name: $name) {
			config: object(expression: $configExpr) {
				... on Blob {
					oid
					isTruncated
					text
				}
			}
			templates: object(expression: $templatesExpr) {
				... on Tree {
					oid
					entries {
						name
						type
						path
						object {
							... on Blob {
								oid
								isTruncated
								text
							}
						}
					}
				}
			}
			issues: object(expression: $issuesExpr) {
				... on Tree {
					oid
					entries {
						name
						type
						path
						object {
							... on Blob {
								oid
								isTruncated
								text
							}
						}
					}
				}
			}
		}
	}
`;

interface QuillMdBlobNode {
	readonly oid: string;
	readonly isTruncated: boolean;
	readonly text: string | null;
}

interface QuillMdSubtreeEntry {
	readonly name: string;
	readonly type: 'blob' | 'tree' | 'commit';
	readonly path: string;
	readonly object: QuillMdBlobNode | null;
}

interface QuillMdSubtree {
	readonly oid: string;
	// GitHub's `Tree.entries` is typed `[TreeEntry!]`, not a connection —
	// the field carries no `first`/`after` arguments and no `pageInfo`.
	readonly entries: ReadonlyArray<QuillMdSubtreeEntry>;
}

interface QuillMdFetchAllResponse {
	readonly repository: {
		readonly config: QuillMdBlobNode | null;
		readonly templates: QuillMdSubtree | null;
		readonly issues: QuillMdSubtree | null;
	} | null;
}

export class GitHubProvider implements RepoProvider {
	readonly id = 'github';
	readonly displayName = 'GitHub';
	readonly defaultBaseUrl = 'https://api.github.com';

	/** One Octokit per PAT — Octokit binds the auth header at construction. */
	readonly #clients = new Map<string, Octokit>();

	matches(url: URL): boolean {
		const host = url.hostname.toLowerCase();
		return host === 'github.com' || host.endsWith('.github.com');
	}

	parseUrl(url: URL): ParsedRepo {
		const parts = url.pathname.split('/').filter(Boolean);
		if (parts.length < 2) {
			throw new RemoteCommitRejectedError(`Invalid GitHub URL: ${url.href}`);
		}
		const owner = parts[0];
		let repo = parts[1];
		if (repo && repo.endsWith('.git')) repo = repo.slice(0, -4);
		return {
			providerId: this.id,
			owner,
			repo,
			baseUrl: this.defaultBaseUrl,
			canonicalUrl: `https://github.com/${owner}/${repo}`
		};
	}

	#client(parsed: ParsedRepo, pat: string): Octokit {
		const cacheKey = `${parsed.baseUrl}::${pat}`;
		let client = this.#clients.get(cacheKey);
		if (!client) {
			client = createOctokit(pat, parsed.baseUrl);
			this.#clients.set(cacheKey, client);
		}
		return client;
	}

	async verifyAuth(parsed: ParsedRepo, pat: string): Promise<AuthenticatedUser> {
		const { data } = await this.#client(parsed, pat).rest.users.getAuthenticated();
		return {
			login: data.login,
			name: data.name,
			email: data.email
		};
	}

	async resolveBranch(parsed: ParsedRepo, pat: string): Promise<BranchTip> {
		const octokit = this.#client(parsed, pat);
		const { data: repo } = await octokit.rest.repos.get({
			owner: parsed.owner,
			repo: parsed.repo
		});
		const tip = await this.getBranch(parsed, repo.default_branch, pat);
		if (!tip) {
			throw new RemoteBranchMissingError(repo.default_branch);
		}
		return tip;
	}

	async getBranch(parsed: ParsedRepo, branch: string, pat: string): Promise<BranchTip | null> {
		try {
			const { data } = await this.#client(parsed, pat).rest.repos.getBranch({
				owner: parsed.owner,
				repo: parsed.repo,
				branch
			});
			return { sha: data.commit.sha, treeSha: data.commit.commit.tree.sha };
		} catch (err) {
			if (err instanceof Error && err.message.startsWith('Not found')) return null;
			throw err;
		}
	}

	async createBranch(
		parsed: ParsedRepo,
		branch: string,
		baseSha: string,
		pat: string
	): Promise<BranchTip> {
		const octokit = this.#client(parsed, pat);
		const { data: ref } = await octokit.rest.git.createRef({
			owner: parsed.owner,
			repo: parsed.repo,
			ref: `refs/heads/${branch}`,
			sha: baseSha
		});
		const { data: commit } = await octokit.rest.git.getCommit({
			owner: parsed.owner,
			repo: parsed.repo,
			commit_sha: ref.object.sha
		});
		return { sha: ref.object.sha, treeSha: commit.tree.sha };
	}

	async createOrphanBranch(
		parsed: ParsedRepo,
		branch: string,
		_defaultBranch: string,
		pat: string,
		author: AuthorIdentity
	): Promise<BranchTip> {
		const octokit = this.#client(parsed, pat);
		const date = new Date().toISOString();
		const { data: commit } = await octokit.rest.git.createCommit({
			owner: parsed.owner,
			repo: parsed.repo,
			message: 'chore: initialize quill-md branch',
			tree: EMPTY_TREE_SHA,
			parents: [],
			author: { name: author.name, email: author.email, date },
			committer: { name: author.name, email: author.email, date }
		});
		await octokit.rest.git.createRef({
			owner: parsed.owner,
			repo: parsed.repo,
			ref: `refs/heads/${branch}`,
			sha: commit.sha
		});
		return { sha: commit.sha, treeSha: commit.tree.sha };
	}

	async fetchAll(
		parsed: ParsedRepo,
		branch: BranchTip,
		pat: string
	): Promise<readonly RemoteFile[]> {
		const octokit = this.#client(parsed, pat);
		const expr = (sub: string): string => `${branch.sha}:${SUBTREE}/${sub}`;
		const endpointUrl = `${parsed.baseUrl}/graphql`;
		let data: QuillMdFetchAllResponse;
		try {
			data = await octokit.graphql<QuillMdFetchAllResponse>(FETCH_ALL_QUERY, {
				owner: parsed.owner,
				name: parsed.repo,
				configExpr: expr('config.json'),
				templatesExpr: expr('templates'),
				issuesExpr: expr('issues')
			});
		} catch (err) {
			throw mapGraphQLError(err, endpointUrl);
		}
		const repo = data.repository;
		if (!repo) {
			throw new RemoteFetchError(`Repository not found: ${parsed.owner}/${parsed.repo}`, {
				status: 404
			});
		}
		const out: RemoteFile[] = [];

		if (repo.config) {
			const blob = repo.config;
			const content = blob.isTruncated
				? await this.fetchBlob(parsed, branch.sha, CONFIG_PATH, pat, 'raw')
				: (blob.text ?? '');
			out.push({ path: CONFIG_PATH, content, sha: blob.oid });
		}
		if (repo.templates) {
			for (const entry of repo.templates.entries) {
				if (entry.type !== 'blob' || !entry.object) continue;
				const path = `${TEMPLATES_DIR}/${entry.name}`;
				const content = entry.object.isTruncated
					? await this.fetchBlob(parsed, branch.sha, path, pat, 'raw')
					: (entry.object.text ?? '');
				out.push({ path, content, sha: entry.object.oid });
			}
		}
		if (repo.issues) {
			for (const entry of repo.issues.entries) {
				if (entry.type !== 'blob' || !entry.object) continue;
				const path = `${ISSUES_DIR}/${entry.name}`;
				const content = entry.object.isTruncated
					? await this.fetchBlob(parsed, branch.sha, path, pat, 'raw')
					: (entry.object.text ?? '');
				out.push({ path, content, sha: entry.object.oid });
			}
		}
		return out;
	}

	private async fetchBlob(
		parsed: ParsedRepo,
		refSha: string,
		path: string,
		pat: string,
		format: 'base64' | 'raw' = 'base64'
	): Promise<string> {
		const octokit = this.#client(parsed, pat);
		if (format === 'raw') {
			const { data } = await octokit.rest.repos.getContent({
				owner: parsed.owner,
				repo: parsed.repo,
				path,
				ref: refSha,
				mediaType: { format: 'raw' }
			});
			return typeof data === 'string' ? data : '';
		}
		const { data } = await octokit.rest.repos.getContent({
			owner: parsed.owner,
			repo: parsed.repo,
			path,
			ref: refSha
		});
		if (Array.isArray(data)) return '';
		if (data.type !== 'file') return '';
		if (typeof data.content === 'string' && data.content.length > 0) {
			return decodeBase64Content(data.content);
		}
		return '';
	}

	async fetchSince(
		parsed: ParsedRepo,
		branch: BranchTip,
		pat: string,
		since: Date
	): Promise<readonly RemoteFile[]> {
		const octokit = this.#client(parsed, pat);
		const sinceIso = since.toISOString();
		const untilIso = new Date().toISOString();
		const { data: commits } = await octokit.rest.repos.listCommits({
			owner: parsed.owner,
			repo: parsed.repo,
			path: `${SUBTREE}/`,
			since: sinceIso,
			until: untilIso,
			per_page: 100
		});
		const touched = new Set<string>();
		for (const c of commits) {
			const files = (c as unknown as { files?: ReadonlyArray<{ filename: string }> }).files;
			if (files) {
				for (const f of files) {
					if (f.filename === SUBTREE || f.filename.startsWith(`${SUBTREE}/`)) {
						touched.add(f.filename);
					}
				}
			}
		}
		const out: RemoteFile[] = [];
		for (const path of touched) {
			const { data } = await octokit.rest.repos.getContent({
				owner: parsed.owner,
				repo: parsed.repo,
				path,
				ref: branch.sha,
				mediaType: { format: 'raw' }
			});
			const content = typeof data === 'string' ? data : '';
			out.push({ path, content, sha: '' });
		}
		return out;
	}

	async putFile(input: PutFileInput): Promise<PutFileResult> {
		const octokit = this.#client(input.parsed, input.pat);
		const { data } = await octokit.rest.repos.createOrUpdateFileContents({
			owner: input.parsed.owner,
			repo: input.parsed.repo,
			path: input.path,
			message: input.message,
			content: utf8ToBase64(input.content),
			branch: input.branch,
			committer: { name: input.author.name, email: input.author.email },
			...(input.expectedSha ? { sha: input.expectedSha } : {})
		});
		const content = data as { content?: { sha: string }; commit: { sha: string } };
		return { blobSha: content.content?.sha ?? '', commitSha: content.commit.sha };
	}

	async deleteFile(input: DeleteFileInput): Promise<DeleteFileResult> {
		const octokit = this.#client(input.parsed, input.pat);
		const { data } = await octokit.rest.repos.deleteFile({
			owner: input.parsed.owner,
			repo: input.parsed.repo,
			path: input.path,
			message: input.message,
			sha: input.expectedSha,
			branch: input.branch,
			committer: { name: input.author.name, email: input.author.email }
		});
		return { commitSha: data.commit.sha ?? '' };
	}

	async commitBatch(input: CommitBatchInput): Promise<CommitBatchResult> {
		const octokit = this.#client(input.parsed, input.pat);
		const { owner, repo } = input.parsed;
		const date = new Date().toISOString();

		const { data: parent } = await octokit.rest.git.getCommit({
			owner,
			repo,
			commit_sha: input.parentSha
		});
		const { data: tree } = await octokit.rest.git.createTree({
			owner,
			repo,
			base_tree: parent.tree.sha,
			tree: input.changes.map((c) => treeEntryFor(c))
		});
		const { data: commit } = await octokit.rest.git.createCommit({
			owner,
			repo,
			message: input.message,
			parents: [input.parentSha],
			tree: tree.sha,
			author: { name: input.author.name, email: input.author.email, date },
			committer: { name: input.author.name, email: input.author.email, date }
		});
		await octokit.rest.git.updateRef({
			owner,
			repo,
			ref: `heads/${input.branch}`,
			sha: commit.sha,
			force: false
		});

		const perFileShas: Record<string, string> = {};
		for (const c of input.changes) {
			if (c.action === 'upsert') perFileShas[c.path] = '';
		}
		return { commitSha: commit.sha, perFileShas };
	}
}

function treeEntryFor(c: RemoteFileChange): {
	path: string;
	mode: '100644';
	type: 'blob';
	content?: string;
	sha?: null;
} {
	if (c.action === 'delete') {
		return { path: c.path, mode: '100644', type: 'blob', sha: null };
	}
	return {
		path: c.path,
		mode: '100644',
		type: 'blob',
		content: utf8ToBase64(c.content)
	};
}
