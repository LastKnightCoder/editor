// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

const electron = vi.hoisted(() => ({
  app: { isPackaged: false, getPath: vi.fn(() => "") },
  BrowserWindow: { fromWebContents: vi.fn((sender: { id?: number }) => ({ id: sender.id ?? 1 })) },
  dialog: { showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })) },
  ipcMain: { handle: vi.fn() },
}));
vi.mock("electron", () => electron);
import module from "../../modules/plugin-development";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  electron.app.isPackaged = false;
});
describe("开发插件选择入口", () => {
  const channels = [
    "open",
    "close",
    "choose",
    "state",
    "remove",
    "retire",
    "prepare-reload",
    "commit-reload",
    "discard-reload",
    "watch",
  ];
  async function invoke(channel = "choose") {
    await module.init();
    const handler = electron.ipcMain.handle.mock.calls.find(
      call => call[0] === `plugin-development:${channel}`
    )?.[1];
    if (!handler) throw new Error("测试通道不存在");
    return handler({ sender: {} });
  }
  it.each(channels)("安装版即使设置开发 URL 也不开放 %s", async channel => {
    vi.stubEnv("VITE_DEV_SERVER_URL", "http://localhost");
    electron.app.isPackaged = true;
    await expect(invoke(channel)).rejects.toThrow("仅在桌面开发环境");
    expect(electron.dialog.showOpenDialog).not.toHaveBeenCalled();
  });
  it.each(channels)("非开发启动不开放 %s", async channel => {
    vi.stubEnv("VITE_DEV_SERVER_URL", "");
    await expect(invoke(channel)).rejects.toThrow("仅在桌面开发环境");
  });
  it("取消目录选择不登记任何包", async () => {
    vi.stubEnv("VITE_DEV_SERVER_URL", "http://localhost");
    expect(await invoke()).toBeNull();
  });
  it("工作区只允许一个管理窗口，会话关闭后可接手，旧令牌不能写入", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "tau-plugin-session-"));
    electron.app.getPath.mockReturnValue(directory);
    vi.stubEnv("VITE_DEV_SERVER_URL", "http://localhost");
    await module.init();
    const sender = Object.assign(new EventEmitter(), { id: 1 });
    const other = Object.assign(new EventEmitter(), { id: 2 });
    const call = (channel: string, source: typeof sender, ...args: unknown[]) => {
      const handler = electron.ipcMain.handle.mock.calls.find(
        item => item[0] === `plugin-development:${channel}`
      )?.[1];
      if (!handler) throw new Error("测试通道不存在");
      return Promise.resolve().then(() => handler({ sender: source }, ...args));
    };
    try {
      const first = await call("open", sender, "A.db", []);
      await expect(call("open", other, "A", [])).rejects.toThrow("另一窗口");
      await expect(call("state", other, first.token, "example.one", true, true)).rejects.toThrow(
        "已失效"
      );
      await call("close", sender, first.token);
      expect(sender.listenerCount("destroyed")).toBe(0);
      const second = await call("open", other, "A", []);
      expect(second.workspaceId).toBe(first.workspaceId);
      await expect(call("state", sender, first.token, "example.one", false, false)).rejects.toThrow(
        "已失效"
      );
      other.emit("destroyed");
      expect((await call("open", sender, "A", [])).workspaceId).toBe(first.workspaceId);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
