import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";

export function assertPiPackagingBoundary(sdkDirectory, sourceDirectories) {
  const manifest = JSON.parse(readFileSync(path.join(sdkDirectory, "package.json"), "utf8"));
  assert.equal(manifest.version, "0.87.1", "pi 版本变化，需重新审核独立 CLI 的裁剪边界");
  assert.equal(manifest.exports["."].import, "./dist/index.js", "pi SDK 入口发生变化");
  const bundle = path.join(sdkDirectory, "dist", "bundle");
  const forbidden =
    /["'](?:@earendil-works\/chord\/node|esbuild)(?:\/[^"']*)?["']|["']@earendil-works\/pi-coding-agent\/rpc-entry["']/;
  const scan = (directory, sdk) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (file === bundle || entry.name === "node_modules") continue;
      if (entry.isDirectory()) scan(file, sdk);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
        const source = readFileSync(file, "utf8");
        assert(!forbidden.test(source), `运行源码引用了待裁剪的 pi CLI 依赖：${file}`);
        if (sdk)
          assert(!/["'][^"'\n]*\/bundle\//.test(source), `pi SDK 引用了独立 bundle：${file}`);
      }
    }
  };
  scan(path.join(sdkDirectory, "dist"), true);
  const scopeDirectory = path.dirname(realpathSync(sdkDirectory));
  for (const name of ["pi-agent-core", "pi-ai", "pi-tui", "pi-telemetry"]) {
    const directory = path.join(scopeDirectory, name, "dist");
    if (existsSync(directory)) scan(directory, true);
  }
  for (const directory of sourceDirectories) {
    if (existsSync(directory)) scan(directory, false);
  }
}
