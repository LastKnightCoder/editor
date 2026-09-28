import { beforeEach, describe, expect, it, vi } from "vitest";

const mockContext = vi.hoisted(() => {
  let settingState = {
    setting: {
      database: {
        active: "data.db",
        databases: [{ name: "data.db", version: 1 }],
      },
    },
  };

  const syncProvider = {
    createFileIfAbsent: vi.fn(async (_name: string, _data: Uint8Array) => true),
    uploadFile: vi.fn(async (_name: string, _data: Uint8Array) => true),
    downloadFile: vi.fn(async (objectName: string) => {
      if (objectName === "database_data.db.json") {
        return new TextEncoder().encode(JSON.stringify({ version: 1 }));
      }
      return new Uint8Array([1, 2, 3]);
    }),
    fileExists: vi.fn(async (objectName: string) => !objectName.includes(".next-")),
  };

  const useSettingStoreMock = {
    getState: vi.fn(() => settingState),
    setState: vi.fn((updater: any) => {
      settingState = typeof updater === "function" ? updater(settingState) : updater;
    }),
  };

  const useGlobalStateStoreMock = {
    setState: vi.fn(),
  };

  return {
    get settingState() {
      return settingState;
    },
    setSettingState(nextState: typeof settingState) {
      settingState = nextState;
    },
    syncProvider,
    useSettingStoreMock,
    useGlobalStateStoreMock,
    reconnectDatabaseFast: vi.fn(async () => undefined),
    connectDatabaseByName: vi.fn(async () => undefined),
    readBinaryFile: vi.fn(async () => new Uint8Array([9, 9, 9])),
    writeBinaryFile: vi.fn(async () => undefined),
    renameFileOrDirectory: vi.fn(async () => undefined),
    createDir: vi.fn(async () => undefined),
    pathExists: vi.fn(async () => true),
    getSep: vi.fn(async () => "/"),
    closeDatabase: vi.fn(async () => undefined),
    removeFile: vi.fn(async () => undefined),
    invoke: vi.fn(async (channel: string) => {
      if (channel === "get-database-path") {
        return "/tmp/data.db";
      }
      return "";
    }),
    piSessionPack: vi.fn(
      async (_databaseName: string) =>
        ({ ok: true, archive: new Uint8Array([7, 7]) }) as {
          ok: boolean;
          archive?: Uint8Array;
          error?: string;
        }
    ),
    piSessionUnpack: vi.fn(
      async (_databaseName: string, _archive: Uint8Array) =>
        ({ ok: true }) as { ok: boolean; error?: string }
    ),
    message: {
      error: vi.fn(),
      warning: vi.fn(),
    },
  };
});

vi.mock("antd", () => ({
  message: mockContext.message,
}));

vi.mock("@/electron", () => ({
  invoke: mockContext.invoke,
}));

vi.mock("@/commands", () => ({
  connectDatabaseByName: mockContext.connectDatabaseByName,
  reconnectDatabaseFast: mockContext.reconnectDatabaseFast,
  readBinaryFile: mockContext.readBinaryFile,
  writeBinaryFile: mockContext.writeBinaryFile,
  renameFileOrDirectory: mockContext.renameFileOrDirectory,
  createDir: mockContext.createDir,
  pathExists: mockContext.pathExists,
  getSep: mockContext.getSep,
  closeDatabase: mockContext.closeDatabase,
  removeFile: mockContext.removeFile,
}));

vi.mock("@/stores/useSettingStore.ts", () => ({
  default: mockContext.useSettingStoreMock,
}));

vi.mock("@/stores/useGlobalStateStore", () => ({
  default: mockContext.useGlobalStateStoreMock,
}));

vi.mock("@/utils/sync", () => ({
  SyncProviderFactory: {
    getSyncProvider: () => mockContext.syncProvider,
  },
}));

vi.mock("@/commands/piSession", () => ({
  piSessionAssertLibrary: vi.fn(async () => ({ ok: true })),
  piSessionLockLibrary: vi.fn(async () => ({ ok: true })),
  piSessionUnlockLibrary: vi.fn(async () => ({ ok: true })),
  piSessionInstallDownload: mockContext.piSessionUnpack,
  piSessionPack: mockContext.piSessionPack,
  piSessionUnpack: mockContext.piSessionUnpack,
}));

