# Graph View — Implementation Plan to Reach Obsidian-Grade State of the Art

**Owner:** Quill / AgnosticIssuer
**Date:** 2026-06-30
**Scope:** `src/lib/components/GraphView.svelte` and adjacent state/services
**Goal:** Match Obsidian's Graph View feel (smooth pan/zoom with inertia, large-graph performance, local + global views, persistent layout, polished interaction model).

---

## 1. Executive summary

The current `GraphView.svelte` is a hand-rolled SVG force layout built on top of `d3-force` only (no `d3-zoom`, no `d3-drag`, no `d3-selection`). It is structurally fine for a toy demo but does not match how Obsidian's Graph View is built, and that mismatch is the reason the implementation feels sluggish and the camera does not behave the way you expect.

**What Obsidian actually uses** (confirmed by Obsidian developer joethei on the official forum, 2022-07-28):

> "Pixi.js is doing the rendering, everything else is custom. It used to be done with D3, but that was not performant enough."

So Obsidian's recipe is:

| Layer | Obsidian | Our current | Gap |
| --- | --- | --- | --- |
| Renderer | **Pixi.js** (WebGL with Canvas fallback) | Inline SVG with `{#each}` | Render path is the slowest possible for hundreds of nodes |
| Physics | Custom force simulation in **WASM** + **quadtree** (Barnes-Hut) | `d3-force` simulation only — `forceManyBody` runs in **O(N²)** | Performance cliff around 500–1000 nodes |
| Camera | Animated, with easing + inertia + zoom-anchored-to-cursor | Hand-rolled wheel handler, no inertia, jittery | UX does not match Obsidian |
| Layout persistence | Positions stored in the metadata cache | Lost on reload | Reset every time |
| Interaction model | Local + global views, k-hop neighborhood drag influence, animated "Animate" button, text fade by zoom, directional arrows | None of the above | Missing Obsidian's defining features |

The fastest path to "Obsidian-grade" is to **replace d3-force with graphology + ForceAtlas2 in a Web Worker, replace the SVG with Pixi.js (or Sigma.js, which is the most practical open-source WebGL equivalent), and add a real animated camera.** This is exactly the architecture Gephi Lite uses — a known good rewrite of the Gephi / Obsidian approach in TypeScript.

This document is split into three migration phases. You can ship Phase 1 this week, Phase 2 next sprint, Phase 3 once you decide the graph is a long-term feature.

---

## 2. Diagnosis of the current implementation

### 2.1 Why the graph is slow

1. **SVG + DOM-per-node + Svelte reactivity = full template work per tick.**
   The simulation mutates `node.x` / `node.y` on every tick. Svelte's `{#each nodes as node (node.id)}` block then re-evaluates, diffs, and rewrites every `<g>` transform. At ~500 nodes this is already past the comfort line for SVG; at 1000+ it grinds to a halt.

2. **No Barnes-Hut approximation.**
   `d3.forceManyBody()` is **O(N²)** by default — repulsion is computed for every node pair on every tick. Obsidian runs forces in WASM with a quadtree (Barnes-Hut approximation, O(N log N)).

3. **Whole-graph reheating on drag.**
   `simulation.alphaTarget(0.3).restart()` lights up the **entire** simulation every time you grab a node. Obsidian only re-heats the k-hop neighborhood around the dragged node.

4. **No level-of-detail.**
   Labels are drawn for every node even when zoomed out and off-screen. Obsidian fades labels in/out by zoom threshold.

5. **`{#each links}` is not keyed.**
   The links block has no `(link.id)` key, which forces Svelte to reconcile every edge SVG element on every tick.

6. **Reactive `$effect` rebuilds the whole `nodes` / `links` arrays.**
   Whenever `issues.issues` changes, the effect creates brand-new arrays and calls `simulation.nodes(nodes)` + `(simulation.force('link') as ...).links(links)`. Combined with the reactive `transform` mutation, this resets the sim alpha each time and discards the existing layout.

### 2.2 Why the pan/zoom does not feel like Obsidian

1. **Transform object recreated on every wheel event** — `transform = { x, y, k }` triggers a full re-render of the `<g>` element and every child. No direct DOM mutation, no `requestAnimationFrame` batching.

2. **Discrete wheel ratio (`* 1.1` / `/ 1.1`)** with no easing — Obsidian smooths the zoom with a continuous exponential curve and animates the camera. Look at `sigma.misc.animation.camera` for a reference implementation.

