<script lang="ts">
	import { getStores } from '$lib/state';
	import { t } from '$lib/ui/strings';

	const { filter } = getStores();

	const statuses = $derived(stores_filter_statuses());

	// Re-export: use a helper so we can read stores.config reactively.
	function stores_filter_statuses(): readonly string[] {
		// Read the active config — fall back to [] when not yet loaded.
		const cfg = (getStores() as unknown as { config: { config: unknown } }).config.config as {
			statuses?: ReadonlyArray<{ id: string }>;
		} | null;
		return cfg?.statuses?.map((s) => s.id) ?? [];
	}

	const q = $derived(filter.filter.q ?? '');
	const status = $derived(filter.filter.status ?? '');
	const type = $derived(filter.filter.type ?? '');
	const sprintId = $derived(filter.filter.sprintId ?? '');
	const groupBy = $derived(filter.filter.groupBy ?? 'none');

	function update(partial: Partial<typeof filter.filter>): void {
		filter.set({ ...filter.filter, ...partial });
	}

	function clear(): void {
		filter.clear();
	}
</script>

<div class="flex flex-col gap-4">
	<label class="flex flex-col gap-1.5">
		<span class="text-[11px] font-bold uppercase tracking-widest text-muted-foreground"
			>{t('filter.searchLabel')}</span
		>
		<input
			type="search"
			class="w-full bg-background text-foreground rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow placeholder-muted-foreground"
			placeholder={t('filter.searchPlaceholder')}
			value={q}
			oninput={(e) => update({ q: e.currentTarget.value || undefined })}
		/>
	</label>

	<label class="flex flex-col gap-1.5">
		<span class="text-[11px] font-bold uppercase tracking-widest text-muted-foreground"
			>{t('filter.statusLabel')}</span
		>
		<div class="relative w-full">
			<select
				class="w-full appearance-none bg-background text-foreground rounded-md border border-border pl-3 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow"
				value={status}
				onchange={(e) => update({ status: e.currentTarget.value || undefined })}
			>
				<option value="">{t('common.all')}</option>
				{#each statuses as id (id)}
					<option value={id}>{id}</option>
				{/each}
			</select>
			<div
				class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
					><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"
					></path></svg
				>
			</div>
		</div>
	</label>

	<label class="flex flex-col gap-1.5">
		<span class="text-[11px] font-bold uppercase tracking-widest text-muted-foreground"
			>{t('filter.typeLabel')}</span
		>
		<input
			type="text"
			class="w-full bg-background text-foreground rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow placeholder-muted-foreground"
			placeholder={t('filter.typePlaceholder')}
			value={type}
			oninput={(e) => update({ type: e.currentTarget.value || undefined })}
		/>
	</label>

	<label class="flex flex-col gap-1.5">
		<span class="text-[11px] font-bold uppercase tracking-widest text-muted-foreground"
			>{t('kanban.sprintLabel', { default: 'Sprint ID' })}</span
		>
		<input
			type="text"
			class="w-full bg-background text-foreground rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow placeholder-muted-foreground"
			placeholder="e.g. Sprint-1"
			value={sprintId}
			oninput={(e) => update({ sprintId: e.currentTarget.value || undefined })}
		/>
	</label>

	<label class="flex flex-col gap-1.5">
		<span class="text-[11px] font-bold uppercase tracking-widest text-muted-foreground"
			>View Level (Group By)</span
		>
		<div class="relative w-full">
			<select
				class="w-full appearance-none bg-background text-foreground rounded-md border border-border pl-3 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow"
				value={groupBy}
				onchange={(e) =>
					update({
						groupBy:
							(e.currentTarget.value as 'none' | 'sprint' | 'epic') === 'none'
								? undefined
								: (e.currentTarget.value as 'none' | 'sprint' | 'epic')
					})}
			>
				<option value="none">Flat (Bajo Nivel)</option>
				<option value="sprint">Group by Sprint</option>
				<option value="epic">Group by Epic</option>
			</select>
			<div
				class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
					><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"
					></path></svg
				>
			</div>
		</div>
	</label>

	<button
		type="button"
		class="text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors mt-1 w-fit"
		onclick={clear}
	>
		{t('filter.clearButton')}
	</button>
</div>
