import { describe, expect, it } from "vitest";
import { buildPercentileTable } from "../../src/background/percentiles.js";
import type { PlayerStatRow } from "../../src/shared/types.js";

function row(nbaId: number, stats: Record<string, number>): PlayerStatRow {
  return { nbaId, name: `p${nbaId}`, teamAbbr: "XXX", position: null, stats };
}

describe("buildPercentileTable", () => {
  it("scores each player by their league rank per stat, 0..100", () => {
    const rows = [
      row(1, { PTS: 10, REB: 5 }),
      row(2, { PTS: 20, REB: 4 }),
      row(3, { PTS: 30, REB: 3 }),
      row(4, { PTS: 40, REB: 2 }),
    ];
    const table = buildPercentileTable(rows, ["PTS", "REB"], new Set());
    expect(table.get(1)?.PTS?.percentile).toBe(25);
    expect(table.get(2)?.PTS?.percentile).toBe(50);
    expect(table.get(3)?.PTS?.percentile).toBe(75);
    expect(table.get(4)?.PTS?.percentile).toBe(100);
  });

  it("assigns 1-based competition rank, 1 = best (highest) for normal stats", () => {
    const rows = [row(1, { PTS: 10 }), row(2, { PTS: 20 }), row(3, { PTS: 30 }), row(4, { PTS: 40 })];
    const table = buildPercentileTable(rows, ["PTS"], new Set());
    expect(table.get(4)?.PTS?.rank).toBe(1);
    expect(table.get(3)?.PTS?.rank).toBe(2);
    expect(table.get(1)?.PTS?.rank).toBe(4);
    expect(table.get(1)?.PTS?.n).toBe(4);
  });

  it("inverts both percentile and rank for inverted stats (1 = lowest value)", () => {
    const rows = [row(1, { TOV: 1 }), row(2, { TOV: 2 }), row(3, { TOV: 3 }), row(4, { TOV: 4 })];
    const table = buildPercentileTable(rows, ["TOV"], new Set(["TOV"]));
    expect(table.get(1)?.TOV?.percentile).toBe(100);
    expect(table.get(1)?.TOV?.rank).toBe(1);
    expect(table.get(4)?.TOV?.percentile).toBe(25);
    expect(table.get(4)?.TOV?.rank).toBe(4);
  });

  it("inverted ties share the best rank and the next rank skips", () => {
    // TOV: 1,1,3 - two players tied for best (lowest) both rank 1, third ranks 3.
    const rows = [row(1, { TOV: 1 }), row(2, { TOV: 1 }), row(3, { TOV: 3 })];
    const table = buildPercentileTable(rows, ["TOV"], new Set(["TOV"]));
    expect(table.get(1)?.TOV?.rank).toBe(1);
    expect(table.get(2)?.TOV?.rank).toBe(1);
    expect(table.get(3)?.TOV?.rank).toBe(3);
    expect(table.get(3)?.TOV?.n).toBe(3);
  });

  it("ties share the best competition rank and the next rank skips (5,5,7 style)", () => {
    const rows = [row(1, { PTS: 10 }), row(2, { PTS: 20 }), row(3, { PTS: 20 }), row(4, { PTS: 30 })];
    const table = buildPercentileTable(rows, ["PTS"], new Set());
    expect(table.get(4)?.PTS?.rank).toBe(1);
    expect(table.get(2)?.PTS?.rank).toBe(2);
    expect(table.get(3)?.PTS?.rank).toBe(2);
    expect(table.get(1)?.PTS?.rank).toBe(4);
    expect(table.get(2)?.PTS?.percentile).toBe(62.5);
    expect(table.get(3)?.PTS?.percentile).toBe(62.5);
  });

  it("excludes missing/NaN values and reflects that in n", () => {
    const rows = [row(1, { PTS: 10 }), row(2, { PTS: NaN }), row(3, {})];
    const table = buildPercentileTable(rows, ["PTS"], new Set());
    expect(table.get(2)?.PTS).toBeUndefined();
    expect(table.get(3)?.PTS).toBeUndefined();
    expect(table.get(1)?.PTS?.n).toBe(1);
  });

  it("returns an empty table for an empty roster", () => {
    expect(buildPercentileTable([], ["PTS"], new Set()).size).toBe(0);
  });
});
