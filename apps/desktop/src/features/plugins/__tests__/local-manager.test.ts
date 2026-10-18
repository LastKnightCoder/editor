import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { definePlugin } from "@tau/plugins";
import { createMemoryStorage, PluginHost, type DevelopmentPluginPackage } from "@tau/plugins/host";
import { LocalPluginManager, localPluginStateKey } from "@/app/plugins/local-manager";
import type { LocalPluginScan } from "@/types/plugin-local";

const hosts: PluginHost[] = [];
const managers: LocalPluginManager[] = [];
const persisted = new Map<string, boolean>();
function artifact(id = "test.local", version = "1.0.0"): DevelopmentPluginPackage {
  return {
    manifest: {
      formatVersion: 1,
      apiVersion: 1,
      platform: "desktop",
      format: "cjs",
      id,
      name: id,
      version,
      main: "main.js",
      integrity: { "main.js": "a".repeat(64) },
    },
    code: `module.exports.default=require('@tau/plugins').definePlugin({id:'${id}',name:'${id}',version:'${version}',create:()=>({activate(ctx){ctx.commands.register({id:'run',title:'执行',run:()=> '${version}'});}})});`,
  };
}
function setup(
  scan: () => Promise<LocalPluginScan>,
  workspaceId = "A",
  remove = vi.fn<(id: string) => Promise<void>>(async () => undefined)
) {
  const host = new PluginHost({ workspaceId, storage: createMemoryStorage() });
  hosts.push(host);
  host.registerTrusted(
    definePlugin({
      id: "core.theme",
      name: "主题",
      version: "1.0.0",
      create: () => ({ activate: () => undefined }),
    })
  );
  const modules = vi.fn(async () => ({ "@tau/plugins": { definePlugin } }));
  const save = vi.fn(async (id: string, enabled: boolean) => {
    persisted.set(id, enabled);
  });
  const manager = new LocalPluginManager(
    host,
    ["core.theme"],
    async legacy => {
      const result = await scan();
      for (const [id, value] of Object.entries(legacy))
        if (!persisted.has(id) && typeof value === "boolean") persisted.set(id, value);
      return {
        ...result,
        entries: result.entries.map(entry => ({
          ...entry,
          enabled: persisted.get(entry.id) ?? entry.source?.kind === "center",
        })),
      };
    },
    modules,
    localStorage,
    vi.fn(),
    remove,
    save
  );
  managers.push(manager);
  return { host, manager, modules, remove, save };
}
const snapshot = (...artifacts: DevelopmentPluginPackage[]): LocalPluginScan => ({
  directory: "/test/plugins",
  entries: artifacts.map(artifact => ({
    id: artifact.manifest.id,
    directory: "/test/plugins/" + artifact.manifest.id,
    artifact,
  })),
});
beforeEach(() => {
  localStorage.clear();
  persisted.clear();
});
afterEach(async () => {
  vi.restoreAllMocks();
  managers.splice(0).forEach(manager => manager.cancel());
  await Promise.all(hosts.splice(0).map(host => host.dispose()));
});

it("窗口缓存不可写时仍按主进程意图启停", async () => {
  const { manager, host } = setup(async () => snapshot(artifact()));
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  await manager.refresh();
  await manager.enable("test.local");
  expect(persisted.get("test.local")).toBe(true);
  expect(host.getState("test.local")).toBe("active");
  await manager.disable("test.local");
  expect(persisted.get("test.local")).toBe(false);
  expect(host.getState("test.local")).toBe("disabled");
});

