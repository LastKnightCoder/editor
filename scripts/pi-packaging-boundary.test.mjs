import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { assertPiPackagingBoundary } from "../apps/desktop/scripts/pi-packaging-boundary.mjs";

test("只允许已审核且没有 CLI 消费者的 SDK 裁剪", () => {
  const root = mkdtempSync(path.join(tmpdir(), "tau-pi-boundary-"));
  const sdk = path.join(root, "sdk");
  const app = path.join(root, "app");
  const manifest = { version: "0.87.1", exports: { ".": { import: "./dist/index.js" } } };
  mkdirSync(path.join(sdk, "dist", "bundle"), { recursive: true });
  mkdirSync(app);
  const sdkEntry = path.join(sdk, "dist", "index.js");
  const appEntry = path.join(app, "index.ts");
  try {
    writeFileSync(path.join(sdk, "package.json"), JSON.stringify(manifest));
    writeFileSync(sdkEntry, "export const value = 1;");
    writeFileSync(
      path.join(sdk, "dist", "bundle", "cli.js"),
      'import "@earendil-works/chord/node";'
    );
    assert.doesNotThrow(() => assertPiPackagingBoundary(sdk, [app]));
    writeFileSync(appEntry, 'import "@earendil-works/chord/context";');
    assert.doesNotThrow(() => assertPiPackagingBoundary(sdk, [app]));
    for (const dependency of [
      "esbuild",
      "@earendil-works/chord/node",
      "@earendil-works/pi-coding-agent/rpc-entry",
    ]) {
      writeFileSync(appEntry, `import "${dependency}";`);
      assert.throws(() => assertPiPackagingBoundary(sdk, [app]), /运行源码引用/);
    }
    writeFileSync(appEntry, "");
    const agent = path.join(root, "pi-agent-core", "dist");
    mkdirSync(agent, { recursive: true });
    writeFileSync(path.join(agent, "context.js"), 'import "esbuild";');
    assert.throws(() => assertPiPackagingBoundary(sdk, [app]), /运行源码引用/);
    writeFileSync(path.join(agent, "context.js"), 'import "@earendil-works/chord/context";');
    assert.doesNotThrow(() => assertPiPackagingBoundary(sdk, [app]));
    writeFileSync(sdkEntry, 'export * from "./bundle/index.js";');
    assert.throws(() => assertPiPackagingBoundary(sdk, [app]), /SDK 引用/);
    writeFileSync(sdkEntry, "");
    writeFileSync(
      path.join(sdk, "package.json"),
      JSON.stringify({ ...manifest, version: "0.87.2" })
    );
    assert.throws(() => assertPiPackagingBoundary(sdk, [app]), /版本变化/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
