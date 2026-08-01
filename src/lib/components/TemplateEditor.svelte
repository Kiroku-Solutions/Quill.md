<script lang="ts">
	import { t } from '$lib/ui/strings';
	import { Button, Input, Select, Checkbox, IconButton } from '$lib/ui';
	import IconPicker from './IconPicker.svelte';
	import ColorPicker from './ColorPicker.svelte';
	import type { Template, TemplateField, TemplateSection } from '$lib/types/index';
	import { FIELD_TYPES, RELATION_TYPES } from '$lib/types/index';
	import * as Icons from '@lucide/svelte';
	import { slide } from 'svelte/transition';
	import { getStores } from '$lib/state';

	const stores = getStores();
	const availableTemplates = $derived(stores.templates.templates);

	import { untrack } from 'svelte';

	let { initialTemplate, onsave, oncancel } = $props<{
		initialTemplate?: Template;
		onsave: (t: Template) => void;
		oncancel: () => void;
	}>();

	// Local state
	let name = $state(untrack(() => initialTemplate?.name || ''));
	let id = $state(untrack(() => initialTemplate?.id || ''));
	let icon = $state(untrack(() => initialTemplate?.icon || 'file-text'));
	let color = $state(untrack(() => initialTemplate?.color || '#0ea5e9'));
	let default_status = $state(untrack(() => initialTemplate?.default_status || 'open'));

	let fields = $state<TemplateField[]>(
		untrack(() =>
			initialTemplate?.fields ? JSON.parse(JSON.stringify(initialTemplate.fields)) : []
		)
	);
	let sections = $state<TemplateSection[]>(
		untrack(() =>
			initialTemplate?.sections
				? JSON.parse(JSON.stringify(initialTemplate.sections))
				: [{ id: 1, key: 'description', name: 'Description', obligatory: true, default: '' }]
		)
	);

	let idTouched = $state(untrack(() => !!initialTemplate));

	$effect(() => {
		if (!idTouched && name) {
			id = name
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/(^-|-$)/g, '');
		}
	});

	let showBasicHelp = $state(false);
	let showAppearanceHelp = $state(false);
	let showFieldsHelp = $state(false);
	let showSectionsHelp = $state(false);

	function loadExample() {
		name = t('templateEditor.example.name');
		id = 'incidente-critico';
		icon = 'alert-triangle';
		color = '#ef4444'; // red
		fields = [
			{
				id: 1,
				key: 'prioridad',
				name: t('templateEditor.example.f1'),
				type: 'select',
				obligatory: true,
				options: ['High', 'Medium', 'Low']
			},
			{ id: 2, key: 'fecha', name: t('templateEditor.example.f2'), type: 'date', obligatory: true },
			{
				id: 3,
				key: 'reportador',
				name: t('templateEditor.example.f3'),
				type: 'user',
				obligatory: false
			},
			{
				id: 4,
				key: 'sistemas',
				name: t('templateEditor.example.f4'),
				type: 'multi-select',
				obligatory: true,
				options: ['Frontend', 'Backend', 'Database', 'Infra']
			}
		];
		sections = [
			{
				id: 1,
				key: 'descripcion',
				name: t('templateEditor.example.s1'),
				obligatory: true,
				default: ''
			},
			{
				id: 2,
				key: 'pasos',
				name: t('templateEditor.example.s2'),
				obligatory: false,
				default: '1.\n2.\n3.'
			},
			{
				id: 3,
				key: 'mitigacion',
				name: t('templateEditor.example.s3'),
				obligatory: false,
				default: ''
			}
		];
		idTouched = true;
	}

	function addField() {
		fields = [
			...fields,
			{
				id: Date.now(),
				key: '',
				name: '',
				type: 'text',
				obligatory: false
			}
		];
	}

	function removeField(index: number) {
		fields = fields.filter((_, i) => i !== index);
	}

	function addSection() {
		sections = [
			...sections,
			{
				id: Date.now(),
				key: '',
				name: '',
				obligatory: false,
				default: ''
			}
		];
	}

	function removeSection(index: number) {
		sections = sections.filter((_, i) => i !== index);
	}

	function handleFieldOptionsChange(e: Event, index: number) {
		const val = (e.target as HTMLInputElement).value;
		const arr = val
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		fields[index].options = arr;
	}

	function toggleAllowedTarget(field: TemplateField, targetId: string) {
		if (!field.allowed_targets) field.allowed_targets = {};
		if (targetId in field.allowed_targets) {
			delete field.allowed_targets[targetId];
		} else {
			field.allowed_targets[targetId] = [];
		}
	}

	function toggleAllowedRelationType(field: TemplateField, targetId: string, rType: string) {
		if (!field.allowed_targets) field.allowed_targets = {};
		if (!(targetId in field.allowed_targets)) field.allowed_targets[targetId] = [];

		const arr = field.allowed_targets[targetId];
		const idx = arr.indexOf(rType);
		if (idx >= 0) arr.splice(idx, 1);
		else arr.push(rType);
	}

	function save() {
		const finalFields = fields.map((f, i) => {
			const cleaned: TemplateField = {
				...f,
				id: i + 1,
				key: f.key || f.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') || `field_${i}`
			};
			if (cleaned.type !== 'select' && cleaned.type !== 'multi-select') {
				delete cleaned.options;
				delete cleaned.options_source;
			} else if (!cleaned.options || cleaned.options.length === 0) {
				cleaned.options = ['Option 1', 'Option 2'];
			}

			if (cleaned.type !== 'relations') {
				delete cleaned.allowed_targets;
			}

			return cleaned;
		});

		const finalSections = sections.map((s, i) => ({
			...s,
			id: i + 1,
			key: s.key || s.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') || `section_${i}`
		}));

		onsave({
			id: id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'custom',
			name: name || 'Custom',
			icon,
			color,
			default_status,
			fields: finalFields,
			sections: finalSections
		});
	}

	function kebabToPascal(str: string) {
		return str
			.split('-')
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join('');
	}

	const PreviewIcon = $derived(
		(Icons as unknown as Record<string, typeof Icons.FileText>)[kebabToPascal(icon)] ||
			Icons.FileText
	);
	const canSave = $derived(name.trim().length > 0 && id.trim().length > 0);
