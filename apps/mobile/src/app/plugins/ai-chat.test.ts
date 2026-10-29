// @vitest-environment node
import { expect, it, vi } from "vitest";
import { definePlugin } from "@tau/plugins";
import { createMemoryStorage, PluginHost } from "@tau/plugins/host";
import { getPluginToolId, getPluginToolName } from "@tau/ai/tool-identity";
import { createMobilePluginChat } from "./ai-chat";

it("渲染器在激活成功后按当前名称与历史ID发布，停用回收但不依赖工具开关", async () => {
  const registry = createMobilePluginChat();
  let before: unknown;
  const Component = () => null;
  const name = await getPluginToolName("test.reader", "books", "read_book");
  const id = await getPluginToolId("test.reader", "books", "read_book");
  const host = new PluginHost({
    environment: { platform: "ios", input: { coarsePointer: true, finePointer: false } },
    workspaceId: "one.db",
    storage: createMemoryStorage(),
    chat: registry.adapter,
    mcp: { register: () => ({ dispose: vi.fn() }) },
  });
  host.registerTrusted(
    definePlugin({
      id: "test.reader",
      name: "阅读",
      version: "1.0.0",
      create: () => ({
        async activate(context) {
          context.mcp.register({
            id: "books",
            name: "书籍",
            tools: [
              {
                name: "read_book",
                description: "读书",
                inputSchema: { type: "object" },
                execute: () => ({ content: "正文" }),
              },
            ],
          });
          await context.chat.registerToolRenderer({
            mcpId: "books",
            toolName: "read_book",
            component: Component,
          });
          before = registry.resolve(name);
        },
      }),
    })
  );
  try {
    await host.enable("test.reader");
    expect(before).toBeUndefined();
    expect(registry.resolve(name)?.component).toBe(Component);
    expect(registry.resolve(id)).toBe(registry.resolve(name));
    await host.disable("test.reader");
    expect(registry.resolve(name)).toBeUndefined();
    expect(registry.resolve(id)).toBeUndefined();
  } finally {
    await host.dispose();
    registry.dispose();
  }
});

it("渲染器引用未注册的工具时激活失败，预备声明不残留", async () => {
  const registry = createMobilePluginChat();
  const host = new PluginHost({
    environment: { platform: "ios", input: { coarsePointer: true, finePointer: false } },
    workspaceId: "one.db",
    storage: createMemoryStorage(),
    chat: registry.adapter,
  });
  host.registerTrusted(
    definePlugin({
      id: "test.reader",
      name: "阅读",
      version: "1.0.0",
      create: () => ({
        async activate(context) {
          await context.chat.registerToolRenderer({
            mcpId: "missing",
            toolName: "tool",
            component: () => null,
          });
        },
      }),
    })
  );
  try {
    await expect(host.enable("test.reader")).rejects.toThrow("已注册");
    expect(
      registry.resolve(await getPluginToolId("test.reader", "missing", "tool"))
    ).toBeUndefined();
  } finally {
    await host.dispose();
    registry.dispose();
  }
});
