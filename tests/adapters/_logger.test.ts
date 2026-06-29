/**
 * Tests for the internal `_logger` redactor.
 *
 * The redactor is the single line of defence against NFR-2 violations
 * (`PAT MUST NOT appear in any log line`). The crypto committee audit
 * (`docs/audits/2026-06-23/cybersecurity-audit.md`) flagged that the
 * previous implementation only inspected top-level values; this file
 * pins the contract so the recursion cannot regress silently.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { brandPat, brandProxyUrl, info, logRaw } from '$lib/adapters/_logger';

const GH_CLASSIC = 'a'.repeat(40);
const GH_FINE = 'ghp_' + 'A'.repeat(36);
const GITLAB = 'glpat-' + 'X'.repeat(20);

describe('_logger — top-level PAT redaction', () => {
	beforeEach(() => {
		vi.spyOn(console, 'info').mockImplementation(() => undefined);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		vi.spyOn(console, 'debug').mockImplementation(() => undefined);
	});
	afterEach(() => vi.restoreAllMocks());

	it('redacts a branded PAT passed at the top level', () => {
		const pat = brandPat('top-level-pat-' + 'x'.repeat(40));
		info('token is', pat);
		expect(console.info).toHaveBeenCalledTimes(1);
		const line = (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		expect(line).toContain('[REDACTED:PAT]');
		expect(line).not.toContain('top-level-pat-');
	});

	it('redacts PAT-shaped strings even when unbranded (defence in depth)', () => {
		info('classic', GH_CLASSIC);
		info('fine', GH_FINE);
		info('gitlab', GITLAB);
		const calls = (console.info as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string);
		for (const line of calls) {
			expect(line).toContain('[REDACTED:PAT]');
		}
		expect(calls.join('\n')).not.toContain(GH_CLASSIC);
		expect(calls.join('\n')).not.toContain(GH_FINE);
		expect(calls.join('\n')).not.toContain(GITLAB);
	});

	it('redacts ProxyUrl to its host only', () => {
		const proxy = brandProxyUrl('https://user:pass@cors.example.com/?token=secret');
		info('proxy is', proxy);
		const line = (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		expect(line).toContain('[REDACTED:PROXY:cors.example.com]');
		expect(line).not.toContain('user');
		expect(line).not.toContain('pass');
		expect(line).not.toContain('secret');
	});
});

describe('_logger — recursive redaction (audit finding)', () => {
	beforeEach(() => {
		vi.spyOn(console, 'info').mockImplementation(() => undefined);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		vi.spyOn(console, 'debug').mockImplementation(() => undefined);
	});
	afterEach(() => vi.restoreAllMocks());

	it('redacts a PAT-shaped string nested inside an object property', () => {
		const evil = { headers: { Authorization: `Bearer ${GH_FINE}` } };
		logRaw('info', 'payload', evil);
		const line = (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		expect(line).toContain('[REDACTED:PAT]');
		expect(line).not.toContain(GH_FINE);
	});

	it('redacts a PAT-shaped string nested inside an array', () => {
		const evil = { tokens: [GH_CLASSIC, 'unrelated'] };
		logRaw('warn', evil);
		const line = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		expect(line).toContain('[REDACTED:PAT]');
		expect(line).not.toContain(GH_CLASSIC);
	});

	it('redacts at depth ≥ 2 (object inside object inside array)', () => {
		const evil = { outer: [{ inner: { deep: GITLAB } }] };
		logRaw('error', evil);
		const line = (console.error as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		expect(line).toContain('[REDACTED:PAT]');
		expect(line).not.toContain(GITLAB);
	});

	it('passes non-PAT strings through unchanged', () => {
		const fine = { ok: 'hello world', count: 42, flag: true };
		logRaw('info', 'fine', fine);
		const line = (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		expect(line).toContain('hello world');
		expect(line).toContain('42');
		expect(line).toContain('true');
		expect(line).not.toContain('[REDACTED:PAT]');
	});

	it('warn/debug also recurse', () => {
		const evil = { a: { b: GH_FINE } };
		logRaw('warn', 'w', evil);
		logRaw('debug', 'd', evil);
		const lines = [
			(console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string,
			(console.debug as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
		];
		for (const line of lines) {
			expect(line).toContain('[REDACTED:PAT]');
			expect(line).not.toContain(GH_FINE);
		}
	});
});
