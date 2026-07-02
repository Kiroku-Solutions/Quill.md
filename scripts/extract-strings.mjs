import fs from 'node:fs';
import path from 'node:path';

const presetsPath = path.resolve('src/lib/services/framework-presets.ts');
const content = fs.readFileSync(presetsPath, 'utf8');

const arrayStart = content.indexOf('[');
const arrayContent = content.substring(arrayStart);

// Remove semicolon at the end if any
const cleaned = arrayContent.replace(/;\s*$/, '');

global.FRAMEWORK_PRESETS = eval('(' + cleaned + ')');

const uniqueStrings = new Set();
for (const preset of global.FRAMEWORK_PRESETS) {
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
const dict = {};
for (const s of stringsArray) {
    dict[s] = "";
}

fs.writeFileSync(path.resolve('scripts/en-strings.json'), JSON.stringify(dict, null, '\t'));
console.log(`Extracted ${stringsArray.length} unique strings.`);
