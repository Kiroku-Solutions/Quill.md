/**
 * URL → provider detection.
 *
 *  - `detectProvider(url)` returns the provider that auto-matches the URL
 *    host. Used by the home screen when the user pastes a URL and the
 *    "Auto" provider is selected.
 *  - `resolveProvider(url, preferredId)` returns the preferred provider
 *    when supplied, falling back to detection. Throws
 *    {@link RemoteUnsupportedHostError} if neither yields a match.
 *
 * Adding a new auto-detected provider means extending the `matches()`
 * check on the corresponding `RepoProvider` implementation; this module
 * is just glue.
 */

import { RemoteUnsupportedHostError } from '../errors.ts';
import { getProvider, listProviders } from './registry.ts';
import type { RepoProvider } from './types.ts';

/**
 * Return the provider that recognises the URL host, or null when no
 * registered provider matches.
 */
export function detectProvider(url: URL): RepoProvider | null {
	for (const provider of listProviders()) {
		if (provider.matches(url)) return provider;
	}
	return null;
}

/**
 * Resolve a provider for the given URL. `preferredId` is honoured when
 * supplied; otherwise the URL host is matched. Throws
 * {@link RemoteUnsupportedHostError} when no provider is found.
 */
export function resolveProvider(url: URL, preferredId: string | null): RepoProvider {
	if (preferredId) {
		const chosen = getProvider(preferredId);
		if (chosen && chosen.matches(url)) return chosen;
	}
	const detected = detectProvider(url);
	if (detected) return detected;
	throw new RemoteUnsupportedHostError(url.hostname);
}
