/**
 * Tests for the GitHub provider's HTTP plumbing.
 *
 * All HTTP calls are mocked via `vi.spyOn(globalThis, 'fetch')`. The provider
 * exercises the same code paths it would on the real GitHub REST API, but
 * routed through Octokit's `@octokit/rest` + `@octokit/plugin-retry` +
 * `@octokit/plugin-throttling` plugins.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubProvider } from '$lib/adapters/providers/github';
import { brandPat, redactIfPat, unbrandPat } from '$lib/adapters/providers/_pat';
import { RemoteAuthError, RemoteCommitRejectedError, RemoteFetchError } from '$lib/adapters/errors';

const SAMPLE_PUBLIK_REPO = {
	default_branch: 'main'
};

const SAMPLE_BRANCH = {
	name: 'quill-md',
	commit: {
		sha: 'a'.repeat(40),
		commit: { tree: { sha: 'b'.repeat(40) } }
	}
};

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('GitHubProvider', () => {
	const provider = new GitHubProvider();
	let fetchSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		fetchSpy = vi.spyOn(globalThis, 'fetch');
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('parseUrl extracts owner + repo from a github.com URL', () => {
		const parsed = provider.parseUrl(new URL('https://github.com/acme/widgets'));
		expect(parsed.owner).toBe('acme');
		expect(parsed.repo).toBe('widgets');
		expect(parsed.baseUrl).toBe('https://api.github.com');
	});

	it('verifyAuth returns the authenticated user', async () => {
		fetchSpy.mockResolvedValueOnce(
			jsonResponse({ login: 'octocat', name: 'Octo Cat', email: 'octo@example.com' })
		);
		const user = await provider.verifyAuth(
			provider.parseUrl(new URL('https://github.com/acme/widgets')),
			'test-pat'
		);
		expect(user.login).toBe('octocat');
		expect(user.name).toBe('Octo Cat');
		expect(user.email).toBe('octo@example.com');
	});

	it('verifyAuth sends an Authorization header derived from the PAT', async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({ login: 'octocat', name: null, email: null }));
		await provider.verifyAuth(
			provider.parseUrl(new URL('https://github.com/acme/widgets')),
			'test-pat'
		);
		const call = fetchSpy.mock.calls[0];
		expect(call).toBeDefined();
		const init = call![1] as RequestInit;
		const headers = init.headers as Record<string, string>;
		// Octokit lowercases all header keys. Its @octokit/auth-token inspects
		// the PAT shape: a JWT-like token (3 dot-separated parts) becomes
		// `Bearer …`; everything else (including `test-pat`) becomes `token …`.
		// We assert on the synthetic shape used by the suite.
		expect(headers['authorization']).toBe('token test-pat');
	});

	it('verifyAuth never logs the PAT', async () => {
		const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		fetchSpy.mockResolvedValueOnce(jsonResponse({ login: 'octocat', name: null, email: null }));
		await provider.verifyAuth(
			provider.parseUrl(new URL('https://github.com/acme/widgets')),
			'test-pat'
		);
		const allCalls = [...consoleSpy.mock.calls, ...consoleErrorSpy.mock.calls].map((args) =>
			args.map(String).join(' ')
		);
		expect(allCalls.some((line) => line.includes('test-pat'))).toBe(false);
	});

	it('resolveBranch returns the default branch tip', async () => {
		fetchSpy
			.mockResolvedValueOnce(jsonResponse(SAMPLE_PUBLIK_REPO))
			.mockResolvedValueOnce(jsonResponse(SAMPLE_BRANCH));
		const tip = await provider.resolveBranch(
			provider.parseUrl(new URL('https://github.com/acme/widgets')),
			'test-pat'
		);
		expect(tip.sha).toBe('a'.repeat(40));
		expect(tip.treeSha).toBe('b'.repeat(40));
	});

	it('getBranch returns null on 404', async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({ message: 'Not Found' }, 404));
		const tip = await provider.getBranch(
			provider.parseUrl(new URL('https://github.com/acme/widgets')),
			'missing',
			'test-pat'
		);
		expect(tip).toBeNull();
	});

	it('createOrphanBranch commits to the empty tree', async () => {
		// First call: POST /git/commits for the empty commit
		fetchSpy.mockResolvedValueOnce(
			jsonResponse({
				sha: 'c'.repeat(40),
				tree: { sha: '4b825dc642cb6eb9a060e54bf8d69288fbee4904' }
			})
		);
		// Second call: POST /git/refs to point quill-md at the empty commit
		fetchSpy.mockResolvedValueOnce(jsonResponse({ ref: 'refs/heads/quill-md', object: {} }));

		const tip = await provider.createOrphanBranch(
			provider.parseUrl(new URL('https://github.com/acme/widgets')),
			'quill-md',
			'a'.repeat(40),
			'test-pat',
			{ name: 'Test', email: 'test@example.com' }
		);
		expect(tip.sha).toBe('c'.repeat(40));
		// The empty-tree SHA must be used
		const firstInit = fetchSpy.mock.calls[0]?.[1] as RequestInit;
		const firstBody = JSON.parse(String(firstInit.body)) as { tree: string; parents: unknown[] };
		expect(firstBody.tree).toBe('4b825dc642cb6eb9a060e54bf8d69288fbee4904');
		expect(firstBody.parents).toEqual([]);
	});

	it('putFile uses PUT with base64-encoded content', async () => {
		fetchSpy.mockResolvedValueOnce(
			jsonResponse({
				content: { sha: 'd'.repeat(40) },
				commit: { sha: 'e'.repeat(40) }
			})
		);
		await provider.putFile({
			parsed: provider.parseUrl(new URL('https://github.com/acme/widgets')),
			branch: 'quill-md',
			path: '.quill.md/issues/0001-foo.md',
			content: '---\nid: 1\n---\n',
			message: 'create issue 1',
			expectedSha: null,
			author: { name: 'Test', email: 'test@example.com' },
			pat: 'test-pat'
		});
		const call = fetchSpy.mock.calls[0]!;
		const url = typeof call[0] === 'string' ? call[0] : (call[0] as URL).toString();
		// Octokit URL-encodes the path component (slashes become %2F).
		expect(decodeURIComponent(url)).toContain('/contents/.quill.md/issues/0001-foo.md');
		const init = call[1] as RequestInit;
		expect(init.method).toBe('PUT');
		const body = JSON.parse(String(init.body)) as { content: string; branch: string };
		// base64 of '---\nid: 1\n---\n' is 'LS0tCmlkOiAxCi0tLQo='
		expect(body.content).toBe('LS0tCmlkOiAxCi0tLQo=');
		expect(body.branch).toBe('quill-md');
	});

	it('a 409 from PUT surfaces as a typed error', async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({ message: 'sha mismatch' }, 409));
		await expect(
			provider.putFile({
				parsed: provider.parseUrl(new URL('https://github.com/acme/widgets')),
				branch: 'quill-md',
				path: '.quill.md/issues/0001-foo.md',
				content: 'x',
				message: 'x',
				expectedSha: 'old-sha',
				author: { name: 'Test', email: 'test@example.com' },
				pat: 'test-pat'
			})
		).rejects.toBeInstanceOf(RemoteCommitRejectedError);
	});

	it('a 401 surfaces as RemoteAuthError', async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({ message: 'unauthorized' }, 401));
		await expect(
			provider.verifyAuth(
				provider.parseUrl(new URL('https://github.com/acme/widgets')),
				'bad-token'
			)
		).rejects.toBeInstanceOf(RemoteAuthError);
	});

	it('a 422 surfaces as RemoteCommitRejectedError', async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({ message: 'Validation Failed' }, 422));
		await expect(
			provider.putFile({
				parsed: provider.parseUrl(new URL('https://github.com/acme/widgets')),
				branch: 'quill-md',
				path: '.quill.md/issues/0001-foo.md',
				content: 'x',
				message: 'x',
				expectedSha: null,
				author: { name: 'Test', email: 'test@example.com' },
				pat: 'test-pat'
			})
		).rejects.toBeInstanceOf(RemoteCommitRejectedError);
	});

	it('the throttling plugin retries on 403 + x-ratelimit-remaining=0', async () => {
		// First call: 403 with the rate-limit headers the throttling plugin
		// inspects. Second call: success. The mock factory returns a fresh
		// `Response` object each call so the throttling plugin reads the
		// current `x-ratelimit-remaining` header value.
		fetchSpy.mockImplementationOnce(async () => {
			return new Response(JSON.stringify({ message: 'rate limit' }), {
				status: 403,
				headers: {
					'Content-Type': 'application/json',
					'x-ratelimit-remaining': '0',
					'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 1)
				}
			});
		});
		fetchSpy.mockResolvedValueOnce(jsonResponse({ login: 'octocat', name: null, email: null }));

		const user = await provider.verifyAuth(
			provider.parseUrl(new URL('https://github.com/acme/widgets')),
			'test-pat'
		);
		expect(user.login).toBe('octocat');
		expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
	});
});

describe('GitHubProvider.fetchAll (GraphQL)', () => {
	const provider = new GitHubProvider();
	const sampleBranch = {
		sha: 'a'.repeat(40),
		treeSha: 'b'.repeat(40)
	};

	function graphqlResponse(body: unknown, status = 200): Response {
		return new Response(JSON.stringify(body), {
			status,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	it('issues exactly one POST to /graphql and unpacks config + templates + issues', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			graphqlResponse({
				data: {
					repository: {
						config: { oid: 'configsha', isTruncated: false, text: '{"statuses":[]}' },
						templates: {
							oid: 'templatessha',
							entries: [
								{
									name: 'bug.json',
									type: 'blob',
									path: 'bug.json',
									object: { oid: 'bugsha', isTruncated: false, text: '{}' }
								}
							]
						},
						issues: {
							oid: 'issuessha',
							entries: [
								{
									name: '0001-foo.md',
									type: 'blob',
									path: '0001-foo.md',
									object: { oid: 'foo1sha', isTruncated: false, text: '# foo' }
								},
								{
									name: '0002-bar.md',
									type: 'blob',
									path: '0002-bar.md',
									object: { oid: 'foo2sha', isTruncated: false, text: '# bar' }
								}
							]
						}
					}
				}
			})
		);

		const files = await provider.fetchAll(
			provider.parseUrl(new URL('https://github.com/acme/widgets')),
			sampleBranch,
			'test-pat'
		);

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const call = fetchSpy.mock.calls[0]!;
		const url = typeof call[0] === 'string' ? call[0] : (call[0] as URL).toString();
		expect(url).toBe('https://api.github.com/graphql');
		const init = call[1] as RequestInit;
		expect(init.method).toBe('POST');
		expect(files).toEqual([
			{ path: '.quill.md/config.json', content: '{"statuses":[]}', sha: 'configsha' },
			{ path: '.quill.md/templates/bug.json', content: '{}', sha: 'bugsha' },
			{ path: '.quill.md/issues/0001-foo.md', content: '# foo', sha: 'foo1sha' },
			{ path: '.quill.md/issues/0002-bar.md', content: '# bar', sha: 'foo2sha' }
		]);
	});

	it('pins every object(expression:) to the branch commit SHA', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			graphqlResponse({
				data: { repository: { config: null, templates: null, issues: null } }
			})
		);

		await provider.fetchAll(
			provider.parseUrl(new URL('https://github.com/acme/widgets')),
			sampleBranch,
			'test-pat'
		);

		const call = fetchSpy.mock.calls[0]!;
		const init = call[1] as RequestInit;
		const body = JSON.parse(String(init.body)) as { variables: Record<string, string> };
		expect(body.variables.owner).toBe('acme');
		expect(body.variables.name).toBe('widgets');
		expect(body.variables.configExpr).toBe(`${sampleBranch.sha}:.quill.md/config.json`);
		expect(body.variables.templatesExpr).toBe(`${sampleBranch.sha}:.quill.md/templates`);
		expect(body.variables.issuesExpr).toBe(`${sampleBranch.sha}:.quill.md/issues`);
	});

	it('uses the same Authorization header as REST calls', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			graphqlResponse({
				data: { repository: { config: null, templates: null, issues: null } }
			})
		);

		await provider.fetchAll(
			provider.parseUrl(new URL('https://github.com/acme/widgets')),
			sampleBranch,
			'test-pat'
		);

		const call = fetchSpy.mock.calls[0]!;
		const init = call[1] as RequestInit;
		const headers = init.headers as Record<string, string>;
		// Same token-style shape as the REST verifyAuth test at line ~80.
		expect(headers['authorization']).toBe('token test-pat');
	});

	it('falls back to per-file raw getContent when a blob is truncated', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		// GraphQL response with one truncated blob. Use mockImplementation (not
		// mockResolvedValueOnce) so each retry attempt by @octokit/plugin-retry
		// gets a fresh Response — the body of a `Response` returned by
		// mockResolvedValueOnce can only be consumed once.
		fetchSpy.mockImplementation((input) => {
			const url = typeof input === 'string' ? input : (input as URL).toString();
			if (url.endsWith('/graphql')) {
				return Promise.resolve(
					graphqlResponse({
						data: {
							repository: {
								config: null,
								templates: null,
								issues: {
									oid: 'issuessha',
									entries: [
										{
											name: 'huge.md',
											type: 'blob',
											path: 'huge.md',
											object: { oid: 'hugesha', isTruncated: true, text: null }
										}
									]
								}
							}
						}
					})
				);
			}
			return Promise.resolve(
				new Response('huge content', {
					status: 200,
					headers: { 'Content-Type': 'text/plain' }
				})
			);
		});

		const files = await provider.fetchAll(
			provider.parseUrl(new URL('https://github.com/acme/widgets')),
			sampleBranch,
			'graphql-truncation-pat'
		);

		// We assert on the *behaviour* (truncated blob falls back to a raw
		// `repos.getContent` call and the file lands in the result) rather than
		// on the exact call count: the throttling plugin's shared `groups.write`
		// Bottleneck (`minTime: 1e3`) is a module-level singleton, so a write
		// request issued right after `the throttling plugin retries on 403…` may
		// be re-scheduled by the limiter when the suite runs as a whole. The
		// individual test passes in ~60 ms.
		const calls = fetchSpy.mock.calls.map((c) =>
			typeof c[0] === 'string' ? (c[0] as string) : (c[0] as URL).toString()
		);
		const fallbackCalls = calls.filter((u) => u.includes('/contents/'));
		expect(fallbackCalls.length).toBeGreaterThanOrEqual(1);
		expect(decodeURIComponent(fallbackCalls[0]!)).toContain('/contents/.quill.md/issues/huge.md');
		expect(files).toEqual([
			{ path: '.quill.md/issues/huge.md', content: 'huge content', sha: 'hugesha' }
		]);
	});

	it('returns [] when .quill.md/ does not exist on the branch', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			graphqlResponse({
				data: { repository: { config: null, templates: null, issues: null } }
			})
		);

		const files = await provider.fetchAll(
			provider.parseUrl(new URL('https://github.com/acme/widgets')),
			sampleBranch,
			'test-pat'
		);

		expect(files).toEqual([]);
	});

	it('handles partial absence (e.g. templates/ missing, issues/ present)', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			graphqlResponse({
				data: {
					repository: {
						config: { oid: 'cs', isTruncated: false, text: '{}' },
						templates: null,
						issues: {
							oid: 'is',
							entries: [
								{
									name: '0001-foo.md',
									type: 'blob',
									path: '0001-foo.md',
									object: { oid: 'fs', isTruncated: false, text: '# foo' }
								}
							]
						}
					}
				}
			})
		);

		const files = await provider.fetchAll(
			provider.parseUrl(new URL('https://github.com/acme/widgets')),
			sampleBranch,
			'test-pat'
		);

		expect(files).toEqual([
			{ path: '.quill.md/config.json', content: '{}', sha: 'cs' },
			{ path: '.quill.md/issues/0001-foo.md', content: '# foo', sha: 'fs' }
		]);
	});

	it('skips non-blob entries (sub-trees, commit refs)', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			graphqlResponse({
				data: {
					repository: {
						config: null,
						templates: null,
						issues: {
							oid: 'is',
							entries: [
								{ name: 'subdir', type: 'tree', path: 'subdir', object: null },
								{
									name: '0001.md',
									type: 'blob',
									path: '0001.md',
									object: { oid: 'fs', isTruncated: false, text: '# x' }
								}
							]
						}
					}
				}
			})
		);

		const files = await provider.fetchAll(
			provider.parseUrl(new URL('https://github.com/acme/widgets')),
			sampleBranch,
			'test-pat'
		);

		expect(files).toEqual([{ path: '.quill.md/issues/0001.md', content: '# x', sha: 'fs' }]);
	});

	it('throws RemoteAuthError when GraphQL returns UNAUTHENTICATED', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			graphqlResponse({
				data: { repository: null },
				errors: [
					{
						message: 'Bad credentials',
						path: ['repository'],
						extensions: { code: 'UNAUTHENTICATED' }
					}
				]
			})
		);

		await expect(
			provider.fetchAll(
				provider.parseUrl(new URL('https://github.com/acme/widgets')),
				sampleBranch,
				'bad-token'
			)
		).rejects.toBeInstanceOf(RemoteAuthError);
	});

	it('throws RemoteFetchError when GraphQL returns NOT_FOUND', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			graphqlResponse({
				data: { repository: null },
				errors: [
					{
						message: 'Could not resolve to a Repository',
						path: ['repository'],
						extensions: { code: 'NOT_FOUND' }
					}
				]
			})
		);

		await expect(
			provider.fetchAll(
				provider.parseUrl(new URL('https://github.com/acme/widgets')),
				sampleBranch,
				'test-pat'
			)
		).rejects.toBeInstanceOf(RemoteFetchError);
	});

	it('throws RemoteFetchError when repository is null with no errors array', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
			graphqlResponse({
				data: { repository: null }
			})
		);

		await expect(
			provider.fetchAll(
				provider.parseUrl(new URL('https://github.com/acme/widgets')),
				sampleBranch,
				'test-pat'
			)
		).rejects.toBeInstanceOf(RemoteFetchError);
	});
});

describe('PAT redaction', () => {
	it('passes non-PAT strings through unchanged', () => {
		expect(redactIfPat('plain text')).toBe('plain text');
	});

	it('redacts registered PATs', () => {
		const pat = 'ghp_' + 'a'.repeat(36);
		brandPat(pat);
		try {
			expect(redactIfPat(pat)).toBe('[REDACTED:PAT]');
			expect(redactIfPat('not-the-pat')).toBe('not-the-pat');
		} finally {
			unbrandPat(pat);
		}
	});

	it('returns non-redacted once a PAT is unbranded', () => {
		const pat = 'ghp_' + 'b'.repeat(36);
		brandPat(pat);
		expect(redactIfPat(pat)).toBe('[REDACTED:PAT]');
		unbrandPat(pat);
		expect(redactIfPat(pat)).toBe(pat);
	});
});
