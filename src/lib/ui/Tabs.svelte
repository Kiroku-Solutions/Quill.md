<!--
	Tabs.svelte — daisyUI `.tabs .tabs-bordered` wrapper with full
	WAI-ARIA keyboard nav (NFR-4).

	Behaviour:
	  - ←/→ : move focus to previous/next tab (wraps).
	  - Home : focus the first tab.
	  - End  : focus the last tab.
	  - Enter / Space : activate the focused tab (calls onchange).
	  - Click on a tab also activates it and moves focus.
	  - The active tab is identified by `aria-selected="true"` and
	    carries `tabindex="0"`; all others are `tabindex="-1"` so
	    the tablist behaves as a single stop in the page tab order.

	Props:
	  tabs:     ReadonlyArray<{ id: string; label: string }>
	  value:    string         — id of the active tab
	  onchange: (id: string) => void
	  class:    string         — extra utility classes
-->
<script lang="ts">
	type Tab = { id: string; label: string };

	type Props = {
		tabs: ReadonlyArray<Tab>;
		value: string;
		onchange: (id: string) => void;
		class?: string;
	};

	let { tabs, value = $bindable(), onchange, class: extraClass = '' }: Props = $props();

	let buttonEls: Array<HTMLButtonElement | null> = $state([]);

	const activeIndex = $derived(tabs.findIndex((t) => t.id === value));

	function focusAndActivate(index: number): void {
		if (index < 0 || index >= tabs.length) return;
		const next = tabs[index];
		value = next.id;
		onchange(next.id);
		buttonEls[index]?.focus();
	}

	function move(delta: number, end?: 'start' | 'end'): void {
		if (tabs.length === 0) return;
		const len = tabs.length;
		const target =
			end === 'start' ? 0 : end === 'end' ? len - 1 : (activeIndex + delta + len) % len;
		focusAndActivate(target);
	}

	function onKeydown(e: KeyboardEvent, index: number): void {
		switch (e.key) {
			case 'ArrowRight':
				e.preventDefault();
				move(1);
				return;
			case 'ArrowLeft':
				e.preventDefault();
				move(-1);
				return;
			case 'Home':
				e.preventDefault();
				move(0, 'start');
				return;
			case 'End':
				e.preventDefault();
				move(0, 'end');
				return;
			case 'Enter':
			case ' ':
				e.preventDefault();
				focusAndActivate(index);
				return;
		}
	}
</script>

<div role="tablist" aria-orientation="horizontal" class="tabs tabs-bordered {extraClass}">
	{#each tabs as tab, i (tab.id)}
		{@const isActive = tab.id === value}
		<button
			type="button"
			role="tab"
			id="tab-{tab.id}"
			aria-selected={isActive}
			tabindex={isActive ? 0 : -1}
			class="tab focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 {isActive
				? 'tab-active'
				: ''}"
			onclick={() => focusAndActivate(i)}
			onkeydown={(e) => onKeydown(e, i)}
			bind:this={buttonEls[i]}
		>
			{tab.label}
		</button>
	{/each}
</div>
