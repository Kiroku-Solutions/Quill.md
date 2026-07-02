import fs from 'node:fs';
import path from 'node:path';

function walkSync(dir, filelist = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filepath = path.join(dir, file);
    if (fs.statSync(filepath).isDirectory()) {
      walkSync(filepath, filelist);
    } else if (filepath.endsWith('.ts')) {
      filelist.push(filepath);
    }
  }
  return filelist;
}

const testFiles = walkSync('tests');

for (const file of testFiles) {
	let content = fs.readFileSync(file, 'utf8');
	let changed = false;

	// Case 1: settingsOpen: false
	if (content.match(/settingsOpen:\s*(false|true),/g)) {
		content = content.replace(/settingsOpen:\s*(false|true),/g, 'settingsOpen: $1, mobileNavOpen: false, openMobileNav: () => {}, closeMobileNav: () => {}, toggleMobileNav: () => {},');
		changed = true;
	}

	// Case 2: get settingsOpen()
	if (content.match(/get settingsOpen\(\)/g)) {
		content = content.replace(/get settingsOpen\(\)/g, 'mobileNavOpen: false, openMobileNav: () => {}, closeMobileNav: () => {}, toggleMobileNav: () => {}, get settingsOpen()');
		changed = true;
	}

	// Also fix settingsOpen?: boolean in type definitions if we need it
	if (content.match(/settingsOpen\?:\s*boolean;/g)) {
		content = content.replace(/settingsOpen\?:\s*boolean;/g, 'settingsOpen?: boolean; mobileNavOpen?: boolean;');
		changed = true;
	}

	if (changed) {
		fs.writeFileSync(file, content);
		console.log('Fixed', file);
	}
}
