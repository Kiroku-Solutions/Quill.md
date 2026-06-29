/**
 * Modal.svelte — focus trap, ESC close, focus restoration (NFR-4).
 *
 * The Modal uses the native <dialog> element. The browser provides
 * the focus trap and ESC-to-close behaviour, so the tests verify the
 * end-to-end user-facing contract:
 *   - When `open` flips to `true`, the dialog becomes visible.
 *   - Escape closes the dialog and `onclose` is called.
 *   - Focus is restored to the trigger element on close.
 *
 * Vitest project: `client` (Playwright Chromium). The harness is a
 * tiny Svelte 5 component that owns the `open` cell and the trigger
 * button (see `tests/ui/ModalHarness.svelte`).
 *
 * Keyboard events go through `userEvent.keyboard('{Escape}')`.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import ModalHarness from './ModalHarness.svelte';

describe('Modal', () => {
	it('opens when the trigger is clicked', async () => {
		render(ModalHarness, {
			open: false,
			onclose: () => {}
		});

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		await page.getByTestId('trigger').click();
		await expect.element(page.getByRole('dialog')).toBeInTheDocument();
	});

	it('closes when ESC is pressed and invokes onclose', async () => {
		let closeCount = 0;
		render(ModalHarness, {
			open: false,
			onclose: () => {
				closeCount += 1;
			}
		});

		await page.getByTestId('trigger').click();
		await expect.element(page.getByRole('dialog')).toBeInTheDocument();

		await userEvent.keyboard('{Escape}');
		await expect.poll(() => closeCount).toBeGreaterThan(0);
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	});

	it('restores focus to the trigger button on close', async () => {
		render(ModalHarness, {
			open: false,
			onclose: () => {}
		});

		const trigger = page.getByTestId('trigger');
		trigger.element().focus();
		await trigger.click();
		await expect.element(page.getByRole('dialog')).toBeInTheDocument();

		await userEvent.keyboard('{Escape}');
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();

		await expect.element(trigger).toHaveFocus();
	});
});
