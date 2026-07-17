<script lang="ts">
	import { getStores } from '$lib/state';
	import { t } from '$lib/ui/strings';
	import { Badge, Card } from '$lib/ui';
	import Milestone from '@lucide/svelte/icons/milestone';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Plus from '@lucide/svelte/icons/plus';
	import Minus from '@lucide/svelte/icons/minus';
	import Calendar from '@lucide/svelte/icons/calendar';
	import type { Issue } from '$lib/types';

	const { issues, editor, mode } = getStores();

	// List of all issues
	const allIssues = $derived(issues.issues.map((li) => li.issue));

	// Find Sprints
	const sprints = $derived(allIssues.filter((i) => i.issueType === 'sprint'));

	// Currently selected Sprint ID
	let selectedSprintId = $state<number | null>(null);

	// Auto-select first Sprint if none selected
	$effect(() => {
		if (selectedSprintId === null && sprints.length > 0) {
			selectedSprintId = sprints[0].id;
		}
	});

	const selectedSprint = $derived(sprints.find((s) => s.id === selectedSprintId) ?? null);

	// Find all user stories
	const allStories = $derived(allIssues.filter((i) => i.issueType === 'user-story'));

	// Find stories belonging to the selected Sprint
	const sprintStories = $derived.by(() => {
		if (!selectedSprint) return [];
		return allStories.filter((story) => {
			const linksToSprint = story.relations.some((r) => r.id === selectedSprint.id);
			const sprintLinksToStory = selectedSprint.relations.some((r) => r.id === story.id);
			return linksToSprint || sprintLinksToStory;
		});
	});

	const epics = $derived(allIssues.filter((i) => i.issueType === 'epic'));

	function hasEpicParent(story: Issue): boolean {
		return epics.some((epic) => {
			const linksToEpic = story.relations.some((r) => r.id === epic.id);
			const epicLinksToStory = epic.relations.some((r) => r.id === story.id);
			return linksToEpic || epicLinksToStory;
		});
	}

	// Filter unassigned stories that DO have an Epic parent (Ready to Plan)
	const unassignedStories = $derived(
		allStories.filter((story) => {
			if (!hasEpicParent(story)) return false;
			return !sprints.some((sprint) => {
				const linksToSprint = story.relations.some((r) => r.id === sprint.id);
				const sprintLinksToStory = sprint.relations.some((r) => r.id === story.id);
				return linksToSprint || sprintLinksToStory;
			});
		})
	);

	// Filter unassigned stories that DO NOT have an Epic parent (Requires Refinement)
	const refinementStories = $derived(
		allStories.filter((story) => {
			if (hasEpicParent(story)) return false;
			return !sprints.some((sprint) => {
				const linksToSprint = story.relations.some((r) => r.id === sprint.id);
				const sprintLinksToStory = sprint.relations.some((r) => r.id === story.id);
				return linksToSprint || sprintLinksToStory;
			});
		})
	);

	// Metrics for each Sprint (helper)
	function getSprintMetrics(sprint: Issue) {
		const related = allStories.filter((story) => {
			const linksToSprint = story.relations.some((r) => r.id === sprint.id);
			const sprintLinksToStory = sprint.relations.some((r) => r.id === story.id);
			return linksToSprint || sprintLinksToStory;
		});
		const count = related.length;
		const points = related.reduce((acc, story) => acc + (Number(story.estimate) || 0), 0);
		const completed = related.filter((s) => s.status === 'done' || s.status === 'closed').length;
		const progress = count > 0 ? Math.round((completed / count) * 100) : 0;
		return { count, points, progress };
	}

	const isWritable = $derived(mode.mode === 'local');

	async function linkStory(storyId: number) {
		if (!selectedSprint || !isWritable) return;
		const nextSprintRelations = [...selectedSprint.relations, { type: 'relates_to', id: storyId }];
		issues.update(selectedSprint.id, { relations: nextSprintRelations });
		await issues.save(selectedSprint.id);

		const story = allStories.find((s) => s.id === storyId);
		if (story) {
			const nextStoryRelations = [
				...story.relations,
				{ type: 'relates_to', id: selectedSprint.id }
			];
			issues.update(storyId, { relations: nextStoryRelations });
			await issues.save(storyId);
		}
	}

	async function unlinkStory(storyId: number) {
		if (!selectedSprint || !isWritable) return;
		const nextSprintRelations = selectedSprint.relations.filter((r) => r.id !== storyId);
		issues.update(selectedSprint.id, { relations: nextSprintRelations });
		await issues.save(selectedSprint.id);

		const story = allStories.find((s) => s.id === storyId);
		if (story) {
			const nextStoryRelations = story.relations.filter((r) => r.id !== selectedSprint.id);
			issues.update(storyId, { relations: nextStoryRelations });
			await issues.save(storyId);
		}
	}

	function openIssue(id: number): void {
		editor.open(id);
	}
</script>

