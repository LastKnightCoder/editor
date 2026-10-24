import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { centerHost } from "../../../../../../tests/fixtures/plugins/center";
import { useMobileCenterCatalog, useMobileCenterInstall } from "./center-queries";
import { installMobileCenterRelease } from "../../../services/pluginCenter";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../../services/pluginCenter", async original => ({
  ...(await original<typeof import("../../../services/pluginCenter")>()),
  installMobileCenterRelease: vi.fn(async () => undefined),
}));
const cleanups: (() => Promise<void>)[] = [];
function harness<T>(
  read: () => T,
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let value: T;
  let unmounted = false;
  function Harness() {
    value = read();
    return null;
  }
  const unmount = async () => {
    if (!unmounted) {
      unmounted = true;
      await act(async () => root.unmount());
      client.clear();
      container.remove();
    }
  };
  cleanups.push(unmount);
  return {
    client,
    get current() {
      return value;
    },
    render: () =>
      act(async () =>
        root.render(
          <QueryClientProvider client={client}>
            <Harness />
          </QueryClientProvider>
        )
      ),
    unmount,
  };
}
async function settle(predicate: () => boolean) {
  for (let i = 0; i < 50 && !predicate(); i++)
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  expect(predicate()).toBe(true);
}
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.resetAllMocks();
});
it("原生配置就绪后查询当前平台，换条件重置游标且不伪造未知平台兼容", async () => {
  vi.mocked(invoke).mockImplementation(async (command, args) =>
    command === "plugin_center_config"
      ? { origin: "https://example.invalid", host: centerHost, installationEnabled: false }
      : {
          items: [],
          nextCursor: null,
          windowStart: "2026-10-17",
          categoryCounts: {},
          request: args,
        }
  );
  let q = "one";
  const hook = harness(() => useMobileCenterCatalog({ q }));
  await hook.render();
  await settle(() => hook.current.query.isSuccess);
  expect(invoke).toHaveBeenCalledWith(
    "plugin_center_request",
    expect.objectContaining({
      request: expect.objectContaining({
        kind: "catalog",
        input: expect.objectContaining({
          platform: "android",
          q: "one",
          cursor: null,
          host: expect.objectContaining({ platform: "android" }),
        }),
      }),
    })
  );
  q = "two";
  await hook.render();
  await settle(() => hook.current.query.isSuccess);
  expect(invoke).toHaveBeenLastCalledWith(
    "plugin_center_request",
    expect.objectContaining({
      request: expect.objectContaining({
        input: expect.objectContaining({ q: "two", cursor: null }),
      }),
    })
  );
});
/** 每次安装挂起，直到对应 id 的 finish 被调用；取消时按 signal 拒绝。 */
function controllableInstalls() {
  const finishers = new Map<string, () => void>();
  vi.mocked(installMobileCenterRelease).mockImplementation(
    (pluginId, _release, signal) =>
      new Promise((resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("取消")));
        finishers.set(pluginId, () => (signal?.aborted ? reject(new Error("取消")) : resolve()));
      })
  );
  return (pluginId: string) => finishers.get(pluginId)?.();
}

it("安装随应用存活，页面卸载后新页面订阅同一任务；同插件互斥、不同插件并行", async () => {
  const finish = controllableInstalls();
  const hook = harness(() => useMobileCenterInstall());
  await hook.render();
  let first!: Promise<void>;
  let second!: Promise<void>;
  await act(async () => {
    first = hook.current.install("test.plugin", "release-1");
    await expect(hook.current.install("test.plugin", "release-1")).rejects.toThrow("已有安装");
    second = hook.current.install("other", "release-2");
  });
  expect(hook.current.task("other")?.phase).toBe("downloading");
  const signal = vi.mocked(installMobileCenterRelease).mock.calls[0][2];
  await hook.unmount();
  expect(signal?.aborted).toBe(false);
  const next = harness(() => useMobileCenterInstall(), hook.client);
  await next.render();
  expect(next.current.task("test.plugin")?.phase).toBe("downloading");
  await act(async () => {
    finish("test.plugin");
    finish("other");
    await Promise.all([first, second]);
  });
  expect(next.current.task("test.plugin")).toMatchObject({ phase: "pending", status: "success" });
  expect(next.current.task("other")?.status).toBe("success");
});

it("超过并发上限的任务排队；取消排队任务不触碰原生暂存区", async () => {
  const finish = controllableInstalls();
  const hook = harness(() => useMobileCenterInstall());
  await hook.render();
  const runs: Promise<void>[] = [];
  await act(async () => {
    for (const id of ["a", "b", "c", "d", "e"]) runs.push(hook.current.install(id, `${id}-1`));
  });
  expect(installMobileCenterRelease).toHaveBeenCalledTimes(3);
  expect(hook.current.task("d")?.phase).toBe("queued");
  await act(async () => {
    await hook.current.cancel("e");
    await expect(runs[4]).rejects.toThrow();
  });
  expect(hook.current.task("e")).toBeNull();
  expect(invoke).not.toHaveBeenCalledWith("plugin_cancel", { id: "e" });
  await act(async () => {
    finish("a");
    await runs[0];
  });
  await settle(() => hook.current.task("d")?.phase === "downloading");
  expect(installMobileCenterRelease).toHaveBeenCalledTimes(4);
  await act(async () => {
    for (const id of ["b", "c", "d"]) finish(id);
    await Promise.all(runs.slice(0, 4));
  });
});

it("只有显式取消会终止应用任务，失败可按同一版本重试", async () => {
  controllableInstalls();
  const hook = harness(() => useMobileCenterInstall());
  await hook.render();
  let pending!: Promise<void>;
  await act(async () => {
    pending = hook.current.install("test.plugin", "release-1");
  });
  await act(async () => {
    await hook.current.cancel("test.plugin");
    await expect(pending).rejects.toThrow("取消");
  });
  expect(invoke).toHaveBeenCalledWith("plugin_cancel", { id: "test.plugin" });
  expect(hook.current.task("test.plugin")).toBeNull();

  vi.mocked(installMobileCenterRelease).mockRejectedValueOnce(new Error("网络失败"));
  await act(async () => {
    await expect(hook.current.install("test.plugin", "release-2")).rejects.toThrow("网络失败");
  });
  expect(hook.current.task("test.plugin")?.status).toBe("error");
  vi.mocked(installMobileCenterRelease).mockResolvedValueOnce(undefined);
  await act(async () => {
    await hook.current.retry("test.plugin");
  });
  expect(installMobileCenterRelease).toHaveBeenLastCalledWith(
    "test.plugin",
    "release-2",
    expect.any(AbortSignal),
    expect.any(Function)
  );
  expect(hook.current.task("test.plugin")?.status).toBe("success");
});
