# Changelog

## v0.1.0 - 2026-06-02

Spider tooltip gains a click-to-open axis detail popout, plus reliability and loading-feedback improvements.

- New: click an axis on a pinned spider card to see that stat's rank (e.g. 5th of 236), league average, your value, and percentile. The popout follows the active Window and Per Mode, switches windows instantly, and shows a short note when the selected window has no data for the player.
- More reliable stat loading: fNBA now retries nba.com's occasional transient (5xx) errors automatically instead of surfacing them right away.
- The "Loading..." and "Refreshing..." status now pulses so background work is visible.
- README documents first-load caching behavior and nba.com flakiness.

## v0.0.13 - 2026-06-01

- Fixed the spider tooltip triggering when hovering the news icon next to a player name. Yahoo renders two anchors per player that share the same id; the tooltip now only opens on the name link, leaving Yahoo's news popup alone.

## v0.0.12 - 2026-05-18

My Team page now defers to Yahoo's live game-day numbers and only overlays nba.com data on Average Stats > current season.

- New banner on every My Team sub-tab other than Average Stats > current season, with a one-click switch button.
- All stat-tab clicks on the My Team page now do a full page reload so the extension always picks up the new state cleanly. Outside the stat-tab nav (player anchors, etc.) Yahoo's behavior is unchanged.
- Season string is dynamic; rolls forward automatically each July.

## v0.0.11 - 2026-05-18

Four post-release fixes against v0.0.10's spider tooltip:

- Pinned card stays open while you change the per-mode dropdown (the filter bar is now a safe area for the dismissal logic).
- USG% in the tooltip multiplies by 100 to match the conventional 0-100 scale of the injected USG% column.
- "No NBA mapping. Fix in Options." softened to "No NBA mapping for this player yet." while the Options page is still future work.
- Refresh button now also invalidates the cached NBA player list, and the `ROSTERSTATUS === 1` filter is dropped, so injured / two-way / G-League players can map without waiting for season rollover.

## v0.0.10 - 2026-05-18

Spider tooltip ships. Hover any player name on My Team or Players for a 300 ms preview, click to pin. Three overlapping polygons (Season gray, L10 teal, L5 gold) on 9 axes (3PM, PTS, REB, AST, STL, BLK, TO inverted, TS%, USG%) on league-percentile scale, with raw values stacked next to each axis.

States: loading, ready, no mapping, fetch failed. Dismiss with ESC, the X button, clicking outside, or pinning a different player. Per-mode changes refresh the polygons in place.

New SW message `getSpiderData` lazily fetches all three windows at the current per-mode and caches league percentiles. Pure SVG renderer with no chart library dependency.

Plan: `docs/superpowers/plans/2026-05-17-spider-tooltip-plan.md`. Spec: `docs/superpowers/specs/2026-05-17-spider-tooltip-design.md`.

## v0.0.9 - 2026-05-17

Filter bar wordmark recoloured from the original purple to brand blue moon (`#2D4A5B`).

## v0.0.8 - 2026-05-17

Primary logo and brand color land. The mark is a top-down view of a 3-point arc with a ball at the apex plus a hoop and backboard at the bottom. Primary colorway is a deep blue radial gradient (`#4A6E84 -> #2D4A5B -> #1F3645`). Three alternates ship in `docs/logo-samples/`: black gradient, mint gradient, and a flat white tile. New `npm run icons` script rasterizes any SVG colorway to PNG at 16/32/48/128.

## v0.0.7 - 2026-05-16

Demoted the "no stats table found" log from `warn` to `debug` so it stops surfacing in the `chrome://extensions` Errors panel on pages where fNBA does not inject anything.

## v0.0.6 - 2026-05-16

Yahoo's combined `FGM/A` and the derived `A/T` cell now update with filter-aware values. Added `CompoundColumnDef` (made + attempted + separator + Yahoo header label) and `DerivedColumnDef` (numerator / denominator) and route both alongside `BASE_OVERRIDE_COLUMNS` in the renderer.

Also fixes a quietly wrong merge: nba.com's `MeasureType=Advanced` returns season totals for counting stats regardless of the requested PerMode. Reversed the merge order in `mergeStats.ts` so Base wins on overlap, and locked in with four unit tests.

FTM and FTA shipped as separate columns and FT% is now derived from the displayed FTM/FTA so the three numbers visually agree at any PerMode.

## v0.0.5 - 2026-05-16

Smoke-driven fixes from the first live-Yahoo session. Includes the URL pattern fix for My Team's numeric team-id (`/nba/<leagueId>/<numericTeamId>`).

## v0.0.4 - 2026-05-16

My Team page support. Two-pass `ensureTableFits` algorithm: collect ancestor widths first, then mutate, so Yahoo's flex/grid containers do not reflow mid-walk. Lowered the narrowing-point threshold from 1.2x to 1.05x so My Team's `.RailResponsive`/`.Rail` ratio of 1.16 is caught.

## v0.0.3 - 2026-05-16

Viewport-scaled breathing room around the stats table. Padding at the narrowing-point ancestor: `min(200px, 8vw)` on the left, `min(250px, 10vw)` on the right. Cap at 2400 px on ultra-wide monitors.

## v0.0.2 - 2026-05-15

Content overlay lands on the Players page. Filter bar mounts above the stats table with Window / Per-mode / Refresh / status. Three new columns (eFG%, TS%, USG%). Yahoo's traditional stats (PTS, REB, AST, ST, BLK, 3PTM, FG%, FT%, TO) override with filter-aware values from nba.com. Sort direction preserved across filter changes.

## v0.0.1 - 2026-05-15

Foundation. MV3 service worker with header-spoofing via `declarativeNetRequest`, throttled queue, IndexedDB cache, and Yahoo-to-NBA player ID mapping. Typed message router. No UI yet; verifiable from the SW DevTools console via `fnba.*` debug handles.
