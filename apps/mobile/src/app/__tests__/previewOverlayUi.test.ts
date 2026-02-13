import { describe, expect, it } from "vitest";
import { extractPreviewOverlayUi } from "../previewOverlayUi";

describe("app/previewOverlayUi", () => {
  it("应优先读取 panelState", () => {
    const ui = extractPreviewOverlayUi({
      ui: {
        scrollTop: 88,
        panelState: "full",
        fullscreen: false,
      },
    });
    expect(ui).toEqual({ scrollTop: 88, panelState: "full" });
  });

  it("缺少 panelState 时应兼容 fullscreen 历史字段", () => {
    const ui = extractPreviewOverlayUi({
      ui: {
        scrollTop: 0,
        fullscreen: true,
      },
    });
    expect(ui).toEqual({ scrollTop: 0, panelState: "full" });
  });

  it("非法值应回退为 normal 与 scrollTop=0", () => {
    const ui = extractPreviewOverlayUi({
      ui: {
        scrollTop: -12,
        panelState: "unknown",
      },
    });
    expect(ui).toEqual({ scrollTop: 0, panelState: "normal" });
  });
});
