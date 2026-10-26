/**
 * 粘贴 JSON 导入 MCP 服务器：左侧文本框里是 mcpServers 配置，右侧实时列出识别结果
 * （stdio / http 徽标、SSE 等不支持的项标红）；点「导入 N 个」后卡片依次「连接中…」→ 工具数。
 * 解析规则对照 features/mcp/serverConfig 的 parseServersJson；对话框结构按 AddServerDialog 的
 * JsonImport，服务器卡片按 McpView / ServerVisual 重建。
 */
import { useEffect, useMemo, useState } from "react";
import { Folder, Github, Plug, TriangleAlert } from "lucide-react";
import { Checkbox, cn } from "@tau/ui";

const SAMPLE = `{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "~/notes"]
    },
    "github": {
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": { "Authorization": "Bearer ghp_****" }
    },
    "legacy-search": {
      "type": "sse",
      "url": "https://example.com/sse"
    }
  }
}`;

/** 各服务器连接成功后提供的工具数（示意数据） */
const TOOL_COUNTS: Record<string, number> = { filesystem: 11, github: 26 };

interface Entry {
  name: string;
  type?: "stdio" | "http";
  target?: string;
  error?: string;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parse(text: string): { entries: Entry[]; error?: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { entries: [], error: "不是合法的 JSON" };
  }
  if (!isObject(data)) return { entries: [], error: "JSON 顶层需要是对象" };
  const map = isObject(data.mcpServers)
    ? data.mcpServers
    : isObject(data.servers)
      ? data.servers
      : data;
  const entries = Object.entries(map).map(([name, config]): Entry => {
    if (!isObject(config)) return { name, error: "配置不是对象" };
    if (config.type === "sse") return { name, error: "暂不支持 SSE 传输" };
    if (typeof config.url === "string") return { name, type: "http", target: config.url };
    if (typeof config.command === "string") {
      const args = Array.isArray(config.args) ? config.args.map(String) : [];
      return {
        name,
        type: "stdio",
        target: [config.command, ...args].join(" "),
      };
    }
    return { name, error: "缺少 command 或 url" };
  });
  if (entries.length === 0) return { entries, error: "没有找到服务器配置" };
  return { entries };
}

interface Server {
  name: string;
  type: "stdio" | "http";
  state: "connecting" | "ready" | "error";
}

