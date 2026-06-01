# Spider Axis Detail Popout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a click-to-open detail strip to the pinned spider card that shows a stat's rank, league average, player value, and percentile for the page's active window and per-mode.

**Architecture:** The service worker already fetches the full league per window and ranks it, so rank, n, and league average are computed at spider-build time and bundled into the existing `getSpiderData` response (Approach A). The content-script controller reads the active window's slice on demand; window switching is client-side, per-mode switching refetches.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest + jsdom, Vanilla shadow-DOM UI, SVG.

Design spec: `docs/superpowers/specs/2026-06-01-spider-axis-popout-design.md`
Interactive mockup: `docs/mockups/spider-axis-popout.html`

---

## File Structure

- `src/shared/spider.ts` (modify) - add `StatRanking` / `RankingRecord` types; extend `WindowSlice` with `ranks`, `n`, `leagueAvg`.
- `src/background/percentiles.ts` (modify) - `buildPercentileTable` returns percentile + rank + n per stat.
- `src/background/leagueAverages.ts` (create) - pure `leagueMean(rows, key)` helper.
- `src/background/spiderService.ts` (modify) - populate the new `WindowSlice` fields.
- `src/ui/spider-chart.ts` (modify) - per-axis click hit-areas + active-axis highlight.
- `src/ui/spider-tooltip.ts` (modify) - strip markup, `getWindow` dep, `onWindowChange` handle, axis-click interaction.
- `src/pages/players.ts` (modify) - pass `getWindow`, call `onWindowChange` on window change.
- `docs/SMOKE.md` (modify) - manual checklist entry.
- Tests: `test/unit/percentiles.test.ts`, `test/unit/leagueAverages.test.ts`, `test/unit/spiderService.test.ts`, `test/unit/spider-chart.test.ts`, `test/unit/spider-tooltip.test.ts`.

Reference facts (verified in the current codebase):
- `WindowKey = "Season" | "Last5" | "Last10"`; `PerModeKey = "PerGame" | "Per36" | "Per100Possessions"`.
- `SpiderData.windows` slots are `season`, `L10`, `L5`. `spiderService` maps `season->Season`, `L10->Last10`, `L5->Last5`.
- `PlayerStatRow = { nbaId, name, teamAbbr, position, stats: Record<string, number> }`.
- `buildPercentileTable`'s only consumer is `spiderService.ts`.
- `bar.getSettings()` returns `FilterSettings` with `.window: WindowKey` and `.perMode: PerModeKey`.

---

### Task 1: Ranking returns rank + n

Extend the ranking function so each stat carries percentile, 1-based competition rank, and the ranked-player count. Keep the existing average-rank percentile math unchanged so the chart polygons do not move.

**Files:**
- Modify: `src/shared/spider.ts`
- Modify: `src/background/percentiles.ts`
- Modify: `src/background/spiderService.ts:43-44,66-73`
- Test: `test/unit/percentiles.test.ts`

- [ ] **Step 1: Add the ranking types to `src/shared/spider.ts`**

Add below the existing `PercentileRecord` definition (keep `PercentileRecord` as-is; it is still used by `WindowSlice.percentiles`):

```ts
/** Per-stat ranking detail produced by buildPercentileTable. */
export interface StatRanking {
  /** 0..100, average-rank method (unchanged from the original percentile). */
  percentile: number;
  /** 1-based competition rank; ties share the best (lowest) rank. */
  rank: number;
  /** Count of players with a valid value for this stat (the rank denominator). */
  n: number;
}

export type RankingRecord = Partial<Record<SpiderStatKey, StatRanking>>;
```

- [ ] **Step 2: Update the existing percentile tests to the new shape and add rank/n cases**

