/**
 * Editor store — owns the in-flight edit buffer for a single issue and
 * delegates persistence to the issues store.
 *
 * Reactivity: `activeId`, `isDirty` are Svelte 5 `$state` slots;
 * `draft` is `$state.raw` (a single `LoadedIssue` snapshot — the rune
 * avoids deep-proxying its nested arrays/maps; the rune proxy on a
 * draft object would interfere with the clone-based save/discard
 * contract). The public `errors` and `integrityWarning` getters
 * stay as plain passthroughs — they re-run on every read and do not
 * benefit from `$derived` memoisation.
 *
 * Behaviour:
 *  - `open(id)` deep-clones the {@link LoadedIssue} from `issues.byId` into
 *    a `draft` and resets the dirty flag. The clone is the only handle the
 *    editor mutates; the source of truth in the issues store is left
 *    untouched until `save()` succeeds.
 *  - `close()` resets everything to the empty state (`activeId = null`,
 *    `draft = null`, `isDirty = false`).
 *  - `patchField(key, value)` writes to either a system field on
 *    `draft.issue` or a custom field on `draft.issue.customFields`,
 *    depending on whether the key is in the system key set. The split
 *    matches the on-disk shape (ERS §6.1.3) — system keys live at the top
 *    level, template-defined keys go in the `customFields` map. Setting
 *    a value to `undefined` removes a custom key. Setting a system field
 *    to `undefined` is a no-op (we don't want to corrupt required keys).
 *  - `patchSection(name, markdown)` updates an existing section by name
 *    or appends a new one if the name is unknown. This matches the
 *    "templated section" model from the ERS — the editor lets the user
 *    reorder / rename via this single verb.
 *  - `save()` delegates to `issues.save(activeId)`. The actual
 *    serialize-then-write-then-reparse flow lives in the issues store;
 *    we just plumb the call.
 *  - `discard()` re-clones from the issues store and clears the dirty
 *    flag. The previous draft is dropped on the floor.
 *  - `errors` is recomputed on every read by calling
 *    `issues.validate(activeId)`. Validate is cheap (no I/O) and reads
 *    the in-memory issue, so memoising is not worth the staleness
 *    surface area.
 *  - `integrityWarning` mirrors `draft.issue.integrityWarning` — the
 *    flag is set on the source record by the parser, and our clone
 *    copies it, so this getter is just a passthrough.
 *
 * No filesystem access, no adapter dependency, no async coordination of
 * its own — `issues.save()` already handles the per-id serialisation
 * (plan §C.4 / state-of-the-art §3.2).
 *
 * Dependencies:
 *  - `issues` is required (the editor wraps it).
 *  - `config` and `templates` are accepted to match the plan's contract
 *    (`EditorStoreDeps`) and to keep the seam in place for a future
 *    enhancement that needs to read template defaults on `open()`. The
 *    current implementation does not call into them — `open` clones
 *    verbatim. They are read by `issues.save()` indirectly.
 */

import type { Issue, IssueSection, LoadedIssue, FrontmatterValue } from '../types/index.ts';
import { FIELD_TO_YAML } from '../types/index.ts';
import type { ValidationError } from '../services/validator.ts';
import type { ConfigStore } from './config.svelte.ts';
import type { TemplatesStore } from './templates.svelte.ts';
import type { IssuesStore } from './issues.svelte.ts';

/**
 * System frontmatter keys live on `Issue` directly; everything else is a
 * template-defined custom field. Derived from `FIELD_TO_YAML` so a new
 * system field added to the type layer is automatically picked up here
 * (no hand-maintained list to drift).
 *
 * Note: `SYSTEM_FRONTMATTER_KEY_ORDER` (snake_case YAML keys) is the
 * on-disk equivalent. We use `FIELD_TO_YAML` keys here because the editor
 * operates on the in-memory `Issue` (camelCase), not on YAML directly.
 */
const SYSTEM_KEYS: ReadonlySet<string> = new Set(Object.keys(FIELD_TO_YAML));

function cloneLoaded(src: LoadedIssue): LoadedIssue {
	if (typeof structuredClone === 'function') {
		return structuredClone(src) as LoadedIssue;
	}
	return JSON.parse(JSON.stringify(src)) as LoadedIssue;
}

export interface EditorStore {
	/**
	 * The id of the issue currently loaded in the editor's draft buffer.
	 * `null` when no issue is open. Plain `number` so call sites (and the
	 * comparison `expect(activeId).toBe(1)` test pattern) work without
	 * having to brand first.
	 */
	readonly activeId: number | null;
	readonly draft: LoadedIssue | null;
	readonly isDirty: boolean;
	readonly integrityWarning: boolean;
	readonly errors: readonly ValidationError[];

