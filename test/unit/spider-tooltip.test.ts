import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSpiderTooltipController } from "../../src/ui/spider-tooltip.js";
import type { GetSpiderDataRequest, GetSpiderDataResponse, SpiderData } from "../../src/shared/spider.js";

function makeRow(yahooId: string): { table: HTMLTableElement; anchor: HTMLAnchorElement } {
  const table = document.createElement("table");
  const tbody = document.createElement("tbody");
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  const a = document.createElement("a");
  a.setAttribute("data-ys-playerid", yahooId);
  a.setAttribute("href", `/nba/players/${yahooId}/`);
  a.textContent = "Player Name";
  td.appendChild(a);
  tr.appendChild(td);
  tbody.appendChild(tr);
  table.appendChild(tbody);
  return { table, anchor: a };
}

const fullData: SpiderData = {
  name: "P", team: "PHX", position: "SG", perMode: "PerGame",
  windows: {
    season: { values: { PTS: 20, REB: 8 }, percentiles: { PTS: 65, REB: 70 }, ranks: { PTS: 80, REB: 60 }, n: { PTS: 240, REB: 240 }, leagueAvg: { PTS: 14, REB: 5 } },
    L10:    { values: { PTS: 24, REB: 9 }, percentiles: { PTS: 78, REB: 75 }, ranks: { PTS: 52, REB: 48 }, n: { PTS: 238, REB: 238 }, leagueAvg: { PTS: 14, REB: 5 } },
    L5:     { values: { PTS: 28, REB: 10 }, percentiles: { PTS: 85, REB: 82 }, ranks: { PTS: 35, REB: 30 }, n: { PTS: 236, REB: 236 }, leagueAvg: { PTS: 13.9, REB: 5 } },
  },
};

