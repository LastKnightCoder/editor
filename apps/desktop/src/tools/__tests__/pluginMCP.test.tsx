import { webcrypto } from "node:crypto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  definePlugin,
  type PluginContext,
  type PluginMCPDefinition,
  type ToolCallExecutionState,
} from "@tau/plugins";
import { ToolCallDisplay, ToolCallBlock } from "@tau/chat-ui";
import { desktopPluginChat } from "@/app/plugins/chat";
import { getPluginToolName } from "../plugin-tool-name";
import { piEntriesToDesktopMessages } from "../../../src-electron/main/modules/pi-session-transcript";
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
function host(
  definitions: PluginMCPDefinition[],
  id = "test.mcp",
  activate?: (context: PluginContext) => Promise<void>
) {
  const instance = new PluginHost({
    workspaceId: "workspace-A",
    storage: createMemoryStorage(),
    chat: desktopPluginChat,
    mcp: {
      register: (context, definition, owner) =>
        registerPluginMCP(context, definition, owner, "db-A"),
    },
  });
  instance.registerTrusted({
    ...definePlugin({
      id,
      name: "MCP 测试插件",
      version: "1.0.0",
      create: () => ({
        activate: async (context: PluginContext) => {
          definitions.forEach(definition => context.mcp.register(definition));
          await activate?.(context);
        },
      }),
    }),
    backend: {
      entry: "backend.js",
      runtime: "node",
      apiVersion: 1,
      scope: "workspace",
      activation: "on-demand",
      lifetime: "idle",
      reason: "测试外部 MCP",
      systemAccess: ["process"],
      tools: definitions.flatMap(definition =>
        definition.transport?.type === "stdio"
          ? [
              {
                id: definition.id,
                command: definition.transport.command,
                args: definition.transport.args,
              },
            ]
          : []
      ),
    },
  });
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
  expect(await execute(second)).toMatchObject({
    content: "books",
    metadata: { render: { rendererKey: second.name } },
  });
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
    true,
    "test.mcp"
  );
  expect(useMCPStore.getState().customServers).toEqual([]);
  const first = toolRegistry.getRegisteredTools()[0];
  expect(await execute(first)).toMatchObject({
    content: "远端结果",
    metadata: { render: { rendererKey: first.name } },
  });
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
    true,
    "test.mcp"
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
  expect(await execute(toolRegistry.getRegisteredTools()[0])).toMatchObject({ content: "books" });
});

it("命名保持既有固定向量，并隔离插件和 MCP", async () => {
  const name = await getPluginToolName("test.mcp", "notes", "lookup");
  expect(name).toBe("plugin_c8f8c15ff486e548_lookup");
  expect(await getPluginToolName("other", "notes", "lookup")).not.toBe(name);
  expect(await getPluginToolName("test.mcp", "books", "lookup")).not.toBe(name);
});

it.each(["实时", "历史"])("%s 消息传给插件时不泄漏可变宿主引用", async source => {
  const name = await getPluginToolName("test.mcp", "notes", "lookup");
  const instance = host([local("notes")], "test.mcp", async context => {
    await context.chat.registerToolRenderer({
      mcpId: "notes",
      toolName: "lookup",
      component: props => {
        Object.assign(props.execution, { output: "组件内修改" });
        const metadata = props.execution.metadata;
        if (metadata) {
          metadata.changed = true;
          (metadata.render as { payload: { label: string } }).payload.label = "组件内修改";
        }
        return <span>组件已读取</span>;
      },
    });
  });
  await instance.enable("test.mcp");
  const execution: ToolCallExecutionState = {
    toolCallId: "readonly",
    toolName: name,
    input: "{}",
    status: "success",
    timestamp: 1,
    output: "原始文本",
    metadata: { render: { rendererKey: name, version: 1, payload: { label: "原始数据" } } },
  };
  let displayed = execution;
  if (source === "历史") {
    const [message] = piEntriesToDesktopMessages([
      {
        id: "a",
        message: {
          role: "assistant",
          content: [{ type: "toolCall", id: execution.toolCallId, name, arguments: {} }],
        },
      },
      {
        id: "r",
        message: {
          role: "toolResult",
          toolCallId: execution.toolCallId,
          toolName: name,
          content: [{ type: "text", text: execution.output }],
          details: execution.metadata,
        },
      },
    ]);
    displayed = (message as { assistant_blocks: { execution: ToolCallExecutionState }[] })
      .assistant_blocks[0].execution;
  }
  const before = structuredClone(displayed);
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root!.render(<ToolCallDisplay executions={[displayed]} />));
  expect(container.textContent).toBe("组件已读取");
  expect(displayed).toEqual(before);
});

