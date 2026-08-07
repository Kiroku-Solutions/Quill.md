import { renderMarkdown } from '$lib/adapters/renderer';

export interface ExportDocument {
	title: string;
	markdown: string;
}

export interface ExporterOptions {
	filename?: string;
	format: 'pdf' | 'docx';
}

/**
 * Converts a Mermaid code block string into a base64 PNG data URI and its original dimensions.
 */
async function mermaidToPng(
	mermaidCode: string,
	id: string
): Promise<{ dataUrl: string; width: number; height: number } | null> {
	try {
		// Initialize mermaid with htmlLabels: false.
		// Browsers (Chrome/Safari) heavily clip or completely block rendering of SVGs to Canvas
		// if they contain <foreignObject> (which Mermaid uses for HTML labels).
		// Disabling htmlLabels forces Mermaid to use native SVG <text>, which works perfectly on Canvas.
		const { default: mermaid } = await import('mermaid');
		mermaid.initialize({
			startOnLoad: false,
			securityLevel: 'strict',
			theme: 'default',
			htmlLabels: false
		});

		// mermaid.render returns { svg, bindFunctions }
		const { svg } = await mermaid.render(`mermaid-${id}`, mermaidCode);

		// Force explicit pixel dimensions from viewBox to prevent the Image object
		// from collapsing responsive SVGs to 0px or 300x150px
		const parser = new DOMParser();
		const svgDoc = parser.parseFromString(svg, 'image/svg+xml');
		const svgEl = svgDoc.documentElement;

		let intrinsicWidth = parseFloat(svgEl.getAttribute('width') || '0');
		let intrinsicHeight = parseFloat(svgEl.getAttribute('height') || '0');

		const wAttr = svgEl.getAttribute('width');
		if (!intrinsicWidth || !intrinsicHeight || (wAttr && wAttr.includes('%'))) {
			const viewBox = svgEl.getAttribute('viewBox');
			if (viewBox) {
				const parts = viewBox.trim().split(/\s+|,/);
				if (parts.length >= 4) {
					intrinsicWidth = parseFloat(parts[2]);
					intrinsicHeight = parseFloat(parts[3]);
					svgEl.setAttribute('width', `${intrinsicWidth}`);
					svgEl.setAttribute('height', `${intrinsicHeight}`);
				}
			}
		}

		// Fallback if viewBox is completely missing
		if (!intrinsicWidth) intrinsicWidth = 800;
		if (!intrinsicHeight) intrinsicHeight = 600;

		const fixedSvg = new XMLSerializer().serializeToString(svgDoc);

		return new Promise((resolve) => {
			const img = new Image();
			img.onload = () => {
				const canvas = document.createElement('canvas');
				// Scale for high fidelity
				const scale = 2;
				canvas.width = intrinsicWidth * scale;
				canvas.height = intrinsicHeight * scale;
				const ctx = canvas.getContext('2d');
				if (!ctx) {
					resolve(null);
					return;
				}
				ctx.scale(scale, scale);
				ctx.fillStyle = '#ffffff'; // White background for word document
				ctx.fillRect(0, 0, intrinsicWidth, intrinsicHeight);
				ctx.drawImage(img, 0, 0, intrinsicWidth, intrinsicHeight);
				resolve({
					dataUrl: canvas.toDataURL('image/png'),
					width: intrinsicWidth,
					height: intrinsicHeight
				});
			};
			img.onerror = () => resolve(null);
			// Encode SVG to base64 to avoid parsing issues in Image
			img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(fixedSvg)));
		});
	} catch (e) {
		console.error('Failed to render mermaid chart to PNG', e);
		return null;
	}
}

/**
 * Parses markdown to HTML and replaces Mermaid code blocks with proper formats.
 */
async function processMarkdownToHtml(
	doc: ExportDocument,
	index: number,
	format: 'pdf' | 'docx'
): Promise<string> {
	const rawHtml = renderMarkdown(doc.markdown, 'default').toString();

	// We need to parse the HTML to find <code class="language-mermaid"> blocks
	const parser = new DOMParser();
	const dom = parser.parseFromString(rawHtml, 'text/html');

	const mermaidNodes = dom.querySelectorAll('code.language-mermaid');

	if (mermaidNodes.length > 0 && format === 'pdf') {
		const { default: mermaid } = await import('mermaid');
		// For PDF, we can use htmlLabels because we inject the raw SVG directly into the DOM
		mermaid.initialize({
			startOnLoad: false,
			securityLevel: 'strict',
			theme: 'default',
			htmlLabels: true
		});
	}

	for (let i = 0; i < mermaidNodes.length; i++) {
		const node = mermaidNodes[i];
		const code = node.textContent || '';
		const id = `export-${index}-${i}`;

		let replacementNode: HTMLElement | SVGElement | null = null;

		if (format === 'pdf') {
			// State of the art: For PDF, inject the RAW INLINE SVG!
			// This guarantees infinite vector scaling, crisp text, and avoids all Canvas clipping issues.
			try {
				const { default: mermaid } = await import('mermaid');
				const { svg } = await mermaid.render(`mermaid-${id}`, code);
				const svgDoc = parser.parseFromString(svg, 'image/svg+xml');
				replacementNode = svgDoc.documentElement;

				// Remove hardcoded dimensions to make it responsive
				replacementNode.removeAttribute('width');
				replacementNode.removeAttribute('height');
				replacementNode.setAttribute('width', '100%');

				// Constrain to prevent multi-page spanning
				replacementNode.style.maxWidth = '100%';
				replacementNode.style.maxHeight = '85vh'; // ~85% of a printed page
				replacementNode.style.height = 'auto';
				replacementNode.style.objectFit = 'contain';
			} catch (e) {
				console.error('Failed to render inline SVG for PDF', e);
			}
		} else {
			// For DOCX, html-to-docx does not support SVG, so we MUST use a PNG.
			const pngResult = await mermaidToPng(code, id);
			if (pngResult) {
				const img = dom.createElement('img');
				img.src = pngResult.dataUrl;

				// Calculate dimensions to fit inside a standard Word page (~600x800px printable area)
				const maxWidth = 600;
				const maxHeight = 800;
				let w = pngResult.width;
				let h = pngResult.height;

				if (w > maxWidth) {
					h = (h * maxWidth) / w;
					w = maxWidth;
				}
				if (h > maxHeight) {
					w = (w * maxHeight) / h;
					h = maxHeight;
				}

				img.width = Math.round(w);
				img.height = Math.round(h);
				img.style.width = `${img.width}px`;
				img.style.maxWidth = '100%';
				img.style.height = 'auto';
				img.alt = 'Mermaid Diagram';
				replacementNode = img;
			}
		}

		if (replacementNode) {
			// Replace the parent <pre> block with the image/svg
			const pre = node.parentElement;
			if (pre && pre.tagName === 'PRE') {
				pre.replaceWith(replacementNode);
			} else {
				node.replaceWith(replacementNode);
			}
		}
	}

	return dom.body.innerHTML;
}

