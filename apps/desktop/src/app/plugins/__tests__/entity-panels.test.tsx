import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  definePlugin,
  type PluginContext,
  type PluginEntityPanelProps,
  type PluginEntityPanelTarget,
} from "@tau/plugins";
import { createMemoryStorage } from "@tau/plugins/host";
import { DesktopPluginRuntime } from "@/app/plugins/runtime";
import { PluginRuntimeContext } from "@/app/plugins/context";
import { PluginEntityPanels } from "@/app/plugins/entity-panels";

describe("插件详情区块", () => {
  let container: HTMLDivElement;
  let root: Root;
  let runtime: DesktopPluginRuntime;
  let context!: PluginContext;

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    runtime = new DesktopPluginRuntime({
      workspaceId: "panels",
      storage: createMemoryStorage(),
      navigator: { push: vi.fn() },
      plugins: [],
    });
    runtime.host.registerTrusted(
      definePlugin({
        id: "author.q",
        name: "问题",
        version: "1",
        create: () => ({
          activate(ctx) {
            context = ctx;
          },
        }),
      })
    );
    await runtime.host.enable("author.q");
  });
  afterEach(async () => {
    await act(async () => {
      await runtime.dispose();
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  const render = (target: PluginEntityPanelTarget | null, withRuntime = true) =>
    act(async () =>
      root.render(
        withRuntime ? (
          <PluginRuntimeContext.Provider value={runtime}>
            <PluginEntityPanels target={target} className="mb-5" />
          </PluginRuntimeContext.Provider>
        ) : (
          <PluginEntityPanels target={target} />
        )
      )
    );
  const panels = () =>
    [...container.querySelectorAll<HTMLElement>("[data-plugin-entity-panel]")].map(
      el => el.dataset.pluginEntityPanel
    );

  it("按对象类型列出，组件只收到引用；换对象不重新挂载，停用后消失", async () => {
    const mounted = vi.fn();
    const Related = ({ target }: PluginEntityPanelProps) => {
      useEffect(() => mounted(), []);
      return <p>相关问题：{`${target.kind}:${target.id}`}</p>;
    };
    await act(async () => {
      context.views.registerEntityPanel({
        id: "related",
        kinds: ["card", "document"],
        component: Related,
      });
      context.views.registerEntityPanel({
        id: "article-only",
        kinds: ["article"],
        component: Related,
      });
    });
    await render({ kind: "card", id: "7" });
    expect(panels()).toEqual(["plugin:author.q:related"]);
    expect(container.textContent).toBe("相关问题：card:7");
    expect(container.querySelector("[data-plugin-entity-panel]")?.className).toContain("mb-5");
    await render({ kind: "card", id: "8" });
    expect(container.textContent).toBe("相关问题：card:8");
    expect(mounted).toHaveBeenCalledTimes(1);
    await render({ kind: "article", id: "3" });
    expect(panels()).toEqual(["plugin:author.q:article-only"]);
    await act(async () => runtime.host.disable("author.q"));
    expect(container.textContent).toBe("");
  });

  it("返回 null 时不占位；出错只影响这一块；没有运行时（独立窗口）不显示", async () => {
    let fail = true;
    await act(async () => {
      context.views.registerEntityPanel({ id: "empty", kinds: ["card"], component: () => null });
      context.views.registerEntityPanel({
        id: "broken",
        kinds: ["card"],
        component: () => {
          if (fail) throw new Error("读取失败");
          return <p>恢复了</p>;
        },
      });
    });
    await render({ kind: "card", id: "1" });
    expect(
      container.querySelector('[data-plugin-entity-panel="plugin:author.q:empty"]')?.className
    ).toContain("empty:hidden");
    expect(container.textContent).toContain("插件区块出错了：读取失败");
    fail = false;
    await act(async () =>
      [...container.querySelectorAll("button")].find(b => b.textContent === "重试")?.click()
    );
    expect(container.textContent).toContain("恢复了");
    await render({ kind: "card", id: "1" }, false);
    expect(container.textContent).toBe("");
    await render(null);
    expect(container.textContent).toBe("");
  });
});
