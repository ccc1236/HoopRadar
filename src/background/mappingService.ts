import {
  buildMapping,
  loadMapping,
  saveMapping,
  type NbaPlayer,
  type YahooPlayer,
} from "./playerMapping.js";
import { fetchCommonAllPlayers } from "./nbaPlayersList.js";
import type { SeasonString, YahooPlayerId } from "../shared/types.js";

export interface BootstrapResult {
  added: number;
  unmapped: YahooPlayerId[];
}

const NBA_LIST_KEY = (season: SeasonString) => `hoopradar.nbaList.${season}`;

async function loadNbaList(season: SeasonString): Promise<NbaPlayer[] | null> {
  const r = await chrome.storage.local.get(NBA_LIST_KEY(season));
  const v = r[NBA_LIST_KEY(season)];
  return Array.isArray(v) ? (v as NbaPlayer[]) : null;
}

async function saveNbaList(season: SeasonString, list: NbaPlayer[]): Promise<void> {
  await chrome.storage.local.set({ [NBA_LIST_KEY(season)]: list });
}

/**
 * Module-level serialization queue. Multiple tabs (My Team + Players) can
 * trigger bootstrap concurrently. Without serialization the load-mapping +
 * compute-new + save-mapping sequence is a classic last-write-wins race that
 * silently drops entries. chrome.storage has no CAS, so we serialize in the
 * SW (which is the single owner of mapping writes).
 */
let queue: Promise<unknown> = Promise.resolve();

async function doBootstrap(
  season: SeasonString,
  yahooPlayers: YahooPlayer[],
  forceFresh: boolean,
): Promise<BootstrapResult> {
  if (forceFresh) {
    // Drop cached NBA list so the next fetch picks up newly activated /
    // recently injured / two-way players that the prior fetch missed.
    await chrome.storage.local.remove(NBA_LIST_KEY(season));
  }

  let nbaList = await loadNbaList(season);
  if (!nbaList) {
    nbaList = await fetchCommonAllPlayers(season);
    await saveNbaList(season, nbaList);
  }

  const existing = await loadMapping(season);
  const existingIds = new Set(existing.map((m) => m.yahooId));
  const toMatch = yahooPlayers.filter((p) => !existingIds.has(p.yahooId));

  const newEntries = buildMapping(toMatch, nbaList);
  const newIds = new Set(newEntries.map((e) => e.yahooId));
  const unmapped = toMatch.filter((p) => !newIds.has(p.yahooId)).map((p) => p.yahooId);

  if (newEntries.length > 0) {
    await saveMapping(season, [...existing, ...newEntries]);
  }
  return { added: newEntries.length, unmapped };
}

export async function bootstrapPlayers(
  season: SeasonString,
  yahooPlayers: YahooPlayer[],
  forceFresh = false,
): Promise<BootstrapResult> {
  const next = queue.then(() => doBootstrap(season, yahooPlayers, forceFresh));
  // Swallow rejections on the queue so one failure doesn't poison subsequent calls.
  queue = next.catch(() => undefined);
  return next;
}
