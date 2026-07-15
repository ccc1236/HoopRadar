import { describe, it, expect, beforeEach } from "vitest";
import { renderColumns, clearHoopradarCells } from "../../src/content/injectColumns.js";
import type { PlayerStatRow } from "../../src/shared/types.js";

const SAMPLE: Record<string, PlayerStatRow | null> = {
  "6014": {
    nbaId: 1629029, name: "Luka", teamAbbr: "LAL", position: null,
    // USG_PCT comes from nba.com as a fraction; column config multiplies by 100 for display.
    stats: { PTS: 33.5, REB: 7.7, AST: 8.3, EFG_PCT: 0.563, TS_PCT: 0.617, USG_PCT: 0.368 },
  },
  "404": null,
};

function mkTable(): HTMLTableElement {
  document.body.innerHTML = `
    <table>
      <thead>
        <tr><th>Players</th><th>PTS</th><th>REB</th></tr>
      </thead>
      <tbody>
        <tr><td><a data-ys-playerid="6014" title="Luka">Luka</a></td><td><div>99.9</div></td><td><div>50.0</div></td></tr>
        <tr><td><a data-ys-playerid="404" title="Missing">Missing</a></td><td><div>99.9</div></td><td><div>50.0</div></td></tr>
      </tbody>
    </table>`;
  return document.querySelector("table")!;
}

