// @vitest-environment node
import { webcrypto, createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  setting: {
    setting: {
      database: { active: "data.db", databases: [{ name: "data.db", version: 1 }] },
    },
  },
  remote: new Map<string, Uint8Array>(),
  local: new Map<string, Uint8Array>(),
  invoke: vi.fn(),
  upload: vi.fn(),
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
  fileExists: async (name: string) => state.remote.has(name),
};
const toast = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn() }));
vi.mock("@tau/ui", () => ({ toast }));
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
  piSessionLockLibrary: async () => ({ ok: true }),
  piSessionUnlockLibrary: state.unlock,
}));
import { upload, download, getRemoteDatabaseVersion } from "../sync";
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const decode = (bytes: Uint8Array | undefined) => JSON.parse(new TextDecoder().decode(bytes));
const root = `tau-sync-v1/databases/${createHash("sha256").update("data.db").digest("hex")}`;
const versionObject = `${root}/version.json`;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("crypto", webcrypto);
  state.setting = {
    setting: {
      database: { active: "data.db", databases: [{ name: "data.db", version: 1 }] },
    },
  };
  state.remote.clear();
  state.remote.set(versionObject, encode({ version: 1 }));
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
it("库文件与对话记录写到固定位置，版本号最后写入", async () => {
  expect(await upload()).toBe(true);
  expect(decode(state.remote.get(versionObject))).toMatchObject({ version: 2 });
  expect(decode(state.remote.get(`${root}/data.db`))).toMatchObject({
    format: "tau-chunked-file",
    name: "data.db",
    size: 3,
  });
  expect(decode(state.remote.get(`${root}/sessions.json`))).toEqual({ files: ["chat.jsonl"] });
  expect(state.remote.has(`${root}/sessions/chat.jsonl`)).toBe(true);
  expect(state.upload.mock.calls.at(-1)?.[0]).toBe(versionObject);
  expect(state.factory).toHaveBeenCalledTimes(1);
  expect(state.reconnect).toHaveBeenCalledWith("data.db", "sync_upload_reconnect");
});
it("云端比本机新时手动上传照样覆盖，版本号接在云端之后", async () => {
  state.remote.set(versionObject, encode({ version: 5 }));
  expect(await upload()).toBe(true);
  expect(decode(state.remote.get(versionObject)).version).toBe(6);
  expect(state.setting.setting.database.databases[0].version).toBe(6);
});
it("自动上传遇到云端更新时跳过，不关库也不覆盖", async () => {
  state.remote.set(versionObject, encode({ version: 5 }));
  expect(await upload({ skipWhenRemoteNewer: true })).toBe(false);
  expect(state.close).not.toHaveBeenCalled();
  expect(decode(state.remote.get(versionObject)).version).toBe(5);
});
it("上传中途失败不改版本号，释放锁并重连", async () => {
  state.upload.mockResolvedValueOnce(false);
  expect(await upload()).toBe(false);
  expect(decode(state.remote.get(versionObject)).version).toBe(1);
  expect(state.setting.setting.database.databases[0].version).toBe(1);
  expect(state.unlock).toHaveBeenCalled();
});
async function uploadedFromOtherDevice() {
  expect(await upload()).toBe(true);
  state.setting = structuredClone(state.setting);
  state.setting.setting.database.databases[0].version = 1;
  state.local.set("/tmp/data.db", new Uint8Array([3]));
  vi.clearAllMocks();
}
it("下载先把旧库复制进 backup，再替换并维护重连", async () => {
  await uploadedFromOtherDevice();
  expect(await download()).toBe(true);
  expect(state.invoke).toHaveBeenCalledWith(
    "sync:file-copy",
    "/tmp/data.db",
    expect.stringMatching(/^\/tmp\/backup\/version-1-.*-data\.db$/)
  );
  expect(state.install).toHaveBeenCalledWith("data.db", true);
  expect(state.connect).toHaveBeenCalledWith("data.db", {
    force: true,
    mode: "maintenance",
    source: "sync_download_reconnect",
  });
  expect(state.setting.setting.database.databases[0].version).toBe(2);
});
it("替换失败不推进本机版本", async () => {
  await uploadedFromOtherDevice();
  state.install.mockResolvedValue({ ok: false, error: "磁盘已满" });
  expect(await download()).toBe(false);
  expect(state.setting.setting.database.databases[0].version).toBe(1);
  expect(state.unlock).toHaveBeenCalled();
});
it("云端没有这个库时不下载", async () => {
  state.remote.clear();
  expect((await getRemoteDatabaseVersion()).version).toBe(0);
  expect(await download()).toBe(false);
  expect(state.close).not.toHaveBeenCalled();
});
