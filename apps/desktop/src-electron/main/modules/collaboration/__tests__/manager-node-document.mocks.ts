import { vi } from "vitest";
import type Database from "better-sqlite3";

// 本模块必须先于 manager-node-document.helpers 与被测模块导入：
// vi.mock 在此注册后，helpers 及其依赖链中的 electron/database 才会命中 mock。
export const host = {
  dir: "",
  serverUrl: "http://test",
  databases: new Map<string, Database.Database>(),
  windowToDatabase: new Map([[1, "library"]]),
};
export const cleanup: (() => Promise<void> | void)[] = [];

export async function resetAfterEach() {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const run of cleanup.splice(0).reverse()) await run();
  host.databases.clear();
  host.serverUrl = "http://test";
}

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => ({ id: 1 }) },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));
vi.mock("../../database", () => ({
  default: { ...host, getDatabase: (name: string) => host.databases.get(name) },
}));
vi.mock("../../../utils/PathUtil", () => ({ default: { getAppDir: () => host.dir } }));
vi.mock("../dev-server", () => ({ getDevelopmentServerUrl: () => host.serverUrl }));
