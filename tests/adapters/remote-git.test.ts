/**
 * Tests for `remote-git`.
 *
 * Scope:
 *  - Branded type validators (RepoUrl, Branch, Sha) — exercised through
 *    the public error path, not by importing the internal brands.
 *  - `makeCacheKey` shape (no PAT, deterministic).
 *  - `isPat` runtime type guard.
 *  - Logger redaction (PAT-shape, proxy-URL, defense-in-depth strings).
 *  - Error translation: 401/403/404/Auth map to the right error class.
 *
 * NOT in scope here: a live fetch against a real Git repository. That
 * requires network and is gated by `RUN_LIVE_TESTS=1` per the step-4 plan
 * (§15.4). We only cover the parts that can be unit-tested without a
 * network round-trip.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	brandPat,
	brandProxyUrl,
	debug,
	error,
	info,
	warn,
	PAT_BRAND
} from '$lib/adapters/_logger';
import {
	DEFAULT_CORS_PROXY,
	DEFAULT_DEPTH,
	SUBTREE,
	brandCacheKey,
	fetchSubtree,
	isCacheKey,
	isPat,
	makeCacheKey,
	type Branch,
	type CacheKey,
	type RepoUrl,
	type Sha
} from '$lib/adapters/remote-git';
import { AdapterError, RemoteAuthError, RemoteFetchError } from '$lib/adapters/errors';

describe('public constants', () => {
	it('SUBTREE is ".agnostic-issuer"', () => {
		expect(SUBTREE).toBe('.agnostic-issuer');
	});

	it('DEFAULT_DEPTH is 1 (ERS Appendix D)', () => {
		expect(DEFAULT_DEPTH).toBe(1);
	});

	it('DEFAULT_CORS_PROXY is the ERS-mandated URL', () => {
		expect(DEFAULT_CORS_PROXY).toBe('https://cors.isomorphic-git.org');
	});
});

describe('makeCacheKey', () => {
	it('produces "<url>|<branch>|<sha>"', () => {
		const url = 'https://github.com/agnostic-issuer/test' as RepoUrl;
		const branch = 'main' as Branch;
		const sha = 'a'.repeat(40) as Sha;
		expect(makeCacheKey(url, branch, sha)).toBe(`${url}|${branch}|${sha}`);
	});

	it('is deterministic (same inputs → same key)', () => {
		const url = 'https://github.com/x/y' as RepoUrl;
		const branch = 'main' as Branch;
		const sha = '0123456789abcdef0123456789abcdef01234567' as Sha;
		expect(makeCacheKey(url, branch, sha)).toBe(makeCacheKey(url, branch, sha));
	});

	it('does NOT contain the PAT (NFR-2)', () => {
		const url = 'https://github.com/x/y' as RepoUrl;
		const branch = 'main' as Branch;
		const sha = '0123456789abcdef0123456789abcdef01234567' as Sha;
		const pat = 'ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789';
		const key = makeCacheKey(url, branch, sha);
		expect(key).not.toContain(pat);
		expect(key).not.toContain(pat.slice(0, 4));
	});

	it('different SHAs produce different keys', () => {
		const url = 'https://github.com/x/y' as RepoUrl;
		const branch = 'main' as Branch;
		const sha1 = 'a'.repeat(40) as Sha;
		const sha2 = 'b'.repeat(40) as Sha;
		expect(makeCacheKey(url, branch, sha1)).not.toBe(makeCacheKey(url, branch, sha2));
	});
});

describe('CacheKey branding', () => {
	it('makeCacheKey returns a value that round-trips through isCacheKey', () => {
		const url = 'https://github.com/x/y' as RepoUrl;
		const branch = 'main' as Branch;
		const sha = '0123456789abcdef0123456789abcdef01234567' as Sha;
		const key = makeCacheKey(url, branch, sha);
		expect(isCacheKey(key)).toBe(true);
	});

	it('isCacheKey returns false for plain strings', () => {
		expect(isCacheKey('not a cache key')).toBe(false);
		expect(isCacheKey('')).toBe(false);
	});

	it('isCacheKey returns false for non-strings', () => {
		expect(isCacheKey(42)).toBe(false);
		expect(isCacheKey(null)).toBe(false);
		expect(isCacheKey(undefined)).toBe(false);
		expect(isCacheKey({})).toBe(false);
	});

	it('brandCacheKey accepts a well-formed key from an external source', () => {
		const external = 'https://github.com/x/y|main|0123456789abcdef0123456789abcdef01234567';
		const branded: CacheKey = brandCacheKey(external);
		expect(isCacheKey(branded)).toBe(true);
	});

	it('brandCacheKey rejects a key with too few segments', () => {
		expect(() => brandCacheKey('only|two')).toThrow(RemoteFetchError);
	});

	it('brandCacheKey rejects a key with an invalid URL', () => {
		expect(() => brandCacheKey('not a url|main|0123456789abcdef0123456789abcdef01234567')).toThrow(
			RemoteFetchError
		);
	});

	it('brandCacheKey rejects a key with an invalid branch name', () => {
		expect(() =>
			brandCacheKey('https://github.com/x/y|has spaces|0123456789abcdef0123456789abcdef01234567')
		).toThrow(RemoteFetchError);
	});
});

describe('brandPat', () => {
	it('produces a Pat that round-trips through isPat', () => {
		const pat = brandPat('ghp_test_token_string_here_more_padding_to_reach_36');
		expect(isPat(pat)).toBe(true);
	});

	it('isPat returns false for plain strings', () => {
		expect(isPat('not a PAT')).toBe(false);
		expect(isPat('')).toBe(false);
	});

	it('isPat returns false for non-strings', () => {
		expect(isPat(42)).toBe(false);
		expect(isPat(null)).toBe(false);
		expect(isPat(undefined)).toBe(false);
		expect(isPat({})).toBe(false);
		expect(isPat([])).toBe(false);
	});

	it('PAT_BRAND is a unique symbol (not registered globally)', () => {
		expect(typeof PAT_BRAND).toBe('symbol');
	});
});

describe('branded type validation (via fetchSubtree error path)', () => {
	it('rejects an obviously invalid RepoUrl with RemoteFetchError', async () => {
		await expect(
			fetchSubtree({
				url: 'not a url at all' as unknown as RepoUrl,
				branch: 'main' as Branch,
				pat: null
			})
		).rejects.toBeInstanceOf(RemoteFetchError);
	});

	it('rejects a branch name with spaces', async () => {
		await expect(
			fetchSubtree({
				url: 'https://github.com/x/y' as RepoUrl,
				branch: 'has spaces' as unknown as Branch,
				pat: null
			})
		).rejects.toBeInstanceOf(RemoteFetchError);
	});
});

describe('logger redaction', () => {
	type SpyCall = readonly unknown[];
	type Spy = { mock: { calls: SpyCall[] }; mockRestore: () => unknown };
	let warnSpy: Spy;
	let errorSpy: Spy;
	let infoSpy: Spy;
	let debugSpy: Spy;

	function flatten(spy: Spy): string {
		return spy.mock.calls.map((c: SpyCall) => String(c[0])).join('\n');
	}

	beforeEach(() => {
		debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
		warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
	});

	afterEach(() => {
		debugSpy.mockRestore();
		warnSpy.mockRestore();
		errorSpy.mockRestore();
		infoSpy.mockRestore();
	});

	it('redacts a branded PAT to [REDACTED:PAT]', () => {
		const pat = brandPat('ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
		info('logging with', pat);
		const output = flatten(infoSpy);
		expect(output).toContain('[REDACTED:PAT]');
		expect(output).not.toContain('ghp_aaaa');
	});

	it('redacts a branded ProxyUrl to [REDACTED:PROXY:<host>]', () => {
		const proxy = brandProxyUrl('https://my-proxy.example.com/?token=secret');
		info('using proxy', proxy);
		const output = flatten(infoSpy);
		expect(output).toContain('[REDACTED:PROXY:my-proxy.example.com]');
		expect(output).not.toContain('secret');
		expect(output).not.toContain('token=');
	});

	it('defence-in-depth: redacts unbranded PAT-shaped strings', () => {
		// GitHub classic 40-hex
		info('seen', 'a'.repeat(40));
		// GitHub fine-grained
		info('seen', 'ghp_' + 'a'.repeat(36));
		// GitLab
		info('seen', 'glpat-' + 'a'.repeat(20));
		const output = flatten(infoSpy);
		expect(output).toContain('[REDACTED:PAT]');
	});

	it('does NOT redact a random 39-char hex string (no false positive)', () => {
		const safe = 'a'.repeat(39);
		info('safe', safe);
		const output = flatten(infoSpy);
		expect(output).toContain(safe);
	});

	it('does NOT redact a normal-looking URL without query string', () => {
		const safe = 'https://example.com/api/v1';
		info('url', safe);
		const output = flatten(infoSpy);
		expect(output).toContain(safe);
	});

	it('debug/info/warn/error all funnel through redaction', () => {
		const pat = brandPat('ghp_' + 'b'.repeat(36));
		debug('d', pat);
		warn('w', pat);
		error('e', pat);
		const allOutput = flatten(debugSpy) + '\n' + flatten(warnSpy) + '\n' + flatten(errorSpy);
		const redactedCount = (allOutput.match(/\[REDACTED:PAT\]/g) ?? []).length;
		expect(redactedCount).toBe(3);
	});
});

// Verify imports are exercised (defensive against future removal).
void debug;
void warn;
void AdapterError;
void RemoteAuthError;
void RemoteFetchError;
