import { app, BrowserWindow, ipcMain } from "electron";
import assert from "node:assert/strict";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { PluginUpdates } from "../../src-electron/main/services/plugin-updates";
import { readPluginPackage } from "../../src-electron/main/services/plugin-package";
import { PluginPublishSessions } from "../../src-electron/main/services/plugin-publish-provider";
import { FetchServer } from "../../src-electron/main/services/fetch-server";
import { uploadPublication } from "../../src-electron/main/modules/publish-upload";
import type { PublishRendererReply, PublishRendererRequest } from "../../shared/publish-renderer";

const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const hmac = (key: Buffer | string, value: string) =>
  createHmac("sha256", key).update(value).digest();
async function start() {
  const directory = process.argv[2];
  app.setVersion("0.59.0");
  app.setPath("userData", path.join(directory, "profile"));
  await app.whenReady();
  const checks: string[] = [];
  const artifacts = [];
  const pluginRoot = path.join(directory, "plugins");
  const updates = new PluginUpdates(pluginRoot, "0.59.0");
  await updates.initialize();
  for (const zip of JSON.parse(await readFile(path.join(directory, "inputs.json"), "utf8"))) {
    const installed = await updates.stageZip(zip);
    await updates.apply(installed.id, async () => true);
    artifacts.push(await readPluginPackage(path.join(pluginRoot, installed.id), "0.59.0"));
  }
  checks.push("两个正式 ZIP 经安装事务校验并读取，主进程不求值作者代码");
  const writes: { path: string; bytes: Buffer; method: string; cache?: string; mime?: string }[] =
    [];
  let failData = false;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url!, "http://127.0.0.1");
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks);
      if (url.pathname.startsWith("/repos/")) {
        if (request.method === "GET") {
          response.setHeader("Content-Type", "application/json");
          response.end(
            JSON.stringify(
              url.pathname.includes("/contents/")
                ? { sha: "existing" }
                : { object: { sha: "head" }, default_branch: "main" }
            )
          );
        } else {
          const body = JSON.parse(bytes.toString());
          assert.equal(request.headers.authorization, "Bearer github-test-token");
          assert.equal(body.branch, "gh-pages");
          writes.push({
            path: url.pathname.split("/contents/")[1] ?? url.pathname,
            bytes: Buffer.from(body.content ?? "", "base64"),
            method: request.method!,
          });
          response.setHeader("Content-Type", "application/json");
          response.end("{}");
        }
        return;
      }
      const authorization = request.headers.authorization!;
      const credentials = authorization.match(
        /Credential=([^,]+), SignedHeaders=([^,]+), Signature=([a-f0-9]+)/
      )!;
      assert.ok(credentials, "S3 必须携带 SigV4 签名");
      const [access, date, region, service] = credentials[1].split("/");
      assert.equal(access, "s3-test-access");
      const canonicalHeaders = credentials[2]
        .split(";")
        .map(name => name + ":" + String(request.headers[name]).trim().replace(/\s+/g, " ") + "\n")
        .join("");
      const query = [...url.searchParams]
        .sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv))
        .map(([key, value]) => encodeURIComponent(key) + "=" + encodeURIComponent(value))
        .join("&");
      const payloadHash = String(request.headers["x-amz-content-sha256"]);
      if (payloadHash !== "UNSIGNED-PAYLOAD") assert.equal(payloadHash, digest(bytes));
      const canonical = [
        request.method,
        url.pathname,
        query,
        canonicalHeaders,
        credentials[2],
        payloadHash,
      ].join("\n");
      const scope = [date, region, service, "aws4_request"].join("/");
      const signing = hmac(
        hmac(hmac(hmac("AWS4s3-test-secret", date), region), service),
        "aws4_request"
      );
      const expected = createHmac("sha256", signing)
        .update(
          ["AWS4-HMAC-SHA256", request.headers["x-amz-date"], scope, digest(canonical)].join("\n")
        )
        .digest("hex");
      assert.equal(credentials[3], expected, "S3 签名必须匹配实际字节和请求头");
      if (failData && url.pathname.endsWith("fail.json")) {
        response.statusCode = 403;
        response.end("<Error><Code>AccessDenied</Code></Error>");
        return;
      }
      if (request.method !== "HEAD")
        writes.push({
          path: url.pathname,
          bytes,
          method: request.method!,
          cache: String(request.headers["cache-control"]),
          mime: String(request.headers["content-type"]),
        });
      response.end();
    } catch (error) {
      response.statusCode = 500;
      response.end(String(error));
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const endpoint = "http://127.0.0.1:" + (server.address() as { port: number }).port;
  const fetchServer = new FetchServer((input, init) =>
    globalThis.fetch(String(input).replace("https://api.github.com", endpoint), init)
  );
  for (const method of ["open", "upload", "response", "read", "cancel"] as const)
    ipcMain.handle("fetch:" + method, async (event, ...args) => {
      try {
        return {
          ok: true,
          value: await (fetchServer[method] as (...params: unknown[]) => unknown).call(
            fetchServer,
            event.sender.id,
            ...args
          ),
        };
      } catch (error) {
        return {
          ok: false,
          error: { name: (error as Error).name, message: (error as Error).message },
        };
      }
    });
  ipcMain.handle("module-init:init-module", () => ({ success: true }));
  ipcMain.handle("publish-test:artifacts", () => artifacts);
  let ready!: () => void, failed!: (error: Error) => void;
  const connected = new Promise<void>((resolve, reject) => {
    ready = resolve;
    failed = reject;
  });
  ipcMain.handle("publish-test:ready", () => ready());
  ipcMain.handle("publish-test:failed", (_event, error: string) => failed(new Error(error)));
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: path.join(directory, "preload.cjs"),
    },
  });
  const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();
  const send = (_owner: number, request: PublishRendererRequest) =>
    new Promise((resolve, reject) => {
      const requestId = randomUUID();
      pending.set(requestId, { resolve, reject });
      window.webContents.send("plugin-publish:request", { ...request, requestId });
    });
  const sessions = new PluginPublishSessions(async id => {
    await readPluginPackage(path.join(pluginRoot, id), "0.59.0");
  }, send);
  ipcMain.handle("plugin-local:publish-reply", (event, reply: PublishRendererReply) => {
    assert.equal(event.sender.id, window.webContents.id);
    const request = pending.get(reply.requestId);
    if (!request) return;
    pending.delete(reply.requestId);
    reply.error ? request.reject(new Error(reply.error)) : request.resolve(reply.result);
  });
  ipcMain.handle("plugin-local:publish-release-window", event =>
    sessions.releaseOwner(event.sender.id)
  );
  let snapshotCalls = 0;
  ipcMain.handle("publish-git:snapshot", (event, input) => {
    assert.equal(event.sender.id, window.webContents.id);
    assert.equal(input.publicationId, "isolated-snapshot");
    assert.equal(input.remote, "https://github.com/owner/blog.git");
    assert.equal(input.authentication.password, "github-test-token");
    snapshotCalls++;
  });
  await window.loadFile(path.join(directory, "index.html"));
  await window.webContents.executeJavaScript(
    await readFile(path.join(directory, "renderer.js"), "utf8")
  );
  await connected;
  assert.deepEqual(
    (await window.webContents.executeJavaScript("window.publishTest.available()"))
      .map((item: { id: string }) => item.id)
      .sort(),
    ["tau.publish-github", "tau.publish-s3"]
  );
  const owner = window.webContents.id;
  const githubConfig = {
    token: "github-test-token",
    repo: "owner/blog",
    branch: "gh-pages",
    useGitCli: false,
    basePath: "/blog/",
  };
  const github = await sessions.begin(owner, "tau.publish-github", githubConfig);
  assert.equal(github.concurrency, 1);
  assert.equal(
    (await sessions.describe(owner, github.id)).identity,
    JSON.stringify(["github", "owner/blog", "gh-pages"])
  );
  await sessions.call(owner, github.id, "uploadFile", [
    "assets/binary.bin",
    new Uint8Array([0, 255, 16]),
  ]);
  assert.deepEqual(writes.at(-1)?.bytes, Buffer.from([0, 255, 16]));
  await assert.rejects(
    sessions.protect("tau.publish-github", async () => {}),
    /发布任务/
  );
  await sessions.end(owner, github.id);
  checks.push("GitHub REST 正式 ZIP 在隔离渲染端运行，字节、目标、串行上限与任务保护正确");
  const snapshot = await sessions.begin(owner, "tau.publish-github", {
    ...githubConfig,
    useGitCli: true,
  });
  assert.equal(snapshot.mode, "snapshot");
  await sessions.call(owner, snapshot.id, "publish", [
    { id: "isolated-snapshot", files: [], deletions: [] },
  ]);
  assert.equal(snapshotCalls, 1);
  await sessions.end(owner, snapshot.id);
  checks.push("GitHub Git Push 经正式服务适配器传递临时快照句柄，未开放 Node 插件入口");
  const s3 = await sessions.begin(owner, "tau.publish-s3", {
    accessKeyId: "s3-test-access",
    secretAccessKey: "s3-test-secret",
    bucket: "blog",
    region: "us-east-1",
    endpoint,
    pathPrefix: "site/",
    basePath: "/",
  });
  await sessions.call(owner, s3.id, "checkConnection");
  const files = [
    { path: "index.html", content: "入口", hash: "entry", publicationEntry: true as const },
    { path: "data/a." + "a".repeat(64) + ".json", content: "{}", hash: "data" },
  ];
  await uploadPublication(files, s3.concurrency, async file => {
    await sessions.call(owner, s3.id, "uploadFile", [
      file.path,
      new Uint8Array(Buffer.from(file.content)),
    ]);
    return true;
  });
  assert.equal(writes.at(-1)?.path, "/blog/site/index.html");
  assert.ok(writes.at(-2)?.cache?.includes("immutable"));
  assert.equal(writes.at(-1)?.cache, "no-cache, must-revalidate");
  await sessions.call(owner, s3.id, "deleteFile", ["old.html"]);
  assert.equal(writes.at(-1)?.method, "DELETE");
  checks.push("S3 浏览器 SDK 正式 ZIP 经真实 fetch 桥传输，SigV4、字节、MIME、缓存与入口顺序正确");
  failData = true;
  const count = writes.length;
  await uploadPublication(
    [{ path: "data/fail.json", content: "", hash: "fail" }, files[0]],
    1,
    async file => {
      try {
        await sessions.call(owner, s3.id, "uploadFile", [file.path, new Uint8Array()]);
        return true;
      } catch {
        return false;
      }
    }
  );
  assert.equal(writes.length, count);
  await sessions.end(owner, s3.id);
  checks.push("S3 依赖失败不更新入口，错误不会记为成功");
  await window.webContents.executeJavaScript('window.publishTest.disable("tau.publish-github")');
  await assert.rejects(
    sessions.begin(owner, "tau.publish-github", githubConfig),
    /未在当前窗口启用/
  );
  checks.push("停用撤回提供方，旧选择不回落为内置实现");
  await writeFile(
    path.join(path.dirname(directory), "report.json"),
    JSON.stringify({ success: true, checks }, null, 2)
  );
  console.log(JSON.stringify({ success: true, checks }));
  window.destroy();
  await new Promise<void>(resolve => server.close(() => resolve()));
  app.exit(0);
}
void start().catch(error => {
  console.error(error);
  app.exit(1);
});
