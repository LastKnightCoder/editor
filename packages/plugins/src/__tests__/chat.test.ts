import { expect, it, vi } from "vitest";
import { definePlugin, type PluginContext, type Disposable } from "../index";
import { PluginHost, createMemoryStorage, type ChatAdapter } from "../host";
import { snapshotMCPToolResult } from "../mcp";

const renderer = { mcpId: "notes", toolName: "query", component: () => null };
const local = {
  id: "notes",
  name: "笔记",
  tools: [
    {
      name: "query",
      description: "查询",
      inputSchema: { type: "object" as const },
      execute: () => ({ content: "结果" }),
    },
  ],
};

function setup(
  activate: (context: PluginContext) => void | Promise<void>,
  prepare?: ChatAdapter["prepare"]
) {
  const dispose = vi.fn();
  const publish = vi.fn(() => ({ dispose }));
  const host = new PluginHost({
    environment: { platform: "desktop", input: { coarsePointer: false, finePointer: true } },
    workspaceId: "A",
    storage: createMemoryStorage(),
    mcp: { register: () => ({ dispose() {} }) },
    chat: { prepare: prepare ?? (async () => publish) },
  });
  host.registerTrusted(
    definePlugin({
      id: "test.chat",
      name: "测试插件",
      version: "1.0.0",
      create: () => ({ activate }),
    })
  );
  return { host, publish, dispose };
}

it("支持先声明展示，全部激活成功才发布，停用使上下文和句柄失效", async () => {
  let context!: PluginContext;
  const test = setup(async value => {
    context = value;
    await context.chat.registerToolRenderer(renderer);
    expect(test.publish).not.toHaveBeenCalled();
    context.mcp.register(local);
  });
  await test.host.enable("test.chat");
  expect(test.publish).toHaveBeenCalledTimes(1);
  await test.host.disable("test.chat");
  expect(context.signal.aborted).toBe(true);
  expect(test.dispose).toHaveBeenCalledTimes(1);
  await expect(context.chat.registerToolRenderer(renderer)).rejects.toThrow();
  await test.host.dispose();
});

it.each(["激活异常", "MCP 缺失", "工具缺失"])("%s 不发布任何工具展示", async scenario => {
  const test = setup(async context => {
    await context.chat.registerToolRenderer({
      ...renderer,
      toolName: scenario === "工具缺失" ? "missing" : "query",
    });
    if (scenario !== "MCP 缺失") context.mcp.register(local);
    if (scenario === "激活异常") throw new Error("激活异常");
  });
  await expect(test.host.enable("test.chat")).rejects.toThrow();
  expect(test.publish).not.toHaveBeenCalled();
  await test.host.dispose();
});

it("重复目标拒绝，提前注销后可重新声明，关闭 MCP 不回收展示", async () => {
  let mcp!: Disposable;
  const test = setup(async context => {
    mcp = context.mcp.register(local);
    const handle = await context.chat.registerToolRenderer(renderer);
    await expect(context.chat.registerToolRenderer(renderer)).rejects.toThrow("已注册");
    await handle.dispose();
    await context.chat.registerToolRenderer(renderer);
  });
  await test.host.enable("test.chat");
  expect(test.publish).toHaveBeenCalledTimes(1);
  await mcp.dispose();
  expect(test.dispose).not.toHaveBeenCalled();
  await test.host.dispose();
  expect(test.dispose).toHaveBeenCalledTimes(1);
});

it("远端未连接仍可绑定原名，激活后的动态声明也校验归属", async () => {
  let context!: PluginContext;
  const test = setup(async value => {
    context = value;
    context.mcp.register({
      id: "notes",
      name: "远端",
      transport: { type: "streamable-http", url: "https://example.invalid/mcp" },
    });
    await context.chat.registerToolRenderer(renderer);
  });
  await test.host.enable("test.chat");
  await expect(context.chat.registerToolRenderer({ ...renderer, mcpId: "other" })).rejects.toThrow(
    "本插件"
  );
  expect(test.publish).toHaveBeenCalledTimes(1);
  await test.host.dispose();
});

