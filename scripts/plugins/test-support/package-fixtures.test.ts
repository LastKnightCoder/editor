import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { readPluginFixtures } from "./package-fixtures";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "tau-fixture-"));
  roots.push(root);
  const code = "module.exports.default = {};";
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  const files = {
    "main.js": code,
    "manifest.json": JSON.stringify({
      id: "test.fixture",
      name: "测试",
      version: "1.0.0",
      apiVersion: 1,
      formatVersion: 1,
      platform: "desktop",
      format: "cjs",
      main: "main.js",
      integrity: { "main.js": hash(code) },
    }),
    "README.md": "仅供测试",
  };
  const source = path.join(root, "release");
  await mkdir(source);
  for (const [name, content] of Object.entries(files))
    await writeFile(path.join(source, name), content);
  const entry = {
    repository: "https://github.com/example/test",
    sourceRevision: "a".repeat(40),
    artifact: "release",
    id: "test.fixture",
    version: "1.0.0",
    files: Object.fromEntries(Object.entries(files).map(([name, value]) => [name, hash(value)])),
  };
  const catalog = path.join(root, "catalog.json");
  await writeFile(catalog, JSON.stringify([entry]));
  return { catalog, source, entry, code };
}
it("仅校验并读取测试包，不生成应用随包目录", async () => {
  const { catalog, code } = await fixture();
  expect((await readPluginFixtures(catalog))[0].code).toBe(code);
});
it("拒绝文件漂移、额外文件和身份漂移", async () => {
  const { catalog, source, entry } = await fixture();
  await writeFile(path.join(source, "README.md"), "变更");
  await expect(readPluginFixtures(catalog)).rejects.toThrow("摘要不匹配");
  await writeFile(path.join(source, "README.md"), "仅供测试");
  await writeFile(path.join(source, "extra"), "");
  await expect(readPluginFixtures(catalog)).rejects.toThrow("文件清单不匹配");
  await rm(path.join(source, "extra"));
  await writeFile(catalog, JSON.stringify([{ ...entry, version: "2.0.0" }]));
  await expect(readPluginFixtures(catalog)).rejects.toThrow("身份或版本不匹配");
});
