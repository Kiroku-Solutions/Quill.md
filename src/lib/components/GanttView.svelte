<!--
	GanttView — plain-SVG horizontal timeline (FR-6, NFR-4). Auto-fit X
	axis to min/max start/end dates; default `group_by = 'issue_type'`
	(honours `config.gantt.group_by`). Dependency arrows for blocks /
	depends_on when both endpoints are dated. Click a bar → editor.open.
-->
<script lang="ts">
	import { getStores, brandIssueId, type IssueId } from '$lib/state';
	import type { LoadedIssue } from '$lib/types';

	const { issues, filter, config, editor } = getStores();

	const COL_W = 200;
	const ROW_H = 28;
	const GAP = 8;
	const BAR_H = 18;
	const AXIS_H = 36;
	const PAD_L = COL_W;
	const PAD_R = 24;
	const PAD_T = 8;
	const PAD_B = 8;
	const MS_DAY = 86_400_000;

	type Row = { group: string; issue: LoadedIssue; rowInGroup: number };
	type Bar = {
		id: IssueId;
		x: number;
		y: number;
		w: number;
		h: number;
		title: string;
		type: string;
		status: string;
		group: string;
		startDate: string | null;
		endDate: string | null;
		duration: number | null;
	};

	let grouped = $state<readonly Row[]>([]);
	let undated = $state<readonly LoadedIssue[]>([]);
	let minMs = $state(0);
	let maxMs = $state(0);
	const pxPerDay = 2;

	$effect(() => {
		const all = issues.issues;
		const f = filter.filter;
		const groupBy =
			(
				config as unknown as {
					config: { gantt?: { group_by?: string } } | null;
				}
			).config?.gantt?.group_by ?? 'issue_type';

		const filtered = all.filter((li) => {
			if (f.type && li.issue.issueType !== f.type) return false;
			if (f.q) {
				const n = f.q.toLowerCase();
				if (
					!li.issue.title.toLowerCase().includes(n) &&
					!li.issue.sections.some((s) => s.markdown.toLowerCase().includes(n))
				)
					return false;
			}
			return true;
		});

		const dated: LoadedIssue[] = [];
		const notDated: LoadedIssue[] = [];
		for (const li of filtered) (li.issue.startDate ? dated : notDated).push(li);
		undated = notDated;

		let lo = Infinity;
		let hi = -Infinity;
		for (const li of dated) {
			const s = Date.parse(li.issue.startDate!);
			const e = li.issue.endDate
				? Date.parse(li.issue.endDate)
				: s + (li.issue.duration ?? 1) * MS_DAY;
			if (s < lo) lo = s;
			if (e > hi) hi = e;
		}
		if (!Number.isFinite(lo)) {
			const now = Date.now();
			lo = now;
			hi = now + 30 * MS_DAY;
		}
		minMs = lo - MS_DAY;
		maxMs = hi + MS_DAY;

		// Local accumulator for the bucketing pass. The map is consumed
		// immediately below and never escapes this `$effect` — a plain
		// `Map` is correct (the reactive output is `grouped`, the flat
		// array assigned two lines down).
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const groups = new Map<string, LoadedIssue[]>();
		for (const li of dated) {
			const k = String((li.issue as unknown as Record<string, unknown>)[groupBy] ?? 'unknown');
			(groups.get(k) ?? groups.set(k, []).get(k)!).push(li);
		}
		const out: Row[] = [];
		for (const [group, items] of groups) {
			items.sort((a, b) => a.issue.id - b.issue.id);
			items.forEach((issue, i) => out.push({ group, issue, rowInGroup: i }));
		}
		grouped = out;
	});

	function dayStart(ms: number): number {
		// Local computation: round a millisecond timestamp down to the
		// start of its UTC day. The Date is never stored — only `getTime()`
		// is returned. Not reactive state.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const d = new Date(ms);
		d.setUTCHours(0, 0, 0, 0);
		return d.getTime();
	}
	function xFor(ms: number): number {
		return PAD_L + ((dayStart(ms) - dayStart(minMs)) / MS_DAY) * pxPerDay;
	}
	function yFor(gi: number, ri: number): number {
		return PAD_T + AXIS_H + gi * (ROW_H + GAP) + ri * ROW_H;
	}

	const groupKeys = $derived([...new Set(grouped.map((r) => r.group))]);

	const bars = $derived<readonly Bar[]>(
		(() => {
			if (grouped.length === 0) return [] as Bar[];
			// Local accumulator used to assign stable y-positions to each
			// group. Consumed within the `$derived` body — never escapes.
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const gi = new Map<string, number>();
			for (const r of grouped) if (!gi.has(r.group)) gi.set(r.group, gi.size);
			const out: Bar[] = [];
			for (const r of grouped) {
				const li = r.issue;
				const s = Date.parse(li.issue.startDate!);
				const e = li.issue.endDate
					? Date.parse(li.issue.endDate)
					: s + (li.issue.duration ?? 1) * MS_DAY;
				const x = xFor(s);
				out.push({
					id: brandIssueId(li.issue.id),
					x,
					y: yFor(gi.get(r.group) ?? 0, r.rowInGroup),
					w: Math.max(8, xFor(e) - x),
					h: BAR_H,
					title: li.issue.title,
					type: li.issue.issueType,
					status: li.issue.status,
					group: r.group,
					startDate: li.issue.startDate,
					endDate: li.issue.endDate,
					duration: li.issue.duration
				});
			}
			return out;
		})()
	);

	const indexed = $derived(new Map(bars.map((b) => [b.id, b])));

	const arrows = $derived<readonly { d: string }[]>(
		grouped.flatMap((r) =>
			r.issue.issue.relations
				.filter((rel) => rel.type === 'blocks' || rel.type === 'depends_on')
				.flatMap((rel) => {
					const from = indexed.get(brandIssueId(r.issue.issue.id));
					const to = indexed.get(brandIssueId(rel.id));
					if (!from || !to) return [];
					const x1 = from.x + from.w;
					const y1 = from.y + from.h / 2;
					const x2 = to.x;
					const y2 = to.y + to.h / 2;
					const cx = Math.max(x1 + 16, (x1 + x2) / 2);
					return [{ d: `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}` }];
				})
		)
	);

	const axisTicks = $derived<readonly { x: number; label: string }[]>(
		(() => {
			const startDay = dayStart(minMs);
			const endDay = dayStart(maxMs);
			const totalDays = Math.max(1, (endDay - startDay) / MS_DAY);
			const stepDays = Math.max(1, Math.round(totalDays / 12 / 7) * 7) || 7;
			const ticks: { x: number; label: string }[] = [];
			const first = Math.ceil(startDay / MS_DAY / stepDays) * stepDays;
			for (let d = first; d * MS_DAY <= endDay; d += stepDays) {
				ticks.push({
					x: xFor(d * MS_DAY),
					label: new Date(d * MS_DAY).toISOString().slice(0, 10)
				});
			}
			return ticks;
		})()
	);

	const svgWidth = $derived(Math.max(PAD_L + ((maxMs - minMs) / MS_DAY) * pxPerDay + PAD_R, 600));
	const svgHeight = $derived(
		Math.max(PAD_T + AXIS_H + groupKeys.length * (ROW_H + GAP) + PAD_B, 120)
	);

	const palette: Record<string, string> = {
		epic: '#f97316',
		'user-story': '#0ea5e9',
		task: '#10b981',
		bug: '#e74c3c'
	};
	const colorFor = (t: string): string => palette[t] ?? '#64748b';

	function open(id: IssueId): void {
		editor.open(id);
	}
