<!--
	Modal.svelte — daisyUI `.modal .modal-bottom .modal-middle` wrapper
	(NFR-4 — focus trap + ESC + focus restoration).

	Strategy: native `<dialog>` element with `showModal()` / `close()`.
	The browser provides the focus trap, the ESC-to-close behaviour,
	and the backdrop for free. We add:
	  - Body scroll lock via a `body { overflow: hidden }` toggle while
	    the modal is open.
	  - Focus restoration: when the modal closes, focus returns to the
	    element that was active when it opened.
	  - Click on the backdrop (outside `.modal-box`) closes the modal
	    via the `cancel` event.

	The `<form method="dialog">` wrapping the close button is the
	canonical daisyUI pattern for ESC + close. We bind our own
	`onclose` handler to the `close` event so the parent can react.

	Props:
	  open:     boolean
	  onclose:  () => void
	  class:    string    — extra utility classes
	  children: Snippet
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		open: boolean;
		onclose: () => void;
		class?: string;
		children?: Snippet;
	};

	let { open = $bindable(), onclose, class: extraClass = '', children }: Props = $props();

	let dialogEl: HTMLDialogElement | null = $state(null);
	let returnFocusEl: Element | null = null;

	$effect(() => {
		const dlg = dialogEl;
		if (!dlg) return;
		if (open && !dlg.open) {
			returnFocusEl = document.activeElement;
			dlg.showModal();
			document.body.style.overflow = 'hidden';
		} else if (!open && dlg.open) {
			dlg.close();
			document.body.style.overflow = '';
		}
	});

	function onNativeClose(): void {
		document.body.style.overflow = '';
		if (open) open = false;
		onclose();
		(returnFocusEl as HTMLElement | null)?.focus?.();
	}

	function onBackdropClick(e: MouseEvent): void {
		// The dialog itself fills the viewport; the backdrop is
		// rendered outside `.modal-box`. A click whose target is the
		// dialog (not a descendant) is a backdrop click.
		if (e.target === dialogEl) {
			dialogEl?.close();
		}
	}
</script>

<dialog
	bind:this={dialogEl}
	class="modal modal-bottom sm:modal-middle {extraClass}"
	onclose={onNativeClose}
	onclick={onBackdropClick}
	aria-modal="true"
>
	<div class="modal-box focus-visible:outline-none" tabindex="-1">
		{#if children}{@render children()}{/if}
	</div>
	<form method="dialog" class="modal-backdrop">
		<button type="submit" aria-label="Close modal">close</button>
	</form>
</dialog>
