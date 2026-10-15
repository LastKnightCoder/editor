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
    prepareDevelopmentReload: vi.fn<
      () => Promise<import("@/types/plugin-development").PreparedDevelopmentReload | null>
    >(async () => null),
    commitDevelopmentReload: vi.fn(async (): Promise<void> => undefined),
    discardDevelopmentReload: vi.fn(async () => undefined),
    watchDevelopmentBuilds: vi.fn<
      typeof import("@/commands/plugin-development").watchDevelopmentBuilds
    >(async () => undefined),
    subscribeDevelopmentBuilds: vi.fn<
      typeof import("@/commands/plugin-development").subscribeDevelopmentBuilds
    >(() => () => undefined),
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
  return { host, manager, client, record };
}

function replacement(record: RestoredDevelopmentPlugin, fail = false) {
  if (!record.artifact) throw new Error("测试产物缺失");
  const manifest = { ...record.manifest, version: "2.0.0" };
  return {
    ticket: "reload-ticket",
    record: {
      ...record,
      manifest,
      directory: "/new-author",
      artifact: {
        manifest,
        code: record.artifact.code
          .replace("version:'1.0.0'", "version:'2.0.0'")
          .replace("run:()=>1", "run:()=>2")
          .replace(
            "activate(ctx){",
            fail ? "activate(ctx){throw new Error('新版本失败');" : "activate(ctx){"
          ),
      },
    },
  };
}

it("重载校验失败或取消保留旧实例；成功后替换代码并提交新登记", async () => {
  const { host, manager, client, record } = setup();
  await manager.restore();
  client.prepareDevelopmentReload.mockRejectedValueOnce(new Error("产物不完整"));
  await expect(manager.reload(id)).rejects.toThrow("产物不完整");
  expect(await host.executeCommand(id + ":run")).toBe(1);
  await manager.reload(id);
  expect(client.commitDevelopmentReload).not.toHaveBeenCalled();
  client.prepareDevelopmentReload.mockResolvedValueOnce(replacement(record));
  await manager.reload(id);
  expect(await host.executeCommand(id + ":run")).toBe(2);
  expect(host.listPlugins()[0].version).toBe("2.0.0");
  expect(client.commitDevelopmentReload).toHaveBeenLastCalledWith(
    "session",
    "reload-ticket",
    "next",
    true,
    false
  );
  expect(client.discardDevelopmentReload).toHaveBeenCalledWith("session", "reload-ticket");
});

it("自动构建按会话身份处理，等待期间合并为最新版本，停用后拒绝旧事件", async () => {
  const { manager, host, client, record } = setup();
  await manager.restore();
  await manager.setWatching(id, true);
  const receive = client.subscribeDevelopmentBuilds.mock.calls[0][0];
  const watchId = client.watchDevelopmentBuilds.mock.calls[0][2];
  const event = { token: "session", id, watchId };
  client.prepareDevelopmentReload.mockResolvedValue(replacement(record));
  receive({ ...event, token: "old", buildId: "ignored" });
  receive({ ...event, buildId: "first" });
  receive({ ...event, buildId: "latest" });
  await vi.waitFor(() => expect(host.listPlugins()[0].version).toBe("2.0.0"));
  await vi.waitFor(() => expect(manager.busy(id)).toBe(false));
  expect(client.prepareDevelopmentReload).toHaveBeenCalledTimes(1);
  expect(client.prepareDevelopmentReload).toHaveBeenCalledWith("session", id, "latest");
  await manager.disable(id);
  expect(manager.watching(id)).toBe(false);
  receive({ ...event, buildId: "after-stop" });
  await Promise.resolve();
  expect(client.prepareDevelopmentReload).toHaveBeenCalledTimes(1);
  expect(client.watchDevelopmentBuilds).toHaveBeenLastCalledWith("session", id, watchId, false);
});

it("不完整构建只显示错误，普通激活失败回退后继续等待新的发布", async () => {
  const { manager, host, client, record } = setup();
  await manager.restore();
  await manager.setWatching(id, true);
  const receive = client.subscribeDevelopmentBuilds.mock.calls[0][0];
  const watchId = client.watchDevelopmentBuilds.mock.calls[0][2];
  receive({ token: "session", id, watchId, error: "不完整构建" });
  expect(manager.error(id)).toBe("不完整构建");
  expect(await host.executeCommand(id + ":run")).toBe(1);
  client.prepareDevelopmentReload.mockResolvedValueOnce(replacement(record, true));
  receive({ token: "session", id, watchId, buildId: "bad" });
  await vi.waitFor(() => expect(manager.error(id)).toContain("已恢复旧版本"));
  expect(manager.watching(id)).toBe(true);
  client.prepareDevelopmentReload.mockResolvedValueOnce(replacement(record));
  receive({ token: "session", id, watchId, buildId: "fixed" });
  await vi.waitFor(() => expect(host.listPlugins()[0].version).toBe("2.0.0"));
  await vi.waitFor(() => expect(manager.busy(id)).toBe(false));
  expect(manager.error(id)).toBeUndefined();
  await manager.close();
});

