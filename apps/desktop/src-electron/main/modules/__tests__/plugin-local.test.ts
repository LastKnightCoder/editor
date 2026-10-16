// @vitest-environment node
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import AdmZip from "adm-zip";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DevelopmentPluginRegistry } from "../../services/plugin-registry";

const mock = vi.hoisted(() => ({
  root: "",
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  openPath: vi.fn(async () => ""),
  download: vi.fn(),
}));
vi.mock("electron", () => ({
  app: { getPath: () => path.join(mock.root, "profile"), getVersion: () => "0.59.0" },
  ipcMain: {
    handle: (name: string, handler: (...args: unknown[]) => unknown) =>
      mock.handlers.set(name, handler),
  },
  shell: { openPath: mock.openPath },
}));
vi.mock("../../services/plugin-center", () => ({
  downloadPluginRelease: mock.download,
  fetchPluginCatalog: vi.fn(),
  fetchPluginRelease: vi.fn(),
}));
vi.mock("../../utils/PathUtil", () => ({
  default: { getAppDir: () => path.join(mock.root, ".editor") },
}));
beforeEach(async () => {
  mock.root = await mkdtemp(path.join(tmpdir(), "tau-local-module-"));
  mock.handlers.clear();
  mock.openPath.mockClear();
  const module = await import("../plugin-local");
  await module.default.init();
});
afterEach(async () => {
  await rm(mock.root, { recursive: true, force: true });
});
function invoke(name: string, ...args: unknown[]) {
  const handler = mock.handlers.get(name);
  if (!handler) throw new Error("缺少处理器");
  return handler({}, ...args);
}
it("扫描与打开始终使用应用约定目录，不接受调用方路径", async () => {
  const foreign = path.join(mock.root, "foreign");
  await mkdir(foreign);
  const scan = await invoke("plugin-local:scan", foreign);
  expect(scan).toMatchObject({
    directory: path.join(mock.root, ".editor/plugins"),
    entries: [],
    clientVersion: "0.59.0",
  });
  await invoke("plugin-local:open-directory", foreign);
  expect(mock.openPath).toHaveBeenCalledWith(path.join(mock.root, ".editor/plugins"));
  mock.openPath.mockResolvedValueOnce("打开失败");
  await expect(invoke("plugin-local:open-directory")).rejects.toThrow("打开失败");
});
it("保留原工作区映射的稳定身份，不按扫描创建新身份", async () => {
  const registry = new DevelopmentPluginRegistry(
    path.join(mock.root, "profile/plugin-development/registry.json")
  );
  const existing = await registry.open("A");
  const first = await invoke("plugin-local:workspace", "A.db");
  expect(first).toBe(existing.id);
  expect(await invoke("plugin-local:workspace", "A")).toBe(first);
  expect(await invoke("plugin-local:workspace", "B")).not.toBe(first);
});
it("中心版本经下载服务暂存，重启后扫描带来源，卸载移除目录", async () => {
  const id = "test.center";
  const code = "module.exports={}";
  const archive = new AdmZip();
  archive.addFile(
    `${id}/manifest.json`,
    Buffer.from(
      JSON.stringify({
        formatVersion: 1,
        apiVersion: 1,
        id,
        name: "中心插件",
        version: "1.0.0",
        platform: "desktop",
        format: "cjs",
        main: "main.js",
        integrity: { "main.js": createHash("sha256").update(code).digest("hex") },
      })
    )
  );
  archive.addFile(`${id}/main.js`, Buffer.from(code));
  archive.addFile(`${id}/README.md`, Buffer.from("# 中心插件"));
  const source = { kind: "center", releaseId: "r1", pluginId: id, version: "1.0.0", sha256: "d" };
  mock.download.mockResolvedValueOnce({ bytes: archive.toBuffer(), source });
  expect(await invoke("plugin-local:stage-release", "r1")).toEqual({ id, version: "1.0.0" });
  expect(mock.download).toHaveBeenCalledWith("r1");
  mock.handlers.clear();
  await (await import("../plugin-local")).default.init();
  const [entry] = ((await invoke("plugin-local:scan")) as { entries: unknown[] }).entries;
  expect(entry).toMatchObject({ id, source });
  await invoke("plugin-local:uninstall", id);
  expect(((await invoke("plugin-local:scan")) as { entries: unknown[] }).entries).toEqual([]);
});
