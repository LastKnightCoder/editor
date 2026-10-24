// @vitest-environment node
import { webcrypto, createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { SYNC_MODEL_VERSION } from "@tau/db-schema/sync-protocol";
const state = vi.hoisted(() => ({
  setting: {
    setting: {
      database: { active: "data.db", databases: [{ name: "data.db", version: 1, syncFormat: 6 }] },
    },
  },
  remote: new Map<string, Uint8Array>(),
  local: new Map<string, Uint8Array>(),
  invoke: vi.fn(),
  upload: vi.fn(),
  create: vi.fn(),
  download: vi.fn(),
  reconnect: vi.fn(async () => undefined),
  connect: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
  sessions: vi.fn(),
  install: vi.fn(),
  factory: vi.fn(),
  unlock: vi.fn(async () => ({ ok: true })),
}));
const provider = {
  uploadFile: state.upload,
  downloadFile: state.download,
  createFileIfAbsent: state.create,
  fileExists: async (name: string) => state.remote.has(name),
};
vi.mock("@tau/ui", () => ({ toast: { error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/commands/module-init", () => ({
  withModule: (_name: string, run: () => unknown) => run(),
}));
vi.mock("@/electron", () => ({ invoke: state.invoke }));
vi.mock("@/commands", () => ({
  connectDatabaseByName: state.connect,
  reconnectDatabaseFast: state.reconnect,
  closeDatabase: state.close,
  createDir: async () => undefined,
  pathExists: async () => true,
  getSep: async () => "/",
  removeFile: async (path: string) => {
    for (const key of state.local.keys())
      if (key === path || key.startsWith(path + "/")) state.local.delete(key);
  },
}));
vi.mock("@/utils/sync", () => ({ SyncProviderFactory: { getSyncProvider: state.factory } }));
vi.mock("@/stores/useSettingStore.ts", () => ({
  default: {
    getState: () => state.setting,
    setState: (next: unknown) => {
      state.setting =
        typeof next === "function" ? next(state.setting) : (next as typeof state.setting);
    },
  },
}));
vi.mock("@/stores/useGlobalStateStore", () => ({ default: { setState: vi.fn() } }));
vi.mock("@/commands/piSession", () => ({
  piSessionSyncFiles: state.sessions,
  piSessionInstallDownload: state.install,
  piSessionAssertLibrary: async () => ({ ok: true }),
  piSessionLockLibrary: async () => ({ ok: true }),
  piSessionUnlockLibrary: state.unlock,
}));
import { upload, download, getOriginDatabaseInfo } from "../sync";
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const pointer = `tau-sync-v1/databases/${createHash("sha256").update("data.db").digest("hex")}.json`;
const snapshot = (version: number) => ({
  version,
  dataModelVersion: SYNC_MODEL_VERSION,
  databaseObject: "tau-sync-v1/snapshots/database.json",
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("crypto", webcrypto);
  state.setting = {
    setting: {
      database: { active: "data.db", databases: [{ name: "data.db", version: 1, syncFormat: 6 }] },
    },
  };
  state.remote.clear();
  state.remote.set(pointer, encode(snapshot(1)));
  state.local.clear();
  state.local.set("/tmp/data.db", new Uint8Array([9, 9, 9]));
  state.local.set("/tmp/chat.jsonl", new Uint8Array([7, 7]));
  state.factory.mockReturnValue(provider);
  state.sessions.mockResolvedValue({
    ok: true,
    files: [{ name: "chat.jsonl", path: "/tmp/chat.jsonl" }],
  });
  state.install.mockResolvedValue({ ok: true });
  state.upload.mockImplementation(async (name: string, bytes: Uint8Array) => {
    state.remote.set(name, new Uint8Array(bytes));
    return true;
  });
  state.create.mockImplementation(async (name: string, bytes: Uint8Array) => {
    if (state.remote.has(name)) return false;
    state.remote.set(name, new Uint8Array(bytes));
    return true;
  });
  state.download.mockImplementation(async (name: string) => {
    const data = state.remote.get(name);
    if (!data) throw new Error("缺少对象");
    return data;
  });
  state.invoke.mockImplementation(async (command: string, ...args: unknown[]) => {
    if (command === "get-database-path") return "/tmp/data.db";
    const path = args[0] as string;
    if (command === "sync:file-size") return state.local.get(path)!.length;
    if (command === "sync:file-read")
      return state.local
        .get(path)!
        .slice(args[1] as number, (args[1] as number) + (args[2] as number));
    if (command === "sync:file-copy") {
      state.local.set(args[1] as string, state.local.get(path)!.slice());
      return;
    }
    if (command === "sync:file-write") {
      const offset = args[1] as number,
        bytes = args[2] as Uint8Array;
      const data = new Uint8Array(offset + bytes.length);
      if (offset) data.set(state.local.get(path)!);
      data.set(bytes, offset);
      state.local.set(path, data);
    }
  });
});
it("数据库与每个会话文件分块完成后才发布版本，使用单一提供方", async () => {
  expect(await upload()).toBe(true);
  const head = JSON.parse(new TextDecoder().decode(state.remote.get(pointer)));
  expect(head).toMatchObject({ version: 2, dataModelVersion: 6, parentVersion: 1 });
  expect(state.create).toHaveBeenCalledWith(`${pointer}.next-1`, expect.any(Uint8Array));
  const dbManifest = JSON.parse(new TextDecoder().decode(state.remote.get(head.databaseObject)));
  expect(dbManifest).toMatchObject({ format: "tau-chunked-file", name: "data.db", size: 3 });
  const sessions = JSON.parse(new TextDecoder().decode(state.remote.get(head.sessionsObject)));
  expect(sessions).toMatchObject({
    format: "tau-session-directory",
    files: [{ name: "chat.jsonl" }],
  });
  expect(state.factory).toHaveBeenCalledTimes(1);
  expect(state.reconnect).toHaveBeenCalledWith("data.db", "sync_upload_reconnect");
  expect(state.invoke.mock.calls.some(([command]) => command === "read-binary-file")).toBe(false);
});
it("分块上传失败不发布版本，释放锁并重连", async () => {
  state.upload.mockResolvedValueOnce(false);
  expect(await upload()).toBe(false);
  expect(state.create).not.toHaveBeenCalled();
  expect(state.setting.setting.database.databases[0].version).toBe(1);
  expect(state.unlock).toHaveBeenCalled();
});
it("会话清单生成失败不发布数据库版本", async () => {
  state.sessions.mockResolvedValue({ ok: false, error: "磁盘错误" });
  expect(await upload()).toBe(false);
  expect(state.create).not.toHaveBeenCalled();
});
it("后继已提交而指针响应失败仍记录成功", async () => {
  const put = state.upload.getMockImplementation()!;
  state.upload.mockImplementation(async (name: string, bytes: Uint8Array) =>
    name === pointer ? false : put(name, bytes)
  );
  expect(await upload()).toBe(true);
  expect(state.setting.setting.database.databases[0].version).toBe(2);
});
async function uploadedSnapshot() {
  expect(await upload()).toBe(true);
  state.setting = structuredClone(state.setting);
  state.setting.setting.database.databases[0].version = 1;
  state.local.set("/tmp/data.db", new Uint8Array([3]));
  vi.clearAllMocks();
}
it("下载逐块恢复到临时文件，再安装会话目录并维护重连", async () => {
  await uploadedSnapshot();
  expect(await download()).toBe(true);
  expect(state.install).toHaveBeenCalledWith("data.db", true);
  expect(state.connect).toHaveBeenCalledWith("data.db", {
    force: true,
    mode: "maintenance",
    source: "sync_download_reconnect",
  });
  expect(state.setting.setting.database.databases[0].version).toBe(2);
});
it("损坏分块不安装数据库或推进版本", async () => {
  await uploadedSnapshot();
  const chunk = [...state.remote.keys()].find(key => key.startsWith("tau-sync-v1/chunks/"))!;
  state.remote.set(chunk, new Uint8Array([0]));
  expect(await download()).toBe(false);
  expect(state.install).not.toHaveBeenCalled();
  expect(state.setting.setting.database.databases[0].version).toBe(1);
});
it("安装失败恢复磁盘备份，不把完整数据库经 IPC 回灌", async () => {
  await uploadedSnapshot();
  state.install.mockResolvedValue({ ok: false, error: "校验失败" });
  expect(await download()).toBe(false);
  expect(state.invoke).toHaveBeenCalledWith(
    "sync:file-copy",
    expect.stringContaining("backup"),
    "/tmp/data.db"
  );
});
it("旧远端命名空间不参与读取，本地完整文件可直接首次发布", async () => {
  state.remote.clear();
  state.remote.set("database_data.db.json", encode({ version: 100, dataModelVersion: 5 }));
  expect((await getOriginDatabaseInfo()).databaseInfo.version).toBe(0);
  expect(await upload()).toBe(true);
  expect(state.download).not.toHaveBeenCalledWith("database_data.db.json");
});
it("新命名空间中未知或旧协议在关闭数据库前拒绝", async () => {
  state.remote.set(pointer, encode({ ...snapshot(2), dataModelVersion: 5 }));
  await expect(download()).rejects.toThrow("DB_MODEL_INCOMPATIBLE");
  expect(state.close).not.toHaveBeenCalled();
  expect(state.create).not.toHaveBeenCalled();
});
