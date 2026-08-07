<script lang="ts">
	import { t } from '$lib/ui/strings';
	import { page } from '$app/stores';

	type Props = {
		title?: string;
		description?: string;
		type?: string;
		image?: string;
	};

	let { title, description, type = 'website', image = '/favicon.svg' }: Props = $props();

	const siteName = t('app.name');
	const defaultDescription = t('app.description');

	const finalTitle = $derived(title ? `${title} | ${siteName}` : siteName);
	const finalDescription = $derived(description || defaultDescription);
	// In adapter-static, $page.url.pathname is correct relative to the base domain
	const canonical = $derived(`https://quill.md${$page.url.pathname}`);

	const jsonLd = $derived(
		JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'WebApplication',
			name: siteName,
			description: finalDescription,
			url: canonical,
			applicationCategory: 'ProjectManagement',
			operatingSystem: 'Any',
			offers: {
				'@type': 'Offer',
				price: '0',
				priceCurrency: 'USD'
			}
		})
	);

	const faqLd = $derived(
		JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'FAQPage',
			mainEntity: [
				{
					'@type': 'Question',
					name: 'How does Quill.md manage local data?',
					acceptedAnswer: {
						'@type': 'Answer',
						text: t('home.howItWorks.pickFolder.body')
					}
				},
				{
					'@type': 'Question',
					name: 'How can I visualize my repository issues?',
					acceptedAnswer: {
						'@type': 'Answer',
						text: t('home.howItWorks.browse.body')
					}
				},
				{
					'@type': 'Question',
					name: 'How are my edits and commits saved?',
					acceptedAnswer: {
						'@type': 'Answer',
						text: t('home.howItWorks.edit.body')
					}
				}
			]
		})
	);

	const jsonLdHtml = $derived(
		'<scr' + 'ipt type="application/ld+json">' + jsonLd + '</scr' + 'ipt>'
	);
	const faqLdHtml = $derived('<scr' + 'ipt type="application/ld+json">' + faqLd + '</scr' + 'ipt>');
</script>

<svelte:head>
	<title>{finalTitle}</title>
	<meta name="description" content={finalDescription} />

	<!-- Open Graph -->
	<meta property="og:type" content={type} />
	<meta property="og:title" content={finalTitle} />
	<meta property="og:description" content={finalDescription} />
	<meta property="og:url" content={canonical} />
	<meta property="og:site_name" content={siteName} />
	<meta property="og:image" content={image} />

	<!-- Twitter -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={finalTitle} />
	<meta name="twitter:description" content={finalDescription} />
	<meta name="twitter:image" content={image} />

	<!-- Canonical -->
	<link rel="canonical" href={canonical} />

	<!-- JSON-LD Schema Markup -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html jsonLdHtml}
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html faqLdHtml}
</svelte:head>
