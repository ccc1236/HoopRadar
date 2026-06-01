# Roadmap

Future work for fNBA, grouped by category. The Options page is the natural next big project because it unblocks four smaller items.

For shipped releases, see [`CHANGELOG.md`](../CHANGELOG.md).

## Major features (need brainstorm + plan)

| Item | What it does | Why it matters |
|---|---|---|
| **Options page** | Standalone settings page reachable from the extension toolbar. Plan 3 territory. | Unblocks four smaller items below; currently every preference is hardcoded. |
| **Matchup page support** | Overlay on Yahoo's weekly matchup view | A second high-traffic page in head-to-head leagues (roto leagues have no matchup view) |
| **Injury / status alerts** | Inline icon on player rows showing injury status, G-League assignment, etc. | Source TBD: nba.com's `commonallplayers.ROSTERSTATUS` is most stable; FantasyLabs / Twitter scraping is fragile, the X API is paywalled. |

## Options page sub-items

These all slot into the Options page once it exists. Worth scoping together during the Options brainstorm.

| Item | What it does |
|---|---|
| Manual NBA-mapping override | Fix any player the auto-mapper missed by picking the NBA player by hand. The spider tooltip's "No NBA mapping" message will link here. |
| Custom column picker | Add / remove / reorder the advanced columns we inject |
| Per-category fantasy scoring weights | Tell fNBA your league's scoring so the spider and column overlays can weight stats accordingly |
| Refresh-cadence override | Default is 6 h; let users set 1 h / 12 h / 24 h / off |
| API health, cache size, Clear cache, Export logs | Diagnostics for issue reports |
| Tooltip trigger mode override | Hover-pin / hover-only / click-only |

## Smaller features (independent of Options)

| Item | What it does | Status |
|---|---|---|
| Spider axis detail popout | Click an axis to see the player's rank (e.g. 12th of 240) and the league average for that stat | Scoped, not started |

### Spider axis detail popout - scope notes

- Shows two things per axis: the player's rank within the ranked population, and the league average for that stat. Both already exist at spider-build time: `buildPercentileTable` sorts the full league and `fetchMergedForWindow` returns every row, so the SW just needs to expose rank + n and compute the mean. No new nba.com endpoint.
- Rank and league average use the *same* `rows` population the percentiles already rank against, so the three numbers stay consistent.
- The popout reflects the page's active advanced-stat setting (window + perMode), one period at a time, not all three windows at once. If the user changes the filter (e.g. L5 + Per36), the rank and average update to match. Implementation note: the SW already fetches all three windows when building the spider, so a window change is a client-side switch (no refetch); only a perMode change needs a refetch (counting stats scale, ratios do not).
- Recent game log is explicitly out of scope. It would require a new `playergamelog` endpoint integration (fetch, parse, cache, bot-detection re-verification) for limited payoff.
- Interaction is click, not hover, so it does not fight the tooltip's existing hover-to-open / click-to-pin model. Likely only while the card is pinned.
- The SVG axis labels are tiny click targets; will need invisible per-axis hit areas.
- Placement: a fixed detail strip at the bottom of the card (not an anchored callout). It appears on axis click and the card grows by one row. The clicked axis is highlighted (brighten its spoke/label) so the spatial link to the strip is clear. Chosen over an anchored callout because the 9-axis ring makes per-axis callouts cramped and collision-prone.

## Deferred indefinitely

These are explicit "not now" decisions, not forgotten work. Captured here so the next planning session does not re-discover them.

| Item | Reason |
|---|---|
| Sortable injected columns (eFG%, TS%, USG%) | No real use case surfaced. Design notes (two-state cycle, arrow indicator, sort across filter changes, null/dash sinks to bottom) captured below for revisit. |

### Sortable injected columns - design notes

If we ever pick this back up:

- Two-state click cycle: first click desc, second click asc, repeat
- Visual: small arrow next to the active header
- Persist sort across filter changes by capturing direction before `clearFnbaCells` and re-applying after re-render
- Null / dash values sort to the bottom regardless of direction
- Out of scope: removing Yahoo's `Selected` class on Yahoo columns when ours is active (cosmetic)

## Next-session bootstrap

1. Read `CLAUDE.md` for every Yahoo and Chrome MV3 gotcha we have hit
2. Read this file and the latest `CHANGELOG.md`
3. Pick the next item from "Major features" (Options page is the unblocker)

When work resumes on a design-level change, run the standard `superpowers:brainstorming` -> `superpowers:writing-plans` -> `superpowers:subagent-driven-development` cycle.
