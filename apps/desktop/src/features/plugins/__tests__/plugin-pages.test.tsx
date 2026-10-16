import { act, StrictMode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createBrowserStorage, createMemoryStorage, type StorageAdapter } from "@tau/plugins/host";
import { definePlugin, type PluginDefinition, type PluginSettingsHandle } from "@tau/plugins";
import { PluginRuntimeContext } from "@/app/plugins/context";
import { DesktopPluginRuntime, PLUGIN_DETAIL_KEY } from "@/app/plugins/runtime";
import { PageProvider, usePage, type Navigator } from "@/page/PageProvider";
import { PageHost } from "@/page/PageHost";
import { settingsPlugin } from "./fixtures/example/settingsPlugin";
import "../pages/plugins.page";
import "../pages/plugin-detail.page";

vi.mock("@/commands/plugin-local", async importOriginal => ({
  ...(await importOriginal<typeof import("@/commands/plugin-local")>()),
  fetchPluginCatalog: vi.fn(async () => ({ items: [] })),
}));
vi.mock("@/commands/extra", () => ({ openExternal: vi.fn() }));

const id = settingsPlugin.id;
const commandId = `${id}:open-settings`;
let root: Root;
let container: HTMLDivElement;
let runtime: DesktopPluginRuntime;
let navigator: Navigator | undefined;

function createRuntime(
  workspaceId = "A",
  storage: StorageAdapter = createBrowserStorage(localStorage),
  plugins: readonly PluginDefinition[] = [settingsPlugin]
) {
  return new DesktopPluginRuntime({
    workspaceId,
    storage,
    plugins,
    navigator: { push: (...args) => navigator?.push(...args) },
    openSettings: key =>
      navigator?.push(PLUGIN_DETAIL_KEY, {
        pluginId: key.split(":")[1],
        tab: "settings",
        section: key,
      }),
  });
}
function Host() {
  const page = usePage();
  useEffect(() => {
    navigator = page.navigator;
  }, [page.navigator]);
  return <PageHost state={page.state} />;
}
function register(definition: PluginDefinition) {
  act(() => runtime.host.registerTrusted(definition));
}
async function render() {
  await act(async () =>
    root.render(
      <StrictMode>
        <QueryClientProvider client={new QueryClient()}>
          <PageProvider initialKey="plugins">
            <PluginRuntimeContext.Provider value={runtime}>
              <Host />
            </PluginRuntimeContext.Provider>
          </PageProvider>
        </QueryClientProvider>
      </StrictMode>
    )
  );
  await settle();
}
async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
  });
}
function page() {
  return container.querySelector('[data-page-active=""]') ?? container;
}
/** 插件自己的设置开关，位于设置标签的分组 section 内，区别于页头启停开关。 */
function toggle() {
  const button = page().querySelector<HTMLButtonElement>('section[aria-label] [role="switch"]');
  if (!button) throw new Error("设置开关未挂载");
  return button;
}
async function click(label: string) {
  const button = [...page().querySelectorAll("button")].find(item => item.textContent === label);
  if (!button) throw new Error(`按钮不存在：${label}`);
  await act(async () => button.click());
  await settle();
}
function enabledSwitch(name: string, enabled: boolean) {
  return page().querySelector<HTMLButtonElement>(
    `[aria-label="${enabled ? "停用" : "启用"} ${name}"]`
  );
}
async function setEnabled(name: string, enabled: boolean) {
  const button = enabledSwitch(name, !enabled);
  if (!button) throw new Error(`缺少开关：${name}`);
  await act(async () => button.click());
  await settle();
}
async function openDetail(pluginId: string, tab = "settings") {
  await act(async () => navigator?.push(PLUGIN_DETAIL_KEY, { pluginId, tab }));
  await settle();
}
async function openInstalled() {
  await act(async () => navigator?.push("plugins", { tab: "installed" }));
  await settle();
}
async function open() {
  await act(async () => {
    await runtime.host.enable(id);
    await runtime.host.executeCommand(commandId);
  });
  await settle();
}
beforeEach(async () => {
  localStorage.clear();
  navigator = undefined;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  runtime = createRuntime();
  await render();
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await runtime.dispose();
  });
  container.remove();
  vi.restoreAllMocks();
});

