<script lang="ts">
	// This is a CSS-only component that injects global styles for y-codemirror.next remote cursors.
	// It is mounted by EditorPanel when collaboration is active.
</script>

<style>
	:global(.cm-ySelectionInfo) {
		position: absolute;
		top: -1.5em;
		left: -1px;
		font-size: 0.75rem;
		font-family: inherit;
		font-weight: 600;
		line-height: 1.2;
		user-select: none;
		color: white;
		padding: 2px 6px;
		border-radius: 4px;
		border-bottom-left-radius: 0;
		z-index: 10;
		transition: opacity 0.3s ease;
		white-space: nowrap;
		pointer-events: none;
	}

	:global(.cm-ySelectionCaret) {
		position: relative;
		border-left: 2px solid;
		border-right: 2px solid;
		border-color: inherit;
		margin-left: -2px;
		margin-right: -2px;
		box-sizing: border-box;
		display: inline-block;
		z-index: 10;
		pointer-events: none;
	}

	:global(.cm-ySelectionCaretDot) {
		position: absolute;
		top: -0.2em;
		left: -0.2em;
		width: 0.4em;
		height: 0.4em;
		border-radius: 50%;
		background-color: inherit;
		pointer-events: none;
	}

	:global(.cm-ySelection) {
		opacity: 0.3;
		pointer-events: none;
	}
</style>
