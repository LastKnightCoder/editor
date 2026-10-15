import { afterEach, expect, it, vi } from "vitest";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import type { RestoredDevelopmentPlugin } from "@/types/plugin-development";
import {
  DevelopmentPluginManager,
  migratePluginPreferences,
} from "@/app/plugins/development-manager";

const id = "example.persisted";
const hosts: PluginHost[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.dispose();
  localStorage.clear();
});
function setup(options: { starting?: boolean; error?: string; skipStartup?: boolean } = {}) {
  const manifest = {
    formatVersion: 1 as const,
    apiVersion: 1 as const,
    platform: "desktop" as const,
    format: "cjs" as const,
    id,
    name: "持久插件",
    version: "1.0.0",
    main: "main.js",
    integrity: { "main.js": "a".repeat(64) },
  };
  const record: RestoredDevelopmentPlugin = {
    manifest,
    directory: "/author",
    enabled: true,
    starting: options.starting ?? false,
    error: options.error,
    artifact: options.error
      ? undefined
      : {
          manifest,
          code: `module.exports.default={id:'${id}',name:'持久插件',version:'1.0.0',apiVersion:1,create:()=>({activate(ctx){ctx.commands.register({id:'run',title:'执行',run:()=>1})}})};`,
        },
  };
  const host = new PluginHost({ workspaceId: "workspace", storage: createMemoryStorage() });
  hosts.push(host);
  const client = {
    saveDevelopmentPluginState: vi.fn(async (): Promise<void> => undefined),
    closeDevelopmentPlugins: vi.fn(async () => undefined),
    removeDevelopmentPlugin: vi.fn(async () => undefined),
    chooseDevelopmentPlugin: vi.fn(async () => null),
  };
  const manager = new DevelopmentPluginManager(
    host,
    {
      token: "session",
      workspaceId: "workspace",
      plugins: [record],
      skipStartup: options.skipStartup ?? false,
    },
    async () => ({}),
    client
  );
  return { host, manager, client };
}

it("恢复先保存启动标记再执行，成功提交启用意图，停用写入关闭状态", async () => {
  const { host, manager, client } = setup();
  client.saveDevelopmentPluginState.mockImplementation(async () => {
    if (client.saveDevelopmentPluginState.mock.calls.length === 1)
      expect(host.listCommands()).toHaveLength(0);
  });
  await manager.restore();
  expect(client.saveDevelopmentPluginState.mock.calls).toEqual([
    ["session", id, true, true],
    ["session", id, true, false],
  ]);
  expect(await host.executeCommand(id + ":run")).toBe(1);
  await manager.disable(id);
  expect(client.saveDevelopmentPluginState).toHaveBeenLastCalledWith("session", id, false, false);
  expect(host.getState(id)).toBe("disabled");
});

it.each([{ starting: true }, { skipStartup: true }, { error: "文件缺失" }])(
  "跳过不安全或不可用的自动启动，保留管理记录 %j",
  async options => {
    const { host, manager, client } = setup(options);
    await manager.restore();
    expect(host.listPlugins()).toHaveLength(1);
    expect(host.listCommands()).toHaveLength(0);
    expect(client.saveDevelopmentPluginState).not.toHaveBeenCalled();
    await manager.disable(id);
    expect(manager.enabled(id)).toBe(false);
  }
);

it("启动前写入失败不执行；启动成功标记写入失败则停用并保持可重试管理", async () => {
  const { host, manager, client } = setup();
  client.saveDevelopmentPluginState.mockRejectedValueOnce(new Error("落盘失败"));
  await expect(manager.enable(id)).rejects.toThrow("落盘失败");
  expect(host.listCommands()).toHaveLength(0);
  client.saveDevelopmentPluginState
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("确认失败"));
  await expect(manager.enable(id)).rejects.toThrow("确认失败");
  expect(host.getState(id)).toBe("disabled");
  expect(host.listCommands()).toHaveLength(0);
  expect(manager.error(id)).toBe("确认失败");
});

it("移除写入失败保留已停用的管理记录，重试只注销定义", async () => {
  const { host, manager, client } = setup();
  await manager.restore();
  client.removeDevelopmentPlugin.mockRejectedValueOnce(new Error("移除落盘失败"));
  await expect(manager.remove(id)).rejects.toThrow("移除落盘失败");
  expect(manager.owns(id)).toBe(true);
  expect(host.getState(id)).toBe("disabled");
  await manager.remove(id);
  expect(host.listPlugins()).toHaveLength(0);
  expect(manager.owns(id)).toBe(false);
});

it("切库期间落盘返回后不再启用旧宿主，关闭等待管理操作收尾", async () => {
  const { host, manager, client } = setup();
  let release!: () => void;
  client.saveDevelopmentPluginState.mockImplementationOnce(
    () =>
      new Promise<void>(resolve => {
        release = resolve;
      })
  );
  const enabling = expect(manager.enable(id)).rejects.toThrow("已关闭");
  await Promise.resolve();
  await Promise.resolve();
  const closing = manager.close();
  release();
  await enabling;
  await closing;
  expect(host.listCommands()).toHaveLength(0);
  expect(client.closeDevelopmentPlugins).toHaveBeenCalledOnce();
});

it("旧偏好迁到稳定身份，已有目标值优先，其他库保持原样", () => {
  const key = (workspace: string) => `tau-plugin-prefs:${JSON.stringify([workspace, id, "count"])}`;
  localStorage.setItem(key("A.db"), "1");
  localStorage.setItem(key("B.db"), "2");
  localStorage.setItem(key("identity"), "3");
  migratePluginPreferences(localStorage, "A.db", "identity");
  expect(localStorage.getItem(key("identity"))).toBe("3");
  expect(localStorage.getItem(key("A.db"))).toBeNull();
  expect(localStorage.getItem(key("B.db"))).toBe("2");
});

it("偏好迁移写入失败保留旧值，重试可完成", () => {
  const key = `tau-plugin-prefs:${JSON.stringify(["A.db", id, "count"])}`;
  localStorage.setItem(key, "5");
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("存储已满");
  });
  try {
    expect(() => migratePluginPreferences(localStorage, "A.db", "stable")).toThrow("存储已满");
    expect(localStorage.getItem(key)).toBe("5");
  } finally {
    write.mockRestore();
  }
  migratePluginPreferences(localStorage, "A.db", "stable");
  expect(localStorage.getItem(`tau-plugin-prefs:${JSON.stringify(["stable", id, "count"])}`)).toBe(
    "5"
  );
  expect(localStorage.getItem(key)).toBeNull();
});
