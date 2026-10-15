import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createBrowserStorage, createMemoryStorage, type StorageAdapter } from "@tau/plugins/host";
import { definePlugin, type PluginDefinition, type PluginSettingsHandle } from "@tau/plugins";
import { PluginRuntimeContext } from "@/app/plugins/context";
import { DesktopPluginRuntime } from "@/app/plugins/runtime";
import { useSettingsStore } from "@/app/settingsStore";
import { PageProvider } from "@/page/PageProvider";
import { definePage } from "@/page/definePage";
import { settingsPlugin } from "@/features/plugins/__tests__/fixtures/example/settingsPlugin";
import { SettingsScreen } from "../SettingsScreen";

vi.mock("../sections", async () => {
  const { PluginManagerView } = await import("@/features/plugins/views/PluginManagerView");
  const appearance = {
    key: "appearance",
    label: "外观",
    description: "内置外观",
    icon: () => null,
    component: () => <div>内置设置仍可用</div>,
  };
  return {
    SETTINGS_SECTIONS: [
      appearance,
      {
        key: "plugins",
        label: "插件",
        description: "插件管理",
        icon: () => null,
        component: PluginManagerView,
      },
    ],
    SETTINGS_GROUPS: [
      {
        label: "通用",
        sections: [
          appearance,
          {
            key: "plugins",
            label: "插件",
            description: "插件管理",
            icon: () => null,
            component: PluginManagerView,
          },
        ],
      },
    ],
  };
});
vi.mock("@/app/useFullScreen", () => ({ useFullScreen: () => false }));
vi.mock("@/app/WindowControls", () => ({
  MacTrafficLights: () => null,
  WindowControls: () => null,
}));

definePage({ key: "settings-test-home", label: "测试首页", params: {}, component: () => null });
const id = settingsPlugin.id;
const commandId = `${id}:open-settings`;
const settingKey = `plugin:${id}:reading` as const;
let root: Root;
let container: HTMLDivElement;
let runtime: DesktopPluginRuntime;

function createRuntime(
  workspaceId = "A",
  storage: StorageAdapter = createBrowserStorage(localStorage),
  plugins: readonly PluginDefinition[] = [settingsPlugin]
) {
  return new DesktopPluginRuntime({
    workspaceId,
    storage,
    plugins,
    navigator: { push: vi.fn() },
    openSettings: key => useSettingsStore.getState().openSettings(key),
  });
}
function register(definition: PluginDefinition) {
  act(() => runtime.host.registerTrusted(definition));
}
async function render() {
  await act(async () =>
    root.render(
      <StrictMode>
        <PageProvider initialKey="settings-test-home">
          <PluginRuntimeContext.Provider value={runtime}>
            <SettingsScreen />
          </PluginRuntimeContext.Provider>
        </PageProvider>
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
function toggle() {
  const button = container.querySelector<HTMLButtonElement>('[role="switch"]');
  if (!button) throw new Error("设置开关未挂载");
  return button;
}
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find(item => item.textContent === label);
  if (!button) throw new Error(`按钮不存在：${label}`);
  await act(async () => button.click());
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
  useSettingsStore.setState({ open: false, section: "appearance" });
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

it("激活挂起后管理显示重启要求，重新进入详情仍不能启用", async () => {
  const plugin = definePlugin({
    id: "example.hanging-ui",
    name: "挂起插件",
    version: "1.0.0",
    create: () => ({ activate: () => new Promise(() => undefined) }),
  });
  register(plugin);
  await act(async () => useSettingsStore.getState().openSettings(`plugin:${plugin.id}:`));
  await settle();
  vi.useFakeTimers();
  try {
    const button = container.querySelector<HTMLButtonElement>(`[aria-label="启用 ${plugin.name}"]`);
    if (!button) throw new Error("缺少启用按钮");
    await act(async () => button.click());
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(container.textContent).toContain("请重启应用后再启用");
    expect(button.disabled).toBe(true);
  } finally {
    vi.useRealTimers();
  }
  await click("返回插件列表");
  await click(plugin.name);
  expect(container.textContent).toContain("请重启应用后再启用");
  expect(
    container.querySelector<HTMLButtonElement>(`[aria-label="启用 ${plugin.name}"]`)?.disabled
  ).toBe(true);
  expect(runtime.host.listPlugins().find(item => item.id === plugin.id)?.error).toContain(
    "激活超时"
  );
});

it("实际设置窗口注册、保存、停用清理分区与 Portal，再启用恢复", async () => {
  expect(container.textContent).not.toContain("阅读偏好（示例）");
  await open();
  expect(useSettingsStore.getState()).toMatchObject({ open: true, section: settingKey });
  expect(container.querySelector('nav [aria-current="page"]')?.textContent).toBe("插件");
  await act(async () => toggle().click());
  await settle();
  expect(toggle().getAttribute("aria-checked")).toBe("true");
  expect(container.querySelector('[role="status"]')?.textContent).toBe("已保存");
  await click("设置说明");
  expect(document.querySelector('[role="dialog"][aria-labelledby]')).not.toBeNull();
  const previous = runtime.listSettings()[0].context;
  await act(async () => runtime.host.disable(id));
  expect(container.querySelector('[role="switch"]')).toBeNull();
  expect(container.querySelector("nav")?.textContent).not.toContain("阅读偏好（示例）");
  expect(container.textContent).toContain("插件设置暂不可用");
  expect(document.querySelector('[role="dialog"][aria-labelledby]')).toBeNull();
  await expect(previous.storage.set("reading-hints", false)).rejects.toThrow();
  await act(async () => runtime.host.enable(id));
  await settle();
  expect(toggle().getAttribute("aria-checked")).toBe("true");
  expect(runtime.listSettings()).toHaveLength(1);
  await click("外观");
  expect(container.textContent).toContain("内置设置仍可用");
});

it("关态不挂载插件设置，关闭清理子浮层，重新打开读取最新持久值", async () => {
  await act(async () => runtime.host.enable(id));
  await act(async () => useSettingsStore.getState().setSection(settingKey));
  expect(container.querySelector('[role="switch"]')).toBeNull();
  await open();
  await click("设置说明");
  await act(async () => useSettingsStore.getState().closeSettings());
  expect(document.querySelector('[role="dialog"][aria-labelledby]')).toBeNull();
  expect(container.querySelector('[role="switch"]')).toBeNull();
  await runtime.listSettings()[0].context.storage.set("reading-hints", true);
  await act(async () => useSettingsStore.getState().openSettings());
  await settle();
  expect(toggle().getAttribute("aria-checked")).toBe("true");
  await act(async () =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    )
  );
  expect(useSettingsStore.getState().open).toBe(false);
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
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("格式无效");
  localStorage.setItem(key, "false");
  await click("重新读取设置");
  expect(toggle().disabled).toBe(false);
  const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("存储空间不足");
  });
  await act(async () => toggle().click());
  await settle();
  expect(toggle().getAttribute("aria-checked")).toBe("false");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("存储空间不足");
  expect(container.querySelector('[role="status"]')?.textContent).not.toBe("已保存");
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
    expect(container.textContent).toContain("正在保存");
    await act(async () => runtime.host.disable(id));
    await act(async () => runtime.host.enable(id));
    await settle();
    await act(async () => release());
    await settle();
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(container.querySelector('[role="alert"]')).toBeNull();
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
    expect(container.querySelector('[role="alert"]')).toBeNull();
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
  expect(container.textContent).toContain("插件设置渲染失败");
  await act(async () => runtime.host.disable("broken"));
  fail = false;
  await act(async () => runtime.host.enable("broken"));
  expect(container.textContent).toContain("分区已恢复");
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
  expect(container.textContent).toContain("另一插件的设置");
  await act(async () => handle.dispose());
  expect(runtime.listSettings()).toHaveLength(1);
  expect(container.textContent).toContain("插件设置暂不可用");
  await expect(handle.open()).rejects.toThrow();
  await click("返回插件列表");
  await click("自定义设置示例");
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
    expect(container.textContent).not.toContain("延迟插件内容");
    expect(container.querySelector("nav")?.textContent).not.toContain("延迟分区");
    expect(container.textContent).toContain("插件设置暂不可用");
    await expect(handle.open()).rejects.toThrow();
  } finally {
    await act(async () => {
      release();
      await stopping;
    });
  }
});

