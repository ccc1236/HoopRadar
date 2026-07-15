import { Cache } from "./cache.js";
import { Throttle, ThrottledError } from "./throttle.js";
import { fetchLeagueDashPlayerStats, RateLimitedError, UpstreamUnavailableError } from "./nbaClient.js";
import { loadMapping, saveMapping } from "./playerMapping.js";
import { bootstrapPlayers } from "./mappingService.js";
import { currentSeason } from "./season.js";
import { mergeBaseAndAdvanced } from "./mergeStats.js";
import { windowByKey } from "../shared/windows.js";
import { ADVANCED_COLUMNS, BASE_OVERRIDE_COLUMNS } from "../shared/columns.js";
import {
  isGetPlayerStatsRequest,
  isBootstrapPlayersRequest,
  isGetSettingsRequest,
  isSaveSettingsRequest,
  isGetSpiderDataRequest,
  type BootstrapPlayersRequest,
  type BootstrapPlayersResponse,
  type ErrorResponse,
  type GetPlayerStatsRequest,
  type GetPlayerStatsResponse,
  type GetSettingsResponse,
  type MessageResponse as MsgResponse,
  type SaveSettingsRequest,
  type SaveSettingsResponse,
  type GetSpiderDataRequest,
  type GetSpiderDataResponse,
} from "../shared/messages.js";
import { loadSettings, saveSettings } from "../shared/settings.js";
import type { PlayerStatRow, WindowKey, PerModeKey, YahooPlayerId } from "../shared/types.js";
import { buildSpiderData } from "./spiderService.js";
import { log } from "../shared/logger.js";

const cache = new Cache({ dbName: "hoopradar", defaultTtlMs: 6 * 60 * 60 * 1000 });
const throttle = new Throttle({ intervalMs: 1100, cooldownMs: 60_000 });

const cacheKey = (req: GetPlayerStatsRequest, measure: "Base" | "Advanced", season: string): string =>
  `lps:${season}:${measure}:${req.perMode}:${windowByKey(req.window).lastNGames}`;

async function fetchWithCache(
  req: GetPlayerStatsRequest,
  measure: "Base" | "Advanced",
  season: string,
): Promise<PlayerStatRow[]> {
  const key = cacheKey(req, measure, season);
  if (!req.forceFresh) {
    const hit = await cache.get<PlayerStatRow[]>(key);
    if (hit) return hit;
  }
  const rows = await throttle.run(() =>
    fetchLeagueDashPlayerStats({
      season,
      measureType: measure,
      perMode: req.perMode,
      lastNGames: windowByKey(req.window).lastNGames,
    }),
  );
  await cache.set(key, rows);
  return rows;
}

async function fetchMergedForWindow(
  window: WindowKey,
  perMode: PerModeKey,
  forceFresh?: boolean,
): Promise<PlayerStatRow[]> {
  const season = currentSeason();
  const req: GetPlayerStatsRequest = {
    type: "getPlayerStats",
    yahooIds: [],
    window,
    perMode,
    forceFresh,
  };
  const [base, adv] = await Promise.all([
    fetchWithCache(req, "Base", season),
    fetchWithCache(req, "Advanced", season),
  ]);
  return Array.from(mergeBaseAndAdvanced(base, adv).values());
}

async function handleGetPlayerStats(req: GetPlayerStatsRequest): Promise<MsgResponse> {
  try {
    const season = currentSeason();
    const mapping = await loadMapping(season);
    const yahooToNba = new Map(mapping.map((m) => [m.yahooId, m.nbaId]));

    const rows = await fetchMergedForWindow(req.window, req.perMode, req.forceFresh);
    const byNbaId = new Map(rows.map((r) => [r.nbaId, r]));

    const byYahooId: Record<YahooPlayerId, PlayerStatRow | null> = {};
    for (const yahooId of req.yahooIds) {
      const nbaId = yahooToNba.get(yahooId);
      byYahooId[yahooId] = nbaId ? byNbaId.get(nbaId) ?? null : null;
    }

    const response: GetPlayerStatsResponse = {
      type: "getPlayerStatsResponse",
      byYahooId,
      fetchedAt: Date.now(),
    };
    return response;
  } catch (e) {
    if (e instanceof RateLimitedError || e instanceof ThrottledError) {
      throttle.triggerCooldown();
      const r: ErrorResponse = { type: "error", code: "RATE_LIMITED", message: String(e) };
      return r;
    }
    if (e instanceof UpstreamUnavailableError) {
      return { type: "error", code: "UPSTREAM_UNAVAILABLE", message: String(e) };
    }
    log.error("handleGetPlayerStats", e);
    return { type: "error", code: "UNKNOWN", message: String(e) };
  }
}

