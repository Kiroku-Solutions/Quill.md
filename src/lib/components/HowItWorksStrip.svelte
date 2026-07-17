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
		class="text-center text-[11px] font-bold tracking-widest text-muted-foreground uppercase"
	>
		{t('home.howItWorks.title')}
	</h2>
	<ol class="grid grid-cols-1 gap-6 md:grid-cols-3" role="list">
		<li
			class="flex flex-col gap-3 rounded-xl border border-border bg-background p-6 shadow-sm transition-shadow duration-[var(--motion-base)] hover:shadow-[var(--shadow-soft)]"
		>
			<div class="w-fit rounded-lg bg-primary/10 p-2 text-primary">
				<FolderPlus class="h-5 w-5" aria-hidden="true" />
			</div>
			<h3 class="text-base font-semibold text-foreground">
				{t('home.howItWorks.pickFolder.title')}
			</h3>
			<p class="text-sm text-muted-foreground">
				{t('home.howItWorks.pickFolder.body')}
			</p>
		</li>
		<li
			class="flex flex-col gap-3 rounded-xl border border-border bg-background p-6 shadow-sm transition-shadow duration-[var(--motion-base)] hover:shadow-[var(--shadow-soft)]"
		>
			<div class="w-fit rounded-lg bg-primary/10 p-2 text-primary">
				<LayoutList class="h-5 w-5" aria-hidden="true" />
			</div>
			<h3 class="text-base font-semibold text-foreground">{t('home.howItWorks.browse.title')}</h3>
			<p class="text-sm text-muted-foreground">
				{t('home.howItWorks.browse.body')}
			</p>
		</li>
		<li
			class="flex flex-col gap-3 rounded-xl border border-border bg-background p-6 shadow-sm transition-shadow duration-[var(--motion-base)] hover:shadow-[var(--shadow-soft)]"
		>
			<div class="w-fit rounded-lg bg-primary/10 p-2 text-primary">
				<PencilLine class="h-5 w-5" aria-hidden="true" />
			</div>
			<h3 class="text-base font-semibold text-foreground">{t('home.howItWorks.edit.title')}</h3>
			<p class="text-sm text-muted-foreground">
				{t('home.howItWorks.edit.body')}
			</p>
		</li>
	</ol>
</section>
