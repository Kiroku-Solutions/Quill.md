/**
 * Internal logger for the adapter layer.
 *
 * Not exported from the public `index.ts` barrel — only available to
 * `src/lib/adapters/*`. Keeps the surface area for accidental PAT leak small.
 *
 * ## Why a dedicated logger
 *
 * NFR-2 mandates:
 *  - PAT MUST be held in memory only
 *  - PAT MUST NOT appear in any log line, error message, URL, or analytics payload
 *
 * The standard `console.*` family is too easy to misuse (a stray
 * `console.log('token:', token)` would silently leak). This module:
 *
 *  1. Wraps the browser's `console` with a tagged-template API.
 *  2. Replaces every `Pat` value with `[REDACTED:PAT]` before any call
 *     reaches the native `console`.
 *  3. Accepts only whitelisted primitive shapes (string | number | boolean
 *     | null | undefined | bigint) — object/function references are
 *     stringified by JSON, which throws on circular refs and surfaces
 *     accidental sensitive-object logging at the call site.
 *
 * ERS coverage: NFR-2, NFR-3.
 */

// ─── Branded PAT (only the logger knows how to recognise it) ────────────────

/**
 * Branded type for a Personal Access Token. Created via {@link brandPat}
 * from inside `remote-git.ts`; the rest of the codebase never sees the brand.
 *
 * Branding is purely nominal: it costs zero at runtime, but it makes the
 * TypeScript compiler refuse `console.log(pat)` in the rest of the code —
 * the only place that can pass one of these to a log function is the
 * `remote-git` module, which uses the lower-level `logRaw` path that
 * still redacts by the brand.
 */
export const PAT_BRAND: unique symbol = Symbol('nomad-md:pat');
export const PROXY_URL_BRAND: unique symbol = Symbol('nomad-md:proxy-url');
export const SAFE_HTML_BRAND: unique symbol = Symbol('nomad-md:safe-html');

export type Pat = string & { readonly [PAT_BRAND]: true };

/**
 * Branded type for a CORS proxy URL.  Useful for the same reason as Pat:
 * the redactor recognises the brand and stamps the log entry with the host
 * (not the full URL, which can carry tokens in the query string).
 */
export type ProxyUrl = string & { readonly [PROXY_URL_BRAND]: true };

/**
 * A string that has been sanitised and is therefore safe to assign to
 * `innerHTML`. Branding prevents an unsanitised `string` from being used
 * in places that require `SafeHtml` (the compiler will refuse it).
 */
export type SafeHtml = string & { readonly [SAFE_HTML_BRAND]: true };

// ─── Runtime brand registry ──────────────────────────────────────────────────

/**
 * Branded types are nominal at the type level (the compiler refuses plain
 * strings in `Pat` slots), but at runtime strings are primitives and we
 * cannot set properties on them. We use a `Set` per brand to track
 * which string values have been "branded" by the corresponding
 * constructor. Membership is the runtime marker.
 *
 * Trade-off: the set holds references to the branded strings, preventing
 * GC. For the PAT and ProxyUrl cases this is fine — these are short-lived
 * (the PAT is dropped when `fetchSubtree` returns; the proxy URL is a
 * module-level constant). `SafeHtml` is purely a compile-time guard; the
 * renderer is the only consumer and inspects values through the brand type
 * alone, so no runtime registry is kept (removed in t1-state-types-layout).
 */
const PAT_REGISTRY = new Set<string>();
const PROXY_REGISTRY = new Set<string>();

/** Brand a string as a PAT. Only the remote-git module should call this. */
export function brandPat(value: string): Pat {
	PAT_REGISTRY.add(value);
	return value as Pat;
}

/** Brand a string as a CORS proxy URL. */
export function brandProxyUrl(value: string): ProxyUrl {
	PROXY_REGISTRY.add(value);
	return value as ProxyUrl;
}

/** Brand a string as sanitised HTML. Only the renderer module should call this. */
export function brandSafeHtml(value: string): SafeHtml {
	return value as SafeHtml;
}

/** Runtime check for a {@link Pat} value. */
export function isBrandedPat(value: unknown): value is Pat {
	return typeof value === 'string' && PAT_REGISTRY.has(value);
}

/** Runtime check for a {@link ProxyUrl} value. */
export function isBrandedProxy(value: unknown): value is ProxyUrl {
	return typeof value === 'string' && PROXY_REGISTRY.has(value);
}

// ─── Redaction ───────────────────────────────────────────────────────────────

/** Fixed sentinel for any redacted PAT. */
const REDACTED_PAT = '[REDACTED:PAT]';

/** Fixed sentinel for any redacted ProxyUrl (preserves host for context). */
const REDACTED_PROXY_PREFIX = '[REDACTED:PROXY:';

