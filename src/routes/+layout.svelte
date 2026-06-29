<script lang="ts">
	// Must be the first import of the script block — guarantees
	// `globalThis.Buffer` is defined before `isomorphic-git`'s sub-modules
	// evaluate. See `src/lib/polyfills/buffer.ts` for the rationale and
	// `docs/audits/2026-06-23/architecture-audit.md:353` for the audit
	// finding this closes.
	import '$lib/polyfills/buffer';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import AppShell from '$lib/components/AppShell.svelte';
	import type { ShellMode } from '$lib/components/TopBar.svelte';
	import { t } from '$lib/ui/strings';
	import {
		createConfigStore,
		createEditorStore,
		createFilterStore,
		createIssuesStore,
		createModeStore,
		createStateContext,
		createTemplatesStore,
		createThemeStore,
		createViewStore,
		setStores
	} from '$lib/state';
	import { handleStore, LocalFsAdapter } from '$lib/adapters';
	import type {
		ReadOnlyDirectoryAdapter,
		WritableDirectoryAdapter
	} from '$lib/adapters/directory-adapter';
	import { isFsaAvailable } from '$lib/adapters/feature-detect';

	let { children } = $props();

	// Stores are instantiated per mount. The `modeStore` is constructed
	// first because every data store needs an adapter provider that
	// routes through the active mode. The `config` + `templates` stores
	// feed the `issues` store's validation context, and the `editor` store
	// sits on top of `issues`.
	const ctx = createStateContext(
		// The seed adapter is irrelevant — `modeStore.openLocalFolder`
		// replaces `ctx.adapter` once a folder handle is bound. We
		// supply a dummy `DirectoryAdapter` shim to satisfy the type.
		{
			readTextFile: () => Promise.reject(new Error('No folder bound')),
			listDirectory: () => Promise.reject(new Error('No folder bound')),
			writeTextFile: () => Promise.reject(new Error('No folder bound')),
			removeFile: () => Promise.reject(new Error('No folder bound')),
			moveFile: () => Promise.reject(new Error('No folder bound'))
		},
		new AbortController().signal
	);
	const mode = createModeStore(ctx, {
		handles: handleStore,
		createLocalAdapter: (handle) =>
			// `LocalFsAdapter`'s constructor is private; use the static
			// factory `LocalFsAdapter.fromHandle` (set up below) to keep
			// the pick-vs-bind seam visible at the call site.
			LocalFsAdapter.fromHandle(handle)
	});
	// Adapter provider that resolves to the active adapter (local or
	// remote). The return type is the union of `WritableDirectoryAdapter |
	// ReadOnlyDirectoryAdapter | null` so the read-only remote adapter is
	// not dishonestly cast to the writable shape. Local Mode returns the
	// FSA-backed writable adapter; Remote Mode returns the
	// isomorphic-git-backed read-only adapter; on the home screen (no
	// folder / no remote open) the provider returns `null` and the data
	// stores stay in their 'idle' status.
	const adapterProvider = (): WritableDirectoryAdapter | ReadOnlyDirectoryAdapter | null => {
		return mode.localAdapter ?? mode.remoteAdapter ?? null;
	};
	const config = createConfigStore(adapterProvider);
	const templates = createTemplatesStore(adapterProvider);
	const issues = createIssuesStore(adapterProvider, { config, templates });
	const editor = createEditorStore({ issues, config, templates });
	const filter = createFilterStore();
	const view = createViewStore();
	const theme = createThemeStore();

	setStores({ mode, config, templates, issues, editor, filter, view, theme });

	// The wizard route has its own standalone layout; the chrome that
	// wraps every other page reads the current pathname and forwards a
	// `ShellMode` to AppShell. The store's `mode.mode` only distinguishes
	// home / local / remote; wizard detection is URL-based.
	const currentMode = $derived<ShellMode>(
		$page.url.pathname.startsWith('/wizard') ? 'wizard' : mode.mode
	);

	// Bootstrap the mode + theme on mount. `mode.bootstrap()` restores the
	// last folder handle from IndexedDB; `theme` reads localStorage.
	// Both are no-ops on the server / in tests.
	onMount(async () => {
		if (!isFsaAvailable()) return;
		// The no-flash theme class is set by the inline script in
		// `app.html` before the first paint. The line below is a
		// safety net for the rare case where the inline script
		// throws (private mode with a locked-down `localStorage`,
		// for example); idempotent with the inline script.
		document.documentElement.classList.toggle('dark', theme.theme === 'dark');
		try {
			await mode.bootstrap();
			if (mode.localAdapter) {
				await Promise.all([config.load(), templates.load()]);
				await issues.load();
			} else if (mode.remoteAdapter) {
				await Promise.all([config.load(), templates.load()]);
				await issues.load();
			}
		} catch (cause) {
			console.error('[nomad-md] bootstrap failed:', cause);
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>{t('app.name')}</title>
</svelte:head>

<AppShell mode={currentMode}>
	{@render children()}
</AppShell>
