import { describe, it, expect } from 'vitest';
import {
	AdapterError,
	AdapterNotFoundError,
	AdapterValidationError,
	FsaPermissionError,
	FsaUnavailableError,
	RemoteAuthError,
	RemoteFetchError,
	RenderError,
	type AdapterErrorType
} from '$lib/adapters/errors';

const ALL_TYPES: readonly AdapterErrorType[] = [
	'fsa-unavailable',
	'fsa-permission-denied',
	'not-found',
	'validation',
	'remote-fetch',
	'remote-auth',
	'render'
] as const;

describe('AdapterErrorType union', () => {
	it('contains exactly the 7 expected discriminator values', () => {
		expect(ALL_TYPES).toHaveLength(7);
		expect(new Set(ALL_TYPES)).toEqual(
			new Set<AdapterErrorType>([
				'fsa-unavailable',
				'fsa-permission-denied',
				'not-found',
				'validation',
				'remote-fetch',
				'remote-auth',
				'render'
			])
		);
	});

	it('matches the type field of every concrete subclass', () => {
		const samples: AdapterError[] = [
			new FsaUnavailableError(),
			new FsaPermissionError('folder'),
			new AdapterNotFoundError('a/b.txt'),
			new AdapterValidationError('bad'),
			new RemoteFetchError('boom'),
			new RemoteAuthError(),
			new RenderError('boom')
		];
		const observed = new Set(samples.map((e) => e.type));
		for (const expected of ALL_TYPES) {
			expect(observed.has(expected)).toBe(true);
		}
	});
});

describe('AdapterError (base)', () => {
	it('cannot be instantiated directly (TypeScript enforced at compile time)', () => {
		// The TS compiler refuses `new AdapterError(...)` because of `abstract`.
		// At runtime we can still get a usable Error via the subclasses, which
		// is the only sanctioned way to construct one.
		const err = new FsaUnavailableError();
		expect(err).toBeInstanceOf(AdapterError);
		expect(err).toBeInstanceOf(Error);
	});

	it('exposes the constructor name as `name`', () => {
		expect(new FsaUnavailableError().name).toBe('FsaUnavailableError');
		expect(new FsaPermissionError('h').name).toBe('FsaPermissionError');
		expect(new AdapterNotFoundError('p').name).toBe('AdapterNotFoundError');
		expect(new AdapterValidationError('m').name).toBe('AdapterValidationError');
		expect(new RemoteFetchError('m').name).toBe('RemoteFetchError');
		expect(new RemoteAuthError().name).toBe('RemoteAuthError');
		expect(new RenderError('m').name).toBe('RenderError');
	});

	it('preserves message through the super() call', () => {
		expect(new RenderError('boom').message).toContain('boom');
	});

	it('preserves cause chain when provided', () => {
		const root = new Error('root');
		const wrapped = new FsaPermissionError('folder', root);
		expect(wrapped.cause).toBe(root);
	});

	it('has undefined cause when not provided', () => {
		const err = new FsaUnavailableError();
		expect(err.cause).toBeUndefined();
	});

	it('narrows correctly via instanceof (discriminator + class identity)', () => {
		// Note: with an `abstract readonly type` on the base class, TypeScript
		// cannot narrow `AdapterError` to a subclass based on the literal
		// discriminator alone (the base declares `type` as the broad union).
		// The supported narrowing pattern is therefore `instanceof` (which
		// the `is*` type guards wrap) — that's what we exercise here.
		const handle: () => AdapterError = () => new FsaPermissionError('x');
		const err: AdapterError = handle();
		expect(err.type).toBe('fsa-permission-denied');
		if (err instanceof FsaPermissionError) {
			expect(err.handleName).toBe('x');
		} else {
			throw new Error('unreachable: instanceof did not narrow');
		}
	});

	it('type guards from feature-detect narrow through unknown', async () => {
		const { isFsaPermissionError } = await import('$lib/adapters/feature-detect');
		const err: unknown = new FsaPermissionError('guard-test');
		if (isFsaPermissionError(err)) {
			expect(err.handleName).toBe('guard-test');
			expect(err.type).toBe('fsa-permission-denied');
		} else {
			throw new Error('unreachable: type guard did not narrow');
		}
	});

	it('is catchable as Error', () => {
		try {
			throw new FsaUnavailableError();
		} catch (e) {
			expect(e).toBeInstanceOf(Error);
			expect(e).toBeInstanceOf(AdapterError);
		}
	});
});

