<script lang="ts">
	import { t } from '$lib/ui/strings';
	import { Button, Card } from '$lib/ui';
	import IconPicker from './IconPicker.svelte';
	import ColorPicker from './ColorPicker.svelte';
	import type { Template, TemplateField, TemplateSection, FieldType } from '$lib/types/index.ts';
	import { FIELD_TYPES, RELATION_TYPES } from '$lib/types/index.ts';
	import * as Icons from '@lucide/svelte';
	import { slide, fade } from 'svelte/transition';
	import { getStores } from '$lib/state';

	const stores = getStores();
	const availableTemplates = $derived(stores.templates.templates);

	let { 
		initialTemplate,
		onsave, 
		oncancel 
	} = $props<{ 
		initialTemplate?: Template, 
		onsave: (t: Template) => void, 
		oncancel: () => void 
	}>();

	// Local state
	let name = $state(initialTemplate?.name || '');
	let id = $state(initialTemplate?.id || '');
	let icon = $state(initialTemplate?.icon || 'file-text');
	let color = $state(initialTemplate?.color || '#0ea5e9');
	let default_status = $state(initialTemplate?.default_status || 'open');
	
	let fields = $state<TemplateField[]>(initialTemplate?.fields ? JSON.parse(JSON.stringify(initialTemplate.fields)) : []);
	let sections = $state<TemplateSection[]>(initialTemplate?.sections ? JSON.parse(JSON.stringify(initialTemplate.sections)) : [
		{ id: 1, key: 'description', name: 'Description', obligatory: true, default: '' }
	]);

	// Keep ID in sync with Name until user touches it
	let idTouched = $state(!!initialTemplate);
	
	let showTypeHelp = $state(false);
	let showBasicHelp = $state(false);
	let showAppearanceHelp = $state(false);
	let showFieldsHelp = $state(false);
	let showSectionsHelp = $state(false);
	
	function handleNameInput(e: Event) {
		const val = (e.target as HTMLInputElement).value;
		name = val;
		if (!idTouched) {
			id = val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
		}
	}
	
	function handleIdInput(e: Event) {
		idTouched = true;
		id = (e.target as HTMLInputElement).value;
	}

	function loadExample() {
		name = t('templateEditor.example.name');
		id = 'incidente-critico';
		icon = 'alert-triangle';
		color = '#ef4444'; // red
		fields = [
			{ id: 1, key: 'prioridad', name: t('templateEditor.example.f1'), type: 'select', obligatory: true, options: ['High', 'Medium', 'Low'] },
			{ id: 2, key: 'fecha', name: t('templateEditor.example.f2'), type: 'date', obligatory: true },
			{ id: 3, key: 'reportador', name: t('templateEditor.example.f3'), type: 'user', obligatory: false },
			{ id: 4, key: 'sistemas', name: t('templateEditor.example.f4'), type: 'multi-select', obligatory: true, options: ['Frontend', 'Backend', 'Database', 'Infra'] }
		];
		sections = [
			{ id: 1, key: 'descripcion', name: t('templateEditor.example.s1'), obligatory: true, default: '' },
			{ id: 2, key: 'pasos', name: t('templateEditor.example.s2'), obligatory: false, default: '1.\n2.\n3.' },
			{ id: 3, key: 'mitigacion', name: t('templateEditor.example.s3'), obligatory: false, default: '' }
		];
		idTouched = true;
	}

	function addField() {
		fields = [...fields, {
			id: Date.now(),
			key: '',
			name: '',
			type: 'text',
			obligatory: false
		}];
	}

	function removeField(index: number) {
		fields = fields.filter((_, i) => i !== index);
	}

	function addSection() {
		sections = [...sections, {
			id: Date.now(),
			key: '',
			name: '',
			obligatory: false,
			default: ''
		}];
	}

	function removeSection(index: number) {
		sections = sections.filter((_, i) => i !== index);
	}

	function handleFieldOptionsChange(e: Event, index: number) {
		const val = (e.target as HTMLInputElement).value;
		const arr = val.split(',').map(s => s.trim()).filter(Boolean);
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
		// Clean up and auto-generate keys if empty
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
				// ERS requirement: select fields must have options
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
		return str.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
	}

	const PreviewIcon = $derived((Icons as Record<string, any>)[kebabToPascal(icon)] || Icons.FileText);
	const canSave = $derived(name.trim().length > 0 && id.trim().length > 0);
</script>

