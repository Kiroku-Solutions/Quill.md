/**
 * i18n string map + `t` helper — sub-phase 6J (NFR-6).
 *
 * Every user-facing string in `src/lib/components/**` and
 * `src/routes/**` is sourced from the `STRINGS` object below, walked
 * by dotted path. The map is intentionally flat-but-grouped: each
 * top-level key is a surface (`common`, `home`, `editor`, `list`,
 * …), and a few surfaces nest a sub-group (e.g. `home.recentFolders`,
 * `editor.sections`). v1 ships English-only; the structure is
 * forward-compatible with a future real i18n library.
 *
 * ## Naming note
 *
 * The original brief suggested the helper be exported as `$t`. Svelte 5
 * reserves the `$` prefix for runes and stores (e.g. `$state`, `$derived`,
 * `$effect`, `$props`), so a top-level export named `$t` would fail to
 * compile inside any `.svelte` script block that tries to import it
 * (`The $ prefix is reserved, and cannot be used for variables and
 * imports`). The helper is therefore exported as `t`.
 *
 * Note on `t` collisions: `{#each items as t}` is a common Svelte loop-
 * variable name; components that iterate a list of items often use `t`
 * for the loop item. To avoid the shadowing, every component that uses
 * `t` from this module renames the loop variable (`as tmpl` or `as
 * template`) when iterating a list of items.
 *
 * ## Function-form leaves
 *
 * Some leaves are functions, e.g. `home.recentFolders.forgetLabel`:
 *
 *   t('home.recentFolders.forgetLabel', { name: 'acme' })
 *     → 'Forget acme'
 *
 * The helper calls the function with the params object. Plain string
 * leaves ignore params. The function signature is
 * `(params: Record<string, string | number>) => string` — every
 * function-form leaf reads its named values from `params`. This keeps
 * the call-site ergonomic (`t('key', { n: 5 })`) and forward-
 * compatible with a real i18n library that would substitute
 * `{name}`-style placeholders.
 *
 * ## Missing-key policy
 *
 * `[[key]]` is returned (visible marker) AND a `console.warn` fires
 * in dev (`import.meta.env.DEV`). The helper never throws — the
 * brief is explicit on that.
 *
 * ## Pure
 *
 * The helper is pure: no module-level mutations, no globals, no
 * caches that vary by call. The dev warning is a `console.warn`
 * side effect, gated on `import.meta.env.DEV` so production builds
 * strip it (Vite's dead-code elimination drops the entire branch
 * when the constant is `false`).
 */

type Params = Record<string, string | number>;
type Leaf = string | ((params: Params) => string);

