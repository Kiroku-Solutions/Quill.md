/**
 * Octokit factory + shared helpers for the GitHub provider.
 *
 * Centralises:
 *  - The {@link Octokit} subclass with `@octokit/plugin-throttling` and
 *    `@octokit/plugin-retry` wired in. The plugins close two real gaps
 *    that the hand-rolled `fetchJson`/`fetchText` client never had:
 *      * honouring the `x-ratelimit-remaining: 0` + `x-ratelimit-reset`
 *        headers on a 403 (primary rate limit);
 *      * exponential backoff on 5xx, network errors, and GitHub's
 *        secondary-rate-limit body marker.
 *  - The `error` hook that maps Octokit's {@link RequestError} into the
 *    adapter-layer `AdapterError` subclasses (`RemoteAuthError`,
 *    `RemoteFetchError`, `RemoteCommitRejectedError`). The mapping is
 *    identical to the one previously in `_http.ts:handleResponse`, so
 *    callers' `instanceof` checks keep working unchanged.
 *  - Base64 / UTF-8 helpers, which the Contents API and the Git Data
 *    API still require even with Octokit (`createOrUpdateFileContents`
 *    and `createTree` accept base64 strings, not raw UTF-8).
 *  - PAT redaction on response bodies and headers before any
 *    stringification. NFR-2: the PAT is never logged.
 *
 * Construction:
 *  - `createOctokit(pat, baseUrl?)` returns a configured Octokit
 *    instance. Each unique PAT gets its own instance (Octokit binds the
 *    `Authorization` header at construction time via `auth`).
 *  - For `github.com` and the default base URL, Octokit accepts the PAT
 *    as a string and prepends `Bearer`/`token` based on its shape.
 *
 * NFR-2 (PAT hygiene): PAT redaction is applied to response **bodies**
 * (which may echo the request's `Authorization` header) and to error
 * messages, but NOT to URLs — every GitHub URL we issue contains only
 * `owner`, `repo`, branch names, and SHAs, never the PAT. Routing
 * URLs through {@link redactPatInText} would mangle SHAs (40 hex chars)
 * into `[REDACTED:PAT]` because the regex cannot tell a SHA apart
 * from a deprecated classic PAT.
 */

import { Octokit } from '@octokit/rest';
import { retry } from '@octokit/plugin-retry';
import { throttling } from '@octokit/plugin-throttling';
import type { ThrottlingOptions } from '@octokit/plugin-throttling';
import { RequestError } from '@octokit/request-error';
import { RemoteAuthError, RemoteCommitRejectedError, RemoteFetchError } from '../errors.ts';
import { brandPat, redactPatInText, type Pat } from './_pat.ts';

const USER_AGENT = 'quill-md/0.0.1';
const DEFAULT_BASE_URL = 'https://api.github.com';

/**
 * The configured Octokit class. Plugins applied here are shared by
 * every instance returned by {@link createOctokit}.
 */
const ConfiguredOctokit = Octokit.plugin(retry, throttling);

/** Build a configured Octokit bound to a single PAT. */
export function createOctokit(rawPat: string, baseUrl?: string): Octokit {
	const pat = brandPat(rawPat);
	const throttle: ThrottlingOptions = {
		onRateLimit: (retryAfter, options, octokit, retryCount) => {
			octokit.log.warn(
				`[github] rate limit hit: method=${options.method} url=${options.url} retryAfter=${retryAfter}s retry=${retryCount}`
			);
			if (retryCount < 2) return true;
			return false;
		},
		onSecondaryRateLimit: (retryAfter, options, octokit) => {
			octokit.log.warn(
				`[github] secondary rate limit: method=${options.method} url=${options.url} retryAfter=${retryAfter}s`
			);
			return true;
		}
	};
	const octokit = new ConfiguredOctokit({
		auth: pat,
		userAgent: USER_AGENT,
		baseUrl: baseUrl ?? DEFAULT_BASE_URL,
		throttle,
		retry: {
			retries: 3,
			// 409 / 412 are optimistic-concurrency signals (RemoteCommitRejectedError),
			// not transient errors. 422 is a validation failure.
			doNotRetry: [400, 401, 403, 404, 409, 410, 412, 422, 451]
		}
	});
	octokit.hook.error('request', (error) => {
		throw mapRequestError(error);
	});
	return octokit;
}

/**
 * Map an Octokit {@link RequestError} to an {@link AdapterError} subclass.
 *
 * Status mapping (preserves today's `_http.ts:handleResponse` semantics):
 *   401, 403        → RemoteAuthError
 *   404             → RemoteFetchError(status=404)
 *   409, 412        → RemoteCommitRejectedError(status=...)
 *   422             → RemoteCommitRejectedError(status=422)
 *   any other       → RemoteFetchError(status=...)
 *
 * Non-`RequestError` exceptions (e.g. `TypeError: Failed to fetch` on a
 * dropped connection, AbortError on cancellation) are re-thrown as-is
 * so the caller's existing handlers stay in charge.
 */
export function mapRequestError(err: unknown): Error {
	if (!(err instanceof RequestError)) {
		return err instanceof Error ? err : new Error(String(err));
	}
	const status = err.status;
	const url = err.response?.url ?? '';
	const messageBody = errorMessage(err);

	if (status === 401) {
		return new RemoteAuthError(`Authentication failed for ${url}`, err);
	}
	if (status === 403) {
		return new RemoteAuthError(
			`Forbidden — check that your token has the required scopes for ${url}`,
			err
		);
	}
	if (status === 404) {
		return new RemoteFetchError(`Not found: ${url}`, { status: 404, cause: err });
	}
	if (status === 409 || status === 412) {
		return new RemoteCommitRejectedError(messageBody || 'Conflict', { status, cause: err });
	}
	if (status === 422) {
		return new RemoteCommitRejectedError(messageBody || 'Unprocessable', {
			status: 422,
			cause: err
		});
	}
	return new RemoteFetchError(`HTTP ${status} from ${url}: ${messageBody}`, {
		status,
		cause: err
	});
}

/** Decode an Octokit `Content File` payload (base64) to a UTF-8 string. */
export function decodeBase64Content(content: string): string {
	const cleaned = content.replace(/\s+/g, '');
	try {
		const bin = atob(cleaned);
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
	} catch {
		return '';
	}
}

/** Encode a UTF-8 string to base64 (Contents API / Git Data API requirement). */
export function utf8ToBase64(text: string): string {
	const bytes = new TextEncoder().encode(text);
	let bin = '';
	for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ?? 0);
	return btoa(bin);
}

function errorMessage(err: RequestError): string {
	const data = err.response?.data as { message?: string } | undefined;
	if (data && typeof data.message === 'string') {
		return redactPatInText(data.message.slice(0, 200));
	}
	return redactPatInText(err.message.slice(0, 200));
}

export type { Pat };
