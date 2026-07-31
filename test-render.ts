import { renderMarkdown } from './src/lib/adapters/renderer';
const out = renderMarkdown('- [ ] Task 1');
console.log(out);
