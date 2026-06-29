/**
 * Tests for the FR-15 integrity hash helpers.
 *
 * The audit (`docs/audits/2026-06-23/qa-audit.md`) flagged that
 * `verifyIntegrity` is the *only* function that decides
 * `integrityWarning: true|false` and was at 16.66% branch coverage with
 * no direct test. This file pins the contract.
 */
import { describe, expect, it } from 'vitest';
import {
	computeIntegrityHash,
	stripIntegrityHashLine,
	verifyIntegrity
} from '$lib/services/integrity';

describe('sha256Hex / computeIntegrityHash', () => {
	it('produces a stable 64-char hex digest (sha256)', async () => {
		const h = await computeIntegrityHash('hello');
		// The ERS example hash is the famous 9f86d081… "hello" digest.
		expect(h).toBe('sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
	});

	it('produces a different hash for different inputs', async () => {
		const a = await computeIntegrityHash('hello');
		const b = await computeIntegrityHash('Hello');
		expect(a).not.toBe(b);
	});

	it('handles empty strings without throwing', async () => {
		const h = await computeIntegrityHash('');
		expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
	});

	it('handles multi-line / Unicode content without surprise', async () => {
		const h = await computeIntegrityHash('línea 1\nlínea 2\n日本語 🚀');
		expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
	});
});

describe('stripIntegrityHashLine', () => {
	it('removes the integrity_hash line including its trailing newline', () => {
		const text = 'foo: 1\nintegrity_hash: sha256:deadbeef\nbar: 2\n';
		expect(stripIntegrityHashLine(text)).toBe('foo: 1\nbar: 2\n');
	});

	it('leaves the text unchanged when the line is absent', () => {
		const text = 'foo: 1\nbar: 2\n';
		expect(stripIntegrityHashLine(text)).toBe(text);
	});

	it('handles CRLF line endings', () => {
		const text = 'foo: 1\r\nintegrity_hash: sha256:deadbeef\r\nbar: 2\r\n';
		expect(stripIntegrityHashLine(text)).toBe('foo: 1\r\nbar: 2\r\n');
	});

	it('only removes the first occurrence (defence against duplicate keys)', () => {
		const text = 'integrity_hash: sha256:aaa\nintegrity_hash: sha256:bbb\n';
		const stripped = stripIntegrityHashLine(text);
		expect(stripped).toBe('integrity_hash: sha256:bbb\n');
	});
});

describe('verifyIntegrity', () => {
	const TEXT = 'foo: 1\nbar: 2\n';

	it('returns true when the stored hash matches the recomputed hash', async () => {
		const stored = await computeIntegrityHash(TEXT);
		expect(await verifyIntegrity(stored, TEXT)).toBe(true);
	});

	it('returns false when the stored hash does not match (tamper detection)', async () => {
		expect(await verifyIntegrity('sha256:' + '0'.repeat(64), TEXT)).toBe(false);
	});

	it('returns false when the stored hash is missing the `sha256:` prefix', async () => {
		// Without the prefix the function refuses to trust the value —
		// defends against a future schema migration silently accepting
		// a downgraded algorithm.
		expect(await verifyIntegrity('a'.repeat(64), TEXT)).toBe(false);
	});

	it('returns false when the stored hash is an empty string', async () => {
		expect(await verifyIntegrity('', TEXT)).toBe(false);
	});

	it('returns false when the stored hash is not a string', async () => {
		// Defensive: parser upstream narrows this to string, but the helper
		// must not throw if it ever receives a non-string.
		expect(await verifyIntegrity(undefined as unknown as string, TEXT)).toBe(false);
		expect(await verifyIntegrity(null as unknown as string, TEXT)).toBe(false);
		expect(await verifyIntegrity(42 as unknown as string, TEXT)).toBe(false);
	});

	it('treats a tampered body as a mismatch (round-trip)', async () => {
		const stored = await computeIntegrityHash(TEXT);
		const tampered = TEXT.replace('foo: 1', 'foo: 999');
		expect(await verifyIntegrity(stored, tampered)).toBe(false);
	});

	it('round-trips with stripIntegrityHashLine: hashing the stripped body equals the stored value', async () => {
		const body = 'foo: 1\nbar: 2\n';
		const stored = await computeIntegrityHash(body);
		const fullDoc = `${body}integrity_hash: ${stored}\n`;
		// The parser strips the integrity line before hashing, so the
		// recomputed hash matches what was originally stored.
		expect(await verifyIntegrity(stored, fullDoc)).toBe(true);
	});
});
