/**
 * Small notice mounted in place of the filter bar when we are on a My Team
 * sub-tab where overlaying nba.com data would step on Yahoo's authoritative
 * live numbers (e.g. Stats > Today on game days). Tells the user where
 * HoopRadar does activate and gives them a one-click switch.
 */

const STYLES = `
  :host, .hoopradar-banner-host {
    display: block;
    box-sizing: border-box;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #1a1a2e;
  }
  .banner {
    display: flex;
    align-items: center;
    gap: 10px;
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
  .msg { flex: 1; opacity: 0.85; }
  button {
    font: inherit;
    color: inherit;
    background: #fff;
    border: 1px solid #c4c4cc;
    border-radius: 4px;
    padding: 3px 10px;
    cursor: pointer;
  }
`;

export interface WrongTabBannerDeps {
  message: string;
  onSwitchClick: () => void;
}

export function createWrongTabBanner(deps: WrongTabBannerDeps): HTMLElement {
  const host = document.createElement("div");
  host.classList.add("hoopradar-banner-host");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>${STYLES}</style>
    <div class="banner">
      <span class="brand">HoopRadar</span>
      <span class="msg"></span>
      <button data-role="switch">Switch tab</button>
    </div>
  `;
  const msgEl = root.querySelector(".msg") as HTMLElement;
  msgEl.textContent = deps.message;
  const btn = root.querySelector<HTMLButtonElement>('button[data-role="switch"]')!;
  btn.addEventListener("click", deps.onSwitchClick);
  return host;
}
