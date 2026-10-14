// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  app: { isPackaged: false },
  BrowserWindow: { fromWebContents: vi.fn(() => ({})) },
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
  async function invoke() {
    await module.init();
    const handler = electron.ipcMain.handle.mock.calls[0][1];
    return handler({ sender: {} });
  }
  it("安装版即使设置开发 URL 也不开放", async () => {
    vi.stubEnv("VITE_DEV_SERVER_URL", "http://localhost");
    electron.app.isPackaged = true;
    await expect(invoke()).rejects.toThrow("仅在桌面开发环境");
    expect(electron.dialog.showOpenDialog).not.toHaveBeenCalled();
  });
  it("非开发启动不开放", async () => {
    vi.stubEnv("VITE_DEV_SERVER_URL", "");
    await expect(invoke()).rejects.toThrow("仅在桌面开发环境");
  });
  it("取消目录选择不登记任何包", async () => {
    vi.stubEnv("VITE_DEV_SERVER_URL", "http://localhost");
    expect(await invoke()).toBeNull();
  });
});