<div class="flex h-full min-h-0 flex-col gap-6 p-6 md:flex-row">
	{#if sprints.length === 0}
		<div class="flex flex-1 flex-col items-center justify-center p-12 text-center">
			<Milestone class="mb-4 h-12 w-12 text-muted-foreground/40" />
			<h3 class="mb-2 text-lg font-semibold text-foreground">
				{t('sprintPlanner.noSprints')}
			</h3>
		</div>
	{:else}
		<!-- Left Column: Sprints List -->
		<div class="flex w-full shrink-0 flex-col gap-4 overflow-y-auto pr-2 md:w-80">
			{#each sprints as sprint (sprint.id)}
				{@const metrics = getSprintMetrics(sprint)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					onclick={() => (selectedSprintId = sprint.id)}
					class="cursor-pointer transition-all duration-[var(--motion-base)]"
				>
					<Card
						class="border-2 {selectedSprintId === sprint.id
							? 'border-primary bg-primary/5'
							: 'border-border/60 hover:border-primary/30'}"
					>
						<div class="flex flex-col gap-3">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<Milestone class="h-4 w-4 text-warning" />
									<h4 class="font-display text-sm font-semibold text-foreground">
										{sprint.title}
									</h4>
								</div>
								<Badge variant="primary" size="sm">{sprint.status}</Badge>
							</div>

							<div class="flex items-center gap-2 text-xs text-muted-foreground">
								<Calendar class="h-3.5 w-3.5" />
								<span>{sprint.startDate ?? '—'} · {sprint.endDate ?? '—'}</span>
							</div>

							<div class="mt-1 grid grid-cols-2 gap-2 border-t border-border/40 pt-2 text-xs">
								<div>
									<span class="text-muted-foreground">{t('sprint.stories')}:</span>
									<span class="ml-1 font-bold text-foreground">{metrics.count}</span>
								</div>
								<div>
									<span class="text-muted-foreground">{t('sprint.points')}:</span>
									<span class="ml-1 font-bold text-foreground"
										>{metrics.points} {t('sprint.pointsUnit')}</span
									>
								</div>
							</div>

							<!-- Mini Progress Bar -->
							<div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
								<div
									class="h-full bg-success transition-all duration-[var(--motion-base)]"
									style="width: {metrics.progress}%"
								></div>
							</div>
						</div>
					</Card>
				</div>
			{/each}
		</div>

		<!-- Right Column: Planner Workspace -->
		<div class="flex flex-1 flex-col gap-6 overflow-y-auto">
			{#if selectedSprint}
				{@const selectedMetrics = getSprintMetrics(selectedSprint)}
				<div class="flex flex-col gap-6">
					<!-- Header / Dashboard -->
					<div class="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
						<div class="flex items-center justify-between border-b border-border pb-3">
							<div class="flex items-center gap-2">
								<button
									type="button"
									onclick={() => openIssue(selectedSprint.id)}
									class="cursor-pointer text-left font-display text-lg font-bold text-foreground hover:opacity-85 focus-visible:underline focus-visible:outline-none"
								>
									{selectedSprint.title}
								</button>
							</div>
							<Badge variant="primary">{selectedSprint.status}</Badge>
						</div>

						<div class="grid grid-cols-3 gap-4 text-center">
							<div>
								<div class="text-xs font-bold tracking-wider text-muted-foreground uppercase">
									{t('sprint.stories')}
								</div>
								<div class="mt-1 font-display text-2xl font-bold text-foreground">
									{selectedMetrics.count}
								</div>
							</div>
							<div>
								<div class="text-xs font-bold tracking-wider text-muted-foreground uppercase">
									{t('sprint.points')}
								</div>
								<div class="mt-1 font-display text-2xl font-bold text-foreground">
									{selectedMetrics.points}
									{t('sprint.pointsUnit')}
								</div>
							</div>
							<div>
								<div class="text-xs font-bold tracking-wider text-muted-foreground uppercase">
									{t('sprint.progressLabel')}
								</div>
								<div class="mt-1 font-display text-2xl font-bold text-success">
									{selectedMetrics.progress}%
								</div>
							</div>
						</div>

						<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
							<div
								class="h-full bg-success transition-all duration-[var(--motion-base)]"
								style="width: {selectedMetrics.progress}%"
							></div>
						</div>
					</div>

					<!-- Stories in Sprint -->
					<div class="flex flex-col gap-3">
						<h4 class="text-sm font-bold tracking-wider text-muted-foreground uppercase">
							{t('sprintPlanner.storiesInSprint')}
						</h4>

						<div class="flex flex-col gap-2">
							{#if sprintStories.length === 0}
								<Card class="border-dashed border-border p-6 text-center text-muted-foreground">
									{t('sprintPlanner.emptySprint')}
								</Card>
							{:else}
								{#each sprintStories as story (story.id)}
									<!-- svelte-ignore a11y_click_events_have_key_events -->
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div
										onclick={() => openIssue(story.id)}
										class="hover:bg-surface-dark/10 flex cursor-pointer items-center justify-between rounded-lg border border-border bg-surface p-3 transition-all hover:border-primary/20"
									>
										<div class="flex items-center gap-2 truncate">
											<BookOpen class="h-4 w-4 shrink-0 text-primary" />
											<span class="text-xs font-semibold text-muted-foreground">#{story.id}</span>
											<span class="truncate text-sm font-medium text-foreground">{story.title}</span
											>
										</div>
										<div class="flex items-center gap-3">
											{#if story.estimate}
												<span
													class="rounded bg-muted px-2.5 py-0.5 text-xs font-bold text-foreground"
												>
													{story.estimate}
													{t('sprint.pointsUnit')}
												</span>
											{/if}
											<Badge variant="primary" size="sm">{story.status}</Badge>

											{#if isWritable}
												<button
													type="button"
													onclick={(e) => {
														e.stopPropagation();
														unlinkStory(story.id);
													}}
													class="cursor-pointer rounded p-1.5 text-muted-foreground transition-colors hover:bg-error/10 hover:text-error"
													title={t('sprintPlanner.unlink')}
												>
													<Minus class="h-4 w-4" />
												</button>
											{/if}
										</div>
									</div>
								{/each}
							{/if}
						</div>
					</div>

					<!-- Link Stories Block -->
					{#if isWritable}
						<div class="mt-2 flex flex-col gap-3 border-t border-border pt-6">
							<h4 class="text-sm font-bold tracking-wider text-muted-foreground uppercase">
								{t('sprintPlanner.unassignedHeader')}
							</h4>

							<div class="flex max-h-80 flex-col gap-4 overflow-y-auto pr-2">
								<!-- Ready to Plan -->
								<div class="flex flex-col gap-2">
									<h5
										class="px-1 text-xs font-bold tracking-wider text-muted-foreground/80 uppercase"
									>
										{t('sprintPlanner.readyToPlan')}
									</h5>
									{#if unassignedStories.length === 0}
										<p class="p-2 text-xs text-muted-foreground italic">
											{t('sprintPlanner.noUnassigned')}
										</p>
									{:else}
										{#each unassignedStories as story (story.id)}
											<!-- svelte-ignore a11y_click_events_have_key_events -->
											<!-- svelte-ignore a11y_no_static_element_interactions -->
											<div
												onclick={() => openIssue(story.id)}
												class="hover:bg-surface-dark/10 flex cursor-pointer items-center justify-between rounded-lg border border-border/60 bg-surface/50 p-3 transition-all hover:border-primary/20"
											>
												<div class="flex items-center gap-2 truncate">
													<BookOpen class="h-4 w-4 shrink-0 text-muted-foreground" />
													<span class="text-xs font-semibold text-muted-foreground"
														>#{story.id}</span
													>
													<span class="truncate text-sm text-foreground">{story.title}</span>
												</div>
												<div class="flex items-center gap-3">
													{#if story.estimate}
														<span
															class="rounded bg-muted px-2.5 py-0.5 text-xs font-bold text-foreground"
														>
															{story.estimate}
															{t('sprint.pointsUnit')}
														</span>
													{/if}
													<button
														type="button"
														onclick={(e) => {
															e.stopPropagation();
															linkStory(story.id);
														}}
														class="cursor-pointer rounded p-1.5 text-primary transition-colors hover:bg-primary/10"
														title={t('sprintPlanner.linkStory')}
													>
														<Plus class="h-4 w-4" />
													</button>
												</div>
											</div>
										{/each}
									{/if}
								</div>

								<!-- Requires Refinement -->
								{#if refinementStories.length > 0}
									<div class="flex flex-col gap-2 border-t border-border/40 pt-3">
										<h5
											class="px-1 text-xs font-bold tracking-wider text-muted-foreground/80 uppercase"
										>
											{t('sprintPlanner.needsRefinement')}
										</h5>
										{#each refinementStories as story (story.id)}
											<!-- svelte-ignore a11y_click_events_have_key_events -->
											<!-- svelte-ignore a11y_no_static_element_interactions -->
											<div
												onclick={() => openIssue(story.id)}
												class="flex cursor-pointer items-center justify-between rounded-lg border border-border/40 bg-surface/20 p-3 opacity-70 transition-all hover:opacity-100"
											>
												<div class="flex items-center gap-2 truncate">
													<BookOpen class="h-4 w-4 shrink-0 text-muted-foreground" />
													<span class="text-xs font-semibold text-muted-foreground"
														>#{story.id}</span
													>
													<span class="truncate text-sm text-foreground">{story.title}</span>
												</div>
												<div class="flex items-center gap-3">
													{#if story.estimate}
														<span
															class="rounded bg-muted px-2.5 py-0.5 text-xs font-bold text-foreground"
														>
															{story.estimate}
															{t('sprint.pointsUnit')}
														</span>
													{/if}
													<button
														type="button"
														disabled
														class="cursor-not-allowed p-1.5 text-muted-foreground opacity-40"
														title={t('sprintPlanner.linkDisabledTooltip')}
													>
														<Plus class="h-4 w-4" />
													</button>
												</div>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
