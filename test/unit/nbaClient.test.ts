import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLeagueDashPlayerStats } from "../../src/background/nbaClient.js";

const SAMPLE = {
  resultSets: [
    {
      headers: ["PLAYER_ID", "PLAYER_NAME", "TEAM_ABBREVIATION", "PTS", "EFG_PCT"],
      rowSet: [
        [203999, "Nikola Jokic", "DEN", 26.4, 0.624],
        [1629029, "Luka Doncic", "DAL", 33.9, 0.586],
      ],
    },
  ],
};

describe("fetchLeagueDashPlayerStats", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("parses the response into PlayerStatRow[]", async () => {
    const fetchMock = vi.fn<[string], Promise<Response>>(async () =>
      new Response(JSON.stringify(SAMPLE), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const rows = await fetchLeagueDashPlayerStats({
      season: "2025-26",
      measureType: "Advanced",
      perMode: "PerGame",
      lastNGames: 0,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ nbaId: 203999, name: "Nikola Jokic", teamAbbr: "DEN" });
    expect(rows[0]!.stats.PTS).toBe(26.4);
    expect(rows[0]!.stats.EFG_PCT).toBe(0.624);

    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain("stats.nba.com/stats/leaguedashplayerstats");
    expect(url).toContain("Season=2025-26");
    expect(url).toContain("MeasureType=Advanced");
    expect(url).toContain("PerMode=PerGame");
    expect(url).toContain("LastNGames=0");
  });

  it("retries a transient 5xx then returns the parsed rows", async () => {
    const fetchMock = vi
      .fn<[string], Promise<Response>>()
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(SAMPLE), { status: 200, headers: { "content-type": "application/json" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const rows = await fetchLeagueDashPlayerStats(
      { season: "2025-26", measureType: "Base", perMode: "Per100Possessions", lastNGames: 0 },
      { retryDelayMs: 0 },
    );

    expect(rows).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws UpstreamUnavailableError after exhausting retries on persistent 5xx", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchLeagueDashPlayerStats(
        { season: "2025-26", measureType: "Base", perMode: "PerGame", lastNGames: 5 },
        { retries: 2, retryDelayMs: 0 },
      ),
    ).rejects.toThrow(/upstream/i);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("does not retry a 4xx (deterministic) error", async () => {
    const fetchMock = vi.fn(async () => new Response("bad", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchLeagueDashPlayerStats(
        { season: "2025-26", measureType: "Base", perMode: "PerGame", lastNGames: 5 },
        { retryDelayMs: 0 },
      ),
    ).rejects.toThrow(/upstream/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws RateLimitedError on 429 without retrying", async () => {
    const fetchMock = vi.fn(async () => new Response("slow down", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const { RateLimitedError } = await import("../../src/background/nbaClient.js");
    await expect(
      fetchLeagueDashPlayerStats(
        { season: "2025-26", measureType: "Base", perMode: "PerGame", lastNGames: 5 },
        { retryDelayMs: 0 },
      ),
    ).rejects.toBeInstanceOf(RateLimitedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