</script>

<div
	class="animate-in fade-in slide-in-from-bottom-4 mx-auto flex w-full max-w-5xl flex-col gap-10 pb-20 duration-[var(--motion-slow)] ease-[var(--ease-out)]"
>
	<!-- Header / Preview Card -->
	<div class="flex items-center gap-6 rounded-xl border border-border bg-surface p-6">
		<div
			class="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl"
			style="background-color: {color};"
		>
			<PreviewIcon size={32} class="text-white" />
		</div>
		<div class="flex flex-1 flex-col justify-center">
			<div class="flex w-full items-center justify-between">
				<h2 class="text-sm font-semibold tracking-wide text-muted-foreground">
					{t('templateEditor.preview')}
				</h2>
				<Button variant="secondary" size="sm" onclick={loadExample}>
					<Icons.Wand2 size={14} class="mr-2" />
					{t('templateEditor.loadExample')}
				</Button>
			</div>
			<h1 class="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
				{name || t('templateEditor.unnamed')}
			</h1>
			<div class="mt-2 flex flex-wrap gap-2">
				<span
					class="inline-flex items-center rounded-md border border-border bg-muted/30 px-2 py-0.5 text-xs font-medium text-muted-foreground"
				>
					ID: {id || '...'}
				</span>
				<span
					class="inline-flex items-center rounded-md border border-border bg-muted/30 px-2 py-0.5 text-xs font-medium text-muted-foreground"
				>
					{fields.length}
					{t('templateEditor.fieldsBadge')}
				</span>
			</div>
		</div>
	</div>

	<!-- Main Form -->
	<div class="grid grid-cols-1 gap-10 lg:grid-cols-12">
		<!-- Left Column: Basic Info & Appearance -->
		<div class="flex flex-col gap-8 lg:col-span-4">
			<section class="flex flex-col gap-5">
				<div class="flex items-center justify-between">
					<h3 class="text-lg font-bold tracking-tight">{t('templateEditor.basicInfo')}</h3>
					<IconButton
						label={t('templateEditor.basicHelp')}
						onclick={() => (showBasicHelp = !showBasicHelp)}
					>
						<Icons.Info size={16} class="text-muted-foreground" />
					</IconButton>
				</div>
				{#if showBasicHelp}
					<div class="text-sm text-muted-foreground" transition:slide|local>
						{t('templateEditor.basicHelpText')}
					</div>
				{/if}

				<div class="flex flex-col gap-2">
					<span class="text-sm font-medium">{t('templateEditor.nameLabel')}</span>
					<Input
						id="tmpl-name"
						bind:value={name}
						placeholder={t('templateEditor.namePlaceholder')}
					/>
				</div>

				<div class="flex flex-col gap-2">
					<span class="text-sm font-medium">{t('templateEditor.idLabel')}</span>
					<Input
						id="tmpl-id"
						bind:value={id}
						oninput={() => (idTouched = true)}
						placeholder={t('templateEditor.idPlaceholder')}
						class="font-mono text-muted-foreground"
					/>
					<span class="text-xs text-muted-foreground">{t('templateEditor.idHint')}</span>
				</div>
			</section>

			<section class="flex flex-col gap-5 border-t border-border/50 pt-5">
				<div class="flex items-center justify-between">
					<h3 class="text-lg font-bold tracking-tight">{t('templateEditor.appearance')}</h3>
					<IconButton
						label={t('templateEditor.appearanceHelp')}
						onclick={() => (showAppearanceHelp = !showAppearanceHelp)}
					>
						<Icons.Info size={16} class="text-muted-foreground" />
					</IconButton>
				</div>
				{#if showAppearanceHelp}
					<div class="text-sm text-muted-foreground" transition:slide|local>
						{t('templateEditor.appearanceHelpText')}
					</div>
				{/if}
				<IconPicker bind:value={icon} />
				<ColorPicker bind:value={color} />
			</section>
		</div>

		<!-- Right Column: Fields and Sections -->
		<div class="flex flex-col gap-10 lg:col-span-8">
			<!-- Fields Builder -->
			<section class="flex flex-col gap-5">
				<div class="flex items-center justify-between border-b border-border/50 pb-2">
					<div>
						<div class="flex items-center gap-2">
							<h3 class="text-lg font-bold tracking-tight">{t('templateEditor.fieldsTitle')}</h3>
							<IconButton
								label={t('templateEditor.fieldsHelp')}
								onclick={() => (showFieldsHelp = !showFieldsHelp)}
							>
								<Icons.Info size={16} class="text-muted-foreground" />
							</IconButton>
						</div>
						<p class="mt-1 text-sm text-muted-foreground">{t('templateEditor.fieldsSubtitle')}</p>
					</div>
					<Button variant="secondary" size="sm" onclick={addField}>
						<Icons.Plus size={16} class="mr-2" />
						{t('templateEditor.addField')}
					</Button>
				</div>

				{#if showFieldsHelp}
					<div class="text-sm text-muted-foreground" transition:slide|local>
						{t('templateEditor.fieldsHelpText')}
					</div>
				{/if}

				<div class="flex flex-col gap-4">
					{#each fields as field, index (field.id)}
						<div
							class="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5"
							transition:slide|local
						>
							<div class="flex items-start justify-between gap-4">
								<div class="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
									<div class="flex flex-col gap-1.5">
										<span class="text-sm font-medium">{t('templateEditor.fieldName')}</span>
										<Input
											bind:value={field.name}
											placeholder={t('templateEditor.fieldPlaceholder')}
										/>
									</div>
									<div class="flex flex-col gap-1.5">
										<span class="text-sm font-medium">{t('templateEditor.fieldType')}</span>
										<Select
											bind:value={field.type as string}
											options={FIELD_TYPES.map((ft) => ({
												id: ft,
												name: t(`templateEditor.types.${ft}`)
											}))}
										/>
									</div>
								</div>
								<IconButton
									label={t('common.delete')}
									onclick={() => removeField(index)}
									class="mt-7 shrink-0"
								>
									<Icons.Trash2 size={16} class="hover:text-destructive text-muted-foreground" />
								</IconButton>
							</div>

							<div class="flex flex-wrap items-center gap-6">
								<Checkbox bind:checked={field.obligatory} label={t('templateEditor.required')} />

								<div class="flex items-center gap-2">
									<span class="text-sm font-medium">{t('templateEditor.key')}</span>
									<input
										type="text"
										bind:value={field.key}
										class="hover:border-input focus:border-input flex h-9 w-32 rounded-md border border-transparent bg-muted/50 px-2 py-1 font-mono text-sm text-muted-foreground transition-colors focus:bg-background focus:outline-none"
										placeholder={field.name
											? field.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')
											: 'auto'}
									/>
								</div>
							</div>

							{#if field.type === 'select' || field.type === 'multi-select'}
								<div
									class="mt-2 flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-4"
									transition:slide|local
								>
									<span class="text-sm font-medium">{t('templateEditor.options')}</span>
									<Input
										value={(field.options || []).join(', ')}
										oninput={(e: Event) => handleFieldOptionsChange(e, index)}
										placeholder={t('templateEditor.optionsPlaceholder')}
									/>
									<span class="text-xs text-muted-foreground"
										>{t('templateEditor.optionsHint')}</span
									>

									{#if field.options && field.options.length > 0}
										<div class="mt-2 flex flex-wrap gap-2">
											{#each field.options as opt (opt)}
												<span
													class="inline-flex items-center rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
												>
													{opt}
												</span>
											{/each}
										</div>
									{/if}
								</div>
							{/if}

							{#if field.type === 'relations'}
								<div
									class="mt-2 flex flex-col gap-3 rounded-md border border-border bg-muted/20 p-4"
									transition:slide|local
								>
									<span class="text-sm font-medium">{t('templateEditor.allowedTargets')}</span>
									<span class="text-xs text-muted-foreground"
										>{t('templateEditor.allowedTargetsHint')}</span
									>

									<div class="mt-2 flex flex-col gap-2">
										{#each availableTemplates as tmpl (tmpl.id)}
											{@const isTargetAllowed =
												field.allowed_targets && tmpl.id in field.allowed_targets}
											<div
												class="flex flex-col gap-2 rounded-md border border-border bg-background p-3"
											>
												<label class="flex cursor-pointer items-center gap-3 text-sm font-medium">
													<Checkbox
														checked={isTargetAllowed ?? false}
														onchange={() => toggleAllowedTarget(field, tmpl.id)}
														label=""
													/>
													<span class="h-3 w-3 rounded-full" style="background-color: {tmpl.color}"
													></span>
													{tmpl.name}
												</label>

												{#if isTargetAllowed}
													<div class="ml-9 flex flex-col gap-2" transition:slide|local>
														<span class="text-xs font-medium text-muted-foreground"
															>{t('templateEditor.allowedRelationTypes')}</span
														>
														<div class="flex flex-wrap gap-2">
															{#each RELATION_TYPES as rType (rType)}
																{@const checked =
																	field.allowed_targets?.[tmpl.id]?.includes(rType) ?? false}
																<label
																	class="flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors {checked
																		? 'border-primary bg-primary/5'
																		: 'border-border bg-background hover:bg-muted/50'}"
																>
																	<input
																		type="checkbox"
																		class="sr-only"
																		{checked}
																		onchange={() =>
																			toggleAllowedRelationType(field, tmpl.id, rType)}
																	/>
																	{t(`formFields.relationTypes.${rType}`)}
																</label>
															{/each}
														</div>
													</div>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/each}

					{#if fields.length === 0}
						<div
							class="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border/50 py-10 text-muted-foreground"
						>
							<Icons.LayoutList size={32} class="mb-3 opacity-30" />
							<p class="text-sm">{t('templateEditor.noFields')}</p>
						</div>
					{/if}
				</div>
			</section>

			<!-- Sections Builder -->
			<section class="flex flex-col gap-5">
				<div class="flex items-center justify-between border-b border-border/50 pb-2">
					<div>
						<div class="flex items-center gap-2">
							<h3 class="text-lg font-bold tracking-tight">{t('templateEditor.sectionsTitle')}</h3>
							<IconButton
								label={t('templateEditor.sectionsHelp')}
								onclick={() => (showSectionsHelp = !showSectionsHelp)}
							>
								<Icons.Info size={16} class="text-muted-foreground" />
							</IconButton>
						</div>
						<p class="mt-1 text-sm text-muted-foreground">{t('templateEditor.sectionsSubtitle')}</p>
					</div>
					<Button variant="secondary" size="sm" onclick={addSection}>
						<Icons.Plus size={16} class="mr-2" />
						{t('templateEditor.addSection')}
					</Button>
				</div>

				{#if showSectionsHelp}
					<div class="text-sm text-muted-foreground" transition:slide|local>
						{t('templateEditor.sectionsHelpText')}
					</div>
				{/if}

				<div class="flex flex-col gap-3">
					{#each sections as section, index (section.id)}
						<div
							class="flex items-center gap-4 rounded-lg border border-border bg-surface p-4"
							transition:slide|local
						>
							<div class="flex-1">
								<Input
									bind:value={section.name}
									placeholder={t('templateEditor.sectionPlaceholder')}
								/>
							</div>

							<div class="flex items-center gap-6">
								<Checkbox bind:checked={section.obligatory} label={t('templateEditor.required')} />
								<IconButton
									label={t('templateEditor.removeSection')}
									onclick={() => removeSection(index)}
								>
									<Icons.Trash2 size={16} class="hover:text-destructive text-muted-foreground" />
								</IconButton>
							</div>
						</div>
					{/each}
				</div>
			</section>
		</div>
	</div>

	<!-- Bottom Action Bar -->
	<div class="mt-12 flex justify-end gap-4 border-t border-border/50 pt-6 pb-4">
		<Button variant="ghost" onclick={oncancel}>{t('common.cancel')}</Button>
		<Button variant="primary" onclick={save} disabled={!canSave}>
			<Icons.Save size={18} class="mr-2" />
			{t('common.save')}
		</Button>
	</div>
</div>
