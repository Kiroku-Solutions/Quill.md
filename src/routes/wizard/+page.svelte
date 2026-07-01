<!--
	Wizard — first-run template setup (FR-11 / UC-5, sub-phase 6H
	re-skin).

	Triggered when the home page's "Open local folder" flow detects a
	missing `.quill.md/config.json` — see `+page.svelte`. The route is
	also reachable directly via `/wizard` for users who want to
	re-run the wizard over an existing project (the route is tolerant
	of an already-set-up repo and offers to leave existing files in
	place; see `wizard.ts:writeWizardSetup`).

	Paths:
	  - "Use built-in templates" → checklist of the four built-in
	    templates (Epic / User Story / Task / Bug). At least one
	    must be selected to enable the Apply button.
	  - "Create your own" → the future in-app template editor. The
	    button is disabled with a tooltip "Coming soon"; FR-11 only
	    requires the built-in path to be functional.

	On Apply:
	  1. `writeWizardSetup(adapter, selectedIds, { overwriteConfig: true })`
	  2. Re-load config + templates through the stores
	  3. `goto('/local')` — the user is now on the main surface.

	Sub-phase 6H replaces the daisyUI-only markup with the 6B primitives
	(Card, Button, Alert, Badge, Radio, Checkbox) + 6A tokens. Logic is
	unchanged.
