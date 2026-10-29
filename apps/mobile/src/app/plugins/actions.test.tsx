import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { definePlugin, type PluginContext } from "@tau/plugins";
import { createMemoryStorage } from "@tau/plugins/host";
import { createPluginEnvironmentStore } from "@tau/plugins/environment-host";
import { MobilePluginRuntime } from "./runtime";
import { createMobileApp } from "./app";
import { MobilePluginsContext } from "./context";
import { useMobilePluginActionItems } from "./action-menu";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "../../components/toast";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../components/toast", () => ({ toast: vi.fn() }));
const runtimes: MobilePluginRuntime[] = [];
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(runtime => runtime.dispose()));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function setup(platform: "ios" | "android" = "android") {
  vi.stubGlobal("navigator", { userActivation: { isActive: true } });
  const runtime = new MobilePluginRuntime(
    createPluginEnvironmentStore({ platform, input: { coarsePointer: true, finePointer: false } }),
    createMemoryStorage(),
    "test.db",
    { push: vi.fn() },
    "0.2.13"
  );
  runtimes.push(runtime);
  runtime.app = createMobileApp("test.db", "session", { push: vi.fn() }, async () => false);
  let context!: PluginContext;
  const run = vi.fn();
  runtime.host.registerTrusted(
    definePlugin({
      id: "test.actions",
      name: "动作插件",
      version: "1.0.0",
      create: () => ({
        activate(value) {
          context = value;
          value.actions.register({
            id: "open",
            title: "处理内容",
            targets: ["card", "article", "document", "material"],
            run,
          });
        },
      }),
    })
  );
  await runtime.host.enable("test.actions");
  return { runtime, run, context };
}
it.each(["android", "ios"] as const)(
  "%s 按目标筛选，先授权身份，再交付冻结的公开引用",
  async platform => {
    const { runtime, run } = await setup(platform);
    vi.mocked(invoke).mockResolvedValue([]);
    expect(runtime.listActions("material")).toEqual([]);
    for (const kind of ["card", "article", "document"] as const) {
      const action = runtime.listActions(kind)[0];
      expect(action).toBeDefined();
      await runtime.runAction(action, { kind, id: "12" }, "123");
      expect(invoke).toHaveBeenLastCalledWith(
        "plugin_app_refs",
        expect.objectContaining({
          database: "test.db",
          token: "session",
          pluginId: "test.actions",
          request: { method: "grant", selections: [{ ref: { kind, id: "12" }, identity: "123" }] },
        })
      );
      expect(run).toHaveBeenLastCalledWith({ kind, id: "12" });
      expect(Object.isFrozen(run.mock.calls.at(-1)?.[0])).toBe(true);
    }
  }
);
it("身份失效或没有手势时不执行，动作注销后旧引用不能执行", async () => {
  const { runtime, run, context } = await setup();
  const action = runtime.listActions("card")[0];
  vi.mocked(invoke).mockRejectedValue(new Error("选择的内容身份已变化"));
  await expect(runtime.runAction(action, { kind: "card", id: "1" }, "10")).rejects.toThrow(
    "身份已变化"
  );
  vi.stubGlobal("navigator", { userActivation: { isActive: false } });
  await expect(runtime.runAction(action, { kind: "card", id: "1" }, "10")).rejects.toThrow(
    "用户点击"
  );
  const registration = context.actions.register({
    id: "temporary",
    title: "临时",
    targets: ["card"],
    run,
  });
  const temporary = runtime.listActions("card")[1];
  await registration.dispose();
  await expect(runtime.runAction(temporary, { kind: "card", id: "1" }, "10")).rejects.toThrow(
    "不可用"
  );
  expect(run).not.toHaveBeenCalled();
});
it.each(["disable", "dispose"] as const)("授权等待期间 %s，迟到结果不调用插件", async operation => {
  const { runtime, run } = await setup();
  let resolve!: (value: unknown) => void;
  vi.mocked(invoke).mockImplementation(
    () =>
      new Promise(done => {
        resolve = done;
      })
  );
  const pending = runtime.runAction(
    runtime.listActions("card")[0],
    { kind: "card", id: "1" },
    "10"
  );
  const rejected = expect(pending).rejects.toThrow();
  if (operation === "disable") await runtime.host.disable("test.actions");
  else await runtime.dispose();
  resolve([]);
  await rejected;
  expect(run).not.toHaveBeenCalled();
  expect(runtime.listActions("card")).toEqual([]);
});
it("菜单响应停用、展示插件来源并报告执行错误", async () => {
  const { runtime, run } = await setup();
  vi.mocked(invoke).mockResolvedValue([]);
  run.mockRejectedValue(new Error("处理失败"));
  const container = document.createElement("div");
  const root = createRoot(container);
  function Menu() {
    const items = useMobilePluginActionItems({ kind: "article", id: "7", createTime: 8 });
    return items.map(item => (
      <button key={item.key} onClick={item.onClick}>
        {item.label} · {item.desc}
      </button>
    ));
  }
  try {
    await act(async () =>
      root.render(
        <MobilePluginsContext.Provider value={runtime}>
          <Menu />
        </MobilePluginsContext.Provider>
      )
    );
    expect(container.textContent).toBe("处理内容 · 动作插件");
    await act(async () => {
      container.querySelector("button")?.click();
    });
    expect(run).toHaveBeenCalledWith({ kind: "article", id: "7" });
    expect(toast).toHaveBeenCalledWith({ type: "warning", text: "插件操作失败：处理失败" });
    await act(async () => {
      await runtime.host.disable("test.actions");
    });
    expect(container.querySelector("button")).toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});

it("重复注册导致激活失败时清理动作，重新启用不会复活旧动作", async () => {
  const { runtime, run } = await setup();
  const previous = runtime.listActions("card")[0];
  await runtime.host.disable("test.actions");
  await runtime.host.enable("test.actions");
  await expect(runtime.runAction(previous, { kind: "card", id: "1" }, "10")).rejects.toThrow(
    "不可用"
  );
  runtime.host.registerTrusted(
    definePlugin({
      id: "test.failure",
      name: "失败插件",
      version: "1.0.0",
      create: () => ({
        activate(context) {
          const action = { id: "same", title: "重复", targets: ["card"] as const, run };
          context.actions.register(action);
          context.actions.register(action);
        },
      }),
    })
  );
  await expect(runtime.host.enable("test.failure")).rejects.toThrow("已注册");
  expect(runtime.listActions("card").map(action => action.context.pluginId)).toEqual([
    "test.actions",
  ]);
  expect(run).not.toHaveBeenCalled();
});
