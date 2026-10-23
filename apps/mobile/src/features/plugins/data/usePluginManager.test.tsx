import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMemoryStorage } from "@tau/plugins/host";
import { createPluginEnvironmentStore } from "@tau/plugins/environment-host";
import { MobilePluginRuntime } from "../../../app/plugins/runtime";
import * as services from "../../../services/plugins";
import { usePluginManager, type PluginManagerAction } from "./usePluginManager";

let runtime: MobilePluginRuntime;
let inventory: services.MobilePluginInventory;
vi.mock("../../../app/plugins/context", () => ({ useMobilePlugins: () => runtime }));
vi.mock("../../../services/plugins", async original => ({
  ...(await original<typeof import("../../../services/plugins")>()),
  readMobilePlugins: vi.fn(async () => inventory),
  setMobilePluginEnabled: vi.fn(async () => undefined),
  removeMobilePlugin: vi.fn(async () => undefined),
  restoreMobilePlugin: vi.fn(async () => undefined),
  clearMobilePluginData: vi.fn(async () => undefined),
  cancelMobilePlugin: vi.fn(async () => undefined),
  installMobilePlugin: vi.fn(async () => undefined),
}));
let controller: ReturnType<typeof usePluginManager>;
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
const runtimes: MobilePluginRuntime[] = [];
function makeRuntime(database: string) {
  const instance = new MobilePluginRuntime(
    createPluginEnvironmentStore({
      platform: "ios",
      input: { coarsePointer: true, finePointer: false },
    }),
    createMemoryStorage(),
    database,
    { push: vi.fn() },
    "0.2.0"
  );
  runtimes.push(instance);
  return instance;
}
function Harness() {
  controller = usePluginManager();
  return null;
}
async function render() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>
    )
  );
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 30));
  });
}
beforeEach(async () => {
  vi.clearAllMocks();
  runtime = makeRuntime("A.db");
  inventory = {
    platform: "ios",
    appVersion: "0.2.0",
    development: true,
    packages: [{ id: "test.plugin", enabled: false, pending: true, hasBackup: true }],
  };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await render();
});
afterEach(async () => {
  await act(async () => root.unmount());
  for (const instance of runtimes.splice(0)) await instance.dispose();
  client.clear();
  container.remove();
  vi.restoreAllMocks();
});
it.each(["uninstall", "restore", "clearData"] as PluginManagerAction[])(
  "运行中的插件拒绝直接调用 %s，不只依赖按钮禁用",
  async kind => {
    vi.spyOn(runtime, "isPluginActive").mockReturnValue(true);
    await render();
    expect(controller.items[0].actions[kind].allowed).toBe(false);
    await act(async () => {
      await expect(controller.actions.run(kind, "test.plugin")).rejects.toThrow("停用");
    });
    expect(services.removeMobilePlugin).not.toHaveBeenCalled();
    expect(services.restoreMobilePlugin).not.toHaveBeenCalled();
    expect(services.clearMobilePluginData).not.toHaveBeenCalled();
  }
);
it("未启用包可管理，清数据固定当前工作区，不删除正文或其他库", async () => {
  await act(async () => {
    await controller.actions.run("enable", "test.plugin");
  });
  expect(services.setMobilePluginEnabled).toHaveBeenCalledWith("test.plugin", true);
  await act(async () => {
    await controller.actions.run("clearData", "test.plugin");
  });
  expect(services.clearMobilePluginData).toHaveBeenCalledWith("A.db", "test.plugin");
});
it("未开放环境拒绝管理操作", async () => {
  inventory = { ...inventory, development: false };
  await act(async () => {
    await controller.refresh();
  });
  await render();
  expect(controller.developmentInstall.allowed).toBe(false);
  await act(async () => {
    await expect(controller.actions.run("enable", "test.plugin")).rejects.toThrow("未开放");
  });
  expect(services.setMobilePluginEnabled).not.toHaveBeenCalled();
});
it("正式构建可管理中心插件，但不能通过开发入口安装任意来源", async () => {
  inventory = { ...inventory, development: false, managementEnabled: true };
  await act(async () => { await controller.refresh(); });
  await render();
  expect(controller.managementEnabled).toBe(true);
  expect(controller.developmentInstall.allowed).toBe(false);
  await act(async () => { await controller.actions.run("enable", "test.plugin"); });
  expect(services.setMobilePluginEnabled).toHaveBeenCalledWith("test.plugin", true);
  await act(async () => {
    await expect(controller.actions.installDevelopment("{}")).rejects.toThrow("开发来源");
  });
  expect(services.installMobilePlugin).not.toHaveBeenCalled();
});
it("动作同步互斥，失败后允许重试且错误可供 UI 展示", async () => {
  let fail!: (reason: Error) => void;
  vi.mocked(services.setMobilePluginEnabled).mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      })
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = controller.actions.run("enable", "test.plugin");
    await expect(controller.actions.run("enable", "test.plugin")).rejects.toThrow("正在进行");
  });
  await act(async () => {
    fail(new Error("原生写入失败"));
    await expect(pending).rejects.toThrow("原生写入失败");
  });
  expect(String(controller.actionError)).toContain("原生写入失败");
  await act(async () => {
    await controller.actions.run("enable", "test.plugin");
  });
  expect(services.setMobilePluginEnabled).toHaveBeenCalledTimes(2);
});
it("切换工作区后旧回调不能清除新库数据，已清理运行时也不能发起操作", async () => {
  const previous = controller.actions;
  runtime = makeRuntime("B.db");
  await render();
  await expect(previous.run("clearData", "test.plugin")).rejects.toThrow("失效");
  await runtime.dispose();
  await act(async () => {
    await expect(controller.actions.run("clearData", "test.plugin")).rejects.toThrow("失效");
  });
  expect(services.clearMobilePluginData).not.toHaveBeenCalled();
});
it("不存在的包和非法开发来源在调用原生前失败", async () => {
  await act(async () => {
    await expect(controller.actions.run("uninstall", "not.installed")).rejects.toThrow("清单");
  });
  await act(async () => {
    await expect(controller.actions.installDevelopment('{"id":"../bad"}')).rejects.toThrow(
      "描述无效"
    );
  });
  expect(services.removeMobilePlugin).not.toHaveBeenCalled();
  expect(services.installMobilePlugin).not.toHaveBeenCalled();
});

