<!--
	HowItWorksStrip.svelte — 3-step onboarding strip for first-time users
	(sub-phase 6D, ERS §4.1.2 footnote).

	Rendered by the home page when there are no recent folders. The
	parent decides whether to mount this surface; the component itself
	has no internal "empty?" check.

	Layout: 1-column on mobile, 3-column on `md:`. The brief allows
	either an absolutely-positioned connector line OR relying on the
	grid gap; v0 relies on the gap. The design call is documented in
	the post-implementation report.

	ERS coverage: §4.1.2 (home screen first-time user copy).
-->
<script lang="ts">
	import FolderPlus from '@lucide/svelte/icons/folder-plus';
	import LayoutList from '@lucide/svelte/icons/layout-list';
	import PencilLine from '@lucide/svelte/icons/pencil-line';
	import { t } from '$lib/ui/strings';
</script>

<section
	data-testid="how-it-works"
	aria-labelledby="how-it-works-title"
	class="flex flex-col gap-3"
>
	<h2
		id="how-it-works-title"
		class="text-xs font-semibold uppercase tracking-wide text-base-content/70"
	>
		{t('home.howItWorks.title')}
	</h2>
	<ol class="grid grid-cols-1 gap-4 md:grid-cols-3" role="list">
		<li class="flex flex-col gap-2 rounded-lg border border-base-300 bg-base-100 p-4">
			<FolderPlus class="h-6 w-6 text-primary" aria-hidden="true" />
			<h3 class="text-sm font-semibold">{t('home.howItWorks.pickFolder.title')}</h3>
			<p class="text-xs opacity-70">
				{t('home.howItWorks.pickFolder.body')}
			</p>
		</li>
		<li class="flex flex-col gap-2 rounded-lg border border-base-300 bg-base-100 p-4">
			<LayoutList class="h-6 w-6 text-primary" aria-hidden="true" />
			<h3 class="text-sm font-semibold">{t('home.howItWorks.browse.title')}</h3>
			<p class="text-xs opacity-70">
				{t('home.howItWorks.browse.body')}
			</p>
		</li>
		<li class="flex flex-col gap-2 rounded-lg border border-base-300 bg-base-100 p-4">
			<PencilLine class="h-6 w-6 text-primary" aria-hidden="true" />
			<h3 class="text-sm font-semibold">{t('home.howItWorks.edit.title')}</h3>
			<p class="text-xs opacity-70">
				{t('home.howItWorks.edit.body')}
			</p>
		</li>
	</ol>
</section>
