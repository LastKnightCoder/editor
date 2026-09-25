/**
 * MCP 服务器配置的纯函数层：表单草稿 ⇄ 存储结构、`mcpServers` JSON 导入 / 导出。
 *
 * 导入兼容 Claude Desktop / Cursor（`mcpServers`）与 VS Code（`servers`）两种外层，
 * 也接受裸的「名称 → 配置」映射与单个服务器对象。传输只支持 stdio 与 streamable-http；
 * SSE 等其他传输给出警告、不导入。
 */

import type { CustomMCPServer, TransportConfig } from "@/stores/useMCPStore";

export type TransportType = TransportConfig["type"];

export interface KeyValue {
  key: string;
  value: string;
}

export interface ServerDraft {
  name: string;
  description: string;
  type: TransportType;
  command: string;
  args: string[];
  env: KeyValue[];
  cwd: string;
  url: string;
  headers: KeyValue[];
}

export interface ServerPayload {
  name: string;
  description?: string;
  transport: TransportConfig;
}

export interface ImportEntry {
  draft: ServerDraft;
  /** 无法导入的原因（有值时该项不导入） */
  error?: string;
}

export const emptyDraft = (): ServerDraft => ({
  name: "",
  description: "",
  type: "stdio",
  command: "",
  args: [],
  env: [],
  cwd: "",
  url: "",
  headers: [],
});

const toPairs = (record?: Record<string, string>): KeyValue[] =>
  Object.entries(record ?? {}).map(([key, value]) => ({ key, value: String(value) }));

const toRecord = (pairs: KeyValue[]): Record<string, string> | undefined => {
  const entries = pairs
    .map(({ key, value }) => [key.trim(), value] as const)
    .filter(([key]) => key.length > 0);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

export function draftFromServer(server: CustomMCPServer): ServerDraft {
  const { transport } = server;
  const base = { ...emptyDraft(), name: server.name, description: server.description ?? "" };
  if (transport.type === "stdio") {
    return {
      ...base,
      type: "stdio",
      command: transport.command,
      args: transport.args ?? [],
      env: toPairs(transport.env),
      cwd: transport.cwd ?? "",
    };
  }
  return {
    ...base,
    type: "streamable-http",
    url: transport.url,
    headers: toPairs(transport.headers),
  };
}

/** 返回第一条校验错误；null = 可以保存 */
export function validateDraft(draft: ServerDraft): string | null {
  if (!draft.name.trim()) return "请填写名称";
  if (draft.type === "stdio") {
    if (!draft.command.trim()) return "请填写启动命令";
    return null;
  }
  const url = draft.url.trim();
  if (!url) return "请填写服务器 URL";
  if (!/^https?:\/\//i.test(url)) return "URL 需以 http:// 或 https:// 开头";
  return null;
}

export function draftToPayload(draft: ServerDraft): ServerPayload {
  const description = draft.description.trim() || undefined;
  if (draft.type === "stdio") {
    const args = draft.args.map(arg => arg.trim()).filter(Boolean);
    return {
      name: draft.name.trim(),
      description,
      transport: {
        type: "stdio",
        command: draft.command.trim(),
        ...(args.length > 0 ? { args } : {}),
        ...(toRecord(draft.env) ? { env: toRecord(draft.env) } : {}),
        ...(draft.cwd.trim() ? { cwd: draft.cwd.trim() } : {}),
      },
    };
  }
  return {
    name: draft.name.trim(),
    description,
    transport: {
      type: "streamable-http",
      url: draft.url.trim(),
      ...(toRecord(draft.headers) ? { headers: toRecord(draft.headers) } : {}),
    },
  };
}

/** 单个服务器 → `mcpServers` 条目的值（与 Claude Desktop / Cursor 同构） */
export function transportToJson(transport: TransportConfig): Record<string, unknown> {
  if (transport.type === "stdio") {
    const { command, args, env, cwd } = transport;
    return { command, ...(args ? { args } : {}), ...(env ? { env } : {}), ...(cwd ? { cwd } : {}) };
  }
  return {
    type: "http",
    url: transport.url,
    ...(transport.headers ? { headers: transport.headers } : {}),
  };
}

export function serversToJson(servers: CustomMCPServer[]): string {
  const mcpServers = Object.fromEntries(
    servers.map(server => [server.name, transportToJson(server.transport)])
  );
  return JSON.stringify({ mcpServers }, null, 2);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringRecord = (value: unknown): Record<string, string> | undefined =>
  isObject(value)
    ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, String(v)]))
    : undefined;

const HTTP_TYPES = new Set(["http", "streamable-http", "streamable_http", "streamableHttp"]);

function entryFromConfig(name: string, config: unknown): ImportEntry {
  const draft = { ...emptyDraft(), name };
  if (!isObject(config)) return { draft, error: "配置不是对象" };
  const type = typeof config.type === "string" ? config.type : undefined;

  if (type === "sse") return { draft, error: "暂不支持 SSE 传输" };

  if (typeof config.url === "string" || (type && HTTP_TYPES.has(type))) {
    draft.type = "streamable-http";
    draft.url = typeof config.url === "string" ? config.url : "";
    draft.headers = toPairs(stringRecord(config.headers));
  } else if (typeof config.command === "string") {
    draft.type = "stdio";
    draft.command = config.command;
    draft.args = Array.isArray(config.args) ? config.args.map(String) : [];
    draft.env = toPairs(stringRecord(config.env));
    draft.cwd = typeof config.cwd === "string" ? config.cwd : "";
  } else {
    return { draft, error: type ? `不支持的传输类型「${type}」` : "缺少 command 或 url" };
  }
  if (typeof config.description === "string") draft.description = config.description;
  const invalid = validateDraft(draft);
  return invalid ? { draft, error: invalid } : { draft };
}

/** 解析粘贴的 JSON；格式错误时抛出可直接展示的 Error */
export function parseServersJson(text: string): ImportEntry[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("不是合法的 JSON");
  }
  if (!isObject(data)) throw new Error("JSON 顶层需要是对象");

  const map = isObject(data.mcpServers)
    ? data.mcpServers
    : isObject(data.servers)
      ? data.servers
      : typeof data.command === "string" || typeof data.url === "string"
        ? { "": data }
        : data;

  const entries = Object.entries(map).map(([name, config]) => entryFromConfig(name, config));
  if (entries.length === 0) throw new Error("没有找到服务器配置");
  return entries;
}

/** 看起来像密钥的键名：值默认遮蔽显示 */
export function isSensitiveKey(key: string): boolean {
  return /key|token|secret|password|passwd|auth|cookie|credential/i.test(key);
}

export function describeTransport(transport: TransportConfig): string {
  return transport.type === "stdio"
    ? [transport.command, ...(transport.args ?? [])].join(" ")
    : transport.url;
}
