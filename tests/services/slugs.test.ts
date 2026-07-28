import { describe, expect, it } from 'vitest';
import { buildIssueFilename, nextIssueId, slugify } from '$lib/services/slugs';

describe('slugify', () => {
	it('lowercases the title', () => {
		expect(slugify('Hello')).toBe('hello');
	});

	it('collapses non-alphanumerics into single dashes', () => {
		expect(slugify('One   two!!! Three')).toBe('one-two-three');
	});

	it('strips leading and trailing dashes', () => {
		expect(slugify('!  Hello World  !')).toBe('hello-world');
	});

	it('normalizes diacritics', () => {
		expect(slugify('Crème brûlée')).toBe('creme-brulee');
	});

	it('returns "untitled" when the title reduces to an empty slug (e.g. only emoji/punctuation)', () => {
		expect(slugify('🚀 !?')).toBe('untitled');
		expect(slugify('')).toBe('untitled');
	});
});

describe('buildIssueFilename', () => {
	it('composes the canonical "<id>-<slug>.md" form', () => {
		expect(buildIssueFilename('42', 'Fix login redirect!')).toBe('42-fix-login-redirect.md');
	});

	it('uses the "untitled" fallback when the slug is empty', () => {
		expect(buildIssueFilename('7', '🚀')).toBe('7-untitled.md');
	});
});

describe('nextIssueId', () => {
	it('returns a uuid', () => {
		expect(nextIssueId().length).toBeGreaterThan(10);
	});
});