it("中心拦截标记传给界面，不能绕过动作校验启用", async () => {
  inventory.packages[0].blocked = true;
  inventory.packages[0].centerSource = {
    origin: "https://example.invalid",
    releaseId: "release-1",
  };
  inventory.packages[0].revoked = { kind: "revoked", reason: "中心撤回" };
  inventory.packages[0].pendingVersion = "2.0.0";
  inventory.packages[0].statusStale = true;
  await act(async () => {
    await controller.refresh();
  });
  await render();
  expect(controller.items[0]).toMatchObject({
    blocked: true,
    centerSource: { releaseId: "release-1" },
    revoked: { reason: "中心撤回" },
    pendingVersion: "2.0.0",
    statusStale: true,
  });
  await act(async () => {
    await expect(controller.actions.run("enable", "test.plugin")).rejects.toThrow("中心版本不可用");
  });
  expect(services.setMobilePluginEnabled).not.toHaveBeenCalled();
});

it("取消开发安装通知原生，迟到的完成不会显示成功", async () => {
  let finish!: () => void;
  vi.mocked(services.installMobilePlugin).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const source = JSON.stringify({
    id: "test.plugin",
    version: "1.0.0",
    url: "https://example.invalid/a.zip",
    size: 10,
    sha256: "a".repeat(64),
  });
  let pending!: Promise<void>;
  await act(async () => {
    pending = controller.actions.installDevelopment(source);
  });
  expect(controller.canCancelInstall).toBe(true);
  await act(async () => {
    await controller.actions.cancelInstall();
  });
  expect(services.cancelMobilePlugin).toHaveBeenCalledWith("test.plugin");
  await act(async () => {
    finish();
    await expect(pending).rejects.toThrow();
  });
  expect(controller.saved).toBe(false);
});

it("切库终止旧安装的提交意图，迟到结果不成为新会话的成功状态", async () => {
  let finish!: () => void;
  vi.mocked(services.installMobilePlugin).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const source = JSON.stringify({
    id: "test.plugin",
    version: "1.0.0",
    url: "https://example.invalid/a.zip",
    size: 10,
    sha256: "a".repeat(64),
  });
  let pending!: Promise<void>;
  await act(async () => {
    pending = controller.actions.installDevelopment(source);
  });
  const signal = vi.mocked(services.installMobilePlugin).mock.calls.at(-1)?.[3];
  runtime = makeRuntime("B.db");
  await render();
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    finish();
    await expect(pending).rejects.toThrow();
  });
  expect(controller.saved).toBe(false);
  expect(controller.actionError).toBeNull();
});
