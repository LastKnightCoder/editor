import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { buildPluginDistribution, portablePluginBuild } from "../distribution";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(editor = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), "tau-distribution-"));
  roots.push(root);
  const code = "module.exports.default = {};";
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  const manifest = JSON.stringify({
    id: "demo.figure",
    name: "图形",
    version: "1.0.0",
    apiVersion: 1,
    formatVersion: 1,
    platform: "desktop",
    format: "cjs",
    ...(editor ? { editor: true } : { whiteboard: true }),
    main: "main.js",
    integrity: { "main.js": hash(code) },
  });
  const source = path.join(root, "release");
  await mkdir(source);
  const files = { "main.js": code, "manifest.json": manifest, "README.md": "图形介绍" };
  for (const [file, value] of Object.entries(files))
    await writeFile(path.join(source, file), value);
  const entry = {
    artifact: "release",
    id: "demo.figure",
    version: "1.0.0",
    sourceRevision: "a".repeat(40),
    archiveSha256: "b".repeat(64),
    files: Object.fromEntries(Object.entries(files).map(([file, value]) => [file, hash(value)])),
  };
  const config = path.join(root, "distribution.json");
  await writeFile(config, JSON.stringify([entry]));
  return { root, source, entry, config, code };
}

it("固定产物无需作者源码，默认分发保留说明；便携编辑器不装配白板专用包", async () => {
  const { root, config, code } = await fixture();
  const destination = path.join(root, "bundled");
  const packages = await buildPluginDistribution(config, destination);
  expect(packages[0].code).toBe(code);
  expect(await readFile(path.join(destination, "demo.figure/README.md"), "utf8")).toBe("图形介绍");
  const portable = portablePluginBuild(config);
  await portable.buildStart();
  expect(portable.load("\0tau-plugin-catalog")).toBe("export default [];");
});

it("文档漂移、额外文件和身份版本漂移都拒绝分发", async () => {
  const { source, config, entry } = await fixture();
  await writeFile(path.join(source, "README.md"), "被修改");
  await expect(buildPluginDistribution(config)).rejects.toThrow("摘要不匹配");
  await writeFile(path.join(source, "README.md"), "图形介绍");
  await writeFile(path.join(source, "extra.txt"), "多余文件");
  await expect(buildPluginDistribution(config)).rejects.toThrow("文件清单不匹配");
  await rm(path.join(source, "extra.txt"));
  await writeFile(config, JSON.stringify([{ ...entry, version: "2.0.0" }]));
  await expect(buildPluginDistribution(config)).rejects.toThrow("身份或版本不匹配");
});

it("便携编辑器继续分发编辑器插件", async () => {
  const { config } = await fixture(true);
  const portable = portablePluginBuild(config);
  await portable.buildStart();
  expect(portable.load("\0tau-plugin-catalog")).toContain("virtual:tau-plugin-package:0");
  expect(portable.load("\0tau-plugin-package:0")).toContain('"editor":true');
});