Replace the body of `test/unit/percentiles.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { buildPercentileTable } from "../../src/background/percentiles.js";
import type { PlayerStatRow } from "../../src/shared/types.js";

function row(nbaId: number, stats: Record<string, number>): PlayerStatRow {
  return { nbaId, name: `p${nbaId}`, teamAbbr: "XXX", position: null, stats };
}

describe("buildPercentileTable", () => {
  it("scores each player by their league rank per stat, 0..100", () => {
    const rows = [
      row(1, { PTS: 10, REB: 5 }),
      row(2, { PTS: 20, REB: 4 }),
      row(3, { PTS: 30, REB: 3 }),
      row(4, { PTS: 40, REB: 2 }),
    ];
    const table = buildPercentileTable(rows, ["PTS", "REB"], new Set());
    expect(table.get(1)?.PTS?.percentile).toBe(25);
    expect(table.get(2)?.PTS?.percentile).toBe(50);
    expect(table.get(3)?.PTS?.percentile).toBe(75);
    expect(table.get(4)?.PTS?.percentile).toBe(100);
  });

  it("assigns 1-based competition rank, 1 = best (highest) for normal stats", () => {
    const rows = [row(1, { PTS: 10 }), row(2, { PTS: 20 }), row(3, { PTS: 30 }), row(4, { PTS: 40 })];
    const table = buildPercentileTable(rows, ["PTS"], new Set());
    expect(table.get(4)?.PTS?.rank).toBe(1);
    expect(table.get(3)?.PTS?.rank).toBe(2);
    expect(table.get(1)?.PTS?.rank).toBe(4);
    expect(table.get(1)?.PTS?.n).toBe(4);
  });

  it("inverts both percentile and rank for inverted stats (1 = lowest value)", () => {
    const rows = [row(1, { TOV: 1 }), row(2, { TOV: 2 }), row(3, { TOV: 3 }), row(4, { TOV: 4 })];
    const table = buildPercentileTable(rows, ["TOV"], new Set(["TOV"]));
    expect(table.get(1)?.TOV?.percentile).toBe(100);
    expect(table.get(1)?.TOV?.rank).toBe(1);
    expect(table.get(4)?.TOV?.percentile).toBe(25);
    expect(table.get(4)?.TOV?.rank).toBe(4);
  });

  it("ties share the best competition rank and the next rank skips (5,5,7 style)", () => {
    const rows = [row(1, { PTS: 10 }), row(2, { PTS: 20 }), row(3, { PTS: 20 }), row(4, { PTS: 30 })];
    const table = buildPercentileTable(rows, ["PTS"], new Set());
    // Sorted asc: 10,20,20,30. Highest (30) is rank 1; the tied 20s share rank 2; 10 is rank 4.
    expect(table.get(4)?.PTS?.rank).toBe(1);
    expect(table.get(2)?.PTS?.rank).toBe(2);
    expect(table.get(3)?.PTS?.rank).toBe(2);
    expect(table.get(1)?.PTS?.rank).toBe(4);
    // Percentile still uses the average-rank rule (unchanged).
    expect(table.get(2)?.PTS?.percentile).toBe(62.5);
    expect(table.get(3)?.PTS?.percentile).toBe(62.5);
  });

  it("excludes missing/NaN values and reflects that in n", () => {
    const rows = [row(1, { PTS: 10 }), row(2, { PTS: NaN }), row(3, {})];
    const table = buildPercentileTable(rows, ["PTS"], new Set());
    expect(table.get(2)?.PTS).toBeUndefined();
    expect(table.get(3)?.PTS).toBeUndefined();
    expect(table.get(1)?.PTS?.n).toBe(1);
  });

  it("returns an empty table for an empty roster", () => {
    expect(buildPercentileTable([], ["PTS"], new Set()).size).toBe(0);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run test/unit/percentiles.test.ts`
Expected: FAIL (return values are numbers, so `.percentile`/`.rank`/`.n` are undefined).

- [ ] **Step 4: Rewrite `src/background/percentiles.ts` to return `RankingRecord`**

```ts
import type { NbaPlayerId, PlayerStatRow } from "../shared/types.js";
import type { RankingRecord, SpiderStatKey } from "../shared/spider.js";

/**
 * Build a per-player ranking table for each requested stat key.
 *
 * Percentile (unchanged): average-rank method for ties.
 *   Non-inverted: percentile = 100 * avgRank / n (highest raw = 100).
 *   Inverted:     percentile = 100 * (n + 1 - avgRank) / n (lowest raw = 100).
 *
 * Rank: 1-based competition ranking. Ties share the best rank; the next rank
 *   skips accordingly (e.g. 5, 5, 7). For non-inverted stats rank 1 = highest
 *   raw value; for inverted stats rank 1 = lowest raw value.
 *
 * n: count of players with a valid (finite) value for the stat.
 *
 * Players with a missing or NaN value are excluded and get `undefined`.
 */
export function buildPercentileTable(
  rows: readonly PlayerStatRow[],
  keys: readonly SpiderStatKey[],
  invertedKeys: ReadonlySet<SpiderStatKey>,
): Map<NbaPlayerId, RankingRecord> {
  const table = new Map<NbaPlayerId, RankingRecord>();
  for (const r of rows) table.set(r.nbaId, {});

  for (const key of keys) {
    const inverted = invertedKeys.has(key);
    const valid: Array<{ id: NbaPlayerId; v: number }> = [];
    for (const r of rows) {
      const raw = r.stats[key];
      if (typeof raw === "number" && Number.isFinite(raw)) {
        valid.push({ id: r.nbaId, v: raw });
      }
    }
    if (valid.length === 0) continue;
    valid.sort((a, b) => a.v - b.v);

    const n = valid.length;
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && valid[j + 1]!.v === valid[i]!.v) j++;
      const avg = (i + 1 + j + 1) / 2;
      const pct = inverted
        ? Math.round(((100 * (n + 1 - avg)) / n) * 10) / 10
        : Math.round(((100 * avg) / n) * 10) / 10;
      // Competition rank: count of strictly-better players + 1.
      // Non-inverted: better = strictly greater value (indices after j).
      // Inverted: better = strictly lesser value (indices before i).
      const rank = inverted ? i + 1 : n - j;
      for (let k = i; k <= j; k++) {
        table.get(valid[k]!.id)![key] = { percentile: pct, rank, n };
      }
      i = j + 1;
    }
  }

  return table;
}
```

- [ ] **Step 5: Update `spiderService.ts` to read the new shape (no WindowSlice change yet)**

In `src/background/spiderService.ts`, the loop currently does:

```ts
const ranks = buildPercentileTable(rows, SPIDER_KEYS, INVERTED);
windows[slot] = sliceFor(me, ranks.get(me.nbaId) ?? {});
```

Change the variable name and `sliceFor` to consume `RankingRecord`. Replace the `import` of percentile types and the `sliceFor` function:

Update the import line at the top to include `RankingRecord`:

```ts
import type { GetSpiderDataResponse, RankingRecord, SpiderData, SpiderStatKey, WindowSlice } from "../shared/spider.js";
```

