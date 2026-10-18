import type { Disposable } from "./contract";
import type { JsonValue } from "./json";
import { assertLocalId, copyJson } from "./values";

export type PluginMCPTransport =
  | { type: "stdio"; command: string; args?: string[]; env?: Record<string, string>; cwd?: string }
  | { type: "streamable-http"; url: string; headers?: Record<string, string> };

export interface PluginMCPToolResult {
  content: string;
  render?: { version: number; data: JsonValue };
}

export interface PluginMCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, JsonValue>;
    [key: string]: JsonValue | undefined;
  };
  execute(
    args: Record<string, JsonValue>,
    context: { signal: AbortSignal }
  ): Promise<PluginMCPToolResult> | PluginMCPToolResult;
}

export type PluginMCPDefinition = {
  id: string;
  name: string;
  description?: string;
} & (
  | { tools: readonly PluginMCPTool[]; transport?: never }
  | { transport: PluginMCPTransport; tools?: never }
);

export interface PluginMCP {
  /** 同一插件可注册多个 MCP；停用时由宿主自动回收。 */
  register(definition: PluginMCPDefinition): Disposable;
}

export function snapshotMCPToolResult(result: PluginMCPToolResult): PluginMCPToolResult {
  if (!result || typeof result.content !== "string")
    throw new Error("插件 MCP 工具必须返回文本 content");
  if (result.render === undefined) return { content: result.content };
  if (!result.render || !Number.isSafeInteger(result.render.version) || result.render.version < 1)
    throw new Error("工具展示数据需要正整数版本");
  return {
    content: result.content,
    render: { version: result.render.version, data: copyJson(result.render.data) },
  };
}

export function snapshotMCPDefinition(definition: PluginMCPDefinition): PluginMCPDefinition {
  assertLocalId(definition.id);
  if (!definition.name?.trim()) throw new Error("MCP 名称不能为空");
  if ((definition.tools === undefined) === (definition.transport === undefined))
    throw new Error("MCP 必须且只能提供 tools 或 transport");
  const base = {
    id: definition.id,
    name: definition.name.trim(),
    description: definition.description,
  };
  if (definition.transport) {
    const transport = copyJson(definition.transport) as unknown as PluginMCPTransport;
    if (transport.type === "stdio") {
      if (!transport.command?.trim()) throw new Error("MCP 启动命令不能为空");
      if (
        transport.args &&
        (!Array.isArray(transport.args) || transport.args.some(arg => typeof arg !== "string"))
      )
        throw new Error("MCP 启动参数必须为字符串数组");
      if (transport.cwd !== undefined && typeof transport.cwd !== "string")
        throw new Error("MCP 工作目录无效");
    } else if (transport.type === "streamable-http") {
      if (!["http:", "https:"].includes(new URL(transport.url).protocol))
        throw new Error("MCP URL 必须为 HTTP 地址");
    } else throw new Error("不支持的 MCP 传输方式");
    const values = transport.type === "stdio" ? transport.env : transport.headers;
    if (
      values &&
      (typeof values !== "object" ||
        Array.isArray(values) ||
        Object.values(values).some(value => typeof value !== "string"))
    )
      throw new Error("MCP 环境变量和请求头必须为字符串映射");
    return { ...base, transport };
  }
  if (!Array.isArray(definition.tools)) throw new Error("MCP tools 必须为数组");
  const names = new Set<string>();
  return {
    ...base,
    tools: definition.tools.map(tool => {
      assertLocalId(tool.name);
      if (names.has(tool.name) || !tool.description?.trim() || typeof tool.execute !== "function")
        throw new Error("MCP 工具名称重复或定义不完整");
      names.add(tool.name);
      const inputSchema = copyJson(tool.inputSchema) as PluginMCPTool["inputSchema"];
      if (inputSchema.type !== "object") throw new Error("MCP 工具参数必须为对象 Schema");
      return { name: tool.name, description: tool.description, inputSchema, execute: tool.execute };
    }),
  };
}