</script>

<div class="p-4 space-y-6">
	<div class="overflow-x-auto bg-base-100 border border-base-300 rounded">
		<svg
			role="img"
			aria-label="Gantt timeline"
			width={svgWidth}
			height={svgHeight}
			xmlns="http://www.w3.org/2000/svg"
		>
			<defs>
				<marker
					id="gantt-arrow"
					viewBox="0 0 10 10"
					refX="9"
					refY="5"
					markerUnits="strokeWidth"
					markerWidth="8"
					markerHeight="8"
					orient="auto-start-reverse"
				>
					<path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
				</marker>
			</defs>

			<g>
				<line
					x1={PAD_L}
					y1={PAD_T + AXIS_H - 1}
					x2={svgWidth - PAD_R}
					y2={PAD_T + AXIS_H - 1}
					stroke="#cbd5e1"
				/>
				{#each axisTicks as t (t.x)}
					<line x1={t.x} y1={PAD_T + 8} x2={t.x} y2={PAD_T + AXIS_H - 1} stroke="#e2e8f0" />
					<text x={t.x} y={PAD_T + 12} font-size="10" fill="#64748b" text-anchor="middle"
						>{t.label}</text
					>
				{/each}
			</g>

			{#each groupKeys as g, i (g)}
				<text x={8} y={yFor(i, 0) + BAR_H / 2 + 4} font-size="11" font-weight="600" fill="#475569"
					>{g}</text
				>
			{/each}

			{#each bars as bar (bar.id)}
				<g
					class="cursor-pointer"
					onclick={() => open(bar.id)}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							open(bar.id);
						}
					}}
					role="button"
					tabindex="0"
					aria-label={`Issue ${bar.id}: ${bar.title}`}
				>
					<rect
						x={bar.x}
						y={bar.y}
						width={bar.w}
						height={bar.h}
						rx="3"
						ry="3"
						fill={colorFor(bar.type)}
						opacity="0.85"
					/>
					<text x={bar.x + 6} y={bar.y + bar.h / 2 + 4} font-size="11" fill="#fff">
						{bar.title.length > 30 ? bar.title.slice(0, 30) + '…' : bar.title}
					</text>
				</g>
			{/each}

			<g fill="none" stroke="#475569" stroke-width="1.5" marker-end="url(#gantt-arrow)">
				{#each arrows as a, i (i)}
					<path d={a.d} />
				{/each}
			</g>
		</svg>
	</div>

	<details class="bg-base-200 rounded p-3 text-sm">
		<summary class="cursor-pointer font-semibold">Textual fallback (NFR-4 accessibility)</summary>
		<div class="overflow-x-auto mt-3">
			<table class="table table-zebra table-xs">
				<thead>
					<tr>
						<th>id</th><th>title</th><th>type</th><th>status</th>
						<th>group</th><th>start</th><th>end / duration</th>
					</tr>
				</thead>
				<tbody>
					{#each bars as bar (bar.id)}
						<tr class="hover cursor-pointer" onclick={() => open(bar.id)}>
							<td class="font-mono">{bar.id.toString().padStart(4, '0')}</td>
							<td>{bar.title}</td>
							<td>{bar.type}</td>
							<td>{bar.status}</td>
							<td>{bar.group}</td>
							<td>{bar.startDate ?? '—'}</td>
							<td>{bar.endDate ?? (bar.duration ? `${bar.duration} d` : '—')}</td>
						</tr>
					{/each}
					{#each undated as li (li.issue.id)}
						<tr
							class="hover cursor-pointer opacity-60"
							onclick={() => open(brandIssueId(li.issue.id))}
						>
							<td class="font-mono">{li.issue.id.toString().padStart(4, '0')}</td>
							<td>{li.issue.title}</td>
							<td>{li.issue.issueType}</td>
							<td>{li.issue.status}</td>
							<td colspan="2" class="italic">Not scheduled</td>
							<td>—</td>
						</tr>
					{/each}
					{#if bars.length === 0 && undated.length === 0}
						<tr>
							<td colspan="7" class="text-center opacity-60 py-6"
								>No issues match the current filter.</td
							>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	</details>
</div>
