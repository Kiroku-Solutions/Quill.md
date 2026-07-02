import type { Params } from './types';

export const en = {
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
		delete: 'Delete',
		permanentDelete: 'permanently delete',
		trashDirectory: '.quill.md/.trash/',
		remoteSessionExpired: 'Remote session expired — sign in again to refresh.',
		issueCount: (params: Params) => `${params.n} item${params.n === 1 ? '' : 's'}`,
		dirtyCount: (params: Params) => `${params.n} dirty`,
		validationErrors: (params: Params) =>
			`${params.n} validation ${params.n === 1 ? 'error' : 'errors'}`,
		integrityReview: (params: Params) =>
			`${params.n} integrity ${params.n === 1 ? 'warning' : 'warnings'}`
	},

	app: {
		name: 'Quill.md',
		version: 'v0.0.1',
		homeAria: 'quill.md home',
		logoAlt: 'quill.md logo'
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
		toggleMobileNav: 'Toggle mobile menu',
		ariaLabel: 'Primary navigation'
	},

	leftrail: {
		ariaLabel: 'Navigation',
		viewsHeading: 'Views',
		trackersHeading: 'Categories',
		planningHeading: 'Planning',
		filtersHeading: 'Filters',
		view: {
			list: 'List',
			kanban: 'Kanban',
			gantt: 'Gantt',
			graph: 'Graph',
			backlog: 'Backlog',
			sprint: 'Sprint Planner'
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
			`${params.n} ${params.n === 1 ? 'file' : 'files'} modified outside quill.md — review before saving.`,
		editorWarning:
			'This file was modified outside quill.md. Review the contents before saving — id, relations, and section markers may have drifted.',
		dismissAria: 'Dismiss integrity warning'
	},

	home: {
		heroTitle: 'quill.md',
		heroSubtitle: 'Items that travel with your repo',
		chooseModeAria: 'Choose a mode',
		openLocalTitle: 'Open a local folder',
		openLocalBody:
			'Pick a folder on your machine to edit items stored under .quill.md/. Requires a Chromium-based browser.',
		openLocalButton: 'Open local folder',
		openRemoteTitle: 'Browse a remote repository',
		openRemoteBody: 'Read-only access to items hosted on any Git provider.',
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
				body: 'Open a folder on your machine that already has (or will hold) a .quill.md/ directory.'
			},
			browse: {
				title: 'Browse your items',
				body: 'See the list, kanban, or gantt view of every item the folder holds. Filter, search, and open one to read it.'
			},
			edit: {
				title: 'Edit and save',
				body: 'Change a title, tweak a status, or write a new section. Saves go straight to disk in the same folder you picked.'
			}
		}
	},

	localToolbar: {
		newIssue: '+ New',
		importIssue: 'Import .md',
		importIssueFailed: (params: Params) => `Failed to import: ${params.msg}`,
		refresh: '↻ Refresh',
		refreshReadOnlyTooltip: 'Read-only — sign out to edit locally',
		trashButton: (params: Params) => `Trash (${params.n})`,
		trashEmptyLabel: 'Empty',
		trashAria: (params: Params) =>
			`Trash contains ${params.n} ${params.n === 1 ? 'file' : 'files'}. Click to empty.`
	},

	remoteToolbar: {
		view: (params: Params) => `${params.n} ${params.n === 1 ? 'item' : 'items'} (read-only)`,
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
		title: 'New item',
		closeAria: 'Close new-item dialog',
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
			`This will permanently delete ${params.n} ${params.n === 1 ? 'file' : 'files'} from .quill.md/.trash/. This cannot be undone.`,
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
		deleteTooltip: 'Move to trash',
		unsaved: 'Unsaved changes',
		footerClose: 'Close'
	},

	formFields: {
		issueTypeDisabledNote:
			'Item type cannot be changed after creation — create a new one instead.',
		assigneePlaceholder: 'Unassigned',
		selectPlaceholder: 'Select…',
		noIssues: 'No items',
		changeTypeTitle: 'Change item type?',
		changeTypeBody: (params: Params) =>
			`Switching from "${params.old}" to "${params.new}" will reload the editor with the new template. Unsaved changes will be lost.`,
		changeTypeConfirm: 'Change type',
		changeTypeCancel: 'Cancel',
		changeTypeAria: (params: Params) => `Confirm change from ${params.old} to ${params.new}`,
		relationTypes: {
			parent: 'Parent',
			child: 'Child',
			blocks: 'Blocks',
			depends_on: 'Depends On',
			relates_to: 'Relates To'
		},
		addRelation: 'Add relation',
		removeRelationAria: 'Remove relation'
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
		languageHeading: 'Language',
		languageEn: 'English',
		languageEs: 'Español',
		corsHeading: 'CORS proxy',
		corsPlaceholder: '(not configured)',
		corsNote: 'Editing this value requires re-saving your config.json. Coming in a follow-up.',
		recentHeading: 'Recent folders',
		commandsHeading: 'Commands',
		clearCache: 'Clear remote cache',
		clearCacheBusy: 'Clearing…',
		clearCacheDone: 'Cache cleared. The next refresh will re-fetch the subtree.',
		clearCacheError: (params: Params) => `Failed to clear cache: ${params.message}`,
		clearCacheRemoteTooltip: 'Clear the cached remote clone for this repository',
		clearCacheSignInTooltip: 'Sign in to a remote repository to enable this',
		emptyTrash: (params: Params) => `Empty trash${Number(params.n) > 0 ? ` (${params.n})` : ''}`,
		emptyTrashLocalTooltip: 'Empty the local .quill.md/.trash/ folder',
		emptyTrashSignInTooltip: 'Open a local folder to enable this',
		templatesHeading: 'Categories (Templates)',
		newTemplate: '+ New'
	},

	list: {
		countPill: (params: Params) =>
			`${params.filtered} of ${params.total} ${params.total === 1 ? 'item' : 'items'}`,
		sortLabel: (params: Params) => `Sort: ${params.key} (${params.dir})`,
		rowAria: (params: Params) => `Open item ${params.id}: ${params.title}`,
		empty: 'No items match the current filter.',
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
		cardAria: (params: Params) => `Item ${params.id}: ${params.title} in column ${params.col}`,
		readOnlyTooltip: 'Read-only — open this item locally to change its status',
		pickedUp: (params: Params) =>
			`Picked up item ${params.id}. Use arrow keys to move, Space or Enter to drop, Escape to cancel.`,
		dropped: (params: Params) => `Dropped item ${params.id} in column ${params.col}`,
		cancelled: (params: Params) => `Cancelled move of item ${params.id}.`,
		activateHint: 'Press F2 to open the editor'
	},

	gantt: {
		emptyTitle: 'No items are scheduled yet',
		emptyBody: 'Add start and end dates to items in the Editor to see them on the Gantt.',
		ariaLabel: 'Gantt timeline',
		roleDescription: 'gantt timeline',
		barAria: (params: Params) => `Item ${params.id}: ${params.title}`,
		barDescription: (params: Params) =>
			`Status ${params.status}, type ${params.type}, group ${params.group}. ` +
			`Starts ${params.start ?? 'unknown'}, ` +
			(params.end ? `ends ${params.end}.` : `duration ${params.duration ?? '?'} days.`),
		truncation: '…',
		fallbackSummary: 'Textual fallback (NFR-4 accessibility)',
		fallbackEmpty: 'No items match the current filter.',
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
		headTitle: 'Set up your tracker',
		headBody:
			'Your folder does not have a .quill.md/ configuration yet. Pick a path below to get started. You can edit or add templates later from the Settings panel.',
		step1Title: '1. Choose how to set up templates',
		step2Title: '2. Pick a framework preset',
		step2Body:
			'Select one of the 20 industry-standard frameworks. The preset will install the complete set of categories and statuses.',
		builtinTitle: 'Use a framework preset',
		builtinBody:
			'Pick from state-of-the-art agile frameworks like Scrum, Kanban, XP, or SAFe. Recommended for most projects.',
		builtinAria: 'Use a framework preset',
		customTitle: 'Create your own',
		customBody:
			'Author your own category from scratch using the Visual Editor. Define the icons, colors, and fields you need.',
		customAria: 'Create your own templates',
		customTooltip: 'Coming soon — the in-app template editor is a future step',
		applyButton: 'Apply and continue',
		applyTooltip: 'Write the selected framework to .quill.md/',
		applyTooltipDisabled: 'Select a framework preset to continue',
		applying: 'Applying…',
		cancel: 'Cancel',
		noFolder: 'No local folder is open. Use "Open local folder" on the home page.',
		applyError: (params: Params) => `Failed to write the wizard setup: ${params.msg}`,
		selectFrameworkAria: (params: Params) => `Select framework ${params.name}`,
		frameworkIncludes: (params: Params) => `Includes ${params.templates} templates · ${params.statuses} statuses`
	},
	sprint: {
		progress: 'Sprint Progress',
		stories: 'Stories',
		points: 'Story Points',
		progressLabel: 'Progress',
		pointsUnit: 'pts'
	},
	backlogView: {
		tabEpic: 'By Epic',
		tabUseCase: 'By Use Case',
		unparented: 'Unclassified Stories',
		noStories: 'No stories in this group.'
	},
	sprintPlanner: {
		selectSprint: 'Select a Sprint to plan',
		unlink: 'Unlink',
		linkStory: 'Link Story',
		noUnassigned: 'All user stories are assigned to Sprints!',
		unassignedHeader: 'Unassigned User Stories',
		storiesInSprint: 'Stories in Sprint',
		noSprints: 'No Sprints created yet. Create a Sprint item to start planning!',
		emptySprint: 'This sprint has no stories. Link some below!',
		readyToPlan: 'Ready to Plan',
		needsRefinement: 'Requires Refinement (Missing Epic)',
		linkDisabledTooltip:
			'This story must be linked to an Epic before it can be assigned to a Sprint.'
	},
	templateEditor: {
		preview: 'Preview',
		unnamed: 'Unnamed Category',
		fieldsBadge: 'Fields',
		basicInfo: 'Basic Info',
		nameLabel: 'Category Name',
		idLabel: 'System ID',
		idHint: 'Unique identifier on disk (lowercase and hyphens only).',
		appearance: 'Visual Appearance',
		icon: 'Representative Icon',
		color: 'Accent Color',
		customColor: 'Custom Color',
		fieldsTitle: 'Data Fields',
		fieldsSubtitle: 'Specific attributes you want to track for this item type.',
		addField: 'Add Field',
		fieldName: 'Field Name',
		fieldType: 'Data Type',
		required: 'Required',
		key: 'Key',
		options: 'Selector Options',
		optionsHint: 'Enter options separated by comma.',
		noFields: 'You have not added any dynamic fields yet.',
		sectionsTitle: 'Content Blocks',
		sectionsSubtitle: 'Long text sections or descriptions that make up the item.',
		addSection: 'Add Section',
		types: {
			text: 'Short Text',
			longtext: 'Long Text',
			date: 'Date',
			number: 'Number',
			select: 'Single Select',
			'multi-select': 'Multi Select',
			user: 'User',
			relations: 'Relations'
		},
		typesHelp: 'Data types information',
		typesHelpText:
			'• Short Text: For names or brief titles.\n• Long Text: For extensive descriptions or details.\n• Date: Calendar picker.\n• Number: Quantities, estimates or metrics.\n• Single/Multi Select: Predefined labels and categories.\n• User: Assign to team members.\n• Relations: Blockers or dependencies with other items.',
		basicHelp: 'What is basic info?',
		basicHelpText: 'The Name is what you see in the UI (e.g. "Use Case"). The System ID is the unique identifier on disk; it is used internally and should not change once created.',
		appearanceHelp: 'What is appearance for?',
		appearanceHelpText: 'The icon and color will visually identify items of this category across the Kanban boards, Gantt charts, and lists.',
		fieldsHelp: 'What are data fields?',
		fieldsHelpText: 'Fields are specific properties (metadata) you want to track for this item (e.g. Priority, Story Points, or Due Date). They will appear on the right sidebar of the item.',
		sectionsHelp: 'What are content blocks?',
		sectionsHelpText: 'These are the main free-text Markdown areas. Useful for sections like "Acceptance Criteria", "Context" or "Steps to reproduce". They will appear in the main body of the item.',
		loadExample: 'Load Sample Example',
		example: {
			name: 'Critical Incident',
			f1: 'Priority',
			f2: 'Event Date',
			f3: 'Reported By',
			f4: 'Affected Systems',
			s1: 'Failure Description',
			s2: 'Steps to Reproduce',
			s3: 'Mitigation Plan'
		},
		relationsConfig: 'Relation Constraints',
		allowedTargets: 'Allowed Categories',
		allowedTargetsHint: 'If none are checked, linking with any item will be allowed.',
		allowedRelationTypes: 'Allowed Relation Types',
		allowedRelationTypesHint: 'If none are checked, all types (Parent, Child, Blocks, etc.) will be allowed.'
	}
};

export type Translations = typeof en;
