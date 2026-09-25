import { describe, expect, it } from "vitest";
import {
  draftFromServer,
  draftToPayload,
  emptyDraft,
  isSensitiveKey,
  parseServersJson,
  serversToJson,
  validateDraft,
} from "../serverConfig";

describe("parseServersJson", () => {
  it("解析 mcpServers 外层，区分 stdio 与 http", () => {
    const entries = parseServersJson(
      JSON.stringify({
        mcpServers: {
          playwright: { command: "npx", args: ["-y", "@playwright/mcp@latest"], env: { A: 1 } },
          context7: { url: "https://mcp.context7.com/mcp", headers: { K: "v" } },
        },
      })
    );
    expect(entries).toHaveLength(2);
    expect(entries[0].error).toBeUndefined();
    expect(entries[0].draft).toMatchObject({
      name: "playwright",
      type: "stdio",
      command: "npx",
      args: ["-y", "@playwright/mcp@latest"],
      env: [{ key: "A", value: "1" }],
    });
    expect(entries[1].draft).toMatchObject({
      type: "streamable-http",
      url: "https://mcp.context7.com/mcp",
      headers: [{ key: "K", value: "v" }],
    });
  });

  it("兼容 VS Code 的 servers 外层与裸映射", () => {
    const vscode = parseServersJson(
      JSON.stringify({ servers: { gh: { type: "http", url: "https://x.dev/mcp" } } })
    );
    expect(vscode[0].draft).toMatchObject({ name: "gh", type: "streamable-http" });

    const bare = parseServersJson(JSON.stringify({ fs: { command: "npx" } }));
    expect(bare[0].draft).toMatchObject({ name: "fs", command: "npx" });
  });

  it("单个服务器对象没有名称，需要用户补填", () => {
    const [entry] = parseServersJson(JSON.stringify({ command: "uvx", args: ["mcp-server"] }));
    expect(entry.draft.command).toBe("uvx");
    expect(entry.error).toBe("请填写名称");
  });

  it("SSE 与缺字段的条目给出原因", () => {
    const entries = parseServersJson(
      JSON.stringify({ mcpServers: { a: { type: "sse", url: "https://x" }, b: { foo: 1 } } })
    );
    expect(entries.map(e => e.error)).toEqual(["暂不支持 SSE 传输", "缺少 command 或 url"]);
  });

  it("非法 JSON 与空配置抛出可读错误", () => {
    expect(() => parseServersJson("{")).toThrow("不是合法的 JSON");
    expect(() => parseServersJson("[]")).toThrow("JSON 顶层需要是对象");
    expect(() => parseServersJson('{"mcpServers":{}}')).toThrow("没有找到服务器配置");
  });
});

describe("草稿与存储结构互转", () => {
  it("stdio 往返后去掉空参数与空键", () => {
    const payload = draftToPayload({
      ...emptyDraft(),
      name: " fs ",
      command: "npx ",
      args: ["-y", " ", "pkg"],
      env: [
        { key: "TOKEN", value: "x" },
        { key: " ", value: "ignored" },
      ],
    });
    expect(payload).toEqual({
      name: "fs",
      description: undefined,
      transport: { type: "stdio", command: "npx", args: ["-y", "pkg"], env: { TOKEN: "x" } },
    });
    const draft = draftFromServer({ id: "1", enabled: true, ...payload });
    expect(draft.env).toEqual([{ key: "TOKEN", value: "x" }]);
  });

  it("导出为 mcpServers JSON", () => {
    const json = serversToJson([
      {
        id: "1",
        name: "ctx",
        enabled: true,
        transport: { type: "streamable-http", url: "https://x/mcp" },
      },
    ]);
    expect(JSON.parse(json)).toEqual({
      mcpServers: { ctx: { type: "http", url: "https://x/mcp" } },
    });
  });

  it("校验 URL 协议与必填项", () => {
    const http = { ...emptyDraft(), name: "a", type: "streamable-http" as const };
    expect(validateDraft(http)).toBe("请填写服务器 URL");
    expect(validateDraft({ ...http, url: "x.dev" })).toMatch(/http/);
    expect(validateDraft({ ...http, url: "https://x.dev" })).toBeNull();
  });
});

it("isSensitiveKey 识别常见密钥键名", () => {
  expect(["BRAVE_API_KEY", "Authorization", "GITHUB_TOKEN"].every(isSensitiveKey)).toBe(true);
  expect(isSensitiveKey("NODE_OPTIONS")).toBe(false);
});