3. **No momentum on pan release.** Obsidian continues the view motion with deceleration after you let go of the mouse — feels "weighty." Our pan stops dead.

4. **`onpointerleave={handlePointerUp}` cancels an in-progress drag.** Wrong UX. Drag should end on `pointerup` (or be cancelled by Escape).

5. **Click vs drag disambiguation uses a 300 ms timestamp heuristic** instead of a real distance/time check. Easy to misfire on slow drags.

6. **`createSVGPoint()` + `getScreenCTM()` on every wheel tick** is expensive — better to maintain a single zoom transform with math, or use a dedicated camera abstraction.

### 2.3 What is already correct

- The reactive `transform` state shape `{ x, y, k }` is the right model (matches Sigma's `camera.x`, `camera.y`, `camera.ratio`).
- Keying the nodes `{#each}` with `(node.id)` is correct.
- Force layout parameters (`charge -300`, `collide +15`) are reasonable starting points.
- Wiring through `issues.issues` and `templates.byType` is sound.

You are not throwing this work away — you are porting it onto a real renderer + a real layout engine.

---

## 3. State-of-the-art survey

| Library | Renderer | Sweet spot | Notes |
| --- | --- | --- | --- |
| **Pixi.js** (Obsidian's choice) | WebGL/Canvas | Custom force layouts | Industrial-strength, but DIY everything |
| **Sigma.js v3 + graphology** | WebGL | 10k–100k nodes | Closest open-source equivalent to Obsidian; drop-in camera |
| **Cytoscape.js** | Canvas | 1k–10k nodes + graph algorithms | Great if we need BFS / centrality / PageRank |
| **d3-force + d3-zoom + d3-drag** | SVG | < 1k nodes | What we have minus the bugs |
| **force-graph** (vasturiano) | WebGL | Medium graphs, drop-in | Wraps three.js, supports 2D + 3D |

**Performance ceilings** (from the 2026 PkgPulse benchmark and the digitalrelics.uk heuristics):

| Nodes | Best renderer |
| --- | --- |
| < 50 | Anything |
| 50–1k | SVG (D3 / Cytoscape) |
| 1k–10k | Canvas (Cytoscape, Sigma canvas) |
| 10k–100k | WebGL (Sigma) |
| 100k+ | WebGL + LOD + backbones only |

For an agile project-management tool we expect ~50–2k issues + relations at the high end. **Sigma.js v3 + graphology + ForceAtlas2 in a Web Worker** is the right starting point. It is the same architecture Obsidian's internals follow minus the Pixi.js choice, and Sigma's `forceAtlas2` is a port of Gephi's algorithm, which is the most battle-tested layout in the open-source world.

References used during research:
- https://forum.obsidian.md/t/understanding-the-graph-view-core/41020 — confirmed Pixi.js
- https://obsidian.md/help/plugins/graph — force + interaction model spec
- https://github.com/jacomyal/sigma.js — Sigma v3 docs
- https://sim51.github.io/react-sigma/docs/example/layouts/ — Layout API
- https://graphology.github.io/ — Graph data model
- https://pkgpulse.com/blog/cytoscape-vs-vis-network-vs-sigma-graph-visualization-javascript-2026 — benchmark
- https://digitalrelics.uk/posts/data-visualisation/visualise-networks-web — size/renderer heuristic

---

## 4. Target architecture

```
Svelte component: GraphView.svelte
  └─ <div bind:this={container}>
       └─ Sigma instance (WebGL)
            ├─ Camera: animated pan, zoom (momentum built in)
            ├─ Worker thread: graphology + forceAtlas2 layout
            ├─ Renderer: Sigma WebGL renderer (built-in)
            ├─ IndexedDB cache for persistent node positions
            └─ Event: onClickNode → editor.open(id)
```

Data flow:

```
issues.issues + relations
  → memoized graphology Graph (rebuilt only when issues change)
  → Sigma renders + layout worker keeps repositioning
  → user drags node → pinned in graph (fx/fy on graphology attrs)
  → on commit, positions flushed to IndexedDB keyed by vault URL + content hash
```

Persistence key: `<vault-url-or-mode>:<issues-hash>` — re-use cached positions when the issue set is unchanged.

---

## 5. Migration phases

### Phase 1 — quick wins, keep SVG, fix the bugs (1–2 days)

This phase keeps the SVG renderer and `d3-force` but makes the existing code actually behave like Obsidian.

**Code changes in `GraphView.svelte`:**

1. **Mutable transform state with `$state` fields**, mutate in place to avoid full re-render:
   ```ts
   let tx = $state(0);   // pan x
   let ty = $state(0);   // pan y
   let scale = $state(1); // zoom
   ```
   Then bind via `style:transform="translate({tx}px,{ty}px) scale({scale})"` on the `<g>`.

2. **Wrap wheel/pan handlers in a single `requestAnimationFrame` loop** — coalesce events, write transform once per frame.

3. **Smooth wheel zoom** anchored to cursor:
   ```ts
   const factor = Math.exp(-e.deltaY * 0.0015); // continuous, not discrete
   const wx = (e.clientX - rect.left - tx) / scale;
   const wy = (e.clientY - rect.top - ty) / scale;
   scale *= factor;
   tx = e.clientX - rect.left - wx * scale;
   ty = e.clientY - rect.top - wy * scale;
   ```

4. **Inertia/momentum on pan release** — track velocity (avg of last N `movementX/Y`), apply decay each frame for ~300 ms after `pointerup`.

5. **Use `d3.forceManyBody().distanceMax(200)`** for free Barnes-Hut approximation (when available in `d3-force` v3; otherwise drop to Phase 2).

6. **Local drag influence** — only bump alpha of the dragged node + its 1-hop neighbors when dragging starts. Use the existing graph adjacency map.

7. **Click vs drag distance check** — record `pointerdown` position, only fire click if `pointerup` is within 4 px.

8. **Key the links block**: `{#each links as link (linkKey(link))}` where `linkKey` returns `${source.id}→${target.id}`.

9. **LOD for labels**: only render `<text>` when `scale > 0.6`. Below that, only render circles.

10. **Stable graph state** — maintain a `Map<id, Node>` and update positions in place; do not recreate the `nodes` array on every effect run. Use `$state` `Map` or a `$derived.by` over the issues.

11. **Remove `onpointerleave={handlePointerUp}`** — replace with proper `pointercancel` handling.

12. **Expose forces as sliders in `SettingsPanel`**: Center, Repel, Link, Link Distance (these are the four Obsidian exposes).

**Acceptance for Phase 1:**
- 500-node graph renders without dropped frames on a mid-range laptop
- Pan releases with visible momentum
- Wheel zoom is continuous, anchored to cursor
- Dragging a node only moves its neighbors
- Layout survives navigation within a session

### Phase 2 — switch to Canvas (2–3 days)

Replace the SVG `<g>` block with a single `<canvas>` element driven by a `requestAnimationFrame` loop.

1. Mount a `<canvas>` element bound to a `CanvasRenderingContext2D`.
2. Replace `d3-force` `tick` handler with a manual RAF loop that:
   - clears the canvas,
   - draws edges (Bresenham or 2D context lines),
   - draws nodes (circles, labels only if `scale > threshold`).
3. Use a spatial index (`flatbush` or `rbush`) for hit-testing clicks/hover.
4. Drive all SVG-jank sources away: no `createSVGPoint`, no `getScreenCTM`, no DOM diffing.
5. Reuse the pan/zoom/RAF/momentum code from Phase 1 — only the renderer changes.

**Acceptance for Phase 2:**
- 1000-node graph renders at 60 fps on a mid-range laptop
- All Phase 1 acceptance criteria still hold
- Hit-test is reliable to within 4 px

### Phase 3 — Sigma.js + graphology + Pixi-grade WebGL (4–6 days)

Replace the renderer + layout engine entirely.

**New dependencies** (pnpm):
```json
{
  "dependencies": {
    "sigma": "^3.0.0",
    "graphology": "^0.25.4",
    "graphology-layout-forceatlas2": "^0.10.1",
    "graphology-layout": "^0.6.1",
    "graphology-types": "^0.24.7"
  },
  "devDependencies": {
    "@types/graphology": "^0.24.0"
  }
}
```

Remove:
```json
"d3-force": "^3.0.0",
"@types/d3-force": "^3.0.10"
```

**Component shape:**

```ts
// src/lib/components/GraphView.svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Sigma } from 'sigma';
  import Graph from 'graphology';
  import forceAtlas2 from 'graphology-layout-forceatlas2';
  import { circular } from 'graphology-layout';
  import { getStores } from '$lib/state';
  import { persistedLayout } from '$lib/services/graph-persistence';

  const { issues, editor, templates } = getStores();
  let container: HTMLDivElement;
  let sigma: Sigma | undefined;

  onMount(() => {
    const graph = new Graph({ multi: true, type: 'directed' });

    // build graph from issues + relations ...
    // load persisted positions
    const cached = await persistedLayout.load(cacheKey);
    if (cached) applyPositions(graph, cached);
    else circular.assign(graph, { scale: 250 });

    sigma = new Sigma(graph, container, {
      renderEdgeLabels: false,
      defaultEdgeType: 'arrow',
      labelColor: { attribute: 'color' },
      labelDensity: 0.07,
      labelGridCellSize: 60,
      labelRenderedSizeThreshold: 6,
      minCameraRatio: 0.1,
      maxCameraRatio: 4,
    });

    // Run FA2 in a worker — see @react-sigma/layout-forceatlas2 patterns
    const worker = new Worker(new URL('$lib/workers/fa2-worker.ts', import.meta.url), { type: 'module' });
    worker.postMessage({ graph: graph.export(), settings: forceAtlas2.inferSettings(graph) });
    worker.onmessage = (e) => applyPositions(graph, e.data.positions);

    // Click node → open editor
    sigma.on('clickNode', ({ node }) => editor.open(Number(node)));

    // Persist on idle
    let saveHandle: number;
    const scheduleSave = () => {
      clearTimeout(saveHandle);
      saveHandle = window.setTimeout(() => {
        persistedLayout.save(cacheKey, snapshotPositions(graph));
      }, 2000);
    };
    sigma.on('afterDraw', scheduleSave);
  });

  onDestroy(() => sigma?.kill());
</script>

<div bind:this={container} class="relative w-full h-full"></div>
```

**New files to add:**
- `src/lib/services/graph-persistence.ts` — IndexedDB-backed position cache keyed by vault + content hash
- `src/lib/workers/fa2-worker.ts` — wraps `forceAtlas2.assign` so the simulation does not block the main thread
- `src/lib/services/graph-builder.ts` — turns `issues.issues` + relations into a `graphology.Graph`

**Layout pipeline** (mirrors Gephi Lite's three-stage init):
1. **Circular** — deterministic initial positions (so reload looks stable)
2. **ForceAtlas2** — runs in the worker, ~300 iterations
3. **Noverlap** — pushes nodes apart so labels don't collide

**Interaction parity with Obsidian:**
- Animated camera with easing (built into Sigma v3 — `sigma.camera.animate(...)`)
- Mouse-wheel zoom anchored to cursor (built in)
- Pan with mouse drag (built in)
- Click-to-open (subscribe to `clickNode`)
- Drag-to-pin (subscribe to `downNode` / `moveNode` / `upNode`)
- Local graph view — filter graph to k-hop neighborhood of focused issue, reuse same renderer

**Acceptance for Phase 3:**
- 2000-issue graph renders at 60 fps
- Pan/zoom feel indistinguishable from Obsidian's Graph View
- Layout persists across reloads
- Forces are exposed as sliders in settings, hot-applied
- Local graph (k-hop) view works
- Drag-pin persists across reloads
- Text labels fade by zoom (Sigma `labelRenderedSizeThreshold`)

---

## 6. Persistence format

Store positions in IndexedDB under a content-addressed key. Schema:

```ts
type PersistedLayout = {
  version: 1;
  key: string;             // `${vaultId}:${sha256(sortedIssueIds + sortedRelationPairs)}`
  savedAt: string;         // ISO 8601
  positions: Record<string, { x: number; y: number }>;
  pinned: Record<string, { x: number; y: number; pinned: true }>;
};
```

Invalidate when the issue set or relation set changes (different sha256). Never silently overwrite a user's manual pinning — show a "Reset layout" button in settings.

---

## 7. Force presets

Match Obsidian's default values as a starting point, expose them in `SettingsPanel`:

| Preset | Center | Repel | Link | Link distance |
| --- | --- | --- | --- | --- |
| Obsidian default | 0.48 | 16.41 | 0.44 | 198 |
| Compact (small vaults) | 0.9 | 8.0 | 1.0 | 60 |
| Spread out (large vaults) | 0.3 | 30.0 | 0.4 | 250 |

(Reference: https://deepwiki.com/sakuramodki/obsidian/2.1-graph-visualization — `.obsidian/graph.json`)

---

## 8. Local graph view (out of scope for Phase 1)

Obsidian has two graph views: **global** (entire vault) and **local** (k-hop neighborhood of the focused note). The product spec for quill.md does not currently call this out, but it is the single feature that distinguishes Obsidian from a generic graph viewer. Recommended:

- Add a "Local graph" toggle in the Graph view toolbar.
- Filter the `graphology.Graph` to nodes within N hops of `editor.openIssueId` (default N = 2).
- Reuse the same Sigma renderer — just swap the data set.

---

## 9. Testing

### Unit tests (Vitest, server project)
- `graph-builder.ts` — node/edge count, isolated components dropped, duplicate relations merged
- `graph-persistence.ts` — round-trip positions, key collision, large-vault hashing
- `forceAtlas2` settings inference — sanity check on small graphs

### Visual regression tests (Playwright, client project)
- Snapshot the canvas at 4 stages: empty, 50 nodes, 500 nodes, 2000 nodes.
- Snapshot pan/zoom at fixed transform values.

### Manual QA checklist
- [ ] Pan feels weighty (momentum for ~300 ms after release)
- [ ] Wheel zoom is smooth (no stepping)
- [ ] Drag a node — neighbors respond, distant nodes don't
- [ ] Release a dragged node — it stays where you put it (pinned) until you explicitly unpin
- [ ] Reload — pinned nodes still pinned
- [ ] Reload after adding 1 new issue — only the new node starts cold, others keep their layout
- [ ] Switch from local to remote mode — layout preserved
- [ ] "Reset layout" button — clears pins, runs `circular` + `forceAtlas2` from scratch

---

## 10. Rollout

| Phase | Days | Risk | Reversible |
| --- | --- | --- | --- |
| 1 | 1–2 | Low — same stack, same libs | Yes |
| 2 | 2–3 | Medium — renderer swap | Yes |
| 3 | 4–6 | High — new deps, worker, persistence | Yes (keep Phase 2 path behind a flag) |

Ship Phase 1 immediately behind a feature flag (`config.json: graph.v2 = false`) and turn it on once verified. Phase 3 should ship as a parallel renderer selectable from settings — never break the SVG version until the Sigma version has been used for at least two sprints.

---

## 11. Open questions to confirm before implementation

1. **Do we want 3D?** force-graph supports it out of the box. Obsidian has a separate 3D Graph plugin. Probably out of scope — confirm.
2. **Persistent layout — global or per-vault?** Suggest per-vault (key = vault URL or mode + content hash). Confirm.
3. **Should "Reset layout" be a confirmation dialog?** Suggest yes, since it destroys pinned positions.
4. **i18n strings for the new toolbar buttons** (`Zoom in`, `Zoom out`, `Fit view`, `Reset layout`, `Local graph`, `Global graph`, `Animate`). All already present in `en.ts` / `es.ts` for `Fit view`; the others will need translation. Confirm.
5. **CSP budget** — Sigma bundles `gl-matrix` and a WebGL helper. Check `scripts/check-csp.mjs` after adding the deps.

---

## 12. References

- Obsidian Graph View (confirmed Pixi.js): https://forum.obsidian.md/t/understanding-the-graph-view-core/41020
- Obsidian Graph View docs (forces, navigation): https://obsidian.md/help/plugins/graph
- Sigma.js v3: https://github.com/jacomyal/sigma.js
- graphology: https://graphology.github.io/
- ForceAtlas2 paper: Jacomy, Venturini, Heymann, Bastian (2014) — ForceAtlas2, a continuous graph layout algorithm for handy network visualization designed for the Gephi software
- React Sigma layouts: https://sim51.github.io/react-sigma/docs/example/layouts/
- Performance benchmarks: https://pkgpulse.com/blog/cytoscape-vs-vis-network-vs-sigma-graph-visualization-javascript-2026
- Renderer size heuristic: https://digitalrelics.uk/posts/data-visualisation/visualise-networks-web
- Gephi Lite (architecture reference): https://gephi.wordpress.com/2022/11/15/gephi-lite/