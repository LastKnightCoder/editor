import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  invalidate: vi.fn(async () => undefined),
}));
vi.mock("@/commands/plugin-ai", () => ({ invokePluginAI: mocks.invoke }));
vi.mock("@/electron", () => ({ on: mocks.on, off: mocks.off }));
vi.mock("@/queryClient", () => ({ queryClient: { invalidateQueries: mocks.invalidate } }));
vi.mock("@/services/page-navigation", () => ({ openPage: vi.fn() }));

import { desktopPluginAI } from "../ai";

afterEach(() => vi.resetAllMocks());

it("通用能力绑定保留插件身份并固定模型来源，不要求自定义功能声明", async () => {
  mocks.invoke.mockImplementation(async channel => {
    if (channel === "register") return "capability-session";
    if (channel === "run") return { ok: true, result: { text: "标题", usage: null } };
    return undefined;
  });
  const lifetime = new AbortController();
  const client = await desktopPluginAI.bindCapability(
    { id: "test.title", name: "标题插件" },
    "titleSummary",
    lifetime.signal
  );
  expect(mocks.invoke).toHaveBeenCalledWith("register", {
    id: "test.title",
    name: "标题插件",
    features: [],
    hostFeature: "titleSummary",
  });
  expect(await client.chat({ messages: [{ role: "user", content: "资料" }] })).toEqual({
    text: "标题",
    usage: null,
  });
  expect(mocks.invoke).toHaveBeenCalledWith(
    "run",
    expect.objectContaining({
      session: "capability-session",
      input: expect.objectContaining({
        feature: "titleSummary",
        messages: [{ role: "user", content: "资料" }],
      }),
    })
  );
  expect(mocks.off).toHaveBeenCalledWith("plugin-ai:delta", expect.any(Function));
  lifetime.abort();
  expect(mocks.invoke).toHaveBeenCalledWith("unregister", "capability-session");
});
