import { afterEach, expect, it, vi } from "vitest";
import { definePlugin } from "@tau/plugins";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { PluginActivationManager, builtinPluginStateKey } from "@/app/plugins/activation-manager";

const hosts: PluginHost[] = [];
function preferences() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}
function setup(
  store = preferences(),
  workspaceId = "A",
  activate: () => Promise<void> = async () => undefined
) {
  const host = new PluginHost({ workspaceId, storage: createMemoryStorage() });
  hosts.push(host);
  const creates = vi.fn();
  for (const id of ["core.a", "core.b"])
    host.registerTrusted(
      definePlugin({
        id,
        name: id,
        version: "1.0.0",
        create() {
          creates(id);
          return {
            async activate(ctx) {
              ctx.commands.register({ id: "run", title: "运行", run: () => ctx.workspaceId });
              if (id === "core.a") await activate();
            },
          };
        },
      })
    );
  const notify = vi.fn();
  const manager = new PluginActivationManager(host, ["core.a", "core.b"], store, notify);
  return { host, manager, creates, notify };
}
afterEach(async () => {
  await Promise.all(hosts.splice(0).map(host => host.dispose()));
});

it("默认停用，显式启用后重建宿主和切库恢复，清理不改写启用意图", async () => {
  const store = preferences();
  const first = setup(store);
  await first.manager.restore();
  expect(first.host.listCommands()).toEqual([]);
  await first.manager.enable("core.a");
  expect(store.values.get(builtinPluginStateKey("core.a"))).toBe("true");
  first.manager.cancel();
  await first.host.dispose();
  expect(store.values.get(builtinPluginStateKey("core.a"))).toBe("true");
  const second = setup(store, "B");
  await second.manager.restore();
  expect(await second.host.executeCommand("core.a:run")).toBe("B");
  expect(second.host.getState("core.b")).toBe("disabled");
  await second.manager.restore();
  expect(second.creates).toHaveBeenCalledTimes(1);
  await second.manager.disable("core.a");
  second.manager.cancel();
  await second.host.dispose();
  const third = setup(store, "A");
  await third.manager.restore();
  expect(third.host.getState("core.a")).toBe("disabled");
  expect(store.values.get(builtinPluginStateKey("core.a"))).toBe("false");
});

it("恢复与用户停用按同一插件串行执行，最后操作生效", async () => {
  const store = preferences();
  store.values.set(builtinPluginStateKey("core.a"), "true");
  const { manager, host } = setup(store);
  const restore = manager.restore();
  const disable = manager.disable("core.a");
  expect(manager.busy("core.a")).toBe(true);
  await Promise.all([restore, disable]);
  expect(manager.busy("core.a")).toBe(false);
  expect(host.listCommands()).toEqual([]);
  expect(store.values.get(builtinPluginStateKey("core.a"))).toBe("false");
});

it("记录损坏不覆盖原值或影响其他插件，手动操作可以重新保存", async () => {
  const store = preferences();
  store.values.set(builtinPluginStateKey("core.a"), "broken");
  store.values.set(builtinPluginStateKey("core.b"), "true");
  const { manager, host } = setup(store);
  await manager.restore();
  expect(manager.error("core.a")).toContain("损坏");
  expect(store.values.get(builtinPluginStateKey("core.a"))).toBe("broken");
  expect(host.getState("core.a")).toBe("disabled");
  expect(host.getState("core.b")).toBe("active");
  await manager.enable("core.a");
  expect(manager.error("core.a")).toBeUndefined();
  expect(host.getState("core.a")).toBe("active");
  expect(store.values.get(builtinPluginStateKey("core.b"))).toBe("true");
});

it("保存失败不伪报状态改变，后续可重试", async () => {
  const store = preferences();
  const { manager, host } = setup(store);
  store.setItem.mockImplementationOnce(() => {
    throw new Error("无法保存");
  });
  await expect(manager.enable("core.a")).rejects.toThrow("无法保存");
  expect(host.getState("core.a")).toBe("disabled");
  expect(manager.enabled("core.a")).toBe(false);
  await manager.enable("core.a");
  store.setItem.mockImplementationOnce(() => {
    throw new Error("无法停用保存");
  });
  await expect(manager.disable("core.a")).rejects.toThrow("无法停用保存");
  expect(host.getState("core.a")).toBe("active");
  expect(store.values.get(builtinPluginStateKey("core.a"))).toBe("true");
  await manager.disable("core.a");
  expect(host.getState("core.a")).toBe("disabled");
});

it("读取失败与激活失败分别显示错误，保留停用及重试路径", async () => {
  const store = preferences();
  store.values.set(builtinPluginStateKey("core.a"), "true");
  let fail = true;
  const { manager, host } = setup(store, "A", async () => {
    if (fail) throw new Error("激活失败");
  });
  store.getItem.mockImplementationOnce(() => {
    throw new Error("读取失败");
  });
  await manager.restore(builtinPluginStateKey("core.a"));
  expect(manager.error("core.a")).toBe("读取失败");
  await manager.restore(builtinPluginStateKey("core.a"));
  expect(manager.error("core.a")).toBe("激活失败");
  expect(manager.enabled("core.a")).toBe(true);
  expect(host.listCommands()).toEqual([]);
  await manager.disable("core.a");
  fail = false;
  await manager.enable("core.a");
  expect(host.getState("core.a")).toBe("active");
});

it("取消管理阻止旧队列改写偏好，不将切库清理当成停用", async () => {
  const store = preferences();
  let release!: () => void;
  let enter!: () => void;
  const entered = new Promise<void>(resolve => {
    enter = resolve;
  });
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const { manager, host } = setup(store, "A", async () => {
    enter();
    await gate;
  });
  const enable = manager.enable("core.a");
  await entered;
  const disable = manager.disable("core.a");
  const settled = Promise.allSettled([enable, disable]);
  manager.cancel();
  const dispose = host.dispose();
  release();
  await Promise.all([settled, dispose]);
  expect(store.values.get(builtinPluginStateKey("core.a"))).toBe("true");
  await expect(manager.enable("core.a")).rejects.toThrow("关闭");
});

it("只恢复已装配内置 ID，按单键更新并支持清空偏好", async () => {
  const store = preferences();
  store.values.set(builtinPluginStateKey("unknown"), "true");
  const { manager, host } = setup(store);
  await manager.restore();
  expect(host.listCommands()).toEqual([]);
  await expect(manager.enable("unknown")).rejects.toThrow("不是受管插件");
  await manager.enable("core.a");
  await manager.enable("core.b");
  store.values.set(builtinPluginStateKey("core.a"), "false");
  await manager.restore(builtinPluginStateKey("core.a"));
  expect(host.getState("core.a")).toBe("disabled");
  expect(host.getState("core.b")).toBe("active");
  store.values.clear();
  await manager.restore();
  expect(host.listCommands()).toEqual([]);
});
