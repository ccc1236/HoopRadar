import { scrapePlayers, findStatsTable } from "../content/yahoo.js";
import { renderColumns, clearFnbaCells } from "../content/injectColumns.js";
import { createFilterBar, type FilterBarHandle } from "../ui/filter-bar.js";
import { createSpiderTooltipController, type SpiderTooltipHandle } from "../ui/spider-tooltip.js";
import type { PageInfo } from "../content/pageDetect.js";
import type {
  BootstrapPlayersRequest,
  BootstrapPlayersResponse,
  GetPlayerStatsRequest,
  GetPlayerStatsResponse,
  GetSpiderDataRequest,
  GetSpiderDataResponse,
  ErrorResponse,
} from "../shared/messages.js";
import type { FilterSettings } from "../shared/settings.js";
import { log } from "../shared/logger.js";

function currentSeasonString(now: Date = new Date()): string {
  const m = now.getUTCMonth();
  const y = now.getUTCFullYear();
  const start = m >= 6 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

async function send<T>(req: unknown): Promise<T> {
  return (await chrome.runtime.sendMessage(req)) as T;
}

/**
 * Yahoo wraps its stats table in a max-width-constrained content container,
 * which leaves wide unused margins on both sides of the page. After we append
 * three new columns the table no longer fits inside that constraint. Rather
 * than introducing a horizontal scrollbar, walk up the ancestor chain and
 * clear `max-width` on each level so the table can claim the available
 * horizontal space. Restored on teardown.
 */
/**
 * Yahoo Fantasy puts the stats table inside a narrow main-content column
 * (typically ~1300px) while reserving room for a right rail. With our three
 * extra columns the table doesn't fit. The whole rail column is the same
 * pixel width all the way down to the table's parent; the narrowing happens
 * at one single ancestor (Yahoo's `.Page` div). We find that narrowing
 * point and widen it to 100% of its own parent so the rest of the chain
 * cascades. Restored on teardown.
 */
function ensureTableFits(table: HTMLTableElement): () => void {
  const restorers: Array<() => void> = [];

  const MAX_DEPTH = 14;
  // Narrowing point = first ancestor that's at least 1.05x wider than the
  // previous (deeper) one. Captures both Yahoo layouts: Players page
  // (.Page = 1312 sits inside Page-wrap = 1901 at any viewport) and
  // My Team (.RailResponsive = 1312 sits inside .Rail = 1521+ at viewports
  // where the right rail is present).
  const WIDER_BY = 1.05;
  // Viewport-scaled padding: full size on wide monitors, auto-shrinks on
  // narrow ones so the table never clips and never goes edge-to-edge.
  const vw = window.innerWidth;
  const leftPx = Math.round(Math.min(200, vw * 0.08));
  const rightPx = Math.round(Math.min(250, vw * 0.10));
  const ULTRA_WIDE_CAP_PX = 2400; // sensible max on very wide monitors

  // PASS 1: Collect the ancestor chain and original widths WITHOUT mutating
  // anything. Mutating mid-walk caused Yahoo's flex/grid containers to
  // reflow, which made later parent-width reads inconsistent with earlier
  // ones (a parent measured as 1312 from its child's perspective but 1521
  // when measured directly one iteration later).
  const chain: HTMLElement[] = [];
  const widths: number[] = [];
  {
    let cur: HTMLElement | null = table.parentElement;
    let depth = 0;
    while (cur && cur !== document.body && cur !== document.documentElement && depth < MAX_DEPTH) {
      const cs = getComputedStyle(cur);
      const wNum = parseFloat(cs.width);
      if (!Number.isFinite(wNum) || wNum <= 0) break;
      chain.push(cur);
      widths.push(wNum);
      cur = cur.parentElement;
      depth++;
    }
  }

  // Find the first ancestor whose width jumps up by WIDER_BY versus the
  // immediately deeper one. That deeper one (index `narrowingIndex`) is the
  // "narrow side" we expand and pad. If no jump is found, default to the
  // outermost ancestor in the chain.
  let narrowingIndex = -1;
  for (let i = 0; i < widths.length - 1; i++) {
    const w = widths[i]!;
    const pw = widths[i + 1]!;
    if (pw > w * WIDER_BY) {
      narrowingIndex = i;
      break;
    }
  }
  if (narrowingIndex < 0) narrowingIndex = chain.length - 1;

  // PASS 2: apply styles. Widen every level up to and including the
  // narrowing point; stop there to leave Yahoo's outer chrome alone.
  for (let i = 0; i <= narrowingIndex && i < chain.length; i++) {
    const el = chain[i]!;
    const prev = el.style.getPropertyValue("width");
    const prevPrio = el.style.getPropertyPriority("width");
    const prevMax = el.style.getPropertyValue("max-width");
    const prevMaxPrio = el.style.getPropertyPriority("max-width");
    const prevPL = el.style.getPropertyValue("padding-left");
    const prevPLPrio = el.style.getPropertyPriority("padding-left");
    const prevPR = el.style.getPropertyValue("padding-right");
    const prevPRPrio = el.style.getPropertyPriority("padding-right");
    const prevBS = el.style.getPropertyValue("box-sizing");
    const prevBSPrio = el.style.getPropertyPriority("box-sizing");

    if (i === narrowingIndex) {
      // Padding (not margin) so breathing room renders regardless of the
      // containing block's layout mode. box-sizing: border-box keeps the
      // element's outer width at 100% of its parent while padding pushes
      // content inward.
      el.style.setProperty("width", "100%", "important");
      el.style.setProperty("max-width", `${ULTRA_WIDE_CAP_PX}px`, "important");
      el.style.setProperty("box-sizing", "border-box", "important");
      el.style.setProperty("padding-left", `${leftPx}px`, "important");
      el.style.setProperty("padding-right", `${rightPx}px`, "important");
    } else {
      el.style.setProperty("width", "100%", "important");
      el.style.setProperty("max-width", "none", "important");
    }

    restorers.push(() => {
      el.style.setProperty("width", prev, prevPrio);
      el.style.setProperty("max-width", prevMax, prevMaxPrio);
      el.style.setProperty("padding-left", prevPL, prevPLPrio);
      el.style.setProperty("padding-right", prevPR, prevPRPrio);
      el.style.setProperty("box-sizing", prevBS, prevBSPrio);
    });
  }

  // Force a synchronous reflow so the new widths are committed before any
  // subsequent layout-dependent work.
  void document.body.offsetWidth;

  return () => restorers.forEach((r) => r());
}

interface SortInfo {
  columnIndex: number;
  direction: "asc" | "desc";
}

function cellNumeric(row: HTMLTableRowElement, idx: number): number | null {
  const cell = row.children[idx] as HTMLElement | undefined;
  if (!cell) return null;
  const text = (cell.textContent ?? "").trim();
  if (!text || text === "-") return null;
  const num = parseFloat(text);
  return Number.isFinite(num) ? num : null;
}

/**
 * Yahoo's sort is server-side (clicking a header navigates to ?sort=...). When
 * we override stat cell values client-side, Yahoo's last-applied sort goes
 * stale: the values change but row order doesn't. Detect the active-sort
 * column (it carries `Selected` class) and the current direction (inferred by
 * walking adjacent values pre-override) so we can resort after.
 */
function detectActiveSort(table: HTMLTableElement): SortInfo | null {
  const headRows = table.querySelectorAll("thead tr");
  const labelRow = headRows.length > 0 ? headRows[headRows.length - 1]! : null;
  if (!labelRow) return null;
  const headers = Array.from(labelRow.children);
  const columnIndex = headers.findIndex((h) => h.classList?.contains("Selected"));
  if (columnIndex < 0) return null;

  const tbody = table.querySelector("tbody");
  if (!tbody) return null;
  const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>("tr"));
  const values = rows.map((r) => cellNumeric(r, columnIndex)).filter((v): v is number => v !== null);
  if (values.length < 2) return null;

  let asc = 0;
  let desc = 0;
  for (let i = 0; i < values.length - 1; i++) {
    const a = values[i]!;
    const b = values[i + 1]!;
    if (a < b) asc++;
    else if (a > b) desc++;
  }
  return { columnIndex, direction: desc >= asc ? "desc" : "asc" };
}