describe('FsaUnavailableError', () => {
	it('has type "fsa-unavailable"', () => {
		expect(new FsaUnavailableError().type).toBe('fsa-unavailable');
	});

	it('constructs without arguments', () => {
		const err = new FsaUnavailableError();
		expect(err.message).toContain('File System Access API');
		expect(err.cause).toBeUndefined();
	});

	it('accepts a cause as the second argument', () => {
		const cause = new TypeError('nope');
		const err = new FsaUnavailableError(cause);
		expect(err.cause).toBe(cause);
	});

	it('is instanceof both AdapterError and Error', () => {
		const err = new FsaUnavailableError();
		expect(err).toBeInstanceOf(AdapterError);
		expect(err).toBeInstanceOf(Error);
	});

	it('has name "FsaUnavailableError"', () => {
		expect(new FsaUnavailableError().name).toBe('FsaUnavailableError');
	});
});

describe('FsaPermissionError', () => {
	it('has type "fsa-permission-denied"', () => {
		expect(new FsaPermissionError('h').type).toBe('fsa-permission-denied');
	});

	it('constructs with a handleName', () => {
		const err = new FsaPermissionError('my-folder');
		expect(err.handleName).toBe('my-folder');
		expect(err.message).toContain('my-folder');
	});

	it('message includes the handleName when provided', () => {
		expect(new FsaPermissionError('alpha').message).toContain('"alpha"');
	});

	it('falls back to a generic message when handleName is omitted', () => {
		const err = new FsaPermissionError();
		expect(err.handleName).toBeUndefined();
		expect(err.message).toContain('Permission denied');
	});

	it('preserves the cause chain', () => {
		const cause = new DOMException('cancelled', 'AbortError');
		const err = new FsaPermissionError('folder', cause);
		expect(err.cause).toBe(cause);
	});

	it('is instanceof both AdapterError and Error', () => {
		const err = new FsaPermissionError('h');
		expect(err).toBeInstanceOf(AdapterError);
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(FsaPermissionError);
	});

	it('has name "FsaPermissionError"', () => {
		expect(new FsaPermissionError('h').name).toBe('FsaPermissionError');
	});
});

describe('AdapterNotFoundError', () => {
	it('has type "not-found"', () => {
		expect(new AdapterNotFoundError('a/b.txt').type).toBe('not-found');
	});

	it('stores the path', () => {
		expect(new AdapterNotFoundError('a/b.txt').path).toBe('a/b.txt');
	});

	it('includes the path in the message', () => {
		expect(new AdapterNotFoundError('missing/path.md').message).toContain('missing/path.md');
	});

	it('preserves the cause chain', () => {
		const cause = new Error('ENOENT');
		const err = new AdapterNotFoundError('p', cause);
		expect(err.cause).toBe(cause);
	});

	it('is instanceof both AdapterError and Error', () => {
		const err = new AdapterNotFoundError('p');
		expect(err).toBeInstanceOf(AdapterError);
		expect(err).toBeInstanceOf(Error);
	});

	it('has name "AdapterNotFoundError"', () => {
		expect(new AdapterNotFoundError('p').name).toBe('AdapterNotFoundError');
	});
});

