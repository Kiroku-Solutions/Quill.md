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
	import type { Issue, Relation, TemplateField } from '$lib/types';

	type Option = { id: string; name: string };

	const { editor, issues, templates, config } = getStores();

	const template = $derived(
		editor.draft ? (templates.byType.get(editor.draft.issue.issueType) ?? null) : null
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
		if (!issue) return undefined;
		switch (field.key) {
			case 'title':
				return issue.title;
			case 'author':
				return issue.author;
			case 'issueType':
				return issue.issueType;
			case 'status':
				return issue.status;
			case 'assignee':
				return issue.assignee ?? '';
			case 'labels':
				return issue.labels;
			case 'relations':
				return issue.relations.map((r: Relation) => r.id);
			case 'startDate':
				return issue.startDate ?? '';
			case 'endDate':
				return issue.endDate ?? '';
			case 'duration':
				return issue.duration ?? '';
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
		return li ? li.issue.title : `#${id}`;
	}

	function relationOptions(): Option[] {
		if (!issue) return [];
		const out: Option[] = [];
		for (const li of issues.issues) {
			if (li.issue.id !== issue.id) out.push({ id: String(li.issue.id), name: li.issue.title });
		}
		return out;
	}

	function toggleMulti(field: TemplateField, id: string): void {
		if (!issue) return;
		const current = currentValue(field);
		const list = Array.isArray(current) ? (current as string[]).slice() : [];
		const idx = list.indexOf(id);
		if (idx >= 0) list.splice(idx, 1);
		else list.push(id);
		editor.patchField(field.key, list);
	}

	function toggleRelation(id: number): void {
		if (!issue) return;
		const existing = issue.relations.find((r) => r.id === id);
		const next = existing
			? issue.relations.filter((r) => r.id !== id)
			: [...issue.relations, { type: 'relates_to', id }];
		editor.patchField('relations', next);
	}

	function selectOptionsFor(field: TemplateField): Option[] {
		if (field.key === 'status') return statusOptions();
		if (field.key === 'issueType')
			return templates.templates.map((t) => ({ id: t.id, name: t.name }));
		return (field.options ?? []).map((o) => ({ id: o, name: o }));
	}

	const ringClass = 'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2';
</script>

{#if template && issue}
	<div class="flex flex-col gap-3" data-testid="form-fields">
		{#each fields as field (field.id)}
			{@const fid = fieldId(field.key)}
			{@const err = errorFor(field.key)}
			{@const value = currentValue(field)}
			<div class="flex flex-col gap-1" data-field-key={field.key} data-field-type={field.type}>
				<label for={fid} class="label py-0">
					<span class="label-text text-xs">
						{field.name}
						{#if field.obligatory}<span class="text-error" aria-hidden="true">&nbsp;*</span>
							<span class="sr-only">{t('common.required')}</span>{/if}
					</span>
				</label>

				{#if field.type === 'text' || field.type === 'date'}
					<input
						id={fid}
						type={field.type}
						class="input input-bordered input-sm {ringClass} {err ? 'input-error' : ''}"
						value={(value as string | undefined) ?? ''}
						aria-invalid={err ? 'true' : undefined}
						oninput={(e) =>
							editor.patchField(field.key, (e.currentTarget as HTMLInputElement).value)}
					/>
				{:else if field.type === 'number'}
					<input
						id={fid}
						type="number"
						class="input input-bordered input-sm {ringClass} {err ? 'input-error' : ''}"
						value={value === null || value === undefined ? '' : String(value)}
						aria-invalid={err ? 'true' : undefined}
						oninput={(e) => {
							const raw = (e.currentTarget as HTMLInputElement).value;
							if (raw === '') editor.patchField(field.key, null);
							else {
								const n = Number(raw);
								editor.patchField(field.key, Number.isFinite(n) ? n : raw);
							}
						}}
					/>
				{:else if field.type === 'select' || field.type === 'user'}
					{@const opts = field.type === 'user' ? userOptions() : selectOptionsFor(field)}
					{@const placeholder =
						field.type === 'user'
							? t('formFields.assigneePlaceholder')
							: t('formFields.selectPlaceholder')}
					<select
						id={fid}
						class="select select-bordered select-sm {ringClass} {err ? 'select-error' : ''}"
						value={(value as string | undefined) ?? ''}
						disabled={field.key === 'issueType'}
						aria-invalid={err ? 'true' : undefined}
						onchange={(e) => {
							const v = (e.currentTarget as HTMLSelectElement).value;
							const next = field.type === 'user' && v === '' ? null : v;
							editor.patchField(field.key, next);
						}}
					>
						<option value="">{placeholder}</option>
						{#each opts as opt (opt.id)}
							<option value={opt.id}>{opt.name}</option>
						{/each}
					</select>
					{#if field.key === 'issueType'}
						<p class="text-xs opacity-60">
							{t('formFields.issueTypeDisabledNote')}
						</p>
					{/if}
				{:else if field.type === 'multi-select' || field.type === 'relations'}
					{@const opts = field.type === 'relations' ? relationOptions() : multiSelectOptions(field)}
					{@const selected = (() => {
						if (field.type === 'relations' && issue) {
							return issue.relations.map((r) => String(r.id));
						}
						return Array.isArray(value) ? (value as string[]) : [];
					})()}
					<div
						id={fid}
						role="group"
						aria-label={field.name}
						class="flex flex-wrap gap-1 {err ? 'rounded ring-1 ring-error p-1' : ''}"
					>
						{#each opts as opt (opt.id)}
							{@const on = selected.includes(opt.id)}
							<button
								type="button"
								class="badge badge-sm cursor-pointer {ringClass} {on
									? 'badge-primary'
									: 'badge-outline'}"
								aria-pressed={on}
								onclick={() =>
									field.type === 'relations'
										? toggleRelation(Number(opt.id))
										: toggleMulti(field, opt.id)}
							>
								{field.type === 'relations' ? relationTitle(Number(opt.id)) : opt.name}
							</button>
						{/each}
					</div>
				{/if}

				{#if err}
					<p class="text-error text-xs" role="alert">{err}</p>
				{/if}
			</div>
		{/each}
	</div>
{/if}
