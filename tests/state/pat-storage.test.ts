/**
 * Tests for the PAT sessionStorage persistence layer.
 *
 * Run in Node — Vitest's `server` project. sessionStorage is shimmed
 * with an in-memory map so we exercise the same code paths the browser
 * does without the jsdom setup.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
	clearPat,
	readPat,
	readSessionMeta,
	writePat,
	writeSessionMeta
} from '$lib/state/pat-storage';

const store = new Map<string, string>();
(
	globalThis as {
		sessionStorage?: {
			getItem: (k: string) => string | null;
			setItem: (k: string, v: string) => void;
			removeItem: (k: string) => void;
		};
	}
).sessionStorage = {
	getItem: (k) => store.get(k) ?? null,
	setItem: (k, v) => {
		store.set(k, v);
	},
	removeItem: (k) => {
		store.delete(k);
	}
};

describe('PAT sessionStorage', () => {
	beforeEach(() => {
		store.clear();
	});

	it('returns null when no PAT is persisted', () => {
		expect(readPat()).toBeNull();
	});

	it('round-trips a PAT', () => {
		writePat('ghp_test123');
		expect(readPat()).toBe('ghp_test123');
	});

	it('clears the PAT and session metadata together', () => {
		writePat('ghp_test123');
		writeSessionMeta({
			providerId: 'github',
			url: 'https://github.com/foo/bar' as never,
			editBranch: 'quill-md' as never,
			displayName: 'foo/bar',
			authorLogin: 'octocat'
		});
		clearPat();
		expect(readPat()).toBeNull();
		expect(readSessionMeta()).toBeNull();
	});

	it('round-trips session metadata', () => {
		writeSessionMeta({
			providerId: 'github',
			url: 'https://github.com/foo/bar' as never,
			editBranch: 'quill-md' as never,
			displayName: 'foo/bar',
			authorLogin: 'octocat'
		});
		const meta = readSessionMeta();
		expect(meta?.providerId).toBe('github');
		expect(meta?.displayName).toBe('foo/bar');
	});
});
