// @vitest-environment node
import { webcrypto, createHash } from "node:crypto";
import { CHUNK_BYTES, chunkObject } from "@tau/db-schema/sync-protocol";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  setting: {
    setting: {
      database: { active: "data.db", databases: [{ name: "data.db", version: 1 }] },
      sync: { plugin: { id: "tau.sync-s3", configurations: { "tau.sync-s3": { bucket: "b" } } } },
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
  uploadCache: new Map<string, unknown>(),
}));
const provider = {
  getProviderName: () => "test.sync",
  uploadFile: state.upload,
  downloadFile: state.download,
  fileExists: vi.fn(async (name: string) => state.remote.has(name)),
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
vi.mock("@/utils/sleep", () => ({ sleep: async () => undefined }));
vi.mock("@/services/sessionUploadCache", () => ({
  readSessionUploadCache: async (target: unknown) =>
    structuredClone(state.uploadCache.get(JSON.stringify(target)) ?? null),
  writeSessionUploadCache: async (target: unknown, cache: unknown) => {
    state.uploadCache.set(JSON.stringify(target), structuredClone(cache));
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
      sync: { plugin: { id: "tau.sync-s3", configurations: { "tau.sync-s3": { bucket: "b" } } } },
    },
  };
  state.remote.clear();
  state.remote.set(versionObject, encode({ version: 1 }));
  state.local.clear();
  state.uploadCache.clear();
  state.local.set("/tmp/data.db", new Uint8Array([9, 9, 9]));
  state.local.set("/tmp/chat.jsonl", new Uint8Array([7, 7]));
  state.factory.mockReturnValue(provider);
  state.sessions.mockResolvedValue({
    ok: true,
    files: [{ name: "chat.jsonl", path: "/tmp/chat.jsonl", size: 2, mtimeMs: 1 }],
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
    if (command === "sync:file-read-local")
      return (
        state.local
          .get(path)
          ?.slice(args[1] as number, (args[1] as number) + (args[2] as number)) ?? null
      );
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
  expect(decode(state.remote.get(`${root}/sessions.json`))).toEqual({
    files: ["chat.jsonl"],
    manifests: [decode(state.remote.get(`${root}/sessions/chat.jsonl`))],
  });
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
  state.upload.mockResolvedValue(false);
  expect(await upload()).toBe(false);
  expect(decode(state.remote.get(versionObject)).version).toBe(1);
  expect(state.setting.setting.database.databases[0].version).toBe(1);
  expect(state.unlock).toHaveBeenCalled();
  expect(state.upload).toHaveBeenCalledTimes(4);
});
const sessionUploads = () =>
  state.upload.mock.calls.filter(([name]) => String(name).startsWith(`${root}/sessions/`));
it("云端仍是本机上次写入的版本时，跳过未变的对话记录", async () => {
  expect(await upload()).toBe(true);
  vi.clearAllMocks();
  expect(await upload()).toBe(true);
  expect(sessionUploads()).toHaveLength(0);
  expect(decode(state.remote.get(`${root}/sessions.json`)).files).toEqual(["chat.jsonl"]);
  expect(decode(state.remote.get(versionObject)).version).toBe(3);
});
it("按索引比较内容，修改时间或云端版本变化不重复上传未变化的对话", async () => {
  expect(await upload()).toBe(true);
  vi.clearAllMocks();
  state.sessions.mockResolvedValue({
    ok: true,
    files: [{ name: "chat.jsonl", path: "/tmp/chat.jsonl", size: 2, mtimeMs: 2 }],
  });
  expect(await upload()).toBe(true);
  expect(sessionUploads()).toHaveLength(0);
  vi.clearAllMocks();
  state.remote.set(versionObject, encode({ version: 9 }));
  expect(await upload()).toBe(true);
  expect(sessionUploads()).toHaveLength(0);
  vi.clearAllMocks();
  state.local.set("/tmp/chat.jsonl", new Uint8Array([8, 8]));
  state.sessions.mockResolvedValue({
    ok: true,
    files: [{ name: "chat.jsonl", path: "/tmp/chat.jsonl", size: 2, mtimeMs: 3 }],
  });
  expect(await upload()).toBe(true);
  expect(sessionUploads()).toHaveLength(1);
});

it("400 个未变对话只读取一个索引，缓存丢失后上传和下载均无逐文件远端校验", async () => {
  const files = Array.from({ length: 400 }, (_, index) => ({
    name: `chat-${index}.jsonl`,
    path: `/tmp/chat-${index}.jsonl`,
    size: 2,
    mtimeMs: 1,
  }));
  files.forEach((file, index) =>
    state.local.set(file.path, new Uint8Array([index >> 8, index & 255]))
  );
  state.sessions.mockResolvedValue({ ok: true, files });
  expect(await upload()).toBe(true);
  state.uploadCache.clear();
  state.remote.set(versionObject, encode({ version: 9 }));
  vi.clearAllMocks();
  expect(await upload()).toBe(true);
  expect(sessionUploads()).toHaveLength(0);
  expect(state.download.mock.calls.map(([name]) => name)).toEqual([
    versionObject,
    `${root}/sessions.json`,
  ]);
  expect(provider.fileExists.mock.calls.filter(([name]) => name.includes("/chunks/"))).toHaveLength(
    1
  );
  vi.clearAllMocks();
  expect(await download()).toBe(true);
  expect(
    state.download.mock.calls.filter(([name]) => name === `${root}/sessions.json`)
  ).toHaveLength(1);
  expect(state.download.mock.calls.some(([name]) => name.startsWith(`${root}/sessions/`))).toBe(
    false
  );
  expect(state.download.mock.calls.filter(([name]) => name.includes("/chunks/"))).toHaveLength(1);
});

it("旧文件名清单仍能下载，下一次上传补齐完整索引", async () => {
  expect(await upload()).toBe(true);
  state.remote.set(`${root}/sessions.json`, encode({ files: ["chat.jsonl"] }));
  vi.clearAllMocks();
  expect(await download()).toBe(true);
  expect(state.download).toHaveBeenCalledWith(`${root}/sessions/chat.jsonl`);
  vi.clearAllMocks();
  expect(await upload()).toBe(true);
  expect(decode(state.remote.get(`${root}/sessions.json`)).manifests).toHaveLength(1);
});

it("失败上传改写了索引但未发布版本时，不以旧缓存跳过恢复的本地文件", async () => {
  expect(await upload()).toBe(true);
  const original = decode(state.remote.get(`${root}/sessions.json`));
  const write = state.upload.getMockImplementation();
  if (!write) throw new Error("缺少上传实现");
  state.local.set("/tmp/chat.jsonl", new Uint8Array([8, 8]));
  state.sessions.mockResolvedValue({
    ok: true,
    files: [{ name: "chat.jsonl", path: "/tmp/chat.jsonl", size: 2, mtimeMs: 2 }],
  });
  state.upload.mockImplementation((name: string, bytes: Uint8Array) =>
    name === versionObject ? false : write(name, bytes)
  );
  expect(await upload()).toBe(false);
  expect(decode(state.remote.get(versionObject)).version).toBe(2);
  state.local.set("/tmp/chat.jsonl", new Uint8Array([7, 7]));
  state.sessions.mockResolvedValue({
    ok: true,
    files: [{ name: "chat.jsonl", path: "/tmp/chat.jsonl", size: 2, mtimeMs: 1 }],
  });
  state.upload.mockImplementation(write);
  expect(await upload()).toBe(true);
  expect(decode(state.remote.get(`${root}/sessions.json`))).toEqual(original);
});

it.each(["missing", "duplicate", "hash", "name"])("索引元信息损坏时拒绝安装：%s", async defect => {
  await uploadedFromOtherDevice();
  const index = decode(state.remote.get(`${root}/sessions.json`));
  if (defect === "missing") index.manifests = [];
  if (defect === "duplicate") index.files.push("chat.jsonl");
  if (defect === "hash") index.manifests[0].rootHash = "0".repeat(64);
  if (defect === "name") index.files = ["other.jsonl"];
  state.remote.set(`${root}/sessions.json`, encode(index));
  expect(await download()).toBe(false);
  expect(state.install).not.toHaveBeenCalled();
  expect(state.setting.setting.database.databases[0].version).toBe(1);
});
it("对话记录并发上传，单个失败会重试，进度只增不减并以 100 结束", async () => {
  const files = Array.from({ length: 5 }, (_, index) => ({
    name: `chat-${index}.jsonl`,
    path: `/tmp/chat-${index}.jsonl`,
    size: 2,
    mtimeMs: 1,
  }));
  files.forEach((file, index) => state.local.set(file.path, new Uint8Array([index, 1])));
  state.sessions.mockResolvedValue({ ok: true, files });
  let failed = false;
  state.upload.mockImplementation(async (name: string, bytes: Uint8Array) => {
    if (!failed && name.endsWith("chat-2.jsonl")) {
      failed = true;
      return false;
    }
    state.remote.set(name, new Uint8Array(bytes));
    return true;
  });
  const progress: number[] = [];
  expect(await upload({ onProgress: ({ value }) => progress.push(value) })).toBe(true);
  for (const file of files) expect(state.remote.has(`${root}/sessions/${file.name}`)).toBe(true);
  expect(progress).toEqual([...progress].sort((left, right) => left - right));
  expect(progress.at(-1)).toBe(100);
  expect(
    state.upload.mock.calls.filter(([name]) => String(name).endsWith("chat-2.jsonl"))
  ).toHaveLength(2);
  expect(
    state.invoke.mock.calls.filter(
      ([command, path]) => command === "sync:file-read" && path === "/tmp/chat-2.jsonl"
    )
  ).toHaveLength(1);
  expect(state.download.mock.calls.some(([name]) => String(name).includes("/chunks/"))).toBe(false);
});
it("对话记录重试用尽后上传失败，版本号不变", async () => {
  state.upload.mockImplementation(async (name: string, bytes: Uint8Array) => {
    if (name.endsWith("chat.jsonl")) return false;
    state.remote.set(name, new Uint8Array(bytes));
    return true;
  });
  expect(await upload()).toBe(false);
  expect(decode(state.remote.get(versionObject)).version).toBe(1);
  expect(sessionUploads()).toHaveLength(4);
  expect(
    state.invoke.mock.calls.filter(
      ([command, path]) => command === "sync:file-read" && path === "/tmp/chat.jsonl"
    )
  ).toHaveLength(1);
});

it("分块超时只重试当前块，已成功的块和文件读取不重复", async () => {
  const bytes = new Uint8Array(CHUNK_BYTES + 1).fill(4);
  bytes[bytes.length - 1] = 5;
  state.local.set("/tmp/data.db", bytes);
  const first = chunkObject(
    createHash("sha256").update(bytes.subarray(0, CHUNK_BYTES)).digest("hex")
  );
  const last = chunkObject(createHash("sha256").update(bytes.subarray(CHUNK_BYTES)).digest("hex"));
  let failed = false;
  state.upload.mockImplementation(async (name: string, content: Uint8Array) => {
    if (name === last && !failed) {
      failed = true;
      throw new DOMException("The operation timed out.", "TimeoutError");
    }
    state.remote.set(name, new Uint8Array(content));
    return true;
  });
  expect(await upload()).toBe(true);
  expect(state.upload.mock.calls.filter(([name]) => name === first)).toHaveLength(1);
  expect(state.upload.mock.calls.filter(([name]) => name === last)).toHaveLength(2);
  expect(
    state.invoke.mock.calls.filter(
      ([command, path]) => command === "sync:file-read" && path === "/tmp/data.db"
    )
  ).toHaveLength(2);
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
  expect(state.install).toHaveBeenCalledWith("data.db", true, ["chat.jsonl"]);
  expect(state.connect).toHaveBeenCalledWith("data.db", {
    force: true,
    mode: "maintenance",
    source: "sync_download_reconnect",
  });
  expect(state.setting.setting.database.databases[0].version).toBe(2);
});

it("未变的本地对话按内容复用，仅组装远端清单列出的待安装文件", async () => {
  await uploadedFromOtherDevice();
  state.local.set("/tmp/local-only.jsonl", new Uint8Array([6]));
  state.sessions.mockResolvedValue({
    ok: true,
    files: [
      { name: "chat.jsonl", path: "/tmp/chat.jsonl", size: 2, mtimeMs: 1 },
      { name: "local-only.jsonl", path: "/tmp/local-only.jsonl", size: 1, mtimeMs: 1 },
    ],
  });
  state.install.mockImplementation(async () => {
    expect(state.local.get("/tmp/data.db.sessions.download/chat.jsonl")).toEqual(
      new Uint8Array([7, 7])
    );
    expect(state.local.has("/tmp/data.db.sessions.download/local-only.jsonl")).toBe(false);
    return { ok: true };
  });
  expect(await download()).toBe(true);
  const chunk = chunkObject(
    createHash("sha256")
      .update(new Uint8Array([7, 7]))
      .digest("hex")
  );
  expect(state.download.mock.calls.filter(([name]) => name === chunk)).toHaveLength(0);
  expect(
    state.download.mock.calls.filter(([name]) => name === `${root}/sessions/chat.jsonl`)
  ).toHaveLength(0);
  expect(state.local.get("/tmp/chat.jsonl")).toEqual(new Uint8Array([7, 7]));
});

it.each([new Uint8Array([8, 8]), new Uint8Array([7]), null])(
  "变化、截断或缺失的本地对话从云端下载：%s",
  async local => {
    await uploadedFromOtherDevice();
    if (local) state.local.set("/tmp/chat.jsonl", local);
    else state.local.delete("/tmp/chat.jsonl");
    const chunk = chunkObject(
      createHash("sha256")
        .update(new Uint8Array([7, 7]))
        .digest("hex")
    );
    state.install.mockImplementation(async () => {
      expect(state.local.get("/tmp/data.db.sessions.download/chat.jsonl")).toEqual(
        new Uint8Array([7, 7])
      );
      return { ok: true };
    });
    expect(await download()).toBe(true);
    expect(state.download.mock.calls.filter(([name]) => name === chunk)).toHaveLength(1);
  }
);

it("本地会话枚举失败时从远端完整下载，不阻止修复本地数据", async () => {
  await uploadedFromOtherDevice();
  state.sessions.mockResolvedValue({ ok: false, error: "本地会话目录不可读" });
  const chunk = chunkObject(
    createHash("sha256")
      .update(new Uint8Array([7, 7]))
      .digest("hex")
  );
  expect(await download()).toBe(true);
  expect(state.download.mock.calls.filter(([name]) => name === chunk)).toHaveLength(1);
});

async function prepareSessionDownloads() {
  const files = Array.from({ length: 6 }, (_, index) => ({
    name: `chat-${index}.jsonl`,
    path: `/tmp/chat-${index}.jsonl`,
    size: 2,
    mtimeMs: 1,
  }));
  files.forEach((file, index) => state.local.set(file.path, new Uint8Array([index, 1])));
  state.sessions.mockResolvedValue({ ok: true, files });
  await uploadedFromOtherDevice();
  const sessionChunks = new Set(
    files.flatMap(file =>
      decode(state.remote.get(`${root}/sessions/${file.name}`)).chunks.map(
        (chunk: { sha256: string }) => chunkObject(chunk.sha256)
      )
    )
  );
  files.forEach(file => state.local.delete(file.path));
  const pending: { resolve(): void; reject(error: Error): void }[] = [];
  let active = 0;
  let peak = 0;
  state.download.mockImplementation(async (name: string) => {
    if (sessionChunks.has(name)) {
      active++;
      peak = Math.max(peak, active);
      try {
        await new Promise<void>((resolve, reject) => pending.push({ resolve, reject }));
      } finally {
        active--;
      }
    }
    const bytes = state.remote.get(name);
    if (!bytes) throw new Error("远端对象缺失");
    return bytes;
  });
  return { pending, peak: () => peak };
}

it("会话下载最多三个并发，完成一批后继续处理后续文件", async () => {
  const transfer = await prepareSessionDownloads();
  const result = download();
  await vi.waitFor(() => expect(transfer.pending).toHaveLength(3));
  transfer.pending.slice(0, 3).forEach(task => task.resolve());
  await vi.waitFor(() => expect(transfer.pending).toHaveLength(6));
  transfer.pending.slice(3).forEach(task => task.resolve());
  expect(await result).toBe(true);
  expect(transfer.peak()).toBe(3);
});

it("下载失败停止新会话，等在途任务结束后清理临时目录并拒绝安装", async () => {
  const transfer = await prepareSessionDownloads();
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
  let settled = false;
  const result = download().then(value => {
    settled = true;
    return value;
  });
  await vi.waitFor(() => expect(transfer.pending).toHaveLength(3));
  transfer.pending[0].reject(new Error("远端对象缺失"));
  await vi.waitFor(() =>
    expect(errorLog).toHaveBeenCalledWith(
      "[database-sync] session file download failed",
      expect.anything()
    )
  );
  expect(settled).toBe(false);
  expect(state.install).not.toHaveBeenCalled();
  transfer.pending.slice(1).forEach(task => task.resolve());
  expect(await result).toBe(false);
  expect(transfer.pending).toHaveLength(3);
  expect(state.install).not.toHaveBeenCalled();
  expect(state.setting.setting.database.databases[0].version).toBe(1);
  expect(
    [...state.local.keys()].some(path => path.startsWith("/tmp/data.db.sessions.download"))
  ).toBe(false);
  errorLog.mockRestore();
});
it("替换失败不推进本机版本", async () => {
  await uploadedFromOtherDevice();
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
  state.install.mockResolvedValue({ ok: false, error: "磁盘已满" });
  expect(await download()).toBe(false);
  expect(state.setting.setting.database.databases[0].version).toBe(1);
  expect(errorLog).toHaveBeenCalledWith(
    "[database-sync] download failed",
    expect.objectContaining({
      databaseName: "data.db",
      databasePath: "/tmp/data.db",
      remoteVersion: 2,
      error: expect.objectContaining({ message: "磁盘已满" }),
    })
  );
  errorLog.mockRestore();
  expect(state.unlock).toHaveBeenCalled();
});
it("云端没有这个库时不下载", async () => {
  state.remote.clear();
  expect((await getRemoteDatabaseVersion()).version).toBe(0);
  expect(await download()).toBe(false);
  expect(state.close).not.toHaveBeenCalled();
});
