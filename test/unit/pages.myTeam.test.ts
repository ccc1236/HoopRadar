import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { run } from "../../src/pages/myTeam.js";
import { currentSeason } from "../../src/background/season.js";
import "../../src/ui/filter-bar.js";

const FIXTURE = readFileSync(resolve(__dirname, "../fixtures/yahoo/myTeam.html"), "utf8");

/**
 * The fixture is a frozen snapshot of a 2025-26 Yahoo page: its Average Stats
 * subnav only offers stat2=AS_2023 / AS_2024 / AS_2025. `currentSeason()` reads
 * the wall clock and rolls over every July, so with a live clock this test goes
 * looking for a stat2=AS_<currentYear> tab the fixture can never contain and the
 * whole suite rots on July 1. Pin the clock inside the fixture's season. Only
 * Date is faked; timers stay real so the module's polling still works.
 */
const FIXTURE_SEASON_DATE = new Date("2026-01-15T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXTURE_SEASON_DATE);
  document.documentElement.innerHTML = FIXTURE;
  const sendMessage = vi.fn(async (msg: { type: string; yahooIds?: string[] }) => {
    if (msg.type === "getPlayerStats") {
      const ids = msg.yahooIds ?? [];
      const byYahooId: Record<string, unknown> = {};
      for (const id of ids) {
        byYahooId[id] = {
          nbaId: Number(id), name: `Player ${id}`, teamAbbr: "DEN", position: null,
          stats: { PTS: 25.5, EFG_PCT: 0.55, TS_PCT: 0.6, USG_PCT: 28.0 },
        };
      }
      return { type: "getPlayerStatsResponse", byYahooId, fetchedAt: Date.now() };
    }
    return { type: "bootstrapPlayersResponse", added: 0, unmapped: [] };
  });
  (chrome as unknown as { runtime: { sendMessage: typeof sendMessage } }).runtime = {
    sendMessage,
  };
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

/**
 * Yahoo's fixture lands on "Stats > Today" (top tab "Stats" has the
 * `Selected` class). For tests that want the full overlay behavior we
 * have to flip the active markers to put us on Average Stats with the
 * current-season sub-tab. This helper does that mutation in place.
 */
function activateAverageStatsSeason(season: string): void {
  // Clear all Selected / Default-selected markers on tab list items.
  for (const li of Array.from(document.querySelectorAll<HTMLElement>("li.Navitem"))) {
    li.classList.remove("Selected");
    li.classList.remove("Default-selected");
  }
  // Top tab Average Stats: anchor whose href contains stat1=AS but no stat2.
  const tops = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="stat1=AS"]'));
  for (const a of tops) {
    if (!(a.getAttribute("href") ?? "").includes("stat2=")) {
      a.closest("li")?.classList.add("Selected");
      break;
    }
  }
  // Current-season sub-tab inside the Average Stats subnav: stat2=AS_<startYear>.
  const startYear = season.split("-")[0]!;
  const sub = document.querySelector<HTMLAnchorElement>(`a[href*="stat2=AS_${startYear}"]`);
  if (!sub) {
    // Fail loudly. Silently skipping here just makes the module render the
    // banner, which surfaces as a confusing "filter bar did not mount".
    throw new Error(
      `fixture has no Average Stats sub-tab for season ${season} (looked for stat2=AS_${startYear})`,
    );
  }
  sub.closest("li")?.classList.add("Selected");
}

describe("myTeam page module", () => {
  it("mounts a banner (no filter bar) on the default Stats > Today tab", async () => {
    await run({ kind: "myTeam", leagueId: "123456" });
    expect(document.querySelector(".hoopradar-banner-host")).not.toBeNull();
    expect(document.querySelector(".hoopradar-bar-host")).toBeNull();
    expect(document.querySelectorAll('th[data-hoopradar]').length).toBe(0);
  });

  it("mounts the filter bar and injects columns once Average Stats > current season is active", async () => {
    activateAverageStatsSeason(currentSeason());
    await run({ kind: "myTeam", leagueId: "123456" });
    expect(document.querySelector(".hoopradar-bar-host")).not.toBeNull();
    expect(document.querySelector(".hoopradar-banner-host")).toBeNull();
    expect(document.querySelectorAll('th[data-hoopradar]:not([data-hoopradar="group"])').length).toBe(3);
  });
});
