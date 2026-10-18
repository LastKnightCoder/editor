import { webcrypto } from "node:crypto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { definePlugin, type PluginContext, type PluginMCPDefinition } from "@tau/plugins";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import useMCPStore from "@/stores/useMCPStore";
import toolRegistry, { type RegisteredTool } from "../toolRegistry";
import { registerPluginMCP, getPluginMCPServers } from "../pluginMCP";
import {
  setServerEnabled,
  setToolsEnabled,
  reconnectServer,
  saveServer,
  useMcpServers,
  type McpServerItem,
} from "@/features/mcp/useMcpServers";
import { draftFromServer } from "@/features/mcp/serverConfig";
import { McpView } from "@/features/mcp/views/McpView";
import { McpQuickPanel } from "@/features/mcp/components/McpQuickPanel";
import { callMcpTool, connectMcpServer, disconnectMcpServer, listMcpServerTools } from "@/commands";

vi.mock("@/mcp/providers", () => ({ MCP_PROVIDERS: [] }));
vi.mock("@/features/mcp/scopedToolCatalog", () => ({ SCOPED_TOOL_GROUPS: [] }));
vi.mock("@/features/mcp/piBuiltinTools", () => ({ PI_BUILTIN_TOOLS: [] }));
vi.mock("@/tools", async () => ({
  default: (await import("../toolRegistry")).default,
  reloadCustomServer: vi.fn(),
}));
vi.mock("@/stores/useSettingStore", async () => ({
  default: (await import("zustand")).create(() => ({ setting: { imageGeneration: {} } })),
}));
vi.mock("@/commands", () => ({
  ensureModule: vi.fn(async () => undefined),
  connectMcpServer: vi.fn(async () => undefined),
  disconnectMcpServer: vi.fn(async () => undefined),
  isMcpServerConnected: vi.fn(async () => false),
  listMcpServerTools: vi.fn(async () => [
    { name: "lookup", description: "远端查询", inputSchema: { type: "object", properties: {} } },
  ]),
  callMcpTool: vi.fn(async () => ({ content: [{ type: "text", text: "远端结果" }] })),
}));

const hosts: PluginHost[] = [];
let root: Root | undefined;
let container: HTMLDivElement;
let items: McpServerItem[] = [];
const local = (id: string): PluginMCPDefinition => ({
  id,
  name: `本地 ${id}`,
  tools: [
    {
      name: "lookup",
      description: "查询插件数据",
      inputSchema: { type: "object", properties: {} },
      execute: () => ({ content: id }),
    },
  ],
});
function host(definitions: PluginMCPDefinition[], id = "test.mcp") {
  const instance = new PluginHost({
    workspaceId: "workspace-A",
    storage: createMemoryStorage(),
    mcp: {
      register: (context, definition, owner) =>
        registerPluginMCP(context, definition, owner, "db-A"),
    },
  });
  instance.registerTrusted(
    definePlugin({
      id,
      name: "MCP 测试插件",
      version: "1.0.0",
      create: () => ({
        activate: (context: PluginContext) => {
          definitions.forEach(definition => context.mcp.register(definition));
        },
      }),
    })
  );
  hosts.push(instance);
  return instance;
}
function HostView() {
  items = useMcpServers().custom;
  return (
    <>
      <McpView />
      <McpQuickPanel onClose={() => undefined} />
    </>
  );
}
async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<HostView />));
}
async function ready(count: number) {
  await act(async () => {
    await vi.waitFor(() => expect(toolRegistry.getRegisteredTools()).toHaveLength(count));
  });
}
const execute = (tool: RegisteredTool, databaseName = "db-A") =>
  tool.executor(
    {},
    {
      databaseName,
      toolCallId: "call",
      toolName: tool.name,
      source: tool.source,
    }
  );

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  useMCPStore.setState({
    providerStates: {},
    customServers: [],
    pluginTransports: {},
    disabledTools: {},
    serverTools: {},
    connectionStatus: {},
    connectionErrors: {},
  });
  vi.clearAllMocks();
});
afterEach(async () => {
  await act(async () => {
    for (const instance of hosts.splice(0)) await instance.dispose();
  });
  if (root) {
    act(() => root!.unmount());
    root = undefined;
    container.remove();
  }
  items = [];
  vi.unstubAllGlobals();
});

it("多个 MCP 直接出现在现有卡片和快捷面板，整项关闭不影响插件和其他 MCP", async () => {
  const instance = host([local("books"), local("notes")]);
  await instance.enable("test.mcp");
  await ready(2);
  await render();
  expect(
    [...container.querySelectorAll("article")].filter(card =>
      card.textContent?.includes("来自 MCP 测试插件")
    )
  ).toHaveLength(2);
  expect(container.textContent).toContain("来自 MCP 测试插件");
  const names = toolRegistry.getRegisteredTools().map(tool => tool.name);
  expect(new Set(names).size).toBe(2);
  expect(names.every(name => name.length <= 64)).toBe(true);
  const first = items.find(item => item.name === "本地 books")!;
  await act(async () => {
    (container.querySelector('[aria-label="停用 本地 books"]') as HTMLButtonElement).click();
  });
  expect(instance.getState("test.mcp")).toBe("active");
  expect(toolRegistry.getRegisteredTools()).toHaveLength(1);
  expect(container.querySelectorAll('[aria-label="启用 本地 books"]')).toHaveLength(2);
  expect(useMCPStore.getState().providerStates[first.id].enabled).toBe(false);
});