function reSortBy(table: HTMLTableElement, sort: SortInfo): void {
  const tbody = table.querySelector("tbody");
  if (!tbody) return;
  const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>("tr"));
  if (rows.length < 2) return;

  rows.sort((a, b) => {
    const va = cellNumeric(a, sort.columnIndex);
    const vb = cellNumeric(b, sort.columnIndex);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return sort.direction === "desc" ? vb - va : va - vb;
  });

  for (const r of rows) tbody.appendChild(r);
}

async function paint(table: HTMLTableElement, bar: FilterBarHandle, settings: FilterSettings): Promise<void> {
  bar.setStatus("Loading...");
  const players = scrapePlayers();
  if (players.length === 0) {
    bar.setStatus("No players found on this page", "error");
    return;
  }
  const season = currentSeasonString();

  // Capture sort state BEFORE override; direction is inferred from current order.
  const sortInfo = detectActiveSort(table);

  const bootReq: BootstrapPlayersRequest = { type: "bootstrapPlayers", season, players };
  await send<BootstrapPlayersResponse | ErrorResponse>(bootReq);

  const yahooIds = players.map((p) => p.yahooId);
  const statsReq: GetPlayerStatsRequest = {
    type: "getPlayerStats",
    yahooIds,
    window: settings.window,
    perMode: settings.perMode,
  };
  const resp = await send<GetPlayerStatsResponse | ErrorResponse>(statsReq);
  if (resp.type === "error") {
    bar.setStatus(`${resp.code}`, "error");
    return;
  }
  renderColumns(table, resp.byYahooId);
  if (sortInfo) reSortBy(table, sortInfo);
  bar.setStatus(`Updated ${new Date().toLocaleTimeString()}`);
}

