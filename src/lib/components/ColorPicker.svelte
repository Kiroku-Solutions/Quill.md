<script lang="ts">
	import { t } from '$lib/ui/strings';

	let { value = $bindable('#0ea5e9') } = $props<{ value?: string }>();

	const PRESET_COLORS = [
		'#f97316', // orange (epic)
		'#a855f7', // purple (use case)
		'#0ea5e9', // sky blue (user story)
		'#10b981', // emerald (task)
		'#e74c3c', // red (bug)
		'#eab308', // yellow (sprint)
		'#ef4444', // red 500
		'#f43f5e', // rose 500
		'#ec4899', // pink 500
		'#8b5cf6', // violet 500
		'#6366f1', // indigo 500
		'#3b82f6', // blue 500
		'#06b6d4', // cyan 500
		'#14b8a6', // teal 500
		'#84cc16', // lime 500
		'#f59e0b', // amber 500
		'#64748b', // slate 500
		'#3f3f46', // zinc 700
	];

	function selectColor(color: string) {
		value = color;
	}
</script>

<div class="flex flex-col gap-2">
	<span class="text-sm font-medium">{t('templateEditor.color')}</span>
	<div class="flex flex-wrap gap-2 rounded-lg border border-border p-3 bg-surface/50">
		{#each PRESET_COLORS as color}
			{@const isSelected = value === color}
			<button
				type="button"
				class="relative h-8 w-8 rounded-full shadow-sm transition-all duration-200
					{isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110' : 'hover:scale-110'}"
				style="background-color: {color}"
				onclick={() => selectColor(color)}
				aria-label="Color {color}"
			>
				{#if isSelected}
					<span class="absolute inset-0 flex items-center justify-center text-white drop-shadow-md">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="20 6 9 17 4 12"></polyline>
						</svg>
					</span>
				{/if}
			</button>
		{/each}
		<div class="flex items-center ml-2 border-l border-border pl-4">
			<input 
				type="color" 
				bind:value 
				class="h-8 w-8 cursor-pointer rounded overflow-hidden border-0 p-0"
				title={t('templateEditor.customColor')}
			/>
		</div>
	</div>
</div>
