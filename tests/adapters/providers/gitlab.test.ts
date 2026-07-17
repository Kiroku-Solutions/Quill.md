/**
 * Tests for the GitLab provider's HTTP plumbing. Mirrors the GitHub suite.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitLabProvider } from '$lib/adapters/providers/gitlab';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('GitLabProvider', () => {
	const provider = new GitLabProvider();
	let fetchSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		fetchSpy = vi.spyOn(globalThis, 'fetch');
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('parseUrl uses the host for the API base', () => {
		const parsed = provider.parseUrl(new URL('https://gitlab.com/acme/widgets'));
		expect(parsed.baseUrl).toBe('https://gitlab.com/api/v4');
		expect(parsed.owner).toBe('acme');
		expect(parsed.repo).toBe('widgets');
	});

	it('verifyAuth sends a PRIVATE-TOKEN header', async () => {
		fetchSpy.mockResolvedValueOnce(
			jsonResponse({ id: 1, username: 'octocat', name: 'Octo Cat', email: 'octo@example.com' })
		);
		const user = await provider.verifyAuth(
			provider.parseUrl(new URL('https://gitlab.com/acme/widgets')),
			'test-pat'
		);
		expect(user.login).toBe('octocat');
		const call = fetchSpy.mock.calls[0]!;
		const init = call[1] as RequestInit;
		const headers = init.headers as Record<string, string>;
		expect(headers['PRIVATE-TOKEN']).toBe('test-pat');
	});

	it('putFile uses PUT with text encoding', async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({ file_last_commit_id: 'a'.repeat(40) }));
		await provider.putFile({
			parsed: provider.parseUrl(new URL('https://gitlab.com/acme/widgets')),
			branch: 'quill-md',
			path: '.quill.md/issues/0001-foo.md',
			content: 'hello',
			message: 'create',
			expectedSha: null,
			author: { name: 'Test', email: 'test@example.com' },
			pat: 'test-pat'
		});
		const call = fetchSpy.mock.calls[0]!;
		expect(call[0]).toContain('/repository/files/');
		const init = call[1] as RequestInit;
		expect(init.method).toBe('PUT');
		const body = JSON.parse(String(init.body)) as {
			encoding: string;
			content: string;
			branch: string;
		};
		expect(body.encoding).toBe('text');
		expect(body.content).toBe('hello');
		expect(body.branch).toBe('quill-md');
	});

	it('a 409 from PUT surfaces as a typed error', async () => {
		fetchSpy.mockResolvedValueOnce(new Response('conflict', { status: 409 }));
		await expect(
			provider.putFile({
				parsed: provider.parseUrl(new URL('https://gitlab.com/acme/widgets')),
				branch: 'quill-md',
				path: '.quill.md/issues/0001-foo.md',
				content: 'hello',
				message: 'create',
				expectedSha: 'old',
				author: { name: 'Test', email: 'test@example.com' },
				pat: 'test-pat'
			})
		).rejects.toThrow();
	});

	it('commitBatch calls POST /repository/commits with actions[]', async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'a'.repeat(40) }));
		await provider.commitBatch({
			parsed: provider.parseUrl(new URL('https://gitlab.com/acme/widgets')),
			branch: 'quill-md',
			parentSha: 'parent-sha',
			changes: [
				{ action: 'upsert', path: '.quill.md/issues/0001.md', content: 'one' },
				{ action: 'upsert', path: '.quill.md/issues/0002.md', content: 'two' }
			],
			message: 'batch commit',
			author: { name: 'Test', email: 'test@example.com' },
			pat: 'test-pat'
		});
		const call = fetchSpy.mock.calls[0]!;
		const init = call[1] as RequestInit;
		expect(init.method).toBe('POST');
		const body = JSON.parse(String(init.body)) as {
			actions: Array<{ action: string; file_path: string }>;
		};
		expect(body.actions).toHaveLength(2);
		expect(body.actions[0]?.file_path).toBe('.quill.md/issues/0001.md');
		expect(body.actions[0]?.action).toBe('update');
	});

	it('createOrphanBranch forks from the default-branch SHA, not the target branch', async () => {
		// Step 1: POST /repository/branches forks from the default branch SHA
		fetchSpy.mockResolvedValueOnce(jsonResponse({}));
		// Step 2: POST /repository/commits drops the .gitkeep file
		fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'b'.repeat(40) }));

		const defaultSha = 'd'.repeat(40);
		await provider.createOrphanBranch(
			provider.parseUrl(new URL('https://gitlab.com/acme/widgets')),
			'quill-md',
			defaultSha,
			'test-pat',
			{ name: 'Test', email: 'test@example.com' }
		);
		// The first call must use the default-branch SHA as `ref`. A self-referential
		// `ref: branch` would 404 because the target branch doesn't exist yet.
		const branchCall = fetchSpy.mock.calls[0]!;
		const branchBody = JSON.parse(String((branchCall[1] as RequestInit).body)) as {
			branch: string;
			ref: string;
		};
		expect(branchBody.branch).toBe('quill-md');
		expect(branchBody.ref).toBe(defaultSha);
	});
});