export async function exportDocuments(
	docs: ExportDocument[],
	options: ExporterOptions
): Promise<void> {
	if (docs.length === 0) return;

	if (options.format === 'docx') {
		let fullHtml = '';
		for (let i = 0; i < docs.length; i++) {
			const doc = docs[i];
			const html = await processMarkdownToHtml(doc, i, 'docx');

			// Add page break between documents
			const pageBreak = i < docs.length - 1 ? '<div style="page-break-after: always;"></div>' : '';

			fullHtml += `
				<div style="font-family: Arial, sans-serif;">
					<h1>${doc.title}</h1>
					${html}
				</div>
				${pageBreak}
			`;
		}

		// Ensure it's wrapped in a valid document structure for html-to-docx
		const documentHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${fullHtml}</body></html>`;

		try {
			const { default: htmlToDocx } = await import('html-to-docx');
			const { saveAs } = await import('file-saver');

			const buffer = await htmlToDocx(documentHtml, null, {
				table: { row: { cantSplit: true } },
				footer: true,
				pageNumber: true
			});
			const blob = new Blob([buffer], {
				type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
			});
			saveAs(blob, options.filename || 'export.docx');
		} catch (error) {
			console.error('Failed to generate DOCX', error);
			throw error;
		}
	} else if (options.format === 'pdf') {
		// For PDF, we dispatch an event or set a store that PrintLayout.svelte listens to.
		// Since we want this to be stateless, we can mount a temporary iframe,
		// but SvelteKit might have issues if we don't render Svelte components.
		// The most robust way is to open a new window or write to a hidden iframe.

		const iframe = document.createElement('iframe');
		iframe.style.position = 'absolute';
		iframe.style.width = '0';
		iframe.style.height = '0';
		iframe.style.border = 'none';
		document.body.appendChild(iframe);

		const iframeDoc = iframe.contentWindow?.document;
		if (!iframeDoc) {
			document.body.removeChild(iframe);
			throw new Error('Failed to create print frame');
		}

		let fullHtml = '';
		for (let i = 0; i < docs.length; i++) {
			const doc = docs[i];
			// For PDF, we inject raw inline SVGs for perfect vector fidelity
			const html = await processMarkdownToHtml(doc, i, 'pdf');
			const pageBreak = i < docs.length - 1 ? '<div style="page-break-after: always;"></div>' : '';

			fullHtml += `
				<div class="document">
					<h1>${doc.title}</h1>
					${html}
				</div>
				${pageBreak}
			`;
		}

		// Copy main window styles to iframe to preserve typography (Tailwind etc)
		const styles = Array.from(document.styleSheets)
			.map((sheet) => {
				try {
					return Array.from(sheet.cssRules)
						.map((rule) => rule.cssText)
						.join('');
				} catch {
					return '';
				}
			})
			.join('\n');

		iframeDoc.write(`
			<!DOCTYPE html>
			<html>
				<head>
					<meta charset="utf-8">
					<title>${options.filename || 'Export'}</title>
					<style>
						${styles}
						html, body { 
							height: auto !important; 
							min-height: auto !important;
							overflow: visible !important; 
							position: static !important;
							background: white !important; 
							color: black !important; 
							padding: 2rem; 
						}
						.document {
							page-break-inside: avoid;
						}
						@media print {
							@page { margin: 2cm; }
							html, body { padding: 0 !important; }
						}
					</style>
				</head>
				<body class="prose max-w-none">
					${fullHtml}
				</body>
			</html>
		`);
		iframeDoc.close();

		// Wait for images to load in the iframe
		iframe.onload = () => {
			setTimeout(() => {
				iframe.contentWindow?.focus();
				iframe.contentWindow?.print();
				setTimeout(() => {
					document.body.removeChild(iframe);
				}, 1000);
			}, 500);
		};
	}
}
