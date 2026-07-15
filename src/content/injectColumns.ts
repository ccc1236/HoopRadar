import {
  ADVANCED_COLUMNS,
  BASE_OVERRIDE_COLUMNS,
  COMPOUND_OVERRIDE_COLUMNS,
  DERIVED_OVERRIDE_COLUMNS,
} from "../shared/columns.js";
import { formatStat } from "../shared/format.js";
import type { PlayerStatRow, YahooPlayerId } from "../shared/types.js";

const GROUP_HEADER_LABEL = "Advanced";

function getYahooIdFromRow(row: HTMLTableRowElement): YahooPlayerId | null {
  const a = row.querySelector<HTMLAnchorElement>("a[data-ys-playerid]");
  return a?.getAttribute("data-ys-playerid") ?? null;
}

/** Yahoo terminates every table row with a `<th|td class="No-p Spacer">`. We
 *  insert our cells before that spacer so column-alignment between rows
 *  stays sensible. Falls back to appending when no spacer is present. */
function isSpacerCell(el: Element | null): boolean {
  if (!el) return false;
  const cls = (el.className || "").toString();
  return /\bSpacer\b/.test(cls);
}

function insertBeforeSpacerOrAppend(row: Element, cell: Element): void {
  const last = row.lastElementChild;
  if (isSpacerCell(last)) {
    row.insertBefore(cell, last);
  } else {
    row.appendChild(cell);
  }
}

/**
 * Build label-to-column-index map from the LAST `<thead>` row. Yahoo wraps
 * headers as `<th><div><a>PTS</a></div></th>`. We strip:
 *   - Private-Use-Area Unicode (U+E000-U+F8FF), where Yahoo's icon font
 *     renders the active-sort arrow glyph (e.g., `PTS`). Without this,
 *     the currently-sorted column maps to a key that no consumer expects,
 *     so the override layer silently skips it.
 *   - A trailing `*` (projected-stat decoration: `GP*`, `FTA*`).
 */
function buildHeaderIndex(table: HTMLTableElement): Map<string, number> {
  const rows = table.querySelectorAll("thead tr");
  const labelRow = rows.length > 0 ? rows[rows.length - 1]! : null;
  const map = new Map<string, number>();
  if (!labelRow) return map;
  Array.from(labelRow.children).forEach((cell, i) => {
    const text = (cell.textContent ?? "")
      .replace(/[-]/g, "")
      .trim()
      .replace(/\*+$/, "")
      .trim();
    if (text) map.set(text, i);
  });
  return map;
}

/**
 * Idempotent: removes prior HoopRadar columns and override marks before rendering.
 *
 * Yahoo's tables have two thead rows: a group row (Rankings / Field Goals /
 * Free Throws / Miscellaneous / ...) and a label row (PTS / REB / AST / ...).
 * We append a colspan-N "Advanced" group cell to the group row when present,
 * and individual labels to the label row, then append per-row adv cells in
 * the tbody. All insertions go before the trailing spacer column so the
 * extra labels line up with the extra body cells.
 */
export function renderColumns(
  table: HTMLTableElement,
  data: Record<YahooPlayerId, PlayerStatRow | null>,
): void {
  clearHoopradarCells(table);

  const headerIndex = buildHeaderIndex(table);
  const allHeadRows = table.querySelectorAll("thead tr");

  // Group-row header (only when there are >= 2 thead rows).
  if (allHeadRows.length >= 2) {
    const groupRow = allHeadRows[0]!;
    const groupTh = document.createElement("th");
    groupTh.dataset.hoopradar = "group";
    groupTh.colSpan = ADVANCED_COLUMNS.length;
    groupTh.textContent = GROUP_HEADER_LABEL;
    groupTh.style.textAlign = "center";
    insertBeforeSpacerOrAppend(groupRow, groupTh);
  }

  // Individual labels (last thead row).
  const labelRow = allHeadRows.length > 0 ? allHeadRows[allHeadRows.length - 1]! : null;
  if (labelRow) {
    for (const col of ADVANCED_COLUMNS) {
      const th = document.createElement("th");
      th.dataset.hoopradar = col.key;
      th.textContent = col.label;
      th.style.textAlign = "end";
      insertBeforeSpacerOrAppend(labelRow, th);
    }
  }

  // Per-row adv cells + Base overrides.
  const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"));
  for (const row of rows) {
    const yahooId = getYahooIdFromRow(row);
    const stats = yahooId ? data[yahooId]?.stats ?? null : null;

    for (const col of ADVANCED_COLUMNS) {
      const td = document.createElement("td");
      td.dataset.hoopradar = col.key;
      td.textContent = formatStat(stats?.[col.key] ?? null, col.decimals, col.multiplier);
      td.style.textAlign = "end";
      insertBeforeSpacerOrAppend(row, td);
    }

    if (stats) {
      for (const col of BASE_OVERRIDE_COLUMNS) {
        const yahooLabel = col.yahooHeader;
        if (!yahooLabel) continue;
        const idx = headerIndex.get(yahooLabel);
        if (idx === undefined) continue;
        const cell = row.children[idx] as HTMLElement | undefined;
        if (!cell) continue;
        // Yahoo wraps cell content in a `<div>`; target it so we don't clobber the wrapper.
        const inner = cell.querySelector("div");
        const target = inner ?? cell;
        target.textContent = formatStat(stats[col.key] ?? null, col.decimals, col.multiplier);
        cell.dataset.hoopradarOverride = "1";
      }

      // Compound overrides (Yahoo renders `made/attempted` in a single cell).
      for (const col of COMPOUND_OVERRIDE_COLUMNS) {
        const idx = headerIndex.get(col.yahooHeader);
        if (idx === undefined) continue;
        const cell = row.children[idx] as HTMLElement | undefined;
        if (!cell) continue;
        const make = stats[col.makeKey];
        const att = stats[col.attemptKey];
        const target = cell.querySelector("div") ?? cell;
        if (make == null && att == null) {
          target.textContent = "-";
        } else {
          target.textContent = `${formatStat(make ?? null, col.decimals)}${col.separator}${formatStat(att ?? null, col.decimals)}`;
        }
        cell.dataset.hoopradarOverride = "1";
      }

      // Derived overrides (computed ratio of two nba.com stats, e.g. A/T,
      // FG%, FT%). Routed through formatStat so 3-decimal ratios in [0, 1)
      // get the leading-zero strip (".569" not "0.569"), matching the rest
      // of HoopRadar's percentage formatting.
      for (const col of DERIVED_OVERRIDE_COLUMNS) {
        const idx = headerIndex.get(col.yahooHeader);
        if (idx === undefined) continue;
        const cell = row.children[idx] as HTMLElement | undefined;
        if (!cell) continue;
        const num = stats[col.numeratorKey];
        const den = stats[col.denominatorKey];
        const target = cell.querySelector("div") ?? cell;
        if (num == null || den == null || den === 0) {
          target.textContent = "-";
        } else {
          target.textContent = formatStat(num / den, col.decimals);
        }
        cell.dataset.hoopradarOverride = "1";
      }
    }
  }
}

export function clearHoopradarCells(table: HTMLTableElement): void {
  for (const el of Array.from(table.querySelectorAll("[data-hoopradar]"))) {
    el.remove();
  }
  for (const el of Array.from(table.querySelectorAll<HTMLElement>("[data-hoopradar-override]"))) {
    delete el.dataset.hoopradarOverride;
  }
}
