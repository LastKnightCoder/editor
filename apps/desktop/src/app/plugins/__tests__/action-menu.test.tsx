import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { definePlugin, type PluginContext } from "@tau/plugins";
import { createMemoryStorage } from "@tau/plugins/host";
import { Menu } from "@tau/ui";
import { DesktopPluginRuntime } from "@/app/plugins/runtime";
import { PluginRuntimeContext } from "@/app/plugins/context";
import { PluginActionMenuItems } from "@/app/plugins/action-menu";

const notify = vi.hoisted(() => vi.fn());
vi.mock("@/features/notifications/notify", () => ({ appNotify: notify }));

describe("插件对象动作", () => {
  let container: HTMLDivElement;
  let root: Root;
  let runtime: DesktopPluginRuntime;
  let context!: PluginContext;
  const grantRefs = vi.fn(async () => {});

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    grantRefs.mockClear();
    notify.mockClear();
    runtime = new DesktopPluginRuntime({
      workspaceId: "actions",
      storage: createMemoryStorage(),
      navigator: { push: vi.fn() },
      plugins: [],
      grantRefs,
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
    document.body.innerHTML = "";
  });

  const render = (target = { kind: "card" as const, id: "7" }, withRuntime = true) =>
    act(async () => {
      const menu = (
        <Menu open trigger={<button type="button">更多</button>}>
          <Menu.Item>内置</Menu.Item>
          <PluginActionMenuItems target={target} />
          <Menu.Separator />
          <Menu.Item danger>删除</Menu.Item>
        </Menu>
      );
      root.render(
        withRuntime ? (
          <PluginRuntimeContext.Provider value={runtime}>{menu}</PluginRuntimeContext.Provider>
        ) : (
          menu
        )
      );
    });
  const items = () =>
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].map(el => el.textContent);
  const click = (label: string) =>
    act(async () =>
      [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
        .find(el => el.textContent === label)
        ?.click()
    );

  it("按目标类型列在内置项之后、删除之前；点击先登记引用再调用插件", async () => {
    const run = vi.fn();
    await act(async () => {
      context.actions.register({ id: "to-question", title: "转为问题", targets: ["card"], run });
      context.actions.register({ id: "summary", title: "总结", targets: ["article"], run });
    });
    await render();
    expect(items()).toEqual(["内置", "转为问题", "删除"]);
    expect(document.querySelectorAll('[role="separator"]')).toHaveLength(2);
    await click("转为问题");
    expect(grantRefs).toHaveBeenCalledWith("author.q", [{ kind: "card", id: "7" }]);
    expect(run).toHaveBeenCalledWith({ kind: "card", id: "7" });
    expect(grantRefs.mock.invocationCallOrder[0]).toBeLessThan(run.mock.invocationCallOrder[0]);
  });

  it("没有动作或没有插件运行时（独立窗口）时不加分隔线；插件出错只通知", async () => {
    await render();
    expect(items()).toEqual(["内置", "删除"]);
    expect(document.querySelectorAll('[role="separator"]')).toHaveLength(1);
    await act(async () => {
      context.actions.register({
        id: "broken",
        title: "坏的",
        targets: ["card"],
        run: async () => {
          throw new Error("插件故障");
        },
      });
    });
    await render(undefined, false);
    expect(items()).toEqual(["内置", "删除"]);
    await render();
    await click("坏的");
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "插件操作失败", body: "插件故障", tone: "danger" })
    );
    await act(async () => runtime.host.disable("author.q"));
    expect(items()).toEqual(["内置", "删除"]);
  });
});
