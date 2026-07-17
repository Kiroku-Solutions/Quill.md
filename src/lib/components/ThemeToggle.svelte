<script lang="ts">
	import { getStores } from '$lib/state';
	import { t } from '$lib/ui/strings';

	const { theme } = getStores();

	function toggle(): void {
		const next = theme.theme === 'dark' ? 'light' : 'dark';
		theme.setTheme(next);
	}
</script>

<button
	type="button"
	class="rounded-md p-2 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
	onclick={toggle}
	aria-label={theme.theme === 'dark' ? t('theme.switchToLight') : t('theme.switchToDark')}
>
	{#if theme.theme === 'dark'}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			class="h-5 w-5"
		>
			<circle cx="12" cy="12" r="5" />
			<path
				d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
			/>
		</svg>
	{:else}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			class="h-5 w-5"
		>
			<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
		</svg>
	{/if}
</button>
