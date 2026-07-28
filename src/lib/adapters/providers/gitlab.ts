/**
 * GitLab REST API provider. Implements the {@link RepoProvider} Strategy
 * for repositories hosted on `gitlab.com` (and any self-hosted GitLab
 * instance when configured via `customBaseUrl`).
 *
 * Endpoints used:
 *   GET    /api/v4/projects/{url-encoded-path}                          — resolveBranch (default branch)
 *   GET    /api/v4/projects/{id}/repository/branches/{branch}          — getBranch
 *   GET    /api/v4/projects/{id}/repository/tree?path=.quill.md&recursive=true&per_page=100 — fetchAll
 *   GET    /api/v4/projects/{id}/repository/files/{path}/raw?ref={branch} — fetchAll (file content)
 *   GET    /api/v4/projects/{id}/repository/commits?path=.quill.md/&since=… — fetchSince
 *   PUT    /api/v4/projects/{id}/repository/files/{path}               — putFile
 *   DELETE /api/v4/projects/{id}/repository/files/{path}               — deleteFile
 *   POST   /api/v4/projects/{id}/repository/branches                  — createBranch
 *   POST   /api/v4/projects/{id}/repository/commits                   — commitBatch
 *
 * Authentication: `PRIVATE-TOKEN: <PAT>` (GitLab standard).
 *
 * Optimistic concurrency: GitLab uses the file's last commit SHA, not the
 * blob SHA. Track both in the cache.
 */

import { brandPat } from './_pat.ts';
import { fetchJson } from './_http.ts';
import { RemoteBranchMissingError, RemoteCommitRejectedError } from '../errors.ts';
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

const SUBTREE = '.quill.md';

interface GitLabProject {
	readonly id: number;
	readonly default_branch: string;
	readonly name_with_namespace: string;
}

interface GitLabBranch {
	readonly name: string;
	readonly commit: { readonly id: string; readonly last_pipeline?: unknown };
}

interface GitLabTreeEntry {
	readonly id: string;
	readonly name: string;
	readonly type: 'blob' | 'tree';
	readonly path: string;
	readonly mode: string;
}

interface GitLabUser {
	readonly id: number;
	readonly username: string;
	readonly name: string;
	readonly email: string | null;
}

interface GitLabCommitAction {
	readonly action: 'create' | 'update' | 'delete';
	readonly file_path: string;
	readonly content?: string;
	readonly encoding?: 'text' | 'base64';
	readonly last_commit_id?: string;
}

export class GitLabProvider implements RepoProvider {
	readonly id = 'gitlab';
	readonly displayName = 'GitLab';
	readonly defaultBaseUrl = 'https://gitlab.com/api/v4';

	matches(url: URL): boolean {
		const host = url.hostname.toLowerCase();
		return host === 'gitlab.com' || host.endsWith('.gitlab.com');
	}

	parseUrl(url: URL): ParsedRepo {
		const parts = url.pathname.split('/').filter(Boolean);
		if (parts.length < 2) {
			throw new RemoteCommitRejectedError(`Invalid GitLab URL: ${url.href}`);
		}
		const owner = parts[0];
		let repo = parts[1];
		if (repo.endsWith('.git')) repo = repo.slice(0, -4);
		const baseUrl = `${url.protocol}//${url.host}/api/v4`;
		return {
			providerId: this.id,
			owner,
			repo,
			baseUrl,
			canonicalUrl: `${url.protocol}//${url.host}/${owner}/${repo}`
		};
	}

	private auth(pat: string): { headerName: string; headerValue: string } {
		const branded = brandPat(pat);
		return { headerName: 'PRIVATE-TOKEN', headerValue: branded };
	}

	private projectUrl(parsed: ParsedRepo, ...rest: string[]): string {
		const projectPath = encodeURIComponent(`${parsed.owner}/${parsed.repo}`);
		return `${parsed.baseUrl}/projects/${projectPath}${rest.length ? '/' + rest.join('/') : ''}`;
	}

