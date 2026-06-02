import type { PlayerStatRow } from "../shared/types.js";
import type { SpiderStatKey } from "../shared/spider.js";

/**
 * Arithmetic mean of a stat across all rows that have a valid (finite) value.
 * Returns undefined when no row has the stat.
 */
export function leagueMean(
  rows: readonly PlayerStatRow[],
  key: SpiderStatKey,
): number | undefined {
  let sum = 0;
  let count = 0;
  for (const r of rows) {
    const v = r.stats[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      sum += v;
      count++;
    }
  }
  return count === 0 ? undefined : sum / count;
}
