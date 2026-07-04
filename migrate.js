import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml'; // assuming it's available in node_modules

const quillDir = 'T:/Kiroku/Fiado/.quill.md';
const issuesDir = path.join(quillDir, 'issues');

const files = fs.readdirSync(issuesDir).filter((f) => f.endsWith('.md'));

let fixedCount = 0;
for (const file of files) {
	const fullPath = path.join(issuesDir, file);
	const content = fs.readFileSync(fullPath, 'utf8');

	// Splitting frontmatter
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
	if (!match) {
		console.log(`Failed to match frontmatter for ${file}`);
		continue;
	}

	const fmString = match[1];
	const body = match[2];

	let fm;
	try {
		fm = yaml.load(fmString);
	} catch (e) {
		console.error('Failed to parse YAML for', file, e);
		continue;
	}

	let changed = false;

	// Fix issueType
	if (fm.issueType === 'Epic' || fm.issueType === 'epic') {
		if (fm.issueType !== 'epic') changed = true;
		fm.issueType = 'epic';
	} else if (fm.issueType === 'User Story' || fm.issueType === 'user-story') {
		if (fm.issueType !== 'user-story') changed = true;
		fm.issueType = 'user-story';
	}

	// Fix status
	if (fm.status === 'To Do' || fm.status === 'Todo') {
		fm.status = 'open';
		changed = true;
	}

	// Fix parentId -> relations
	if (fm.parentId !== undefined) {
		if (!fm.relations) fm.relations = [];
		// Ensure it doesn't already exist
		if (!fm.relations.some((r) => r.type === 'parent' && r.id === parseInt(fm.parentId, 10))) {
			fm.relations.push({ type: 'parent', id: parseInt(fm.parentId, 10) });
		}
		delete fm.parentId;
		changed = true;
	}

	// Fix existing relations (targetId -> id, verifies -> relates_to)
	if (Array.isArray(fm.relations)) {
		const newRelations = fm.relations.map((rel) => {
			let r = { ...rel };
			if (r.targetId !== undefined) {
				r.id = parseInt(r.targetId, 10);
				delete r.targetId;
				changed = true;
			}
			if (r.type === 'verifies') {
				r.type = 'relates_to';
				changed = true;
			}
			return r;
		});

		if (JSON.stringify(fm.relations) !== JSON.stringify(newRelations)) {
			fm.relations = newRelations;
			changed = true;
		}
	}

	if (changed) {
		const newFmString = yaml.dump(fm, { quotingType: '"', forceQuotes: false });
		const newContent = `---\n${newFmString}---\n${body}`;
		fs.writeFileSync(fullPath, newContent);
		fixedCount++;
	} else {
		console.log(`No changes for ${file}`);
	}
}

console.log(`Migrated ${fixedCount} issues successfully.`);
