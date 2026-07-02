import fs from 'node:fs';
import path from 'node:path';
import { FRAMEWORK_PRESETS_ES } from '../src/lib/services/framework-presets.es.ts';
import { buildIssueFilename } from '../src/lib/services/slugs.ts';
import { serializeIssue } from '../src/lib/services/serializer.ts';
import type { Issue, Relation } from '../src/lib/types/index.ts';

const OUTPUT_DIR = path.resolve('mock-workspaces');

if (fs.existsSync(OUTPUT_DIR)) {
	fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
}
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function generateMockWorkspace(preset: typeof FRAMEWORK_PRESETS_ES[0]) {
	const workspacePath = path.join(OUTPUT_DIR, preset.id);
	const quillPath = path.join(workspacePath, '.quill.md');
	const issuesPath = path.join(quillPath, 'issues');
	const templatesPath = path.join(quillPath, 'templates');

	fs.mkdirSync(issuesPath, { recursive: true });
	fs.mkdirSync(templatesPath, { recursive: true });

	// 1. Write config.json
	fs.writeFileSync(
		path.join(quillPath, 'config.json'),
		JSON.stringify(preset.config, null, 2)
	);

	// 2. Write templates
	for (const tmpl of preset.templates) {
		fs.writeFileSync(
			path.join(templatesPath, `${tmpl.id}.json`),
			JSON.stringify(tmpl, null, 2)
		);
	}

	// 3. Generate Graph
	const issues: Issue[] = [];
	const templates = preset.templates;
	
	// Helper to get a template (Top, Mid, Low fallback)
	const getTmpl = (index: number) => templates[Math.min(index, templates.length - 1)].id;
	const statuses = preset.config.statuses.map(s => s.id);
	const getStatus = (index: number) => statuses[index % statuses.length];

	let nextId = 1;

	// Level 1: 3 Root items
	const roots = [1, 2, 3].map(i => {
		const id = nextId++;
		return createMockIssue(id, `Iniciativa Estratégica ${i}`, getTmpl(0), getStatus(id));
	});

	// Level 2: 2 children per root
	const mids: Issue[] = [];
	for (const root of roots) {
		for (let i = 1; i <= 2; i++) {
			const id = nextId++;
			const child = createMockIssue(id, `Trabajo de Nivel Medio ${root.id}-${i}`, getTmpl(1), getStatus(id));
			link(root, child, 'child');
			mids.push(child);
		}
	}

	// Level 3: 2 children per mid
	const leaves: Issue[] = [];
	for (const mid of mids) {
		for (let i = 1; i <= 2; i++) {
			const id = nextId++;
			const child = createMockIssue(id, `Tarea o Defecto ${mid.id}-${i}`, getTmpl(2), getStatus(id));
			link(mid, child, 'child');
			leaves.push(child);
		}
	}

	// Add complex horizontal relations (blocks, depends_on, relates_to)
	// blocks / depends_on
	link(leaves[0], leaves[1], 'blocks');
	link(leaves[2], leaves[3], 'depends_on');
	link(mids[0], mids[2], 'relates_to');
	link(roots[0], roots[1], 'relates_to');
	link(leaves[4], leaves[5], 'blocks');
	link(leaves[6], leaves[5], 'depends_on');

	// Accumulate all
	issues.push(...roots, ...mids, ...leaves);

	// 4. Serialize and write
	for (const issue of issues) {
		const serialized = await serializeIssue(issue);
		const filename = buildIssueFilename(issue.id, issue.title);
		fs.writeFileSync(path.join(issuesPath, filename), serialized);
	}
	
	console.log(`Generated workspace for ${preset.name} with ${issues.length} interconnected items.`);
}

function createMockIssue(id: number, title: string, type: string, status: string): Issue {
	return {
		id,
		title,
		author: 'Generador Automático',
		creationDate: new Date().toISOString().split('T')[0],
		updatedDate: new Date().toISOString().split('T')[0],
		issueType: type,
		status,
		assignee: null,
		labels: ['mock', 'auto-generado'],
		relations: [],
		startDate: null,
		endDate: null,
		duration: null,
		sprintId: null,
		estimate: null,
		integrityHash: null, // Let serializeIssue compute it
		customFields: {},
		sections: [
			{ name: 'Descripción', markdown: 'Este es un elemento generado automáticamente para probar la vista de grafos 3D y Gantt.' },
			{ name: 'Criterios de Aceptación', markdown: '- [ ] Verificar conexiones.\n- [ ] Validar rendering.' }
		],
		integrityWarning: false
	};
}

function link(from: Issue, to: Issue, type: Relation['type']) {
	// Standard bi-directional linking
	from.relations.push({ type, id: to.id });
	
	if (type === 'child') {
		to.relations.push({ type: 'parent', id: from.id });
	} else if (type === 'parent') {
		to.relations.push({ type: 'child', id: from.id });
	} else if (type === 'blocks') {
		to.relations.push({ type: 'depends_on', id: from.id });
	} else if (type === 'depends_on') {
		to.relations.push({ type: 'blocks', id: from.id });
	} else if (type === 'relates_to') {
		to.relations.push({ type: 'relates_to', id: from.id });
	}
}

async function main() {
	for (const preset of FRAMEWORK_PRESETS_ES) {
		await generateMockWorkspace(preset);
	}
	console.log(`\nAll workspaces generated in ${OUTPUT_DIR}/`);
}

main().catch(console.error);