	private repoBase(parsed: ParsedRepo): string {
		const projectPath = encodeURIComponent(`${parsed.owner}/${parsed.repo}`);
		return `${parsed.baseUrl}/projects/${projectPath}`;
	}

	async verifyAuth(parsed: ParsedRepo, pat: string): Promise<AuthenticatedUser> {
		const user = await fetchJson<GitLabUser>(`${parsed.baseUrl}/user`, this.auth(pat));
		return {
			login: user.username,
			name: user.name,
			email: user.email
		};
	}

	async resolveBranch(parsed: ParsedRepo, pat: string): Promise<BranchTip> {
		const project = await fetchJson<GitLabProject>(this.projectUrl(parsed), this.auth(pat));
		return this.getBranch(parsed, project.default_branch, pat).then((tip) => {
			if (!tip) {
				throw new RemoteBranchMissingError(project.default_branch);
			}
			return tip;
		});
	}

	async getBranch(parsed: ParsedRepo, branch: string, pat: string): Promise<BranchTip | null> {
		try {
			const data = await fetchJson<GitLabBranch>(
				this.projectUrl(parsed, 'repository', 'branches', branch),
				this.auth(pat)
			);
			// GitLab's branch object doesn't expose a tree SHA directly. Return the commit ID as `sha`
			// and an empty `treeSha` — callers use this for optimistic concurrency on the commit level.
			return { sha: data.commit.id, treeSha: '' };
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
		await fetchJson(this.projectUrl(parsed, 'repository', 'branches'), this.auth(pat), {
			method: 'POST',
			body: { branch, ref: baseSha }
		});
		return { sha: baseSha, treeSha: '' };
	}

	async createOrphanBranch(
		parsed: ParsedRepo,
		branch: string,
		defaultBranch: string,
		pat: string,
		author: AuthorIdentity
	): Promise<BranchTip> {
		// Step 1: fork the new branch from the project's default branch. GitLab's
		// `/repository/branches` endpoint rejects `ref` values that don't
		// resolve to an existing commit, so we must point at the default branch
		// SHA rather than the (non-existent) target branch.
		await fetchJson(this.projectUrl(parsed, 'repository', 'branches'), this.auth(pat), {
			method: 'POST',
			body: { branch, ref: defaultBranch }
		});
		// Step 2: replace history with an orphan commit (single no-op file).
		const init = await fetchJson<{ id: string }>(
			this.projectUrl(parsed, 'repository', 'commits'),
			this.auth(pat),
			{
				method: 'POST',
				body: {
					branch,
					commit_message: 'chore: initialize quill-md branch',
					author_email: author.email,
					author_name: author.name,
					actions: [
						{
							action: 'create',
							file_path: `${SUBTREE}/.gitkeep`,
							content: '',
							encoding: 'text'
						}
					]
				}
			}
		);
		return { sha: init.id, treeSha: '' };
	}

	async fetchAll(
		parsed: ParsedRepo,
		branch: BranchTip,
		pat: string
	): Promise<readonly RemoteFile[]> {
		const entries = await fetchJson<readonly GitLabTreeEntry[]>(
			`${this.projectUrl(parsed, 'repository', 'tree')}?path=${encodeURIComponent(SUBTREE)}&recursive=true&per_page=100&ref=${branch.sha}`,
			this.auth(pat)
		);
		const blobs = entries.filter((e) => e.type === 'blob');
		const out: RemoteFile[] = [];
		for (const entry of blobs) {
			const content = await this.fetchBlob(parsed, entry.path, branch.sha, pat);
			out.push({ path: entry.path, content, sha: entry.id });
		}
		return out;
	}

	private async fetchBlob(
		parsed: ParsedRepo,
		path: string,
		ref: string,
		pat: string
	): Promise<string> {
		const encoded = encodeURIComponent(path).replace(/%2F/g, '/');
		const url = `${this.projectUrl(parsed, 'repository', 'files', encoded)}/raw?ref=${ref}`;
		const res = await globalThis.fetch(url, {
			headers: { 'PRIVATE-TOKEN': brandPat(pat), Accept: 'text/plain' }
		});
		if (!res.ok) return '';
		return res.text();
	}

	async fetchSince(
		parsed: ParsedRepo,
		branch: BranchTip,
		pat: string,
		since: Date
	): Promise<readonly RemoteFile[]> {
		const sinceIso = since.toISOString();
		interface CommitListItem {
			readonly id: string;
			readonly title: string;
		}
		const commits = await fetchJson<readonly CommitListItem[]>(
			`${this.projectUrl(parsed, 'repository', 'commits')}?path=${SUBTREE}/&since=${encodeURIComponent(sinceIso)}&per_page=100`,
			this.auth(pat)
		);
		const touched = new Set<string>();
		// GitLab's `/commits` endpoint doesn't list changed files inline; use `compare` to detect deletions.
		if (commits.length > 0) {
			const newest = commits[0];
			if (newest) {
				const diff = await fetchJson<{
					commits: unknown[];
					diffs: ReadonlyArray<{ new_path: string; old_path: string }>;
				}>(
					`${this.projectUrl(parsed, 'repository', 'compare')}?from=${branch.sha}&to=${newest.id}`,
					this.auth(pat)
				);
				for (const d of diff.diffs) {
					const path = d.new_path || d.old_path;
					if (path === SUBTREE || path.startsWith(`${SUBTREE}/`)) touched.add(path);
				}
			}
		}
		const out: RemoteFile[] = [];
		for (const path of touched) {
			const content = await this.fetchBlob(parsed, path, branch.sha, pat);
			out.push({ path, content, sha: '' });
		}
		return out;
	}

	async putFile(input: PutFileInput): Promise<PutFileResult> {
		const encoded = encodeURIComponent(input.path).replace(/%2F/g, '/');
		const body: Record<string, unknown> = {
			branch: input.branch,
			commit_message: input.message,
			content: input.content,
			encoding: 'text',
			author_email: input.author.email,
			author_name: input.author.name
		};
		if (input.expectedSha) body['last_commit_id'] = input.expectedSha;
		const result = await fetchJson<{ file_path: string; file_last_commit_id?: string }>(
			this.projectUrl(input.parsed, 'repository', 'files', encoded),
			this.auth(input.pat),
			{ method: 'PUT', body }
		);
		return {
			blobSha: result.file_last_commit_id ?? '',
			commitSha: result.file_last_commit_id ?? ''
		};
	}

	async deleteFile(input: DeleteFileInput): Promise<DeleteFileResult> {
		const encoded = encodeURIComponent(input.path).replace(/%2F/g, '/');
		const result = await fetchJson<{ file_last_commit_id?: string }>(
			this.projectUrl(input.parsed, 'repository', 'files', encoded),
			this.auth(input.pat),
			{
				method: 'DELETE',
				body: {
					branch: input.branch,
					commit_message: input.message,
					last_commit_id: input.expectedSha,
					author_email: input.author.email,
					author_name: input.author.name
				}
			}
		);
		return { commitSha: result.file_last_commit_id ?? '' };
	}

	async commitBatch(input: CommitBatchInput): Promise<CommitBatchResult> {
		const actions: GitLabCommitAction[] = input.changes.map((c) => actionFor(c));
		const result = await fetchJson<{ id: string; stats?: unknown }>(
			this.projectUrl(input.parsed, 'repository', 'commits'),
			this.auth(input.pat),
			{
				method: 'POST',
				body: {
					branch: input.branch,
					commit_message: input.message,
					start_sha: input.parentSha,
					author_email: input.author.email,
					author_name: input.author.name,
					actions
				}
			}
		);
		const perFileShas: Record<string, string> = {};
		for (const c of input.changes) {
			if (c.action === 'upsert') perFileShas[c.path] = '';
		}
		return { commitSha: result.id, perFileShas };
	}
}

function actionFor(c: RemoteFileChange): GitLabCommitAction {
	if (c.action === 'delete') {
		return { action: 'delete', file_path: c.path, last_commit_id: c.previousSha };
	}
	return {
		action: 'update',
		file_path: c.path,
		content: c.content,
		encoding: 'text'
	};
}
