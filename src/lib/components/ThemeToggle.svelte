<script lang="ts">
	import { getStores } from '$lib/state';
	import { t } from '$lib/ui/strings';

	const { theme } = getStores();

	function apply(t: 'light' | 'dark'): void {
		document.documentElement.classList.toggle('dark', t === 'dark');
	}

	function toggle(): void {
		const next = theme.theme === 'dark' ? 'light' : 'dark';
		theme.setTheme(next);
		apply(next);
	}
</script>

<button
	type="button"
	class="btn btn-ghost btn-sm"
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
			class="w-5 h-5"
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
			class="w-5 h-5"
		>
			<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
		</svg>
	{/if}
</button>
