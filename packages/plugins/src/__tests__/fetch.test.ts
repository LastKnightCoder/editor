import { expect, it, vi } from "vitest";
import { definePlugin, type PluginContext } from "../index";
import { createMemoryStorage, PluginHost } from "../host";

async function setup(execute?: typeof fetch) {
  let context!: PluginContext;
  const host = new PluginHost({
    workspaceId: "test",
    storage: createMemoryStorage(),
    fetch: execute,
  });
  host.registerTrusted(
    definePlugin({
      id: "sample",
      name: "样本",
      version: "1",
      create: () => ({
        activate(ctx) {
          context = ctx;
        },
      }),
    })
  );
  await host.enable("sample");
  return { host, context: () => context };
}

it("公开接口使用原生 fetch 参数和 Response，不隐式注入认证或限制状态码", async () => {
  const execute = vi.fn<typeof fetch>(
    async (_input, init) =>
      new Response(String(init?.body), { status: 418, headers: { "X-Test": "ok" } })
  );
  const runtime = await setup(execute);
  const response = await runtime.context().fetch(new URL("https://example.test"), {
    method: "PATCH",
    headers: new Headers({ "X-Custom": "test" }),
    body: "raw",
  });
  expect(response).toBeInstanceOf(Response);
  expect(response.status).toBe(418);
  expect(response.ok).toBe(false);
  expect(await response.text()).toBe("raw");
  expect(execute.mock.calls[0][1]?.headers).toBeInstanceOf(Headers);
  await runtime.host.dispose();
});

it("插件停用取消请求及已返回的响应流，旧上下文不能再次请求", async () => {
  let signal!: AbortSignal;
  const runtime = await setup(async (_input, init) => {
    if (!init?.signal) throw new Error("缺少作用域信号");
    signal = init.signal;
    return new Response(
      new ReadableStream({
        start(controller) {
          signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
        },
      })
    );
  });
  const old = runtime.context();
  const response = await old.fetch("https://example.test");
  await runtime.host.disable("sample");
  expect(signal.aborted).toBe(true);
  await expect(response.text()).rejects.toMatchObject({ name: "AbortError" });
  await runtime.host.enable("sample");
  await expect(old.fetch("https://example.test")).rejects.toThrow();
  await runtime.host.dispose();
});

it("调用方 signal 与 Request.signal 保留，init.signal 可以按标准覆盖", async () => {
  const execute = vi.fn<typeof fetch>(async (_input, init) => {
    init?.signal?.throwIfAborted();
    return new Response("ok");
  });
  const runtime = await setup(execute);
  const original = new AbortController();
  original.abort("original");
  const request = new Request("https://example.test", { signal: original.signal });
  await expect(runtime.context().fetch(request)).rejects.toBe("original");
  expect(await (await runtime.context().fetch(request, { signal: null })).text()).toBe("ok");
  const replacement = new AbortController();
  replacement.abort("replacement");
  await expect(runtime.context().fetch(request, { signal: replacement.signal })).rejects.toBe(
    "replacement"
  );
  expect(runtime.host.getState("sample")).toBe("active");
  await runtime.host.dispose();
});

it("无执行器宿主明确拒绝，SDK 根入口在 Node 无 DOM 加载", async () => {
  expect(typeof document).toBe("undefined");
  const runtime = await setup();
  await expect(runtime.context().fetch("https://example.test")).rejects.toThrow("不支持 fetch");
  await runtime.host.dispose();
});