it("激活挂起后详情显示重启要求，重新进入详情仍不能启用", async () => {
  const plugin = definePlugin({
    id: "example.hanging-ui",
    name: "挂起插件",
    version: "1.0.0",
    create: () => ({ activate: () => new Promise(() => undefined) }),
  });
  register(plugin);
  await openDetail(plugin.id, "readme");
  vi.useFakeTimers();
  try {
    const button = enabledSwitch(plugin.name, false);
    if (!button) throw new Error("缺少启用开关");
    await act(async () => button.click());
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(page().textContent).toContain("请重启应用后再启用");
    expect(button.disabled).toBe(true);
  } finally {
    vi.useRealTimers();
  }
  await openInstalled();
  expect(page().textContent).toContain("请重启应用后再启用");
  expect(enabledSwitch(plugin.name, false)?.disabled).toBe(true);
  await openDetail(plugin.id, "readme");
  expect(enabledSwitch(plugin.name, false)?.disabled).toBe(true);
  expect(runtime.host.listPlugins().find(item => item.id === plugin.id)?.error).toContain(
    "激活超时"
  );
});

it("命令打开详情设置标签、保存、停用清理分区与 Portal，再启用恢复", async () => {
  expect(page().textContent).not.toContain("阅读偏好（示例）");
  await open();
  expect(page().querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("设置");
  await act(async () => toggle().click());
  await settle();
  expect(toggle().getAttribute("aria-checked")).toBe("true");
  expect(page().querySelector('[role="status"]')?.textContent).toBe("已保存");
  await click("设置说明");
  expect(document.querySelector('[role="dialog"][aria-labelledby]')).not.toBeNull();
  const previous = runtime.listSettings()[0].context;
  await act(async () => runtime.host.disable(id));
  expect(page().querySelector('section[aria-label] [role="switch"]')).toBeNull();
  expect(page().textContent).not.toContain("阅读偏好（示例）");
  expect(page().textContent).toContain("插件设置暂不可用");
  expect(document.querySelector('[role="dialog"][aria-labelledby]')).toBeNull();
  await expect(previous.storage.set("reading-hints", false)).rejects.toThrow();
  await act(async () => runtime.host.enable(id));
  await settle();
  expect(toggle().getAttribute("aria-checked")).toBe("true");
  expect(runtime.listSettings()).toHaveLength(1);
});

it("离开详情再返回读取最新持久值，子浮层随页面隐藏清理", async () => {
  await open();
  await click("设置说明");
  await openInstalled();
  expect(document.querySelector('[role="dialog"][aria-labelledby]')).toBeNull();
  await runtime.listSettings()[0].context.storage.set("reading-hints", true);
  await act(async () => navigator?.back());
  await settle();
  await click("重新读取设置").catch(() => undefined);
  expect(toggle().getAttribute("aria-checked")).toBe("true");
});

it("重建宿主仍能读取本机设置，切换工作区不串值", async () => {
  await open();
  await act(async () => toggle().click());
  await settle();
  const oldContext = runtime.listSettings()[0].context;
  await act(async () => runtime.dispose());
  runtime = createRuntime("B");
  await render();
  await open();
  expect(toggle().getAttribute("aria-checked")).toBe("false");
  await expect(oldContext.storage.get("reading-hints")).rejects.toThrow();
  await act(async () => runtime.dispose());
  runtime = createRuntime("A");
  await render();
  await open();
  expect(toggle().getAttribute("aria-checked")).toBe("true");
});

it("读取损坏数据与保存失败均不伪报成功，修复后可重试", async () => {
  const key = `tau-plugin-prefs:${JSON.stringify(["A", id, "reading-hints"])}`;
  localStorage.setItem(key, JSON.stringify("损坏的设置"));
  await open();
  expect(toggle().disabled).toBe(true);
  expect(page().querySelector('[role="alert"]')?.textContent).toContain("格式无效");
  localStorage.setItem(key, "false");
  await click("重新读取设置");
  expect(toggle().disabled).toBe(false);
  const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("存储空间不足");
  });
  await act(async () => toggle().click());
  await settle();
  expect(toggle().getAttribute("aria-checked")).toBe("false");
  expect(page().querySelector('[role="alert"]')?.textContent).toContain("存储空间不足");
  expect(page().querySelector('[role="status"]')?.textContent).not.toBe("已保存");
  set.mockRestore();
  await act(async () => toggle().click());
  await settle();
  expect(toggle().getAttribute("aria-checked")).toBe("true");
  expect(localStorage.getItem(key)).toBe("true");
});