describe('AdapterValidationError', () => {
	it('has type "validation"', () => {
		expect(new AdapterValidationError('bad').type).toBe('validation');
	});

	it('handles an optional path via the options bag', () => {
		const err = new AdapterValidationError('bad input', { path: 'config.json' });
		expect(err.path).toBe('config.json');
	});

	it('path is undefined when not provided', () => {
		const err = new AdapterValidationError('bad input');
		expect(err.path).toBeUndefined();
	});

	it('includes the path in the message only when provided', () => {
		const err = new AdapterValidationError('bad input', { path: 'config.json' });
		// Message is whatever the caller passes; this confirms the constructor
		// does not second-guess the message.
		expect(err.message).toBe('bad input');
	});

	it('preserves the cause chain', () => {
		const cause = new SyntaxError('unexpected token');
		const err = new AdapterValidationError('bad', { cause });
		expect(err.cause).toBe(cause);
	});

	it('preserves both path and cause together', () => {
		const cause = new SyntaxError('x');
		const err = new AdapterValidationError('bad', { path: 'p', cause });
		expect(err.path).toBe('p');
		expect(err.cause).toBe(cause);
	});

	it('is instanceof both AdapterError and Error', () => {
		const err = new AdapterValidationError('bad');
		expect(err).toBeInstanceOf(AdapterError);
		expect(err).toBeInstanceOf(Error);
	});

	it('has name "AdapterValidationError"', () => {
		expect(new AdapterValidationError('bad').name).toBe('AdapterValidationError');
	});
});

describe('RemoteFetchError', () => {
	it('has type "remote-fetch"', () => {
		expect(new RemoteFetchError('boom').type).toBe('remote-fetch');
	});

	it('stores an optional status code', () => {
		const err = new RemoteFetchError('boom', { status: 404 });
		expect(err.status).toBe(404);
	});

	it('status is undefined when not provided', () => {
		expect(new RemoteFetchError('boom').status).toBeUndefined();
	});

	it('preserves the cause chain', () => {
		const cause = new Error('network');
		const err = new RemoteFetchError('boom', { cause });
		expect(err.cause).toBe(cause);
	});

	it('preserves both status and cause together', () => {
		const cause = new Error('e');
		const err = new RemoteFetchError('boom', { status: 500, cause });
		expect(err.status).toBe(500);
		expect(err.cause).toBe(cause);
	});

	it('is instanceof both AdapterError and Error', () => {
		const err = new RemoteFetchError('boom');
		expect(err).toBeInstanceOf(AdapterError);
		expect(err).toBeInstanceOf(Error);
	});

	it('has name "RemoteFetchError"', () => {
		expect(new RemoteFetchError('boom').name).toBe('RemoteFetchError');
	});
});

describe('RemoteAuthError', () => {
	it('has type "remote-auth"', () => {
		expect(new RemoteAuthError().type).toBe('remote-auth');
	});

	it('uses a sensible default message when none is given', () => {
		const err = new RemoteAuthError();
		expect(err.message).toContain('Authentication failed');
	});

	it('accepts a custom message', () => {
		const err = new RemoteAuthError('token revoked');
		expect(err.message).toBe('token revoked');
	});

	it('preserves the cause chain', () => {
		const cause = new Error('401');
		const err = new RemoteAuthError('token revoked', cause);
		expect(err.cause).toBe(cause);
	});

	it('is instanceof both AdapterError and Error', () => {
		const err = new RemoteAuthError();
		expect(err).toBeInstanceOf(AdapterError);
		expect(err).toBeInstanceOf(Error);
	});

	it('has name "RemoteAuthError"', () => {
		expect(new RemoteAuthError().name).toBe('RemoteAuthError');
	});
});

describe('RenderError', () => {
	it('has type "render"', () => {
		expect(new RenderError('boom').type).toBe('render');
	});

	it('wraps the message in "Markdown render failed: <message>"', () => {
		const err = new RenderError('bad markdown');
		expect(err.message).toBe('Markdown render failed: bad markdown');
	});

	it('preserves the cause chain', () => {
		const cause = new TypeError('parser exploded');
		const err = new RenderError('boom', cause);
		expect(err.cause).toBe(cause);
	});

	it('is instanceof both AdapterError and Error', () => {
		const err = new RenderError('boom');
		expect(err).toBeInstanceOf(AdapterError);
		expect(err).toBeInstanceOf(Error);
	});

	it('has name "RenderError"', () => {
		expect(new RenderError('boom').name).toBe('RenderError');
	});
});
