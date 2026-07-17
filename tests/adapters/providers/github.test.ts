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
import { RemoteAuthError, RemoteCommitRejectedError } from '$lib/adapters/errors';

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
