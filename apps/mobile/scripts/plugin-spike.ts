import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

const root = path.resolve(import.meta.dirname, "../../..");
const abcRoot = path.join(root, "tests/fixtures/plugins/releases/tau.abc/0.1.0");
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

async function packages() {
  const manifest = JSON.parse(await readFile(path.join(abcRoot, "manifest.json"), "utf8"));
  const code = await readFile(path.join(abcRoot, manifest.main), "utf8");
  const css = manifest.styles
    ? await readFile(path.join(abcRoot, manifest.styles), "utf8")
    : undefined;
  const counter = await build({
    entryPoints: [path.join(root, "apps/mobile/src/plugin-spike/fixtures/counter.tsx")],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "browser",
    target: "es2020",
    jsx: "automatic",
    external: ["@tau/plugins", "react", "react/jsx-runtime"],
  });
  const counterCode = counter.outputFiles[0].text;
  return [
    {
      manifest: {
        formatVersion: 1,
        apiVersion: 1,
        id: "spike.counter",
        name: "移动计数器",
        version: "0.1.0",
        platform: "desktop",
        format: "cjs",
        main: "main.js",
        integrity: { "main.js": digest(counterCode) },
      },
      code: counterCode,
    },
    { manifest, code, ...(css ? { css } : {}) },
  ];
}

/** 只在显式刺探模式挂载，不是生产插件中心或通用代码上传服务。 */
export function mobilePluginSpike(): Plugin {
  const artifacts = packages();
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (!url.pathname.startsWith("/__plugin-spike__/")) return next();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    const origin = req.headers.origin;
    if (
      origin &&
      [
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
        "http://127.0.0.1:2420",
        "null",
      ].includes(origin)
    ) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") {
      res.end();
      return;
    }
    try {
      if (req.method === "GET" && url.pathname === "/__plugin-spike__/packages") {
        res.end(JSON.stringify(await artifacts));
        return;
      }
      if (
        (req.method === "POST" || req.method === "GET") &&
        url.pathname === "/__plugin-spike__/report"
      ) {
        let body = req.method === "GET" ? (url.searchParams.get("payload") ?? "") : "";
        if (req.method === "POST") {
          for await (const chunk of req) {
            body += chunk;
            if (body.length > 64_000) throw new Error("报告过大");
          }
        }
        if (body.length > 64_000) throw new Error("报告过大");
        const report = JSON.parse(body);
        if (!["android", "ios", "desktop"].includes(report.platform))
          throw new Error("报告平台无效");
        const directory = path.join(root, "output/mobile-plugin-spike");
        await mkdir(directory, { recursive: true });
        await writeFile(path.join(directory, `${report.platform}-${Date.now()}.json`), body);
        console.log(`[plugin-spike] ${report.platform}: ${report.status}`);
        res.end(JSON.stringify({ saved: true }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "验证接口不存在" }));
    } catch (error) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(error) }));
    }
  };
  return {
    name: "tau-mobile-plugin-spike",
    transformIndexHtml: html =>
      html.replace("/src/main.tsx", "/src/plugin-spike/main.tsx").replace(
        "<head>",
        `<head>
      <script>
        window.addEventListener('error', function(event) {
          fetch('http://127.0.0.1:2420/__plugin-spike__/report', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
            platform:/Android/i.test(navigator.userAgent)?'android':/iPhone|iPad/i.test(navigator.userAgent)?'ios':'desktop',
            status:'boot-failed',error:event.message||'资源加载失败',file:event.filename,userAgent:navigator.userAgent
          })}).catch(function(){});
        });
      </script>`
      ),
    configureServer: server => {
      server.middlewares.use(middleware);
    },
    configurePreviewServer: server => {
      server.middlewares.use(middleware);
    },
  };
}
