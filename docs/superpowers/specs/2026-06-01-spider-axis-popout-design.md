# Spider axis detail popout - design

Date: 2026-06-01
Status: approved

## Summary

Add a click-to-open detail panel to the spider tooltip. Clicking an axis (one of
the nine spider stats) opens a fixed strip at the bottom of the pinned card showing
that stat's **rank**, **league average**, the **player's value**, and the
**percentile**, for the page's currently selected window and per-mode. The strip
reacts when the user changes the filter. No recent game log (explicitly out of
scope).

This turns the spider's relative shape into absolute context: rank speaks to
standings/scarcity thinkers, percentile to distribution thinkers, and the
player-vs-average pair grounds both.

An interactive mockup of the agreed layout lives at
`docs/mockups/spider-axis-popout.html`.

## Scope

In scope:

- Click an axis on a pinned spider card to open a detail strip for that stat.
- Strip fields: Rank (e.g. "5th of 236"), League avg, Player, Percentile (e.g. "98th").
- Strip reflects the page's active window (Season / L10 / L5) and per-mode
  (Per Game / Per 36 / Per 100), one period at a time, and reacts to filter changes.
- Toggle/switch behavior: clicking a different axis switches the strip; clicking the
  active axis again closes it; closing the card clears it.
- A short "no data" note when the active window has no data for the player.

Out of scope:

- Recent game log / sparkline / trend over time. Would require a new nba.com
  `playergamelog` endpoint (fetch, parse, cache, bot-detection re-verification) for
  limited payoff.
- Any change to which player rows are fetched, cached, or how the league is ranked
  for the existing polygons.
- Availability on the hover-preview card. Strip is pinned-card only.

## Decisions

These were settled during brainstorming and are fixed:

- **Availability:** pinned card only. Axes are not clickable during the brief
  hover-preview.
- **Placement:** fixed detail strip at the bottom of the card (Option B), not an
  anchored callout. The card grows one row when the strip is populated. Chosen over a
  callout because the nine-axis ring makes per-axis callouts cramped and
  collision-prone.
- **Clicked-axis highlight:** the active axis brightens its spoke and bolds its label,
  preserving the spatial link between the clicked axis and the strip.
- **Fields:** Rank, League avg, Player, Percentile. Keep both rank and percentile on
  purpose; they serve different mental models and are both free to compute.
- **Window/per-mode binding:** the strip reflects the page's active filter, one period
  at a time. Window change is a client-side switch (no refetch); per-mode change
  refetches (counting stats scale, ratios do not).
- **Missing data:** if the active window has no data for the player, the strip shows a
  short note ("PTS - no L5 data") with the stat name and window, but no numbers.
- **Dismiss/toggle:** clicking a different axis switches; clicking the active axis again
  closes the strip; click-away / ESC closes the whole card and clears the strip.

## Data delivery approach

Approach A (chosen): bundle rank, n, and league average into the existing
`getSpiderData` response. The service worker already fetches every league row and
sorts them when building the spider, so these numbers are free at build time. The
client receives them for all three windows and reads the active window's slice on
demand. No new message type, no new request, no new fetch on axis click, and window
switching is purely client-side.

Rejected:

- On-demand per-axis request: adds a message type, async latency per click, and the SW
  does not retain league rows after `buildSpiderData` returns, so it would need to
  refetch or cache them. More moving parts for no gain.
- Compute client-side: shipping all league rows to the content script is a huge payload
  and duplicates ranking logic, breaking the SW-owns-the-data design.

## Data model

`src/shared/spider.ts` - extend `WindowSlice`:

```ts
export interface WindowSlice {
  values: Partial<Record<SpiderStatKey, number>>;     // existing: player's raw value
  percentiles: PercentileRecord;                       // existing: 0..100
  ranks: Partial<Record<SpiderStatKey, number>>;       // NEW: 1-based competition rank
  n: Partial<Record<SpiderStatKey, number>>;           // NEW: ranked-player count per stat
  leagueAvg: Partial<Record<SpiderStatKey, number>>;   // NEW: mean across ranked players
}
```

- `n` is per-stat, not per-window. Players missing a stat are excluded from that
  stat's ranking (existing percentile behavior), so the honest denominator varies by
  stat. "5th of 236" uses that stat's own `n`.
- `ranks` respects inversion. For TOV (lower is better), rank 1 = lowest turnovers,
  consistent with the SW-side percentile inversion.
- All three windows carry these maps, so the client switches windows without a
  refetch.
- `GetSpiderDataRequest` / `GetSpiderDataResponse` shapes are otherwise unchanged (same
  message type, same `ok` / `reason` cases).

## Service-worker computation

`src/background/percentiles.ts` - rank and n fall out of the same sort the percentile
pass already does. Extend it to return percentile, rank, and n together (rather than a
second function that re-sorts):

- Rank is standard competition ranking: 1-based, ties share the best (lowest) rank, the
  next rank skips accordingly (5, 5, 7).
