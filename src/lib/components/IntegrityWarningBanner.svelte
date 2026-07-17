<!--
	IntegrityWarningBanner — global banner that surfaces
	`issuesStore.integrityWarnings` across every surface that owns an
	editor (sub-phase 6C, FR-15).

	Behaviour:
	  - Reads `issuesStore.integrityWarnings`. Renders nothing when the
	    list is empty.
	  - Renders a `role="alert"` banner with the count, a "Review" link
	    that opens the first affected issue in the editor, and a dismiss
	    button.
	  - Dismissal is per-mount, not persisted (the same pattern as
	    `ProxyWarningBanner`).
	  - The banner lives at the top of the main canvas (not the top bar)
	    so the global chrome stays focused; this banner is per-mode
	    concern. It is mounted by `AppShell` once per shell, not per page.

	Why a global component and not just inside `EditorPanel.svelte`:
	the existing per-editor warning only fires when an issue is open.
	An integrity warning on an issue that the user has not yet opened
	is still a problem (the issue file drifted on disk and we want to
	flag it). The global banner surfaces the count and the "Review"
	affordance before the user navigates into the editor.
-->
<script lang="ts">
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import { t } from '$lib/ui/strings';
	import { getStores } from '$lib/state';

	const { issues, editor } = getStores();

	const warnings = $derived(issues.integrityWarnings);
	const count = $derived(warnings.length);
	const firstAffectedId = $derived(count > 0 ? (warnings[0]?.issue.id ?? null) : null);

	let acknowledged = $state(false);

	function review(): void {
		if (firstAffectedId !== null) {
			editor.open(firstAffectedId);
		}
		acknowledged = true;
	}

	function dismiss(): void {
		acknowledged = true;
	}
</script>

{#if count > 0 && !acknowledged && firstAffectedId !== null}
	<div
		role="alert"
		data-testid="integrity-warning-banner"
		class="flex items-start gap-4 border-b border-error bg-error/10 px-6 py-4 text-foreground"
	>
		<AlertTriangle class="h-5 w-5 shrink-0 text-error" aria-hidden="true" />
		<span class="mt-0.5 flex-1 font-sans text-sm">{t('integrity.bannerBody', { n: count })}</span>
		<div class="flex items-center gap-2">
			<button
				type="button"
				class="text-xs font-semibold tracking-wider text-error uppercase transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
				onclick={review}
			>
				{t('common.review')}
			</button>
			<button
				type="button"
				class="ml-4 shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
				aria-label={t('integrity.dismissAria')}
				onclick={dismiss}
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					></path></svg
				>
			</button>
		</div>
	</div>
{/if}