export async function run(_info: PageInfo): Promise<{ teardown: () => void }> {
  const table = findStatsTable();
  if (!table) {
    // No table on this page is normal: the broad /nba/*/* match pattern
    // covers My Team's numeric team-id URLs but also matches Yahoo pages
    // without player tables (league home, commissioner, advanced-stats
    // view, etc.). Debug-level so it doesn't surface in chrome://extensions
    // Errors panel.
    log.debug("no stats table found; content script idle");
    return { teardown: () => {} };
  }

  // Build and mount the filter bar above the table.
  const bar = await createFilterBar();
  table.parentElement?.insertBefore(bar, table);

  let settings = bar.getSettings();

  const restoreScroll = ensureTableFits(table);
  // Yahoo's layout JS recomputes column widths on resize, not on mutation.
  // Our ancestor-widen takes immediate effect in the DOM but the columns
  // stay at their cached widths until something nudges the layout. A
  // synthetic resize event is the standard nudge.
  window.dispatchEvent(new Event("resize"));

  await paint(table, bar, settings);

  const spider: SpiderTooltipHandle = createSpiderTooltipController({
    table,
    send: (req: GetSpiderDataRequest) => send<GetSpiderDataResponse>(req),
    getPerMode: () => bar.getSettings().perMode,
    getWindow: () => bar.getSettings().window,
    safeAreas: [bar],
  });

  const onChange = async (e: Event): Promise<void> => {
    const ce = e as CustomEvent<FilterSettings>;
    const prev = settings;
    settings = ce.detail;
    await paint(table, bar, settings);
    if (prev.perMode !== settings.perMode) spider.onPerModeChange();
    if (prev.window !== settings.window) spider.onWindowChange();
  };
  const onRefresh = async (): Promise<void> => {
    // Force-fresh path. Refresh both caches:
    //   1. league response cache (Base + Advanced stats) via getPlayerStats forceFresh
    //   2. NBA list cache (player ID directory) via bootstrapPlayers forceFresh,
    //      so players whose ROSTERSTATUS changed since the original fetch
    //      (newly activated, returning from injury, etc.) get a fresh chance
    //      at being mapped.
    bar.setStatus("Refreshing...");
    const sortInfo = detectActiveSort(table);
    const players = scrapePlayers();
    const yahooIds = players.map((p) => p.yahooId);
    const season = currentSeasonString();
    await send<BootstrapPlayersResponse | ErrorResponse>({
      type: "bootstrapPlayers",
      season,
      players,
      forceFresh: true,
    });
    const r = await send<GetPlayerStatsResponse | ErrorResponse>({
      type: "getPlayerStats",
      yahooIds,
      window: settings.window,
      perMode: settings.perMode,
      forceFresh: true,
    });
    if (r.type === "error") {
      bar.setStatus(`${r.code}`, "error");
      return;
    }
    renderColumns(table, r.byYahooId);
    if (sortInfo) reSortBy(table, sortInfo);
    bar.setStatus(`Updated ${new Date().toLocaleTimeString()}`);
  };

  bar.addEventListener("fnba-filter-change", onChange);
  bar.addEventListener("fnba-filter-refresh", onRefresh);

  return {
    teardown: () => {
      spider.teardown();
      restoreScroll();
      bar.removeEventListener("fnba-filter-change", onChange);
      bar.removeEventListener("fnba-filter-refresh", onRefresh);
      clearFnbaCells(table);
      bar.remove();
    },
  };
}