it("停用期间未提交的写入被拒绝，新实例不显示旧请求结果", async () => {
  await act(async () => runtime.dispose());
  const base = createMemoryStorage();
  let release!: () => void;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  runtime = createRuntime("A", {
    ...base,
    async set(scope, key, value) {
      await pending;
      await base.set(scope, key, value);
    },
  });
  await render();
  await open();
  try {
    await act(async () => toggle().click());
    await settle();
    expect(toggle().disabled).toBe(true);
    expect(page().textContent).toContain("正在保存");
    await act(async () => runtime.host.disable(id));
    await act(async () => runtime.host.enable(id));
    await settle();
    await act(async () => release());
    await settle();
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(page().querySelector('[role="alert"]')).toBeNull();
    expect(await runtime.listSettings()[0].context.storage.get("reading-hints")).toBeUndefined();
  } finally {
    release();
  }
});

it("旧读取尚未完成时重新启用，新的分区不会复用旧查询缓存", async () => {
  await act(async () => runtime.dispose());
  const base = createMemoryStorage();
  let first = true;
  let release!: () => void;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  runtime = createRuntime("A", {
    ...base,
    async get(scope, key) {
      if (first) {
        first = false;
        await pending;
        return true;
      }
      return base.get(scope, key);
    },
  });
  await render();
  await open();
  try {
    expect(toggle().disabled).toBe(true);
    await act(async () => runtime.host.disable(id));
    await act(async () => runtime.host.enable(id));
    await settle();
    expect(toggle().disabled).toBe(false);
    await act(async () => release());
    await settle();
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(page().querySelector('[role="alert"]')).toBeNull();
  } finally {
    release();
  }
});

it("分区渲染异常被隔离，停用再启用后可恢复", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  let fail = true;
  let handle!: PluginSettingsHandle;
  register(
    definePlugin({
      id: "broken",
      name: "故障示例",
      version: "1",
      create: () => ({
        activate(ctx) {
          handle = ctx.settings.register({
            id: "reading",
            title: "故障分区",
            component: () => {
              if (fail) throw new Error("故障");
              return <div>分区已恢复</div>;
            },
          });
        },
      }),
    })
  );
  await act(async () => {
    await runtime.host.enable("broken");
    await handle.open();
  });
  expect(page().textContent).toContain("插件设置渲染失败");
  await act(async () => runtime.host.disable("broken"));
  fail = false;
  await act(async () => runtime.host.enable("broken"));
  expect(page().textContent).toContain("分区已恢复");
});

it("相同局部 ID 按插件区分，重复注册拒绝，单项注销不影响另一插件", async () => {
  await open();
  let handle!: PluginSettingsHandle;
  register(
    definePlugin({
      id: "other",
      name: "另一个插件",
      version: "1",
      create: () => ({
        activate(ctx) {
          const def = {
            id: "reading",
            title: "另一分区",
            component: () => <div>另一插件的设置</div>,
          };
          handle = ctx.settings.register(def);
          expect(() => ctx.settings.register(def)).toThrow("已注册");
        },
      }),
    })
  );
  await act(async () => {
    await runtime.host.enable("other");
    await handle.open();
  });
  expect(runtime.listSettings()).toHaveLength(2);
  expect(page().textContent).toContain("另一插件的设置");
  await act(async () => handle.dispose());
  expect(runtime.listSettings()).toHaveLength(1);
  expect(page().textContent).toContain("插件设置暂不可用");
  await expect(handle.open()).rejects.toThrow();
  await openDetail(id);
  expect(toggle().disabled).toBe(false);
});

