import type { NbaPlayerId, PerModeKey, PlayerStatRow, WindowKey, YahooPlayerId } from "../shared/types.js";
import type { GetSpiderDataResponse, RankingRecord, SpiderData, SpiderStatKey, WindowSlice } from "../shared/spider.js";
import { buildPercentileTable } from "./percentiles.js";
import { leagueMean } from "./leagueAverages.js";

const SPIDER_KEYS: readonly SpiderStatKey[] = [
  "PTS", "REB", "AST", "STL", "BLK", "FG3M", "TOV", "TS_PCT", "USG_PCT",
];
const INVERTED: ReadonlySet<SpiderStatKey> = new Set(["TOV"]);

const WINDOW_TRIPLE: ReadonlyArray<{ slot: keyof SpiderData["windows"]; window: WindowKey }> = [
  { slot: "season", window: "Season" },
  { slot: "L10", window: "Last10" },
  { slot: "L5", window: "Last5" },
];

export interface BuildSpiderDataArgs {
  yahooId: YahooPlayerId;
  perMode: PerModeKey;
  mapping: ReadonlyMap<YahooPlayerId, NbaPlayerId>;
  fetchMergedForWindow: (window: WindowKey, perMode: PerModeKey) => Promise<readonly PlayerStatRow[]>;
}

export async function buildSpiderData(args: BuildSpiderDataArgs): Promise<GetSpiderDataResponse> {
  const nbaId = args.mapping.get(args.yahooId);
  if (nbaId === undefined) {
    return { type: "getSpiderDataResponse", ok: false, reason: "no-mapping" };
  }

  let meta: { name: string; team: string; position: string } | null = null;
  const windows: SpiderData["windows"] = { season: null, L10: null, L5: null };

  try {
    for (const { slot, window } of WINDOW_TRIPLE) {
      const rows = await args.fetchMergedForWindow(window, args.perMode);
      const me = rows.find((r) => r.nbaId === nbaId);
      if (!me) {
        windows[slot] = null;
        continue;
      }
      if (!meta) {
        meta = { name: me.name, team: me.teamAbbr, position: me.position ?? "" };
      }
      const ranking = buildPercentileTable(rows, SPIDER_KEYS, INVERTED);
      const avgs: Partial<Record<SpiderStatKey, number>> = {};
      for (const k of SPIDER_KEYS) {
        const m = leagueMean(rows, k);
        if (m !== undefined) avgs[k] = m;
      }
      windows[slot] = sliceFor(me, ranking.get(me.nbaId) ?? {}, avgs);
    }
  } catch {
    return { type: "getSpiderDataResponse", ok: false, reason: "fetch-failed" };
  }

  if (!meta) {
    // Player was in the mapping but absent from all three windows. Treat as
    // a fetch failure rather than partial success.
    return { type: "getSpiderDataResponse", ok: false, reason: "fetch-failed" };
  }

  const data: SpiderData = {
    name: meta.name,
    team: meta.team,
    position: meta.position,
    perMode: args.perMode,
    windows,
  };
  return { type: "getSpiderDataResponse", ok: true, data };
}

function sliceFor(
  row: PlayerStatRow,
  ranking: RankingRecord,
  avgs: Partial<Record<SpiderStatKey, number>>,
): WindowSlice {
  const values: WindowSlice["values"] = {};
  const percentiles: WindowSlice["percentiles"] = {};
  const ranks: WindowSlice["ranks"] = {};
  const n: WindowSlice["n"] = {};
  const leagueAvg: WindowSlice["leagueAvg"] = {};
  for (const k of SPIDER_KEYS) {
    const v = row.stats[k];
    if (typeof v === "number" && Number.isFinite(v)) values[k] = v;
    const r = ranking[k];
    if (r) {
      percentiles[k] = r.percentile;
      ranks[k] = r.rank;
      n[k] = r.n;
    }
    const a = avgs[k];
    if (a !== undefined) leagueAvg[k] = a;
  }
  return { values, percentiles, ranks, n, leagueAvg };
}
