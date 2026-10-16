// @vitest-environment node
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DevelopmentPluginRegistry } from "../../services/plugin-registry";

const mock = vi.hoisted(() => ({
  root: "",
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  openPath: vi.fn(async () => ""),
}));
vi.mock("electron", () => ({
  app: { getPath: () => path.join(mock.root, "profile") },
  ipcMain: {
    handle: (name: string, handler: (...args: unknown[]) => unknown) =>
      mock.handlers.set(name, handler),
  },
  shell: { openPath: mock.openPath },
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
  expect(scan).toEqual({ directory: path.join(mock.root, ".editor/plugins"), entries: [] });
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
