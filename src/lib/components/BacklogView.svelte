<script lang="ts">
	import { getStores } from '$lib/state';
	import { t } from '$lib/ui/strings';
	import { Badge, Card } from '$lib/ui';
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import FileText from '@lucide/svelte/icons/file-text';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';

	const { issues, editor } = getStores();

	type GroupTab = 'epic' | 'use-case';
	let activeTab = $state<GroupTab>('epic');

	// List of all issues
	const allIssues = $derived(issues.issues.map((li) => li.issue));

	// Grouping logic for Epics
	const epics = $derived(allIssues.filter((i) => i.fields.issueType === 'epic'));
	// Grouping logic for Use Cases
	const useCases = $derived(allIssues.filter((i) => i.fields.issueType === 'use-case'));
	// List of User Stories
	const stories = $derived(allIssues.filter((i) => i.fields.issueType === 'user-story'));

	// Helper to find stories linked to an Epic
	function getEpicStories(epicId: number) {
		return stories.filter((story) => {
			const linksToEpic = story.fields.relations.some((r) => r.id === epicId);
			const epicLinksToStory = epics
				.find((e) => e.id === epicId)
				?.fields.relations.some((r) => r.id === story.id);
			return linksToEpic || epicLinksToStory;
		});
	}

	// Helper to find stories linked to a Use Case
	function getUseCaseStories(useCaseId: number) {
		return stories.filter((story) => {
			const linksToUseCase = story.fields.relations.some((r) => r.id === useCaseId);
			const useCaseLinksToStory = useCases
				.find((uc) => uc.id === useCaseId)
				?.fields.relations.some((r) => r.id === story.id);
			return linksToUseCase || useCaseLinksToStory;
		});
	}

	// Unparented stories (not linked to any Epic or Use Case)
	const unparentedStories = $derived(
		stories.filter((story) => {
			const hasEpicParent = epics.some((epic) => {
				const linksToEpic = story.fields.relations.some((r) => r.id === epic.id);
				const epicLinksToStory = epic.fields.relations.some((r) => r.id === story.id);
				return linksToEpic || epicLinksToStory;
			});
			const hasUseCaseParent = useCases.some((uc) => {
				const linksToUseCase = story.fields.relations.some((r) => r.id === uc.id);
				const useCaseLinksToStory = uc.fields.relations.some((r) => r.id === story.id);
				return linksToUseCase || useCaseLinksToStory;
			});
			return !hasEpicParent && !hasUseCaseParent;
		})
	);

	function openIssue(id: number): void {
		editor.open(id);
	}
</script>