it("历史回放中其他来源的 rendererKey 不能挂载本插件组件", async () => {
  const component = vi.fn(() => <span>插件私有组件</span>);
  const name = await getPluginToolName("test.mcp", "notes", "lookup");
  const instance = host([local("notes")], "test.mcp", async context => {
    await context.chat.registerToolRenderer({ mcpId: "notes", toolName: "lookup", component });
  });
  await instance.enable("test.mcp");
  const [message] = piEntriesToDesktopMessages([
    {
      id: "a",
      message: {
        role: "assistant",
        content: [
          { type: "toolCall", id: "external-call", name: "external_lookup", arguments: {} },
        ],
      },
    },
    {
      id: "r",
      message: {
        role: "toolResult",
        toolCallId: "external-call",
        toolName: "external_lookup",
        content: [{ type: "text", text: "其他来源结果" }],
        details: { render: { rendererKey: name, version: 1, payload: { count: 42 } } },
      },
    },
  ]);
  const execution = (message as { assistant_blocks: { execution: ToolCallExecutionState }[] })
    .assistant_blocks[0].execution;
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <ToolCallDisplay
        executions={[execution]}
        renderDefaultItem={({ execution }) => <span>{execution.output}</span>}
      />
    )
  );
  expect(container.textContent).toBe("其他来源结果");
  expect(component).not.toHaveBeenCalled();
});

it("本地展示数据贯通历史投影，MCP 关闭后可读，插件停用与重启即时切换", async () => {
  const definition = local("notes");
  definition.tools![0].execute = () => ({
    content: "模型文本",
    render: { version: 1, data: { label: "真实结果" } },
  });
  const instance = host([definition], "test.mcp", async context => {
    await context.chat.registerToolRenderer({
      mcpId: "notes",
      toolName: "lookup",
      component: ({ execution, dataVersion, data, renderDefault }) =>
        execution.status === "executing" ? (
          <span>执行中</span>
        ) : dataVersion === 1 && data && typeof data === "object" && !Array.isArray(data) ? (
          <span>{String(data.label)}</span>
        ) : (
          renderDefault()
        ),
    });
  });
  await instance.enable("test.mcp");
  await ready(1);
  const tool = toolRegistry.getRegisteredTools()[0];
  const result = await execute(tool);
  expect(result).toMatchObject({
    content: "模型文本",
    metadata: {
      render: {
        rendererKey: tool.name,
        version: 1,
        payload: { label: "真实结果" },
      },
    },
  });
  const [message] = piEntriesToDesktopMessages([
    {
      id: "a",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: "call", name: tool.name, arguments: {} }],
      },
    },
    {
      id: "t",
      message: {
        role: "toolResult",
        toolCallId: "call",
        toolName: tool.name,
        content: [{ type: "text", text: "模型文本" }],
        details: typeof result === "object" ? result?.metadata : undefined,
      },
    },
  ]);
  const execution = (message as { assistant_blocks: { execution?: ToolCallExecutionState }[] })
    .assistant_blocks[0].execution!;
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () =>
    root!.render(<ToolCallDisplay executions={[{ ...execution, status: "executing" }]} />)
  );
  expect(container.textContent).toBe("执行中");
  await act(async () => root!.render(<ToolCallDisplay executions={[execution]} />));
  expect(container.textContent).toBe("真实结果");
  await act(async () => useMCPStore.getState().setProviderEnabled(tool.source, false));
  expect(container.textContent).toBe("真实结果");
  await expect(execute(tool)).rejects.toThrow();
  await act(async () => instance.disable("test.mcp"));
  await act(async () => container.querySelector("button")!.click());
  expect(container.textContent).toContain("模型文本");
  await act(async () => instance.enable("test.mcp"));
  expect(container.textContent).toBe("真实结果");
  await act(async () =>
    root!.render(
      <ToolCallDisplay executions={[{ ...execution, status: "failed", output: "执行失败" }]} />
    )
  );
  expect(container.textContent).toContain("执行失败");
  expect(container.textContent).not.toContain("真实结果");
  await act(async () =>
    root!.render(
      <ToolCallBlock
        execution={{ ...execution, status: "awaiting-approval" }}
        isDark={false}
        renderApproval={() => <span>宿主审批</span>}
      />
    )
  );
  expect(container.textContent).toContain("宿主审批");
  expect(container.textContent).not.toContain("真实结果");
});

it("transport 返回不能选择别的渲染器，离线声明仍可展示既有输出", async () => {
  vi.mocked(callMcpTool).mockResolvedValueOnce({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          content: "远端结果",
          metadata: {
            render: { rendererKey: "内置渲染器", version: 1, payload: { value: "不应接收" } },
          },
        }),
      },
    ],
  });
  const instance = host(
    [{ id: "remote", name: "外部", transport: { type: "stdio", command: "node" } }],
    "test.mcp",
    async context => {
      await context.chat.registerToolRenderer({
        mcpId: "remote",
        toolName: "lookup",
        component: props => <span>{props.execution.output}</span>,
      });
    }
  );
  await instance.enable("test.mcp");
  await ready(1);
  const tool = toolRegistry.getRegisteredTools()[0];
  const result = await execute(tool);
  expect(result).toMatchObject({ metadata: { render: { rendererKey: tool.name } } });
  if (!result || typeof result === "string") throw new Error("工具没有返回对象结果");
  expect(result.metadata?.render).not.toHaveProperty("payload");
  await act(async () => useMCPStore.getState().setProviderEnabled(tool.source, false));
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <ToolCallDisplay
        executions={[
          {
            toolCallId: "remote-call",
            toolName: tool.name,
            status: "success",
            input: "{}",
            timestamp: 1,
            output: "远端结果",
          },
        ]}
      />
    )
  );
  expect(container.textContent).toBe("远端结果");
});
