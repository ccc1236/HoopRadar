import { SPIDER_AXES, formatAxisValue } from "../shared/spiderAxes.js";
import type { SpiderData, WindowSlice, SpiderStatKey } from "../shared/spider.js";

const NS = "http://www.w3.org/2000/svg";

const WIDTH = 332;
const HEIGHT = 370;
const CX = 166;
const CY = 186;
const R = 100;

const COLORS = {
  season: { stroke: "#9CA3AF", fillOpacity: 0.18, strokeOpacity: 0.55 },
  L10:    { stroke: "#0ABAB5", fillOpacity: 0.22, strokeOpacity: 0.70 },
  L5:     { stroke: "#F59E0B", fillOpacity: 0.30, strokeOpacity: 0.90 },
} as const;

type WindowSlot = keyof SpiderData["windows"];
const SLOTS: readonly WindowSlot[] = ["season", "L10", "L5"];

function angle(i: number): number {
  return (-90 + (360 / SPIDER_AXES.length) * i) * Math.PI / 180;
}
function point(i: number, r: number): [number, number] {
  const a = angle(i);
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

export function renderSpiderChart(data: SpiderData | null, activeAxisKey?: SpiderStatKey | null): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", String(WIDTH));
  svg.setAttribute("height", String(HEIGHT));
  svg.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);

  // Gridlines
  for (const ring of [20, 40, 60, 80, 100]) {
    const pts: string[] = [];
    for (let i = 0; i < SPIDER_AXES.length; i++) {
      const [x, y] = point(i, R * ring / 100);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    const poly = document.createElementNS(NS, "polygon");
    poly.setAttribute("points", pts.join(" "));
    poly.setAttribute("fill", "none");
    poly.setAttribute("stroke", ring === 100 ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.08)");
    poly.setAttribute("stroke-width", "1");
    poly.setAttribute("data-role", "gridline");
    svg.appendChild(poly);
  }

  // Spokes
  for (let i = 0; i < SPIDER_AXES.length; i++) {
    const [x, y] = point(i, R);
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", String(CX));
    line.setAttribute("y1", String(CY));
    line.setAttribute("x2", x.toFixed(1));
    line.setAttribute("y2", y.toFixed(1));
    const isActive = data !== null && SPIDER_AXES[i]!.key === activeAxisKey;
    line.setAttribute("stroke", isActive ? "rgba(255,255,255,.5)" : "rgba(255,255,255,.08)");
    line.setAttribute("stroke-width", isActive ? "1.5" : "1");
    line.setAttribute("data-role", "spoke");
    if (isActive) line.setAttribute("data-active", "1");
    svg.appendChild(line);
  }

  if (data === null) {
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", String(CX));
    t.setAttribute("y", String(CY));
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("fill", "#9CA3AF");
    t.setAttribute("font-size", "12");
    t.setAttribute("data-role", "loading");
    t.textContent = "loading...";
    svg.appendChild(t);
    return svg;
  }

  // Axis hit-areas (data path only): transparent click targets over each spoke.
  for (let i = 0; i < SPIDER_AXES.length; i++) {
    const [hx, hy] = point(i, R + 10);
    const hit = document.createElementNS(NS, "circle");
    hit.setAttribute("cx", hx.toFixed(1));
    hit.setAttribute("cy", hy.toFixed(1));
    hit.setAttribute("r", "26");
    hit.setAttribute("fill", "transparent");
    hit.setAttribute("data-role", "axis-hit");
    hit.setAttribute("data-axis-key", SPIDER_AXES[i]!.key);
    svg.appendChild(hit);
  }

  // Data polygons (Season under L10 under L5)
  for (const slot of SLOTS) {
    const slice = data.windows[slot];
    if (!slice) continue;
    const pts: string[] = [];
    for (let i = 0; i < SPIDER_AXES.length; i++) {
      const key = SPIDER_AXES[i]!.key;
      const pct = slice.percentiles[key];
      const r = R * ((typeof pct === "number" && Number.isFinite(pct)) ? pct : 0) / 100;
      const [x, y] = point(i, r);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    const poly = document.createElementNS(NS, "polygon");
    poly.setAttribute("points", pts.join(" "));
    const c = COLORS[slot];
    poly.setAttribute("fill", c.stroke);
    poly.setAttribute("fill-opacity", String(c.fillOpacity));
    poly.setAttribute("stroke", c.stroke);
    poly.setAttribute("stroke-opacity", String(c.strokeOpacity));
    poly.setAttribute("stroke-width", "1.5");
    poly.setAttribute("stroke-linejoin", "round");
    poly.setAttribute("data-role", "window");
    poly.setAttribute("data-window", slot);
    svg.appendChild(poly);
  }

  // Axis labels (key + 3 raw values stacked below)
  for (let i = 0; i < SPIDER_AXES.length; i++) {
    const a = angle(i);
    const sinA = Math.sin(a);
    const verticalBoost = sinA < 0 ? Math.abs(sinA) * 30 : 0;
    const labelRadius = R + 18 + verticalBoost;
    const labelX = CX + labelRadius * Math.cos(a);
    const labelY = CY + labelRadius * Math.sin(a);

    let anchor: "start" | "end" | "middle" = "middle";
    if (Math.cos(a) > 0.3) anchor = "start";
    else if (Math.cos(a) < -0.3) anchor = "end";

    const key = document.createElementNS(NS, "text");
    key.setAttribute("x", labelX.toFixed(1));
    key.setAttribute("y", labelY.toFixed(1));
    key.setAttribute("text-anchor", anchor);
    key.setAttribute("fill", "#E5E7EB");
    key.setAttribute("font-size", "11");
    key.setAttribute("font-weight", "600");
    key.setAttribute("data-role", "axis-key");
    key.textContent = SPIDER_AXES[i]!.label;
    if (SPIDER_AXES[i]!.key === activeAxisKey) {
      key.setAttribute("fill", "#FFFFFF");
      key.setAttribute("font-weight", "700");
      key.setAttribute("data-active", "1");
    }
    svg.appendChild(key);

    const valueRows: Array<{ slot: WindowSlot; bold: boolean }> = [
      { slot: "season", bold: false },
      { slot: "L10", bold: false },
      { slot: "L5", bold: true },
    ];
    valueRows.forEach((vr, idx) => {
      const slice: WindowSlice | null = data.windows[vr.slot];
      const raw = slice?.values[SPIDER_AXES[i]!.key as SpiderStatKey];
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", labelX.toFixed(1));
      t.setAttribute("y", (labelY + 12 + idx * 11).toFixed(1));
      t.setAttribute("text-anchor", anchor);
      t.setAttribute("fill", COLORS[vr.slot].stroke);
      t.setAttribute("font-size", "10");
      t.setAttribute("font-weight", vr.bold ? "600" : "400");
      t.setAttribute("data-role", "axis-value");
      t.setAttribute("data-window", vr.slot);
      t.textContent = formatAxisValue(SPIDER_AXES[i]!.key as SpiderStatKey, raw ?? null);
      svg.appendChild(t);
    });
  }

  return svg;
}
