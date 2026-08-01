/**
 * UI store — pure, in-memory booleans for the two transient chrome
 * panels (settings modal, issue editor).
 *
 * Reactivity: both slots are Svelte 5 `$state` slots. Consumers reading
 * `store.settingsOpen` / `store.editorOpen` get fine-grained reactivity
 * for free. Toggling is sync — no async, no filesystem, no PAT, no
 * adapter.
 *
 * Why a store at all? The Settings and Editor panels are mounted in
 * distinct parts of the tree (`AppShell` vs the issue list). Without a
 * shared store, the two would either:
 *  - Lift state to the layout and prop-drill (no — settings can be
 *    opened from any view, including nested layouts).
 *  - Reach for a custom event bus (no — the project already standardises
 *    on store-based communication in `src/lib/state/`).
 *
 * A two-flag store is the smallest surface that does the job. The
 * factory takes no dependencies and is created once per app mount
 * alongside the rest of the store graph.
 *
 * Behaviour:
 *  - Defaults to `false` on both slots — the panels start closed.
 *  - `open*` / `close*` / `toggle*` are idempotent setters. Toggling
 *    while the panel is already open calls `close`, and vice versa.
 *    No-op reads/writes don't flip state machine status (there is no
 *    status — these are not async resources).
 *  - Settings and Editor are independent — opening one does not close
 *    the other. The layout's chrome stacks them and shows the most
 *    recently opened on top.
 */
export interface UiStore {
	readonly settingsOpen: boolean;
	readonly editorOpen: boolean;
	readonly openSettings: () => void;
	readonly closeSettings: () => void;
	readonly toggleSettings: () => void;
	readonly openEditor: () => void;
	readonly closeEditor: () => void;
	readonly toggleEditor: () => void;
	readonly mobileNavOpen: boolean;
	readonly openMobileNav: () => void;
	readonly closeMobileNav: () => void;
	readonly toggleMobileNav: () => void;
	readonly sidebarCollapsed: boolean;
	readonly toggleSidebarCollapsed: () => void;
}

/**
 * Build a {@link UiStore}. Pure factory — no module-level state.
 */
export function createUiStore(): UiStore {
	let settingsOpen = $state<boolean>(false);
	let editorOpen = $state<boolean>(false);
	let mobileNavOpen = $state<boolean>(false);
	let sidebarCollapsed = $state<boolean>(false);

	function openSettings(): void {
		settingsOpen = true;
	}

	function closeSettings(): void {
		settingsOpen = false;
	}

	function toggleSettings(): void {
		settingsOpen = !settingsOpen;
	}

	function openEditor(): void {
		editorOpen = true;
	}

	function closeEditor(): void {
		editorOpen = false;
	}

	function toggleEditor(): void {
		editorOpen = !editorOpen;
	}

	function openMobileNav(): void {
		mobileNavOpen = true;
	}

	function closeMobileNav(): void {
		mobileNavOpen = false;
	}

	function toggleMobileNav(): void {
		mobileNavOpen = !mobileNavOpen;
	}

	function toggleSidebarCollapsed(): void {
		sidebarCollapsed = !sidebarCollapsed;
	}

	return {
		get settingsOpen() {
			return settingsOpen;
		},
		get editorOpen() {
			return editorOpen;
		},
		get mobileNavOpen() {
			return mobileNavOpen;
		},
		openSettings,
		closeSettings,
		toggleSettings,
		openEditor,
		closeEditor,
		toggleEditor,
		openMobileNav,
		closeMobileNav,
		toggleMobileNav,
		get sidebarCollapsed() {
			return sidebarCollapsed;
		},
		toggleSidebarCollapsed
	};
}
