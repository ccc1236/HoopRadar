import type { NbaPlayerId, PlayerStatRow } from "../shared/types.js";
import type { RankingRecord, SpiderStatKey } from "../shared/spider.js";

/**
 * Build a per-player ranking table for each requested stat key.
 *
 * Percentile (unchanged): average-rank method for ties.
 *   Non-inverted: percentile = 100 * avgRank / n (highest raw = 100).
 *   Inverted:     percentile = 100 * (n + 1 - avgRank) / n (lowest raw = 100).
 *
 * Rank: 1-based competition ranking. Ties share the best rank; the next rank
 *   skips accordingly (e.g. 5, 5, 7). For non-inverted stats rank 1 = highest
 *   raw value; for inverted stats rank 1 = lowest raw value.
 *
 * n: count of players with a valid (finite) value for the stat.
 *
 * Players with a missing or NaN value are excluded and get `undefined`.
 */
export function buildPercentileTable(
  rows: readonly PlayerStatRow[],
  keys: readonly SpiderStatKey[],
  invertedKeys: ReadonlySet<SpiderStatKey>,
): Map<NbaPlayerId, RankingRecord> {
  const table = new Map<NbaPlayerId, RankingRecord>();
  for (const r of rows) table.set(r.nbaId, {});

  for (const key of keys) {
    const inverted = invertedKeys.has(key);
    const valid: Array<{ id: NbaPlayerId; v: number }> = [];
    for (const r of rows) {
      const raw = r.stats[key];
      if (typeof raw === "number" && Number.isFinite(raw)) {
        valid.push({ id: r.nbaId, v: raw });
      }
    }
    if (valid.length === 0) continue;
    valid.sort((a, b) => a.v - b.v);

    const n = valid.length;
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && valid[j + 1]!.v === valid[i]!.v) j++;
      const avg = (i + 1 + j + 1) / 2;
      const pct = inverted
        ? Math.round(((100 * (n + 1 - avg)) / n) * 10) / 10
        : Math.round(((100 * avg) / n) * 10) / 10;
      // Competition rank: count of strictly-better players + 1.
      // Non-inverted: better = strictly greater value (indices after j).
      // Inverted: better = strictly lesser value (indices before i).
      const rank = inverted ? i + 1 : n - j;
      for (let k = i; k <= j; k++) {
        table.get(valid[k]!.id)![key] = { percentile: pct, rank, n };
      }
      i = j + 1;
    }
  }

  return table;
}
