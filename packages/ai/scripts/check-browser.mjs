import assert from "node:assert/strict";
import { createServer } from "node:http";
import { webcrypto } from "node:crypto";
import { createContext, runInContext } from "node:vm";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const output = new URL("../../../output/mobile-ai-foundation/", import.meta.url);
const built = await build({
  entryPoints: [
    fileURLToPath(new URL("../src/runtime/__tests__/browser-entry.ts", import.meta.url)),
  ],
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AiBrowserValidation",
  target: ["chrome107", "safari16"],
  minify: true,
  write: false,
  metafile: true,
  logLevel: "silent",
});
const inputs = Object.keys(built.metafile.inputs);
assert(!inputs.some(input => input.includes("/pi-coding-agent/")));
const externalImports = Object.values(built.metafile.outputs).flatMap(value => value.imports);
assert(externalImports.every(value => value.path === "node:fs" && value.kind === "require-call"));
const code = built.outputFiles[0].text;
const context = createContext({
  console,
  crypto: webcrypto,
  fetch,
  Request,
  Response,
  Headers,
  FormData,
  Blob,
  File,
  ReadableStream,
  WritableStream,
  TransformStream,
  TextEncoder,
  TextDecoder,
  TextEncoderStream,
  TextDecoderStream,
  AbortController,
  AbortSignal,
  DOMException,
  URL,
  URLSearchParams,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  structuredClone,
  atob,
  btoa,
});
runInContext(code, context, { timeout: 10000 });
const browser = context.AiBrowserValidation;
assert(browser.models);
const sessions = new Map();
const modelRequests = [];
let mcpCalls = 0;
const server = createServer(async (request, response) => {
  try {
    let body;
    if (request.method === "POST") {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      body = JSON.parse(raw);
    }
    if (request.url === "/v1/chat/completions") {
      const turn = browser.turns[modelRequests.length];
      modelRequests.push(body);
      if (!turn) {
        response.writeHead(500).end();
        return;
      }
      const bytes = new TextEncoder().encode(browser.encodeTurn(turn));
      response.writeHead(200, { "content-type": "text/event-stream" });
      for (let offset = 0; offset < bytes.length; offset += 7) {
        response.write(bytes.slice(offset, offset + 7));
        await new Promise(resolve => setImmediate(resolve));
      }
      response.end();
      return;
    }
    if (request.url !== "/mcp") {
      response.writeHead(404).end();
      return;
    }
    let connection = sessions.get(request.headers["mcp-session-id"]);
    if (!connection && body?.method === "initialize") {
      const rpc = new Server({ name: "validation", version: "1" }, { capabilities: { tools: {} } });
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => webcrypto.randomUUID(),
        onsessioninitialized: id => {
          sessions.set(id, { rpc, transport });
        },
      });
      rpc.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
          {
            name: "read_card",
            description: "读取验证卡片",
            inputSchema: {
              type: "object",
              properties: { id: { type: "integer" } },
              required: ["id"],
            },
          },
        ],
      }));
      rpc.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
        mcpCalls++;
        return { content: [{ type: "text", text: `卡片 ${params.arguments?.id}：会议记录` }] };
      });
      await rpc.connect(transport);
      connection = { rpc, transport };
    }
    if (!connection) {
      response.writeHead(400).end();
      return;
    }
    await connection.transport.handleRequest(request, response, body);
  } catch {
    if (!response.headersSent) response.writeHead(500);
    response.end();
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let timer;
let result;
try {
  result = await Promise.race([
    browser.run(`http://127.0.0.1:${server.address().port}`),
    new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("浏览器验证超时")), 15000);
    }),
  ]);
  assert.equal(result.outcome, "completed", JSON.stringify(result.error));
  assert.equal(result.busy, false);
  assert.equal(modelRequests.length, 3);
  assert.equal(mcpCalls, 1);
  assert(JSON.stringify(modelRequests[1]).includes("先读取卡片"));
  assert(JSON.stringify(modelRequests[2]).includes("卡片 7"));
  assert(
    result.messages.some(
      message => message.role === "assistant" && message.content === "已根据技能读取卡片。"
    )
  );
} finally {
  clearTimeout(timer);
  await Promise.all([...sessions.values()].map(connection => connection.rpc.close()));
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
const report = {
  environment: "无 process / Buffer / require 的 VM，仅注入 Web 标准 API",
  entries: ["runtime", "models", "tools", "skills", "mcp"],
  protocol: "真实 pi-ai + pi-agent-core；本机 HTTP 模拟模型 SSE；官方 MCP HTTP 服务",
  native: "内存 v3 仓库，未使用 Rust、真实模型或手机设备",
  outcome: result.outcome,
  modelRequests: modelRequests.length,
  mcpCalls,
  committedEntries: result.entries,
  bytes: built.outputFiles[0].contents.length,
  gzipBytes: gzipSync(code).length,
  externalImports,
};
await mkdir(output, { recursive: true });
await writeFile(new URL("browser.js", output), code);
await writeFile(new URL("browser-report.json", output), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
