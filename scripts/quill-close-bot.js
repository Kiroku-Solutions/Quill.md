/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs/promises');
const path = require('path');
const matter = require('gray-matter');

const DAYS_OLD = parseInt(process.env.DAYS_OLD || '14', 10);
const ISSUES_DIR = path.join(process.cwd(), '.quill.md', 'issues');

async function main() {
	try {
		const files = await fs.readdir(ISSUES_DIR);
		const mdFiles = files.filter((f) => f.endsWith('.md'));

		let closedCount = 0;
		const now = Date.now();

		for (const file of mdFiles) {
			const filePath = path.join(ISSUES_DIR, file);
			const content = await fs.readFile(filePath, 'utf8');
			const parsed = matter(content);
			const data = parsed.data;

			if (data.status === 'done' || data.status === 'Done') {
				const updatedDate = new Date(data.updated_date || data.created_date || Date.now());
				const diffTime = Math.abs(now - updatedDate.getTime());
				const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

				if (diffDays >= DAYS_OLD) {
					data.status = 'closed';
					data.updated_date = new Date().toISOString();

					const newContent = matter.stringify(parsed.content, data);
					await fs.writeFile(filePath, newContent, 'utf8');
					console.log(`Closed issue: ${file}`);
					closedCount++;
				}
			}
		}

		console.log(`Successfully closed ${closedCount} issues older than ${DAYS_OLD} days.`);
	} catch (e) {
		if (e.code === 'ENOENT') {
			console.log('No issues directory found. Exiting.');
			return;
		}
		console.error('Error running close bot:', e);
		process.exit(1);
	}
}

main();
