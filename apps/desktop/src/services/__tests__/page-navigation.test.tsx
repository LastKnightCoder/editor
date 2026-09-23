import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageProvider } from "@/page/PageProvider";
import { PageNavigationBridge } from "@/app/PageNavigationBridge";
import { definePage } from "@/page/definePage";
import { paramNumber } from "@/page/core/paramsSchema";
import { getPageNavigation, openPage } from "../page-navigation";
import { getActiveTab, getCurrentPanels, getTabContent } from "@/mcp/tab-content/utils";

vi.mock("@/services/aiServer", () => ({ initAiServer: vi.fn(), closeAiServer: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

definePage({ key: "nav-home", label: "首页", params: {}, component: () => null });
definePage({
  key: "nav-detail",
  label: "详情",
  params: { id: paramNumber() },
  match: "params",
  getId: params => String(params.id),
  component: () => null,
});

let root: Root | undefined;
let container: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container?.remove();
});

function mount() {
  container = document.createElement("div");
  root = createRoot(container);
  act(() =>
    root!.render(
      <PageProvider initialKey="nav-home">
        <PageNavigationBridge />
      </PageProvider>
    )
  );
}

describe("服务层 Page 导航", () => {
  it("未挂载或已卸载时明确报错", () => {
    expect(() => openPage("nav-home")).toThrow("尚未就绪");
    mount();
    act(() => root!.unmount());
    root = undefined;
    expect(() => getPageNavigation()).toThrow("尚未就绪");
  });

  it("拒绝未知页面和错误参数，连续导航与 MCP 当前页面保持一致", async () => {
    mount();
    expect(() => openPage("not-registered")).toThrow("尚未实现");
    expect(() => openPage("nav-detail", { id: "wrong" })).toThrow("参数无效");
    act(() => {
      openPage("nav-detail", { id: 11 });
      openPage("nav-detail", { id: 12 });
    });
    expect(getActiveTab()?.tab.params).toEqual({ id: 12 });
    expect(getCurrentPanels()[0].tabCount).toBe(3);
    const activeId = getActiveTab()!.tab.id;
    expect((await getTabContent(activeId))?.metadata).toMatchObject({
      type: "nav-detail",
      isActive: true,
    });
    act(() => openPage("nav-detail", { id: 12 }));
    expect(getCurrentPanels()[0].tabCount).toBe(3);
    act(() => getPageNavigation().navigator.back());
    expect(getActiveTab()?.tab.params).toEqual({ id: 11 });
    expect(await getTabContent(activeId)).toBeNull();
  });
});
