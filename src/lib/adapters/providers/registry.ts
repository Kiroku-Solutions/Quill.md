/**
 * Provider registry. The Strategy pattern's bootstrap layer: every
 * provider exports a singleton instance, and consumers go through
 * {@link getProvider} / {@link listProviders} / {@link detectProvider}
 * rather than reaching for the concrete classes.
 */

import { GitHubProvider } from './github.ts';
import { GitLabProvider } from './gitlab.ts';
import type { RepoProvider } from './types.ts';

const providers: ReadonlyArray<RepoProvider> = [new GitHubProvider(), new GitLabProvider()];

/** Look up a registered provider by id (e.g. `'github'`, `'gitlab'`). */
export function getProvider(id: string): RepoProvider | null {
	return providers.find((p) => p.id === id) ?? null;
}

/** Return every registered provider. The order is the UI's default ordering. */
export function listProviders(): readonly RepoProvider[] {
	return providers;
}
