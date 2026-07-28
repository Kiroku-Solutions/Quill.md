<!--
	FormFields.svelte — template-driven form rows for the editor
	(sub-phase 6G, ERS FR-2 / FR-8 / FR-9). One row per
	`template.fields[]` in ascending `id` order. Each row maps the
	field's `type` to the matching 6B primitive (or a chip
	multi-select for `multi-select` / `relations`). `longtext`
	fields are skipped — they live in the section tabs of the
	parent `EditorPanel`. `issueType` is rendered as a disabled
	select (type cannot change after creation; the type-change
	confirm is a follow-up).
-->
<script lang="ts">
	import { getStores } from '$lib/state';
	import { t } from '$lib/ui/strings';
	import { Modal, Button } from '$lib/ui';
	import { RELATION_TYPES, type Issue, type Relation, type TemplateField } from '$lib/types';

	type Option = { id: string; name: string; type?: string };

	const { editor, issues, templates, config } = getStores();

	const template = $derived(
		editor.draft ? (templates.byType.get(editor.draft.issue.fields.issueType) ?? null) : null
	);

	const issue = $derived(editor.draft ? (editor.draft.issue as Issue) : null);

	const fields = $derived(
		template ? template.fields.filter((f) => f.type !== 'longtext').sort((a, b) => a.id - b.id) : []
	);

	function errorFor(key: string): string | null {
		const err = editor.errors.find((e) => e.field === key);
		return err ? err.message : null;
	}

	function fieldId(key: string): string {
		return `field-${template?.id ?? 'x'}-${key}`;
	}

	/** Resolve the current value. Mirrors `editor.patchField`'s write split. */
	function currentValue(field: TemplateField): unknown {
		void editor.errors; // Force reactivity on $state.raw mutations (errors getter reads revision)
		if (!issue) return undefined;
		switch (field.key) {
			case 'title':
				return issue.fields.title;
			case 'author':
				return issue.fields.author;
			case 'issueType':
				return issue.fields.issueType;
			case 'status':
				return issue.fields.status;
			case 'assignee':
				return issue.fields.assignee ?? '';
			case 'labels':
				return issue.fields.labels;
			case 'relations':
				return issue.fields.relations.map((r: Relation) => r.id);
			case 'start_date':
				return issue.fields.startDate ?? '';
			case 'end_date':
				return issue.fields.endDate ?? '';
			case 'duration':
				return issue.fields.duration ?? '';
			case 'sprint_id':
				return issue.fields.sprintId ?? '';
			case 'estimate':
				return issue.fields.estimate ?? '';
			default:
				return issue.customFields[field.key];
		}
	}

	function multiSelectOptions(field: TemplateField): Option[] {
		if (field.options_source === 'config.labels' && config.config) {
			return config.config.labels.map((l) => ({ id: l.id, name: l.name }));
		}
		return (field.options ?? []).map((o) => ({ id: o, name: o }));
	}

	function userOptions(): Option[] {
		return config.config ? config.config.users.map((u) => ({ id: u.id, name: u.name })) : [];
	}

	function statusOptions(): Option[] {
		return config.config ? config.config.statuses.map((s) => ({ id: s.id, name: s.name })) : [];
	}

	function relationTitle(id: number): string {
		const li = issues.byId.get(id);
		return li ? li.issue.fields.title : `#${id}`;
	}

	function relationOptions(field: TemplateField): Option[] {
		if (!issue) return [];
		const out: Option[] = [];
		for (const li of issues.byId.values()) {
			if (li.issue.id !== issue.id) {
				if (
					!field.allowed_targets ||
					Object.keys(field.allowed_targets).length === 0 ||
					li.issue.fields.issueType in field.allowed_targets
				) {
					out.push({
						id: String(li.issue.id),
						name: li.issue.fields.title,
						type: li.issue.fields.issueType
					});
				}
			}
		}
		return out;
	}

	function systemKeyFor(key: string): string {
		if (key === 'start_date') return 'startDate';
		if (key === 'end_date') return 'endDate';
		if (key === 'issue_type') return 'issueType';
		if (key === 'sprint_id') return 'sprintId';
		return key;
	}

	function toggleMulti(field: TemplateField, id: string): void {
		if (!issue) return;
		const current = currentValue(field);
		const list = Array.isArray(current) ? (current as string[]).slice() : [];
		const idx = list.indexOf(id);
		if (idx >= 0) list.splice(idx, 1);
		else list.push(id);
		editor.patchField(systemKeyFor(field.key), list);
	}

	function changeRelationType(id: number, newType: string): void {
		if (!issue) return;
		const next = issue.fields.relations.map((r) =>
			r.id === id ? { ...r, type: newType as any } : r
		);
		editor.patchField('relations', next);
	}

	function removeRelation(id: number): void {
		if (!issue) return;
		const next = issue.fields.relations.filter((r) => r.id !== id);
		editor.patchField('relations', next);
	}

	let newRelationId = $state<string>('');
	let newRelationType = $state<string>('relates_to');

	function addRelation(): void {
		if (!issue || !newRelationId) return;
		const id = Number(newRelationId);
		if (issue.fields.relations.some((r) => r.id === id)) return;
		const next = [...issue.fields.relations, { type: newRelationType as any, id }];
		editor.patchField('relations', next);
		newRelationId = '';
		newRelationType = 'relates_to';
	}

	function selectOptionsFor(field: TemplateField): Option[] {
		if (field.key === 'status') return statusOptions();
		if (field.key === 'issueType')
			return templates.templates.map((t) => ({ id: t.id, name: t.name }));
		if (field.options_source === 'issues.sprints') {
			return issues.issues
				.map((li) => li.issue)
				.filter((i) => i.fields.issueType === 'sprint')
				.map((s) => ({
					id: String(s.id),
					name: s.fields.title
				}));
		}
		return (field.options ?? []).map((o) => ({ id: o, name: o }));
	}

	// ── Issue type change confirm (sub-phase 7D) ──────────────────────────
	// When the user picks a different issue type than the current
	// draft, we hold the change in a local `pendingType` and only
	// commit it after the user confirms in the dialog. This avoids
	// surprising template reloads and lost data.
	let pendingType: string | null = $state(null);
	let confirmOpen = $state(false);

	const pendingTypeName = $derived.by(() => {
		if (pendingType === null) return '';
		return templates.templates.find((t) => t.id === pendingType)?.name ?? pendingType;
	});
	const currentTypeName = $derived.by(() => {
		if (!editor.draft) return '';
		const id = editor.draft.issue.fields.issueType;
		return templates.templates.find((t) => t.id === id)?.name ?? id;
	});

	function onTypeChangeAttempt(next: string): void {
		if (!editor.draft) return;
		if (next === editor.draft.issue.fields.issueType) {
			pendingType = null;
			return;
		}
		pendingType = next;
		confirmOpen = true;
	}

	function cancelTypeChange(): void {
		pendingType = null;
		confirmOpen = false;
	}

	function commitTypeChange(): void {
		if (!editor.draft || pendingType === null) return;
		const next = pendingType;
		pendingType = null;
		confirmOpen = false;
		editor.patchField('issueType', next);
		// Reload the editor from the issues store with the new template
		// defaults applied. discard() re-clones from the source.
		editor.discard();
	}

	const sprintStories = $derived.by(() => {
		void editor.errors; // React to patches
		if (!issue || issue.fields.issueType !== 'sprint') return [];
		const all = issues.issues.map((li) => li.issue);
		return all.filter((other) => {
			if (other.fields.issueType !== 'user-story') return false;
			// check if Sprint links to this story
			const linksToOther = issue.fields.relations.some((r) => r.id === other.id);
			// check if story links to this Sprint
			const otherLinksToSprint = other.fields.relations.some((r) => r.id === issue.id);
			return linksToOther || otherLinksToSprint;
		});
	});

	const storyCount = $derived(sprintStories.length);
	const storyPoints = $derived(
		sprintStories.reduce((acc, story) => acc + (story.fields.estimate || 0), 0)
	);
	const completedCount = $derived(
		sprintStories.filter((s) => s.fields.status === 'done' || s.fields.status === 'closed').length
	);
	const avance = $derived(storyCount > 0 ? Math.round((completedCount / storyCount) * 100) : 0);

	const ringClass = 'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';