<div class="flex flex-col gap-8 w-full max-w-5xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
	
	<!-- Header / Preview Card -->
	<Card class="overflow-hidden border-2 transition-colors duration-300 shadow-lg" style="border-color: {color}40;">
		<div class="bg-surface/30 p-6 sm:p-8 flex items-center gap-6 relative overflow-hidden">
			<!-- Decorative background blob -->
			<div class="absolute -right-10 -top-10 w-40 h-40 rounded-full blur-3xl opacity-20 transition-colors duration-500" style="background-color: {color};"></div>
			
			<div 
				class="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl shadow-xl transition-all duration-300 scale-100"
				style="background: linear-gradient(135deg, {color}, {color}99);"
			>
				<PreviewIcon size={40} class="text-white" />
			</div>
			<div class="flex flex-col z-10 flex-1">
				<div class="flex justify-between items-center w-full">
					<h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t('templateEditor.preview')}</h2>
					<Button variant="secondary" size="sm" onclick={loadExample} class="opacity-80 hover:opacity-100">
						<Icons.Wand2 size={14} class="mr-2" />
						{t('templateEditor.loadExample')}
					</Button>
				</div>
				<h1 class="text-3xl sm:text-4xl font-bold tracking-tight mt-1 text-foreground">
					{name || t('templateEditor.unnamed')}
				</h1>
				<div class="flex gap-2 mt-3 flex-wrap">
					<span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold text-foreground bg-background/50 shadow-sm">
						ID: {id || '...'}
					</span>
					<span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold text-foreground bg-background/50 shadow-sm">
						{fields.length} {t('templateEditor.fieldsBadge')}
					</span>
				</div>
			</div>
		</div>
	</Card>

	<!-- Main Form -->
	<div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
		<!-- Left Column: Basic Info & Appearance -->
		<div class="lg:col-span-4 flex flex-col gap-6">
			<section class="flex flex-col gap-4">
				<div class="flex items-center gap-2">
					<h3 class="text-lg font-bold tracking-tight">{t('templateEditor.basicInfo')}</h3>
					<button 
						type="button" 
						class="text-muted-foreground hover:text-primary transition-colors" 
						onclick={() => showBasicHelp = !showBasicHelp}
						title={t('templateEditor.basicHelp')}
						aria-label={t('templateEditor.basicHelp')}
					>
						<Icons.Info size={16} />
					</button>
				</div>
				{#if showBasicHelp}
					<div class="p-3 text-sm bg-primary/5 border border-primary/20 rounded-md text-foreground leading-relaxed" transition:slide|local>
						{t('templateEditor.basicHelpText')}
					</div>
				{/if}
				
				<div class="flex flex-col gap-2">
					<label for="tmpl-name" class="text-sm font-medium">{t('templateEditor.nameLabel')}</label>
					<input 
						id="tmpl-name"
						type="text" 
						value={name}
						oninput={handleNameInput}
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						placeholder="Ej. Requerimiento Técnico"
					/>
				</div>

				<div class="flex flex-col gap-2">
					<label for="tmpl-id" class="text-sm font-medium">{t('templateEditor.idLabel')}</label>
					<input 
						id="tmpl-id"
						type="text" 
						value={id}
						oninput={handleIdInput}
						class="flex h-10 w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm ring-offset-background font-mono text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						placeholder="ej. requerimiento-tecnico"
					/>
					<span class="text-xs text-muted-foreground">{t('templateEditor.idHint')}</span>
				</div>
			</section>

			<section class="flex flex-col gap-4 pt-4 border-t border-border/50">
				<div class="flex items-center gap-2">
					<h3 class="text-lg font-bold tracking-tight">{t('templateEditor.appearance')}</h3>
					<button 
						type="button" 
						class="text-muted-foreground hover:text-primary transition-colors" 
						onclick={() => showAppearanceHelp = !showAppearanceHelp}
						title={t('templateEditor.appearanceHelp')}
						aria-label={t('templateEditor.appearanceHelp')}
					>
						<Icons.Info size={16} />
					</button>
				</div>
				{#if showAppearanceHelp}
					<div class="p-3 text-sm bg-primary/5 border border-primary/20 rounded-md text-foreground leading-relaxed" transition:slide|local>
						{t('templateEditor.appearanceHelpText')}
					</div>
				{/if}
				<IconPicker bind:value={icon} />
				<ColorPicker bind:value={color} />
			</section>
		</div>

		<!-- Right Column: Fields and Sections -->
		<div class="lg:col-span-8 flex flex-col gap-10">
			<!-- Fields Builder -->
			<section class="flex flex-col gap-4">
				<div class="flex items-center justify-between">
					<div>
						<div class="flex items-center gap-2">
							<h3 class="text-lg font-bold tracking-tight">{t('templateEditor.fieldsTitle')}</h3>
							<button 
								type="button" 
								class="text-muted-foreground hover:text-primary transition-colors" 
								onclick={() => showFieldsHelp = !showFieldsHelp}
								title={t('templateEditor.fieldsHelp')}
								aria-label={t('templateEditor.fieldsHelp')}
							>
								<Icons.Info size={16} />
							</button>
						</div>
						<p class="text-sm text-muted-foreground mt-1">{t('templateEditor.fieldsSubtitle')}</p>
					</div>
					<Button variant="secondary" size="sm" onclick={addField}>
						<Icons.Plus size={16} class="mr-2" /> {t('templateEditor.addField')}
					</Button>
				</div>
				
				{#if showFieldsHelp}
					<div class="p-4 text-sm bg-primary/5 border border-primary/20 rounded-md text-foreground leading-relaxed" transition:slide|local>
						{t('templateEditor.fieldsHelpText')}
					</div>
				{/if}

				<div class="flex flex-col gap-3">
					{#each fields as field, index (field.id)}
						<div class="group relative flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm transition-all hover:shadow-md" transition:slide|local>
							<button 
								class="absolute right-3 top-3 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
								onclick={() => removeField(index)}
								aria-label="Remove field"
								title={t('common.delete')}
							>
								<Icons.Trash2 size={18} />
							</button>

							<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pr-6">
								<div class="flex flex-col gap-1.5">
									<span class="block text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('templateEditor.fieldName')}</span>
									<input 
										type="text" 
										bind:value={field.name}
										class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
										placeholder="Ej. Prioridad"
									/>
								</div>
								<div class="flex flex-col gap-1.5">
									<div class="flex items-center gap-2">
										<span class="block text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('templateEditor.fieldType')}</span>
										{#if index === 0}
											<button 
												type="button" 
												class="text-muted-foreground hover:text-primary transition-colors" 
												onclick={() => showTypeHelp = !showTypeHelp}
												title={t('templateEditor.typesHelp')}
												aria-label={t('templateEditor.typesHelp')}
											>
												<Icons.Info size={14} />
											</button>
										{/if}
									</div>
									<select 
										bind:value={field.type}
										class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
									>
										{#each FIELD_TYPES as ft}
											<option value={ft}>{t(`templateEditor.types.${ft}`)}</option>
										{/each}
									</select>
								</div>
							</div>

							{#if index === 0 && showTypeHelp}
								<div class="mt-1 p-3 text-xs bg-primary/5 border border-primary/20 rounded-md text-foreground whitespace-pre-line leading-relaxed" transition:slide|local>
									{t('templateEditor.typesHelpText')}
								</div>
							{/if}

							<div class="flex items-center gap-4 mt-2">
								<label class="flex items-center gap-2 text-sm cursor-pointer">
									<input type="checkbox" bind:checked={field.obligatory} class="rounded border-input text-primary focus:ring-primary h-4 w-4" />
									{t('templateEditor.required')}
								</label>
								<div class="flex items-center gap-2">
									<span class="block text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('templateEditor.key')}</span>
									<input 
										type="text" 
										bind:value={field.key}
										class="flex h-7 w-32 rounded border border-transparent bg-muted/50 px-2 py-1 text-xs font-mono text-muted-foreground hover:border-input focus:border-input focus:bg-background focus:outline-none"
										placeholder={field.name ? field.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') : 'auto'}
									/>
								</div>
							</div>

							{#if field.type === 'select' || field.type === 'multi-select'}
								<div class="flex flex-col gap-1.5 mt-2 p-3 bg-muted/30 rounded-md border border-border/50" transition:slide|local>
									<span class="block text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('templateEditor.options')}</span>
									<input 
										type="text" 
										value={(field.options || []).join(', ')}
										oninput={(e) => handleFieldOptionsChange(e, index)}
										class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
										placeholder="Alta, Media, Baja"
									/>
									<span class="text-[10px] text-muted-foreground">{t('templateEditor.optionsHint')}</span>
									
									{#if field.options && field.options.length > 0}
										<div class="flex flex-wrap gap-1 mt-2">
											{#each field.options as opt}
												<span class="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
													{opt}
												</span>
											{/each}
										</div>
									{/if}
								</div>
							{/if}

							{#if field.type === 'relations'}
								<div class="flex flex-col gap-3 mt-2 p-3 bg-muted/30 rounded-md border border-border/50" transition:slide|local>
									<div class="flex flex-col gap-1.5">
										<span class="block text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('templateEditor.allowedTargets')}</span>
										<span class="text-[10px] text-muted-foreground">{t('templateEditor.allowedTargetsHint')}</span>
										<div class="flex flex-col gap-2 mt-1">
											{#each availableTemplates as tmpl (tmpl.id)}
												{@const isTargetAllowed = field.allowed_targets && tmpl.id in field.allowed_targets}
												<div class="flex flex-col gap-2 p-2 border {isTargetAllowed ? 'border-primary/30 bg-primary/5' : 'border-border bg-surface'} rounded">
													<label class="flex items-center gap-2 text-xs font-medium cursor-pointer">
														<input type="checkbox" class="sr-only" checked={isTargetAllowed} onchange={() => toggleAllowedTarget(field, tmpl.id)} />
														<div class="w-4 h-4 rounded border flex items-center justify-center {isTargetAllowed ? 'bg-primary border-primary' : 'border-border bg-background'}">
															{#if isTargetAllowed}<Icons.Check size={12} class="text-primary-foreground" />{/if}
														</div>
														<span class="w-3 h-3 rounded-full" style="background-color: {tmpl.color}"></span>
														{tmpl.name}
													</label>
													
													{#if isTargetAllowed}
														<div class="ml-6 flex flex-col gap-1 mt-1" transition:slide|local>
															<span class="text-[10px] text-muted-foreground uppercase tracking-wider">{t('templateEditor.allowedRelationTypes')}</span>
															<div class="flex flex-wrap gap-2 mt-1">
																{#each RELATION_TYPES as rType}
																	{@const checked = field.allowed_targets[tmpl.id].includes(rType)}
																	<label class="flex items-center gap-1.5 text-[11px] cursor-pointer bg-background border {checked ? 'border-primary ring-1 ring-primary' : 'border-border'} px-2 py-1 rounded">
																		<input type="checkbox" class="sr-only" checked={checked} onchange={() => toggleAllowedRelationType(field, tmpl.id, rType)} />
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
								</div>
							{/if}
						</div>
					{/each}
					
					{#if fields.length === 0}
						<div class="flex flex-col items-center justify-center p-8 rounded-lg border-2 border-dashed border-border/50 text-muted-foreground">
							<Icons.LayoutList size={32} class="mb-2 opacity-20" />
							<p class="text-sm">{t('templateEditor.noFields')}</p>
						</div>
					{/if}
				</div>
			</section>

			<!-- Sections Builder -->
			<section class="flex flex-col gap-4">
				<div class="flex items-center justify-between">
					<div>
						<div class="flex items-center gap-2">
							<h3 class="text-lg font-bold tracking-tight">{t('templateEditor.sectionsTitle')}</h3>
							<button 
								type="button" 
								class="text-muted-foreground hover:text-primary transition-colors" 
								onclick={() => showSectionsHelp = !showSectionsHelp}
								title={t('templateEditor.sectionsHelp')}
								aria-label={t('templateEditor.sectionsHelp')}
							>
								<Icons.Info size={16} />
							</button>
						</div>
						<p class="text-sm text-muted-foreground mt-1">{t('templateEditor.sectionsSubtitle')}</p>
					</div>
					<Button variant="secondary" size="sm" onclick={addSection}>
						<Icons.Plus size={16} class="mr-2" /> {t('templateEditor.addSection')}
					</Button>
				</div>
				
				{#if showSectionsHelp}
					<div class="p-4 text-sm bg-primary/5 border border-primary/20 rounded-md text-foreground leading-relaxed" transition:slide|local>
						{t('templateEditor.sectionsHelpText')}
					</div>
				{/if}

				<div class="flex flex-col gap-3">
					{#each sections as section, index (section.id)}
						<div class="group relative flex items-center gap-4 rounded-lg border border-border bg-surface p-3 shadow-sm transition-all hover:shadow-md" transition:slide|local>
							<div class="flex-1">
								<input 
									type="text" 
									bind:value={section.name}
									class="flex h-9 w-full rounded-md border-0 bg-transparent px-2 py-1 text-sm font-semibold hover:bg-muted/50 focus:bg-background focus:ring-1 focus:ring-ring"
									placeholder="Nombre de la sección"
								/>
							</div>
							
							<div class="flex items-center gap-4">
								<label class="flex items-center gap-2 text-sm cursor-pointer">
									<input type="checkbox" bind:checked={section.obligatory} class="rounded border-input text-primary focus:ring-primary h-4 w-4" />
									{t('templateEditor.required')}
								</label>
								<button 
									class="text-muted-foreground transition-colors hover:text-destructive p-2 rounded-md hover:bg-destructive/10"
									onclick={() => removeSection(index)}
									aria-label="Remove section"
									title={t('common.delete')}
								>
									<Icons.Trash2 size={16} />
								</button>
							</div>
						</div>
					{/each}
				</div>
			</section>
		</div>
	</div>

	<!-- Bottom Action Bar -->
	<div class="mt-12 pt-6 border-t border-border/50 flex justify-end gap-4 pb-4">
		<Button variant="ghost" onclick={oncancel}>{t('common.cancel')}</Button>
		<Button variant="primary" onclick={save} disabled={!canSave} class="px-8 shadow-lg shadow-primary/25">
			<Icons.Save size={18} class="mr-2" /> {t('common.save')}
		</Button>
	</div>
</div>
