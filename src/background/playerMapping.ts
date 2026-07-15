import type {
  NbaPlayerId,
  PlayerMappingEntry,
  SeasonString,
  YahooPlayerId,
} from "../shared/types.js";

export interface YahooPlayer {
  yahooId: YahooPlayerId;
  name: string;
  team: string;
}
export interface NbaPlayer {
  nbaId: NbaPlayerId;
  name: string;
  team: string;
}

export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Damerau-Levenshtein distance (small inputs only — names are short). */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i]![j] = Math.min(dp[i]![j]!, dp[i - 2]![j - 2]! + 1);
      }
    }
  }
  return dp[m]![n]!;
}

const FUZZY_MAX_DISTANCE = 2;

export function buildMapping(yahoo: YahooPlayer[], nba: NbaPlayer[]): PlayerMappingEntry[] {
  const byKey = new Map<string, NbaPlayer>();
  for (const p of nba) byKey.set(`${normalizeName(p.name)}|${p.team}`, p);

  const out: PlayerMappingEntry[] = [];
  for (const y of yahoo) {
    const yn = normalizeName(y.name);
    const exact = byKey.get(`${yn}|${y.team}`);
    if (exact) {
      out.push({ yahooId: y.yahooId, nbaId: exact.nbaId, name: y.name, matchedBy: "exact" });
      continue;
    }
    // Fuzzy: same team, name within FUZZY_MAX_DISTANCE.
    let best: { p: NbaPlayer; d: number } | null = null;
    for (const p of nba) {
      if (p.team !== y.team) continue;
      const d = editDistance(yn, normalizeName(p.name));
      if (d <= FUZZY_MAX_DISTANCE && (best === null || d < best.d)) best = { p, d };
    }
    if (best) {
      out.push({ yahooId: y.yahooId, nbaId: best.p.nbaId, name: y.name, matchedBy: "fuzzy" });
    }
  }
  return out;
}

const STORAGE_KEY = (season: SeasonString) => `hoopradar.mapping.${season}`;

export async function saveMapping(season: SeasonString, entries: PlayerMappingEntry[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY(season)]: entries });
}

export async function loadMapping(season: SeasonString): Promise<PlayerMappingEntry[]> {
  const r = await chrome.storage.local.get(STORAGE_KEY(season));
  const v = r[STORAGE_KEY(season)];
  return Array.isArray(v) ? (v as PlayerMappingEntry[]) : [];
}
