import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageProvider } from "@/page/PageProvider";
import { PageNavigationBridge } from "@/app/PageNavigationBridge";
import { definePage } from "@/page/definePage";
import { paramNumber } from "@/page/core/paramsSchema";
import { getPageNavigation, openPage } from "../page-navigation";

vi.mock("@/services/aiServer", () => ({ initAiServer: vi.fn(), closeAiServer: vi.fn() }));

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

  it("拒绝未知页面和错误参数，连续导航与 Page 栈保持一致", () => {
    mount();
    expect(() => openPage("not-registered")).toThrow("尚未实现");
    expect(() => openPage("nav-detail", { id: "wrong" })).toThrow("参数无效");
    act(() => {
      openPage("nav-detail", { id: 11 });
      openPage("nav-detail", { id: 12 });
    });
    const top = () => getPageNavigation().state.back.at(-1)?.params;
    expect(top()).toEqual({ id: 12 });
    act(() => openPage("nav-detail", { id: 12 }));
    expect(getPageNavigation().state.back).toHaveLength(3);
    act(() => getPageNavigation().navigator.back());
    expect(top()).toEqual({ id: 11 });
  });
});
