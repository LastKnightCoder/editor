import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { definePlugin, type PluginContext, type PluginHomePanelProps } from "@tau/plugins";
import { createMemoryStorage } from "@tau/plugins/host";
import { DesktopPluginRuntime } from "@/app/plugins/runtime";
import { PluginRuntimeContext, useDesktopPlugins } from "@/app/plugins/context";
import type { HomeLayoutEntry } from "@/types/home-layout";
import type { HomePanelDefinition } from "../layout";
import { HomePanels } from "../views/HomePanels";
import { pluginHomePanel } from "../views/PluginHomePanel";

const builtin: HomePanelDefinition = {
  id: "review",
  title: "复习",
  size: "compact",
  component: () => <section>复习正文</section>,
};

function Home({ initial }: { initial: HomeLayoutEntry[] }) {
  const runtime = useDesktopPlugins();
  const [layout, setLayout] = useState(initial);
  const panels = [builtin, ...(runtime?.listHomePanels() ?? []).map(pluginHomePanel)];
  return <HomePanels panels={panels} layout={layout} onChange={setLayout} />;
}

describe("插件首页面板", () => {
  let container: HTMLDivElement;
  let root: Root;
  let runtime: DesktopPluginRuntime;
  let context!: PluginContext;

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    runtime = new DesktopPluginRuntime({
      workspaceId: "home",
      storage: createMemoryStorage(),
      navigator: { push: vi.fn() },
      plugins: [],
    });
    runtime.host.registerTrusted(
      definePlugin({
        id: "author.reading",
        name: "阅读",
        version: "1",
        create: () => ({
          activate(ctx) {
            context = ctx;
          },
        }),
      })
    );
    await runtime.host.enable("author.reading");
  });
  afterEach(async () => {
    await act(async () => {
      await runtime.dispose();
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  const render = (layout: HomeLayoutEntry[] = []) =>
    act(async () =>
      root.render(
        <PluginRuntimeContext.Provider value={runtime}>
          <Home initial={layout} />
        </PluginRuntimeContext.Provider>
      )
    );
  const shown = () =>
    [
      ...container.querySelectorAll<HTMLElement>(
        "[data-home-panel]:not(:has([data-home-panel-body]:empty))"
      ),
    ].map(el => el.dataset.homePanel);

  it("排在内置面板之后，宿主画标题，插件组件收到 context；停用后消失、位置保留", async () => {
    const mounted = vi.fn();
    const Body = ({ context: ctx }: PluginHomePanelProps) => {
      useEffect(() => mounted(), []);
      return <p>本周读了 {ctx.pluginId}</p>;
    };
    await render([
      { id: "plugin:author.reading:week", hidden: false },
      { id: "review", hidden: false },
    ]);
    await act(async () => {
      context.home.registerPanel({ id: "week", title: "本周阅读", component: Body });
    });
    // 布局里保存过的位置优先
    expect(shown()).toEqual(["plugin:author.reading:week", "review"]);
    expect(container.textContent).toContain("本周阅读");
    expect(container.textContent).toContain("本周读了 author.reading");
    const wrapper = container.querySelector('[data-home-panel="plugin:author.reading:week"]');
    expect(wrapper?.className).toContain("basis-full");
    // 运行时其他变更不会让插件面板重新挂载
    await act(async () => {
      context.home.registerPanel({ id: "other", title: "其他", component: () => null });
    });
    expect(mounted).toHaveBeenCalledTimes(1);
    await act(async () => runtime.host.disable("author.reading"));
    expect(shown()).toEqual(["review"]);
  });

  it("正文为空时整块不显示；出错只影响这一块，可重试", async () => {
    await render();
    let fail = true;
    await act(async () => {
      context.home.registerPanel({ id: "empty", title: "空", component: () => null });
      context.home.registerPanel({
        id: "broken",
        title: "坏的",
        size: "compact",
        component: () => {
          if (fail) throw new Error("读取失败");
          return <p>恢复了</p>;
        },
      });
    });
    expect(shown()).toEqual(["review", "plugin:author.reading:broken"]);
    expect(container.textContent).toContain("面板出错了：读取失败");
    expect(container.textContent).toContain("复习正文");
    fail = false;
    await act(async () =>
      [...container.querySelectorAll("button")].find(b => b.textContent === "重试")?.click()
    );
    expect(container.textContent).toContain("恢复了");
  });
});