it("统一管理入口在停用后仍可访问，通过管理页重新启用恢复保存值", async () => {
  await act(async () => useSettingsStore.getState().openSettings("plugins"));
  expect(
    [...container.querySelectorAll('nav[aria-label="设置分区"] button')].filter(
      button => button.textContent === "插件"
    )
  ).toHaveLength(1);
  await click("自定义设置示例");
  expect(container.querySelector("h2")?.textContent).toBe("自定义设置示例");
  expect(container.textContent).toContain("已停用");
  await click("启用");
  await act(async () => toggle().click());
  await settle();
  await click("停用");
  expect(container.querySelector('[role="switch"]')).toBeNull();
  expect(container.querySelector("h2")?.textContent).toBe("自定义设置示例");
  await click("返回插件列表");
  expect(container.textContent).toContain("自定义设置示例");
  expect(container.textContent).toContain("已停用");
  await click("自定义设置示例");
  await click("启用");
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
  expect(container.textContent).toContain("高级偏好内容");
  expect(container.querySelector('nav[aria-label="设置分区"]')?.textContent).not.toContain(
    "高级偏好"
  );
  expect(
    container.querySelector('nav[aria-label="插件设置分组"] [aria-current="page"]')?.textContent
  ).toBe("高级偏好");
  await click("基础偏好");
  expect(container.textContent).toContain("基础偏好内容");
  expect(container.textContent).not.toContain("高级偏好内容");
  await click("停用");
  expect(container.querySelector('nav[aria-label="插件设置分组"]')).toBeNull();
  await click("启用");
  expect(container.textContent).toContain("基础偏好内容");
});

it("没有设置的插件也能管理，打开管理详情不执行插件代码，注销后仍能返回列表", async () => {
  const activate = vi.fn();
  register(
    definePlugin({ id: "plain", name: "无设置插件", version: "2", create: () => ({ activate }) })
  );
  await act(async () => useSettingsStore.getState().openSettings("plugins"));
  await click("无设置插件");
  expect(activate).not.toHaveBeenCalled();
  await click("启用");
  expect(activate).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("此插件没有自定义设置");
  await act(async () => runtime.host.unregister("plain"));
  expect(container.textContent).toContain("此插件已不可用");
  await click("返回插件列表");
  expect(container.textContent).toContain("自定义设置示例");
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
  await act(async () => useSettingsStore.getState().openSettings("plugins"));
  await click("可重试插件");
  await click("启用");
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("初始化失败");
  expect(runtime.listSettings()).toEqual([]);
  fail = false;
  await click("启用");
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).toContain("重试设置已恢复");
});