</script>

{#if template && issue}
	<div class="flex flex-col gap-6" data-testid="form-fields">
		{#if issue.fields.issueType === 'sprint'}
			<div
				class="overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-soft transition-all duration-[var(--motion-base)]"
			>
				<div class="mb-4 flex items-center justify-between border-b border-border/60 pb-3">
					<h3 class="text-xs font-bold tracking-wider text-muted-foreground uppercase">
						{t('sprint.progress')}
					</h3>
					<span class="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-bold text-warning">
						{issue.fields.title}
					</span>
				</div>

				<div class="mb-4 grid grid-cols-3 gap-4">
					<div class="flex flex-col">
						<span class="text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
							>{t('sprint.stories')}</span
						>
						<span class="mt-1 font-display text-2xl font-bold text-foreground">{storyCount}</span>
					</div>
					<div class="flex flex-col">
						<span class="text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
							>{t('sprint.points')}</span
						>
						<span class="mt-1 font-display text-2xl font-bold text-foreground"
							>{storyPoints} {t('sprint.pointsUnit')}</span
						>
					</div>
					<div class="flex flex-col">
						<span class="text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
							>{t('sprint.progressLabel')}</span
						>
						<span class="mt-1 font-display text-2xl font-bold text-success">{avance}%</span>
					</div>
				</div>

				<!-- Progress Bar -->
				<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
					<div
						class="h-full bg-success transition-all duration-[var(--motion-base)] ease-out"
						style="width: {avance}%"
					></div>
				</div>
			</div>
		{/if}
		{#each fields as field (field.id)}
			{@const fid = fieldId(field.key)}
			{@const err = errorFor(field.key)}
			{@const value = currentValue(field)}
			<div class="flex flex-col gap-1" data-field-key={field.key} data-field-type={field.type}>
				<label for={fid} class="flex items-center pb-1">
					<span class="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
						{field.name}
						{#if field.obligatory}<span class="text-error" aria-hidden="true">&nbsp;*</span>
							<span class="sr-only">{t('common.required')}</span>{/if}
					</span>
				</label>

				{#if field.type === 'text' || field.type === 'date'}
					<input
						id={fid}
						type={field.type}
						class="w-full rounded-md border bg-background text-foreground {err
							? 'border-error ring-1 ring-error'
							: 'border-border focus:border-transparent'} px-3 py-2 text-sm focus:outline-none {ringClass} transition-shadow"
						value={(value as string | undefined) ?? ''}
						aria-invalid={err ? 'true' : undefined}
						oninput={(e) =>
							editor.patchField(
								systemKeyFor(field.key),
								(e.currentTarget as HTMLInputElement).value
							)}
					/>
				{:else if field.type === 'number'}
					<input
						id={fid}
						type="number"
						class="w-full rounded-md border bg-background text-foreground {err
							? 'border-error ring-1 ring-error'
							: 'border-border focus:border-transparent'} px-3 py-2 text-sm focus:outline-none {ringClass} transition-shadow"
						value={value === null || value === undefined ? '' : String(value)}
						aria-invalid={err ? 'true' : undefined}
						oninput={(e) => {
							const raw = (e.currentTarget as HTMLInputElement).value;
							const sKey = systemKeyFor(field.key);
							if (raw === '') editor.patchField(sKey, null);
							else {
								const n = Number(raw);
								editor.patchField(sKey, Number.isFinite(n) ? n : raw);
							}
						}}
					/>
				{:else if field.type === 'select' || field.type === 'user'}
					{@const opts = field.type === 'user' ? userOptions() : selectOptionsFor(field)}
					{@const placeholder =
						field.type === 'user'
							? t('formFields.assigneePlaceholder')
							: t('formFields.selectPlaceholder')}
					<div class="relative w-full">
						<select
							id={fid}
							class="w-full appearance-none rounded-md border bg-background text-foreground {err
								? 'border-error ring-1 ring-error'
								: 'border-border focus:border-transparent'} py-2 pr-10 pl-3 text-sm focus:outline-none {ringClass} transition-shadow"
							value={(value as string | undefined) ?? ''}
							aria-invalid={err ? 'true' : undefined}
							onchange={(e) => {
								const v = (e.currentTarget as HTMLSelectElement).value;
								if (systemKeyFor(field.key) === 'issueType') {
									onTypeChangeAttempt(v);
									if (e.currentTarget instanceof HTMLSelectElement && issue) {
										e.currentTarget.value = issue.fields.issueType;
									}
									return;
								}
								const next =
									(field.type === 'user' || field.options_source === 'issues.sprints') && v === ''
										? null
										: v;
								editor.patchField(systemKeyFor(field.key), next);
							}}
						>
							<option value="">{placeholder}</option>
							{#each opts as opt (opt.id)}
								<option value={opt.id}>{opt.name}</option>
							{/each}
						</select>
						<div
							class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
								><path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M19 9l-7 7-7-7"
								></path></svg
							>
						</div>
					</div>
					{#if field.key === 'issueType'}
						<p class="text-xs opacity-60">
							{t('formFields.issueTypeDisabledNote')}
						</p>
					{/if}
				{:else if field.type === 'multi-select'}
					{@const opts = multiSelectOptions(field)}
					{@const selected = (() => {
						void editor.errors;
						return Array.isArray(value) ? (value as string[]) : [];
					})()}
					<div
						id={fid}
						role="group"
						aria-label={field.name}
						class="flex flex-wrap gap-1 {err ? 'rounded p-1 ring-1 ring-error' : ''}"
					>
						{#each opts as opt (opt.id)}
							{@const on = selected.includes(opt.id)}
							<button
								type="button"
								class="rounded-full border px-2 py-1 text-[11px] font-bold tracking-widest transition-colors {ringClass} {on
									? 'border-foreground bg-foreground text-background'
									: 'border-border bg-transparent text-muted-foreground hover:border-muted'}"
								aria-pressed={on}
								onclick={() => toggleMulti(field, opt.id)}
							>
								{opt.name}
							</button>
						{/each}
					</div>
				{:else if field.type === 'relations'}
					{@const currentRelations = (() => {
						void editor.errors;
						return issue?.fields.relations ?? [];
					})()}
					<div
						id={fid}
						class="flex flex-col gap-3 rounded-md border border-border p-3 {err
							? 'border-error ring-1 ring-error'
							: ''}"
					>
						{#each currentRelations as rel (rel.id)}
							{@const relTargetIssueType = issues.byId.get(rel.id)?.issue.fields.issueType}
							{@const allowedRelTypes =
								relTargetIssueType &&
								field.allowed_targets &&
								relTargetIssueType in field.allowed_targets &&
								field.allowed_targets[relTargetIssueType].length > 0
									? field.allowed_targets[relTargetIssueType]
									: RELATION_TYPES}
							<div class="flex items-center gap-2">
								<div class="min-w-0 flex-1">
									<select
										class="w-full appearance-none rounded border border-border bg-surface py-1.5 pr-6 pl-2 text-xs text-foreground transition-shadow focus:border-transparent focus:ring-2 focus:ring-primary focus:outline-none"
										value={rel.type}
										onchange={(e) => changeRelationType(rel.id, e.currentTarget.value)}
									>
										{#each allowedRelTypes as rType}
											<option value={rType}>{t(`formFields.relationTypes.${rType}`)}</option>
										{/each}
									</select>
								</div>
								<span
									class="flex-1 truncate text-sm font-medium text-foreground"
									title={relationTitle(rel.id)}
								>
									{relationTitle(rel.id)}
								</span>
								<button
									type="button"
									class="p-1 text-muted-foreground transition-colors hover:text-error"
									aria-label={t('formFields.removeRelationAria')}
									onclick={() => removeRelation(rel.id)}
								>
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
										><path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M6 18L18 6M6 6l12 12"
										></path></svg
									>
								</button>
							</div>
						{/each}

						<div
							class="mt-1 flex flex-col items-start gap-2 border-t border-border pt-3 sm:flex-row sm:items-center"
						>
							<div class="relative w-full min-w-0 flex-1 sm:w-auto">
								<select
									class="w-full appearance-none rounded border border-border bg-background py-1.5 pr-8 pl-2 text-xs text-foreground transition-shadow focus:border-transparent focus:ring-2 focus:ring-primary focus:outline-none"
									bind:value={newRelationId}
								>
									<option value="">{t('formFields.selectPlaceholder')}</option>
									{#each relationOptions(field) as opt}
										<option value={opt.id}>{opt.name}</option>
									{/each}
								</select>
								<div
									class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-muted-foreground"
								>
									<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"
										><path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M19 9l-7 7-7-7"
										></path></svg
									>
								</div>
							</div>

							{#if newRelationId}
								{@const targetIssueType = issues.byId.get(Number(newRelationId))?.issue.fields
									.issueType}
								{@const allowedRelTypesForNew =
									targetIssueType &&
									field.allowed_targets &&
									targetIssueType in field.allowed_targets &&
									field.allowed_targets[targetIssueType].length > 0
										? field.allowed_targets[targetIssueType]
										: RELATION_TYPES}
								<div class="relative w-full min-w-0 flex-1 sm:w-auto">
									<select
										class="w-full appearance-none rounded border border-border bg-background py-1.5 pr-8 pl-2 text-xs text-foreground transition-shadow focus:border-transparent focus:ring-2 focus:ring-primary focus:outline-none"
										bind:value={newRelationType}
									>
										{#each allowedRelTypesForNew as rType}
											<option value={rType}>{t(`formFields.relationTypes.${rType}`)}</option>
										{/each}
									</select>
									<div
										class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-muted-foreground"
									>
										<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"
											><path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M19 9l-7 7-7-7"
											></path></svg
										>
									</div>
								</div>
							{/if}

							<button
								type="button"
								class="shrink-0 rounded bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
								title={t('formFields.addRelation')}
								disabled={!newRelationId}
								onclick={addRelation}
							>
								+
							</button>
						</div>
					</div>
				{/if}

				{#if err}
					<p class="text-xs font-medium text-error" role="alert">{err}</p>
				{/if}
			</div>
		{/each}
	</div>

	<Modal open={confirmOpen} onclose={cancelTypeChange} class="">
		<div role="alertdialog" aria-modal="true" aria-labelledby="change-type-title">
			<h3 id="change-type-title" class="text-lg font-semibold">
				{t('formFields.changeTypeTitle')}
			</h3>
			<p
				class="my-4 rounded-md border border-[var(--color-cb-yellow)] bg-[var(--color-cb-yellow)]/10 px-4 py-3 text-sm font-medium text-foreground"
			>
				{t('formFields.changeTypeBody', { old: currentTypeName, new: pendingTypeName })}
			</p>
			<div class="mt-6 flex items-center justify-end gap-3">
				<Button variant="ghost" onclick={cancelTypeChange} data-testid="change-type-cancel">
					{t('formFields.changeTypeCancel')}
				</Button>
				<Button variant="primary" onclick={commitTypeChange} data-testid="change-type-confirm">
					{t('formFields.changeTypeConfirm')}
				</Button>
			</div>
		</div>
	</Modal>
{/if}
