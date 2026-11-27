import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { defineI18n, definePlugin, type PluginContext } from "@tau/plugins";
import { createMemoryStorage } from "@tau/plugins/host";
import { createPluginEnvironmentStore } from "@tau/plugins/environment-host";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import { DesktopPluginRuntime } from "@/app/plugins/runtime";
import { PluginRuntimeContext } from "@/app/plugins/context";
import { PluginActionsMenu } from "@/app/plugins/action-menu";
import { Sidebar } from "@/app/Sidebar";
import { useShellStore } from "@/app/shellStore";
import { PageProvider, usePage } from "@/page/PageProvider";
import { PageHost } from "@/page/PageHost";
import { definePage } from "@/page/definePage";
import { TaskStage } from "@/features/vibe-learning/views/VibeLearningView/stage/TaskStage";
import type { VLTask } from "@/features/vibe-learning/views/VibeLearningView/tasks/store";
import "../pages/plugin-page.page";

vi.mock("@/app/navSlots", () => ({
  NAV_BADGE_SLOTS: {},
  NAV_CHILDREN_SLOTS: {},
  useNavChildrenContent: () => ({}),
}));
vi.mock("@/app/WindowControls", () => ({ MacTrafficLights: () => null }));
vi.mock("@/app/useFullScreen", () => ({ useFullScreen: () => false }));
vi.mock("@/features/notifications/notify", () => ({ appNotify: vi.fn() }));

definePage({ key: "home", label: "Home", params: {}, component: () => null });