it("插件异步停用尚未完成时，设置组件与导航已经撤销", async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  let handle!: PluginSettingsHandle;
  register(
    definePlugin({
      id: "delayed",
      name: "延迟停用",
      version: "1",
      create: () => ({
        activate(ctx) {
          handle = ctx.settings.register({
            id: "section",
            title: "延迟分区",
            component: () => <div>延迟插件内容</div>,
          });
        },
        deactivate: () => pending,
      }),
    })
  );
  await act(async () => {
    await runtime.host.enable("delayed");
    await handle.open();
  });
  let stopping!: Promise<void>;
  try {
    await act(async () => {
      stopping = runtime.host.disable("delayed");
    });
    expect(page().textContent).not.toContain("延迟插件内容");
    expect(page().textContent).not.toContain("延迟分区");
    expect(page().textContent).toContain("插件设置暂不可用");
    await expect(handle.open()).rejects.toThrow();
  } finally {
    await act(async () => {
      release();
      await stopping;
    });
  }
});

it("已安装列表在停用后仍可管理，经详情重新启用恢复保存值", async () => {
  await openInstalled();
  expect(page().textContent).toContain("自定义设置示例");
  expect(page().textContent).toContain("已停用");
  await setEnabled(settingsPlugin.name, true);
  await openDetail(id);
  await act(async () => toggle().click());
  await settle();
  await setEnabled(settingsPlugin.name, false);
  expect(page().querySelector('section[aria-label] [role="switch"]')).toBeNull();
  expect(page().querySelector("h1")?.textContent).toBe("自定义设置示例");
  await openInstalled();
  expect(page().textContent).toContain("已停用");
  await openDetail(id);
  await setEnabled(settingsPlugin.name, true);
  expect(toggle().getAttribute("aria-checked")).toBe("true");
  expect(runtime.listSettings()).toHaveLength(1);
});

it("多分组只出现在插件详情，原 open 仍准确定位指定分组", async () => {
  let second!: PluginSettingsHandle;
  register(
    definePlugin({
      id: "grouped",
      name: "分组插件",
      version: "1",
      create: () => ({
        activate(ctx) {
          ctx.settings.register({
            id: "first",
            title: "基础偏好",
            component: () => <div>基础偏好内容</div>,
          });
          second = ctx.settings.register({
            id: "second",
            title: "高级偏好",
            component: () => <div>高级偏好内容</div>,
          });
        },
      }),
    })
  );
  await act(async () => {
    await runtime.host.enable("grouped");
    await second.open();
  });
  expect(page().textContent).toContain("高级偏好内容");
  expect(
    page().querySelector('nav[aria-label="插件设置分组"] [aria-current="page"]')?.textContent
  ).toBe("高级偏好");
  await click("基础偏好");
  expect(page().textContent).toContain("基础偏好内容");
  expect(page().textContent).not.toContain("高级偏好内容");
  await setEnabled("分组插件", false);
  expect(page().querySelector('nav[aria-label="插件设置分组"]')).toBeNull();
  await setEnabled("分组插件", true);
  expect(page().textContent).toContain("基础偏好内容");
});

it("没有设置的插件也能管理，打开详情不执行插件代码，注销后提示不可用", async () => {
  const activate = vi.fn();
  register(
    definePlugin({ id: "plain", name: "无设置插件", version: "2", create: () => ({ activate }) })
  );
  await openDetail("plain");
  expect(activate).not.toHaveBeenCalled();
  await setEnabled("无设置插件", true);
  expect(activate).toHaveBeenCalledTimes(1);
  expect(page().textContent).toContain("此插件没有自定义设置");
  await act(async () => runtime.host.unregister("plain"));
  await settle();
  expect(page().textContent).toContain("此插件已不可用");
  await click("返回插件列表");
  expect(page().textContent).toContain("自定义设置示例");
});

it("激活失败后管理页保留错误与重试入口，不遗留半注册设置", async () => {
  let fail = true;
  register(
    definePlugin({
      id: "retry",
      name: "可重试插件",
      version: "1",
      create: () => ({
        activate(ctx) {
          ctx.settings.register({
            id: "main",
            title: "重试设置",
            component: () => <div>重试设置已恢复</div>,
          });
          if (fail) throw new Error("初始化失败");
        },
      }),
    })
  );
  await openDetail("retry");
  await setEnabled("可重试插件", true);
  expect(page().querySelector('[role="alert"]')?.textContent).toBe("初始化失败");
  expect(runtime.listSettings()).toEqual([]);
  fail = false;
  await setEnabled("可重试插件", true);
  expect(page().querySelector('[role="alert"]')).toBeNull();
  expect(page().textContent).toContain("重试设置已恢复");
});
