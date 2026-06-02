import { describe, expect, it, vi } from "vitest";
import { buildSpiderData } from "../../src/background/spiderService.js";
import type { PlayerStatRow } from "../../src/shared/types.js";

function row(nbaId: number, name: string, team: string, stats: Record<string, number>): PlayerStatRow {
  return { nbaId, name, teamAbbr: team, position: "SG", stats };
}

describe("buildSpiderData", () => {
  it("returns no-mapping when the Yahoo id is unknown", async () => {
    const out = await buildSpiderData({
      yahooId: "999",
      perMode: "PerGame",
      mapping: new Map(),
      fetchMergedForWindow: vi.fn(),
    });
    expect(out).toEqual({ type: "getSpiderDataResponse", ok: false, reason: "no-mapping" });
  });

  it("returns fetch-failed when any of the 3 windows throws", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce([row(1, "x", "XXX", { PTS: 20 })])
      .mockRejectedValueOnce(new Error("nba 503"));
    const out = await buildSpiderData({
      yahooId: "5",
      perMode: "PerGame",
      mapping: new Map([["5", 1]]),
      fetchMergedForWindow: fetcher,
    });
    expect(out).toEqual({ type: "getSpiderDataResponse", ok: false, reason: "fetch-failed" });
  });

  it("returns ok=true with all three slices when fetches succeed", async () => {
    const player = (pts: number) =>
      row(1, "A. Player", "PHX", {
        PTS: pts,
        REB: 5, AST: 5, STL: 1, BLK: 0.5, FG3M: 2, TOV: 2, TS_PCT: 0.58, USG_PCT: 25,
      });
    const opp = (pts: number) =>
      row(2, "B. Other", "LAL", {
        PTS: pts,
        REB: 4, AST: 4, STL: 1, BLK: 0.5, FG3M: 1, TOV: 2, TS_PCT: 0.55, USG_PCT: 22,
      });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce([player(20), opp(10)]) // Season
      .mockResolvedValueOnce([player(24), opp(10)]) // L10
      .mockResolvedValueOnce([player(28), opp(10)]); // L5

    const out = await buildSpiderData({
      yahooId: "5",
      perMode: "PerGame",
      mapping: new Map([["5", 1]]),
      fetchMergedForWindow: fetcher,
    });

    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("unreachable");
    expect(out.data.name).toBe("A. Player");
    expect(out.data.team).toBe("PHX");
    expect(out.data.perMode).toBe("PerGame");
    expect(out.data.windows.season?.values.PTS).toBe(20);
    expect(out.data.windows.L10?.values.PTS).toBe(24);
    expect(out.data.windows.L5?.values.PTS).toBe(28);
    // 2 players, "A. Player" leads in PTS in all windows so 100th percentile
    expect(out.data.windows.season?.percentiles.PTS).toBe(100);
    expect(out.data.windows.L5?.percentiles.PTS).toBe(100);
    // A. Player leads PTS in a 2-player league: rank 1 of 2, league avg = (20+10)/2.
    expect(out.data.windows.season?.ranks.PTS).toBe(1);
    expect(out.data.windows.season?.n.PTS).toBe(2);
    expect(out.data.windows.season?.leagueAvg.PTS).toBe(15);
    // TOV is inverted; both players have TOV 2 (tie) so both rank 1, avg 2.
    expect(out.data.windows.season?.ranks.TOV).toBe(1);
    expect(out.data.windows.season?.leagueAvg.TOV).toBe(2);
  });

  it("returns null for a window when the player isn't in that window's rows", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce([row(1, "A", "PHX", { PTS: 20 })]) // Season
      .mockResolvedValueOnce([row(1, "A", "PHX", { PTS: 24 })]) // L10
      .mockResolvedValueOnce([row(2, "B", "LAL", { PTS: 10 })]); // L5 (player absent)
    const out = await buildSpiderData({
      yahooId: "5",
      perMode: "PerGame",
      mapping: new Map([["5", 1]]),
      fetchMergedForWindow: fetcher,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("unreachable");
    expect(out.data.windows.L5).toBeNull();
  });
});
