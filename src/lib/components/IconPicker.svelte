<script lang="ts">
	import * as Icons from '@lucide/svelte';
	import { t } from '$lib/ui/strings';
	import { Tooltip } from '$lib/ui';

	let { value = $bindable('file-text') } = $props<{ value?: string }>();

	// S+ Tier preset icons
	const PRESET_ICONS = [
		'file-text',
		'file',
		'check-square',
		'bug',
		'flame',
		'book-open',
		'milestone',
		'zap',
		'star',
		'rocket',
		'shield',
		'target',
		'alert-triangle',
		'lightbulb',
		'compass',
		'flag',
		'activity',
		'layers',
		'box',
		'cpu',
		'database',
		'globe',
		'hash',
		'heart'
	];

	function selectIcon(icon: string) {
		value = icon;
	}

	function kebabToPascal(str: string) {
		return str
			.split('-')
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join('');
	}

	function getLucideComponent(name: string) {
		const pascalName = kebabToPascal(name);
		return (Icons as Record<string, any>)[pascalName] || Icons.FileText;
	}
</script>

<div class="flex flex-col gap-2">
	<span class="text-sm font-medium">{t('templateEditor.icon')}</span>
	<div class="flex flex-wrap justify-start gap-2 rounded-lg border border-border bg-surface/50 p-3">
		{#each PRESET_ICONS as iconName}
			{@const IconComponent = getLucideComponent(iconName)}
			{@const isSelected = value === iconName}
			<button
				type="button"
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-all duration-200
					{isSelected
					? 'scale-110 bg-primary text-primary-foreground shadow-md'
					: 'text-muted-foreground hover:scale-105 hover:bg-muted hover:text-foreground'}"
				onclick={() => selectIcon(iconName)}
				aria-label={iconName}
				title={iconName}
			>
				<IconComponent size={20} strokeWidth={isSelected ? 2.5 : 2} />
			</button>
		{/each}
	</div>
</div>
