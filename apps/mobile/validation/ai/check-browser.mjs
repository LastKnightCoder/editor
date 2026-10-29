import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const artifactDirectory = new URL("../../../../output/mobile-pi-validation/", import.meta.url);
const result = await build({
  absWorkingDir: root,
  entryPoints: [fileURLToPath(new URL("browser-entry.ts", import.meta.url))],
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "MobilePiValidation",
  target: ["chrome107", "safari16"],
  minify: true,
  write: false,
  metafile: true,
  logLevel: "silent",
});
const inputs = Object.keys(result.metafile.inputs);
assert(!inputs.some(name => name.includes("/pi-coding-agent/")));
const externalImports = Object.values(result.metafile.outputs).flatMap(output => output.imports);
// pi-ai 为 Bun 沙箱保留一个受运行环境判断保护的 require；浏览器不得执行它。
assert(externalImports.every(value => value.path === "node:fs" && value.kind === "require-call"));
const builder = process.argv.includes("--vite") ? "vite" : "esbuild";
let code = result.outputFiles[0].text;
if (builder === "vite") {
  const { build: viteBuild } = await import("vite");
  await viteBuild({
    configFile: false,
    root: fileURLToPath(new URL("../../", import.meta.url)),
    logLevel: "warn",
    build: {
      target: ["chrome107", "safari16"],
      outDir: fileURLToPath(new URL("vite/", artifactDirectory)),
      emptyOutDir: true,
      lib: {
        entry: fileURLToPath(new URL("browser-entry.ts", import.meta.url)),
        name: "MobilePiValidation",
        formats: ["iife"],
        fileName: () => "browser.js",
      },
    },
  });
  code = await readFile(new URL("vite/browser.js", artifactDirectory), "utf8");
}
const context = createContext({
  console,
  crypto: webcrypto,
  fetch,
  Request,
  Response,
  Headers,
  ReadableStream,
  FormData,
  Blob,
  File,
  TextEncoder,
  TextDecoder,
  AbortController,
  AbortSignal,
  DOMException,
  URL,
  URLSearchParams,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  atob,
  btoa,
  structuredClone,
  performance,
});
runInContext(code, context, { timeout: 10000 });
const browser = context.MobilePiValidation;
const checks = [];
let activeApi;
let requests = [];
const server = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  requests.push(JSON.parse(body));
  const turn = browser.cardTurns[requests.length - 1];
  if (!turn) {
    response.writeHead(500).end();
    return;
  }
  const bytes = new TextEncoder().encode(browser.encodeTurn(activeApi, turn, requests.length - 1));
  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (let offset = 0; offset < bytes.length; offset += 7) {
    response.write(bytes.slice(offset, offset + 7));
    await new Promise(resolve => setImmediate(resolve));
  }
  response.end();
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
try {
  for (const api of ["openai-completions", "openai-responses", "anthropic-messages"]) {
    activeApi = api;
    requests = [];
    const value = await browser.run(`http://127.0.0.1:${server.address().port}/v1`, api);
    assert.equal(value.error, undefined, `${api}: ${value.error}`);
    assert.equal(value.busy, false);
    assert.equal(value.pending, 0);
    assert.equal(value.writes.length, 1);
    assert.equal(requests.length, 5);
    assert.equal(value.events.at(-1), "agent_end");
    assert(JSON.stringify(value.writes).includes("行动项：周五提交方案"));
    assert(JSON.stringify(requests[1]).includes("先搜索并读取卡片"));
    checks.push({
      api,
      requests: requests.length,
      writes: value.writes.length,
      events: value.events.length,
    });
  }
} finally {
  await new Promise(resolve => server.close(resolve));
}
const report = {
  builder,
  versions: { "pi-ai": "0.87.1", "pi-agent-core": "0.87.1" },
  environment: "无 process / Buffer / require 的 VM；注入 Web 标准 API；本机 HTTP 测试服务",
  model: "模拟三种提供方的 SSE，不连接真实模型",
  native: "内存卡片命令，不调用 Rust / SQLite",
  target: ["chrome107", "safari16"],
  bytes: Buffer.byteLength(code),
  gzipBytes: gzipSync(code).length,
  moduleCount: inputs.length,
  guardedNodeFallbacks: externalImports,
  checks,
};
await mkdir(artifactDirectory, { recursive: true });
if (builder === "esbuild") await writeFile(new URL("browser.js", artifactDirectory), code);
await writeFile(
  new URL(`report-${builder}.json`, artifactDirectory),
  JSON.stringify(report, null, 2) + "\n"
);
console.log(JSON.stringify(report, null, 2));