import { download, upload } from "../sync";

describe("sync commands reconnect source", () => {
  beforeEach(() => {
    mockContext.setSettingState({
      setting: {
        database: {
          active: "data.db",
          databases: [{ name: "data.db", version: 1 }],
        },
      },
    });
    mockContext.syncProvider.uploadFile.mockClear();
    mockContext.syncProvider.uploadFile.mockResolvedValue(true);
    mockContext.syncProvider.downloadFile.mockClear();
    mockContext.syncProvider.fileExists.mockClear();
    mockContext.syncProvider.fileExists.mockImplementation(async name => !name.includes(".next-"));
    mockContext.syncProvider.createFileIfAbsent.mockClear();
    mockContext.syncProvider.createFileIfAbsent.mockResolvedValue(true);
    mockContext.useSettingStoreMock.getState.mockClear();
    mockContext.useSettingStoreMock.setState.mockClear();
    mockContext.useGlobalStateStoreMock.setState.mockClear();
    mockContext.reconnectDatabaseFast.mockClear();
    mockContext.connectDatabaseByName.mockClear();
    mockContext.readBinaryFile.mockClear();
    mockContext.writeBinaryFile.mockClear();
    mockContext.createDir.mockClear();
    mockContext.pathExists.mockClear();
    mockContext.getSep.mockClear();
    mockContext.closeDatabase.mockClear();
    mockContext.removeFile.mockClear();
    mockContext.invoke.mockClear();
    mockContext.message.error.mockClear();
    mockContext.message.warning.mockClear();
    mockContext.piSessionPack.mockClear();
    mockContext.piSessionPack.mockResolvedValue({ ok: true, archive: new Uint8Array([7, 7]) });
    mockContext.piSessionUnpack.mockClear();
    mockContext.piSessionUnpack.mockResolvedValue({ ok: true });
  });

  it("上传完成后使用 sync_upload_reconnect 重连", async () => {
    const success = await upload();

    expect(success).toBe(true);
    expect(mockContext.syncProvider.createFileIfAbsent).toHaveBeenCalledWith(
      "database_data.db.json.next-1",
      expect.anything()
    );
    expect(mockContext.syncProvider.uploadFile).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/^data\.db\.snapshot-.*\.db$/),
      new Uint8Array([9, 9, 9])
    );
    // 对话内容在 pi 会话文件里：.db 之后传会话包，最后才发布版本
    expect(mockContext.syncProvider.uploadFile).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/^data\.db\.snapshot-.*\.sessions\.zip$/),
      new Uint8Array([7, 7])
    );
    const published = mockContext.syncProvider.uploadFile.mock.calls[2];
    expect(published[0]).toBe("database_data.db.json");
    expect(JSON.parse(new TextDecoder().decode(published[1]))).toMatchObject({
      version: 2,
      databaseObject: mockContext.syncProvider.uploadFile.mock.calls[0][0],
      sessionsObject: mockContext.syncProvider.uploadFile.mock.calls[1][0],
    });
    expect(mockContext.settingState.setting.database.databases[0].version).toBe(2);
    expect(mockContext.reconnectDatabaseFast).toHaveBeenCalledWith(
      "data.db",
      "sync_upload_reconnect"
    );
  });

  it("数据库文件上传失败时不发布版本信息且不更新本地版本", async () => {
    mockContext.syncProvider.uploadFile.mockResolvedValueOnce(false);

    const success = await upload();

    expect(success).toBe(false);
    expect(mockContext.syncProvider.uploadFile).toHaveBeenCalledTimes(1);
    expect(mockContext.syncProvider.uploadFile).toHaveBeenCalledWith(
      expect.stringMatching(/^data\.db\.snapshot-.*\.db$/),
      new Uint8Array([9, 9, 9])
    );
    expect(mockContext.useSettingStoreMock.setState).not.toHaveBeenCalled();
    expect(mockContext.settingState.setting.database.databases[0].version).toBe(1);
  });

  it("指针上传失败时已提交的后继记录仍算成功", async () => {
    mockContext.syncProvider.uploadFile
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const success = await upload();

    expect(success).toBe(true);
    expect(mockContext.syncProvider.uploadFile).toHaveBeenCalledTimes(3);
    expect(mockContext.settingState.setting.database.databases[0].version).toBe(2);
  });

  it("会话包上传失败时不发布版本信息，本地版本不前进", async () => {
    mockContext.syncProvider.uploadFile.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const success = await upload();

    expect(success).toBe(false);
    expect(mockContext.syncProvider.uploadFile).toHaveBeenCalledTimes(2);
    expect(mockContext.syncProvider.uploadFile).not.toHaveBeenCalledWith(
      "database_data.db.json",
      expect.anything()
    );
    expect(mockContext.settingState.setting.database.databases[0].version).toBe(1);
  });

  it("打包会话失败时既不传会话包也不发布版本", async () => {
    mockContext.piSessionPack.mockResolvedValue({ ok: false, error: "磁盘错误" });

    const success = await upload();

    expect(success).toBe(false);
    expect(mockContext.syncProvider.uploadFile).toHaveBeenCalledTimes(1);
    expect(mockContext.settingState.setting.database.databases[0].version).toBe(1);
  });

  it("下载时解包远程会话包", async () => {
    mockContext.syncProvider.downloadFile.mockImplementation(async (objectName: string) => {
      if (objectName === "database_data.db.json") {
        return new TextEncoder().encode(JSON.stringify({ version: 2 }));
      }
      return new Uint8Array([1, 2, 3]);
    });

    expect(await download()).toBe(true);
    expect(mockContext.piSessionUnpack).toHaveBeenCalledWith("data.db", new Uint8Array([1, 2, 3]));
  });

  it("快照安装失败不推进版本并恢复原数据库", async () => {
    mockContext.piSessionUnpack.mockResolvedValue({ ok: false, error: "会话包损坏" });
    expect(await download()).toBe(false);
    expect(mockContext.settingState.setting.database.databases[0].version).toBe(1);
    expect(mockContext.writeBinaryFile).toHaveBeenCalledWith(
      "/tmp/data.db",
      new Uint8Array([9, 9, 9])
    );
  });

  it("远程没有会话包（迁移前的远程）时不动本地会话目录", async () => {
    mockContext.syncProvider.downloadFile.mockImplementation(async (objectName: string) => {
      if (objectName === "database_data.db.json") {
        return new TextEncoder().encode(JSON.stringify({ version: 2 }));
      }
      return new Uint8Array([1, 2, 3]);
    });
    mockContext.syncProvider.fileExists.mockImplementation(
      async (objectName: string) =>
        objectName !== "data.db.sessions.zip" && !objectName.includes(".next-")
    );

    expect(await download()).toBe(true);
    expect(mockContext.piSessionUnpack).toHaveBeenCalledWith("data.db", undefined);
  });

  it("下载完成后使用维护模式重连以执行 schema 迁移", async () => {
    mockContext.syncProvider.downloadFile.mockImplementation(async (objectName: string) => {
      if (objectName === "database_data.db.json") {
        return new TextEncoder().encode(JSON.stringify({ version: 2 }));
      }
      return new Uint8Array([1, 2, 3]);
    });

    const success = await download();

    expect(success).toBe(true);
    expect(mockContext.reconnectDatabaseFast).not.toHaveBeenCalled();
    expect(mockContext.connectDatabaseByName).toHaveBeenCalledWith("data.db", {
      force: true,
      mode: "maintenance",
      source: "sync_download_reconnect",
    });
  });

  it("自动下载即将 reload 也必须先在锁内完成维护重连", async () => {
    mockContext.syncProvider.downloadFile.mockImplementation(async (objectName: string) => {
      if (objectName === "database_data.db.json") {
        return new TextEncoder().encode(JSON.stringify({ version: 2 }));
      }
      return new Uint8Array([1, 2, 3]);
    });

    const success = await download({ onProgress: vi.fn() });

    expect(success).toBe(true);
    expect(mockContext.reconnectDatabaseFast).not.toHaveBeenCalled();
    expect(mockContext.connectDatabaseByName).toHaveBeenCalledWith("data.db", {
      force: true,
      mode: "maintenance",
      source: "sync_download_reconnect",
    });
    expect(mockContext.useGlobalStateStoreMock.setState).toHaveBeenCalled();
  });
});
