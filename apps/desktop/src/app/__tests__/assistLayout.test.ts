import { describe, expect, it } from "vitest";
import { resolveAssistLayout } from "../assistLayout";

const base = { sidebarWidth: 218, sidebarCollapsed: false, assistWidth: 400 };

describe("resolveAssistLayout", () => {
  it("宽窗口并排，侧栏不动", () => {
    expect(resolveAssistLayout({ ...base, windowWidth: 1440 })).toEqual({
      mode: "beside",
      collapseSidebar: false,
      mainWidth: 800,
    });
  });

  it("正文不足 720 时收起侧栏换空间", () => {
    const layout = resolveAssistLayout({ ...base, windowWidth: 1280 });
    expect(layout.mode).toBe("beside");
    expect(layout.collapseSidebar).toBe(true);
    expect(layout.mainWidth).toBe(1280 - 58 - 4 - 400 - 18);
  });

  it("侧栏已收起时不重复要求收起", () => {
    const layout = resolveAssistLayout({ ...base, sidebarCollapsed: true, windowWidth: 1280 });
    expect(layout).toMatchObject({ mode: "beside", collapseSidebar: false });
  });

  it("收起侧栏仍不足 560 时改为覆盖浮层，侧栏保持原状", () => {
    const layout = resolveAssistLayout({ ...base, assistWidth: 560, windowWidth: 1080 });
    expect(layout).toEqual({ mode: "overlay", collapseSidebar: false, mainWidth: 1080 - 218 - 4 });
  });
});
