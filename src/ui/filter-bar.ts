import { WINDOWS } from "../shared/windows.js";
import { PER_MODES } from "../shared/perModes.js";
import { loadSettings, saveSettings, type FilterSettings } from "../shared/settings.js";
import type { PerModeKey, WindowKey } from "../shared/types.js";

/**
 * Filter bar built as a plain `<div>` rather than a custom element. Some Chrome
 * MV3 content-script contexts have a non-functional `customElements` registry,
 * which broke the earlier `<fnba-filter-bar>` Web Component approach. Shadow
 * DOM still works on plain elements, so style isolation is preserved.
 */

const STYLES = `
  :host, .fnba-bar-host {
    display: block;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #1a1a2e;
    box-sizing: border-box;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: #f5f5f7;
    border: 1px solid #d8d8de;
    border-radius: 6px;
    font-size: 12px;
  }
  .brand {
    font-weight: 700;
    color: #2D4A5B;
    letter-spacing: 0.02em;
  }
  select, button {
    font: inherit;
    color: inherit;
    background: #fff;
    border: 1px solid #c4c4cc;
    border-radius: 4px;
    padding: 3px 8px;
    cursor: pointer;
  }
  button[data-role="refresh"] {
    padding: 3px 10px;
  }
  .status {
    margin-left: auto;
    font-size: 11px;
    opacity: 0.7;
  }
  .status[data-state="error"] {
    color: #b00020;
    opacity: 1;
  }
  .status[data-state="busy"] {
    opacity: 1;
    animation: fnba-pulse 1s ease-in-out infinite;
  }
  @keyframes fnba-pulse {
    0%, 100% { opacity: 0.35; }
    50% { opacity: 1; }
  }
`;

export interface FilterBarHandle extends HTMLElement {
  getSettings(): FilterSettings;
  setStatus(text: string, state?: "ok" | "error"): void;
}

/** Build the filter bar element. Async because it loads persisted settings. */
export async function createFilterBar(): Promise<FilterBarHandle> {
  const host = document.createElement("div") as unknown as FilterBarHandle;
  host.classList.add("fnba-bar-host");

  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>${STYLES}</style>
    <div class="bar">
      <span class="brand">fNBA</span>
      <select data-role="window">
        ${WINDOWS.map((w) => `<option value="${w.key}">${w.label}</option>`).join("")}
      </select>
      <select data-role="perMode">
        ${PER_MODES.map((m) => `<option value="${m.key}">${m.label}</option>`).join("")}
      </select>
      <button data-role="refresh" title="Refetch from nba.com">⟳ Refresh</button>
      <span class="status" data-role="status"></span>
    </div>
  `;

  let settings: FilterSettings = await loadSettings();

  const winSel = root.querySelector('select[data-role="window"]') as HTMLSelectElement;
  const modeSel = root.querySelector('select[data-role="perMode"]') as HTMLSelectElement;
  const refresh = root.querySelector('button[data-role="refresh"]') as HTMLButtonElement;
  const statusEl = root.querySelector('[data-role="status"]') as HTMLElement;

  winSel.value = settings.window;
  modeSel.value = settings.perMode;

  winSel.addEventListener("change", () => {
    settings = { ...settings, window: winSel.value as WindowKey };
    void saveSettings({ window: settings.window });
    host.dispatchEvent(new CustomEvent("fnba-filter-change", { detail: { ...settings } }));
  });
  modeSel.addEventListener("change", () => {
    settings = { ...settings, perMode: modeSel.value as PerModeKey };
    void saveSettings({ perMode: settings.perMode });
    host.dispatchEvent(new CustomEvent("fnba-filter-change", { detail: { ...settings } }));
  });
  refresh.addEventListener("click", () => {
    host.dispatchEvent(new Event("fnba-filter-refresh"));
  });

  host.getSettings = (): FilterSettings => ({ ...settings });
  host.setStatus = (text: string, state: "ok" | "error" = "ok"): void => {
    statusEl.textContent = text;
    // A trailing ellipsis marks an in-progress status (Loading.../Refreshing...);
    // render it with a pulse so the user sees work happening in the background.
    const busy = state === "ok" && /\.\.\.$/.test(text);
    statusEl.dataset["state"] = busy ? "busy" : state;
  };

  return host;
}
