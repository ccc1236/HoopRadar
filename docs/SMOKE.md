# Smoke Test — Plan 1

Run this manually after a `npm run build` + load-unpacked, before tagging a Plan 1 release.

**About the SW console:** Chrome's DevTools may show `allow pasting` as a warning when you first paste into the console. Type the literal words `allow pasting` and press Enter once to unblock pasting for the session.

**Why we don't use `chrome.runtime.sendMessage` here:** `chrome.runtime.sendMessage` called from inside the service worker itself does **not** dispatch to its own `onMessage` listener — it sends to other contexts (content scripts, popups). In Plan 1 those don't exist yet, so any `sendMessage` call from the SW console will fail with `"Could not establish connection"`. We call the handler directly via the `fnba` debug surface instead. The `onMessage` listener is still wired and will be exercised by Plan 2's content script.

## 1. Service worker starts cleanly

- Open `chrome://extensions`, find fNBA, click "service worker" (or "service worker (inactive)" — clicking wakes it).
- DevTools console: expect `[fNBA] service worker booted`.

## 2. nba.com/stats fetch succeeds (no mapping yet)

In the SW console:

```js
await fnba.getPlayerStats({
  type: "getPlayerStats",
  yahooIds: ["unknown"],
  window: "Season",
  perMode: "PerGame",
});
```

Expected:
- Returned value: `{type: "getPlayerStatsResponse", byYahooId: {unknown: null}, fetchedAt: <ms>}`
- Network tab: two 200 responses from `stats.nba.com/stats/leaguedashplayerstats` (one Base, one Advanced).
- Repeating the call within 6h hits cache (no new network request).

## 3. Force-fresh bypasses cache

```js
await fnba.getPlayerStats({
  type: "getPlayerStats", yahooIds: [], window: "Last5", perMode: "Per36", forceFresh: true,
});
```

Expected: new network requests even if the previous Last5+Per36 call was cached.

## 4. Bad request gracefully rejected (via the message-listener path)

To exercise the message-listener path (which Plan 2's content script will use), open any page where the extension's content scripts will eventually run — for v0.0.1, the simplest is to open `chrome://extensions/` itself won't work (chrome:// is privileged). Skip this step in Plan 1 smoke; it will be covered by Plan 2 once a content script exists.

If you want to spot-check the type guard now, call it directly:

```js
const { isGetPlayerStatsRequest } = await import(
  chrome.runtime.getURL("assets/messages.js")
);
isGetPlayerStatsRequest({ type: "garbage" }); // → false
```

(The exact `assets/messages.js` filename may include a content hash — find it via `chrome://extensions` → fNBA → inspect → Sources → assets/.)

## 5. Manual mapping smoke

Dynamic `import()` is forbidden inside service workers (HTML spec), so we
call `saveMapping` via the `fnba` debug object instead:

```js
await fnba.saveMapping("2025-26", [
  { yahooId: "luka", nbaId: 1629029, name: "Luka Dončić", matchedBy: "manual" },
]);
await fnba.getPlayerStats({
  type: "getPlayerStats",
  yahooIds: ["luka"],
  window: "Season",
  perMode: "PerGame",
});
```

Expected: `byYahooId["6015"]` is a populated `PlayerStatRow` (name, teamAbbr, stats with PTS/REB/AST/EFG_PCT/TS_PCT/USG_PCT, etc.) instead of `null`.

## 6. Cache inspection

```js
// Confirm the cache layer is alive:
await fnba.cache.get("lps:2025-26:Base:PerGame:0"); // returns the cached rows array
```

A non-null return after step 2 confirms IndexedDB persistence is working.

---

# Smoke Test - Plan 2

Run after `npm run build` and reloading the unpacked extension.

## 1. Navigate to your league's Players page

Visit `https://basketball.fantasysports.yahoo.com/nba/<leagueId>/players`.

Expected within ~2s of page load:
- A horizontal fNBA filter bar appears above the stats table.
- Three new column headers (eFG%, TS%, USG%) appear at the right edge of the table header.
- Each player row has three new cells with real values (e.g. `.563`, `.617`, `36.8`). Mapped players show numbers; unmapped show `-`.
- The traditional stat cells (PTS, REB, AST, etc.) match nba.com Season + Per Game numbers (since Season + PerGame is the default filter).
- Yahoo's native stat-range filter is greyed out with "(fNBA active)" appended.

## 2. Change the window dropdown to "L5"

Within ~1s:
- Every cell repaints with Last-5-games values.
- The status pill shows "Updated <time>".
- A new pair of nba.com requests fires (visible in DevTools Network if the page is open).

## 3. Switch per-mode to "Per 36"

Cells re-paint with per-36-minute values. Round-trip should be sub-second (cache hit).

## 4. Click the refresh button

Even though the cache is warm, a fresh network request fires. The cells re-paint (likely identical values, but a new `fetchedAt`).

## 4.5 My Team page defaults to a banner, not the overlay

- Load the My Team page fresh. By default Yahoo opens "Stats > Today", which shows live game-day numbers; fNBA should NOT overlay there.
- Confirm: no filter bar on the table; instead a small banner reads "fNBA shows on Average Stats > {season} Season. Click to switch." with a Switch tab button.
- Click the Switch tab button. Yahoo should swap to Average Stats > {season} Season, and the banner should be replaced by the full fNBA filter bar with the overlaid columns.
- Click the "Stats" tab again. Banner should reappear, filter bar should disappear.
- Click any other sub-tab under Average Stats (e.g. Last 7 Days). Banner should reappear (only the current-season sub-tab triggers the overlay).

## 5. Navigate to My Team

Same overlay applies. Bench and starter rows both get fNBA columns.

## 6. Reload the page

Filter selections persist (chrome.storage.sync). Last5/Per36 should be pre-selected.

## 7. Service worker debug

Open the SW DevTools. Run:
```js
await fnba.loadMapping("2025-26");
```
Expected: an array with one entry per Yahoo player you have viewed across My Team and Players. Length grows as you visit different pages and rosters.

## 8. Sort interaction

Click the **PTS** column header on Yahoo (descending sort). Reload if the click triggers a Yahoo navigation; the sort persists in the URL.

- Switch the Window dropdown to L5: rows should re-sort so the highest L5 PTS player is on top.
- Switch back to Season: rows re-sort by season PTS.
- The values shown in the PTS column are the filtered values (not stale), AND the row order reflects those filtered values.

Repeat for ascending sort: click PTS twice to flip Yahoo to ascending. After reload, the same filter-changes-trigger-resort behavior applies, in ascending order.

## 9. Layout / breathing room

- Initial page load: no horizontal scrollbar.
- The stats table area is wider than Yahoo's default (claims the right-rail's empty space) but with roughly 200 px of white margin on each side.
- On an ultra-wide monitor (viewport > 2400 px), the table caps at 2400 px and centers.
- Yahoo's outer chrome (top branding bar, navigation) stays at its original centered width; only the main content column widens.

