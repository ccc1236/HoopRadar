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
    season: { values: { PTS: 20 }, percentiles: { PTS: 65 } },
    L10:    { values: { PTS: 24 }, percentiles: { PTS: 78 } },
    L5:     { values: { PTS: 28 }, percentiles: { PTS: 85 } },
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
      safeAreas: [safe],
    });

    click();
    await vi.waitFor(() => expect(document.querySelector(".fnba-spider-host")).not.toBeNull());

    inner.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector(".fnba-spider-host")).not.toBeNull();
  });
});
