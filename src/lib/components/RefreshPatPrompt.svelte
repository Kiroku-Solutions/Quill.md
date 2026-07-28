<!--
	RefreshPatPrompt.svelte — PAT re-prompt modal for the remote
	refresh action (sub-phase 6F).

	Why this exists:
	  The mode store's `refreshRemote(pat)` contract requires a fresh
	  PAT every call — NFR-2 forbids persisting it. The home page
	  already collects the PAT on initial open; this modal is the
	  small twin that fires from the remote toolbar's Refresh button.

	Implementation:
	  Thin daisyUI modal wrapper built directly from `dialog` /
	  `modal-box` (no `Modal` primitive — the 6B `Modal` ships focus
	  trap + ESC + restore-focus, all of which we want, but its
	  `bind:open` contract pulls the wrapper into a `bindable()` cell
	  that we deliberately avoid so the toolbar can manage `promptOpen`
	  alongside `refreshing`). The dialog is hidden via `display:none`
	  when `open` is false so the page-level tab order skips it.

	Security:
	  The PAT input is `autocomplete="off"` and `type="password"` so
	  browser autofill / observer keystroke logging does not retain it.
	  We do not echo the value back anywhere — the input is reset to
	  `''` on submit / cancel so a re-open does not surface the prior
	  PAT. (NFR-2.)
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { t } from '$lib/ui/strings';

	type Props = {
		/** Whether the modal is visible. Two-way binding optional. */
		open: boolean;
		/** Disabled state for the submit button while refresh is in flight. */
		loading?: boolean;
		/** Fired when the user dismisses the modal without submitting. */
		oncancel: () => void;
		/** Fired with the PAT string when the user confirms. */
		onsubmit: (pat: string) => void;
	};

	let { open, loading = false, oncancel, onsubmit }: Props = $props();

	let pat = $state('');
	let dialog = $state<HTMLDialogElement | null>(null);

	$effect(() => {
		// Reflect the bound `open` flag on the native dialog element so
		// the modal participates in the browser's built-in top-layer
		// focus trap and ESC handling.
		if (!dialog) return;
		if (open) {
			if (!dialog.open) dialog.showModal();
		} else {
			if (dialog.open) dialog.close();
			pat = '';
		}
	});

	async function focusInput(): Promise<void> {
		await tick();
		const input = dialog?.querySelector<HTMLInputElement>('input[name="pat"]');
		input?.focus();
	}

	function onCancel(): void {
		oncancel();
	}

	function onSubmit(event: SubmitEvent): void {
		event.preventDefault();
		const trimmed = pat.trim();
		if (trimmed === '') return;
		onsubmit(trimmed);
		// The toolbar will set `open=false` on success; reset locally too
		// in case the caller keeps the modal mounted.
		pat = '';
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			onCancel();
		}
	}

	$effect(() => {
		// Focus the input when the modal opens.
		if (open) void focusInput();
	});
</script>

<dialog
	bind:this={dialog}
	data-testid="refresh-pat-prompt"
	class="modal"
	onkeydown={onKeydown}
	onclose={() => onCancel()}
>
	<div class="relative w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-xl">
		<h2 class="text-lg font-bold tracking-tight text-foreground">{t('refreshPatPrompt.title')}</h2>
		<p class="mt-2 text-sm text-muted-foreground">
			{t('refreshPatPrompt.body')}
		</p>
		<form onsubmit={onSubmit} class="mt-6 flex flex-col gap-4">
			<label class="flex flex-col gap-1.5">
				<span class="text-[11px] font-bold tracking-widest text-muted-foreground uppercase"
					>{t('refreshPatPrompt.label')}</span
				>
				<input
					name="pat"
					type="password"
					autocomplete="off"
					spellcheck="false"
					bind:value={pat}
					disabled={loading}
					required
					data-testid="refresh-pat-prompt-input"
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground transition-shadow focus:border-transparent focus:ring-2 focus:ring-primary focus:outline-none"
				/>
			</label>
			<div class="mt-2 flex justify-end gap-3">
				<button
					type="button"
					class="rounded-md px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-50"
					onclick={onCancel}
					disabled={loading}
					data-testid="refresh-pat-prompt-cancel"
				>
					{t('common.cancel')}
				</button>
				<button
					type="submit"
					class="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
					disabled={loading || pat.trim() === ''}
					data-testid="refresh-pat-prompt-submit"
				>
					{#if loading}
						<svg
							class="mr-2 -ml-1 inline-block h-4 w-4 animate-spin text-current"
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							><circle
								class="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								stroke-width="4"
							></circle><path
								class="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
							></path></svg
						>
					{/if}
					{loading ? t('refreshPatPrompt.refreshing') : t('common.refresh')}
				</button>
			</div>
		</form>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button type="submit" aria-label={t('refreshPatPrompt.closeAria')}>{t('common.close')}</button>
	</form>
</dialog>