<div class="flex flex-col gap-6 p-6">
	<!-- Tab Bar -->
	<div class="flex items-center gap-4 border-b border-border">
		<button
			type="button"
			class="-mb-[1px] cursor-pointer border-b-2 px-4 py-2 font-sans text-sm font-semibold transition-colors {activeTab ===
			'epic'
				? 'border-primary text-primary'
				: 'border-transparent text-muted-foreground hover:text-foreground'}"
			onclick={() => (activeTab = 'epic')}
		>
			{t('backlogView.tabEpic')}
		</button>
		<button
			type="button"
			class="-mb-[1px] cursor-pointer border-b-2 px-4 py-2 font-sans text-sm font-semibold transition-colors {activeTab ===
			'use-case'
				? 'border-primary text-primary'
				: 'border-transparent text-muted-foreground hover:text-foreground'}"
			onclick={() => (activeTab = 'use-case')}
		>
			{t('backlogView.tabUseCase')}
		</button>
	</div>

	<!-- Backlog Tree Content -->
	<div class="flex flex-col gap-6">
		{#if activeTab === 'epic'}
			{#each epics as epic (epic.id)}
				{@const related = getEpicStories(epic.id)}
				<Card class="transition-all duration-[var(--motion-base)] hover:border-primary/30">
					<div class="flex flex-col gap-4">
						<!-- Epic Header -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							onclick={() => openIssue(epic.id)}
							class="flex cursor-pointer items-center justify-between border-b border-border/40 pb-3 hover:opacity-85"
						>
							<div class="flex items-center gap-2">
								<span class="rounded bg-primary/10 p-1.5 text-primary">
									<FolderOpen class="h-4 w-4" />
								</span>
								<h3 class="font-display font-semibold text-foreground">
									#{epic.id} · {epic.fields.title}
								</h3>
							</div>
							<Badge variant="primary" size="sm">{epic.fields.status}</Badge>
						</div>

						<!-- Stories List -->
						<div class="flex flex-col gap-2">
							{#if related.length === 0}
								<p class="px-2 text-xs text-muted-foreground italic">
									{t('backlogView.noStories')}
								</p>
							{:else}
								{#each related as story (story.id)}
									<!-- svelte-ignore a11y_click_events_have_key_events -->
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div
										onclick={() => openIssue(story.id)}
										class="bg-surface-dark/20 hover:bg-surface-dark/40 flex cursor-pointer items-center justify-between rounded-lg border border-border/40 px-3 py-2 transition-all duration-[var(--motion-fast)] hover:border-primary/20"
									>
										<div class="flex items-center gap-2 truncate">
											<BookOpen class="h-3.5 w-3.5 shrink-0 text-primary/70" />
											<span class="shrink-0 text-xs font-semibold text-muted-foreground"
												>#{story.id}</span
											>
											<span class="truncate text-sm text-foreground">{story.fields.title}</span>
										</div>
										<div class="flex items-center gap-3">
											{#if story.customFields.story_points}
												<span
													class="rounded bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground"
												>
													{story.customFields.story_points}
													{t('sprint.pointsUnit')}
												</span>
											{/if}
											{#if story.customFields.priority}
												<span
													class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase {story
														.customFields.priority === 'alta' ||
													story.customFields.priority === 'high'
														? 'bg-error/15 text-error'
														: story.customFields.priority === 'media' ||
															  story.customFields.priority === 'medium'
															? 'bg-warning/15 text-warning'
															: 'bg-muted text-muted-foreground'}"
												>
													{story.customFields.priority}
												</span>
											{/if}
											<span
												class="rounded bg-success/15 px-2 py-0.5 text-xs font-semibold text-success"
											>
												{story.fields.status}
											</span>
											<ChevronRight class="h-4 w-4 text-muted-foreground/50" />
										</div>
									</div>
								{/each}
							{/if}
						</div>
					</div>
				</Card>
			{/each}
		{:else}
			{#each useCases as uc (uc.id)}
				{@const related = getUseCaseStories(uc.id)}
				<Card class="transition-all duration-[var(--motion-base)] hover:border-primary/30">
					<div class="flex flex-col gap-4">
						<!-- Use Case Header -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							onclick={() => openIssue(uc.id)}
							class="flex cursor-pointer items-center justify-between border-b border-border/40 pb-3 hover:opacity-85"
						>
							<div class="flex items-center gap-2">
								<span class="rounded bg-primary/10 p-1.5 text-primary">
									<FileText class="h-4 w-4" />
								</span>
								<h3 class="font-display font-semibold text-foreground">
									#{uc.id} · {uc.fields.title}
								</h3>
							</div>
							<Badge variant="primary" size="sm">{uc.fields.status}</Badge>
						</div>

						<!-- Stories List -->
						<div class="flex flex-col gap-2">
							{#if related.length === 0}
								<p class="px-2 text-xs text-muted-foreground italic">
									{t('backlogView.noStories')}
								</p>
							{:else}
								{#each related as story (story.id)}
									<!-- svelte-ignore a11y_click_events_have_key_events -->
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div
										onclick={() => openIssue(story.id)}
										class="bg-surface-dark/20 hover:bg-surface-dark/40 flex cursor-pointer items-center justify-between rounded-lg border border-border/40 px-3 py-2 transition-all duration-[var(--motion-fast)] hover:border-primary/20"
									>
										<div class="flex items-center gap-2 truncate">
											<BookOpen class="h-3.5 w-3.5 shrink-0 text-primary/70" />
											<span class="shrink-0 text-xs font-semibold text-muted-foreground"
												>#{story.id}</span
											>
											<span class="truncate text-sm text-foreground">{story.fields.title}</span>
										</div>
										<div class="flex items-center gap-3">
											{#if story.customFields.story_points}
												<span
													class="rounded bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground"
												>
													{story.customFields.story_points}
													{t('sprint.pointsUnit')}
												</span>
											{/if}
											{#if story.customFields.priority}
												<span
													class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase {story
														.customFields.priority === 'alta' ||
													story.customFields.priority === 'high'
														? 'bg-error/15 text-error'
														: story.customFields.priority === 'media' ||
															  story.customFields.priority === 'medium'
															? 'bg-warning/15 text-warning'
															: 'bg-muted text-muted-foreground'}"
												>
													{story.customFields.priority}
												</span>
											{/if}
											<span
												class="rounded bg-success/15 px-2 py-0.5 text-xs font-semibold text-success"
											>
												{story.fields.status}
											</span>
											<ChevronRight class="h-4 w-4 text-muted-foreground/50" />
										</div>
									</div>
								{/each}
							{/if}
						</div>
					</div>
				</Card>
			{/each}
		{/if}

		<!-- Unclassified Stories Section -->
		{#if unparentedStories.length > 0}
			<Card
				class="border-dashed border-border transition-all duration-[var(--motion-base)] hover:border-primary/30"
			>
				<div class="flex flex-col gap-4">
					<div class="flex items-center gap-2 border-b border-border/40 pb-3">
						<span class="rounded bg-muted p-1.5 text-muted-foreground">
							<AlertTriangle class="h-4 w-4" />
						</span>
						<h3 class="font-display font-semibold text-muted-foreground">
							{t('backlogView.unparented')}
						</h3>
					</div>

					<div class="flex flex-col gap-2">
						{#each unparentedStories as story (story.id)}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								onclick={() => openIssue(story.id)}
								class="bg-surface-dark/20 hover:bg-surface-dark/40 flex cursor-pointer items-center justify-between rounded-lg border border-border/40 px-3 py-2 transition-all duration-[var(--motion-fast)] hover:border-primary/20"
							>
								<div class="flex items-center gap-2 truncate">
									<BookOpen class="h-3.5 w-3.5 shrink-0 text-primary/70" />
									<span class="shrink-0 text-xs font-semibold text-muted-foreground"
										>#{story.id}</span
									>
									<span class="truncate text-sm text-foreground">{story.fields.title}</span>
								</div>
								<div class="flex items-center gap-3">
									{#if story.customFields.story_points}
										<span
											class="rounded bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground"
										>
											{story.customFields.story_points}
											{t('sprint.pointsUnit')}
										</span>
									{/if}
									{#if story.customFields.priority}
										<span
											class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase {story
												.customFields.priority === 'alta' || story.customFields.priority === 'high'
												? 'bg-error/15 text-error'
												: story.customFields.priority === 'media' ||
													  story.customFields.priority === 'medium'
													? 'bg-warning/15 text-warning'
													: 'bg-muted text-muted-foreground'}"
										>
											{story.customFields.priority}
										</span>
									{/if}
									<span
										class="rounded bg-success/15 px-2 py-0.5 text-xs font-semibold text-success"
									>
										{story.fields.status}
									</span>
									<ChevronRight class="h-4 w-4 text-muted-foreground/50" />
								</div>
							</div>
						{/each}
					</div>
				</div>
			</Card>
		{/if}
	</div>
</div>