-->
<script lang="ts">
	import { getStores } from '$lib/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { Alert, Button, Card, Checkbox, Radio, Tooltip } from '$lib/ui';
	import { t } from '$lib/ui/strings';
	import { BUILT_IN_TEMPLATES } from '$lib/services/built-in-templates';
	import { writeWizardSetup } from '$lib/services/wizard';
	import TemplateEditor from '$lib/components/TemplateEditor.svelte';
	import type { Template } from '$lib/types/index';

	const stores = getStores();

	type Path = 'builtin' | 'custom';
	let path = $state<Path>('builtin');
	let selected = $state<ReadonlySet<string>>(new Set());
	let isApplying = $state(false);
	let applyError = $state<string | null>(null);

	const canApply = $derived(path === 'builtin' && selected.size > 0 && !isApplying);

	function toggle(id: string): void {
		// `selected` is reassigned wholesale on every change (immutable-set
		// pattern), so the Svelte 5 reactivity fires on the assignment, not
		// on the inner add/delete. The local `new Set(selected)` is just a
		// shallow copy used to derive the next snapshot; it never escapes
		// this function, so a plain `Set` is correct here.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}

	onMount(() => {
		// If the wizard is opened without a bound local adapter, send
		// the user back home — the wizard cannot write anywhere.
		if (stores.mode.localAdapter === null) {
			void goto(resolve('/'));
		}
	});

	async function apply(): Promise<void> {
		const adapter = stores.mode.localAdapter;
		if (!adapter) {
			applyError = t('wizard.noFolder');
			return;
		}
		isApplying = true;
		applyError = null;
		try {
			// If path is custom, we shouldn't be in this general apply function 
			// without passing the custom templates, but we can handle it via a separate flow.
			await writeWizardSetup(adapter, [...selected], { overwriteConfig: true });
			// Re-load the affected stores so the UI reflects the new files.
			await Promise.all([stores.config.load(), stores.templates.load()]);
			await stores.issues.load();
			await goto(resolve('/local'));
		} catch (cause) {
			applyError = (cause as Error).message;
		} finally {
			isApplying = false;
		}
	}

	async function applyCustomTemplate(t: Template): Promise<void> {
		const adapter = stores.mode.localAdapter;
		if (!adapter) {
			applyError = t('wizard.noFolder');
			return;
		}
		isApplying = true;
		applyError = null;
		try {
			await writeWizardSetup(adapter, [t], { overwriteConfig: true });
			await Promise.all([stores.config.load(), stores.templates.load()]);
			await stores.issues.load();
			await goto(resolve('/local'));
		} catch (cause) {
			applyError = (cause as Error).message;
		} finally {
			isApplying = false;
		}
	}

	function cancel(): void {
		void goto(resolve('/'));
	}
</script>

<div class="flex min-h-screen flex-col bg-background text-foreground">
	<div class="flex-1 px-6 py-10">
		<div class="mx-auto flex max-w-3xl flex-col gap-8">
			<section>
				<h1 class="text-2xl font-semibold">{t('wizard.headTitle')}</h1>
				<p class="mt-2 opacity-80">{t('wizard.headBody')}</p>
			</section>

			<section class="flex flex-col gap-3">
				<h2 class="text-lg font-semibold">{t('wizard.step1Title')}</h2>

				<Card compact class="cursor-pointer">
					<label class="flex cursor-pointer items-start gap-3">
						<Radio
							name="wizard-path"
							value="builtin"
							checked={path === 'builtin'}
							label=""
							ariaLabel={t('wizard.builtinAria')}
							onchange={() => (path = 'builtin')}
						/>
						<div class="flex-1">
							<div class="font-medium">{t('wizard.builtinTitle')}</div>
							<div class="text-sm opacity-70">{t('wizard.builtinBody')}</div>
						</div>
					</label>
				</Card>

				<Card compact class="cursor-pointer">
					<label class="flex cursor-pointer items-start gap-3">
						<Radio
							name="wizard-path"
							value="custom"
							checked={path === 'custom'}
							label=""
							ariaLabel={t('wizard.customAria')}
							onchange={() => (path = 'custom')}
						/>
						<div class="flex-1">
							<div class="font-medium">{t('wizard.customTitle')}</div>
							<div class="text-sm opacity-70">{t('wizard.customBody')}</div>
						</div>
					</label>
				</Card>
			</section>

			{#if path === 'builtin'}
				<section class="flex flex-col gap-3" data-testid="wizard-template-picker">
					<h2 class="text-lg font-semibold">{t('wizard.step2Title')}</h2>
					<p class="text-sm opacity-70">{t('wizard.step2Body')}</p>
					<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
						{#each BUILT_IN_TEMPLATES as tmpl (tmpl.id)}
							{@const isPicked = selected.has(tmpl.id)}
							<div data-testid="wizard-template-{tmpl.id}">
								<Card compact>
									<label class="flex cursor-pointer items-start gap-3">
										<Checkbox
											checked={isPicked}
											label=""
											ariaLabel={t('wizard.selectTemplateAria', { name: tmpl.name })}
											onchange={() => toggle(tmpl.id)}
										/>
										<div class="flex-1">
											<div class="flex items-center gap-2 font-medium">
												<span
													class="inline-block h-3 w-3 rounded-full"
													style="background-color: {tmpl.color}"
													aria-hidden="true"
												></span>
												{tmpl.name}
											</div>
											<div class="mt-1 text-xs opacity-70">
												{t('wizard.templateFields', { n: tmpl.fields.length })} ·
												{t('wizard.templateSections', { n: tmpl.sections.length })}
											</div>
										</div>
									</label>
								</Card>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			{#if path === 'custom'}
				<div class="mt-4 border-t border-border/50 pt-8">
					<TemplateEditor 
						onsave={applyCustomTemplate} 
						oncancel={() => (path = 'builtin')} 
					/>
				</div>
			{/if}

			{#if applyError}
				<Alert variant="error">
					<span>{t('wizard.applyError', { msg: applyError })}</span>
				</Alert>
			{/if}

			{#if path === 'builtin'}
				<div class="flex items-center gap-3">
					<Tooltip
						text={canApply ? t('wizard.applyTooltip') : t('wizard.applyTooltipDisabled')}
						position="top"
					>
						<Button
							variant="primary"
							disabled={!canApply}
							loading={isApplying}
							onclick={apply}
							data-testid="wizard-apply"
						>
							{isApplying ? t('wizard.applying') : t('wizard.applyButton')}
						</Button>
					</Tooltip>
					<Button variant="ghost" onclick={cancel}>{t('wizard.cancel')}</Button>
					<span class="ml-auto text-xs opacity-60">
						{t('wizard.summary', { selected: selected.size })}
					</span>
				</div>
			{/if}
		</div>
	</div>
</div>
