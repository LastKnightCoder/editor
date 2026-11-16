import { vi } from "vitest";

/** 主进程测试共用 electron mock（经 `vi.mock("electron")` 生效），与原手写样板等价 */
export const BrowserWindow = { getAllWindows: () => [] };
export const ipcMain = { handle: vi.fn() };
export const app = { getPath: () => "/tmp" };
