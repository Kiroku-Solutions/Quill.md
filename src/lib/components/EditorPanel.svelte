<script lang="ts">
	import { getStores } from '$lib/state';
	import { renderMarkdown } from '$lib/adapters/renderer';

	const { editor, issues } = getStores();

	let tab = $state<'write' | 'preview'>('write');
	let previewHtml = $state('');

	const active = $derived(
		editor.activeId !== null ? (issues.byId.get(editor.activeId) ?? null) : null
	);

	async function refreshPreview(): Promise<void> {
		const li = editor.draft;
		if (!li) return;
		previewHtml = await renderMarkdown(
			li.issue.sections.map((s) => s.markdown).join('\n\n'),
			'comment'
		);
	}

	function patch(key: string, value: unknown): void {
		editor.patchField(key, value);
	}

	function patchSection(name: string, value: string): void {
		editor.patchSection(name, value);
	}

	function save(): void {
		void editor.save();
	}

	function discard(): void {
		editor.discard();
	}

	function close(): void {
		editor.close();
	}
</script>

{#if active && editor.draft}
	<aside
		class="fixed inset-y-0 right-0 w-[40rem] max-w-full bg-base-100 border-l border-base-300 shadow-xl flex flex-col z-40"
	>
		<header class="px-4 py-3 border-b border-base-300 flex items-center gap-3">
			<span class="font-mono text-xs opacity-60">
				{editor.activeId?.toString().padStart(4, '0')}
			</span>
			<input
				type="text"
				class="input input-bordered input-sm flex-1"
				value={editor.draft.issue.title}
				oninput={(e) => patch('title', (e.currentTarget as HTMLInputElement).value)}
			/>
			<button type="button" class="btn btn-ghost btn-sm" onclick={close} aria-label="Close editor"
				>×</button
			>
		</header>

		{#if editor.integrityWarning}
			<div role="alert" class="alert alert-warning m-2 text-sm">
				<span>
					This file was modified outside nomad.md. Review the contents before saving — id,
					relations, and section markers may have drifted.
				</span>
			</div>
		{/if}

		<div role="tablist" class="tabs tabs-bordered mx-2 mt-2">
			<button
				role="tab"
				type="button"
				class="tab"
				class:tab-active={tab === 'write'}
				onclick={() => (tab = 'write')}>Write</button
			>
			<button
				role="tab"
				type="button"
				class="tab"
				class:tab-active={tab === 'preview'}
				onclick={() => {
					tab = 'preview';
					void refreshPreview();
				}}>Preview</button
			>
		</div>

		<div class="flex-1 overflow-y-auto px-4 py-3 space-y-4">
			{#if tab === 'write'}
				<div class="grid grid-cols-2 gap-3">
					<label class="form-control">
						<div class="label py-0"><span class="label-text text-xs">Type</span></div>
						<input
							type="text"
							class="input input-bordered input-sm"
							value={editor.draft.issue.issueType}
							oninput={(e) => patch('issueType', (e.currentTarget as HTMLInputElement).value)}
						/>
					</label>
					<label class="form-control">
						<div class="label py-0"><span class="label-text text-xs">Status</span></div>
						<input
							type="text"
							class="input input-bordered input-sm"
							value={editor.draft.issue.status}
							oninput={(e) => patch('status', (e.currentTarget as HTMLInputElement).value)}
						/>
					</label>
					<label class="form-control">
						<div class="label py-0"><span class="label-text text-xs">Assignee</span></div>
						<input
							type="text"
							class="input input-bordered input-sm"
							value={editor.draft.issue.assignee ?? ''}
							oninput={(e) =>
								patch('assignee', (e.currentTarget as HTMLInputElement).value || null)}
						/>
					</label>
					<label class="form-control">
						<div class="label py-0"><span class="label-text text-xs">Author</span></div>
						<input
							type="text"
							class="input input-bordered input-sm"
							value={editor.draft.issue.author}
							oninput={(e) => patch('author', (e.currentTarget as HTMLInputElement).value)}
						/>
					</label>
				</div>

				<section>
					<h3 class="text-xs uppercase tracking-wide opacity-60 mb-2">Sections</h3>
					{#each editor.draft.issue.sections as section (section.name)}
						<label class="form-control mb-3">
							<div class="label py-0">
								<span class="label-text text-xs font-semibold">{section.name}</span>
							</div>
							<textarea
								class="textarea textarea-bordered min-h-32 font-mono text-sm"
								value={section.markdown}
								oninput={(e) =>
									patchSection(section.name, (e.currentTarget as HTMLTextAreaElement).value)}
							></textarea>
						</label>
					{/each}
				</section>
			{:else}
				<!--
					`previewHtml` is the output of `renderMarkdown` which always
					runs the value through DOMPurify's strict config
					(`src/lib/adapters/renderer.ts:121-133`: script/iframe/style/
					object/embed/form/input/button tags and event-handler
					attributes stripped). The eslint plugin flags any
					`{@html}` outright; we suppress here because the source
					is sanitised.
				-->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				<article class="prose max-w-none">{@html previewHtml}</article>
			{/if}
		</div>

		<footer class="px-4 py-3 border-t border-base-300 flex items-center gap-2">
			<button
				type="button"
				class="btn btn-primary btn-sm"
				disabled={!editor.isDirty}
				onclick={save}
			>
				Save
			</button>
			<button
				type="button"
				class="btn btn-ghost btn-sm"
				disabled={!editor.isDirty}
				onclick={discard}
			>
				Discard
			</button>
			{#if editor.errors.length > 0}
				<span class="text-error text-xs ml-auto">
					{editor.errors.length} validation {editor.errors.length === 1 ? 'error' : 'errors'}
				</span>
			{/if}
		</footer>
	</aside>
{/if}