describe("renderColumns", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("appends three advanced column headers", () => {
    const t = mkTable();
    renderColumns(t, SAMPLE);
    const headers = Array.from(t.querySelectorAll("th[data-hoopradar]"));
    expect(headers.map((h) => h.textContent)).toEqual(["eFG%", "TS%", "USG%"]);
  });

  it("populates adv values for mapped players", () => {
    const t = mkTable();
    renderColumns(t, SAMPLE);
    const lukaRow = t.querySelector('tr:has(a[data-ys-playerid="6014"])')!;
    const advCells = Array.from(lukaRow.querySelectorAll("td[data-hoopradar]"));
    expect(advCells.map((c) => c.textContent)).toEqual([".563", ".617", "36.8"]);
  });

  it("shows dash for unmapped players", () => {
    const t = mkTable();
    renderColumns(t, SAMPLE);
    const missingRow = t.querySelector('tr:has(a[data-ys-playerid="404"])')!;
    const advCells = Array.from(missingRow.querySelectorAll("td[data-hoopradar]"));
    expect(advCells.map((c) => c.textContent)).toEqual(["-", "-", "-"]);
  });

  it("is idempotent (calling twice does not duplicate)", () => {
    const t = mkTable();
    renderColumns(t, SAMPLE);
    renderColumns(t, SAMPLE);
    expect(t.querySelectorAll("th[data-hoopradar]")).toHaveLength(3);
    const lukaRow = t.querySelector('tr:has(a[data-ys-playerid="6014"])')!;
    expect(lukaRow.querySelectorAll("td[data-hoopradar]")).toHaveLength(3);
  });

  it("overrides Base stat cells via header-index mapping", () => {
    const t = mkTable();
    renderColumns(t, SAMPLE);
    const lukaRow = t.querySelector('tr:has(a[data-ys-playerid="6014"])')!;
    const ptsCell = lukaRow.children[1] as HTMLElement;
    expect(ptsCell.textContent).toContain("33.5");
    expect(ptsCell.hasAttribute("data-hoopradar-override")).toBe(true);
  });

  it("overrides Yahoo's FTM and FTA cells (separate columns, FTA header has a trailing *)", () => {
    document.body.innerHTML = `
      <table>
        <thead>
          <tr><th>Players</th><th>FTM</th><th>FTA*</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><a data-ys-playerid="6014" title="Luka">Luka</a></td>
            <td><div>1.1</div></td>
            <td><div>2.2</div></td>
          </tr>
        </tbody>
      </table>`;
    const t = document.querySelector("table")!;
    renderColumns(t, {
      "6014": {
        nbaId: 1629029, name: "Luka", teamAbbr: "LAL", position: null,
        stats: { FTM: 6.1, FTA: 7.4 },
      },
    });
    const row = t.querySelector("tbody tr")!;
    const ftmCell = row.children[1] as HTMLElement;
    const ftaCell = row.children[2] as HTMLElement;
    expect(ftmCell.textContent).toBe("6.1");
    expect(ftaCell.textContent).toBe("7.4");
    expect(ftmCell.hasAttribute("data-hoopradar-override")).toBe(true);
    expect(ftaCell.hasAttribute("data-hoopradar-override")).toBe(true);
  });

  it("clearHoopradarCells removes injected and override marks", () => {
    const t = mkTable();
    renderColumns(t, SAMPLE);
    clearHoopradarCells(t);
    expect(t.querySelectorAll("[data-hoopradar]")).toHaveLength(0);
    expect(t.querySelectorAll("[data-hoopradar-override]")).toHaveLength(0);
  });

  it("adds an Advanced colspan group header when the table has two thead rows", () => {
    document.body.innerHTML = `
      <table>
        <thead>
          <tr><th colspan="2">Misc</th></tr>
          <tr><th>Players</th><th>PTS</th></tr>
        </thead>
        <tbody>
          <tr><td><a data-ys-playerid="6014" title="Luka">Luka</a></td><td><div>99</div></td></tr>
        </tbody>
      </table>`;
    const t = document.querySelector("table")!;
    renderColumns(t, SAMPLE);
    const group = t.querySelector('thead tr:first-child th[data-hoopradar="group"]') as HTMLTableCellElement;
    expect(group).not.toBeNull();
    expect(group.textContent).toBe("Advanced");
    expect(group.colSpan).toBe(3);
  });

  it("does NOT add a group header when the table has only one thead row", () => {
    const t = mkTable(); // single thead row
    renderColumns(t, SAMPLE);
    expect(t.querySelector('th[data-hoopradar="group"]')).toBeNull();
  });

  it("overrides the sorted column even when its header contains an icon-font sort-arrow glyph", () => {
    // Yahoo decorates the active-sort header with a Private-Use-Area glyph
    // (e.g., "PTS"). buildHeaderIndex must strip PUA chars so the
    // override layer still maps yahooHeader="PTS" to the right column.
    document.body.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Players</th>
            <th>PTS<span class="arrow"></span></th>
          </tr>
        </thead>
        <tbody>
          <tr><td><a data-ys-playerid="6014" title="Luka">Luka</a></td><td><div>99.9</div></td></tr>
        </tbody>
      </table>`;
    const t = document.querySelector("table")!;
    renderColumns(t, SAMPLE);
    const lukaRow = t.querySelector('tr:has(a[data-ys-playerid="6014"])')!;
    const ptsCell = lukaRow.children[1] as HTMLElement;
    expect(ptsCell.textContent).toContain("33.5");
    expect(ptsCell.hasAttribute("data-hoopradar-override")).toBe(true);
  });

  it("overrides Yahoo's compound FGM/A cell as `made/attempted`", () => {
    document.body.innerHTML = `
      <table>
        <thead>
          <tr><th>Players</th><th>FGM/A*</th></tr>
        </thead>
        <tbody>
          <tr><td><a data-ys-playerid="6014" title="Luka">Luka</a></td><td><div>11.1/22.2</div></td></tr>
        </tbody>
      </table>`;
    const t = document.querySelector("table")!;
    renderColumns(t, {
      "6014": {
        nbaId: 1629029, name: "Luka", teamAbbr: "LAL", position: null,
        stats: { FGM: 9.9, FGA: 17.4 },
      },
    });
    const lukaRow = t.querySelector('tr:has(a[data-ys-playerid="6014"])')!;
    const fgmCell = lukaRow.children[1] as HTMLElement;
    expect(fgmCell.textContent).toBe("9.9/17.4");
    expect(fgmCell.hasAttribute("data-hoopradar-override")).toBe(true);
  });

  it("renders compound cell as `-` when both inputs are missing", () => {
    document.body.innerHTML = `
      <table>
        <thead><tr><th>Players</th><th>FGM/A*</th></tr></thead>
        <tbody>
          <tr><td><a data-ys-playerid="6014" title="Luka">Luka</a></td><td><div>11.1/22.2</div></td></tr>
        </tbody>
      </table>`;
    const t = document.querySelector("table")!;
    renderColumns(t, {
      "6014": { nbaId: 1, name: "Luka", teamAbbr: "LAL", position: null, stats: {} },
    });
    const cell = (t.querySelector("tbody tr")!.children[1] as HTMLElement);
    expect(cell.textContent).toBe("-");
  });

  it("overrides Yahoo's A/T cell with AST / TOV", () => {
    document.body.innerHTML = `
      <table>
        <thead><tr><th>Players</th><th>A/T</th></tr></thead>
        <tbody>
          <tr><td><a data-ys-playerid="6014" title="Luka">Luka</a></td><td><div>1.234</div></td></tr>
        </tbody>
      </table>`;
    const t = document.querySelector("table")!;
    renderColumns(t, {
      "6014": {
        nbaId: 1, name: "Luka", teamAbbr: "LAL", position: null,
        stats: { AST: 8.3, TOV: 2.5 },
      },
    });
    const cell = (t.querySelector("tbody tr")!.children[1] as HTMLElement);
    expect(cell.textContent).toBe("3.320");
    expect(cell.hasAttribute("data-hoopradar-override")).toBe(true);
  });

  it("derives FT% from rounded FTM/FTA so the visual ratio matches", () => {
    document.body.innerHTML = `
      <table>
        <thead><tr><th>Players</th><th>FT%</th></tr></thead>
        <tbody>
          <tr><td><a data-ys-playerid="6014" title="Luka">Luka</a></td><td><div>.831</div></td></tr>
        </tbody>
      </table>`;
    const t = document.querySelector("table")!;
    renderColumns(t, {
      "6014": {
        nbaId: 1, name: "Luka", teamAbbr: "LAL", position: null,
        stats: { FTM: 6.1, FTA: 7.4, FT_PCT: 0.831 },
      },
    });
    const cell = (t.querySelector("tbody tr")!.children[1] as HTMLElement);
    // 6.1 / 7.4 = 0.8243... displays as ".824" (visual consistency over raw FT_PCT of .831).
    expect(cell.textContent).toBe(".824");
    expect(cell.hasAttribute("data-hoopradar-override")).toBe(true);
  });

  it("derives FG% from rounded FGM/FGA", () => {
    document.body.innerHTML = `
      <table>
        <thead><tr><th>Players</th><th>FG%</th></tr></thead>
        <tbody>
          <tr><td><a data-ys-playerid="6014" title="Luka">Luka</a></td><td><div>.500</div></td></tr>
        </tbody>
      </table>`;
    const t = document.querySelector("table")!;
    renderColumns(t, {
      "6014": {
        nbaId: 1, name: "Luka", teamAbbr: "LAL", position: null,
        stats: { FGM: 9.9, FGA: 17.4, FG_PCT: 0.569 },
      },
    });
    const cell = (t.querySelector("tbody tr")!.children[1] as HTMLElement);
    // 9.9 / 17.4 = 0.5689... displays as ".569".
    expect(cell.textContent).toBe(".569");
  });

  it("renders FT% as `-` when FTA is 0 (no attempts)", () => {
    document.body.innerHTML = `
      <table>
        <thead><tr><th>Players</th><th>FT%</th></tr></thead>
        <tbody>
          <tr><td><a data-ys-playerid="6014" title="Luka">Luka</a></td><td><div>.000</div></td></tr>
        </tbody>
      </table>`;
    const t = document.querySelector("table")!;
    renderColumns(t, {
      "6014": {
        nbaId: 1, name: "Luka", teamAbbr: "LAL", position: null,
        stats: { FTM: 0, FTA: 0 },
      },
    });
    const cell = (t.querySelector("tbody tr")!.children[1] as HTMLElement);
    expect(cell.textContent).toBe("-");
  });

  it("renders A/T as `-` when TOV is 0 (division-by-zero guard)", () => {
    document.body.innerHTML = `
      <table>
        <thead><tr><th>Players</th><th>A/T</th></tr></thead>
        <tbody>
          <tr><td><a data-ys-playerid="6014" title="Luka">Luka</a></td><td><div>1.234</div></td></tr>
        </tbody>
      </table>`;
    const t = document.querySelector("table")!;
    renderColumns(t, {
      "6014": {
        nbaId: 1, name: "Luka", teamAbbr: "LAL", position: null,
        stats: { AST: 8.3, TOV: 0 },
      },
    });
    const cell = (t.querySelector("tbody tr")!.children[1] as HTMLElement);
    expect(cell.textContent).toBe("-");
  });

  it("inserts adv cells before a trailing spacer column", () => {
    document.body.innerHTML = `
      <table>
        <thead>
          <tr><th>Players</th><th>PTS</th><th class="No-p Spacer"></th></tr>
        </thead>
        <tbody>
          <tr>
            <td><a data-ys-playerid="6014" title="Luka">Luka</a></td>
            <td><div>99</div></td>
            <td class="No-p Spacer"></td>
          </tr>
        </tbody>
      </table>`;
    const t = document.querySelector("table")!;
    renderColumns(t, SAMPLE);

    const labelRow = t.querySelector("thead tr") as HTMLTableRowElement;
    expect((labelRow.lastElementChild as HTMLElement).className).toContain("Spacer");
    const headerCells = Array.from(labelRow.children);
    expect(headerCells[headerCells.length - 2]?.getAttribute("data-hoopradar")).toBe("USG_PCT");

    const body = t.querySelector("tbody tr") as HTMLTableRowElement;
    expect((body.lastElementChild as HTMLElement).className).toContain("Spacer");
    const bodyCells = Array.from(body.children);
    expect(bodyCells[bodyCells.length - 2]?.getAttribute("data-hoopradar")).toBe("USG_PCT");
  });
});
