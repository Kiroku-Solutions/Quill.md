/**
 * Tests for `src/lib/services/wizard.ts`.
 *
 * The wizard service is the atomic write of `.quill.md/config.json` and
 * `.quill.md/templates/*.json` (FR-11 / UC-5). It runs once on the
 * first-run wizard apply and is also called by the Settings panel's
 * "Reset to defaults" affordance.
 *
 * Coverage:
 *  - Empty `templateIds` throws (FR-11 requires at least one template).
 *  - Unknown template id throws with a clear message.
 *  - Happy path: writes `config.json` + every selected template.
 *  - `overwriteConfig: false` skips an existing config file.
 *  - `overwriteTemplates: false` skips an existing template file.
 *  - Custom `config` override is honoured.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryFsAdapter } from '$lib/adapters/memory-fs';
import { writeWizardSetup } from '$lib/services/wizard';
import { FRAMEWORK_PRESETS } from '$lib/services/framework-presets';
import { defaultConfig } from '$lib/services/built-in-templates';

const mockTemplates = FRAMEWORK_PRESETS[0].templates;
const mockConfig = FRAMEWORK_PRESETS[0].config;

describe('writeWizardSetup — input validation', () => {
	let fs: MemoryFsAdapter;
	beforeEach(() => {
		fs = new MemoryFsAdapter();
	});

	it('rejects an empty template list (FR-11: at least one template required)', async () => {
		await expect(writeWizardSetup(fs, [])).rejects.toThrow(
			/At least one template must be selected/
		);
	});

	it('rejects when config is missing for new setup', async () => {
		await expect(writeWizardSetup(fs, [mockTemplates[0]])).rejects.toThrow(
			/Config is required when writing a new setup/
		);
	});
});

describe('writeWizardSetup — happy path', () => {
	let fs: MemoryFsAdapter;
	beforeEach(() => {
		fs = new MemoryFsAdapter();
	});

	it('writes the config + every selected template', async () => {
		const written = await writeWizardSetup(fs, [mockTemplates[0], mockTemplates[1]], {
			overwriteConfig: true,
			config: mockConfig
		});
		expect(written).toHaveLength(2);
		expect(written.map((t) => t.id)).toEqual([mockTemplates[0].id, mockTemplates[1].id]);

		const cfgText = await fs.readTextFile('.quill.md/config.json');
		const cfg = JSON.parse(cfgText);
		expect(cfg.default_status).toBe(mockConfig.default_status);

		const t1Text = await fs.readTextFile(`.quill.md/templates/${mockTemplates[0].id}.json`);
		const t1 = JSON.parse(t1Text);
		expect(t1.id).toBe(mockTemplates[0].id);
	});
});

describe('writeWizardSetup — overwrite flags', () => {
	let fs: MemoryFsAdapter;
	beforeEach(() => {
		fs = new MemoryFsAdapter();
	});

	it('skips an existing config when overwriteConfig is false (default)', async () => {
		// Pre-seed a config.
		await fs.writeTextFile(
			'.quill.md/config.json',
			JSON.stringify({ custom: 'preserved' }, null, '\t') + '\n'
		);
		await writeWizardSetup(fs, [mockTemplates[0]]);
		const cfgText = await fs.readTextFile('.quill.md/config.json');
		const cfg = JSON.parse(cfgText);
		expect(cfg.custom).toBe('preserved');
	});

	it('overwrites an existing config when overwriteConfig is true', async () => {
		await fs.writeTextFile(
			'.quill.md/config.json',
			JSON.stringify({ custom: 'will-be-replaced' }, null, '\t') + '\n'
		);
		await writeWizardSetup(fs, [mockTemplates[0]], { overwriteConfig: true, config: mockConfig });
		const cfgText = await fs.readTextFile('.quill.md/config.json');
		const cfg = JSON.parse(cfgText);
		expect(cfg.custom).toBeUndefined();
		expect(cfg.statuses).toBeDefined();
	});

	it('skips an existing template when overwriteTemplates is false (default)', async () => {
		const original = mockTemplates[0];
		const tampered = { ...original, custom: 'preserved' } as any;
		await fs.writeTextFile(
			`.quill.md/templates/${original.id}.json`,
			JSON.stringify(tampered, null, '\t') + '\n'
		);
		// Assuming config is pre-seeded
		await fs.writeTextFile('.quill.md/config.json', '{}');
		await writeWizardSetup(fs, [original]);
		const tText = await fs.readTextFile(`.quill.md/templates/${original.id}.json`);
		const t = JSON.parse(tText);
		expect(t.custom).toBe('preserved');
	});

	it('overwrites an existing template when overwriteTemplates is true', async () => {
		const original = mockTemplates[0];
		const tampered = { ...original, custom: 'will-be-replaced' } as any;
		await fs.writeTextFile(
			`.quill.md/templates/${original.id}.json`,
			JSON.stringify(tampered, null, '\t') + '\n'
		);
		await fs.writeTextFile('.quill.md/config.json', '{}');
		await writeWizardSetup(fs, [original], { overwriteTemplates: true });
		const tText = await fs.readTextFile(`.quill.md/templates/${original.id}.json`);
		const t = JSON.parse(tText);
		expect(t.custom).toBeUndefined();
		expect(t.id).toBe(original.id);
	});
});
