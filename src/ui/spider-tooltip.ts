import { renderSpiderChart } from "./spider-chart.js";
import { SPIDER_AXES, formatAxisValue } from "../shared/spiderAxes.js";
import type {
  GetSpiderDataRequest,
  GetSpiderDataResponse,
  SpiderData,
  SpiderStatKey,
} from "../shared/spider.js";
import type { PerModeKey, WindowKey } from "../shared/types.js";

const HOVER_DELAY_MS = 300;
const HOST_CLASS = "fnba-spider-host";

const STYLES = `
  :host { position: absolute; z-index: 2147483600; }
  .card {
    width: 340px;
    background: #1F3645;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,.25);
    color: #E5E7EB;
    font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
    overflow: hidden;
  }
  .header {
    display: flex; align-items: flex-start; justify-content: space-between;
    padding: 12px 14px 6px;
    border-bottom: 1px solid rgba(255,255,255,.08);
  }
  .name { font-weight: 600; font-size: 14px; }
  .sub  { color: #9CA3AF; font-size: 11px; margin-top: 1px; }
  .close {
    background: none; border: none; color: #9CA3AF;
    font-size: 18px; cursor: pointer; line-height: 1; padding: 0; margin-top: -2px;
  }
  .body { padding: 8px 4px 4px; }
  .legend {
    display: flex; justify-content: center; gap: 14px;
    padding: 0 14px 12px; font-size: 11px;
  }
  .legend span { display: flex; align-items: center; gap: 5px; }
  .legend i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
  .legend .s { background: #9CA3AF; opacity: .5; }
  .legend .t { background: #0ABAB5; opacity: .7; }
  .legend .g { background: #F59E0B; }
  .legend [data-dim="1"] { opacity: 0.35; }
  .msg { padding: 30px 16px 26px; text-align: center; color: #E5E7EB; font-size: 12px; }
  .strip { border-top: 1px solid rgba(255,255,255,.12); padding: 10px 14px 12px; }
  .strip.empty { color: #6b7280; font-size: 12px; font-style: italic; }
  .strip .stat { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
  .strip .stat .ctx { color: #9CA3AF; font-weight: 400; }
  .strip .grid { display: flex; gap: 14px; font-size: 13px; }
  .strip .lbl { color: #9CA3AF; font-size: 11px; }
  .strip .val { font-weight: 600; }
  .strip .you { color: #F59E0B; }
`;

export interface SpiderTooltipDeps {
  table: HTMLTableElement;
  send: (req: GetSpiderDataRequest) => Promise<GetSpiderDataResponse>;
  getPerMode: () => PerModeKey;
  getWindow: () => WindowKey;
  /**
   * Elements whose clicks should NOT dismiss a pinned card. Use this to
   * exclude UI surfaces the user is allowed to interact with while the
   * tooltip stays pinned (e.g. the filter bar's dropdowns).
   */
  safeAreas?: readonly Element[];
}

export interface SpiderTooltipHandle {
  teardown: () => void;
  onPerModeChange: () => void;
  onWindowChange: () => void;
}

interface OpenCard {
  host: HTMLDivElement;
  yahooId: string;
  pinned: boolean;
}

