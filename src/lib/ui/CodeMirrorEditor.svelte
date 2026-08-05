<script lang="ts">
	import { onMount } from 'svelte';
	import { EditorState, Compartment } from '@codemirror/state';
	import { EditorView, basicSetup } from 'codemirror';
	import { markdown } from '@codemirror/lang-markdown';
	import { quillTheme } from './codemirror-theme';
	import { yCollab } from 'y-codemirror.next';
	import type * as Y from 'yjs';
	import type { Awareness } from 'y-protocols/awareness';

	type Props = {
		value: string;
		onchange?: (value: string) => void;
		readonly?: boolean;
		class?: string;
		ytext?: Y.Text;
		awareness?: Awareness;
	};

	let { value, onchange, readonly = false, class: cls = '', ytext, awareness }: Props = $props();

	let container: HTMLDivElement;
	let view: EditorView;
	const editableCompartment = new Compartment();

	const collabCompartment = new Compartment();
	const fallbackListenerCompartment = new Compartment();

	function getFallbackListener() {
		return EditorView.updateListener.of((update) => {
			if (update.docChanged && onchange) {
				// Avoid cyclic update
				const newValue = update.state.doc.toString();
				if (newValue !== value) {
					onchange(newValue);
				}
			}
		});
	}

	onMount(() => {
		const extensions = [
			basicSetup,
			markdown(),
			editableCompartment.of(EditorView.editable.of(!readonly)),
			quillTheme,
			EditorView.lineWrapping,
			collabCompartment.of(ytext && awareness ? yCollab(ytext, awareness) : []),
			fallbackListenerCompartment.of(!ytext || !awareness ? getFallbackListener() : [])
		];

		view = new EditorView({
			state: EditorState.create({
				doc: ytext ? ytext.toString() : value,
				extensions
			}),
			parent: container
		});

		return () => view.destroy();
	});

	$effect(() => {
		if (view) {
			view.dispatch({
				effects: [
					collabCompartment.reconfigure(ytext && awareness ? yCollab(ytext, awareness) : []),
					fallbackListenerCompartment.reconfigure(!ytext || !awareness ? getFallbackListener() : [])
				]
			});
		}
	});

	$effect(() => {
		if (view && !ytext && value !== view.state.doc.toString()) {
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: value }
			});
		}
	});

	$effect(() => {
		if (view) {
			view.dispatch({
				effects: editableCompartment.reconfigure(EditorView.editable.of(!readonly))
			});
		}
	});
</script>

<div bind:this={container} class="cm-wrapper {cls}" data-testid="codemirror-editor"></div>

<style>
	:global(.cm-wrapper) {
		display: flex;
		flex-direction: column;
	}
	:global(.cm-wrapper .cm-editor) {
		height: 100%;
		min-height: 100%;
		flex: 1;
	}
	:global(.cm-wrapper .cm-scroller) {
		font-family: var(--font-mono);
		overflow-y: auto;
	}
</style>