it("自动重载达到共享次数上限后停止监听，当前实例保持可用", async () => {
  const { manager, host, client, record } = setup();
  await manager.restore();
  client.prepareDevelopmentReload.mockResolvedValue(replacement(record));
  for (let index = 0; index < 19; index++) await manager.reload(id);
  await manager.setWatching(id, true);
  const receive = client.subscribeDevelopmentBuilds.mock.calls[0][0];
  const watchId = client.watchDevelopmentBuilds.mock.calls[0][2];
  receive({ token: "session", id, watchId, buildId: "last" });
  await vi.waitFor(() => expect(manager.watching(id)).toBe(false));
  expect(await host.executeCommand(id + ":run")).toBe(2);
  expect(manager.error(id)).toContain("20 次");
});

it.each(["activation", "commit"])("新版本 %s 失败恢复旧代码与登记", async failure => {
  const { host, manager, client, record } = setup();
  await manager.restore();
  client.prepareDevelopmentReload.mockResolvedValueOnce(
    replacement(record, failure === "activation")
  );
  if (failure === "commit")
    client.commitDevelopmentReload.mockRejectedValueOnce(new Error("提交失败"));
  await expect(manager.reload(id)).rejects.toThrow("已恢复旧版本");
  expect(await host.executeCommand(id + ":run")).toBe(1);
  expect(host.listPlugins()[0].version).toBe("1.0.0");
  expect(client.commitDevelopmentReload).toHaveBeenLastCalledWith(
    "session",
    "reload-ticket",
    "previous",
    true,
    false
  );
});

it("旧版清理失败禁止运行新代码并保存停用状态", async () => {
  const { host, manager, client, record } = setup();
  await manager.restore();
  await host.unregister(id);
  host.registerTrusted({
    ...record.manifest,
    create: () => ({
      activate: () => undefined,
      deactivate() {
        throw new Error("旧版清理失败");
      },
    }),
  });
  await host.enable(id);
  client.prepareDevelopmentReload.mockResolvedValueOnce(replacement(record));
  await expect(manager.reload(id)).rejects.toThrow("重载与恢复失败");
  expect(host.getState(id)).toBe("restart-required");
  expect(host.listCommands()).toHaveLength(0);
  expect(client.commitDevelopmentReload).toHaveBeenLastCalledWith(
    "session",
    "reload-ticket",
    "previous",
    false,
    true
  );
});

it("恢复提交也失败时明确停止，不伪报旧版已恢复", async () => {
  const { host, manager, client, record } = setup();
  await manager.restore();
  client.prepareDevelopmentReload.mockResolvedValueOnce(replacement(record, true));
  client.commitDevelopmentReload.mockRejectedValue(new Error("磁盘故障"));
  await expect(manager.reload(id)).rejects.toThrow("重载与恢复失败");
  expect(host.listCommands()).toHaveLength(0);
  expect(manager.enabled(id)).toBe(false);
});

it("新版本激活超时不重新执行旧代码，保留需要重启状态", async () => {
  const { host, manager, client, record } = setup();
  await manager.restore();
  const next = replacement(record);
  next.record.artifact.code = next.record.artifact.code.replace(
    "activate(ctx){",
    "activate(ctx){return new Promise(()=>{});"
  );
  client.prepareDevelopmentReload.mockResolvedValueOnce(next);
  vi.useFakeTimers();
  try {
    const rejected = expect(manager.reload(id)).rejects.toThrow("重载与恢复失败");
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
    expect(host.getState(id)).toBe("restart-required");
    expect(host.listCommands()).toHaveLength(0);
  } finally {
    vi.useRealTimers();
  }
});

it("停用插件重载只更新定义，不执行代码", async () => {
  const { host, manager, client, record } = setup();
  await manager.disable(id);
  client.prepareDevelopmentReload.mockResolvedValueOnce(replacement(record, true));
  await manager.reload(id);
  expect(host.getState(id)).toBe("disabled");
  expect(host.listPlugins()[0].version).toBe("2.0.0");
  expect(client.commitDevelopmentReload).toHaveBeenLastCalledWith(
    "session",
    "reload-ticket",
    "next",
    false,
    false
  );
});

it("选择新构建期间关闭会话不替换旧定义，并释放重载票据", async () => {
  const { host, manager, client, record } = setup();
  await manager.restore();
  const next = replacement(record);
  let release!: (value: typeof next) => void;
  client.prepareDevelopmentReload.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        release = resolve;
      })
  );
  const reloading = expect(manager.reload(id)).rejects.toThrow("已关闭");
  await vi.waitFor(() => expect(client.prepareDevelopmentReload).toHaveBeenCalledOnce());
  manager.cancel();
  release(next);
  await reloading;
  expect(host.listPlugins()[0].version).toBe("1.0.0");
  expect(client.commitDevelopmentReload).not.toHaveBeenCalled();
  expect(client.discardDevelopmentReload).toHaveBeenCalledOnce();
});

it("连续重载不累积命令，达到窗口上限后旧实例仍可用", async () => {
  const { host, manager, client, record } = setup();
  await manager.restore();
  const next = replacement(record);
  client.prepareDevelopmentReload.mockResolvedValue(next);
  for (let i = 0; i < 20; i++) {
    await manager.reload(id);
    expect(host.listCommands()).toHaveLength(1);
  }
  await expect(manager.reload(id)).rejects.toThrow("20 次");
  expect(await host.executeCommand(id + ":run")).toBe(2);
});

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
