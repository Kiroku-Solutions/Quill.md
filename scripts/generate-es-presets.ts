import fs from 'node:fs';
import path from 'node:path';
import { FRAMEWORK_PRESETS } from '../src/lib/services/framework-presets';

// A helper function to collect all strings from the presets object
const uniqueStrings = new Set<string>();

for (const preset of FRAMEWORK_PRESETS) {
	uniqueStrings.add(preset.name);
	if (preset.description) uniqueStrings.add(preset.description);

	if (preset.config) {
		if (preset.config.product_goal) uniqueStrings.add(preset.config.product_goal);
		if (preset.config.definition_of_done) {
			for (const dod of preset.config.definition_of_done) uniqueStrings.add(dod);
		}
		if (preset.config.statuses) {
			for (const status of preset.config.statuses) uniqueStrings.add(status.name);
		}
	}

	if (preset.templates) {
		for (const tmpl of preset.templates) {
			uniqueStrings.add(tmpl.name);
			if (tmpl.fields) {
				for (const field of tmpl.fields) uniqueStrings.add(field.name);
			}
		}
	}
}

const stringsArray = Array.from(uniqueStrings);
const dict: Record<string, string> = {};
for (const s of stringsArray) {
	dict[s] = '';
}

fs.writeFileSync(path.resolve('scripts/en-strings.json'), JSON.stringify(dict, null, '\t'));
console.log(`Extracted ${stringsArray.length} unique strings to scripts/en-strings.json`);
