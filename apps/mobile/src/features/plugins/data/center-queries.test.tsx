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
it("安装随应用存活，页面卸载后新页面订阅同一任务且保持互斥", async () => {
  let finish!: () => void;
  vi.mocked(installMobileCenterRelease).mockImplementationOnce(
    (_id, _release, signal) =>
      new Promise((resolve, reject) => {
        finish = () => {
          if (signal?.aborted) reject(new Error("取消"));
          else resolve();
        };
      })
  );
  const hook = harness(() => useMobileCenterInstall());
  await hook.render();
  let pending!: Promise<void>;
  await act(async () => {
    pending = hook.current.install("test.plugin", "release-1");
    await expect(hook.current.install("other", "release-2")).rejects.toThrow("已有安装");
  });
  const signal = vi.mocked(installMobileCenterRelease).mock.calls[0][2];
  await hook.unmount();
  expect(signal?.aborted).toBe(false);
  const next = harness(() => useMobileCenterInstall(), hook.client);
  await next.render();
  expect(next.current.phase).toBe("downloading");
  await expect(next.current.install("other", "release-2")).rejects.toThrow("已有安装");
  await act(async () => {
    finish();
    await pending;
  });
  expect(next.current.phase).toBe("pending");
  expect(next.current.mutation.isSuccess).toBe(true);
});

it("只有显式取消会终止应用任务，失败可按同一版本重试", async () => {
  let finish!: () => void;
  vi.mocked(installMobileCenterRelease).mockImplementationOnce(
    (_id, _version, signal) =>
      new Promise((resolve, reject) => {
        finish = () => (signal?.aborted ? reject(new Error("取消")) : resolve());
      })
  );
  const hook = harness(() => useMobileCenterInstall());
  await hook.render();
  let pending!: Promise<void>;
  await act(async () => {
    pending = hook.current.install("test.plugin", "release-1");
  });
  await act(async () => {
    await hook.current.cancel();
  });
  await act(async () => {
    finish();
    await expect(pending).rejects.toThrow("取消");
  });
  expect(hook.current.task.status).toBe("idle");

  vi.mocked(installMobileCenterRelease).mockRejectedValueOnce(new Error("网络失败"));
  await act(async () => {
    await expect(hook.current.install("test.plugin", "release-2")).rejects.toThrow("网络失败");
  });
  expect(hook.current.task.status).toBe("error");
  await act(async () => {
    await hook.current.retry();
  });
  expect(installMobileCenterRelease).toHaveBeenLastCalledWith(
    "test.plugin",
    "release-2",
    expect.any(AbortSignal),
    expect.any(Function)
  );
  expect(hook.current.task.status).toBe("success");
});