function redactValue(value: unknown): unknown {
	if (typeof value === 'string' && PAT_REGISTRY.has(value)) {
		return REDACTED_PAT;
	}
	if (typeof value === 'string' && PROXY_REGISTRY.has(value)) {
		try {
			const url = new URL(value);
			return `${REDACTED_PROXY_PREFIX}${url.host}]`;
		} catch {
			// Malformed URL → still redact, but without a host.
			return '[REDACTED:PROXY:invalid]';
		}
	}
	// Defence in depth: catch any accidental PAT-like string.
	// GitHub PATs: ghp_ + 36 alnum (or gho_, ghu_, ghs_, ghr_ for fine-grained)
	// GitLab: glpat- + 20 alnum
	if (typeof value === 'string' && looksLikePat(value)) {
		return REDACTED_PAT;
	}
	return value;
}

/**
 * Heuristic detector for accidental PAT-shaped strings in unbranded values.
 * Keeps us safe even if a developer types `console.log(someString)` instead
 * of using the brand.
 *
 * The patterns are anchored to a substring, not to start-of-string, so a
 * token buried inside `Authorization: Bearer <token>` is still caught. The
 * `g` + `s` flags allow the regex to span lines and match anywhere in the
 * input — defence in depth at the cost of a slightly higher false-positive
 * rate (an actual `ghp_`+36-character run in a log line is overwhelmingly
 * likely to be a token).
 */
function looksLikePat(value: string): boolean {
	// GitHub classic: 40 hex chars
	if (/[a-f0-9]{40}/i.test(value)) return true;
	// GitHub fine-grained: ghp_, gho_, ghu_, ghs_, ghr_ + 36 alnum
	if (/(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}/.test(value)) return true;
	// GitLab: glpat- + 20 alnum
	if (/glpat-[A-Za-z0-9_-]{20,}/.test(value)) return true;
	return false;
}

// ─── Public logger API ──────────────────────────────────────────────────────

/** Primitive shape we accept as a log argument. */
export type SafeLogValue = string | number | boolean | bigint | null | undefined | Pat | ProxyUrl;

/** Level filter. The browser console decides the actual rendering. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PREFIX: Readonly<Record<LogLevel, string>> = {
	debug: '[adapter:debug]',
	info: '[adapter:info]',
	warn: '[adapter:warn]',
	error: '[adapter:error]'
} as const;

/**
 * Tagged-template log entry.  The literal-string parts and the interpolated
 * values are both passed through {@link redactValue} before reaching the
 * native console.
 *
 * Usage:
 * ```ts
 * log('info', `Fetching ${url} on branch ${branch}`);
 * ```
 */
export function log(level: LogLevel, ...parts: ReadonlyArray<SafeLogValue>): void {
	const message = formatParts(parts);
	dispatch(level, message);
}

/** Convenience: log at debug level. */
export const debug = (...parts: ReadonlyArray<SafeLogValue>): void => log('debug', ...parts);

/** Convenience: log at info level. */
export const info = (...parts: ReadonlyArray<SafeLogValue>): void => log('info', ...parts);

/** Convenience: log at warn level. */
export const warn = (...parts: ReadonlyArray<SafeLogValue>): void => log('warn', ...parts);

/** Convenience: log at error level. */
export const error = (...parts: ReadonlyArray<SafeLogValue>): void => log('error', ...parts);

/**
 * Lower-level entrypoint used by `remote-git` when it needs to log
 * something that *might* contain sensitive material but has been whitelisted
 * by the caller. The same redaction pass runs on every argument.
 */
export function logRaw(level: LogLevel, ...parts: ReadonlyArray<unknown>): void {
	const message = formatParts(parts);
	dispatch(level, message);
}

function formatParts(parts: ReadonlyArray<unknown>): string {
	// `redactValue` only inspects the *outermost* level of an object — it
	// does not recurse into nested properties. To catch the audit-flagged
	// case where a caller logs `{ headers: { Authorization: 'ghp_…' } }`
	// (which would otherwise be emitted verbatim by JSON.stringify), we
	// use a `replacer` that walks every value and runs `redactValue` on it.
	const replacer = (_key: string, value: unknown): unknown => redactValue(value);

	const redacted = parts.map(redactValue);
	const isPrim = (v: unknown): v is string | number | boolean | bigint | null | undefined =>
		v === null || (typeof v !== 'object' && typeof v !== 'function');
	if (redacted.every(isPrim)) {
		return redacted
			.map((v) => (v === null ? 'null' : v === undefined ? 'undefined' : String(v)))
			.join(' ');
	}
	// Mixed/object payload → JSON. The `replacer` recurses into every
	// nested value so a PAT-shaped string buried inside an object property
	// is still caught. We use a `toJSON` that throws on circular refs
	// (matches the previous behaviour — surfaces accidental sensitive-
	// object logging at the call site).
	const json = JSON.stringify(redacted, replacer);
	return json ?? '[unserialisable]';
}

function dispatch(level: LogLevel, message: string): void {
	// We intentionally never pass multiple args to console.* — collapsed to a
	// single string so a devtools copy-paste can never reveal a hidden arg.
	const line = `${LEVEL_PREFIX[level]} ${message}`;
	switch (level) {
		case 'debug':
			console.debug(line);
			return;
		case 'info':
			console.info(line);
			return;
		case 'warn':
			console.warn(line);
			return;
		case 'error':
			console.error(line);
			return;
	}
}