export const STRINGS = {
	common: {
		save: 'Save',
		discard: 'Discard',
		close: 'Close',
		cancel: 'Cancel',
		refresh: 'Refresh',
		clear: 'Clear',
		forget: 'Forget',
		review: 'Review',
		dismiss: 'Dismiss',
		ok: 'OK',
		apply: 'Apply',
		back: 'Back',
		next: 'Next',
		loading: 'Loading…',
		empty: 'Empty',
		justNow: 'just now',
		all: 'All',
		required: 'required',
		permanentDelete: 'permanently delete',
		trashDirectory: '.nomad.md/.trash/',
		remoteSessionExpired: 'Remote session expired — sign in again to refresh.',
		issueCount: (params: Params) => `${params.n} issue${params.n === 1 ? '' : 's'}`,
		dirtyCount: (params: Params) => `${params.n} dirty`,
		validationErrors: (params: Params) =>
			`${params.n} validation ${params.n === 1 ? 'error' : 'errors'}`,
		integrityReview: (params: Params) =>
			`${params.n} integrity ${params.n === 1 ? 'warning' : 'warnings'}`
	},

	app: {
		name: 'nomad.md',
		version: 'v0.0.1',
		homeAria: 'nomad.md home'
	},

	modeBadge: {
		local: 'Local',
		remote: 'Remote (read-only)',
		setup: 'Setup',
		home: 'Home',
		firstRunSetup: 'First-run setup'
	},

	topbar: {
		remoteRepository: 'Remote repository',
		settingsTooltip: 'Settings',
		openSettings: 'Open settings',
		ariaLabel: 'Primary navigation'
	},

	leftrail: {
		ariaLabel: 'Navigation',
		viewsHeading: 'Views',
		filtersHeading: 'Filters',
		view: {
			list: 'List',
			kanban: 'Kanban',
			gantt: 'Gantt'
		},
		expandNav: 'Expand navigation',
		collapseNav: 'Collapse navigation',
		integrityBadge: (params: Params) =>
			`${params.n} integrity ${params.n === 1 ? 'warning' : 'warnings'}`,
		integrityReview: (params: Params) =>
			`Review ${params.n} integrity ${params.n === 1 ? 'warning' : 'warnings'}`,
		integrityAria: (params: Params) =>
			`${params.n} integrity ${params.n === 1 ? 'warning' : 'warnings'} — review`
	},

	integrity: {
		bannerBody: (params: Params) =>
			`${params.n} ${params.n === 1 ? 'issue file' : 'issue files'} modified outside nomad.md — review before saving.`,
		editorWarning:
			'This file was modified outside nomad.md. Review the contents before saving — id, relations, and section markers may have drifted.',
		dismissAria: 'Dismiss integrity warning'
	},

	home: {
		heroTitle: 'nomad.md',
		heroSubtitle: 'Issues that travel with your repo',
		chooseModeAria: 'Choose a mode',
		openLocalTitle: 'Open a local folder',
		openLocalBody:
			'Pick a folder on your machine to edit issues stored under .nomad.md/. Requires a Chromium-based browser.',
		openLocalButton: 'Open local folder',
		openRemoteTitle: 'Browse a remote repository',
		openRemoteBody: 'Read-only access to issues hosted on any Git provider.',
		openRemoteButton: 'Open remote',
		remoteUrlPlaceholder: 'https://github.com/owner/repo',
		remoteBranchPlaceholder: 'main',
		remotePatLabel: 'Personal Access Token (optional for public repos)',
		remotePatPlaceholder: 'ghp_…',
		remotePatHelp:
			'Stored in memory only for the duration of the session — never on disk, never in URLs.',
		fsaUnavailable:
			'Your browser does not support the File System Access API. Use Chrome, Edge, Brave, Arc, Opera, or Vivaldi for Local Edit Mode.',

		recentFolders: {
			title: 'Recent folders',
			lastOpenedAgo: (params: Params) => `Last opened ${params.label}`,
			forgetLabel: (params: Params) => `Forget ${params.name}`
		},

		howItWorks: {
			title: 'How it works',
			pickFolder: {
				title: 'Pick a folder',
				body: 'Open a folder on your machine that already has (or will hold) a .nomad.md/ directory.'
			},
			browse: {
				title: 'Browse your issues',
				body: 'See the list, kanban, or gantt view of every issue the folder holds. Filter, search, and open one to read it.'
			},
			edit: {
				title: 'Edit and save',
				body: 'Change a title, tweak a status, or write a new section. Saves go straight to disk in the same folder you picked.'
			}
		}
	},

	localToolbar: {
		newIssue: '+ New issue',
		refresh: '↻ Refresh',
		refreshReadOnlyTooltip: 'Read-only — sign out to edit locally',
		trashButton: (params: Params) => `Trash (${params.n})`,
		trashEmptyLabel: 'Empty',
		trashAria: (params: Params) =>
			`Trash contains ${params.n} ${params.n === 1 ? 'file' : 'files'}. Click to empty.`
	},

	remoteToolbar: {
		view: (params: Params) => `${params.n} ${params.n === 1 ? 'issue' : 'issues'} (read-only)`,
		signOut: 'Sign out',
		lastFetchedAria: (params: Params) => `Last fetched ${params.label}`,
		lastFetched: (params: Params) => `Last fetched: ${params.label}`,
		notYetFetched: 'Not yet fetched',
		dismissErrorAria: 'Dismiss error'
	},

	refreshPatPrompt: {
		title: 'Refresh remote',
		body: 'The remote subtree will be re-fetched. Provide a Personal Access Token so the proxy can authenticate against the Git provider. The token is held in memory only.',
		label: 'Personal Access Token',
		refreshing: 'Refreshing…',
		closeAria: 'Close'
	},

	newIssueModal: {
		title: 'New issue',
		closeAria: 'Close new-issue dialog',
		searchPlaceholder: 'Search types…',
		noMatch: (params: Params) => `No types match "${params.q}".`,
		fieldCount: (params: Params) => `${params.n} field${params.n === 1 ? '' : 's'}`,
		sectionCount: (params: Params) => `${params.n} section${params.n === 1 ? '' : 's'}`,
		selectType: (params: Params) => `Select ${params.name}`,
		create: 'Create'
	},

	emptyTrashModal: {
		title: 'Empty trash?',
		closeAria: 'Close empty-trash dialog',
		alreadyEmpty: 'The trash is already empty.',
		confirmBody: (params: Params) =>
			`This will permanently delete ${params.n} ${params.n === 1 ? 'file' : 'files'} from .nomad.md/.trash/. This cannot be undone.`,
		confirm: 'Empty trash'
	},

	editor: {
		tabs: {
			form: 'Form',
			write: 'Write',
			preview: 'Preview'
		},
		closeAria: 'Close editor',
		sectionsAria: 'Sections',
		noSectionsEdit: 'No sections to edit.',
		noSectionsPreview: 'No sections to preview.',
		readOnlySaveTooltip: 'Read-only — open locally to save',
		readOnlyDiscardTooltip: 'Read-only — open locally to discard',
		unsaved: 'Unsaved changes',
		footerClose: 'Close'
	},

	formFields: {
		issueTypeDisabledNote:
			'Issue type cannot be changed after creation — create a new issue instead.',
		assigneePlaceholder: 'Unassigned',
		selectPlaceholder: 'Select…',
		noIssues: 'No issues'
	},

	markdown: {
		previewAria: 'Gantt timeline',
		renderFailed: '<p class="text-error">Failed to render preview.</p>'
	},

	settings: {
		title: 'Settings',
		closeAria: 'Close settings',
		backdropAria: 'Close settings',
		themeHeading: 'Theme',
		themeLight: 'Light',
		themeDark: 'Dark',
		themeSystem: 'System',
		themeSystemHint: (params: Params) => `Following the OS preference (${params.now} right now).`,
		corsHeading: 'CORS proxy',
		corsPlaceholder: '(not configured)',
		corsNote: 'Editing this value requires re-saving your config.json. Coming in a follow-up.',
		recentHeading: 'Recent folders',
		commandsHeading: 'Commands',
		clearCache: 'Clear remote cache',
		clearCacheRemoteTooltip: 'Clear cached remote clones (per-key) — wired in a follow-up',
		clearCacheSignInTooltip: 'Sign in to a remote repository to enable this',
		emptyTrash: (params: Params) => `Empty trash${Number(params.n) > 0 ? ` (${params.n})` : ''}`,
		emptyTrashLocalTooltip: 'Empty the local .nomad.md/.trash/ folder',
		emptyTrashSignInTooltip: 'Open a local folder to enable this'
	},

	list: {
		countPill: (params: Params) =>
			`${params.filtered} of ${params.total} ${params.total === 1 ? 'issue' : 'issues'}`,
		sortLabel: (params: Params) => `Sort: ${params.key} (${params.dir})`,
		rowAria: (params: Params) => `Open issue ${params.id}: ${params.title}`,
		empty: 'No issues match the current filter.',
		headers: {
			id: 'id',
			title: 'title',
			type: 'type',
			status: 'status',
			assignee: 'assignee',
			labels: 'labels',
			updated: 'updated'
		}
	},

	kanban: {
		cardAria: (params: Params) => `Issue ${params.id}: ${params.title} in column ${params.col}`,
		readOnlyTooltip: 'Read-only — open this issue locally to change its status'
	},

	gantt: {
		emptyTitle: 'No issues are scheduled yet',
		emptyBody: 'Add start and end dates to issues in the Editor to see them on the Gantt.',
		ariaLabel: 'Gantt timeline',
		roleDescription: 'gantt timeline',
		barAria: (params: Params) => `Issue ${params.id}: ${params.title}`,
		truncation: '…',
		fallbackSummary: 'Textual fallback (NFR-4 accessibility)',
		fallbackEmpty: 'No issues match the current filter.',
		fallbackNotScheduled: 'Not scheduled',
		fallbackHeaders: {
			id: 'id',
			title: 'title',
			type: 'type',
			status: 'status',
			group: 'group',
			start: 'start',
			endOrDuration: 'end / duration'
		},
		duration: (params: Params) => `${params.n} d`
	},

	filter: {
		searchLabel: 'Search',
		searchPlaceholder: 'title or section body…',
		statusLabel: 'Status',
		typeLabel: 'Type',
		typePlaceholder: 'bug, task…',
		clearButton: 'Clear'
	},

	theme: {
		switchToLight: 'Switch to light theme',
		switchToDark: 'Switch to dark theme'
	},

	proxy: {
		dismissAria: 'Dismiss proxy warning'
	},

	wizard: {
		headTitle: 'Set up your issue tracker',
		headBody:
			'Your folder does not have a .nomad.md/ configuration yet. Pick a path below to get started. You can edit or add templates later from the Settings panel.',
		step1Title: '1. Choose how to set up templates',
		step2Title: '2. Pick the templates you need',
		step2Body:
			'Select at least one. Selected templates are written to .nomad.md/templates/ verbatim.',
		builtinTitle: 'Use built-in templates',
		builtinBody:
			'Pick from the four bundled issue types: Epic, User Story, Task, Bug. Recommended for most projects.',
		builtinAria: 'Use built-in templates',
		customTitle: 'Create your own',
		customBody:
			'Author one or more templates from scratch (coming soon). You can also add templates later from Settings.',
		customAria: 'Create your own templates (coming soon)',
		customTooltip: 'Coming soon — the in-app template editor is a future step',
		applyButton: 'Apply and continue',
		applyTooltip: 'Write the selected templates to .nomad.md/',
		applyTooltipDisabled: 'Select at least one template to continue',
		applying: 'Applying…',
		cancel: 'Cancel',
		noFolder: 'No local folder is open. Use "Open local folder" on the home page.',
		applyError: (params: Params) => `Failed to write the wizard setup: ${params.msg}`,
		summary: (params: Params) => `Selected: ${params.selected} · Required: ≥1`,
		selectTemplateAria: (params: Params) => `Select ${params.name}`,
		templateFields: (params: Params) => `${params.n} fields`,
		templateSections: (params: Params) => `${params.n} sections`
	}
} as const;

export type Strings = typeof STRINGS;

export type StringKey = string;

/**
 * Walk `STRINGS` by dotted path. If the leaf is a function, call it
 * with the params object. If the key is missing, return `[[key]]`
 * AND log a `console.warn` in dev.
 */
export function t(key: string, params?: Params): string {
	const leaf = resolveKey(STRINGS, key) as Leaf | undefined;
	if (typeof leaf === 'function') {
		return leaf(params ?? {});
	}
	if (typeof leaf === 'string') {
		return leaf;
	}
	if (import.meta.env.DEV) {
		console.warn(`[nomad-md] t: missing key "${key}"`);
	}
	return `[[${key}]]`;
}

function resolveKey(root: unknown, key: string): unknown {
	const parts = key.split('.');
	let cursor: unknown = root;
	for (const part of parts) {
		if (cursor === null || cursor === undefined) return undefined;
		if (typeof cursor !== 'object') return undefined;
		cursor = (cursor as Record<string, unknown>)[part];
	}
	return cursor;
}
