# Roadmap

Future work for HoopRadar, grouped by category. The Options page is the natural next big project because it unblocks six smaller items.

If the goal is shipping to real users rather than adding features, read "Pre-launch" first. It is gated on a decision and on the calendar, not on engineering effort.

For shipped releases, see [`CHANGELOG.md`](../CHANGELOG.md).

## Pre-launch (earliest realistic date: October 2026)

Status as of 2026-07-27, from a pre-launch audit. Nothing here needs code this week. The gating item is a decision, and the one after it is the calendar.

### Blocking decision: nba.com access posture

`rules/nba-headers.json` spoofs `User-Agent`, `Origin` and `Referer` and strips the `Sec-Fetch-*` and `sec-ch-ua-*` families specifically to get past Akamai Bot Manager (see `CLAUDE.md`). Chrome Web Store policy prohibits extensions that violate third-party terms of service or circumvent technical protection measures, so this is a plausible rejection reason. It is not cosmetic: the entire data path depends on those headers.

This decision gates everything else, because CWS is effectively the only channel that gives auto-update. Chrome blocks off-store `.crx` installs on Windows and macOS outside enterprise policy, so a self-hosted `update_url` is not a general-audience fallback.

- **If we do not submit:** distribution stays load-unpacked zips, the audience stays small and technical, users never auto-update, and we cannot ship a fix to anyone after the fact. The rest of this roadmap is unaffected.
- **If we do submit:** accept the rejection risk, and work the checklist below.

Also worth weighing: the throttle is per-user, so load on nba.com scales linearly with adoption, and a tightening on their side breaks every user at once.

### Hard timing constraint

`currentSeason()` rolls to `2026-27` in July, but the season does not tip off until roughly October, and Yahoo year-prefixes finished seasons (`/2025/nba/<league>/players`) so the content script does not inject on them. Between now and October there is no Yahoo page to inject on and no nba.com data to inject.

Practical effect: the extension cannot be demoed, screenshotted or smoke-tested end to end until a live 2026-27 league exists. The Web Store requires at least one screenshot (1280x800 or 640x400) and we have none, only icons. October is therefore the earliest realistic submission date whatever we build first.

### Pre-launch checklist

Ordered by what actually matters for handing this to strangers.

| Item | Why | Size |
|---|---|---|
| No `LICENSE` file | `package.json` declares MIT and `CLAUDE.md` promises a LICENSE, but none exists, so the default is all rights reserved and nobody has a grant to use or redistribute it | Minutes |
| No `action` key | Clicking the toolbar icon does nothing. Store-installed users get no signal it works, since it only appears on two Yahoo pages. A minimal popup buys more here than a full Options page | Small |
| Content script over-injects | The `/nba/*/*` match subsumes the two specific patterns, so the script plus a `subtree: true` MutationObserver load on every Yahoo fantasy NBA page. Feature code no-ops correctly, so this is wasted surface and per-mutation overhead, not a vulnerability. The README also says it "only fires on" Players and My Team, true of features but not of injection | Small |
| Latent `innerHTML` sink | `src/ui/spider-tooltip.ts:127` interpolates `anchor.textContent` into `innerHTML`. Not exploitable in practice (player names carry no HTML metacharacters, and it is overwritten via `textContent` at line 181) but it is the one place page data reaches an HTML sink | Two lines |
| CWS submission mechanics | $5 one-time registration, per-permission justification strings, privacy-practices disclosure (we collect nothing, verified), screenshots. Confirm current requirements against Google's docs at the time | Half a day |
| Yahoo `host_permissions` | `https://basketball.fantasysports.yahoo.com/*` looks unused, since nothing fetches Yahoo from the service worker. Verify before trimming | Small |

Deliberately not doing: the 9 npm advisories are all devDependencies (`undici` via `sharp`, used only by `npm run icons`). `npm audit --omit=dev` returns 0 and no third-party code ships. Build-machine hygiene only, not user risk.

### What the audit found clean

Recorded so the next audit does not re-derive it: no telemetry or analytics; two `fetch` sites, both to stats.nba.com; no user data transmitted (Yahoo scraping and mapping are entirely local); zero runtime dependencies; no `eval` or remote code; the DNR rule correctly scoped to stats.nba.com and `xmlhttprequest`; minimal permissions (`storage` and `declarativeNetRequest` only); no secrets in source or git history; and a throttled upstream client that surfaces 429 without retrying.

### The Options page does not block launch

`options_ui` is optional for submission. The logic runs the other way: once auto-update exists, Options can ship incrementally, whereas staying on unpacked zips forces every feature to be right at release because users never update.

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
| Per-category fantasy scoring weights | Tell HoopRadar your league's scoring so the spider and column overlays can weight stats accordingly |
| Refresh-cadence override | Default is 6 h; let users set 1 h / 12 h / 24 h / off |
| API health, cache size, Clear cache, Export logs | Diagnostics for issue reports |
| Tooltip trigger mode override | Hover-pin / hover-only / click-only |

## Smaller features (independent of Options)

**Fuzzy mis-matches are sticky for the whole season.** `doBootstrap` in `src/background/mappingService.ts` only evaluates Yahoo players not already in the mapping, and `forceFresh` drops the cached NBA list without touching the mapping itself. So Refresh can add a missing player but can never correct a wrong one, and a bad fuzzy match persists until the season key rolls over. `buildMapping` also requires an exact team match on both the exact and fuzzy paths, so a recently traded player whose Yahoo team disagrees with their NBA team fails to map at all, silently. Fixable on its own by re-evaluating `fuzzy` entries on `forceFresh` while leaving `exact` and `manual` alone; does not need the Options page, though the manual override is the fuller fix.

The spider axis detail popout shipped in v0.1.0 (see [`CHANGELOG.md`](../CHANGELOG.md)); its design and plan live in `docs/superpowers/specs/2026-06-01-spider-axis-popout-design.md` and `docs/superpowers/plans/2026-06-01-spider-axis-popout-plan.md`.

## Deferred indefinitely

These are explicit "not now" decisions, not forgotten work. Captured here so the next planning session does not re-discover them.

| Item | Reason |
|---|---|
| Sortable injected columns (eFG%, TS%, USG%) | No real use case surfaced. Design notes (two-state cycle, arrow indicator, sort across filter changes, null/dash sinks to bottom) captured below for revisit. |

### Sortable injected columns - design notes

If we ever pick this back up:

- Two-state click cycle: first click desc, second click asc, repeat
- Visual: small arrow next to the active header
- Persist sort across filter changes by capturing direction before `clearHoopradarCells` and re-applying after re-render
- Null / dash values sort to the bottom regardless of direction
- Out of scope: removing Yahoo's `Selected` class on Yahoo columns when ours is active (cosmetic)

## Next-session bootstrap

1. Read `CLAUDE.md` for every Yahoo and Chrome MV3 gotcha we have hit
2. Read this file and the latest `CHANGELOG.md`
3. If the goal is shipping to users, start at "Pre-launch"; the nba.com decision gates the rest
4. Otherwise pick the next item from "Major features" (Options page is the unblocker)

When work resumes on a design-level change, run the standard `superpowers:brainstorming` -> `superpowers:writing-plans` -> `superpowers:subagent-driven-development` cycle.
