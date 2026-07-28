<!--
	Menu.svelte — daisyUI `.menu .menu-vertical` wrapper with
	keyboard nav (NFR-4).

	Behaviour:
	  - ↑/↓ : move focus to previous/next non-disabled item.
	  - Enter / Space : activate the focused item (calls `onselect`).
	  - Click on an item also activates it.
	  - The menu uses `role="menu"` with `role="menuitem"` per child.
	    `aria-disabled="true"` is set on disabled items; they remain
	    in the tab order so screen readers can announce them, but they
	    do not respond to activation.

	Props:
	  items:    ReadonlyArray<{ id: string; label: string; onselect: () => void; disabled?: boolean }>
	  class:    string    — extra utility classes
	  children: optional Snippet — for a sub-heading / footer
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type MenuItem = {
		id: string;
		label: string;
		onselect: () => void;
		disabled?: boolean;
	};

	type Props = {
		items: ReadonlyArray<MenuItem>;
		class?: string;
		children?: Snippet;
	};

	let { items, class: extraClass = '', children }: Props = $props();

	let buttonEls: Array<HTMLButtonElement | null> = $state([]);

	function nextEnabled(from: number, delta: 1 | -1): number {
		const len = items.length;
		let i = from;
		for (let step = 0; step < len; step++) {
			i = (i + delta + len) % len;
			if (!items[i].disabled) return i;
		}
		return from;
	}

	function onKeydown(e: KeyboardEvent, index: number): void {
		const item = items[index];
		if (item.disabled) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			buttonEls[nextEnabled(index, 1)]?.focus();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			buttonEls[nextEnabled(index, -1)]?.focus();
		} else if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			item.onselect();
		}
	}

	function activate(item: MenuItem): void {
		if (!item.disabled) item.onselect();
	}
</script>

<ul role="menu" class="flex w-full flex-col gap-1 {extraClass}">
	{#each items as item, i (item.id)}
		<li role="none">
			<button
				type="button"
				role="menuitem"
				aria-disabled={item.disabled || undefined}
				tabindex={item.disabled ? -1 : 0}
				class="w-full rounded-md px-4 py-2 text-left font-sans text-sm transition-colors duration-[var(--motion-fast)] focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-inset {item.disabled
					? 'cursor-not-allowed text-muted-foreground opacity-50'
					: 'cursor-pointer text-foreground hover:bg-surface'}"
				onclick={() => activate(item)}
				onkeydown={(e) => onKeydown(e, i)}
				bind:this={buttonEls[i]}
			>
				{item.label}
			</button>
		</li>
	{/each}
	{#if children}
		<li role="none" class="mt-2 border-t border-border px-4 py-2 text-sm text-muted-foreground">
			{@render children()}
		</li>
	{/if}
</ul>
