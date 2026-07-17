<!--
	GanttView.svelte — plain-SVG horizontal timeline (FR-6, NFR-4).
	Auto-fit X axis to min/max start/end dates; default
	`group_by = 'issue_type'` (honours `config.gantt.group_by`).
	Dependency arrows for blocks / depends_on when both endpoints
	are dated. Click a bar → editor.open.

	Sub-phase 6E polish:
	  - `colorFor(type)` now reads from `templatesStore.byType`; the
	    hard-coded 4-entry palette is gone. A deterministic 32-bit
	    hash → oklch fallback (see `$lib/ui/colors.ts`) covers
	    templates without a `color`.
	  - Empty state: when no issues are dated, render a 6B `EmptyState`
	    (hero surface, with the standard icon + title + body).
	    The existing textual fallback `<details>` block is preserved
	    so screen readers and keyboard users have a tabular view too.
-->
<script lang="ts">
	import { getStores, brandIssueId, type IssueId } from '$lib/state';
	import { EmptyState } from '$lib/ui';
	import { t } from '$lib/ui/strings';
	import { fallbackColor } from '$lib/ui/colors';
	import type { LoadedIssue } from '$lib/types';

	const { issues, filter, config, editor, templates } = getStores();

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

	const pxPerDay = 2;

	const globalGroupBy = $derived(filter.filter.groupBy ?? 'none');

	const groupsMatchList = $derived.by(() => {
		if (globalGroupBy === 'sprint') {
			const sprintIssues = Array.from(issues.byId.values()).filter(
				(li) => li.issue.issueType === 'sprint'
			);
			const definedGroups = sprintIssues.map((s) => ({
				id: `sprint-${s.issue.id}`,
				title: s.issue.title,
				match: (issue: import('$lib/types').Issue) =>
					issue.relations.some((r) => r.id === s.issue.id) ||
					s.issue.relations.some((r) => r.id === issue.id)
			}));
			return [...definedGroups, { id: 'unassigned', title: 'Sin Asignar', match: () => true }];
		}
		if (globalGroupBy === 'epic') {
			const epicIssues = Array.from(issues.byId.values()).filter(
				(li) => li.issue.issueType === 'epic'
			);
			const definedGroups = epicIssues.map((e) => ({
				id: `epic-${e.issue.id}`,
				title: e.issue.title,
				match: (issue: import('$lib/types').Issue) =>
					issue.relations.some((r) => r.id === e.issue.id) ||
					e.issue.relations.some((r) => r.id === issue.id)
			}));
			return [...definedGroups, { id: 'unassigned', title: 'Sin Asignar', match: () => true }];
		}
		return null;
	});

	const derivedGanttData = $derived(
		(() => {
			const all = Array.from(issues.byId.values());
			const f = filter.filter;
			const fallbackGroupBy =
				(
					config as unknown as {
						config: { gantt?: { group_by?: string } } | null;
					}
				).config?.gantt?.group_by ?? 'issueType';

			const filtered = all.filter((li) => {
				if (f.status && li.issue.status !== f.status) return false;
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
			const minMs = lo - MS_DAY;
			const maxMs = hi + MS_DAY;

			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const groups = new Map<string, LoadedIssue[]>();
			for (const li of dated) {
				let k = 'unknown';
				if (groupsMatchList) {
					const g =
						groupsMatchList.find((g) => g.id !== 'unassigned' && g.match(li.issue)) ||
						groupsMatchList[groupsMatchList.length - 1];
					if (g) k = g.title;
				} else {
					k = String(
						(li.issue as unknown as Record<string, unknown>)[fallbackGroupBy] ?? 'unknown'
					);
				}
				(groups.get(k) ?? groups.set(k, []).get(k)!).push(li);
			}

			const out: Row[] = [];
			if (groupsMatchList) {
				for (const g of groupsMatchList) {
					const items = groups.get(g.title);
					if (items) {
						items.sort((a, b) => a.issue.id - b.issue.id);
						items.forEach((issue, i) => out.push({ group: g.title, issue, rowInGroup: i }));
						groups.delete(g.title);
					}
				}
			}
			for (const [group, items] of groups) {
				items.sort((a, b) => a.issue.id - b.issue.id);
				items.forEach((issue, i) => out.push({ group, issue, rowInGroup: i }));
			}
			return { grouped: out, undated: notDated, minMs, maxMs };
		})()
	);

	const grouped = $derived(derivedGanttData.grouped);
	const undated = $derived(derivedGanttData.undated);
	const minMs = $derived(derivedGanttData.minMs);
	const maxMs = $derived(derivedGanttData.maxMs);

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

	/**
	 * Look up a colour for a given issue type. Reads
	 * `templatesStore.byType`; falls back to a deterministic
	 * hash → oklch colour (see `$lib/ui/colors.ts`) so missing
	 * template colours never blow up the renderer. The lookup
	 * is a pure function of the inputs (no `Date.now()` or
	 * randomness) so it is SSR-safe.
	 */
	function colorFor(t: string): string {
		const fromTemplate = templates.byType.get(t)?.color;
		return fromTemplate ?? fallbackColor(t);
	}

	function open(id: IssueId): void {
		editor.open(id);
	}

	const isEmpty = $derived(grouped.length === 0 && undated.length === 0);
</script>

<div class="space-y-6 p-4">
	{#if isEmpty}
		<EmptyState title={t('gantt.emptyTitle')} body={t('gantt.emptyBody')} />
	{:else}
		<div class="overflow-x-auto rounded-xl border border-border bg-background shadow-sm">
			<svg
				aria-roledescription={t('gantt.roleDescription')}
				aria-label={t('gantt.ariaLabel')}
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
					{@const barDescId = `gantt-bar-desc-${bar.id}`}
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
						aria-label={t('gantt.barAria', { id: bar.id, title: bar.title })}
						aria-describedby={barDescId}
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
							{bar.title.length > 30 ? bar.title.slice(0, 30) + t('gantt.truncation') : bar.title}
						</text>
					</g>
				{/each}

				<g fill="none" stroke="#475569" stroke-width="1.5" marker-end="url(#gantt-arrow)">
					{#each arrows as a, i (i)}
						<path d={a.d} />
					{/each}
				</g>
			</svg>
			<!--
				Screen-reader-only prose descriptions for every bar.
				Each `<span>` is referenced by the matching bar's
				`aria-describedby`. Mounted once per bar so the ID
				resolution is stable for assistive tech. `sr-only`
				keeps the descriptions out of the visual flow without
				suppressing them from the accessibility tree.
				(Step 8, NFR-4 — bar-by-bar descriptions.)
			-->
			<div class="sr-only" data-testid="gantt-bar-descriptions">
				{#each bars as bar (bar.id)}
					<span id={`gantt-bar-desc-${bar.id}`}>
						{t('gantt.barDescription', {
							status: bar.status,
							type: bar.type,
							group: bar.group,
							start: bar.startDate ?? '?',
							end: bar.endDate ?? '',
							duration: bar.duration ?? 0
						})}
					</span>
				{/each}
			</div>
		</div>
	{/if}

	<details class="mt-8 rounded-xl border border-border bg-surface p-5 text-sm">
		<summary class="cursor-pointer font-bold text-foreground">{t('gantt.fallbackSummary')}</summary>
		<div class="mt-4 overflow-x-auto rounded-lg border border-border bg-background shadow-sm">
			<table class="w-full text-left text-sm whitespace-nowrap">
				<thead
					class="border-b border-border bg-surface text-[11px] font-bold tracking-widest text-muted-foreground uppercase"
				>
					<tr>
						<th class="px-4 py-3">{t('gantt.fallbackHeaders.id')}</th>
						<th class="px-4 py-3">{t('gantt.fallbackHeaders.title')}</th>
						<th class="px-4 py-3">{t('gantt.fallbackHeaders.type')}</th>
						<th class="px-4 py-3">{t('gantt.fallbackHeaders.status')}</th>
						<th class="px-4 py-3">{t('gantt.fallbackHeaders.group')}</th>
						<th class="px-4 py-3">{t('gantt.fallbackHeaders.start')}</th>
						<th class="px-4 py-3">{t('gantt.fallbackHeaders.endOrDuration')}</th>
					</tr>
				</thead>
				<tbody class="divide-hairline divide-y">
					{#each bars as bar (bar.id)}
						<tr
							class="cursor-pointer text-foreground transition-colors hover:bg-surface"
							onclick={() => open(bar.id)}
						>
							<td class="px-4 py-3 font-mono text-xs text-muted-foreground"
								>{bar.id.toString().padStart(4, '0')}</td
							>
							<td class="px-4 py-3">{bar.title}</td>
							<td class="px-4 py-3">{bar.type}</td>
							<td class="px-4 py-3">{bar.status}</td>
							<td class="px-4 py-3">{bar.group}</td>
							<td class="px-4 py-3">{bar.startDate ?? '—'}</td>
							<td class="px-4 py-3"
								>{bar.endDate ??
									(bar.duration ? t('gantt.duration', { n: bar.duration }) : '—')}</td
							>
						</tr>
					{/each}
					{#each undated as li (li.issue.id)}
						<tr
							class="cursor-pointer text-muted-foreground transition-colors hover:bg-surface"
							onclick={() => open(brandIssueId(li.issue.id))}
						>
							<td class="px-4 py-3 font-mono text-xs">{li.issue.id.toString().padStart(4, '0')}</td>
							<td class="px-4 py-3">{li.issue.title}</td>
							<td class="px-4 py-3">{li.issue.issueType}</td>
							<td class="px-4 py-3">{li.issue.status}</td>
							<td colspan="2" class="px-4 py-3 italic">{t('gantt.fallbackNotScheduled')}</td>
							<td class="px-4 py-3">—</td>
						</tr>
					{/each}
					{#if bars.length === 0 && undated.length === 0}
						<tr>
							<td colspan="7" class="py-12 text-center font-medium text-muted-foreground italic"
								>{t('gantt.fallbackEmpty')}</td
							>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	</details>
</div>