export function createSpiderTooltipController(deps: SpiderTooltipDeps): SpiderTooltipHandle {
  const { table } = deps;
  let openCard: OpenCard | null = null;
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;
  let hoveredAnchor: HTMLAnchorElement | null = null;
  let activeAxisKey: SpiderStatKey | null = null;
  let currentData: SpiderData | null = null;

  function dismiss(): void {
    if (openCard) {
      openCard.host.remove();
      openCard = null;
    }
    activeAxisKey = null;
    currentData = null;
  }

  function anchorFromEvent(e: Event): HTMLAnchorElement | null {
    const t = e.target as Element | null;
    const a = t?.closest<HTMLAnchorElement>("a[data-ys-playerid]") ?? null;
    if (!a) return null;
    // Yahoo renders two anchors per player sharing data-ys-playerid: the name
    // link (/nba/players/<id>) and the note/news icon (/nba/players/<id>/news).
    // Only the name link should trigger the spider; the note icon opens Yahoo's
    // own latest-news popup.
    if (/\/news(?:[/?#]|$)/.test(a.getAttribute("href") ?? "")) return null;
    return a;
  }

  function mount(anchor: HTMLAnchorElement, pinned: boolean): void {
    dismiss();
    const host = document.createElement("div");
    host.classList.add(HOST_CLASS);
    const r = anchor.getBoundingClientRect();
    host.style.left = `${window.scrollX + r.left}px`;
    host.style.top  = `${window.scrollY + r.bottom + 6}px`;
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${STYLES}</style>
      <div class="card">
        <div class="header">
          <div>
            <div class="name" data-role="name">${anchor.textContent?.trim() ?? ""}</div>
            <div class="sub"  data-role="sub"></div>
          </div>
          ${pinned ? '<button class="close" data-role="close">&times;</button>' : ""}
        </div>
        <div class="body" data-role="body"></div>
        <div class="legend">
          <span data-window="season"><i class="s"></i>Season</span>
          <span data-window="L10"><i class="t"></i>L10</span>
          <span data-window="L5"><i class="g"></i>L5</span>
        </div>
        ${pinned ? '<div class="strip empty" data-role="strip">Click an axis to see rank and league average.</div>' : ""}
      </div>
    `;
    document.body.appendChild(host);

    const body = root.querySelector('[data-role="body"]') as HTMLElement;
    body.appendChild(renderSpiderChart(null));
    body.addEventListener("click", onAxisClick);

    openCard = { host, yahooId: anchor.getAttribute("data-ys-playerid")!, pinned };
    if (pinned) {
      const close = root.querySelector<HTMLButtonElement>('[data-role="close"]');
      close?.addEventListener("click", dismiss);
    }
    void fetchAndRender();
  }

  async function fetchAndRender(): Promise<void> {
    if (!openCard) return;
    const yahooId = openCard.yahooId;
    let resp: GetSpiderDataResponse;
    try {
      resp = await deps.send({
        type: "getSpiderData",
        yahooId,
        perMode: deps.getPerMode(),
      });
    } catch {
      renderMessage("Stats unavailable. Retry from filter bar.");
      return;
    }
    if (!openCard || openCard.yahooId !== yahooId) return;
    if (resp.ok) renderReady(resp.data);
    else if (resp.reason === "no-mapping") renderMessage("No NBA mapping for this player yet.");
    else renderMessage("Stats unavailable. Retry from filter bar.");
  }

  function renderReady(data: SpiderData): void {
    if (!openCard) return;
    currentData = data;
    const root = openCard.host.shadowRoot!;
    const sub  = root.querySelector('[data-role="sub"]')  as HTMLElement;
    const name = root.querySelector('[data-role="name"]') as HTMLElement;
    name.textContent = data.name;
    sub.textContent  = `${data.team} · ${data.position} · ${perModeLabel(data.perMode)}`;
    const body = root.querySelector('[data-role="body"]') as HTMLElement;
    body.replaceChildren(renderSpiderChart(data, activeAxisKey));
    for (const slot of ["season", "L10", "L5"] as const) {
      const el = root.querySelector(`.legend [data-window="${slot}"]`) as HTMLElement | null;
      if (el) el.dataset["dim"] = data.windows[slot] ? "0" : "1";
    }
    renderStrip();
  }

  function renderMessage(text: string): void {
    if (!openCard) return;
    const body = openCard.host.shadowRoot!.querySelector('[data-role="body"]') as HTMLElement;
    body.innerHTML = `<div class="msg">${text}</div>`;
  }

  function perModeLabel(p: PerModeKey): string {
    if (p === "PerGame") return "Per Game";
    if (p === "Per36") return "Per 36";
    return "Per 100";
  }

  function windowSlot(w: WindowKey): keyof SpiderData["windows"] {
    return w === "Season" ? "season" : w === "Last10" ? "L10" : "L5";
  }
  function windowLabel(w: WindowKey): string {
    return w === "Season" ? "Season" : w === "Last10" ? "L10" : "L5";
  }
  function ordinal(n: number): string {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
  }
  function axisLabel(key: SpiderStatKey): string {
    return SPIDER_AXES.find((a) => a.key === key)?.label ?? key;
  }

  function renderStrip(): void {
    if (!openCard?.pinned) return;
    const strip = openCard.host.shadowRoot!.querySelector('[data-role="strip"]') as HTMLElement | null;
    if (!strip) return;
    if (!activeAxisKey) {
      strip.className = "strip empty";
      strip.textContent = "Click an axis to see rank and league average.";
      return;
    }
    const key = activeAxisKey;
    const w = deps.getWindow();
    const slice = currentData?.windows[windowSlot(w)] ?? null;
    const label = axisLabel(key);
    const ctx = `${windowLabel(w)} · ${perModeLabel(deps.getPerMode())}`;
    const rank = slice?.ranks[key];
    const nVal = slice?.n[key];
    const val = slice?.values[key];
    const avg = slice?.leagueAvg[key];
    const pct = slice?.percentiles[key];

    if (slice === null || rank === undefined || val === undefined) {
      strip.className = "strip empty";
      strip.textContent = `${label} - no ${windowLabel(w)} data`;
      return;
    }

    strip.className = "strip";
    strip.innerHTML = `
      <div class="stat">${label} <span class="ctx">· ${ctx}</span></div>
      <div class="grid">
        <div><div class="lbl">Rank</div><div class="val">${ordinal(rank)} of ${nVal ?? "?"}</div></div>
        <div><div class="lbl">League avg</div><div class="val">${avg !== undefined ? formatAxisValue(key, avg) : "—"}</div></div>
        <div><div class="lbl">Player</div><div class="val you">${formatAxisValue(key, val)}</div></div>
        <div><div class="lbl">Percentile</div><div class="val">${pct !== undefined ? ordinal(Math.round(pct)) : "—"}</div></div>
      </div>`;
  }

  function redrawChart(): void {
    if (!openCard) return;
    const body = openCard.host.shadowRoot!.querySelector('[data-role="body"]') as HTMLElement;
    body.replaceChildren(renderSpiderChart(currentData, activeAxisKey));
  }

  function onAxisClick(e: Event): void {
    if (!openCard?.pinned) return;
    const t = e.target as Element | null;
    const hit = t?.closest<SVGCircleElement>("circle[data-role='axis-hit']");
    if (!hit) return;
    const key = hit.getAttribute("data-axis-key") as SpiderStatKey | null;
    if (!key) return;
    activeAxisKey = activeAxisKey === key ? null : key;
    redrawChart();
    renderStrip();
  }

  function onMouseOver(e: Event): void {
    const a = anchorFromEvent(e);
    if (!a) return;
    if (openCard?.pinned) return;
    hoveredAnchor = a;
    if (hoverTimer !== null) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => mount(a, false), HOVER_DELAY_MS);
  }
  function onMouseOut(e: Event): void {
    const a = anchorFromEvent(e);
    if (!a) return;
    if (a !== hoveredAnchor) return;
    if (openCard?.pinned) return;
    if (hoverTimer !== null) { clearTimeout(hoverTimer); hoverTimer = null; }
    if (openCard && !openCard.pinned) dismiss();
  }
  function onClick(e: Event): void {
    const a = anchorFromEvent(e);
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    mount(a, true);
  }
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape" && openCard?.pinned) dismiss();
  }
  function onDocClick(e: Event): void {
    if (!openCard?.pinned) return;
    const t = e.target as Node;
    if (openCard.host.contains(t)) return;
    if (t instanceof Element && t.closest("a[data-ys-playerid]")) return;
    if (deps.safeAreas) {
      for (const el of deps.safeAreas) {
        if (el.contains(t)) return;
      }
    }
    dismiss();
  }

  table.addEventListener("mouseover", onMouseOver);
  table.addEventListener("mouseout", onMouseOut);
  table.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("click", onDocClick);

  return {
    teardown: () => {
      dismiss();
      if (hoverTimer !== null) clearTimeout(hoverTimer);
      table.removeEventListener("mouseover", onMouseOver);
      table.removeEventListener("mouseout", onMouseOut);
      table.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onDocClick);
    },
    onPerModeChange: () => {
      if (openCard) void fetchAndRender();
    },
    onWindowChange: () => {
      if (openCard) renderStrip();
    },
  };
}
