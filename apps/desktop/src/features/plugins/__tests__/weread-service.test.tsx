import { act, StrictMode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMemoryStorage } from "@tau/plugins/host";
import { definePlugin, type PluginContext } from "@tau/plugins";
import { DesktopPluginRuntime } from "@/app/plugins/runtime";
import { PluginRuntimeContext } from "@/app/plugins/context";
import { PageProvider, usePage, type Navigator } from "@/page/PageProvider";
import { PageHost } from "@/page/PageHost";
import { definePage } from "@/page/definePage";
import { createWeReadPlugin } from "./fixtures/weread/plugin";
import "../pages/plugin-page.page";

const fetchMock = vi.fn();
const execute: typeof fetch = async (input, init) => {
  const signal = init?.signal;
  return new Promise<Response>((resolve, reject) => {
    const abort = () => reject(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    void fetchMock(input, init)
      .then((result: { status: number; data: unknown }) => {
        if (!signal?.aborted)
          resolve(new Response(JSON.stringify(result.data), { status: result.status }));
      }, reject)
      .finally(() => signal?.removeEventListener("abort", abort));
  });
};
vi.mock("@/stores/useSettingStore", async () => {
  const { create } = await import("zustand");
  return {
    default: create(() => ({
      setting: { database: { active: "A" }, integration: { weread: { apiKey: "" } } },
    })),
  };
});
import useSettingStore from "@/stores/useSettingStore";
const weReadPlugin = createWeReadPlugin(
  () => useSettingStore.getState().setting.integration.weread.apiKey
);

definePage({
  key: "weread-service-home",
  label: "服务测试首页",
  params: {},
  component: () => <div>服务测试首页</div>,
});
let root: Root;
let container: HTMLDivElement;
let runtime: DesktopPluginRuntime;
let navigator: Navigator;
function Capture() {
  const page = usePage();
  useEffect(() => {
    navigator = page.navigator;
  }, [page.navigator]);
  return <PageHost state={page.state} />;
}
function setKey(apiKey: string) {
  useSettingStore.setState(state => ({
    setting: {
      ...state.setting,
      integration: {
        ...state.setting.integration,
        weread: { ...state.setting.integration.weread, apiKey },
      },
    },
  }));
}
async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 15));
  });
}
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find(item => item.textContent === label);
  if (!button) throw new Error(`按钮不存在：${label}`);
  await act(async () => button.click());
  await settle();
}
function body(id: string, sort = 20, hasMore = 0) {
  return {
    status: 200,
    data: {
      books: [
        {
          bookId: id,
          book: { title: `书籍 ${id}`, author: "作者" },
          sort,
          noteCount: 1,
          bookmarkCount: 2,
        },
      ],
      hasMore,
    },
  };
}
beforeEach(async () => {
  fetchMock.mockReset();
  setKey("");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  runtime = new DesktopPluginRuntime({
    workspaceId: "A",
    storage: createMemoryStorage(),
    plugins: [weReadPlugin],
    navigator: { push: (key, params) => navigator.push(key, params) },
    fetch: execute,
  });
  await act(async () =>
    root.render(
      <StrictMode>
        <PageProvider initialKey="weread-service-home">
          <PluginRuntimeContext.Provider value={runtime}>
            <Capture />
          </PluginRuntimeContext.Provider>
        </PageProvider>
      </StrictMode>
    )
  );
  await act(async () => {
    await runtime.host.enable(weReadPlugin.id);
    await runtime.host.executeCommand(`${weReadPlugin.id}:open`);
  });
  await settle();
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await runtime.dispose();
  });
  container.remove();
});

it("已配置连接经真实页面/命令使用宿主 HTTP，手动读取、分页、刷新形成闭环", async () => {
  expect(fetchMock).not.toHaveBeenCalled();
  expect(container.textContent).toContain("账号与连接");
  setKey("fixture-api-key");
  await click("重新读取连接配置");
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock
    .mockResolvedValueOnce(body("A", 20, 1))
    .mockResolvedValueOnce(body("B", 10, 0))
    .mockResolvedValueOnce(body("C"));
  await click("读取笔记书单");
  expect(container.textContent).toContain("书籍 A");
  expect(container.textContent).toContain("1 条笔记");
  expect(fetchMock).toHaveBeenLastCalledWith(
    "https://i.weread.qq.com/api/agent/gateway",
    expect.objectContaining({
      method: "POST",
      headers: { Authorization: "Bearer fixture-api-key", "Content-Type": "application/json" },
      body: JSON.stringify({ api_name: "/user/notebooks", skill_version: "1.0.4", count: 100 }),
    })
  );
  await click("加载更多");
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).lastSort).toBe(20);
  expect(container.textContent).toContain("书籍 A");
  expect(container.textContent).toContain("书籍 B");
  expect(container.textContent).not.toContain("加载更多");
  await click("重新读取书单");
  expect(JSON.parse(fetchMock.mock.calls[2][1].body).lastSort).toBeUndefined();
  expect(container.textContent).toContain("书籍 C");
  expect(container.textContent).not.toContain("书籍 A");
  expect(container.textContent).not.toContain("fixture-api-key");
});

