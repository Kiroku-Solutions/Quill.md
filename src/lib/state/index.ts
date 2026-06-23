/**
 * Public surface of the state layer.
 *
 * Every export is a factory (call to create the store) or a TypeScript
 * type. There are NO module-level singletons — each app mount creates its
 * own set of stores via these factories and propagates them through
 * Svelte context (the `+layout.svelte` consumer is Step 6).
 *
 * Internal modules (currently just `_context.ts`, prefixed with `_`) are
 * deliberately NOT re-exported. They are test seams and adapter helpers
 * that callers outside the state layer should not need.
 */

// ─── Mode ─────────────────────────────────────────────────────────────────
export type { Mode, ModeStore, RemoteCredentials } from './mode.ts';
export { createModeStore } from './mode.ts';

// ─── Config ───────────────────────────────────────────────────────────────
export type { ConfigStatus, ConfigStore } from './config.ts';
export { createConfigStore } from './config.ts';

// ─── Templates ────────────────────────────────────────────────────────────
export type { TemplatesStatus, TemplatesStore } from './templates.ts';
export { createTemplatesStore } from './templates.ts';

// ─── Issues ───────────────────────────────────────────────────────────────
export type { IssueId, IssuesStatus, CreateIssueInput, IssuePatch, IssuesStore } from './issues.ts';
export { createIssuesStore } from './issues.ts';

// ─── Filter ───────────────────────────────────────────────────────────────
export type { FilterState, FilterStore } from './filter.ts';
export { createFilterStore } from './filter.ts';

// ─── View ─────────────────────────────────────────────────────────────────
export type { View, ViewStore } from './view.ts';
export { createViewStore } from './view.ts';

// ─── Theme ────────────────────────────────────────────────────────────────
export type { Theme, ThemeStore } from './theme.ts';
export { createThemeStore } from './theme.ts';

// ─── Editor ───────────────────────────────────────────────────────────────
export type { EditorStore } from './editor.ts';
export { createEditorStore } from './editor.ts';

// ─── Errors ───────────────────────────────────────────────────────────────
export { StateError, StoreNotReadyError, ConcurrentSaveError } from './errors.ts';
export type { StateErrorKind } from './errors.ts';
