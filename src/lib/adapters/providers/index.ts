/**
 * Public surface of the provider Strategy.
 *
 * Re-exports every concrete provider, the registry helpers, the detector,
 * the type definitions, and the shared HTTP/PAT helpers. Adapter-layer
 * consumers should depend on this barrel rather than reaching into
 * individual files.
 */

export type {
	AuthorIdentity,
	AuthenticatedUser,
	BranchTip,
	CommitBatchInput,
	CommitBatchResult,
	DeleteFileInput,
	DeleteFileResult,
	ParsedRepo,
	PutFileInput,
	PutFileResult,
	RemoteFile,
	RemoteFileChange,
	RepoProvider
} from './types.ts';

export { GitHubProvider } from './github.ts';
export { GitLabProvider } from './gitlab.ts';

export { detectProvider, resolveProvider } from './detect.ts';
export { getProvider, listProviders } from './registry.ts';

export { brandPat, isBrandedPat, redactIfPat, redactPatInText, unbrandPat } from './_pat.ts';
