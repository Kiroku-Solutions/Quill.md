/**
 * Adapter-layer typed error hierarchy.
 *
 * Every error thrown by the adapter layer (FSA, IndexedDB, remote Git,
 * Markdown rendering) is a subclass of `AdapterError` so consumers can do
 * `instanceof` checks or switch on the `type` literal discriminator without
 * parsing error messages (see `docs/step-4-implementation-plan.md` §6).
 *
 * ERS coverage: NFR-7 (resilience — predictable error handling) and
 * NFR-3 (no third-party error tracking; errors stay local).
 */

export type AdapterErrorType =
	| 'fsa-unavailable'
	| 'fsa-permission-denied'
	| 'not-found'
	| 'validation'
	| 'remote-fetch'
	| 'remote-auth'
	| 'render';

/**
 * Base class for every adapter-layer error.
 *
 * Discriminated by the `type` literal on each subclass (narrowed via
 * `as const`) so a switch over `err.type` gives exhaustive checking.
 *
 * Abstract — must not be instantiated directly. Construct a concrete
 * subclass instead so the `type` discriminator is meaningful.
 */
export abstract class AdapterError extends Error {
	abstract readonly type: AdapterErrorType;
	readonly cause?: unknown;

	constructor(message: string, options?: { cause?: unknown }) {
		super(message);
		this.name = this.constructor.name;
		this.cause = options?.cause;
	}
}

/** FSA is not available in this browser (Firefox, Safari). */
export class FsaUnavailableError extends AdapterError {
	readonly type = 'fsa-unavailable' as const;

	constructor(cause?: unknown) {
		super('File System Access API is not available in this browser', { cause });
	}
}

/**
 * FSA permission was denied or revoked (ERS C-4).
 * `handleName` is the folder name the user tried to grant, if known.
 */
export class FsaPermissionError extends AdapterError {
	readonly type = 'fsa-permission-denied' as const;
	readonly handleName?: string;

	constructor(handleName?: string, cause?: unknown) {
		super(
			handleName
				? `Permission denied for folder "${handleName}". Please grant access.`
				: 'Permission denied. Please grant folder access.',
			{ cause }
		);
		this.handleName = handleName;
	}
}

/** File or directory does not exist. */
export class AdapterNotFoundError extends AdapterError {
	readonly type = 'not-found' as const;
	readonly path: string;

	constructor(path: string, cause?: unknown) {
		super(`Not found: ${path}`, { cause });
		this.path = path;
	}
}

/** Input validation failed (e.g., malformed JSON in config). */
export class AdapterValidationError extends AdapterError {
	readonly type = 'validation' as const;
	readonly path?: string;

	constructor(message: string, options?: { path?: string; cause?: unknown }) {
		super(message, { cause: options?.cause });
		this.path = options?.path;
	}
}

/** Remote clone/fetch failed (network, CORS, not found on the server, …). */
export class RemoteFetchError extends AdapterError {
	readonly type = 'remote-fetch' as const;
	readonly status?: number;

	constructor(message: string, options?: { status?: number; cause?: unknown }) {
		super(message, { cause: options?.cause });
		this.status = options?.status;
	}
}

/** Remote authentication failed (bad PAT, expired token). */
export class RemoteAuthError extends AdapterError {
	readonly type = 'remote-auth' as const;

	constructor(message = 'Authentication failed (bad or expired token)', cause?: unknown) {
		super(message, { cause });
	}
}

/** Markdown rendering failed (parse or sanitize error). */
export class RenderError extends AdapterError {
	readonly type = 'render' as const;

	constructor(message: string, cause?: unknown) {
		super(`Markdown render failed: ${message}`, { cause });
	}
}
