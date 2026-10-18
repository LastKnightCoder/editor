import { expect, it, vi } from "vitest";
import {
  definePlugin,
  type Disposable,
  type PluginContext,
  type PluginMCPDefinition,
} from "../index";
import { PluginHost, createMemoryStorage, type MCPAdapter } from "../host";

const local = (id = "local"): PluginMCPDefinition => ({
  id,
  name: "本地工具",
  tools: [
    {
      name: "query",
      description: "查询",
      inputSchema: { type: "object", properties: {} },
      execute: () => ({ content: "结果" }),
    },
  ],
});

function setup(activate: (context: PluginContext) => void | Promise<void>) {
  const registrations: Parameters<MCPAdapter["register"]>[] = [];
  const dispose = vi.fn();
  const host = new PluginHost({
    workspaceId: "A",
    storage: createMemoryStorage(),
    mcp: {
      register: (...args) => {
        registrations.push(args);
        return { dispose };
      },
    },
  });
  host.registerTrusted(
    definePlugin({
      id: "test.mcp",
      name: "测试插件",
      version: "1.0.0",
      create: () => ({ activate }),
    })
  );
  return { host, registrations, dispose };
}

it("同一插件可注册本地和外部 MCP，激活成功才提交，停用回收", async () => {
  const test = setup(context => {
    context.mcp.register(local());
    context.mcp.register({
      id: "remote",
      name: "服务器",
      transport: { type: "stdio", command: "node", args: ["server.js"] },
    });
    expect(test.registrations).toHaveLength(0);
  });
  await test.host.enable("test.mcp");
  await test.host.enable("test.mcp");
  expect(test.registrations).toHaveLength(2);
  expect(test.registrations.map(([, definition]) => definition.id)).toEqual(["local", "remote"]);
  await test.host.disable("test.mcp");
  expect(test.dispose).toHaveBeenCalledTimes(2);
  expect(test.registrations.every(([context]) => context.signal.aborted)).toBe(true);
  await test.host.dispose();
});

it("激活失败不发布 MCP，重复 ID 拒绝，提前注销允许重注册", async () => {
  const test = setup(context => {
    const handle = context.mcp.register(local());
    expect(() => context.mcp.register(local())).toThrow("已注册");
    void handle.dispose();
    context.mcp.register(local());
    throw new Error("初始化失败");
  });
  await expect(test.host.enable("test.mcp")).rejects.toThrow("初始化失败");
  expect(test.registrations).toHaveLength(0);
  await test.host.dispose();
});

it("复制参数定义，手动注销和重启后旧执行器失效，新代次使用新身份", async () => {
  let handle!: Disposable;
  const definition = local();
  const test = setup(context => {
    handle = context.mcp.register(definition);
  });
  await test.host.enable("test.mcp");
  definition.tools![0].inputSchema.properties!.changed = { type: "string" };
  const first = test.registrations[0];
  const tool = first[1].tools![0];
  expect(tool.inputSchema.properties).toEqual({});
  const signal = new AbortController().signal;
  expect(await tool.execute({}, { signal })).toEqual({ content: "结果" });
  await handle.dispose();
  await expect(tool.execute({}, { signal })).rejects.toThrow();
  await test.host.disable("test.mcp");
  await test.host.enable("test.mcp");
  expect(test.registrations[1][2].executionIdentity).not.toBe(first[2].executionIdentity);
  await test.host.dispose();
});

it("停用取消运行信号，迟到结果不得交付", async () => {
  let resolve!: (result: { content: string }) => void;
  let executionSignal!: AbortSignal;
  const definition = local();
  definition.tools![0].execute = (_args, context) => {
    executionSignal = context.signal;
    return new Promise(done => {
      resolve = done;
    });
  };
  const test = setup(context => {
    context.mcp.register(definition);
  });
  await test.host.enable("test.mcp");
  const result = test.registrations[0][1].tools![0].execute(
    {},
    { signal: new AbortController().signal }
  );
  await test.host.disable("test.mcp");
  expect(executionSignal.aborted).toBe(true);
  resolve({ content: "迟到" });
  await expect(result).rejects.toThrow();
  await test.host.dispose();
});

it.each([
  { ...local(), transport: { type: "stdio", command: "node" } },
  { id: "missing", name: "缺少实现" },
  {
    id: "bad",
    name: "错误地址",
    transport: { type: "streamable-http", url: "file:///tmp/server" },
  },
  { id: "bad", name: "错误参数", transport: { type: "stdio", command: "node", args: [1] } },
  { ...local(), tools: [local().tools![0], local().tools![0]] },
])("无效声明在注册时拒绝：%j", async definition => {
  const test = setup(context => {
    context.mcp.register(definition as PluginMCPDefinition);
  });
  await expect(test.host.enable("test.mcp")).rejects.toThrow();
  expect(test.registrations).toHaveLength(0);
  await test.host.dispose();
});
