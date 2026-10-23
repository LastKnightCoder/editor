// @vitest-environment node
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";

const application = vi.hoisted(() => ({ isPackaged: false }));
vi.mock("electron", () => ({ app: application }));
const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  application.isPackaged = false;
  await Promise.all(
    directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))
  );
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "tau-portable-reader-"));
  directories.push(root);
  vi.stubEnv("TAU_PORTABLE_PLUGIN_DIR", root);
  const directory = path.join(root, "test.future");
  await mkdir(directory);
  const code = "throw Error('目录读取不得执行插件');";
  const manifest = {
    formatVersion: 3,
    apiVersion: 1,
    platform: "portable",
    profile: "web-v1",
    id: "test.future",
    name: "未来能力",
    version: "1.0.0",
    format: "cjs",
    main: "main.js",
    integrity: { "main.js": createHash("sha256").update(code).digest("hex") },
    targets: {
      desktop: { minAppVersion: "0.59.0", required: ["pages"], optional: ["futureCapability"] },
    },
  };
  await writeFile(path.join(root, ".enabled.json"), JSON.stringify([manifest.id]));
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest));
  await writeFile(path.join(directory, "main.js"), code);
  return directory;
}
it("桌面开发读取保留未知可选能力且不执行代码", async () => {
  await fixture();
  const { portableDevelopmentArtifacts } = await import("../plugin-portable-development");
  expect((await portableDevelopmentArtifacts())[0].manifest.targets.desktop?.optional).toEqual([
    "futureCapability",
  ]);
});
it("前向读取不放宽摘要或正式构建门禁", async () => {
  const directory = await fixture();
  await writeFile(path.join(directory, "main.js"), "修改过的代码");
  const { portableDevelopmentArtifacts } = await import("../plugin-portable-development");
  await expect(portableDevelopmentArtifacts()).rejects.toThrow("摘要");
  vi.resetModules();
  application.isPackaged = true;
  expect(
    await (await import("../plugin-portable-development")).portableDevelopmentArtifacts()
  ).toEqual([]);
});
