/**
 * Provider-agnostic HTTP helpers.
 *
 * Centralises:
 *  - JSON / text fetch with the correct `Accept` / `Content-Type` headers;
 *  - Provider auth header injection (Bearer for GitHub, PRIVATE-TOKEN for
 *    GitLab — the helper takes the header name + value rather than the
 *    provider, so it does not leak the strategy);
 *  - 4xx / 5xx classification into typed `AdapterError` subclasses;
 *  - PAT redaction in error messages (NFR-2).
 *
 * No third-party HTTP client — `globalThis.fetch` is used directly.
 */

import { RemoteAuthError, RemoteCommitRejectedError, RemoteFetchError } from '../errors.ts';
import { redactPatInText } from './_pat.ts';

export interface FetchJsonOptions {
	readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	readonly headers?: Readonly<Record<string, string>>;
	readonly body?: unknown;
	readonly signal?: AbortSignal;
}

export class HttpStatusError extends Error {
	readonly status: number;
	readonly body: string;
	constructor(status: number, body: string) {
		super(`HTTP ${status}: ${body.slice(0, 200)}`);
		this.status = status;
		this.body = body;
	}
}

/** Fetch a JSON document. Throws typed errors on non-2xx. */
export async function fetchJson<T = unknown>(
	url: string,
	auth: { readonly headerName: string; readonly headerValue: string },
	opts: FetchJsonOptions = {}
): Promise<T> {
	const headers: Record<string, string> = {
		Accept: 'application/json',
		'User-Agent': 'quill-md',
		...(opts.headers ?? {})
	};
	if (auth.headerName) headers[auth.headerName] = auth.headerValue;

	const init: RequestInit = {
		method: opts.method ?? 'GET',
		headers
	};
	if (opts.body !== undefined) {
		headers['Content-Type'] = 'application/json';
		init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
	}
	if (opts.signal) init.signal = opts.signal;

	const res = await globalThis.fetch(url, init);
	return (await handleResponse(res, url)) as T;
}

/** Fetch a raw text document. Throws typed errors on non-2xx. */
export async function fetchText(
	url: string,
	auth: { readonly headerName: string; readonly headerValue: string },
	opts: FetchJsonOptions = {}
): Promise<string> {
	const headers: Record<string, string> = {
		Accept: 'text/plain, application/octet-stream',
		'User-Agent': 'quill-md',
		...(opts.headers ?? {})
	};
	if (auth.headerName) headers[auth.headerName] = auth.headerValue;

	const init: RequestInit = {
		method: opts.method ?? 'GET',
		headers
	};
	if (opts.signal) init.signal = opts.signal;

	const res = await globalThis.fetch(url, init);
	return handleResponse(res, url) as Promise<string>;
}

/** Parse the response and throw a typed error on non-2xx. */
async function handleResponse(res: Response, url: string): Promise<unknown> {
	const text = await res.text();
	if (res.ok) {
		if (!text) return null;
		try {
			return JSON.parse(text);
		} catch {
			return text;
		}
	}

	const safeText = redactPatInText(text);
	const safeUrl = redactPatInText(url);

	if (res.status === 401) {
		throw new RemoteAuthError(`Authentication failed for ${safeUrl}`, undefined);
	}
	if (res.status === 403) {
		throw new RemoteAuthError(
			`Forbidden — check that your token has the required scopes for ${safeUrl}`,
			undefined
		);
	}
	if (res.status === 404) {
		throw new RemoteFetchError(`Not found: ${safeUrl}`, {
			status: 404,
			cause: undefined
		});
	}
	if (res.status === 409 || res.status === 412) {
		throw new RemoteCommitRejectedError(safeText.slice(0, 200) || 'Conflict', {
			status: res.status
		});
	}
	if (res.status === 422) {
		throw new RemoteCommitRejectedError(safeText.slice(0, 200) || 'Unprocessable', {
			status: 422
		});
	}
	throw new RemoteFetchError(`HTTP ${res.status} from ${safeUrl}: ${safeText.slice(0, 200)}`, {
		status: res.status
	});
}
