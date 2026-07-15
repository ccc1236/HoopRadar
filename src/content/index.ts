import { detectPage, type PageInfo } from "./pageDetect.js";
import { log } from "../shared/logger.js";

type PageModule = (info: PageInfo) => Promise<{ teardown: () => void }>;

const modules: Partial<Record<PageInfo["kind"], () => Promise<PageModule>>> = {
  players: () => import("../pages/players.js").then((m) => m.run),
  myTeam: () => import("../pages/myTeam.js").then((m) => m.run),
};

let activeTeardown: (() => void) | null = null;

async function activate(info: PageInfo): Promise<void> {
  if (info.kind === "unknown") return;
  const loader = modules[info.kind];
  if (!loader) return;
  try {
    const run = await loader();
    const handle = await run(info);
    activeTeardown = handle.teardown;
    log.info("page module active:", info.kind);
  } catch (e) {
    log.error("page module failed:", info.kind, e);
  }
}

function deactivate(): void {
  if (activeTeardown) {
    try {
      activeTeardown();
    } catch (e) {
      log.warn("teardown error", e);
    }
    activeTeardown = null;
  }
}

async function refresh(): Promise<void> {
  deactivate();
  await activate(detectPage(location.href));
}

void refresh();

// Yahoo uses both full navigations and occasional pushState (e.g. pagination).
let lastHref = location.href;
const observer = new MutationObserver(() => {
  if (location.href !== lastHref) {
    lastHref = location.href;
    void refresh();
  }
});
observer.observe(document.body, { childList: true, subtree: true });

window.addEventListener("popstate", () => void refresh());

log.info("HoopRadar content script booted");
