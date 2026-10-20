/**
 * 独立「每周回顾」发布包经桌面运行时加载：真实数据适配、授权代理与授权弹窗串起
 * 「首次打开只询问一次 → 始终允许 → 显示汇总 → 业务事件触发刷新」的完整路径；
 * 正文组件与宿主动作经共享模块注入，编辑器本体用替身记录宿主补全的参数。
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createMemoryStorage } from "@tau/plugins/host";
import { pluginArtifact } from "../../../test-fixtures/plugin-packages";
import { DesktopPluginRuntime } from "@/app/plugins/runtime";
import { registerPluginPackage } from "@/app/plugins/package-loader";
import { sharedPluginModules } from "@/app/plugins/shared-modules";
import { createDesktopData } from "@/app/plugins/data";
import { createDesktopEvents } from "@/app/plugins/events";
import { createDesktopApp } from "@/app/plugins/app";
import { DesktopPermissionBroker, usePluginPermissionUi } from "@/app/plugins/permissions";
import { PluginPermissionPrompt } from "../permissions/PluginPermissionPrompt";
import { PluginComponentScope } from "@/app/plugins/content-components";
import { usePluginActionUi } from "@/app/plugins/app";
import useSettingStore from "@/stores/useSettingStore";

const openEntity = vi.hoisted(() => vi.fn());
vi.mock("@/services/open-content", () => ({ openEntity }));
const editorProps = vi.hoisted(() => vi.fn());
vi.mock("@/components/ContentEditor", () => ({
  default: (props: Record<string, unknown>) => {
    editorProps(props);
    return <div>正文编辑器</div>;
  },
}));
// 只读预览用一个只有段落的 kit，不装载宿主扩展
vi.mock("@/services/editorKit", async () => {
  const { createEditorKit } = await import("@tau/editor");
  const kit = createEditorKit({ extensions: [] });
  return { getContentKit: () => kit };
});
const electron = vi.hoisted(() => ({
  invoke: vi.fn(async (..._args: unknown[]) => undefined as unknown),
  listeners: new Map<string, (...args: unknown[]) => void>(),
}));
vi.mock("@/electron", () => ({
  invoke: electron.invoke,
  isElectron: true,
  platform: "darwin",
  on: (channel: string, listener: (...args: unknown[]) => void) =>
    electron.listeners.set(channel, listener),
  off: (channel: string) => electron.listeners.delete(channel),
}));

const DATABASE = "data.db";
let cardTitle = "第一张卡";
const todo = {
  taskRef: { kind: "todo", todoId: 4, createdAt: 9 },
  revision: "r1",
  title: "交周报",
  completed: false,
  archived: false,
  dueAt: null,
  groupId: null,
  writable: true,
};

function respond(channel: unknown, ...args: unknown[]) {
  switch (channel) {
    case "module-init:init-module":
      return { success: true };
    case "plugin-permissions:snapshot":
      return {};
    case "plugin-data:exists":
      return true;
    case "plugin-data:content":
      return {
        contentId: 9,
        createdAt: 1,
        updatedAt: 1,
        revision: "u:1",
        wordCount: 5,
        nodes: [{ type: "paragraph", children: [{ text: "卡片正文开头" }] }],
        owners: ["card"],
        pluginOwners: [],
      };
    case "plugin-data:get":
      return { entity: "card", id: 1, title: cardTitle };
    case "entity:locate":
      return { kind: "card", id: 1 };
    case "plugin-data:query": {
      const { entity } = args[0] as { entity: string };
      return {
        items:
          entity === "card"
            ? [
                {
                  entity,
                  id: 1,
                  revision: "1",
                  title: cardTitle,
                  tags: ["读书"],
                  pinned: false,
                  contentId: 9,
                  contentCreatedAt: 1,
                  wordCount: 3,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                },
              ]
            : [],
      };
    }
    case "task-assistant:read": {
      const [name] = args as [string];
      return {
        items: name === "query_todos" ? [todo] : [],
        hasMore: false,
        nextCursor: null,
        incomplete: false,
        warnings: [],
      };
    }
    case "task-assistant:preflight":
      return args[1];
    case "task-assistant:write":
      todo.completed = true;
      todo.revision = "r2";
      return { requestId: "x", status: "succeeded", result: { ...todo } };
    default:
      return undefined;
  }
}

const runtimes: DesktopPluginRuntime[] = [];
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.dispose();
  electron.invoke.mockReset();
  electron.listeners.clear();
});

describe("每周回顾插件", () => {
  // 正文组件的实现按需加载，预热后在一次提交内就绪
  beforeAll(() => import("@/app/plugins/content-components-view"), 30_000);
  it("首次打开只弹一次授权，允许后显示汇总与卡片预览，卡片更新后自动刷新；勾选待办时再询问修改权限；点卡片在右侧编辑，打开原处与演示交给宿主", async () => {
    useSettingStore.setState(state => ({
      setting: { ...state.setting, database: { ...state.setting.database, active: DATABASE } },
    }));
    electron.invoke.mockImplementation(async (channel: unknown, ...args: unknown[]) =>
      respond(channel, ...args)
    );
    const runtime = new DesktopPluginRuntime({
      workspaceId: "w",
      storage: createMemoryStorage(),
      navigator: { push: vi.fn() },
      plugins: [],
      data: createDesktopData(DATABASE),
      events: createDesktopEvents(DATABASE),
      app: createDesktopApp(DATABASE),
      permissions: new DesktopPermissionBroker("w", () => true),
    });
    runtimes.push(runtime);
    registerPluginPackage(
      runtime.host,
      pluginArtifact("tau.weekly-review"),
      async () => sharedPluginModules
    );
    await runtime.host.enable("tau.weekly-review");
    expect(runtime.host.listPlugins()[0].permissions).toContain("todos:write");
    expect(runtime.listSidebar().items).toMatchObject([{ title: "每周回顾", group: "daily" }]);

    const page = runtime.getPage("tau.weekly-review", "review");
    if (!page) throw new Error("页面未注册");
    const Component = page.definition.component;
    const host = document.createElement("div");
    document.body.append(host);
    const view = createRoot(host);
    try {
      await act(async () =>
        view.render(
          <QueryClientProvider client={new QueryClient()}>
            <PluginComponentScope context={page.context}>
              <Component context={page.context} params={{}} />
            </PluginComponentScope>
            <PluginPermissionPrompt />
          </QueryClientProvider>
        )
      );
      await act(async () => new Promise(resolve => setTimeout(resolve, 30)));
      const prompts = usePluginPermissionUi.getState().prompts;
      expect(prompts).toHaveLength(1);
      // 打开时只询问读取权限，修改待办的权限等到第一次勾选
      expect(prompts[0].permissions).toEqual([
        "cards:read",
        "articles:read",
        "documents:read",
        "todos:read",
        "calendar:read",
      ]);
      expect(document.body.textContent).toContain("读取项目文档");

      const allow = [...document.querySelectorAll("button")].find(
        button => button.textContent === "始终允许"
      );
      await act(async () => allow?.click());
      await act(async () => new Promise(resolve => setTimeout(resolve, 30)));
      expect(usePluginPermissionUi.getState().prompts).toHaveLength(0);
      expect(
        electron.invoke.mock.calls.filter(([channel]) => channel === "plugin-permissions:set")
      ).toHaveLength(5);
      expect(host.textContent).toContain("第一张卡");
      expect(host.textContent).toContain("#读书");
      // 卡片列表的正文预览：读取权限已获准，直接显示开头
      await act(async () => new Promise(resolve => setTimeout(resolve, 100)));
      expect(host.textContent).toContain("卡片正文开头");

      cardTitle = "改过的卡";
      await act(async () => {
        electron.listeners.get("domain-events")?.(
          {},
          { databaseName: DATABASE, events: [{ type: "card.updated", id: 1, at: Date.now() }] }
        );
        await new Promise(resolve => setTimeout(resolve, 30));
      });
      expect(host.textContent).toContain("改过的卡");

      const checkbox = host.querySelector<HTMLInputElement>("input[type=checkbox]");
      expect(checkbox?.checked).toBe(false);
      await act(async () => checkbox?.click());
      await act(async () => new Promise(resolve => setTimeout(resolve, 30)));
      expect(usePluginPermissionUi.getState().prompts[0]?.permissions).toEqual(["todos:write"]);
      const once = [...document.querySelectorAll("button")].find(
        button => button.textContent === "仅这次"
      );
      await act(async () => once?.click());
      await act(async () => new Promise(resolve => setTimeout(resolve, 30)));
      const write = electron.invoke.mock.calls.find(
        ([channel]) => channel === "task-assistant:write"
      );
      expect(write?.[1]).toBe("set_todo_completed");
      expect(write?.[2]).toMatchObject({ revision: "r1", completed: true });
      expect(write?.[4]).toBe("plugin:tau.weekly-review");
      expect(host.querySelector<HTMLInputElement>("input[type=checkbox]")?.checked).toBe(true);

      const button = (label: string) =>
        [...document.querySelectorAll<HTMLElement>("button, [role=menuitem]")].find(
          item => item.textContent === label
        );
      const settle = () => act(async () => new Promise(resolve => setTimeout(resolve, 60)));

      // 点卡片在右侧打开正文：修改需要写入权限，挂载时不弹窗，点「允许访问」才询问
      await act(async () => button("改过的卡")?.click());
      await settle();
      expect(openEntity).not.toHaveBeenCalled();
      expect(host.textContent).toContain("插件需要你的允许才能编辑这段内容");
      expect(usePluginPermissionUi.getState().prompts).toHaveLength(0);
      await act(async () => button("允许访问")?.click());
      await settle();
      expect(usePluginPermissionUi.getState().prompts[0]?.permissions).toEqual(["cards:write"]);
      await act(async () => button("始终允许")?.click());
      await settle();
      expect(host.textContent).toContain("正文编辑器");
      expect(editorProps).toHaveBeenLastCalledWith(
        expect.objectContaining({
          contentId: 9,
          source: { sourceType: "card", sourceId: 1 },
          editingContext: { entityType: "card", entityId: 1 },
          readonly: false,
        })
      );

      await act(async () => button("打开原处")?.click());
      await settle();
      expect(openEntity).toHaveBeenCalledWith({ kind: "card", id: 1 });

      // ⋯ → 演示：交给宿主动作，带上实体标题与正文
      await act(async () => document.querySelector<HTMLElement>("[aria-label=更多操作]")?.click());
      await settle();
      await act(async () => button("演示")?.click());
      await settle();
      expect(usePluginActionUi.getState().request).toMatchObject({
        action: "present",
        title: "改过的卡",
        contentId: 9,
        plugin: { id: "tau.weekly-review" },
      });
    } finally {
      act(() => view.unmount());
      host.remove();
    }
  });
});
