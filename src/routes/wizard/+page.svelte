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
	import { slide } from 'svelte/transition';
	import Check from '@lucide/svelte/icons/check';
	import { Alert, Button, Tooltip } from '$lib/ui';
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
	<div class="flex-1 px-4 py-8 sm:px-6 sm:py-12">
		<div class="mx-auto flex max-w-2xl flex-col gap-10">
			<section>
				<h1 class="font-display text-3xl font-semibold tracking-tight">{t('wizard.headTitle')}</h1>
				<p class="mt-3 text-lg opacity-80">{t('wizard.headBody')}</p>
			</section>

			<section class="flex flex-col gap-4">
				<h2 class="font-display text-xl font-semibold">{t('wizard.step1Title')}</h2>

				<label
					class="group relative flex cursor-pointer flex-col rounded-xl border-2 bg-surface p-5 shadow-sm transition-all hover:shadow-md {path ===
					'builtin'
						? 'border-primary ring-4 ring-primary/10'
						: 'border-border hover:border-primary/50'}"
				>
					<input
						type="radio"
						name="wizard-path"
						value="builtin"
						checked={path === 'builtin'}
						class="sr-only"
						aria-label={t('wizard.builtinAria')}
						onchange={() => (path = 'builtin')}
					/>
					<div class="flex items-start justify-between gap-4">
						<div class="flex-1">
							<div
								class="font-display text-lg font-semibold text-foreground transition-colors group-hover:text-primary"
							>
								{t('wizard.builtinTitle')}
							</div>
							<div class="mt-1 text-sm leading-relaxed opacity-75">{t('wizard.builtinBody')}</div>
						</div>
						<div
							class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors {path ===
							'builtin'
								? 'border-primary bg-primary text-primary-foreground'
								: 'border-muted-foreground group-hover:border-primary'}"
						>
							{#if path === 'builtin'}
								<Check class="h-3 w-3" strokeWidth="3" />
							{/if}
						</div>
					</div>
				</label>

				<label
					class="group relative flex cursor-pointer flex-col rounded-xl border-2 bg-surface p-5 shadow-sm transition-all hover:shadow-md {path ===
					'custom'
						? 'border-primary ring-4 ring-primary/10'
						: 'border-border hover:border-primary/50'}"
				>
					<input
						type="radio"
						name="wizard-path"
						value="custom"
						checked={path === 'custom'}
						class="sr-only"
						aria-label={t('wizard.customAria')}
						onchange={() => (path = 'custom')}
					/>
					<div class="flex items-start justify-between gap-4">
						<div class="flex-1">
							<div
								class="font-display text-lg font-semibold text-foreground transition-colors group-hover:text-primary"
							>
								{t('wizard.customTitle')}
							</div>
							<div class="mt-1 text-sm leading-relaxed opacity-75">{t('wizard.customBody')}</div>
						</div>
						<div
							class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors {path ===
							'custom'
								? 'border-primary bg-primary text-primary-foreground'
								: 'border-muted-foreground group-hover:border-primary'}"
						>
							{#if path === 'custom'}
								<Check class="h-3 w-3" strokeWidth="3" />
							{/if}
						</div>
					</div>
				</label>
			</section>

			{#if path === 'builtin'}
				<div transition:slide={{ duration: 300 }}>
					<section class="flex flex-col gap-4" data-testid="wizard-template-picker">
						<h2 class="font-display text-xl font-semibold">{t('wizard.step2Title')}</h2>
						<p class="text-sm opacity-80">{t('wizard.step2Body')}</p>
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							{#each activePresets as preset, index (preset.id)}
								{@const isActive = selectedPresetId === preset.id}
								<div data-testid="wizard-preset-{preset.id}">
									<label
										class="group relative flex h-full cursor-pointer flex-col rounded-xl border-2 bg-surface p-5 shadow-sm transition-all hover:shadow-md {isActive
											? 'border-primary ring-4 ring-primary/10'
											: 'border-border hover:border-primary/50'}"
									>
										<input
											type="radio"
											name="preset"
											value={preset.id}
											checked={selectedPresetId === preset.id}
											class="sr-only"
											aria-label={t('wizard.selectFrameworkAria', { name: preset.name })}
											onchange={() => (selectedPresetId = preset.id)}
										/>

										{#if index === 0}
											<div class="absolute -top-3 right-4">
												<span
													class="rounded-full bg-primary px-3 py-1 text-[10px] font-bold tracking-widest text-primary-foreground uppercase shadow-sm"
												>
													{t('wizard.recommended')}
												</span>
											</div>
										{/if}

										<div class="flex items-start justify-between gap-3">
											<div
												class="font-display font-semibold text-foreground transition-colors group-hover:text-primary"
											>
												{preset.name}
											</div>
											<div
												class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors {isActive
													? 'border-primary bg-primary text-primary-foreground'
													: 'border-muted-foreground group-hover:border-primary'}"
											>
												{#if isActive}
													<Check class="h-3 w-3" strokeWidth="3" />
												{/if}
											</div>
										</div>
										<div
											class="mt-2 line-clamp-3 text-xs leading-relaxed opacity-75"
											title={preset.description}
										>
											{preset.description}
										</div>
										<div
											class="mt-auto pt-4 text-[11px] font-semibold tracking-widest text-primary/70 uppercase"
										>
											{t('wizard.frameworkIncludes', {
												templates: preset.templates.length,
												statuses: preset.config.statuses.length
											})}
										</div>
									</label>
								</div>
							{/each}
						</div>
					</section>
				</div>
			{/if}

			{#if path === 'custom'}
				<div transition:slide={{ duration: 300 }} class="mt-4 border-t border-border/50 pt-8">
					<TemplateEditor onsave={applyCustomTemplate} oncancel={() => (path = 'builtin')} />
				</div>
			{/if}

			{#if applyError}
				<Alert variant="error">
					<span>{t('wizard.applyError', { msg: applyError })}</span>
				</Alert>
			{/if}

			{#if path === 'builtin'}
				<div
					class="sticky bottom-0 -mx-4 mt-8 flex flex-col gap-4 border-t border-border bg-background/90 p-4 backdrop-blur-md sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
					transition:slide={{ duration: 300 }}
				>
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
								class="w-full sm:w-auto"
							>
								{isApplying ? t('wizard.applying') : t('wizard.applyButton')}
							</Button>
						</Tooltip>
						<Button variant="ghost" onclick={cancel} class="w-full sm:w-auto"
							>{t('wizard.cancel')}</Button
						>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