it("发现只登记，启用才执行，重新创建工作区宿主恢复启用意图", async () => {
  const scan = vi.fn(async () => snapshot(artifact()));
  const first = setup(scan);
  await first.manager.refresh();
  expect(first.host.getState("test.local")).toBe("disabled");
  expect(first.modules).not.toHaveBeenCalled();
  await first.manager.enable("test.local");
  expect(await first.host.executeCommand("test.local:run")).toBe("1.0.0");
  first.manager.cancel();
  await first.host.dispose();
  const second = setup(scan, "B");
  await second.manager.refresh();
  expect(second.host.getState("test.local")).toBe("active");
  expect(second.host.listCommands()).toHaveLength(1);
  await second.manager.disable("test.local");
  expect(localStorage.getItem(localPluginStateKey("test.local"))).toBe("false");
});
it("插件中心首次安装自动启用，用户停用后不再覆盖；本地 ZIP 仍默认停用", async () => {
  const center = {
    kind: "center" as const,
    releaseId: "r1",
    pluginId: "test.center",
    version: "1.0.0",
    sha256: "b".repeat(64),
  };
  const entries = snapshot(artifact(), artifact("test.center"));
  entries.entries[1].source = center;
  const { host, manager } = setup(async () => entries);
  await manager.refresh();
  expect(host.getState("test.center")).toBe("active");
  expect(host.getState("test.local")).toBe("disabled");
  expect(manager.source("test.center")).toEqual(center);
  await manager.disable("test.center");
  await manager.refresh();
  expect(host.getState("test.center")).toBe("disabled");
});
it("卸载先停用再移除包，默认保留私有数据，勾选后清除所有工作区数据", async () => {
  let entries = snapshot(artifact(), artifact("test.second"));
  const { host, manager, remove } = setup(async () => entries);
  await manager.refresh();
  await manager.enable("test.local");
  const data = (workspace: string, plugin: string) =>
    `tau-plugin-prefs:${JSON.stringify([workspace, plugin, "count"])}`;
  for (const key of [data("A", "test.local"), data("B", "test.local"), data("A", "test.second")])
    localStorage.setItem(key, "1");
  remove.mockImplementation(async (id: string) => {
    entries = { ...entries, entries: entries.entries.filter(entry => entry.id !== id) };
  });
  await manager.uninstall("test.second", false);
  expect(remove).toHaveBeenCalledWith("test.second");
  expect(host.listPlugins().some(item => item.id === "test.second")).toBe(false);
  expect(localStorage.getItem(data("A", "test.second"))).toBe("1");
  await manager.uninstall("test.local", true);
  expect(host.listCommands()).toEqual([]);
  expect(localStorage.getItem(localPluginStateKey("test.local"))).toBeNull();
  expect(localStorage.getItem(data("A", "test.local"))).toBeNull();
  expect(localStorage.getItem(data("B", "test.local"))).toBeNull();
  expect(localStorage.getItem(data("A", "test.second"))).toBe("1");
});
it("卸载失败不清除启用偏好与数据", async () => {
  const { manager, remove } = setup(async () => snapshot(artifact()));
  await manager.refresh();
  await manager.enable("test.local");
  remove.mockRejectedValueOnce(new Error("该插件有未完成的更新"));
  await expect(manager.uninstall("test.local", true)).rejects.toThrow("未完成");
  expect(localStorage.getItem(localPluginStateKey("test.local"))).toBe("false");
});
it("扫描新增与删除目录，删除回收命令且保留启用偏好", async () => {
  let entries = snapshot(artifact());
  const { host, manager } = setup(async () => entries);
  await manager.refresh();
  await manager.enable("test.local");
  entries = snapshot(artifact(), artifact("test.second"));
  await manager.refresh();
  expect(host.listPlugins()).toHaveLength(3);
  expect(host.getState("test.second")).toBe("disabled");
  entries = snapshot(artifact("test.second"));
  await manager.refresh();
  expect(host.listCommands()).toEqual([]);
  expect(host.listPlugins().some(item => item.id === "test.local")).toBe(false);
  expect(localStorage.getItem(localPluginStateKey("test.local"))).toBe("true");
});
it("更新活动包不热替换，停用后刷新加载新包", async () => {
  let entries = snapshot(artifact());
  const { host, manager } = setup(async () => entries);
  await manager.refresh();
  await manager.enable("test.local");
  entries = snapshot(artifact("test.local", "1.1.0"));
  await manager.refresh();
  expect(await host.executeCommand("test.local:run")).toBe("1.0.0");
  expect(manager.error("test.local")).toContain("重启");
  await manager.disable("test.local");
  await manager.refresh();
  await manager.enable("test.local");
  expect(await host.executeCommand("test.local:run")).toBe("1.1.0");
  expect(host.listCommands()).toHaveLength(1);
});
it("坏包和内置 ID 冲突显示错误，根目录读取失败保留当前实例", async () => {
  let fail = false;
  const scan = async () => {
    if (fail) throw Error("目录不可读");
    const result = snapshot(artifact(), artifact("core.theme"));
    result.entries.push({ id: "bad", directory: "/test/plugins/bad", error: "清单无效" });
    return result;
  };
  const { host, manager } = setup(scan);
  await manager.refresh();
  expect(manager.issues).toHaveLength(2);
  expect(manager.error("core.theme")).toContain("冲突");
  await manager.enable("test.local");
  fail = true;
  await expect(manager.refresh()).rejects.toThrow("目录不可读");
  expect(manager.scanError).toBe("目录不可读");
  expect(host.getState("test.local")).toBe("active");
});
it("关闭期间迟到扫描不登记插件，后续操作拒绝", async () => {
  let release!: (value: LocalPluginScan) => void;
  const scan = vi.fn(
    () =>
      new Promise<LocalPluginScan>(resolve => {
        release = resolve;
      })
  );
  const { host, manager } = setup(scan);
  const refresh = manager.refresh();
  await vi.waitFor(() => expect(scan).toHaveBeenCalled());
  const rejected = expect(refresh).rejects.toThrow("关闭");
  manager.cancel();
  await host.dispose();
  release(snapshot(artifact()));
  await rejected;
  expect(host.listPlugins()).toEqual([]);
  await expect(manager.refresh()).rejects.toThrow("关闭");
});

it("保存失败不启用或停用实例；后台意图覆盖过时窗口镜像", async () => {
  const { manager, host, save } = setup(async () => snapshot(artifact()));
  await manager.refresh();
  save.mockRejectedValueOnce(new Error("磁盘不可写"));
  await expect(manager.enable("test.local")).rejects.toThrow("磁盘不可写");
  expect(host.getState("test.local")).toBe("disabled");
  await manager.enable("test.local");
  save.mockRejectedValueOnce(new Error("磁盘不可写"));
  await expect(manager.disable("test.local")).rejects.toThrow("磁盘不可写");
  expect(host.getState("test.local")).toBe("active");
  persisted.set("test.local", false);
  await manager.restore();
  expect(host.getState("test.local")).toBe("disabled");
  expect(localStorage.getItem(localPluginStateKey("test.local"))).toBe("false");
});
it("损坏后刷新保留当前快照，修复后能重新发现", async () => {
  let entries = snapshot(artifact());
  const { host, manager } = setup(async () => entries);
  await manager.refresh();
  await manager.enable("test.local");
  entries = {
    directory: "/test/plugins",
    entries: [{ id: "test.local", directory: "/test/plugins/test.local", error: "构建不完整" }],
  };
  await manager.refresh();
  expect(manager.error("test.local")).toContain("构建不完整");
  expect(await host.executeCommand("test.local:run")).toBe("1.0.0");
  entries = snapshot(artifact());
  await manager.refresh();
  expect(manager.error("test.local")).toBeUndefined();
});