describe("spider tooltip controller", () => {
  let send: ReturnType<typeof vi.fn<[GetSpiderDataRequest], Promise<GetSpiderDataResponse>>>;
  let controller: ReturnType<typeof createSpiderTooltipController>;
  let row: ReturnType<typeof makeRow>;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    row = makeRow("5583");
    document.body.appendChild(row.table);
    send = vi.fn().mockResolvedValue({
      type: "getSpiderDataResponse",
      ok: true,
      data: fullData,
    } satisfies GetSpiderDataResponse);
    controller = createSpiderTooltipController({
      table: row.table,
      send,
      getPerMode: () => "PerGame",
      getWindow: () => "Last5",
    });
  });
  afterEach(() => {
    controller.teardown();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  function mouseover(): void {
    row.anchor.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  }
  function mouseout(): void {
    row.anchor.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
  }
  function click(target: HTMLElement = row.anchor): void {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }

  it("does not mount a card on bare mouseover before 300ms", () => {
    mouseover();
    vi.advanceTimersByTime(200);
    expect(document.querySelector(".fnba-spider-host")).toBeNull();
  });

  it("mounts the card after 300ms and dispatches a fetch", async () => {
    mouseover();
    vi.advanceTimersByTime(300);
    await Promise.resolve();
    expect(send).toHaveBeenCalledWith({
      type: "getSpiderData",
      yahooId: "5583",
      perMode: "PerGame",
    });
    expect(document.querySelector(".fnba-spider-host")).not.toBeNull();
  });

  it("cancels the mount when mouseout happens before 300ms", () => {
    mouseover();
    vi.advanceTimersByTime(100);
    mouseout();
    vi.advanceTimersByTime(300);
    expect(document.querySelector(".fnba-spider-host")).toBeNull();
  });

  it("pinning prevents default navigation on the anchor click", () => {
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    row.anchor.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("renders 3 data polygons after a successful fetch", async () => {
    click();
    await vi.waitFor(() => {
      const host = document.querySelector(".fnba-spider-host");
      expect(host?.shadowRoot?.querySelectorAll("polygon[data-role='window']").length).toBe(3);
    });
  });

  it("ESC dismisses a pinned card", async () => {
    click();
    await vi.waitFor(() => {
      expect(document.querySelector(".fnba-spider-host")).not.toBeNull();
    });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".fnba-spider-host")).toBeNull();
  });

  it("opening a second pin dismisses the first", async () => {
    const row2 = makeRow("9999");
    row.table.querySelector("tbody")!.appendChild(row2.anchor.closest("tr")!);
    click();
    await vi.waitFor(() => expect(document.querySelectorAll(".fnba-spider-host").length).toBe(1));
    click(row2.anchor);
    await vi.waitFor(() => expect(document.querySelectorAll(".fnba-spider-host").length).toBe(1));
  });

  it("shows a 'no mapping' message when the SW responds with reason=no-mapping", async () => {
    send.mockResolvedValueOnce({
      type: "getSpiderDataResponse",
      ok: false,
      reason: "no-mapping",
    } satisfies GetSpiderDataResponse);
    click();
    await vi.waitFor(() => {
      const host = document.querySelector(".fnba-spider-host");
      expect(host?.shadowRoot?.textContent ?? "").toContain("No NBA mapping");
    });
  });

  it("ignores the note-icon anchor (same data-ys-playerid, /news href)", () => {
    const note = document.createElement("a");
    note.setAttribute("data-ys-playerid", "5583");
    note.setAttribute("href", "https://sports.yahoo.com/nba/players/5583/news");
    note.textContent = "note";
    row.anchor.closest("td")!.appendChild(note);

    note.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    vi.advanceTimersByTime(300);
    expect(document.querySelector(".fnba-spider-host")).toBeNull();

    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    note.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("does not dismiss a pinned card when clicking inside a safeArea element", async () => {
    controller.teardown();
    const safe = document.createElement("div");
    safe.id = "safe";
    const inner = document.createElement("select");
    safe.appendChild(inner);
    document.body.appendChild(safe);

    controller = createSpiderTooltipController({
      table: row.table,
      send,
      getPerMode: () => "PerGame",
      getWindow: () => "Last5",
      safeAreas: [safe],
    });

    click();
    await vi.waitFor(() => expect(document.querySelector(".fnba-spider-host")).not.toBeNull());

    inner.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector(".fnba-spider-host")).not.toBeNull();
  });

  it("shows an empty detail strip on a pinned card", async () => {
    click();
    await vi.waitFor(() => {
      const host = document.querySelector(".fnba-spider-host");
      expect(host?.shadowRoot?.querySelector('[data-role="strip"]')).not.toBeNull();
    });
  });

  it("does not render a detail strip on a hover-preview card", () => {
    mouseover();
    vi.advanceTimersByTime(300);
    const host = document.querySelector(".fnba-spider-host");
    expect(host?.shadowRoot?.querySelector('[data-role="strip"]')).toBeNull();
  });

  function clickAxis(key: string): void {
    const host = document.querySelector(".fnba-spider-host")!;
    const hit = host.shadowRoot!.querySelector<SVGCircleElement>(`circle[data-axis-key="${key}"]`)!;
    hit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }
  function stripText(): string {
    const host = document.querySelector(".fnba-spider-host")!;
    return host.shadowRoot!.querySelector('[data-role="strip"]')!.textContent ?? "";
  }

  it("populates the strip with rank, league avg, player value and percentile on axis click", async () => {
    click();
    await vi.waitFor(() => {
      const host = document.querySelector(".fnba-spider-host");
      expect(host).not.toBeNull();
      // wait until data polygons are rendered (renderReady has fired)
      expect(host!.shadowRoot!.querySelectorAll("polygon[data-role='window']").length).toBeGreaterThan(0);
    });
    clickAxis("PTS");
    const txt = stripText();
    expect(txt).toContain("PTS");
    expect(txt).toContain("L5");          // active window label (getWindow returns Last5)
    expect(txt).toContain("35th of 236"); // rank/n from the L5 fixture slice
    expect(txt).toContain("28");          // player value
    expect(txt).toContain("13.9");        // league avg
    expect(txt).toContain("85th");        // percentile
  });

  it("toggles the strip off when the active axis is clicked again", async () => {
    click();
    await vi.waitFor(() => {
      const host = document.querySelector(".fnba-spider-host");
      expect(host).not.toBeNull();
      // wait until data polygons are rendered (renderReady has fired)
      expect(host!.shadowRoot!.querySelectorAll("polygon[data-role='window']").length).toBeGreaterThan(0);
    });
    clickAxis("PTS");
    expect(stripText()).toContain("PTS");
    clickAxis("PTS");
    expect(stripText()).toContain("Click an axis");
  });

  it("re-renders the strip on window change without a new fetch", async () => {
    controller.teardown();
    let win: import("../../src/shared/types.js").WindowKey = "Last5";
    controller = createSpiderTooltipController({
      table: row.table,
      send,
      getPerMode: () => "PerGame",
      getWindow: () => win,
    });
    click();
    await vi.waitFor(() => {
      const host = document.querySelector(".fnba-spider-host");
      expect(host).not.toBeNull();
      expect(host!.shadowRoot!.querySelectorAll("polygon[data-role='window']").length).toBeGreaterThan(0);
    });
    const callsAfterFetch = send.mock.calls.length;
    const host = document.querySelector(".fnba-spider-host")!;
    const hit = host.shadowRoot!.querySelector<SVGCircleElement>(`circle[data-axis-key="PTS"]`)!;
    hit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(host.shadowRoot!.querySelector('[data-role="strip"]')!.textContent).toContain("35th of 236"); // L5

    win = "Season";
    controller.onWindowChange();
    const txt = host.shadowRoot!.querySelector('[data-role="strip"]')!.textContent ?? "";
    expect(txt).toContain("Season");
    expect(txt).toContain("80th of 240"); // season rank/n
    expect(send.mock.calls.length).toBe(callsAfterFetch); // no extra fetch
  });

  it("shows a no-data note when the active window slice is null", async () => {
    controller.teardown();
    let win: import("../../src/shared/types.js").WindowKey = "Last5";
    send = vi.fn().mockResolvedValue({
      type: "getSpiderDataResponse",
      ok: true,
      data: {
        ...fullData,
        windows: { ...fullData.windows, L5: null },
      },
    } satisfies GetSpiderDataResponse);
    controller = createSpiderTooltipController({
      table: row.table,
      send,
      getPerMode: () => "PerGame",
      getWindow: () => win,
    });
    click();
    await vi.waitFor(() => {
      const host = document.querySelector(".fnba-spider-host");
      expect(host).not.toBeNull();
      // wait until renderReady fires (axis-hit circles require non-null data)
      expect(host!.shadowRoot!.querySelector(`circle[data-axis-key="PTS"]`)).not.toBeNull();
    });
    const host = document.querySelector(".fnba-spider-host")!;
    host.shadowRoot!.querySelector<SVGCircleElement>(`circle[data-axis-key="PTS"]`)!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(host.shadowRoot!.querySelector('[data-role="strip"]')!.textContent).toContain("no L5 data");
  });

  it("switches the strip content when a different axis is clicked", async () => {
    click();
    await vi.waitFor(() => {
      const host = document.querySelector(".fnba-spider-host");
      expect(host).not.toBeNull();
      expect(host!.shadowRoot!.querySelectorAll("polygon[data-role='window']").length).toBeGreaterThan(0);
    });
    clickAxis("PTS");
    expect(stripText()).toContain("35th of 236"); // PTS L5 rank/n
    clickAxis("REB");
    const txt = stripText();
    expect(txt).toContain("REB");
    expect(txt).toContain("30th of 236"); // REB L5 rank/n
    expect(txt).not.toContain("35th of 236"); // PTS row replaced
  });

  it("keeps the strip populated after a per-mode change (refetch)", async () => {
    click();
    await vi.waitFor(() => {
      const host = document.querySelector(".fnba-spider-host");
      expect(host).not.toBeNull();
      expect(host!.shadowRoot!.querySelectorAll("polygon[data-role='window']").length).toBeGreaterThan(0);
    });
    clickAxis("PTS");
    expect(stripText()).toContain("35th of 236");
    const callsBefore = send.mock.calls.length;
    controller.onPerModeChange();
    await vi.waitFor(() => expect(send.mock.calls.length).toBe(callsBefore + 1));
    await vi.waitFor(() => expect(stripText()).toContain("35th of 236"));
    expect(stripText()).not.toContain("Click an axis");
  });
});