it("HTTP 失效、限流和分页停滞可见且可重试，不进行隐式重试或覆盖已读取页", async () => {
  setKey("fixture-key");
  await click("重新读取连接配置");
  fetchMock
    .mockResolvedValueOnce({ status: 401, data: {} })
    .mockResolvedValueOnce({ status: 429, data: {} })
    .mockResolvedValueOnce(body("A", 20, 1))
    .mockResolvedValueOnce(body("B", 20, 1))
    .mockResolvedValueOnce(body("B", 10));
  await click("读取笔记书单");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("连接已失效");
  await click("重新读取书单");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("请求过快");
  await click("重新读取书单");
  await click("加载更多");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("游标未前进");
  expect(container.textContent).toContain("书籍 A");
  expect(container.textContent).not.toContain("书籍 B");
  await click("加载更多");
  expect(container.textContent).toContain("书籍 B");
  expect(fetchMock).toHaveBeenCalledTimes(5);
});

it("取消与停用传递到执行端，重新启用后不显示旧请求结果", async () => {
  setKey("fixture-key");
  await click("重新读取连接配置");
  let complete!: (value: unknown) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        complete = resolve;
      })
  );
  await click("读取笔记书单");
  const firstSignal = fetchMock.mock.calls[0][1].signal as AbortSignal;
  await click("取消读取");
  expect(firstSignal.aborted).toBe(true);
  expect(container.textContent).toContain("已取消读取");
  await act(async () => complete(body("旧页")));
  await settle();
  expect(container.textContent).not.toContain("书籍 旧页");
  fetchMock.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        complete = resolve;
      })
  );
  await click("重新读取书单");
  const oldSignal = fetchMock.mock.calls[1][1].signal as AbortSignal;
  await act(async () => runtime.host.disable(weReadPlugin.id));
  expect(oldSignal.aborted).toBe(true);
  expect(container.textContent).toContain("插件页面暂不可用");
  await act(async () => runtime.host.enable(weReadPlugin.id));
  await settle();
  await act(async () => complete(body("旧实例")));
  await settle();
  expect(container.textContent).not.toContain("书籍 旧实例");
  fetchMock.mockResolvedValueOnce(body("新实例"));
  await click("读取笔记书单");
  expect(container.textContent).toContain("书籍 新实例");
});

it("空书单、业务错误、非法响应与传输错误不显示假数据或敏感错误", async () => {
  setKey("fixture-key");
  await click("重新读取连接配置");
  fetchMock
    .mockResolvedValueOnce({ status: 200, data: { books: [], hasMore: 0 } })
    .mockResolvedValueOnce({ status: 200, data: { errcode: -10102, errmsg: "private" } })
    .mockResolvedValueOnce({ status: 200, data: {} })
    .mockRejectedValueOnce(new TypeError("fetch failed"));
  await click("读取笔记书单");
  expect(container.textContent).toContain("当前账号没有笔记书籍");
  await click("重新读取书单");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("请求过快");
  await click("重新读取书单");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("未返回笔记书单");
  await click("重新读取书单");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("fetch failed");
  expect(container.textContent).not.toContain("fixture-key");
  expect(container.textContent).not.toContain("private");
});

it("通用 fetch 不注入业务认证，微信读书仅使用显式交给它的账号配置", async () => {
  let other!: PluginContext;
  await act(async () => {
    runtime.host.registerTrusted(
      definePlugin({
        id: "other",
        name: "其他插件",
        version: "1",
        create: () => ({
          activate(ctx) {
            other = ctx;
          },
        }),
      })
    );
    await runtime.host.enable("other");
  });
  fetchMock.mockResolvedValue(body("匿名请求"));
  await other.fetch("https://example.test");
  expect(fetchMock.mock.calls[0][1].headers).toBeUndefined();
  fetchMock.mockClear();
  setKey("first-key");
  await click("重新读取连接配置");
  setKey("second-key");
  fetchMock.mockResolvedValue(body("当前账号"));
  await click("读取笔记书单");
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer second-key");
});
