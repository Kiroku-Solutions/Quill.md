/**
 * Tests for the Strategy pattern provider registry and URL detector.
 *
 * Pure-Node tests: no HTTP, no IndexedDB. The provider implementations
 * exercise their endpoints in `github.test.ts` / `gitlab.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { detectProvider, resolveProvider } from '$lib/adapters/providers/detect';
import { getProvider, listProviders } from '$lib/adapters/providers/registry';
import { GitHubProvider } from '$lib/adapters/providers/github';
import { GitLabProvider } from '$lib/adapters/providers/gitlab';
import { RemoteUnsupportedHostError } from '$lib/adapters/errors';

describe('Provider registry', () => {
	it('exposes GitHub and GitLab', () => {
		const providers = listProviders();
		expect(providers).toHaveLength(2);
		expect(providers.map((p) => p.id)).toEqual(['github', 'gitlab']);
	});

	it('returns the GitHub provider for id="github"', () => {
		expect(getProvider('github')).toBeInstanceOf(GitHubProvider);
	});

	it('returns the GitLab provider for id="gitlab"', () => {
		expect(getProvider('gitlab')).toBeInstanceOf(GitLabProvider);
	});

	it('returns null for unknown ids', () => {
		expect(getProvider('bitbucket')).toBeNull();
	});
});

describe('detectProvider', () => {
	it('recognises github.com URLs', () => {
		expect(detectProvider(new URL('https://github.com/acme/widgets'))).toBeInstanceOf(
			GitHubProvider
		);
	});

	it('recognises gitlab.com URLs', () => {
		expect(detectProvider(new URL('https://gitlab.com/acme/widgets'))).toBeInstanceOf(
			GitLabProvider
		);
	});

	it('treats host names case-insensitively', () => {
		expect(detectProvider(new URL('https://GitHub.com/foo/bar'))).toBeInstanceOf(GitHubProvider);
		expect(detectProvider(new URL('https://GITLAB.com/foo/bar'))).toBeInstanceOf(GitLabProvider);
	});

	it('returns null for unsupported hosts', () => {
		expect(detectProvider(new URL('https://bitbucket.org/foo/bar'))).toBeNull();
		expect(detectProvider(new URL('https://example.com/foo/bar'))).toBeNull();
	});
});

describe('resolveProvider', () => {
	it('honours preferredId when supplied and the provider matches', () => {
		const url = new URL('https://gitlab.com/foo/bar');
		expect(resolveProvider(url, 'gitlab')).toBeInstanceOf(GitLabProvider);
	});

	it('falls back to auto-detection when preferredId is null', () => {
		expect(resolveProvider(new URL('https://github.com/foo/bar'), null)).toBeInstanceOf(
			GitHubProvider
		);
	});

	it('throws RemoteUnsupportedHostError when nothing matches', () => {
		expect(() => resolveProvider(new URL('https://example.com/foo/bar'), null)).toThrow(
			RemoteUnsupportedHostError
		);
	});
});

describe('Provider URL parsing', () => {
	it('strips .git suffix from GitHub URLs', () => {
		const provider = new GitHubProvider();
		const parsed = provider.parseUrl(new URL('https://github.com/acme/widgets.git'));
		expect(parsed.owner).toBe('acme');
		expect(parsed.repo).toBe('widgets');
		expect(parsed.providerId).toBe('github');
	});

	it('strips .git suffix from GitLab URLs and uses the host for the API base', () => {
		const provider = new GitLabProvider();
		const parsed = provider.parseUrl(new URL('https://gitlab.com/acme/widgets.git'));
		expect(parsed.owner).toBe('acme');
		expect(parsed.repo).toBe('widgets');
		expect(parsed.providerId).toBe('gitlab');
		expect(parsed.baseUrl).toBe('https://gitlab.com/api/v4');
	});

	it('uses the original host for self-hosted GitLab', () => {
		const provider = new GitLabProvider();
		const parsed = provider.parseUrl(new URL('https://gitlab.acme.com/foo/bar'));
		expect(parsed.baseUrl).toBe('https://gitlab.acme.com/api/v4');
	});
});