it("名称准备期间停用，迟到的准备结果不会发布", async () => {
  let finish!: (commit: () => Disposable) => void;
  let started!: () => void;
  const preparing = new Promise<void>(resolve => {
    started = resolve;
  });
  const commit = vi.fn(() => ({ dispose() {} }));
  const test = setup(
    async context => {
      context.mcp.register(local);
      await context.chat.registerToolRenderer(renderer);
    },
    async () => {
      started();
      return new Promise(resolve => {
        finish = resolve;
      });
    }
  );
  const enabled = test.host.enable("test.chat");
  const rejected = expect(enabled).rejects.toThrow();
  await preparing;
  const disabled = test.host.disable("test.chat");
  finish(commit);
  await rejected;
  await disabled;
  expect(commit).not.toHaveBeenCalled();
  await test.host.dispose();
});

it("准备或发布异常可清理后重试", async () => {
  const failure = vi
    .fn<ChatAdapter["prepare"]>()
    .mockRejectedValueOnce(new Error("准备失败"))
    .mockResolvedValueOnce(() => {
      throw new Error("发布失败");
    })
    .mockResolvedValue(() => ({ dispose() {} }));
  const test = setup(async context => {
    context.mcp.register(local);
    await context.chat.registerToolRenderer(renderer);
  }, failure);
  await expect(test.host.enable("test.chat")).rejects.toThrow("准备失败");
  await expect(test.host.enable("test.chat")).rejects.toThrow("发布失败");
  await test.host.enable("test.chat");
  expect(test.host.getState("test.chat")).toBe("active");
  await test.host.dispose();
});

it("工具展示数据复制并校验版本，未声明 metadata 不穿透作者边界", () => {
  const source = {
    content: "文本",
    render: { version: 1, data: { count: 1 } },
    metadata: { secret: true },
  };
  const result = snapshotMCPToolResult(source);
  source.render.data.count = 2;
  expect(result).toEqual({ content: "文本", render: { version: 1, data: { count: 1 } } });
  for (const version of [0, -1, 1.5, NaN, Infinity])
    expect(() =>
      snapshotMCPToolResult({ content: "文本", render: { version, data: null } })
    ).toThrow("正整数");
  expect(() =>
    snapshotMCPToolResult({ content: "文本", render: { version: 1, data: new Date() as never } })
  ).toThrow("JSON");
});

it.each([false, true])("TTS 与聊天渲染共存，激活失败=%s 时按同一生命周期回收", async fail => {
  const ttsDispose = vi.fn();
  const chatDispose = vi.fn();
  const chatCommit = vi.fn(() => ({ dispose: chatDispose }));
  const host = new PluginHost({
    environment: { platform: "desktop", input: { coarsePointer: false, finePointer: true } },
    workspaceId: "combined",
    storage: createMemoryStorage(),
    tts: { register: () => ({ dispose: ttsDispose }) },
    mcp: { register: () => ({ dispose() {} }) },
    chat: { prepare: async () => chatCommit },
  });
  host.registerTrusted(
    definePlugin({
      id: "test.combined",
      name: "组合插件",
      version: "1.0.0",
      create: () => ({
        async activate(context) {
          context.tts.register({
            id: context.pluginId,
            name: "语音",
            create: () => ({
              getVoices: async () => [],
              synthesize: async () => ({ audio: new Uint8Array(), mime: "audio/wav" }),
            }),
          });
          context.mcp.register(local);
          await context.chat.registerToolRenderer(renderer);
          if (fail) throw new Error("组合激活失败");
        },
      }),
    })
  );
  try {
    if (fail) {
      await expect(host.enable("test.combined")).rejects.toThrow("组合激活失败");
      expect(chatCommit).not.toHaveBeenCalled();
    } else {
      await host.enable("test.combined");
      expect(chatCommit).toHaveBeenCalledTimes(1);
      await host.disable("test.combined");
      expect(chatDispose).toHaveBeenCalledTimes(1);
    }
    expect(ttsDispose).toHaveBeenCalledTimes(1);
  } finally {
    await host.dispose();
  }
});
