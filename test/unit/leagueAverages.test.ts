import { describe, expect, it } from "vitest";
import { leagueMean } from "../../src/background/leagueAverages.js";
import type { PlayerStatRow } from "../../src/shared/types.js";

function row(nbaId: number, stats: Record<string, number>): PlayerStatRow {
  return { nbaId, name: `p${nbaId}`, teamAbbr: "XXX", position: null, stats };
}

describe("leagueMean", () => {
  it("averages the valid values for a stat", () => {
    const rows = [row(1, { PTS: 10 }), row(2, { PTS: 20 }), row(3, { PTS: 30 })];
    expect(leagueMean(rows, "PTS")).toBe(20);
  });

  it("ignores missing and NaN values", () => {
    const rows = [row(1, { PTS: 10 }), row(2, { PTS: NaN }), row(3, {})];
    expect(leagueMean(rows, "PTS")).toBe(10);
  });

  it("returns undefined when no player has the stat", () => {
    const rows = [row(1, {}), row(2, {})];
    expect(leagueMean(rows, "PTS")).toBeUndefined();
  });

  it("returns undefined for an empty roster", () => {
    expect(leagueMean([], "PTS")).toBeUndefined();
  });
});