async function handleBootstrapPlayers(
  req: BootstrapPlayersRequest,
): Promise<BootstrapPlayersResponse | ErrorResponse> {
  try {
    const { added, unmapped } = await bootstrapPlayers(req.season, req.players, req.forceFresh);
    return { type: "bootstrapPlayersResponse", added, unmapped };
  } catch (e) {
    if (e instanceof RateLimitedError || e instanceof ThrottledError) {
      throttle.triggerCooldown();
      return { type: "error", code: "RATE_LIMITED", message: String(e) };
    }
    if (e instanceof UpstreamUnavailableError) {
      return { type: "error", code: "UPSTREAM_UNAVAILABLE", message: String(e) };
    }
    log.error("handleBootstrapPlayers", e);
    return { type: "error", code: "UNKNOWN", message: String(e) };
  }
}

async function handleGetSettings(): Promise<GetSettingsResponse | ErrorResponse> {
  try {
    const settings = await loadSettings();
    return { type: "getSettingsResponse", settings };
  } catch (e) {
    log.error("handleGetSettings", e);
    return { type: "error", code: "UNKNOWN", message: String(e) };
  }
}

async function handleSaveSettings(
  req: SaveSettingsRequest,
): Promise<SaveSettingsResponse | ErrorResponse> {
  try {
    await saveSettings(req.patch ?? {});
    return { type: "saveSettingsResponse" };
  } catch (e) {
    log.error("handleSaveSettings", e);
    return { type: "error", code: "UNKNOWN", message: String(e) };
  }
}

async function handleGetSpiderData(
  req: GetSpiderDataRequest,
): Promise<GetSpiderDataResponse | ErrorResponse> {
  try {
    const season = currentSeason();
    const mapping = await loadMapping(season);
    const map = new Map(mapping.map((m) => [m.yahooId, m.nbaId]));
    return await buildSpiderData({
      yahooId: req.yahooId,
      perMode: req.perMode,
      mapping: map,
      fetchMergedForWindow,
    });
  } catch (e) {
    if (e instanceof RateLimitedError || e instanceof ThrottledError) {
      throttle.triggerCooldown();
      return { type: "error", code: "RATE_LIMITED", message: String(e) };
    }
    if (e instanceof UpstreamUnavailableError) {
      return { type: "error", code: "UPSTREAM_UNAVAILABLE", message: String(e) };
    }
    log.error("handleGetSpiderData", e);
    return { type: "error", code: "UNKNOWN", message: String(e) };
  }
}

// Eagerly open the cache so first request is fast.
void cache.open();

// Expose configs and the handler to the SW console for manual smoke-testing.
// chrome.runtime.sendMessage called from inside the SW does NOT loop back to
// its own onMessage listener — it dispatches to other contexts. So smoke tests
// from the SW devtools call `hoopradar.getPlayerStats(...)` directly instead.
(globalThis as unknown as Record<string, unknown>).hoopradar = {
  ADVANCED_COLUMNS,
  BASE_OVERRIDE_COLUMNS,
  cache,
  getPlayerStats: handleGetPlayerStats,
  bootstrapPlayers: handleBootstrapPlayers,
  getSpiderData: handleGetSpiderData,
  saveMapping,
  loadMapping,
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (isGetPlayerStatsRequest(msg)) {
    void handleGetPlayerStats(msg).then(sendResponse);
    return true; // async response
  }
  if (isBootstrapPlayersRequest(msg)) {
    void handleBootstrapPlayers(msg).then(sendResponse);
    return true; // async response
  }
  if (isGetSettingsRequest(msg)) {
    void handleGetSettings().then(sendResponse);
    return true; // async response
  }
  if (isSaveSettingsRequest(msg)) {
    void handleSaveSettings(msg).then(sendResponse);
    return true; // async response
  }
  if (isGetSpiderDataRequest(msg)) {
    void handleGetSpiderData(msg).then(sendResponse);
    return true; // async response
  }
  sendResponse({ type: "error", code: "BAD_REQUEST", message: "unknown message" });
  return false;
});

log.info("service worker booted");
