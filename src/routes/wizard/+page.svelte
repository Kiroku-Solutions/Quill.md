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
	import { Alert, Button, Card, Radio, Tooltip } from '$lib/ui';
	import { t } from '$lib/ui/strings';
	import { i18n } from '$lib/ui/i18n/store.svelte';
	import { FRAMEWORK_PRESETS } from '$lib/services/framework-presets';
	import { FRAMEWORK_PRESETS_ES } from '$lib/services/framework-presets.es';
	import { defaultConfig } from '$lib/services/built-in-templates';
	import { writeWizardSetup } from '$lib/services/wizard';
	import TemplateEditor from '$lib/components/TemplateEditor.svelte';
	import type { Template } from '$lib/types/index';

	const stores = getStores();

	type Path = 'builtin' | 'custom';
	let path = $state<Path>('builtin');
	let selectedPresetId = $state<string | null>(null);
	let isApplying = $state(false);
	let applyError = $state<string | null>(null);

	const activePresets = $derived(i18n.locale === 'es' ? FRAMEWORK_PRESETS_ES : FRAMEWORK_PRESETS);

	const canApply = $derived(path === 'builtin' && selectedPresetId !== null && !isApplying);

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
		const preset = activePresets.find((p) => p.id === selectedPresetId);
		if (!preset) return;

		isApplying = true;
		applyError = null;
		try {
			await writeWizardSetup(adapter, preset.templates, {
				overwriteConfig: true,
				overwriteTemplates: true,
				config: preset.config
			});
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

	async function applyCustomTemplate(tmpl: Template): Promise<void> {
		const adapter = stores.mode.localAdapter;
		if (!adapter) {
			applyError = t('wizard.noFolder');
			return;
		}
		isApplying = true;
		applyError = null;
		try {
			await writeWizardSetup(adapter, [tmpl], {
				overwriteConfig: true,
				overwriteTemplates: true,
				config: defaultConfig()
			});
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
		<div class="mx-auto flex max-w-4xl flex-col gap-8">
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
						{#each activePresets as preset (preset.id)}
							<div data-testid="wizard-preset-{preset.id}">
								<Card compact class="h-full">
									<label class="flex cursor-pointer items-start gap-3 h-full">
										<Radio
											name="preset"
											value={preset.id}
											checked={selectedPresetId === preset.id}
											label=""
											ariaLabel={t('wizard.selectFrameworkAria', { name: preset.name })}
											onchange={() => (selectedPresetId = preset.id)}
										/>
										<div class="flex-1">
											<div class="font-medium">
												{preset.name}
											</div>
											<div
												class="mt-1 text-xs opacity-70 leading-relaxed line-clamp-3"
												title={preset.description}
											>
												{preset.description}
											</div>
											<div class="mt-3 text-xs font-semibold opacity-60">
												{t('wizard.frameworkIncludes', {
													templates: preset.templates.length,
													statuses: preset.config.statuses.length
												})}
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
					<TemplateEditor onsave={applyCustomTemplate} oncancel={() => (path = 'builtin')} />
				</div>
			{/if}

			{#if applyError}
				<Alert variant="error">
					<span>{t('wizard.applyError', { msg: applyError })}</span>
				</Alert>
			{/if}

			{#if path === 'builtin'}
				<div class="mt-4 flex flex-col gap-4">
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
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