export default function McpImportDemo() {
  const [text, setText] = useState(SAMPLE);
  const [unchecked, setUnchecked] = useState<Set<number>>(new Set());
  const [servers, setServers] = useState<Server[]>([]);
  const { entries, error } = useMemo(() => parse(text), [text]);
  const importable = entries.filter((entry, index) => !entry.error && !unchecked.has(index));

  useEffect(() => {
    if (!servers.some(server => server.state === "connecting")) return;
    const timer = setTimeout(
      () =>
        setServers(list =>
          list.map(server =>
            server.state === "connecting"
              ? {
                  ...server,
                  state: TOOL_COUNTS[server.name] ? "ready" : "error",
                }
              : server
          )
        ),
      1200
    );
    return () => clearTimeout(timer);
  }, [servers]);

  if (servers.length > 0) {
    return (
      <div className="bg-surface font-tau text-tau-body text-ink-1 border-line-1 shadow-float rounded-[14px] border p-6 select-none">
        <div className="flex items-center gap-2.5">
          <b className="text-tau-title font-semibold">MCP 服务器</b>
          <span className="text-tau-meta text-ink-3">自定义 · {servers.length}</span>
          <button
            type="button"
            onClick={() => {
              setServers([]);
              setText(SAMPLE);
              setUnchecked(new Set());
            }}
            className="text-accent-text text-tau-sm ml-auto hover:underline"
          >
            重新导入
          </button>
        </div>
        <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3.5">
          {servers.map(server => {
            const Icon =
              server.name === "github" ? Github : server.name === "filesystem" ? Folder : Plug;
            return (
              <div
                key={server.name}
                className="border-line-1 animate-doc-in flex min-h-[112px] flex-col gap-2.5 rounded-[var(--tau-radius-lg)] border p-3.5"
              >
                <div className="flex items-center gap-2.5">
                  <span className="bg-hover text-ink-2 grid size-[30px] place-items-center rounded-[9px]">
                    <Icon className="size-4" strokeWidth={1.75} />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <b className="font-tau-mono truncate text-[13px] font-semibold">
                      {server.name}
                    </b>
                    <span className="text-ink-3 text-[11px]">
                      {server.type === "stdio" ? "本地进程 · stdio" : "远程 · HTTP"}
                    </span>
                  </span>
                </div>
                <span className="text-tau-sm mt-auto flex items-center gap-2">
                  <i
                    className={cn(
                      "size-[7px] rounded-full",
                      server.state === "ready" && "bg-ok",
                      server.state === "connecting" && "bg-warn animate-pulse",
                      server.state === "error" && "bg-danger"
                    )}
                  />
                  <span className={server.state === "error" ? "text-danger" : "text-ink-2"}>
                    {server.state === "ready"
                      ? `${TOOL_COUNTS[server.name]} / ${TOOL_COUNTS[server.name]} 个工具`
                      : server.state === "connecting"
                        ? "连接中…"
                        : "连接失败"}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
        {servers.some(server => server.state === "error") && (
          <p className="text-tau-sm text-ink-3 animate-doc-in mt-3">
            连接失败时，点开服务器看「日志」，改好配置后点「保存并重连」。
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-surface font-tau text-tau-body text-ink-1 border-line-1 shadow-float rounded-[14px] border p-5 select-none">
      <b className="text-tau-body-lg font-semibold">添加 MCP 服务器</b>
      <p className="text-tau-meta text-warn mt-0.5">
        MCP 服务器可以在本机执行命令，只添加信任的来源
      </p>
      <div className="bg-hover mt-3 inline-flex rounded-[8px] p-0.5 text-[12px]">
        <span className="text-ink-2 h-6 rounded-[6px] px-2.5 leading-6">手动填写</span>
        <span className="bg-surface text-ink-1 shadow-card h-6 rounded-[6px] px-2.5 leading-6 font-medium">
          粘贴 JSON
        </span>
      </div>
      <div className="mt-3 grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-4 max-md:grid-cols-1">
        <div className="flex flex-col gap-1.5">
          <textarea
            value={text}
            spellCheck={false}
            rows={14}
            aria-label="mcpServers JSON"
            aria-invalid={error ? true : undefined}
            onChange={event => {
              setText(event.target.value);
              setUnchecked(new Set());
            }}
            className={cn(
              "font-tau-mono bg-page focus:border-accent w-full resize-none rounded-[10px] border px-3 py-2 text-[12px] leading-[1.7] outline-none select-text",
              error ? "border-danger" : "border-line-1"
            )}
          />
          {error && <span className="text-tau-sm text-danger">{error}</span>}
        </div>
        <div className="flex min-w-0 flex-col">
          <p className="text-tau-tiny text-ink-3 mb-1.5">识别结果</p>
          <ul className="flex flex-col gap-0.5">
            {entries.map((entry, index) => {
              const ok = !entry.error;
              return (
                <li
                  key={`${entry.name}-${index}`}
                  className="text-tau-meta hover:bg-hover flex flex-col gap-0.5 rounded-[9px] px-2 py-1.5"
                >
                  <span className="flex items-center gap-2.5">
                    <Checkbox
                      aria-label={`导入 ${entry.name || "未命名"}`}
                      disabled={!ok}
                      checked={ok && !unchecked.has(index)}
                      onChange={event => {
                        const next = new Set(unchecked);
                        if (event.target.checked) next.delete(index);
                        else next.add(index);
                        setUnchecked(next);
                      }}
                    />
                    <span className="font-tau-mono truncate text-[12.5px]">
                      {entry.name || "未命名"}
                    </span>
                    {entry.type && (
                      <span className="text-tau-micro text-ink-3 border-line-1 rounded-[5px] border px-1.5">
                        {entry.type}
                      </span>
                    )}
                  </span>
                  {entry.error ? (
                    <span className="text-danger inline-flex items-center gap-1 pl-7">
                      <TriangleAlert className="size-3.5" strokeWidth={1.75} />
                      {entry.error}
                    </span>
                  ) : (
                    <span className="font-tau-mono text-ink-3 truncate pl-7 text-[11px]">
                      {entry.target}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={importable.length === 0}
          onClick={() =>
            setServers(
              importable.map(entry => ({
                name: entry.name,
                type: entry.type ?? "stdio",
                state: "connecting",
              }))
            )
          }
          className="bg-accent text-ink-inverse hover:bg-accent-hover h-8 rounded-[8px] px-3.5 text-[13px] font-medium disabled:opacity-50"
        >
          导入 {importable.length} 个
        </button>
      </div>
    </div>
  );
}
