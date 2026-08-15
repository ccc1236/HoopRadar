# HoopRadar

Yahoo Fantasy NBA advanced-stats overlay (Chromium MV3 extension).

Adds three advanced columns (eFG%, TS%, USG%), game-based time windows (Last 5 / Last 10 played), and per-mode toggles (Per Game / Per 36 / Per 100 possessions) on top of Yahoo Fantasy NBA pages. Data is fetched from nba.com/stats.

## What it does on the page

On the **Players** and **My Team** pages, HoopRadar:

- Mounts a small filter bar above the stats table with Window, Per Mode, Refresh, and a status line
- Appends three new columns (eFG%, TS%, USG%) under an "Advanced" group header
- Overrides Yahoo's existing stat cells (PTS, REB, AST, ST, BLK, 3PTM, FG%, FT%, TO) with values matching the selected HoopRadar window and per mode
- Re-applies your active sort after each update so row order stays consistent

The overlay replaces the values Yahoo displays; the page's HTML structure, sorting, and pagination are otherwise untouched.

## Things to know before installing

- **HoopRadar overrides Yahoo's displayed numbers** with values computed from nba.com. Yahoo's own "Stats" dropdown (Season / Last 7 / Last 14 / Last 30 days) still works, but its picks are immediately replaced by HoopRadar's overrides after the page reloads. The two time concepts are different: Yahoo's filter is days, HoopRadar's is games the player actually appeared in.
- **L5 / L10 are player-scoped, not team-scoped.** A player who sat out the last three games and played in five before that gets L5 from those five appearances, not from his team's last five team games.
- **Ratio stats are scale-invariant across Per Mode.** eFG%, TS%, USG%, FG%, FT%, and 3P% are all ratios or per-possession rates. They do not change between Per Game / Per 36 / Per 100. The Window (Season / L5 / L10) does change them because the game sample changes.
- **First use pulls fresh data, so it takes a few seconds.** HoopRadar caches nba.com stats for about 6 hours. Each Window (Season / L5 / L10) and Per Mode (Per Game / Per 36 / Per 100) is cached separately, so the first time you pick a new combination it refetches, and opening a player's spider chart loads all three windows at once. While that happens you will see a pulsing "Loading..." or "Refreshing..." status. Requests are deliberately spaced out to stay friendly with nba.com, which is why a cold fetch is not instant. Subsequent views inside the cache window are immediate.
- **nba.com is occasionally flaky.** It sometimes returns a brief error on a cold request and then serves it fine moments later. HoopRadar retries automatically; if a stat still fails to load, clicking Refresh usually clears it.
- The extension only fires on Yahoo Fantasy Basketball Players and My Team pages. It does not send data anywhere outside of stats.nba.com requests for stat data.

## Install

1. Download the latest `hoopradar-vX.Y.Z.zip` from the [releases page](https://github.com/ccc1236/hoopradar/releases)
2. Unzip
3. In Chrome go to `chrome://extensions` and enable Developer mode
4. Click "Load unpacked" and select the unzipped folder

## Development

```bash
npm install
npm test              # run unit tests
npm run typecheck
npm run build         # writes dist/
```

After a code change: `npm run build`, then reload the extension in `chrome://extensions` and hard-refresh any Yahoo tab where you want to see the new build.

## License

MIT.