it("公开声明经桌面导航与菜单刷新仍保留页面草稿、打开菜单、任务及owner身份", async () => {
  const environment = createPluginEnvironmentStore({
    platform: "desktop",
    locale: "zh-CN",
    input: { coarsePointer: false, finePointer: true },
  });
  const target = { kind: "card" as const, id: "raw-card" };
  const activations: string[] = [],
    executions: unknown[] = [],
    phases: string[] = [];
  const contexts = new Map<string, PluginContext>();
  let pageMounts = 0;
  function PluginPage() {
    useEffect(() => {
      pageMounts++;
    }, []);
    return <input data-plugin-draft defaultValue="原用户草稿" />;
  }
  const task: VLTask = {
    id: "raw-task",
    projectId: 7,
    kind: "plugin",
    title: "原AI任务标题",
    plugin: { pluginId: "owner.a", kind: "episode", entityId: 12, label: "原任务快照名" },
    status: "succeeded",
    phase: "原插件阶段",
    phaseSource: "plugin",
    startedAt: 1,
    finishedAt: 2,
    turns: [],
    output: "原AI正文",
    outputTokens: 0,
    resourceNames: ["原资料名"],
  };
  const originalTask = JSON.stringify(task);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(["workspace", "preferences"], { disabledFeatures: [], onboarding: "done" });
  let runtime: DesktopPluginRuntime | undefined;
  const noop = vi.fn();
  function App() {
    const { navigator, state } = usePage();
    runtime ??= new DesktopPluginRuntime({
      environmentSource: environment,
      workspaceId: "locale",
      storage: createMemoryStorage(),
      navigator,
      plugins: [],
    });
    return (
      <PluginRuntimeContext.Provider value={runtime}>
        <Sidebar resizing={false} />
        <PageHost state={state} />
        <PluginActionsMenu target={target} trigger={<button data-action-trigger>Actions</button>} />
        <section data-task>
          <TaskStage task={task} chatOpen={false} onToggleChat={noop} onClose={noop} />
        </section>
      </PluginRuntimeContext.Provider>
    );
  }
  const getRuntime = () => {
    if (!runtime) throw new Error("Missing runtime");
    return runtime;
  };
  try {
    useShellStore.setState({ sidebarCollapsed: false, navSectionCollapsed: {} });
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <PageProvider initialKey="home">
            <App />
          </PageProvider>
        </QueryClientProvider>
      )
    );
    for (const id of ["owner.a", "owner.b"]) {
      const resources = Object.fromEntries(
        ["zh-CN", "zh-TW", "en-US"].map(locale => [
          locale,
          {
            nav: id + "/" + locale + "/nav",
            item: id + "/" + locale + "/item",
            action: id + "/" + locale + "/action",
            add: id + "/" + locale + "/add",
            output: id + "/" + locale + "/output",
          },
        ])
      );
      await act(async () => {
        getRuntime().host.registerTrusted(
          definePlugin({
            id,
            name: id,
            version: "1.0.0",
            i18n: defineI18n({ fallbackLocale: "zh-CN", resources }),
            create: () => ({
              activate(context) {
                contexts.set(id, context);
                activations.push(id);
                const ref = (key: string) => ({ kind: "i18n" as const, key });
                const page = context.pages.register({
                  id: "page",
                  title: "原页面标题",
                  component: PluginPage,
                });
                context.navigation.registerEntry({ id: "nav", title: ref("nav"), page });
                const item = context.sidebar.registerItem({ id: "item", title: ref("item"), page });
                item.update({
                  children: [
                    {
                      id: "user-group",
                      title: "原中文用户组名",
                      params: { group: "raw-group" },
                      menu: [
                        {
                          title: ref("action"),
                          run() {
                            executions.push("submenu/" + id);
                          },
                        },
                      ],
                    },
                  ],
                  action: {
                    title: ref("add"),
                    run() {
                      executions.push("add/" + id);
                    },
                  },
                });
                context.actions.register({
                  id: "action",
                  title: ref("action"),
                  targets: ["card"],
                  run(value) {
                    executions.push(value);
                  },
                });
                context.notebooks.registerOutput({
                  id: "output",
                  kind: "episode",
                  title: ref("output"),
                  view: () => null,
                  async prepare() {
                    phases.push("prepare");
                    return { entity: "12", title: "原AI标题", instructions: "原AI要求" };
                  },
                  async complete() {
                    phases.push("complete");
                  },
                });
              },
            }),
          })
        );
        await getRuntime().host.enable(id);
      });
    }
    const context = contexts.get("owner.a");
    if (!context) throw new Error("Missing owner");
    const findButton = (name: string) =>
      [...container.querySelectorAll<HTMLButtonElement>("button")].find(
        button => button.getAttribute("aria-label") === name || button.textContent === name
      );
    const item = findButton(context.i18n.t("item"));
    if (!item) throw new Error("Missing sidebar item");
    await act(async () => item.click());
    const draft = container.querySelector<HTMLInputElement>("[data-plugin-draft]");
    if (!draft) throw new Error("Missing page input");
    draft.value = "未提交草稿";
    draft.setSelectionRange(1, 4, "backward");
    const trigger = container.querySelector<HTMLButtonElement>("[data-action-trigger]");
    if (!trigger) throw new Error("Missing trigger");
    await act(async () => trigger.click());
    const menu = document.querySelector('[role="menu"]:not([inert])');
    if (!menu) throw new Error("Missing actual menu");
    const actionItem = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      node => node.textContent === context.i18n.t("action")
    );
    if (!actionItem) throw new Error("Missing owner menu action");
    const registered = getRuntime().listActions("card")[0],
      output = getRuntime().findNotebookOutput("owner.a", "episode");
    const state = getRuntime()
      .listSidebar()
      .items.find(entry => entry.id.endsWith(":item"))
      ?.getState();
    for (const locale of ["en-US", "zh-TW"] as const) {
      await act(async () => {
        environment.update({ locale });
        desktopLocaleSource.setLocale(locale);
      });
      expect(findButton(context.i18n.t("nav"))).toBeDefined();
      expect(findButton(context.i18n.t("item"))).toBe(item);
      expect(findButton(context.i18n.t("add"))).toBeDefined();
      expect(container.querySelector("[data-plugin-draft]")).toBe(draft);
      expect(draft.value).toBe("未提交草稿");
      expect([draft.selectionStart, draft.selectionEnd, draft.selectionDirection]).toEqual([
        1,
        4,
        "backward",
      ]);
      expect(document.querySelector('[role="menu"]:not([inert])')).toBe(menu);
      expect(actionItem.textContent).toBe(context.i18n.t("action"));
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      expect(getRuntime().listActions("card")[0]).toBe(registered);
      expect(getRuntime().findNotebookOutput("owner.a", "episode")).toBe(output);
      expect(
        getRuntime()
          .listSidebar()
          .items.find(entry => entry.id.endsWith(":item"))
          ?.getState()
      ).toBe(state);
      expect(container.querySelector("[data-task]")?.textContent).toContain(
        context.i18n.t("output")
      );
      expect(JSON.stringify(task)).toBe(originalTask);
      expect(pageMounts).toBe(1);
      expect(activations).toEqual(["owner.a", "owner.b"]);
      expect(executions).toEqual([]);
      expect(phases).toEqual([]);
    }
    await act(async () => actionItem.click());
    expect(executions).toEqual([target]);
    await act(async () => getRuntime().host.disable("owner.a"));
    expect(container.querySelector("[data-task]")?.textContent).toContain(task.plugin?.label);
    expect(JSON.stringify(task)).toBe(originalTask);
    await expect(getRuntime().runAction(registered, target)).rejects.toThrow();
    expect(executions).toEqual([target]);
  } finally {
    await act(async () => {
      await runtime?.dispose();
      root.unmount();
    });
    client.clear();
    container.remove();
    desktopLocaleSource.setLocale("zh-CN");
  }
});
