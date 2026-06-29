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
		class="flex items-center gap-3 border-b border-warning/40 bg-warning/10 px-4 py-2 text-sm"
	>
		<AlertTriangle class="h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
		<span class="flex-1">{t('integrity.bannerBody', { n: count })}</span>
		<button
			type="button"
			class="btn btn-sm btn-ghost focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
			onclick={review}
		>
			{t('common.review')}
		</button>
		<button
			type="button"
			class="btn btn-sm btn-ghost focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
			aria-label={t('integrity.dismissAria')}
			onclick={dismiss}
		>
			{t('common.dismiss')}
		</button>
	</div>
{/if}
