// @vitest-environment node
import { expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { installBundledPlugins } from "../plugin-bundled";

it("首次安装随应用包，不覆盖本地更新、不重新安装用户卸载的插件", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tau-bundled-"));
  const source = path.join(root, "source");
  const target = path.join(root, "target");
  try {
    await mkdir(path.join(source, "test.plugin"), { recursive: true });
    const code = "module.exports = {}";
    await writeFile(path.join(source, "test.plugin/main.js"), code);
    await writeFile(
      path.join(source, "test.plugin/manifest.json"),
      JSON.stringify({
        id: "test.plugin",
        name: "测试",
        version: "1.0.0",
        apiVersion: 1,
        formatVersion: 1,
        platform: "desktop",
        format: "cjs",
        main: "main.js",
        integrity: { "main.js": createHash("sha256").update(code).digest("hex") },
      })
    );
    expect(await installBundledPlugins(source, target, "0.59.0")).toEqual(["test.plugin"]);
    await writeFile(path.join(target, "test.plugin/main.js"), "local update");
    await installBundledPlugins(source, target, "0.59.0");
    expect(await readFile(path.join(target, "test.plugin/main.js"), "utf8")).toBe("local update");
    await rm(path.join(target, "test.plugin"), { recursive: true });
    await installBundledPlugins(source, target, "0.59.0");
    await expect(readFile(path.join(target, "test.plugin/main.js"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
