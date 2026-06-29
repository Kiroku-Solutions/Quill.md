/**
 * Public surface of the state layer.
 *
 * Every export is a factory (call to create the store) or a TypeScript
 * type. There are NO module-level singletons — each app mount creates its
 * own set of stores via these factories and propagates them through
 * Svelte context (the `+layout.svelte` consumer is Step 6).
 *
 * The eight state stores live in `.svelte.ts` files (Svelte 5 runes mode).
 * The barrel re-exports from the `.svelte.ts` files so consumers do not
 * have to know about the extension — they import from `$lib/state`
 * regardless of where the runes live.
 *
 * Internal modules (currently just `_context.ts`, prefixed with `_`) are
 * deliberately NOT re-exported. They are test seams and adapter helpers
 * that callers outside the state layer should not need.
 */

// ─── Mode ─────────────────────────────────────────────────────────────────
export type { Mode, ModeStore, RemoteCredentials } from './mode.svelte.ts';
export { createModeStore } from './mode.svelte.ts';

// ─── Config ───────────────────────────────────────────────────────────────
export type { ConfigStatus, ConfigStore } from './config.svelte.ts';
export { createConfigStore } from './config.svelte.ts';

// ─── Templates ────────────────────────────────────────────────────────────
export type { TemplatesStatus, TemplatesStore } from './templates.svelte.ts';
export { createTemplatesStore } from './templates.svelte.ts';

// ─── Issues ───────────────────────────────────────────────────────────────
export type {
	IssueId,
	IssuesStatus,
	CreateIssueInput,
	IssuePatch,
	IssuesStore
} from './issues.svelte.ts';
export { brandIssueId, createIssuesStore, isIssueId } from './issues.svelte.ts';

// ─── Filter ───────────────────────────────────────────────────────────────
export type { FilterState, FilterStore, DateRange } from './filter.svelte.ts';
export { createFilterStore } from './filter.svelte.ts';

// ─── View ─────────────────────────────────────────────────────────────────
export type { View, ViewStore } from './view.svelte.ts';
export { createViewStore } from './view.svelte.ts';

// ─── Theme ────────────────────────────────────────────────────────────────
export type { Theme, ThemeStore } from './theme.svelte.ts';
export type { ThemeStoreDeps } from './theme.svelte.ts';
export { createThemeStore } from './theme.svelte.ts';

// ─── Editor ───────────────────────────────────────────────────────────────
export type { EditorStore } from './editor.svelte.ts';
export { createEditorStore } from './editor.svelte.ts';

// ─── Errors ────────────────────────────────────────────────────────────────
// `StoreNotReadyError` and `ConcurrentSaveError` were removed in
// t1-state-types-layout — see git history. `StateError` is the only error
// class still exported from the state layer.
export { StateError } from './errors.ts';
export type { StateErrorKind } from './errors.ts';

// ─── Context (per-mount store wiring) ──────────────────────────────────────
export { setStores, getStores } from './context.ts';
export type { StoreGraph } from './context.ts';

// ─── Internal seam (re-exported for the layout only) ──────────────────────
// `debouncedSave` and the `DebouncedSave` interface were removed in
// t1-state-types-layout — see git history.
export { createStateContext, assertBrowser } from './_context.ts';
export type { StateContext } from './_context.ts';