## 9.5 Refresh button rebuilds the NBA player list

- With a known unmapped player (one whose spider says "No NBA mapping for this player yet."), click the Refresh button in the filter bar.
- Open that player's spider tooltip again. If the player has since been activated on an NBA roster (or was previously hidden by the old ROSTERSTATUS filter), they should now map and render polygons normally.
- If they still show "No NBA mapping", the player genuinely isn't in nba.com's commonallplayers response (e.g. true G-League-only signing). Not a bug.

## 10. Spider tooltip

On any My Team or Players page, with the filter bar mounted:

1. Hover any player name for ~400 ms. A spider tooltip card appears below the anchor.
2. The card shows three polygons (Season gray, L10 teal, L5 gold) with 9 axes (3PM at top, clockwise through PTS, REB, AST, STL, BLK, TO down-arrow, TS%, USG%) and raw values stacked next to each label.
3. Move the cursor away from both the anchor and the card. Card disappears.
4. Click the player name. Card pins, X close button appears at top-right. Yahoo's player-page navigation does not fire.
5. Press ESC. Card disappears.
6. Click a different player name. Previous pin closes; new pin opens.
7. Click the X. Card disappears.
8. Click outside the card (any non-anchor area). Card disappears.
9. With a card pinned, change the per-mode in the filter bar. The polygons and raw values refresh.
10. Pick a player you know is rostered very lightly (low GP). One of L5 or L10 should render with its legend entry dimmed and that polygon omitted.
11. If you have any unmapped players, hover one. Card body reads "No NBA mapping for this player yet."

Smoke-passes if all 11 steps succeed.

## 11. Spider axis detail popout

On any My Team or Players page, with a spider card pinned (click the player name):

1. Pin a player's spider card (click the player name).
2. Click each axis in turn. Confirm the bottom strip shows Rank (Nth of N), League avg, Player, Percentile, and that the clicked axis highlights.
3. Click the active axis again. Confirm the strip collapses to the "Click an axis" placeholder.
4. With the strip open, change the filter bar Window (Season / L5 / L10). Confirm the strip's numbers and the window label update with no page reload and no visible refetch flicker.
5. Change the filter bar Per-mode (Per Game / Per 36 / Per 100). Confirm counting-stat rows (PTS, REB, etc.) rescale while ratio rows (TS%, USG%) hold steady, and the strip stays open.
6. Find a player with no L5 sample (recently returned from injury). Select L5, click an axis, confirm the strip shows "STAT - no L5 data".
7. Hover a player name without pinning. Confirm clicking an axis on the hover-preview card does nothing (no strip).

Smoke-passes if all 7 steps succeed.

## Known limitations (current build)

- **eFG% / TS% / USG% are not sortable.** Clicking those headers does nothing. Sort applies only to Yahoo's native columns. Deferred indefinitely; see `docs/ROADMAP.md`.

For shipped releases, see [`../CHANGELOG.md`](../CHANGELOG.md). For future plans, see [`ROADMAP.md`](ROADMAP.md).