- For inverted stats (TOV), rank 1 = best (lowest value), matching the percentile
  inversion.
- `n` = count of players with a valid (non-null, finite) value for that stat = the
  ranking denominator.
- The percentile math stays the existing average-rank method, untouched, so the chart
  polygons do not move. Note: for ties, percentile uses average-rank while displayed
  rank uses competition rank, so a tied player may read "5th / 96th pct" rather than a
  perfectly aligned pair. This is conventional and acceptable.

League average - a small pure helper (e.g. `leagueMean(rows, key)`): arithmetic mean
over the same valid rows, nulls excluded; empty set yields undefined (no average
shown). Kept as its own exported function for isolated unit testing.

`src/background/spiderService.ts` - `buildSpiderData` already loops the three windows
with all `rows` in scope. It now also writes `ranks`, `n`, and `leagueAvg` into each
`WindowSlice`, using the current `perMode` so counting-stat averages scale and ratio
averages (TS%, USG%) do not. No new fetch, no new endpoint, no cache change.

Boundaries: `percentiles.ts` owns ranking math (percentile + rank + n), the mean helper
owns averaging, `spiderService.ts` only assembles.

## UI and controller

`src/ui/spider-chart.ts` - clickable, highlightable axes:

- Add an invisible hit-area per axis (a `circle`, radius approximately 26,
  `data-role="axis-hit"` and `data-axis-key`) over each spoke/label so the small text
  is easy to click.
- Accept an optional `activeAxisKey` argument so a re-render can brighten the active
  spoke and bold-white its label. The chart stays a pure render function with no
  internal state.
- The chart keeps showing all three window polygons. Window selection does not change
  the chart, only the strip.

`src/ui/spider-tooltip.ts` - card markup and interaction:

- The pinned card host gains a `data-role="strip"` container below the SVG body,
  showing placeholder text until an axis is clicked.
- New deps: `getWindow: () => WindowKey`; new handle method `onWindowChange()`.
- Per-open-card state: `activeAxisKey: SpiderStatKey | null`.
- Axis click (delegated on the SVG, pinned cards only): same key clears (toggle off);
  different key switches. Re-render chart (for highlight) and strip.
- Strip render: reads `data.windows[getWindow()]` for `activeAxisKey` and shows
  `Rank, League avg, Player, Percentile` with a header `LABEL - <window> - <perMode>`.
  If that window slice is null, or the stat has no value in it, show the short
  "LABEL - no <window> data" note with no numbers.
- `onWindowChange()`: re-render the strip only (client-side, no refetch). Chart
  unchanged.
- `onPerModeChange()` (existing): refetch, then re-render chart and strip, so an open
  strip survives a per-mode change.
- Dismiss whole card (click-away / ESC) clears `activeAxisKey`.

`src/pages/players.ts` - pass `getWindow: () => bar.getSettings().window`, and in the
existing `onChange` add `if (prev.window !== settings.window) spider.onWindowChange();`
alongside the current per-mode check.

My Team page: `myTeam.ts` reuses the players flow, so it inherits the popout and stays
gated to Average Stats > current season as today.

## Testing

Red-green TDD throughout. New or extended unit tests:

`test/unit/percentiles.test.ts` (extend) - the riskiest logic, most coverage:

- Rank is 1-based competition ranking; ties share the best rank and the next rank skips
  (5, 5, 7).
- Inverted stat (TOV): rank 1 = lowest value.
- Players with null/NaN for a stat are excluded; `n` equals that stat's valid count.
- Existing percentile assertions still pass unchanged (guards against polygons moving).

League-mean helper (new test) - mean over valid rows, nulls excluded; empty set returns
undefined.

`test/unit/spiderService.test.ts` (extend) - built `WindowSlice` carries `ranks`, `n`,
`leagueAvg` per window; counting-stat averages scale with per-mode while ratio averages
do not.

`test/unit/spider-chart.test.ts` (extend) - hit-areas render (one per axis, correct
`data-axis-key`); passing `activeAxisKey` highlights the right spoke/label.

`test/unit/spider-tooltip.test.ts` (extend) - interaction matrix:

- Axis click on a pinned card renders the strip with the active window's
  rank/avg/player/percentile.
- Same axis toggles off; a different axis switches.
- `onWindowChange()` re-renders the strip from the new window with no new `send` call
  (proves client-side switch).
- `onPerModeChange()` triggers a refetch and the strip re-renders.
- Active window slice null gives the "no data" note, no numbers.
- Axes are not clickable on a hover-preview (non-pinned) card.

No new fixtures, no SW-environment mocking, no nba.com calls. `src/background/index.ts`
remains smoke-only per the project rule.

## Verification

- `npm run typecheck`, `npm test`, `npm run build` all green.
- Manual smoke (add to `docs/SMOKE.md`): pin a card, click each axis, confirm strip
  fields; change window and per-mode and confirm the strip reacts as specified; confirm
  the "no data" note for a player absent from the selected window; confirm axes do not
  respond on the hover-preview card.
