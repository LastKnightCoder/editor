import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const websiteDir = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/website");
// 使用与部署工具一致的 Workers 运行时。
const require = createRequire(realpathSync(join(websiteDir, "node_modules/wrangler/package.json")));
const { Miniflare, Response: RuntimeResponse, convertV4MiniflareOptions } = require("miniflare");

test("同一份官网产物随发布清单自动更新，并在故障时保留下载快照", async t => {
  const outputDir = mkdtempSync(join(tmpdir(), "tau-live-release-"));
  let runtime;
  try {
    execFileSync(
      "pnpm",
      ["exec", "wrangler", "pages", "functions", "build", "--outdir", outputDir],
      {
        cwd: websiteDir,
        stdio: "pipe",
      }
    );
    const snapshot = readFileSync(join(websiteDir, "index.html"), "utf8")
      .replaceAll("<!--tau:download-buttons-->", "<span>旧下载快照</span>")
      .replaceAll("<!--tau:version-->", "0.1.0")
      .replaceAll("<!--tau:release-meta-->", "旧版本信息");
    const windows = JSON.stringify({
      version: "88.0.0",
      files: [{ url: "Tau-v88.0.0-win32.exe", size: 1048576 }],
    });
    const mac = JSON.stringify({
      version: "99.0.0",
      files: ["arm64", "x64"].map(arch => ({
        url: `Tau-v99.0.0-darwin-${arch}.dmg`,
        size: 2097152,
      })),
    });
    let phase = "windows";
    let upstreamCalls = 0;
    let assetHeaders;
    runtime = new Miniflare(
      convertV4MiniflareOptions({
        name: "website",
        modules: true,
        modulesRoot: outputDir,
        scriptPath: join(outputDir, "index.js"),
        compatibilityDate: "2026-10-01",
        serviceBindings: {
          ASSETS: async request => {
            assetHeaders = request.headers;
            return new RuntimeResponse(snapshot, {
              headers: {
                "Content-Type": "text/html; charset=utf-8",
                ETag: "old-snapshot",
                "Last-Modified": "Wed, 01 Jan 2020 00:00:00 GMT",
              },
            });
          },
        },
        outboundService: async request => {
          upstreamCalls++;
          if (phase === "failure") return new RuntimeResponse("unavailable", { status: 503 });
          const { pathname } = new URL(request.url);
          if (pathname.endsWith("latest.json")) return new RuntimeResponse("", { status: 404 });
          const isMac = pathname.endsWith("latest-mac.yml");
          return new RuntimeResponse(isMac ? mac : windows, {
            status: isMac && phase === "windows" ? 404 : 200,
          });
        },
      })
    );

    await t.test("未发布 Mac 时只启用 Windows 下载", async () => {
      const response = await runtime.dispatchFetch("https://taunote.app/");
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("X-Tau-Release-Source"), "live");
      assert.ok(html.includes("Tau-v88.0.0-win32.exe"));
      assert.ok(html.includes("macOS 版即将推出"));
      assert.ok(html.includes("Android 版即将推出"));
    });

    await t.test("不重新构建或部署，发布后两处 Mac 下载与版本自动出现", async () => {
      phase = "mac";
      await runtime.purgeCache();
      const response = await runtime.dispatchFetch("https://taunote.app/", {
        headers: {
          "If-None-Match": "old-snapshot",
          "If-Modified-Since": "Wed, 01 Jan 2020 00:00:00 GMT",
        },
      });
      const html = await response.text();
      for (const arch of ["arm64", "x64"])
        assert.equal(html.split(`Tau-v99.0.0-darwin-${arch}.dmg`).length - 1, 2);
      assert.match(html, /data-release-version[^>]*>99\.0\.0<\/span>/);
      assert.ok(html.includes("v99.0.0 · macOS 约 2 MB"));
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.equal(response.headers.get("ETag"), null);
      assert.equal(assetHeaders.get("If-None-Match"), null);
      assert.equal(assetHeaders.get("If-Modified-Since"), null);
    });

    await t.test("发布源故障时保留构建快照", async () => {
      phase = "failure";
      await runtime.purgeCache();
      const response = await runtime.dispatchFetch("https://taunote.app/");
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("X-Tau-Release-Source"), "snapshot");
      assert.equal(await response.text(), snapshot);
    });

    await t.test("静态资源与 HEAD 请求不拉取发布清单", async () => {
      const previousCalls = upstreamCalls;
      await (await runtime.dispatchFetch("https://taunote.app/assets/app.css")).text();
      await (await runtime.dispatchFetch("https://taunote.app/", { method: "HEAD" })).text();
      assert.equal(upstreamCalls, previousCalls);
      const routes = JSON.parse(readFileSync(join(websiteDir, "public/_routes.json"), "utf8"));
      assert.deepEqual(routes.include, ["/", "/index.html"]);
    });
  } finally {
    await runtime?.dispose();
    rmSync(outputDir, { recursive: true, force: true });
  }
});
