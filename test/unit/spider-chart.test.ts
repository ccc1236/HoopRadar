import { describe, expect, it } from "vitest";
import { renderSpiderChart } from "../../src/ui/spider-chart.js";
import type { SpiderData } from "../../src/shared/spider.js";

const fullData: SpiderData = {
  name: "Test Player",
  team: "PHX",
  position: "SG",
  perMode: "PerGame",
  windows: {
    season: { values: { PTS: 20, REB: 5 }, percentiles: { PTS: 65, REB: 45 }, ranks: { PTS: 80, REB: 130 }, n: { PTS: 240, REB: 240 }, leagueAvg: { PTS: 14, REB: 5.1 } },
    L10:    { values: { PTS: 24, REB: 5.5 }, percentiles: { PTS: 78, REB: 55 }, ranks: { PTS: 52, REB: 108 }, n: { PTS: 238, REB: 238 }, leagueAvg: { PTS: 14, REB: 5.0 } },
    L5:     { values: { PTS: 28, REB: 6 }, percentiles: { PTS: 85, REB: 62 }, ranks: { PTS: 35, REB: 90 }, n: { PTS: 236, REB: 236 }, leagueAvg: { PTS: 13.9, REB: 5.0 } },
  },
};

describe("renderSpiderChart", () => {
  it("returns an SVG element", () => {
    const svg = renderSpiderChart(fullData);
    expect(svg.tagName.toLowerCase()).toBe("svg");
  });

  it("draws 5 gridline polygons, 9 spokes, and 3 data polygons", () => {
    const svg = renderSpiderChart(fullData);
    expect(svg.querySelectorAll("polygon[data-role='gridline']").length).toBe(5);
    expect(svg.querySelectorAll("line[data-role='spoke']").length).toBe(9);
    expect(svg.querySelectorAll("polygon[data-role='window']").length).toBe(3);
  });

  it("renders 9 axis labels with the configured key text", () => {
    const svg = renderSpiderChart(fullData);
    const keys = Array.from(svg.querySelectorAll<SVGTextElement>("text[data-role='axis-key']"));
    expect(keys.map((k) => k.textContent)).toEqual([
      "3PM", "PTS", "REB", "AST", "STL", "BLK", "TO↓", "TS%", "USG%",
    ]);
  });

  it("omits a window's polygon when that slice is null", () => {
    const data = { ...fullData, windows: { ...fullData.windows, L5: null } };
    const svg = renderSpiderChart(data);
    const polys = svg.querySelectorAll("polygon[data-role='window']");
    expect(polys.length).toBe(2);
    expect(svg.querySelector('polygon[data-window="L5"]')).toBeNull();
  });

  it("renders a loading skeleton (no polygons, no value labels) when data is null", () => {
    const svg = renderSpiderChart(null);
    expect(svg.querySelectorAll("polygon[data-role='window']").length).toBe(0);
    expect(svg.querySelector("text[data-role='loading']")).not.toBeNull();
  });
});
