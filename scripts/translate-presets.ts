import fs from 'node:fs';
import path from 'node:path';

const presetsPath = path.resolve('src/lib/services/framework-presets.ts');
let content = fs.readFileSync(presetsPath, 'utf8');

const dictPath = path.resolve('scripts/es-dict.json');
let esDict = {};
if (fs.existsSync(dictPath)) {
    esDict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
}

// Function to escape string for regex
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Simple replacement of keys that have a non-empty translation
for (const [en, es] of Object.entries(esDict)) {
    if (es && es.trim() !== "") {
        // We only want to replace it when it's a string literal in the file.
        // framework-presets.ts has strings in double quotes.
        // We will replace occurrences of `"English"` with `"Spanish"`
        const escapedEn = escapeRegExp(en).replace(/\n/g, '\\n').replace(/"/g, '\\"');
        const escapedEs = es.replace(/"/g, '\\"'); // escape double quotes for the target string
        
        // This is a naive replace but should work for our generated TS file
        const regex = new RegExp(`"${escapedEn}"`, 'g');
        content = content.replace(regex, `"${escapedEs}"`);
    }
}

// Write the Spanish version
const outputPath = path.resolve('src/lib/services/framework-presets.es.ts');

// Change the variable name in the output
content = content.replace('export const FRAMEWORK_PRESETS: FrameworkPreset[] =', 'export const FRAMEWORK_PRESETS_ES: FrameworkPreset[] =');

fs.writeFileSync(outputPath, content);
console.log('Generated framework-presets.es.ts');