Replace the loop body assignment:

```ts
      const ranking = buildPercentileTable(rows, SPIDER_KEYS, INVERTED);
      windows[slot] = sliceFor(me, ranking.get(me.nbaId) ?? {});
```

Replace `sliceFor` with (percentiles only for now; rank/n/avg added in Task 3):

```ts
function sliceFor(row: PlayerStatRow, ranking: RankingRecord): WindowSlice {
  const values: WindowSlice["values"] = {};
  const percentiles: WindowSlice["percentiles"] = {};
  for (const k of SPIDER_KEYS) {
    const v = row.stats[k];
    if (typeof v === "number" && Number.isFinite(v)) values[k] = v;
    const r = ranking[k];
    if (r) percentiles[k] = r.percentile;
  }
  return { values, percentiles };
}
```

- [ ] **Step 6: Run the full unit suite to verify green**

Run: `npx vitest run test/unit/percentiles.test.ts test/unit/spiderService.test.ts`
Expected: PASS (percentile assertions in `spiderService.test.ts` still hold; ranking tests pass).

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/shared/spider.ts src/background/percentiles.ts src/background/spiderService.ts test/unit/percentiles.test.ts
git commit -m "feat: ranking table returns competition rank and n"
```

---

### Task 2: League-average helper

A pure helper that averages a stat across the league rows. Lives in its own module for isolated testing.

**Files:**
- Create: `src/background/leagueAverages.ts`
- Test: `test/unit/leagueAverages.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/unit/leagueAverages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { leagueMean } from "../../src/background/leagueAverages.js";
import type { PlayerStatRow } from "../../src/shared/types.js";

function row(nbaId: number, stats: Record<string, number>): PlayerStatRow {
  return { nbaId, name: `p${nbaId}`, teamAbbr: "XXX", position: null, stats };
}

