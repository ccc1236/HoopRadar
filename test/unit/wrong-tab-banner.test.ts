import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWrongTabBanner } from "../../src/ui/wrong-tab-banner.js";

describe("createWrongTabBanner", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the brand mark, the supplied message, and a Switch tab button", () => {
    const banner = createWrongTabBanner({
      message: "Switch to Average Stats > 2025-26 Season.",
      onSwitchClick: vi.fn(),
    });
    document.body.appendChild(banner);
    const sr = (banner as HTMLElement).shadowRoot!;
    expect(sr.querySelector(".brand")?.textContent).toBe("HoopRadar");
    expect(sr.querySelector(".msg")?.textContent).toContain("Switch to Average Stats");
    expect(sr.querySelector("button[data-role='switch']")).not.toBeNull();
  });

  it("calls onSwitchClick when the user clicks the button", () => {
    const onSwitchClick = vi.fn();
    const banner = createWrongTabBanner({
      message: "x",
      onSwitchClick,
    });
    document.body.appendChild(banner);
    const sr = (banner as HTMLElement).shadowRoot!;
    const btn = sr.querySelector<HTMLButtonElement>("button[data-role='switch']")!;
    btn.click();
    expect(onSwitchClick).toHaveBeenCalledOnce();
  });
});