	/** Clone the given issue into the draft buffer. No-op if not found. */
	readonly open: (id: number) => void;
	/** Clear the editor — resets `activeId`, `draft`, `isDirty`. */
	readonly close: () => void;
	/**
	 * Patch a single field. System keys (see `SYSTEM_KEYS`) write directly
	 * to `draft.issue`; any other key writes to `draft.issue.customFields`.
	 * Sets `isDirty = true`.
	 */
	readonly patchField: (key: string, value: unknown) => void;
	/**
	 * Patch a Markdown section by name. If the section exists, its
	 * `markdown` is replaced. Otherwise a new section is appended. Sets
	 * `isDirty = true`.
	 */
	readonly patchSection: (name: string, markdown: string) => void;
	/** Persist the draft to disk. Delegates to `issues.save(activeId)`. */
	readonly save: () => Promise<void>;
	/** Re-clone the source issue into the draft, clearing the dirty flag. */
	readonly discard: () => void;
}

export interface EditorStoreDeps {
	readonly issues: IssuesStore;
	readonly config: ConfigStore;
	readonly templates: TemplatesStore;
}

/**
 * Build an {@link EditorStore}.
 *
 * The store holds no module-level state and depends only on the injected
 * `issues` / `config` / `templates` stores. The factory is cheap — there
 * is no async bootstrap.
 */
export function createEditorStore(deps: EditorStoreDeps): EditorStore {
	const { issues } = deps;

	let activeId = $state<number | null>(null);
	let draft = $state.raw<LoadedIssue | null>(null);
	let isDirty = $state<boolean>(false);

	function open(id: number): void {
		const source = issues.byId.get(id);
		if (!source) {
			// Unknown id — close rather than open a half-state. The caller
			// likely has a stale id from a previous session.
			close();
			return;
		}
		activeId = id;
		draft = cloneLoaded(source);
		isDirty = false;
	}

	function close(): void {
		activeId = null;
		draft = null;
		isDirty = false;
	}

	function patchField(key: string, value: unknown): void {
		if (!draft) return;
		if (SYSTEM_KEYS.has(key)) {
			// System fields are typed and required; we coerce to a
			// FrontmatterValue and assign via `Object.assign` (which
			// widens unknown → any without a cast). We do not allow
			// `undefined` here — clearing a system field is a different
			// verb and the parser/serializer reject it.
			if (value === undefined) return;
			Object.assign(draft.issue, { [key]: value });
		} else {
			if (value === undefined) {
				delete draft.issue.customFields[key];
			} else {
				draft.issue.customFields[key] = value as FrontmatterValue;
			}
		}
		isDirty = true;
	}

	function patchSection(name: string, markdown: string): void {
		if (!draft) return;
		const sections: IssueSection[] = draft.issue.sections;
		const existing = sections.find((s) => s.name === name);
		if (existing) {
			existing.markdown = markdown;
		} else {
			sections.push({ name, markdown });
		}
		isDirty = true;
	}

	async function save(): Promise<void> {
		if (activeId === null) return;
		if (draft === null) return;
		// We commit by overwriting the in-memory issue in the issues
		// store with our draft, then letting `issues.save()` handle
		// validate → serialize → write → reparse. Issues store's
		// `update(id, patch)` is the right verb — it captures a snapshot
		// for `discard()` and flips the dirty flag.
		issues.update(activeId, cloneIssueFields(draft.issue));
		await issues.save(activeId);
		// After a successful save, the issues store has re-parsed the
		// file (with a fresh integrity hash). Re-clone into the draft
		// so the editor's view is consistent with disk.
		const refreshed = issues.byId.get(activeId);
		if (refreshed) draft = cloneLoaded(refreshed);
		isDirty = false;
	}

	function discard(): void {
		if (activeId === null) {
			close();
			return;
		}
		const source = issues.byId.get(activeId);
		if (source) {
			draft = cloneLoaded(source);
		} else {
			draft = null;
		}
		isDirty = false;
	}

	return {
		get activeId() {
			return activeId;
		},
		get draft() {
			return draft;
		},
		get isDirty() {
			return isDirty;
		},
		get integrityWarning() {
			return draft?.issue.integrityWarning ?? false;
		},
		get errors() {
			if (activeId === null) return [];
			return issues.validate(activeId);
		},
		open,
		close,
		patchField,
		patchSection,
		save,
		discard
	};
}

/**
 * Build a shallow copy of an `Issue` suitable for `issues.update(id, patch)`.
 *
 * Driven by `FIELD_TO_YAML` as the single source of truth for system fields:
 * adding a new system field to `types/issue.ts` automatically flows through
 * this helper — no hand-maintained list to drift. `customFields` and
 * `sections` are not in `FIELD_TO_YAML` (they are not system fields per
 * ERS §6.1), so they are handled explicitly after the loop, along with
 * the FR-15 `integrityWarning` flag.
 *
 * `customFields` is spread into a new map and `sections` is deep-cloned
 * element-by-element so the patch is a snapshot, not a live reference
 * to the draft.
 */
function cloneIssueFields(issue: Issue): Partial<Issue> {
	const out: Record<string, unknown> = {};
	for (const camel of Object.keys(FIELD_TO_YAML)) {
		out[camel] = issue[camel as keyof Issue];
	}
	out.customFields = { ...issue.customFields };
	out.sections = issue.sections.map((s) => ({ ...s }));
	out.integrityWarning = issue.integrityWarning;
	return out as Partial<Issue>;
}