describe("leagueMean", () => {
  it("averages the valid values for a stat", () => {
    const rows = [row(1, { PTS: 10 }), row(2, { PTS: 20 }), row(3, { PTS: 30 })];
    expect(leagueMean(rows, "PTS")).toBe(20);
  });

  it("ignores missing and NaN values", () => {
    const rows = [row(1, { PTS: 10 }), row(2, { PTS: NaN }), row(3, {})];
    expect(leagueMean(rows, "PTS")).toBe(10);
  });

  it("returns undefined when no player has the stat", () => {
    const rows = [row(1, {}), row(2, {})];
    expect(leagueMean(rows, "PTS")).toBeUndefined();
  });

  it("returns undefined for an empty roster", () => {
    expect(leagueMean([], "PTS")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/unit/leagueAverages.test.ts`
Expected: FAIL with "Cannot find module" / `leagueMean` is not defined.

- [ ] **Step 3: Implement `src/background/leagueAverages.ts`**

```ts
import type { PlayerStatRow } from "../shared/types.js";
import type { SpiderStatKey } from "../shared/spider.js";

/**
 * Arithmetic mean of a stat across all rows that have a valid (finite) value.
 * Returns undefined when no row has the stat.
 */
export function leagueMean(
  rows: readonly PlayerStatRow[],
  key: SpiderStatKey,
): number | undefined {
  let sum = 0;
  let count = 0;
  for (const r of rows) {
    const v = r.stats[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      sum += v;
      count++;
    }
  }
  return count === 0 ? undefined : sum / count;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/unit/leagueAverages.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/background/leagueAverages.ts test/unit/leagueAverages.test.ts
git commit -m "feat: add leagueMean helper for spider axis averages"
```

---

### Task 3: Populate rank, n, and league average into WindowSlice

Extend the `WindowSlice` type and fill the new fields in `spiderService`. Update the test fixtures that construct a `WindowSlice` literal.

**Files:**
- Modify: `src/shared/spider.ts` (WindowSlice)
- Modify: `src/background/spiderService.ts`
- Test: `test/unit/spiderService.test.ts`
- Modify (fixtures): `test/unit/spider-chart.test.ts:11-13`, `test/unit/spider-tooltip.test.ts:22-28`

- [ ] **Step 1: Extend `WindowSlice` in `src/shared/spider.ts`**

```ts
export interface WindowSlice {
  values: Partial<Record<SpiderStatKey, number>>;
  percentiles: PercentileRecord;
  ranks: Partial<Record<SpiderStatKey, number>>;
  n: Partial<Record<SpiderStatKey, number>>;
  leagueAvg: Partial<Record<SpiderStatKey, number>>;
}
```

- [ ] **Step 2: Add assertions to `test/unit/spiderService.test.ts`**

In the "returns ok=true with all three slices when fetches succeed" test, after the existing percentile assertions (around line 68), add:

```ts
    // A. Player leads PTS in a 2-player league: rank 1 of 2, league avg = (20+10)/2.
    expect(out.data.windows.season?.ranks.PTS).toBe(1);
    expect(out.data.windows.season?.n.PTS).toBe(2);
    expect(out.data.windows.season?.leagueAvg.PTS).toBe(15);
    // TOV is inverted; both players have TOV 2 (tie) so both rank 1, avg 2.
    expect(out.data.windows.season?.ranks.TOV).toBe(1);
    expect(out.data.windows.season?.leagueAvg.TOV).toBe(2);
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run test/unit/spiderService.test.ts`
Expected: FAIL (`ranks`/`n`/`leagueAvg` undefined).

- [ ] **Step 4: Fill the new fields in `src/background/spiderService.ts`**

Add the import near the top:

```ts
import { leagueMean } from "./leagueAverages.js";
```

Replace the loop assignment so it computes averages and passes them to `sliceFor`:

```ts
      const ranking = buildPercentileTable(rows, SPIDER_KEYS, INVERTED);
      const avgs: Partial<Record<SpiderStatKey, number>> = {};
      for (const k of SPIDER_KEYS) {
        const m = leagueMean(rows, k);
        if (m !== undefined) avgs[k] = m;
      }
      windows[slot] = sliceFor(me, ranking.get(me.nbaId) ?? {}, avgs);
```

Replace `sliceFor` with the full version:

```ts
function sliceFor(
  row: PlayerStatRow,
  ranking: RankingRecord,
  avgs: Partial<Record<SpiderStatKey, number>>,
): WindowSlice {
  const values: WindowSlice["values"] = {};
  const percentiles: WindowSlice["percentiles"] = {};
  const ranks: WindowSlice["ranks"] = {};
  const n: WindowSlice["n"] = {};
  const leagueAvg: WindowSlice["leagueAvg"] = {};
  for (const k of SPIDER_KEYS) {
    const v = row.stats[k];
    if (typeof v === "number" && Number.isFinite(v)) values[k] = v;
    const r = ranking[k];
    if (r) {
      percentiles[k] = r.percentile;
      ranks[k] = r.rank;
      n[k] = r.n;
    }
    const a = avgs[k];
    if (a !== undefined) leagueAvg[k] = a;
  }
  return { values, percentiles, ranks, n, leagueAvg };
}
```

- [ ] **Step 5: Update the chart-test fixture `test/unit/spider-chart.test.ts`**

Replace the `windows` block of `fullData` (lines 10-14) with slices that include the new required fields:

```ts
  windows: {
    season: { values: { PTS: 20, REB: 5 }, percentiles: { PTS: 65, REB: 45 }, ranks: { PTS: 80, REB: 130 }, n: { PTS: 240, REB: 240 }, leagueAvg: { PTS: 14, REB: 5.1 } },
    L10:    { values: { PTS: 24, REB: 5.5 }, percentiles: { PTS: 78, REB: 55 }, ranks: { PTS: 52, REB: 108 }, n: { PTS: 238, REB: 238 }, leagueAvg: { PTS: 14, REB: 5.0 } },
    L5:     { values: { PTS: 28, REB: 6 }, percentiles: { PTS: 85, REB: 62 }, ranks: { PTS: 35, REB: 90 }, n: { PTS: 236, REB: 236 }, leagueAvg: { PTS: 13.9, REB: 5.0 } },
  },
```

- [ ] **Step 6: Update the tooltip-test fixture `test/unit/spider-tooltip.test.ts`**

Replace the `windows` block of `fullData` (lines 23-27) with:

```ts
  windows: {
    season: { values: { PTS: 20 }, percentiles: { PTS: 65 }, ranks: { PTS: 80 }, n: { PTS: 240 }, leagueAvg: { PTS: 14 } },
    L10:    { values: { PTS: 24 }, percentiles: { PTS: 78 }, ranks: { PTS: 52 }, n: { PTS: 238 }, leagueAvg: { PTS: 14 } },
    L5:     { values: { PTS: 28 }, percentiles: { PTS: 85 }, ranks: { PTS: 35 }, n: { PTS: 236 }, leagueAvg: { PTS: 13.9 } },
  },
```

- [ ] **Step 7: Run the affected suites and typecheck**

Run: `npx vitest run test/unit/spiderService.test.ts test/unit/spider-chart.test.ts test/unit/spider-tooltip.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/shared/spider.ts src/background/spiderService.ts test/unit/spiderService.test.ts test/unit/spider-chart.test.ts test/unit/spider-tooltip.test.ts
git commit -m "feat: bundle rank, n, league average into spider window slices"
```

---

### Task 4: Clickable, highlightable axes in the chart

Add invisible per-axis hit-areas and an optional active-axis highlight to the pure chart renderer.

**Files:**
- Modify: `src/ui/spider-chart.ts`
- Test: `test/unit/spider-chart.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `test/unit/spider-chart.test.ts` inside the `describe`:

```ts
  it("renders 9 invisible axis hit-areas keyed by stat", () => {
    const svg = renderSpiderChart(fullData);
    const hits = Array.from(svg.querySelectorAll<SVGCircleElement>("circle[data-role='axis-hit']"));
    expect(hits.length).toBe(9);
    expect(hits.map((h) => h.getAttribute("data-axis-key"))).toEqual([
      "FG3M", "PTS", "REB", "AST", "STL", "BLK", "TOV", "TS_PCT", "USG_PCT",
    ]);
  });

  it("marks the active axis spoke and label when activeAxisKey is given", () => {
    const svg = renderSpiderChart(fullData, "PTS");
    const activeKeys = Array.from(svg.querySelectorAll("text[data-role='axis-key'][data-active='1']"));
    expect(activeKeys.length).toBe(1);
    expect(activeKeys[0]?.textContent).toBe("PTS");
    expect(svg.querySelectorAll("line[data-role='spoke'][data-active='1']").length).toBe(1);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/unit/spider-chart.test.ts`
Expected: FAIL (no hit circles; no `data-active` markers).

- [ ] **Step 3: Update `renderSpiderChart` in `src/ui/spider-chart.ts`**

Change the signature:

```ts
export function renderSpiderChart(data: SpiderData | null, activeAxisKey?: SpiderStatKey | null): SVGSVGElement {
```

In the spokes loop, mark the active spoke. Replace the spoke creation block with:

```ts
  // Spokes
  for (let i = 0; i < SPIDER_AXES.length; i++) {
    const [x, y] = point(i, R);
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", String(CX));
    line.setAttribute("y1", String(CY));
    line.setAttribute("x2", x.toFixed(1));
    line.setAttribute("y2", y.toFixed(1));
    const isActive = SPIDER_AXES[i]!.key === activeAxisKey;
    line.setAttribute("stroke", isActive ? "rgba(255,255,255,.5)" : "rgba(255,255,255,.08)");
    line.setAttribute("stroke-width", isActive ? "1.5" : "1");
    line.setAttribute("data-role", "spoke");
    if (isActive) line.setAttribute("data-active", "1");
    svg.appendChild(line);
  }
```

In the axis-labels loop, mark the active label. Where the `key` text element is built (the `data-role="axis-key"` text), after `key.textContent = SPIDER_AXES[i]!.label;` add:

```ts
    if (SPIDER_AXES[i]!.key === activeAxisKey) {
      key.setAttribute("fill", "#FFFFFF");
      key.setAttribute("font-weight", "700");
      key.setAttribute("data-active", "1");
    }
```

At the end of the axis-labels loop body (after the `valueRows.forEach(...)` block, still inside the `for` over axes), append a transparent hit-area circle:

```ts
    const [hx, hy] = point(i, R + 10);
    const hit = document.createElementNS(NS, "circle");
    hit.setAttribute("cx", hx.toFixed(1));
    hit.setAttribute("cy", hy.toFixed(1));
    hit.setAttribute("r", "26");
    hit.setAttribute("fill", "transparent");
    hit.setAttribute("data-role", "axis-hit");
    hit.setAttribute("data-axis-key", SPIDER_AXES[i]!.key);
    svg.appendChild(hit);
```

Note: the axis-labels loop (where the hit-areas are appended) sits after the `data === null` early return, so hit-areas render only on the data path, not on the loading skeleton. That is correct: the card mounts with `renderSpiderChart(null)` (loading, no hit-areas), then `renderReady` redraws with data and the axes become clickable. The `data-active` markers also only apply on the data path.

- [ ] **Step 4: Run to verify passing**

Run: `npx vitest run test/unit/spider-chart.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/spider-chart.ts test/unit/spider-chart.test.ts
git commit -m "feat: add axis hit-areas and active-axis highlight to spider chart"
```

---

### Task 5: Strip container, getWindow dependency, onWindowChange handle

Add the strip element to the pinned card and the new controller wiring, without interaction yet. This task makes the strip appear (empty placeholder) on pinned cards and adds the `getWindow` dependency and `onWindowChange` no-op-render handle.

**Files:**
- Modify: `src/ui/spider-tooltip.ts`
- Test: `test/unit/spider-tooltip.test.ts`

- [ ] **Step 1: Write failing tests**

In `test/unit/spider-tooltip.test.ts`, `getWindow` is now required, so **both** `createSpiderTooltipController` call sites must include it: the one in `beforeEach` (around line 45) and the one in the "does not dismiss a pinned card when clicking inside a safeArea element" test (around line 162). Add `getWindow: () => "Last5",` to each.

The `beforeEach` creation becomes:

```ts
    controller = createSpiderTooltipController({
      table: row.table,
      send,
      getPerMode: () => "PerGame",
      getWindow: () => "Last5",
    });
```

The safeArea-test creation becomes:

```ts
    controller = createSpiderTooltipController({
      table: row.table,
      send,
      getPerMode: () => "PerGame",
      getWindow: () => "Last5",
      safeAreas: [safe],
    });
```

Then add these tests inside the `describe`:

```ts
  it("shows an empty detail strip on a pinned card", async () => {
    click();
    await vi.waitFor(() => {
      const host = document.querySelector(".fnba-spider-host");
      expect(host?.shadowRoot?.querySelector('[data-role="strip"]')).not.toBeNull();
    });
  });

  it("does not render a detail strip on a hover-preview card", () => {
    mouseover();
    vi.advanceTimersByTime(300);
    const host = document.querySelector(".fnba-spider-host");
    expect(host?.shadowRoot?.querySelector('[data-role="strip"]')).toBeNull();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/unit/spider-tooltip.test.ts`
Expected: FAIL (type error for missing `getWindow` and/or no strip element).

- [ ] **Step 3: Add the dependency, handle, imports, and strip markup in `src/ui/spider-tooltip.ts`**

Update the imports at the top:

```ts
import { renderSpiderChart } from "./spider-chart.js";
import { SPIDER_AXES, formatAxisValue } from "../shared/spiderAxes.js";
import type {
  GetSpiderDataRequest,
  GetSpiderDataResponse,
  SpiderData,
  SpiderStatKey,
} from "../shared/spider.js";
import type { PerModeKey, WindowKey } from "../shared/types.js";
```

Add `getWindow` to `SpiderTooltipDeps`:

```ts
  getPerMode: () => PerModeKey;
  getWindow: () => WindowKey;
```

Add `onWindowChange` to `SpiderTooltipHandle`:

```ts
export interface SpiderTooltipHandle {
  teardown: () => void;
  onPerModeChange: () => void;
  onWindowChange: () => void;
}
```

Add the strip style to the `STYLES` template (before the closing backtick):

```css
  .strip { border-top: 1px solid rgba(255,255,255,.12); padding: 10px 14px 12px; }
  .strip.empty { color: #6b7280; font-size: 12px; font-style: italic; }
  .strip .stat { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
  .strip .stat .ctx { color: #9CA3AF; font-weight: 400; }
  .strip .grid { display: flex; gap: 14px; font-size: 13px; }
  .strip .lbl { color: #9CA3AF; font-size: 11px; }
  .strip .val { font-weight: 600; }
  .strip .you { color: #F59E0B; }
```

In `mount`, add the strip markup to the card (only when pinned), immediately after the `legend` div:

```ts
        ${pinned ? '<div class="strip empty" data-role="strip">Click an axis to see rank and league average.</div>' : ""}
```

- [ ] **Step 4: Run to verify passing**

Run: `npx vitest run test/unit/spider-tooltip.test.ts`
Expected: the two new tests PASS. (The `onWindowChange` handle is referenced next; add a stub now.)

- [ ] **Step 5: Add `onWindowChange` stub to the returned handle**

In the `return { ... }` object at the end of `createSpiderTooltipController`, add alongside `onPerModeChange`:

```ts
    onWindowChange: () => {
      /* strip re-render wired in Task 7 */
    },
```

- [ ] **Step 6: Run full tooltip suite + typecheck**

Run: `npx vitest run test/unit/spider-tooltip.test.ts && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/ui/spider-tooltip.ts test/unit/spider-tooltip.test.ts
git commit -m "feat: add detail strip scaffold and window dependency to spider tooltip"
```

---

### Task 6: Axis-click renders the strip (toggle + switch + highlight)

Wire the axis click on pinned cards to populate the strip from the active window's slice, toggle off on re-click, switch on a different axis, and highlight the active axis.

**Files:**
- Modify: `src/ui/spider-tooltip.ts`
- Test: `test/unit/spider-tooltip.test.ts`

- [ ] **Step 1: Write failing tests**

Add these helpers and tests to `test/unit/spider-tooltip.test.ts`. Add a helper near the other helpers:

```ts
  function clickAxis(key: string): void {
    const host = document.querySelector(".fnba-spider-host")!;
    const hit = host.shadowRoot!.querySelector<SVGCircleElement>(`circle[data-axis-key="${key}"]`)!;
    hit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }
  function stripText(): string {
    const host = document.querySelector(".fnba-spider-host")!;
    return host.shadowRoot!.querySelector('[data-role="strip"]')!.textContent ?? "";
  }
```

Tests:

```ts
  it("populates the strip with rank, league avg, player value and percentile on axis click", async () => {
    click();
    await vi.waitFor(() => expect(document.querySelector(".fnba-spider-host")).not.toBeNull());
    clickAxis("PTS");
    const txt = stripText();
    expect(txt).toContain("PTS");
    expect(txt).toContain("L5");          // active window label (getWindow returns Last5)
    expect(txt).toContain("35th of 236"); // rank/n from the L5 fixture slice
    expect(txt).toContain("28");          // player value
    expect(txt).toContain("13.9");        // league avg
    expect(txt).toContain("85th");        // percentile
  });

  it("toggles the strip off when the active axis is clicked again", async () => {
    click();
    await vi.waitFor(() => expect(document.querySelector(".fnba-spider-host")).not.toBeNull());
    clickAxis("PTS");
    expect(stripText()).toContain("PTS");
    clickAxis("PTS");
    expect(stripText()).toContain("Click an axis");
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/unit/spider-tooltip.test.ts`
Expected: FAIL (strip stays empty on click).

- [ ] **Step 3: Add state, helpers, and the click handler in `src/ui/spider-tooltip.ts`**

Add module-scope state inside `createSpiderTooltipController` near the other `let` declarations:

```ts
  let activeAxisKey: SpiderStatKey | null = null;
  let currentData: SpiderData | null = null;
```

Add these helpers inside the controller (near `perModeLabel`):

```ts
  function windowSlot(w: WindowKey): keyof SpiderData["windows"] {
    return w === "Season" ? "season" : w === "Last10" ? "L10" : "L5";
  }
  function windowLabel(w: WindowKey): string {
    return w === "Season" ? "Season" : w === "Last10" ? "L10" : "L5";
  }
  function ordinal(n: number): string {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
  }
  function axisLabel(key: SpiderStatKey): string {
    return SPIDER_AXES.find((a) => a.key === key)?.label ?? key;
  }

  function renderStrip(): void {
    if (!openCard?.pinned) return;
    const strip = openCard.host.shadowRoot!.querySelector('[data-role="strip"]') as HTMLElement | null;
    if (!strip) return;
    if (!activeAxisKey) {
      strip.className = "strip empty";
      strip.textContent = "Click an axis to see rank and league average.";
      return;
    }
    const key = activeAxisKey;
    const w = deps.getWindow();
    const slice = currentData?.windows[windowSlot(w)] ?? null;
    const label = axisLabel(key);
    const ctx = `${windowLabel(w)} · ${perModeLabel(deps.getPerMode())}`;
    const rank = slice?.ranks[key];
    const nVal = slice?.n[key];
    const val = slice?.values[key];
    const avg = slice?.leagueAvg[key];
    const pct = slice?.percentiles[key];

    if (slice === null || rank === undefined || val === undefined) {
      strip.className = "strip empty";
      strip.textContent = `${label} - no ${windowLabel(w)} data`;
      return;
    }

    strip.className = "strip";
    strip.innerHTML = `
      <div class="stat">${label} <span class="ctx">· ${ctx}</span></div>
      <div class="grid">
        <div><div class="lbl">Rank</div><div class="val">${ordinal(rank)} of ${nVal ?? "?"}</div></div>
        <div><div class="lbl">League avg</div><div class="val">${avg !== undefined ? formatAxisValue(key, avg) : "—"}</div></div>
        <div><div class="lbl">Player</div><div class="val you">${formatAxisValue(key, val)}</div></div>
        <div><div class="lbl">Percentile</div><div class="val">${pct !== undefined ? ordinal(Math.round(pct)) : "—"}</div></div>
      </div>`;
  }

  function onAxisClick(e: Event): void {
    if (!openCard?.pinned) return;
    const t = e.target as Element | null;
    const hit = t?.closest<SVGCircleElement>("circle[data-axis-hit], circle[data-role='axis-hit']");
    if (!hit) return;
    const key = hit.getAttribute("data-axis-key") as SpiderStatKey | null;
    if (!key) return;
    activeAxisKey = activeAxisKey === key ? null : key;
    redrawChart();
    renderStrip();
  }

  function redrawChart(): void {
    if (!openCard) return;
    const body = openCard.host.shadowRoot!.querySelector('[data-role="body"]') as HTMLElement;
    body.replaceChildren(renderSpiderChart(currentData, activeAxisKey));
  }
```

Wire the click handler on the card body once, in `mount`, after `body.appendChild(renderSpiderChart(null));`:

```ts
    body.addEventListener("click", onAxisClick);
```

Set `currentData` and re-render in `renderReady`. The existing `renderReady(data)` starts with mapping data into the card. At its top set `currentData = data;` and at its end call `renderStrip();`. Also change its chart render to pass the active key: find where `renderReady` builds the chart (it currently relies on the chart already mounted via `renderSpiderChart`). Update `renderReady` so it redraws the chart with the active key and refreshes the strip. Add at the start of `renderReady`:

```ts
    currentData = data;
```

And replace the body chart construction inside `renderReady` (the `body.replaceChildren(renderSpiderChart(data));` line) with:

```ts
    body.replaceChildren(renderSpiderChart(data, activeAxisKey));
```

And add at the very end of `renderReady`:

```ts
    renderStrip();
```

Reset `activeAxisKey` and `currentData` in `dismiss`:

```ts
  function dismiss(): void {
    if (openCard) {
      openCard.host.remove();
      openCard = null;
    }
    activeAxisKey = null;
    currentData = null;
  }
```

- [ ] **Step 4: Run to verify passing**

Run: `npx vitest run test/unit/spider-tooltip.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/ui/spider-tooltip.ts test/unit/spider-tooltip.test.ts
git commit -m "feat: axis click opens spider detail strip with toggle and highlight"
```

---

### Task 7: React to window and per-mode changes; no-data note

Make the strip re-render client-side on window change (no refetch), re-render after a per-mode refetch, and show the no-data note when the active window slice is missing.

**Files:**
- Modify: `src/ui/spider-tooltip.ts`
- Test: `test/unit/spider-tooltip.test.ts`

- [ ] **Step 1: Write failing tests**

The default `getWindow` returns a constant in `beforeEach`. For these tests, create a controller with a mutable window. Add this test block:

```ts
  it("re-renders the strip on window change without a new fetch", async () => {
    controller.teardown();
    let win: import("../../src/shared/types.js").WindowKey = "Last5";
    controller = createSpiderTooltipController({
      table: row.table,
      send,
      getPerMode: () => "PerGame",
      getWindow: () => win,
    });
    click();
    await vi.waitFor(() => expect(document.querySelector(".fnba-spider-host")).not.toBeNull());
    const callsAfterFetch = send.mock.calls.length;
    const host = document.querySelector(".fnba-spider-host")!;
    const hit = host.shadowRoot!.querySelector<SVGCircleElement>(`circle[data-axis-key="PTS"]`)!;
    hit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(host.shadowRoot!.querySelector('[data-role="strip"]')!.textContent).toContain("35th of 236"); // L5

    win = "Season";
    controller.onWindowChange();
    const txt = host.shadowRoot!.querySelector('[data-role="strip"]')!.textContent ?? "";
    expect(txt).toContain("Season");
    expect(txt).toContain("80th of 240"); // season rank/n
    expect(send.mock.calls.length).toBe(callsAfterFetch); // no extra fetch
  });

  it("shows a no-data note when the active window slice is null", async () => {
    controller.teardown();
    let win: import("../../src/shared/types.js").WindowKey = "Last5";
    send = vi.fn().mockResolvedValue({
      type: "getSpiderDataResponse",
      ok: true,
      data: {
        ...fullData,
        windows: { ...fullData.windows, L5: null },
      },
    } satisfies GetSpiderDataResponse);
    controller = createSpiderTooltipController({
      table: row.table,
      send,
      getPerMode: () => "PerGame",
      getWindow: () => win,
    });
    click();
    await vi.waitFor(() => expect(document.querySelector(".fnba-spider-host")).not.toBeNull());
    const host = document.querySelector(".fnba-spider-host")!;
    host.shadowRoot!.querySelector<SVGCircleElement>(`circle[data-axis-key="PTS"]`)!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(host.shadowRoot!.querySelector('[data-role="strip"]')!.textContent).toContain("no L5 data");
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/unit/spider-tooltip.test.ts`
Expected: FAIL (`onWindowChange` is a no-op; strip does not update).

- [ ] **Step 3: Implement the handles in `src/ui/spider-tooltip.ts`**

Replace the `onWindowChange` stub in the returned handle with:

```ts
    onWindowChange: () => {
      if (openCard) renderStrip();
    },
```

Update `onPerModeChange` so it also re-renders the strip after the refetch. It currently calls `fetchAndRender()`. Since `renderReady` now calls `renderStrip()` at its end (Task 6), the strip refreshes automatically after the refetch completes. Leave `onPerModeChange` as:

```ts
    onPerModeChange: () => {
      if (openCard) void fetchAndRender();
    },
```

(The no-data note is already handled by `renderStrip`'s `slice === null` branch from Task 6.)

- [ ] **Step 4: Run to verify passing**

Run: `npx vitest run test/unit/spider-tooltip.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/ui/spider-tooltip.ts test/unit/spider-tooltip.test.ts
git commit -m "feat: spider strip reacts to window and per-mode changes"
```

---

### Task 8: Page wiring

Pass `getWindow` from the filter bar and call `onWindowChange` when the window changes. This file has no unit test (it wires content-script DOM); it is covered by the smoke checklist.

**Files:**
- Modify: `src/pages/players.ts:268-281`

- [ ] **Step 1: Add `getWindow` to the controller construction**

In `src/pages/players.ts`, update the `createSpiderTooltipController` call:

```ts
  const spider: SpiderTooltipHandle = createSpiderTooltipController({
    table,
    send: (req: GetSpiderDataRequest) => send<GetSpiderDataResponse>(req),
    getPerMode: () => bar.getSettings().perMode,
    getWindow: () => bar.getSettings().window,
    safeAreas: [bar],
  });
```

- [ ] **Step 2: Call `onWindowChange` on window change**

In the `onChange` handler, add the window check next to the per-mode one:

```ts
  const onChange = async (e: Event): Promise<void> => {
    const ce = e as CustomEvent<FilterSettings>;
    const prev = settings;
    settings = ce.detail;
    await paint(table, bar, settings);
    if (prev.perMode !== settings.perMode) spider.onPerModeChange();
    if (prev.window !== settings.window) spider.onWindowChange();
  };
```

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/pages/players.ts
git commit -m "feat: wire spider window binding into players page"
```

---

### Task 9: Smoke checklist + full verification

**Files:**
- Modify: `docs/SMOKE.md`

- [ ] **Step 1: Add a smoke section to `docs/SMOKE.md`**

Add under the spider section (section 10):

```markdown
### 10.x Spider axis detail popout

1. Pin a player's spider card (click the player name).
2. Click each axis in turn. Confirm the bottom strip shows Rank (Nth of N), League avg, Player, Percentile, and that the clicked axis highlights.
3. Click the active axis again. Confirm the strip collapses to the "Click an axis" placeholder.
4. With the strip open, change the filter bar Window (Season / L5 / L10). Confirm the strip's numbers and the window label update with no page reload and no visible refetch flicker.
5. Change the filter bar Per-mode (Per Game / Per 36 / Per 100). Confirm counting-stat rows (PTS, REB, etc.) rescale while ratio rows (TS%, USG%) hold steady, and the strip stays open.
6. Find a player with no L5 sample (recently returned from injury). Select L5, click an axis, confirm the strip shows "STAT - no L5 data".
7. Hover a player name without pinning. Confirm clicking an axis on the hover-preview card does nothing (no strip).
```

- [ ] **Step 2: Run the full pre-commit chain**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean, all tests pass, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add docs/SMOKE.md
git commit -m "docs: add spider axis popout smoke checklist"
```

- [ ] **Step 4: Manual smoke**

Load the rebuilt `dist/` unpacked in Chrome and walk through the new section 10.x on a live Yahoo Players page (and My Team > Average Stats > current season).

---

## Notes for the release step (out of plan scope)

Version bump (`manifest.json`), `CHANGELOG.md` entry, tag, and GitHub release happen at release time, not inside these tasks, consistent with how prior features shipped.

## Self-review

- **Spec coverage:** data model (Task 1, 3), SW rank/n (Task 1), league average (Task 2, 3), chart hit-areas + highlight (Task 4), strip placement/pinned-only (Task 5), click/toggle/switch/fields (Task 6), window/per-mode reactivity + no-data note (Task 7), page wiring (Task 8), smoke (Task 9). All spec sections map to a task.
- **Type consistency:** `RankingRecord`/`StatRanking` defined in Task 1 and consumed in Task 1/3; `WindowSlice` fields (`ranks`, `n`, `leagueAvg`) defined in Task 3 and read in Task 6; `renderSpiderChart(data, activeAxisKey?)` defined in Task 4 and called in Task 6; `getWindow`/`onWindowChange` defined in Task 5 and used in Task 7/8.
- **Placeholder scan:** every code step shows complete code; no TBD/TODO.
