<!--
	ModalHarness.svelte — test harness for the Modal primitive.

	Renders a trigger button outside the modal and a child snippet
	inside. Used by `tests/ui/modal.svelte.test.ts` to verify focus trap,
	ESC close, and focus restoration end-to-end.

	NOT a production component; lives in `tests/ui/` for the test
	infrastructure to find.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Modal from '../../src/lib/ui/Modal.svelte';

	type Props = {
		open: boolean;
		onclose: () => void;
		children?: Snippet;
	};

	let { open = $bindable(), onclose, children }: Props = $props();
</script>

<div>
	<button type="button" data-testid="trigger" onclick={() => (open = true)}>Open</button>
	<Modal bind:open {onclose}>
		{#if children}{@render children()}{/if}
	</Modal>
</div>