it("详情逐工具开关即时拦截旧快照，停用重启保留偏好和稳定工具名", async () => {
  const instance = host([local("books")]);
  await instance.enable("test.mcp");
  await ready(1);
  const first = toolRegistry.getRegisteredTools()[0];
  await render();
  await act(async () => (container.querySelector("article") as HTMLElement).click());
  const toggle = document.querySelector(`[aria-label="停用 ${first.name}"]`) as HTMLButtonElement;
  expect(toggle).not.toBeNull();
  await act(async () => toggle.click());
  await expect(execute(first)).rejects.toThrow("停用");
  await act(async () => {
    await instance.disable("test.mcp");
    await instance.enable("test.mcp");
  });
  await ready(1);
  const second = toolRegistry.getRegisteredTools()[0];
  expect(second.name).toBe(first.name);
  expect(second.executionIdentity).not.toBe(first.executionIdentity);
  expect(second.enabled).toBe(false);
  await expect(execute(first)).rejects.toThrow("实例已变化");
  await act(async () => setToolsEnabled(items[0], [second.name], true));
  expect(await execute(second)).toEqual({ content: "books" });
});

it("跨库和插件停用拒绝旧工具，在途调用即使忽略取消也结束等待", async () => {
  let resolve!: (value: { content: string }) => void;
  const definition = local("books");
  definition.tools![0].execute = () =>
    new Promise(done => {
      resolve = done;
    });
  const instance = host([definition]);
  await instance.enable("test.mcp");
  await ready(1);
  const first = toolRegistry.getRegisteredTools()[0];
  await expect(execute(first, "db-B")).rejects.toThrow("数据库");
  const pending = execute(first);
  const rejected = expect(pending).rejects.toBeDefined();
  await instance.disable("test.mcp");
  await rejected;
  resolve({ content: "迟到" });
  expect(getPluginMCPServers()).toEqual([]);
  expect(toolRegistry.getRegisteredTools()).toEqual([]);
  await expect(execute(first)).rejects.toThrow("停用");
});

it("外部服务器复用连接和调用，改配置与重连使旧快照失效，停用回收连接", async () => {
  const instance = host([
    {
      id: "remote",
      name: "远端 MCP",
      transport: { type: "streamable-http", url: "https://example.invalid/mcp" },
    },
  ]);
  await instance.enable("test.mcp");
  await ready(1);
  await render();
  expect(connectMcpServer).toHaveBeenCalledWith(
    expect.objectContaining({ id: expect.stringMatching(/^plugin:/) }),
    true
  );
  expect(useMCPStore.getState().customServers).toEqual([]);
  const first = toolRegistry.getRegisteredTools()[0];
  expect(await execute(first)).toEqual({ content: "远端结果" });
  expect(callMcpTool).toHaveBeenCalledWith(
    expect.objectContaining({ toolName: "lookup" }),
    expect.anything()
  );
  const draft = draftFromServer(items[0].server!);
  draft.url = "https://other.invalid/mcp";
  await act(async () => {
    await saveServer(draft, items[0].id);
  });
  await ready(1);
  await expect(execute(first)).rejects.toThrow("实例已变化");
  expect(connectMcpServer).toHaveBeenLastCalledWith(
    expect.objectContaining({ transport: expect.objectContaining({ url: draft.url }) }),
    true
  );
  expect(useMCPStore.getState().pluginTransports[items[0].id]).toMatchObject({ url: draft.url });
  const second = toolRegistry.getRegisteredTools()[0];
  await act(async () => {
    await reconnectServer(items[0].id);
  });
  await expect(execute(second)).rejects.toThrow("实例已变化");
  await act(async () => {
    await setServerEnabled(items[0], false);
  });
  expect(disconnectMcpServer).toHaveBeenCalled();
  expect(toolRegistry.getRegisteredTools()).toEqual([]);
});

it("等待远端工具列表时停用，迟到结果不能重新注册", async () => {
  let resolve!: (value: unknown[]) => void;
  vi.mocked(listMcpServerTools).mockImplementationOnce(
    () =>
      new Promise(done => {
        resolve = done;
      })
  );
  const instance = host([
    { id: "remote", name: "慢 MCP", transport: { type: "stdio", command: "node" } },
  ]);
  await instance.enable("test.mcp");
  await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
  await instance.disable("test.mcp");
  resolve([{ name: "late", inputSchema: { type: "object", properties: {} } }]);
  await new Promise(done => setTimeout(done, 20));
  expect(toolRegistry.getRegisteredTools()).toEqual([]);
  expect(getPluginMCPServers()).toEqual([]);
  expect(disconnectMcpServer).toHaveBeenCalled();
});

it("同一 ID 改为本地工具后，不复用旧外部服务器的连接覆盖", async () => {
  useMCPStore.getState().setPluginTransport("plugin:test.mcp:books", {
    type: "streamable-http",
    url: "https://old.invalid/mcp",
  });
  const instance = host([local("books")]);
  await instance.enable("test.mcp");
  await ready(1);
  expect(getPluginMCPServers()[0].server).toBeUndefined();
  expect(connectMcpServer).not.toHaveBeenCalled();
  expect(await execute(toolRegistry.getRegisteredTools()[0])).toEqual({ content: "books" });
});
