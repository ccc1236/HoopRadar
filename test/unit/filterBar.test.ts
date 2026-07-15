import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFilterBar, type FilterBarHandle } from "../../src/ui/filter-bar.js";

describe("filter bar", () => {
  let bar: FilterBarHandle;
  beforeEach(async () => {
    await chrome.storage.sync.clear();
    document.body.innerHTML = "";
    bar = await createFilterBar();
    document.body.appendChild(bar);
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders both dropdowns and a refresh button", () => {
    const sr = bar.shadowRoot!;
    expect(sr.querySelector('select[data-role="window"]')).not.toBeNull();
    expect(sr.querySelector('select[data-role="perMode"]')).not.toBeNull();
    expect(sr.querySelector('button[data-role="refresh"]')).not.toBeNull();
  });

  it("emits hoopradar-filter-change with the new selection on window change", async () => {
    const sr = bar.shadowRoot!;
    const sel = sr.querySelector<HTMLSelectElement>('select[data-role="window"]')!;
    const events: CustomEvent[] = [];
    bar.addEventListener("hoopradar-filter-change", (e) => events.push(e as CustomEvent));

    sel.value = "Last5";
    sel.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 0));

    expect(events).toHaveLength(1);
    expect(events[0]!.detail).toEqual({ window: "Last5", perMode: "PerGame" });
  });

  it("emits hoopradar-filter-refresh on refresh-button click", () => {
    const sr = bar.shadowRoot!;
    const btn = sr.querySelector<HTMLButtonElement>('button[data-role="refresh"]')!;
    const events: Event[] = [];
    bar.addEventListener("hoopradar-filter-refresh", (e) => events.push(e));
    btn.click();
    expect(events).toHaveLength(1);
  });

  it("setStatus() updates the status pill", () => {
    bar.setStatus("Updated just now");
    const sr = bar.shadowRoot!;
    expect(sr.querySelector('[data-role="status"]')!.textContent).toBe("Updated just now");
  });

  it("marks a trailing-ellipsis status as busy (for the pulse animation)", () => {
    const el = bar.shadowRoot!.querySelector('[data-role="status"]') as HTMLElement;
    bar.setStatus("Loading...");
    expect(el.dataset["state"]).toBe("busy");
    bar.setStatus("Refreshing...");
    expect(el.dataset["state"]).toBe("busy");
    bar.setStatus("Updated 3:40 PM");
    expect(el.dataset["state"]).toBe("ok");
    bar.setStatus("UPSTREAM_UNAVAILABLE", "error");
    expect(el.dataset["state"]).toBe("error");
  });
});
