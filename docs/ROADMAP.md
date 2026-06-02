# Roadmap

Future work for fNBA, grouped by category. The Options page is the natural next big project because it unblocks six smaller items.

For shipped releases, see [`CHANGELOG.md`](../CHANGELOG.md).

## Major features (need brainstorm + plan)

| Item | What it does | Why it matters |
|---|---|---|
| **Options page** | Standalone settings page reachable from the extension toolbar. Plan 3 territory. | Unblocks six smaller items below; currently every preference is hardcoded. |
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

None open right now. The spider axis detail popout shipped in v0.1.0 (see [`CHANGELOG.md`](../CHANGELOG.md)); its design and plan live in `docs/superpowers/specs/2026-06-01-spider-axis-popout-design.md` and `docs/superpowers/plans/2026-06-01-spider-axis-popout-plan.md`.

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
